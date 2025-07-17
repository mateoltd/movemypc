import React, { useState } from 'react';
import FileManager from './FileManager';

interface FileItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  children?: FileItem[];
  parent?: string;
}

interface SelectedItems {
  files: string[];
  apps: string[];
  configurations: string[];
}

interface FileSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: {
    files: FileItem[];
    apps: FileItem[];
    configurations: FileItem[];
  };
  selectedItems: SelectedItems;
  onSelectionChange: (
    type: keyof SelectedItems,
    id: string,
    checked: boolean,
  ) => void;
  onTransfer: () => void;
  isTransferring: boolean;
}

function FileSelectionModal({
  isOpen,
  onClose,
  analysis,
  selectedItems,
  onSelectionChange,
  onTransfer,
  isTransferring,
}: FileSelectionModalProps) {
  const [activeTab, setActiveTab] = useState<
    'files' | 'apps' | 'configurations'
  >('files');

  if (!isOpen) return null;

  const handleSelectAll = (type: keyof SelectedItems, checked: boolean) => {
    const items = analysis[type];
    items.forEach((item) => {
      onSelectionChange(type, item.id, checked);
    });
  };

  const getTotalSelectedCount = () => {
    return (
      selectedItems.files.length +
      selectedItems.apps.length +
      selectedItems.configurations.length
    );
  };

  const getTotalItemsCount = () => {
    return (
      analysis.files.length +
      analysis.apps.length +
      analysis.configurations.length
    );
  };

  const tabs = [
    { id: 'files', label: 'Files', count: analysis.files.length, icon: '📁' },
    {
      id: 'apps',
      label: 'Applications',
      count: analysis.apps.length,
      icon: '⚙️',
    },
    {
      id: 'configurations',
      label: 'Configurations',
      count: analysis.configurations.length,
      icon: '🔧',
    },
  ] as const;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <h2>Select Items to Transfer</h2>
            <p className="modal-subtitle">
              {getTotalSelectedCount()} of {getTotalItemsCount()} items selected
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              <span className="tab-count">({tab.count})</span>
              {selectedItems[tab.id].length > 0 && (
                <span className="tab-selected">
                  {selectedItems[tab.id].length} selected
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="modal-content">
          <div className="file-manager-container">
            <FileManager
              title={tabs.find((t) => t.id === activeTab)?.label || 'Files'}
              items={analysis[activeTab]}
              selectedItems={selectedItems[activeTab]}
              onSelectionChange={(id, checked) =>
                onSelectionChange(activeTab, id, checked)
              }
              onSelectAll={(checked) => handleSelectAll(activeTab, checked)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-footer-info">
            <span className="selection-summary">
              {getTotalSelectedCount()} items selected for transfer
            </span>
          </div>
          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onTransfer}
              disabled={getTotalSelectedCount() === 0 || isTransferring}
            >
              {isTransferring
                ? 'Transferring...'
                : `Transfer ${getTotalSelectedCount()} Items`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileSelectionModal;
