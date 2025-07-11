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

export default function App() {
  const [analysis, setAnalysis] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({
    files: [],
    apps: [],
    configurations: [],
  });
  const [peers, setPeers] = useState<any[]>([]);
  const [timeoutExpired,setTimeoutExpired]=useState(false);

  useEffect(() => {
    const timer=setTimeout(()=>setTimeoutExpired(true),10000);
    window.electronAPI.onConnectionStatus((status: string) => {
      setConnectionStatus(status);
    });

    window.electronAPI.onFileCopyError((error: any) => {
      alert(`Error copying file: ${error.fileName}\n${error.error}`);
    });

    window.electronAPI.onNetworkError((error: string) => {
      alert(`Network error:\n${error}`);
    });

    window.electronAPI.onPeerFound((peer: any) => {
      setPeers(prev => [...prev, peer]);
    });

    window.electronAPI.onPeerLost((peer: any) => {
      setPeers(prev => prev.filter(p => p.name !== peer.name));
    });
    return ()=>clearTimeout(timer);
  }, []);

  const handleAnalyze = async () => {
    const result = await window.electronAPI.analyzeSystem();
    setAnalysis(result);
  };

  const handleConnect = (ipAddress: string) => {
    window.electronAPI.connectToServer(ipAddress);
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
    window.electronAPI.transferFiles(selectedItems);
  };

  return (
    <div className="App">
      <h1>MoveMyPC</h1>
      <div className="pc-selection">
        <div className="source-pc">
          <h2>Source PC</h2>
          <p>Status: <span className={`status-${connectionStatus}`}>{connectionStatus}</span></p>
          <button type="button" onClick={handleAnalyze}>Analyze System</button>
        </div>
        <div className="destination-pc">
          <h2>Discovered PCs</h2>
          {peers.length === 0 ? (
            timeoutExpired ? (
              <div className="discovery-animation">
                <p>No devices found.</p>
                <button onClick={()=>{setTimeoutExpired(false);window.electronAPI.flushDiscovery();}}>
                  Retry
                </button>
              </div>
            ) : (
              <div className="discovery-animation">
                <div className="scanner"></div>
                <p>Searching for devices...</p>
              </div>
            )
          ) : (
            <ul className="peer-list">
              {peers.map(peer => (
                <li key={peer.name}>
                  <span className="peer-name">{peer.name} ({peer.host})</span>
                  <button className="connect-btn" type="button" onClick={() => handleConnect(peer.host)}>Connect</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {analysis && (
        <div className="selectors">
          <FileSelector files={analysis.files} onSelectionChange={(id, checked) => handleSelectionChange('files', id, checked)} />
          <AppSelector apps={analysis.apps} onSelectionChange={(id, checked) => handleSelectionChange('apps', id, checked)} />
          <ConfigSelector configs={analysis.configurations} onSelectionChange={(id, checked) => handleSelectionChange('configurations', id, checked)} />
        </div>
      )}

      <div className="transfer-controls">
        <button type="button" onClick={handleTransfer}>Transfer Files</button>
        <p className="transfer-status">Ready to transfer</p>
      </div>
    </div>
  );
}
