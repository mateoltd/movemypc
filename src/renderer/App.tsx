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
  const [ipAddress, setIpAddress] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({
    files: [],
    apps: [],
    configurations: [],
  });

  useEffect(() => {
    window.electronAPI.onConnectionStatus((status: string) => {
      setConnectionStatus(status);
    });

    window.electronAPI.onFileCopyError((error: any) => {
      alert(`Error copying file: ${error.fileName}\n${error.error}`);
    });

    window.electronAPI.onNetworkError((error: string) => {
      alert(`Network error:\n${error}`);
    });
  }, []);

  const handleAnalyze = async () => {
    const result = await window.electronAPI.analyzeSystem();
    setAnalysis(result);
  };

  const handleConnect = () => {
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
    <div>
      <h1>MoveMyPC</h1>
      <div className="pc-selection">
        <div className="source-pc">
          <h2>Source PC</h2>
          <p>Status: <span>Connected</span></p>
          <button type="button" onClick={handleAnalyze}>Analyze System</button>
        </div>
        <div className="destination-pc">
          <h2>Destination PC</h2>
          <p>Status: <span>{connectionStatus}</span></p>
          <input
            type="text"
            placeholder="Enter IP Address"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
          />
          <button type="button" onClick={handleConnect}>Connect</button>
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
