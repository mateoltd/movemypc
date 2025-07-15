import React, { useState } from 'react';
import DevicePanel from './DevicePanel';
import DeviceDiscovery from './DeviceDiscovery';

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface LocalDeviceInfo {
  hostname: string;
  ipAddress: string;
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
  isTransferring
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

  const sourceActions = (
    <>
      <button className="btn btn-secondary" onClick={onAnalyze}>
        Analyze System
      </button>
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
        {isTransferring ? 'Transferring...' : 'Initiate Transfer'}
      </button>
      <p className="transfer-status">
        {analysis ? 'Ready to transfer' : 'Run system analysis first'}
      </p>
    </>
  ) : null;

  return (
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
  );
};

export default Interface; 