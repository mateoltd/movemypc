import React from 'react';
import DeviceCard from './DeviceCard';

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface DeviceDiscoveryProps {
  peers: Peer[];
  selectedPeer: Peer | null;
  onPeerSelect: (peer: Peer) => void;
}

export default function DeviceDiscovery({
  peers,
  selectedPeer,
  onPeerSelect,
}: DeviceDiscoveryProps) {
  return (
    <div className="interface-zone">
      <div className="interface-content">
        {peers.length === 0 ? (
          <div className="interface-empty">
            <h3>Discovery</h3>
            <p>Discovered devices will appear here</p>
          </div>
        ) : (
          <div className="device-list">
            <h3>Discovered Devices</h3>
            <div className="device-grid">
              {peers.map((peer) => (
                <DeviceCard
                  key={`${peer.name}-${peer.host}`}
                  peer={peer}
                  isSelected={selectedPeer?.host === peer.host}
                  onSelect={onPeerSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
