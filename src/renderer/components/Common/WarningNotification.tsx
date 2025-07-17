import React from 'react';

interface AnalysisWarning {
  type: 'large_directory' | 'slow_directory' | 'permission_denied';
  path: string;
  details: string;
  fileCount?: number;
  canExclude: boolean;
}

interface WarningNotificationProps {
  warning: AnalysisWarning;
  onExclude: (path: string) => void;
  onDismiss: () => void;
}

const WarningNotification: React.FC<WarningNotificationProps> = ({
  warning,
  onExclude,
  onDismiss,
}) => {
  const getWarningIcon = () => {
    switch (warning.type) {
      case 'large_directory':
        return '⚠️';
      case 'slow_directory':
        return '🐌';
      case 'permission_denied':
        return '🔒';
      default:
        return '⚠️';
    }
  };

  const getWarningTitle = () => {
    switch (warning.type) {
      case 'large_directory':
        return 'Large Directory Detected';
      case 'slow_directory':
        return 'Slow Directory Analysis';
      case 'permission_denied':
        return 'Permission Denied';
      default:
        return 'Analysis Warning';
    }
  };

  const formatPath = (path: string) => {
    if (path.length > 60) {
      return `...${path.substring(path.length - 57)}`;
    }
    return path;
  };

  return (
    <div className="warning-notification">
      <div className="warning-content">
        <div className="warning-header">
          <span className="warning-icon">{getWarningIcon()}</span>
          <div className="warning-text">
            <h4 className="warning-title">{getWarningTitle()}</h4>
            <p className="warning-details">{warning.details}</p>
            <p className="warning-path" title={warning.path}>
              {formatPath(warning.path)}
            </p>
          </div>
        </div>
        
        <div className="warning-actions">
          {warning.canExclude && (
            <button
              className="btn btn-warning"
              onClick={() => onExclude(warning.path)}
            >
              Exclude from Analysis
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={onDismiss}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default WarningNotification; 