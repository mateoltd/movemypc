import { useEffect, useState } from 'react';
import './App.css';
import ItemSelector from './components/ItemSelector';
import Interface from './components/Interface';

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



export default function App() {
  const [analysis, setAnalysis] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({
    files: [],
    apps: [],
    configurations: [],
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [timeoutExpired, setTimeoutExpired] = useState(false);
  const [connectedPeer, setConnectedPeer] = useState<Peer | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [localDeviceInfo, setLocalDeviceInfo] = useState<LocalDeviceInfo | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTimeoutExpired(true), 10000);
    
    window.electronAPI.getLocalDeviceInfo().then(info => {
      setLocalDeviceInfo(info);
    });

    window.electronAPI.onConnectionStatus((status: string) => {
      setConnectionStatus(status);
      if (status === 'connected') {
        setIsTransferring(false);
      }
    });

    window.electronAPI.onFileCopyError((error: any) => {
      alert(`Error copying file: ${error.fileName}\n${error.error}`);
      setIsTransferring(false);
    });

    window.electronAPI.onNetworkError((error: string) => {
      alert(`Network error:\n${error}`);
      setIsTransferring(false);
    });

    window.electronAPI.onPeerFound((peer: Peer) => {
      setPeers(prev => {
        const exists = prev.find(p => p.name === peer.name && p.host === peer.host);
        if (!exists) {
          return [...prev, peer];
        }
        return prev;
      });
    });

    window.electronAPI.onPeerLost((peer: Peer) => {
      setPeers(prev => prev.filter(p => p.name !== peer.name || p.host !== peer.host));
    });

    return () => clearTimeout(timer);
  }, []);

  const handleAnalyze = async () => {
    const result = await window.electronAPI.analyzeSystem();
    setAnalysis(result);
  };

  const handleConnect = (peer: Peer) => {
    setConnectedPeer(peer);
    window.electronAPI.connectToServer(peer.host);
  };

  const handleSelectionChange = (type: keyof SelectedItems, id: string, checked: boolean) => {
    setSelectedItems(prev => {
      const newSelection = new Set(prev[type]);
      if (checked) {
        newSelection.add(id);
      } else {
        newSelection.delete(id);
      }
      return { ...prev, [type]: Array.from(newSelection) };
    });
  };

  const handleTransfer = () => {
    if (connectionStatus === 'connected' && analysis) {
      setIsTransferring(true);
      window.electronAPI.transferFiles(selectedItems);
    }
  };

  const handleRetryDiscovery = () => {
    setTimeoutExpired(false);
    setPeers([]);
    window.electronAPI.flushDiscovery();
  };

  const getStatusText = () => {
    if (connectionStatus === 'connected') return 'Connected';
    if (connectionStatus === 'disconnected') return 'Disconnected';
    return 'Waiting for connection...';
  };

  const getDestinationText = () => {
    if (connectedPeer) return connectedPeer.name;
    return 'PC to transfer';
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
            timeoutExpired={timeoutExpired}
            onAnalyze={handleAnalyze}
            onConnect={handleConnect}
            onTransfer={handleTransfer}
            onRetryDiscovery={handleRetryDiscovery}
            analysis={analysis}
            isTransferring={isTransferring}
          />
        </div>
      </main>

      {/* File Selectors - Hidden for now, can be shown in a modal */}
      {analysis && (
        <div style={{ display: 'none' }}>
          <ItemSelector 
            title="Files"
            items={analysis.files} 
            onSelectionChange={(id: string, checked: boolean) => handleSelectionChange('files', id, checked)} 
          />
          <ItemSelector 
            title="Applications"
            items={analysis.apps} 
            onSelectionChange={(id: string, checked: boolean) => handleSelectionChange('apps', id, checked)} 
          />
          <ItemSelector 
            title="Configurations"
            items={analysis.configurations} 
            onSelectionChange={(id: string, checked: boolean) => handleSelectionChange('configurations', id, checked)} 
          />
        </div>
      )}
    </div>
  );
}
