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

const DeviceCard: React.FC<DeviceCardProps> = ({
  peer,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      className={`device-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(peer)}
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
};

export default DeviceCard;
