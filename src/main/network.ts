import * as net from 'net';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';

let server: net.Server | null = null;
let client: net.Socket | null = null;
const sockets: net.Socket[] = [];

export const startServer = (win: BrowserWindow) => {
  server = net.createServer((socket: net.Socket) => {
    log.info('Client connected');
    sockets.push(socket);
    win.webContents.send('connection-status', 'connected');

    socket.on('data', (data: Buffer) => {
      log.info('Received data:', data.toString());
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'file-transfer-request') {
          ipcMain.emit('file-transfer-request', message.payload);
        }
      } catch (error) {
        log.error('Error parsing received data:', error);
      }
    });

    socket.on('end', () => {
      log.info('Client disconnected');
      sockets.splice(sockets.indexOf(socket), 1);
      win.webContents.send('connection-status', 'disconnected');
    });

    socket.on('error', (err: Error) => {
      log.error('Socket error:', err);
    });
  });

  server.listen(9876, '0.0.0.0', () => {
    log.info('Server listening on port 9876');
  });
};

export const connectToServer = (ipAddress: string, win: BrowserWindow) => {
  client = net.createConnection({ host: ipAddress, port: 9876 }, () => {
    log.info('Connected to server');
    win.webContents.send('connection-status', 'connected');
  });

  client.on('data', (data: Buffer) => {
    log.info('Received data:', data.toString());
  });

  client.on('end', () => {
    log.info('Disconnected from server');
    win.webContents.send('connection-status', 'disconnected');
  });

  client.on('error', (err: Error) => {
    log.error('Connection error:', err);
    win.webContents.send('connection-status', 'error');
    win.webContents.send('network-error', err.message);
  });
};

export const sendData = (data: any) => {
  const jsonData = JSON.stringify(data);

  if (client && client.writable) {
    client.write(jsonData);
  } else {
    sockets.forEach((socket) => {
      socket.write(jsonData);
    });
  }
};
