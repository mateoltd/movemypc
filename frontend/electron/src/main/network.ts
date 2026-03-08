import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

let server: net.Server | null = null;
let client: net.Socket | null = null;
const sockets: net.Socket[] = [];
let progressWindow: BrowserWindow | null = null;

const MAX_CHUNK_SIZE = 64 * 1024;

type TransferFile = { path: string; name: string };

type ControlMessage =
  | {
      type: 'transfer-request';
      files: { name: string; relativePath: string; size: number }[];
      totalSize: number;
      totalFiles: number;
    }
  | {
      type: 'file-start';
      name: string;
      relativePath: string;
      size: number;
    }
  | {
      type: 'file-end';
      name: string;
      checksum: string;
    }
  | {
      type: 'transfer-complete';
      filesTransferred: number;
      totalBytes: number;
    };

type ReceiverState = {
  buffer: Buffer;
  expectingFileChunk: boolean;
  currentFileStream: fs.WriteStream | null;
  currentFileHash: crypto.Hash | null;
  downloadRoot: string | null;
};

const createFrame = (payload: Buffer) => {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
};

const sendFrame = (socket: net.Socket, payload: Buffer) => {
  socket.write(createFrame(payload));
};

const sendControlMessage = (socket: net.Socket, message: ControlMessage) => {
  sendFrame(socket, Buffer.from(JSON.stringify(message), 'utf8'));
};

const sanitizeRelativePath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');

const createDownloadRoot = () => {
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, 'Downloads', `MoveMyPC-${timestamp}`);
};

const createReceiverState = (): ReceiverState => ({
  buffer: Buffer.alloc(0),
  expectingFileChunk: false,
  currentFileStream: null,
  currentFileHash: null,
  downloadRoot: null,
});

const getActiveSocket = () => {
  if (client && client.writable) {
    return client;
  }

  return sockets.find((socket) => socket.writable) || null;
};

const isControlFrame = (frame: Buffer) => {
  if (frame.length < 2) return false;
  const firstChar = frame.toString('utf8', 0, 1);
  return firstChar === '{' || firstChar === '[';
};

