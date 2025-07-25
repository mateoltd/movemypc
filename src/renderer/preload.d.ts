import { ElectronHandler } from '../main/preload';

export interface ElectronAPI {
  analyzeSystem: () => Promise<any>;
  connectToServer: (ipAddress: string) => Promise<void>;
  onConnectionStatus: (callback: (status: string) => void) => void;
  onNetworkError: (callback: (error: string) => void) => void;
  onPeerFound: (callback: (peer: any) => void) => void;
  onPeerLost: (callback: (peer: any) => void) => void;
  onFileCopyError: (callback: (error: any) => void) => void;
  onAnalysisProgress: (callback: (progress: any) => void) => void;
  onAnalysisComplete: (callback: (analysis: any) => void) => void;
  onAnalysisError: (callback: (error: string) => void) => void;
  transferFiles: (selectedItems: any) => Promise<void>;
  flushDiscovery: () => Promise<void>;
  getLocalDeviceInfo: () => Promise<{ hostname: string; ipAddress: string }>;
  addDirectoryExclusion: (path: string) => Promise<void>;
  removeDirectoryExclusion: (path: string) => Promise<void>;
  getExcludedDirectories: () => Promise<string[]>;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    electronAPI: ElectronAPI;
  }
}

export {};
