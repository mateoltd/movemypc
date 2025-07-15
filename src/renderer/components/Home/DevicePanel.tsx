import React from 'react';
import ComputerIcon from '../Icons/ComputerIcon';

interface DevicePanelProps {
  title: string;
  subtitle: string;
  status: string;
  isConnected?: boolean;
  actions?: React.ReactNode;
  type: 'source' | 'destination';
}

const DevicePanel: React.FC<DevicePanelProps> = ({
  title,
  subtitle,
  status,
  isConnected = false,
  actions,
  type,
}) => {
  const getStatusText = () => {
    if (status === 'connected') return 'Connected';
    if (status === 'disconnected') return 'Disconnected';
    return 'Waiting for connection...';
  };

  return (
    <div
      className={`interface-panel interface-${type} ${isConnected ? 'connected' : ''}`}
    >
      <div className="interface-panel-content">
        <div className="computer-icon">
          <ComputerIcon />
        </div>
        <h2 className="interface-panel-title">{title}</h2>
        <p className="interface-panel-subtitle">{subtitle}</p>
        <span className={`interface-panel-status ${status}`}>
          {getStatusText()}
        </span>
      </div>
      {actions && <div className="interface-panel-actions">{actions}</div>}
    </div>
  );
};

export default DevicePanel;