const handleControlMessage = async (
  state: ReceiverState,
  message: ControlMessage,
  win: BrowserWindow,
) => {
  switch (message.type) {
    case 'transfer-request': {
      state.downloadRoot = createDownloadRoot();
      await fs.ensureDir(state.downloadRoot);
      break;
    }
    case 'file-start': {
      if (!state.downloadRoot) {
        state.downloadRoot = createDownloadRoot();
        await fs.ensureDir(state.downloadRoot);
      }

      const relativePath = sanitizeRelativePath(message.relativePath || message.name);
      const outputPath = path.join(state.downloadRoot, relativePath);
      await fs.ensureDir(path.dirname(outputPath));
      state.currentFileStream = fs.createWriteStream(outputPath);
      state.currentFileHash = crypto.createHash('md5');
      state.expectingFileChunk = true;
      break;
    }
    case 'file-end': {
      await new Promise<void>((resolve, reject) => {
        if (!state.currentFileStream) {
          resolve();
          return;
        }
        state.currentFileStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const digest = state.currentFileHash?.digest('hex') || '';
      if (message.checksum && digest !== message.checksum) {
        throw new Error(`Checksum mismatch for ${message.name}`);
      }

      state.currentFileStream = null;
      state.currentFileHash = null;
      state.expectingFileChunk = false;
      break;
    }
    case 'transfer-complete': {
      win.webContents.send('transfer-complete', {
        filesTransferred: message.filesTransferred,
        totalBytes: message.totalBytes,
        downloadPath: state.downloadRoot,
      });
      break;
    }
    default:
      break;
  }
};

const attachSocketHandlers = (socket: net.Socket, win: BrowserWindow) => {
  const state = createReceiverState();

  socket.on('data', async (data: Buffer) => {
    state.buffer = Buffer.concat([state.buffer, data]);

    try {
      while (state.buffer.length >= 4) {
        const frameLength = state.buffer.readUInt32BE(0);
        if (state.buffer.length < frameLength + 4) {
          break;
        }

        const frame = state.buffer.subarray(4, frameLength + 4);
        state.buffer = state.buffer.subarray(frameLength + 4);

        if (state.expectingFileChunk && !isControlFrame(frame)) {
          state.currentFileStream?.write(frame);
          state.currentFileHash?.update(frame);
          continue;
        }

        const message = JSON.parse(frame.toString('utf8')) as ControlMessage;
        await handleControlMessage(state, message, win);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Transfer receive failed';
      log.error('Error parsing framed transfer data:', error);
      win.webContents.send('transfer-error', message);
    }
  });
};

export const startServer = (win: BrowserWindow) => {
  server = net.createServer((socket: net.Socket) => {
    log.info('Client connected');
    sockets.push(socket);
    progressWindow = win;
    win.webContents.send('connection-status', 'connected');

    attachSocketHandlers(socket, win);

    socket.on('end', () => {
      log.info('Client disconnected');
      sockets.splice(sockets.indexOf(socket), 1);
      win.webContents.send('connection-status', 'disconnected');
    });

    socket.on('error', (err: Error) => {
      log.error('Socket error:', err);
      win.webContents.send('transfer-error', err.message);
    });
  });

  server.listen(9876, '0.0.0.0', () => {
    log.info('Server listening on port 9876');
  });
};

export const connectToServer = (ipAddress: string, win: BrowserWindow) => {
  progressWindow = win;
  client = net.createConnection({ host: ipAddress, port: 9876 }, () => {
    log.info('Connected to server');
    win.webContents.send('connection-status', 'connected');
  });

  attachSocketHandlers(client, win);

  client.on('end', () => {
    log.info('Disconnected from server');
    win.webContents.send('connection-status', 'disconnected');
  });

  client.on('error', (err: Error) => {
    log.error('Connection error:', err);
    win.webContents.send('connection-status', 'error');
    win.webContents.send('network-error', err.message);
    win.webContents.send('transfer-error', err.message);
  });
};

export const sendData = (data: any) => {
  const payload = Buffer.from(JSON.stringify(data), 'utf8');

  if (client && client.writable) {
    sendFrame(client, payload);
  } else {
    sockets.forEach((socket) => {
      if (socket.writable) {
        sendFrame(socket, payload);
      }
    });
  }
};

export const sendFiles = async (files: TransferFile[]): Promise<void> => {
  const socket = getActiveSocket();

  if (!socket) {
    throw new Error('No active peer connection');
  }

  const filesWithStats = await Promise.all(
    files.map(async (file) => {
      const stats = await fs.stat(file.path);
      return {
        ...file,
        size: stats.size,
        relativePath: sanitizeRelativePath(file.name),
      };
    }),
  );

  const totalBytes = filesWithStats.reduce((sum, file) => sum + file.size, 0);
  const totalFiles = filesWithStats.length;
  let transferredBytes = 0;

  sendControlMessage(socket, {
    type: 'transfer-request',
    files: filesWithStats.map((file) => ({
      name: path.basename(file.name),
      relativePath: file.relativePath,
      size: file.size,
    })),
    totalSize: totalBytes,
    totalFiles,
  });

  for (let index = 0; index < filesWithStats.length; index += 1) {
    const file = filesWithStats[index];
    const hash = crypto.createHash('md5');

    sendControlMessage(socket, {
      type: 'file-start',
      name: path.basename(file.name),
      relativePath: file.relativePath,
      size: file.size,
    });

    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(file.path, { highWaterMark: MAX_CHUNK_SIZE });

      stream.on('data', (chunk: Buffer | string) => {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(bufferChunk);
        sendFrame(socket, bufferChunk);
        transferredBytes += bufferChunk.length;

        progressWindow?.webContents.send('transfer-progress', {
          current: index + 1,
          total: totalFiles,
          fileName: file.name,
          bytesTransferred: transferredBytes,
          totalBytes,
        });
      });

      stream.on('error', reject);
      stream.on('end', resolve);
    });

    sendControlMessage(socket, {
      type: 'file-end',
      name: path.basename(file.name),
      checksum: hash.digest('hex'),
    });
  }

  sendControlMessage(socket, {
    type: 'transfer-complete',
    filesTransferred: totalFiles,
    totalBytes,
  });
};
