import { useEffect, useState } from 'react';
import './App.css';
import FileSelector from './components/FileSelector';
import AppSelector from './components/AppSelector';
import ConfigSelector from './components/ConfigSelector';

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

// Computer Icon SVG Component
const ComputerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
    <path d="M14 19.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5Z"/>
    <path d="M14 2.5V4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5Z"/>
  </svg>
);

const DiscoveryInstructions = () => (
  <div className="discovery-instructions">
    <div className="discovery-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    </div>
    <h4 className="discovery-instructions-title">Ready to Connect?</h4>
    <p className="discovery-instructions-text">Ensure the other PC is ready for discovery:</p>
    <ul className="discovery-instructions-list">
      <li>The MoveMyPC app is running.</li>
      <li>Both PCs are on the same Wi-Fi or Ethernet network.</li>
    </ul>
  </div>
);

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
        <div className="connection-layout">
          {/* Source PC Card */}
          <div className={`pc-card ${connectionStatus === 'connected' ? 'connected' : ''}`}>
            <div className="pc-card-content">
              <div className="computer-icon">
                <ComputerIcon />
              </div>
              <h2 className="pc-card-title">{localDeviceInfo?.hostname ?? 'Source PC'}</h2>
              <p className="pc-card-subtitle">{localDeviceInfo?.ipAddress ?? '127.0.0.1'}</p>
              <span className={`pc-card-status ${connectionStatus}`}>
                {getStatusText()}
              </span>
            </div>
          </div>

          {/* Connection Line */}
          <div className="connection-line">
            <svg viewBox="0 0 300 2">
              <line 
                x1="0" 
                y1="1" 
                x2="300" 
                y2="1" 
                className={`connection-line-path ${isTransferring ? 'active' : ''}`}
              />
            </svg>
          </div>

          {/* Destination PC Card */}
          <div className={`pc-card ${connectionStatus === 'connected' ? 'connected' : ''}`}>
            <div className="pc-card-content">
              <div className="computer-icon">
                <ComputerIcon />
              </div>
              <h2 className="pc-card-title">{getDestinationText()}</h2>
              <p className="pc-card-subtitle">
                {connectedPeer ? connectedPeer.host : '...'}
              </p>
              <span className={`pc-card-status ${connectionStatus}`}>
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Discovered PCs Panel */}
        <div className="discovered-panel">
          <h3 className="discovered-panel-title">Discovered PCs</h3>
          {peers.length === 0 ? (
            timeoutExpired ? (
              <>
                <div className="discovery-animation">
                  <p className="discovery-text">No devices found.</p>
                  <button className="btn btn-secondary" onClick={handleRetryDiscovery} style={{ marginTop: '16px' }}>
                    Retry
                  </button>
                </div>
                <DiscoveryInstructions />
              </>
            ) : (
              <div className="discovery-animation">
                <div className="scanner"></div>
                <p className="discovery-text">Searching for devices...</p>
                <DiscoveryInstructions />
              </div>
            )
          ) : (
            <ul className="peer-list">
              {peers.map(peer => (
                <li key={`${peer.name}-${peer.host}`} className="peer-item">
                  <div className="peer-info">
                    <div className="peer-name">{peer.name}</div>
                    <div className="peer-address">{peer.host}</div>
                  </div>
                  <button 
                    className="connect-btn" 
                    onClick={() => handleConnect(peer)}
                    disabled={connectionStatus === 'connected'}
                  >
                    {connectedPeer?.host === peer.host && connectionStatus === 'connected' 
                      ? 'Connected' 
                      : 'Connect'
                    }
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Analyze Button */}
        <button className="btn btn-secondary analyze-btn" onClick={handleAnalyze}>
          Analyze System
        </button>

        {/* Transfer Controls */}
        <div className="transfer-controls">
          <button 
            className="btn transfer-btn" 
            onClick={handleTransfer}
            disabled={connectionStatus !== 'connected' || !analysis || isTransferring}
          >
            {isTransferring ? 'Transferring...' : 'Initiate Transfer'}
          </button>
          <p className="transfer-status">
            {connectionStatus === 'connected' 
              ? (analysis ? 'Ready to transfer' : 'Run system analysis first')
              : 'Waiting for connection...'
            }
          </p>
        </div>
      </main>

      {/* File Selectors - Hidden for now, can be shown in a modal */}
      {analysis && (
        <div style={{ display: 'none' }}>
          <FileSelector 
            files={analysis.files} 
            onSelectionChange={(id, checked) => handleSelectionChange('files', id, checked)} 
          />
          <AppSelector 
            apps={analysis.apps} 
            onSelectionChange={(id, checked) => handleSelectionChange('apps', id, checked)} 
          />
          <ConfigSelector 
            configs={analysis.configurations} 
            onSelectionChange={(id, checked) => handleSelectionChange('configurations', id, checked)} 
          />
        </div>
      )}
    </div>
  );
}
