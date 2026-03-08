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
  connectToServer: (ipAddress: string) =>
    ipcRenderer.invoke('connect-to-server', ipAddress),
  connectToPeer: (peer: { host: string; port: number }) =>
    ipcRenderer.invoke('connect-to-peer', peer),
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
  onAnalysisProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('analysis-progress', (event, progress) =>
      callback(progress),
    );
  },
  onAnalysisComplete: (callback: (analysis: any) => void) => {
    ipcRenderer.on('analysis-complete', (event, analysis) =>
      callback(analysis),
    );
  },
  onAnalysisError: (callback: (error: string) => void) => {
    ipcRenderer.on('analysis-error', (event, error) => callback(error));
  },
  transferFiles: (payload: {
    files: { id: string; name: string; path: string }[];
  }) => ipcRenderer.invoke('transfer-files', payload),
  onTransferProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('transfer-progress', (e, data) => callback(data));
  },
  onTransferComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('transfer-complete', (e, data) => callback(data));
  },
  onTransferError: (callback: (err: any) => void) => {
    ipcRenderer.on('transfer-error', (e, err) => callback(err));
  },
  flushDiscovery: () => ipcRenderer.invoke('flush-discovery'),
  addDirectoryExclusion: (path: string) =>
    ipcRenderer.invoke('add-directory-exclusion', path),
  removeDirectoryExclusion: (path: string) =>
    ipcRenderer.invoke('remove-directory-exclusion', path),
  getExcludedDirectories: () => ipcRenderer.invoke('get-excluded-directories'),
});

export type ElectronHandler = typeof electronHandler;
