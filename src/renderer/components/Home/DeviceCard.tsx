import React from 'react';
import ComputerIcon from '../Icons/ComputerIcon';

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface DeviceCardProps {
  peer: Peer;
  isSelected: boolean;
  onSelect: (peer: Peer) => void;
}

function DeviceCard({ peer, isSelected, onSelect }: DeviceCardProps) {
  return (
    <div
      className={`device-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(peer)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(peer);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="device-icon">
        <ComputerIcon />
      </div>
      <div className="device-info">
        <div className="device-name">{peer.name}</div>
        <div className="device-address">{peer.host}</div>
      </div>
    </div>
  );
}

export default DeviceCard;
