import * as net from 'net';
import { BrowserWindow, ipcMain } from 'electron';

let server: net.Server | null = null;
let client: net.Socket | null = null;
const sockets: net.Socket[] = [];

export const startServer = (win: BrowserWindow) => {
  server = net.createServer((socket: net.Socket) => {
    console.log('Client connected');
    sockets.push(socket);
    win.webContents.send('connection-status', 'connected');

    socket.on('data', (data: Buffer) => {
      console.log('Received data:', data.toString());
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'file-transfer-request') {
          ipcMain.emit('file-transfer-request', message.payload);
        }
      } catch (error) {
        console.error('Error parsing received data:', error);
      }
    });

    socket.on('end', () => {
      console.log('Client disconnected');
      sockets.splice(sockets.indexOf(socket), 1);
      win.webContents.send('connection-status', 'disconnected');
    });

    socket.on('error', (err: Error) => {
      console.error('Socket error:', err);
    });
  });

  server.listen(9876, '0.0.0.0', () => {
    console.log('Server listening on port 9876');
  });
};

export const connectToServer = (ipAddress: string, win: BrowserWindow) => {
  client = net.createConnection({ host: ipAddress, port: 9876 }, () => {
    console.log('Connected to server');
    win.webContents.send('connection-status', 'connected');
  });

  client.on('data', (data: Buffer) => {
    console.log('Received data:', data.toString());
  });

  client.on('end', () => {
    console.log('Disconnected from server');
    win.webContents.send('connection-status', 'disconnected');
  });

  client.on('error', (err: Error) => {
    console.error('Connection error:', err);
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
