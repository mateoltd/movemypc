import React, { useState } from 'react';
import DevicePanel from './DevicePanel';
import DeviceDiscovery from './DeviceDiscovery';
import FileSelectionModal from '../FileManagement/FileSelectionModal';

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface LocalDeviceInfo {
  hostname: string;
  ipAddress: string;
}

interface SelectedItems {
  files: string[];
  apps: string[];
  configurations: string[];
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

interface InterfaceProps {
  localDeviceInfo: LocalDeviceInfo | null;
  connectionStatus: string;
  connectedPeer: Peer | null;
  peers: Peer[];
  timeoutExpired: boolean;
  onAnalyze: () => void;
  onConnect: (peer: Peer) => void;
  onTransfer: () => void;
  onRetryDiscovery: () => void;
  analysis: any;
  isTransferring: boolean;
  analysisProgress: AnalysisProgress | null;
  isAnalyzing: boolean;
  selectedItems: SelectedItems;
  onSelectionChange: (type: keyof SelectedItems, id: string, checked: boolean) => void;
  onCloseFileSelection: () => void;
  showFileSelection: boolean;
}

const Interface: React.FC<InterfaceProps> = ({
  localDeviceInfo,
  connectionStatus,
  connectedPeer,
  peers,
  onAnalyze,
  onConnect,
  onTransfer,
  onRetryDiscovery,
  analysis,
  isTransferring,
  analysisProgress,
  isAnalyzing,
  selectedItems,
  onSelectionChange,
  onCloseFileSelection,
  showFileSelection,
}) => {
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);

  const handlePeerSelect = (peer: Peer) => {
    setSelectedPeer(peer);
    onConnect(peer);
  };

  const getDestinationText = () => {
    if (connectedPeer) return connectedPeer.name;
    return 'Select a device';
  };

  const getDestinationSubtitle = () => {
    if (connectedPeer) return connectedPeer.host;
    return 'No device selected';
  };

  const getAnalysisButtonText = () => {
    if (isAnalyzing) {
      if (analysisProgress) {
        return `Analyzing ${analysisProgress.phase}... (${analysisProgress.current}/${analysisProgress.total > 0 ? analysisProgress.total : '?'})`;
      }
      return 'Analyzing System...';
    }
    return analysis ? 'Re-analyze System' : 'Analyze System';
  };

  const sourceActions = (
    <>
      <button 
        className="btn btn-secondary" 
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        {getAnalysisButtonText()}
      </button>
      {analysisProgress && (
        <div className="analysis-progress">
          <div className="progress-text">
            {analysisProgress.warning ? (
              <small className="warning-text">
                ⚠️ {analysisProgress.warning.details}
              </small>
            ) : analysisProgress.currentPath && (
              <small>Scanning: {analysisProgress.currentPath}</small>
            )}
          </div>
        </div>
      )}
      {peers.length === 0 && (
        <button className="btn btn-primary" onClick={onRetryDiscovery}>
          Search for Devices
        </button>
      )}
    </>
  );

  const destinationActions = connectedPeer ? (
    <>
      <button
        className="btn btn-primary"
        onClick={onTransfer}
        disabled={!analysis || isTransferring}
      >
        {isTransferring ? 'Transferring...' : 'Select Files to Transfer'}
      </button>
      <p className="transfer-status">
        {analysis ? 'Ready to transfer' : 'Run system analysis first'}
      </p>
    </>
  ) : null;

  return (
    <>
      <div className="interface-interface">
        <DevicePanel
          title={localDeviceInfo?.hostname ?? 'Source PC'}
          subtitle={localDeviceInfo?.ipAddress ?? '127.0.0.1'}
          status={connectionStatus}
          isConnected={connectionStatus === 'connected'}
          actions={sourceActions}
          type="source"
        />

        <DeviceDiscovery
          peers={peers}
          selectedPeer={selectedPeer}
          onPeerSelect={handlePeerSelect}
        />

        <DevicePanel
          title={getDestinationText()}
          subtitle={getDestinationSubtitle()}
          status={connectionStatus}
          isConnected={!!connectedPeer}
          actions={destinationActions}
          type="destination"
        />
      </div>

      {showFileSelection && analysis && (
        <FileSelectionModal
          isOpen={showFileSelection}
          onClose={onCloseFileSelection}
          analysis={analysis}
          selectedItems={selectedItems}
          onSelectionChange={onSelectionChange}
          onTransfer={() => {
            // Handle the actual transfer logic here
            window.electronAPI.transferFiles(selectedItems);
            onCloseFileSelection();
          }}
          isTransferring={isTransferring}
        />
      )}
    </>
  );
};

export default Interface;
