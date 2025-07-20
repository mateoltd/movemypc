import { useEffect, useState } from 'react';
import log from 'electron-log';
import Interface from './components/Home/Interface';
import WarningNotification from './components/Common/WarningNotification';
import './App.css';

interface SelectedItems {
  files: string[];
  apps: string[];
  configurations: string[];
}

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface LocalDeviceInfo {
  hostname: string;
  ipAddress: string;
}

interface AnalysisWarning {
  type: 'large_directory' | 'slow_directory' | 'permission_denied';
  path: string;
  details: string;
  fileCount?: number;
  canExclude: boolean;
}

interface AnalysisProgress {
  phase: 'files' | 'apps' | 'configurations';
  current: number;
  total: number;
  currentPath?: string;
  warning?: AnalysisWarning;
}

export default function App() {
  const [analysis, setAnalysis] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({
    files: [],
    apps: [],
    configurations: [],
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connectedPeer, setConnectedPeer] = useState<Peer | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [localDeviceInfo, setLocalDeviceInfo] =
    useState<LocalDeviceInfo | null>(null);
  const [showFileSelection, setShowFileSelection] = useState(false);
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgress | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentWarning, setCurrentWarning] = useState<AnalysisWarning | null>(
    null,
  );

  useEffect(() => {
    window.electronAPI
      .getLocalDeviceInfo()
      .then((info) => {
        setLocalDeviceInfo(info);
        return info;
      })
      .catch((error) => {
        log.error('Failed to get local device info:', error);
      });

    window.electronAPI.onConnectionStatus((status: string) => {
      setConnectionStatus(status);
      if (status === 'connected') {
        setIsTransferring(false);
      }
    });

    window.electronAPI.onFileCopyError((error: any) => {
      log.error(`Error copying file: ${error.fileName}`, error.error);
      setIsTransferring(false);
    });

    window.electronAPI.onNetworkError((error: string) => {
      log.error('Network error:', error);
      setIsTransferring(false);
    });

    window.electronAPI.onPeerFound((peer: Peer) => {
      setPeers((prev) => {
        const exists = prev.find(
          (p) => p.name === peer.name && p.host === peer.host,
        );
        if (!exists) {
          return [...prev, peer];
        }
        return prev;
      });
    });

    window.electronAPI.onPeerLost((peer: Peer) => {
      setPeers((prev) =>
        prev.filter((p) => p.name !== peer.name || p.host !== peer.host),
      );
    });

    // Analysis event handlers
    window.electronAPI.onAnalysisProgress((progress: AnalysisProgress) => {
      setAnalysisProgress(progress);
      if (progress.warning) {
        setCurrentWarning(progress.warning);
      }
    });

    window.electronAPI.onAnalysisComplete((analysisResult: any) => {
      setAnalysis(analysisResult);
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    });

    window.electronAPI.onAnalysisError((error: string) => {
      log.error('Analysis error:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    });

    return () => {};
  }, []); // Empty dependency array - run only once on mount

  // Separate useEffect for handling connectedPeer-dependent logic
  useEffect(() => {
    // Automatically open File Manager if we have both analysis and a connected peer
    if (connectedPeer && analysis) {
      setShowFileSelection(true);
    }
  }, [connectedPeer, analysis]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(null);
    try {
      await window.electronAPI.analyzeSystem();
      // Analysis result will be handled by the onAnalysisComplete event
    } catch (error) {
      log.error('Analysis failed:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const handleConnect = (peer: Peer) => {
    setConnectedPeer(peer);
    window.electronAPI.connectToServer(peer.host);
  };

  const handleSelectionChange = (
    type: keyof SelectedItems,
    id: string,
    checked: boolean,
  ) => {
    setSelectedItems((prev) => {
      const newSelection = new Set(prev[type]);
      if (checked) {
        newSelection.add(id);
      } else {
        newSelection.delete(id);
      }
      return { ...prev, [type]: Array.from(newSelection) };
    });
  };

  const handleCloseFileSelection = () => {
    setShowFileSelection(false);
  };

  const handleRetryDiscovery = () => {
    setPeers([]);
    window.electronAPI.flushDiscovery();
  };

  const handleWarningExclude = async (path: string) => {
    await window.electronAPI.addDirectoryExclusion(path);
    setCurrentWarning(null);
  };

  const handleWarningDismiss = () => {
    setCurrentWarning(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">MoveMyPC</h1>
      </header>

      <main className="main-content">
        <div className="app-container">
          <Interface
            localDeviceInfo={localDeviceInfo}
            connectionStatus={connectionStatus}
            connectedPeer={connectedPeer}
            peers={peers}
            onAnalyze={handleAnalyze}
            onConnect={handleConnect}
            onRetryDiscovery={handleRetryDiscovery}
            analysis={analysis}
            isTransferring={isTransferring}
            analysisProgress={analysisProgress}
            isAnalyzing={isAnalyzing}
            selectedItems={selectedItems}
            onSelectionChange={handleSelectionChange}
            onCloseFileSelection={handleCloseFileSelection}
            showFileSelection={showFileSelection}
          />
        </div>

        {currentWarning && (
          <WarningNotification
            warning={currentWarning}
            onExclude={handleWarningExclude}
            onDismiss={handleWarningDismiss}
          />
        )}
      </main>
    </div>
  );
}
