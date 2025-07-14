// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('electronAPI', {
  getLocalDeviceInfo: () => ipcRenderer.invoke('get-local-device-info'),
  analyzeSystem: () => ipcRenderer.invoke('analyze-system'),
  connectToServer: (ipAddress: string) => ipcRenderer.invoke('connect-to-server', ipAddress),
  onConnectionStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('connection-status', (event, status) => callback(status));
  },
  onNetworkError: (callback: (error: string) => void) => {
    ipcRenderer.on('network-error', (event, error) => callback(error));
  },
  onPeerFound: (callback: (peer: any) => void) => {
    ipcRenderer.on('peer-found', (event, peer) => callback(peer));
  },
  onPeerLost: (callback: (peer: any) => void) => {
    ipcRenderer.on('peer-lost', (event, peer) => callback(peer));
  },
  onFileCopyError: (callback: (error: any) => void) => {
    ipcRenderer.on('file-copy-error', (event, error) => callback(error));
  },
  transferFiles: (selectedItems: any) => ipcRenderer.invoke('transfer-files', selectedItems),
  flushDiscovery: () => ipcRenderer.invoke('flush-discovery'),
});

export type ElectronHandler = typeof electronHandler;
