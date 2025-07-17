import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import App from '../renderer/App';

// Mock the electronAPI
const mockElectronAPI = {
  analyzeSystem: jest.fn().mockResolvedValue({}),
  connectToServer: jest.fn().mockResolvedValue(undefined),
  onConnectionStatus: jest.fn(),
  onNetworkError: jest.fn(),
  onPeerFound: jest.fn(),
  onPeerLost: jest.fn(),
  onFileCopyError: jest.fn(),
  onAnalysisProgress: jest.fn(),
  onAnalysisComplete: jest.fn(),
  onAnalysisError: jest.fn(),
  transferFiles: jest.fn().mockResolvedValue(undefined),
  flushDiscovery: jest.fn().mockResolvedValue(undefined),
  getLocalDeviceInfo: jest
    .fn()
    .mockResolvedValue({ hostname: 'test-hostname', ipAddress: '192.168.1.1' }),
  addDirectoryExclusion: jest.fn().mockResolvedValue(undefined),
  removeDirectoryExclusion: jest.fn().mockResolvedValue(undefined),
  getExcludedDirectories: jest.fn().mockResolvedValue([]),
};

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('App', () => {
  it('should render', () => {
    expect(render(<App />)).toBeTruthy();
  });
});
