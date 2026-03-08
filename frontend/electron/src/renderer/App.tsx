import React, { useState, useEffect } from 'react';
import './App.css';

interface FileItem {
  id: string;
  name: string;
  path: string;
  type: string;
  size?: number;
  children?: FileItem[];
  parent?: string;
  modifiedDate?: string;
  extension?: string;
  rootCategory?: string;
  icon?: string;
}

interface AnalysisResult {
  files: FileItem[];
  apps: FileItem[];
  configurations: FileItem[];
}

interface AnalysisProgress {
  phase: string;
  current: number;
  total: number;
  currentPath?: string;
}

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface TransferProgress {
  current: number;
  total: number;
  fileName: string;
  percent: number;
}

type ViewMode = 'welcome' | 'analyzing' | 'results';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [transferState, setTransferState] = useState<
    'idle' | 'transferring' | 'done' | 'error'
  >('idle');
  const [transferProgress, setTransferProgress] =
    useState<TransferProgress | null>(null);

  useEffect(() => {
    window.electronAPI.onAnalysisProgress((progressData: AnalysisProgress) => {
      setProgress(progressData);
    });

    window.electronAPI.onAnalysisComplete((result: AnalysisResult) => {
      setAnalysis(result);
      setIsAnalyzing(false);
      setProgress(null);
      setViewMode('results');
      setError(null);
    });

    window.electronAPI.onAnalysisError((errorMsg: string) => {
      console.error('Analysis error:', errorMsg);
      setIsAnalyzing(false);
      setProgress(null);
      setError(errorMsg);
      setViewMode('welcome');
    });

    window.electronAPI.onPeerFound((peer: Peer) => {
      setPeers((prev) => {
        const exists = prev.some(
          (item) => item.host === peer.host && item.port === peer.port,
        );
        if (exists) return prev;
        return [...prev, peer];
      });
      setSelectedPeer((prev) => prev || peer);
    });

    window.electronAPI.onPeerLost((peer: Peer) => {
      setPeers((prev) =>
        prev.filter(
          (item) => !(item.host === peer.host && item.port === peer.port),
        ),
      );
      setSelectedPeer((prev) => {
        if (prev && prev.host === peer.host && prev.port === peer.port) {
          return null;
        }
        return prev;
      });
    });

    window.electronAPI.onTransferProgress((progressData: {
      current: number;
      total: number;
      fileName: string;
      bytesTransferred: number;
      totalBytes: number;
    }) => {
      setTransferState('transferring');
      setTransferProgress({
        current: progressData.current,
        total: progressData.total,
        fileName: progressData.fileName,
        percent:
          progressData.totalBytes > 0
            ? Math.min(
                (progressData.bytesTransferred / progressData.totalBytes) * 100,
                100,
              )
            : 0,
      });
    });

    window.electronAPI.onTransferComplete(() => {
      setTransferState('done');
      setTransferProgress((prev) =>
        prev
          ? {
              ...prev,
              percent: 100,
            }
          : null,
      );
    });

    window.electronAPI.onTransferError((transferError: string) => {
      setTransferState('error');
      setError(transferError);
    });
  }, []);

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setViewMode('analyzing');
    setError(null);
    setAnalysis(null);
    setSelectedItems(new Set());
    setTransferState('idle');
    setTransferProgress(null);

    try {
      await window.electronAPI.analyzeSystem();
    } catch (analysisError) {
      console.error('Failed to start analysis:', analysisError);
      setIsAnalyzing(false);
      setViewMode('welcome');
      setError('Failed to start system analysis');
    }
  };

  const handleItemSelection = (itemId: string, selected: boolean) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAllInCategory = (items: FileItem[], selected: boolean) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);

      const addItemsRecursively = (itemList: FileItem[]) => {
        itemList.forEach((item) => {
          if (selected) {
            newSet.add(item.id);
          } else {
            newSet.delete(item.id);
          }
          if (item.children) {
            addItemsRecursively(item.children);
          }
        });
      };

      addItemsRecursively(items);
      return newSet;
    });
  };

  const handleTransferSelected = () => {
    if (selectedItems.size === 0 || !analysis || !selectedPeer) return;

    const transferItems: Array<{ id: string; name: string; path: string }> = [];

    const collectSelected = (items: FileItem[]) => {
      items.forEach((item) => {
        if (selectedItems.has(item.id)) {
          transferItems.push({
            id: item.id,
            name: item.name,
            path: item.path,
          });
        }
        if (item.children) {
          collectSelected(item.children);
        }
      });
    };

    collectSelected(analysis.files);
    collectSelected(analysis.apps);
    collectSelected(analysis.configurations);

    if (transferItems.length > 0) {
      setTransferState('transferring');
      setTransferProgress({
        current: 0,
        total: transferItems.length,
        fileName: '',
        percent: 0,
      });
      setError(null);

      window.electronAPI
        .connectToPeer(selectedPeer)
        .then(() => window.electronAPI.transferFiles({ files: transferItems }))
        .catch((transferError: Error) => {
          setTransferState('error');
          setError(transferError.message || 'Transfer failed');
        });
    }
  };

  const renderWelcome = () => (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1 className="app-title">MoveMyPC</h1>
        <p className="app-description">
          Analyze your system and transfer files between devices securely.
        </p>
        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}
        <button
          className="primary-button"
          onClick={handleStartAnalysis}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Analyzing...' : 'Start System Analysis'}
        </button>
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="analyzing-screen">
      <div className="analyzing-content">
        <h2>Analyzing Your System</h2>
        <p>
          Please wait while we scan your files, applications, and configurations...
        </p>

        {progress && (
          <div className="progress-container">
            <div className="progress-info">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.min((progress.current / progress.total) * 100, 100)}%`
                        : '0%',
                  }}
                />
              </div>
              <div className="progress-details">
                <span className="progress-phase">
                  {progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1)}
                </span>
                <span className="progress-count">
                  {progress.current}
                  {progress.total > 0 ? ` / ${progress.total}` : ''}
                </span>
              </div>
              {progress.currentPath && (
                <div className="current-path">📁 {progress.currentPath}</div>
              )}
            </div>
          </div>
        )}

        <div className="loading-spinner" />
      </div>
    </div>
  );

  const renderResults = () => {
    if (!analysis) return null;

    const totalItems =
      analysis.files.length + analysis.apps.length + analysis.configurations.length;
    const selectedCount = selectedItems.size;

    return (
      <div className="results-screen">
        <div className="results-header">
          <h2>Analysis Complete</h2>
          <p>Found {totalItems} items across your system</p>
          {selectedCount > 0 && (
            <p className="selection-summary">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for
              transfer
            </p>
          )}
        </div>

        <div className="results-content">
          <FileCategorySection
            title="Files"
            items={analysis.files}
            selectedItems={selectedItems}
            onItemSelection={handleItemSelection}
            onSelectAll={handleSelectAllInCategory}
          />

          <FileCategorySection
            title="Applications"
            items={analysis.apps}
            selectedItems={selectedItems}
            onItemSelection={handleItemSelection}
            onSelectAll={handleSelectAllInCategory}
          />

          <FileCategorySection
            title="Configurations"
            items={analysis.configurations}
            selectedItems={selectedItems}
            onItemSelection={handleItemSelection}
            onSelectAll={handleSelectAllInCategory}
          />
        </div>

        <div className="results-actions">
          <div className="peer-selector">
            {peers.length > 0 ? (
              <>
                <label htmlFor="peer-select">Send to:</label>
                <select
                  id="peer-select"
                  value={selectedPeer ? `${selectedPeer.host}:${selectedPeer.port}` : ''}
                  onChange={(e) => {
                    const peer = peers.find(
                      (item) => `${item.host}:${item.port}` === e.target.value,
                    );
                    setSelectedPeer(peer || null);
                  }}
                >
                  <option value="">Select a device</option>
                  {peers.map((peer) => (
                    <option
                      key={`${peer.host}:${peer.port}`}
                      value={`${peer.host}:${peer.port}`}
                    >
                      {peer.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span>
                No peers found - start MoveMyPC on your destination computer
              </span>
            )}
          </div>
          <button
            className="secondary-button"
            onClick={() => setViewMode('welcome')}
          >
            New Analysis
          </button>
          <button
            className="primary-button"
            onClick={handleTransferSelected}
            disabled={
              selectedCount === 0 ||
              !selectedPeer ||
              transferState === 'transferring'
            }
          >
            {transferState === 'transferring'
              ? 'Transferring...'
              : `Transfer Selected Items (${selectedCount})`}
          </button>
        </div>

        {transferProgress && transferState === 'transferring' && (
          <div className="transfer-progress">
            <div className="progress-details">
              <span>Transferring {transferProgress.fileName || 'files'}</span>
              <span>
                {transferProgress.current} / {transferProgress.total} (
                {Math.round(transferProgress.percent)}%)
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${transferProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {transferState === 'done' && (
          <div className="transfer-done">Transfer complete.</div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      {viewMode === 'welcome' && renderWelcome()}
      {viewMode === 'analyzing' && renderAnalyzing()}
      {viewMode === 'results' && renderResults()}
    </div>
  );
}

interface FileCategorySectionProps {
  title: string;
  items: FileItem[];
  selectedItems: Set<string>;
  onItemSelection: (itemId: string, selected: boolean) => void;
  onSelectAll: (items: FileItem[], selected: boolean) => void;
}

function FileCategorySection({
  title,
  items,
  selectedItems,
  onItemSelection,
  onSelectAll,
}: FileCategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const countSelectedRecursively = (itemList: FileItem[]): number =>
    itemList.reduce((count, item) => {
      const nextCount = selectedItems.has(item.id) ? count + 1 : count;
      return nextCount + (item.children ? countSelectedRecursively(item.children) : 0);
    }, 0);

  const countItemsRecursively = (itemList: FileItem[]): number =>
    itemList.reduce(
      (count, item) => count + 1 + (item.children ? countItemsRecursively(item.children) : 0),
      0,
    );

  const selectedInCategory = countSelectedRecursively(items);
  const totalInCategory = countItemsRecursively(items);
  const allSelected = selectedInCategory === totalInCategory && totalInCategory > 0;
  const someSelected = selectedInCategory > 0 && selectedInCategory < totalInCategory;

  return (
    <div className="category-section">
      <div className="category-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="category-info">
          <h3>{title}</h3>
          <span className="item-count">({items.length} items)</span>
        </div>
        <div className="category-controls">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(input) => {
                if (input) input.indeterminate = someSelected;
              }}
              onChange={(e) => onSelectAll(items, e.target.checked)}
            />
            Select All
          </label>
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="category-content">
          <FileTree
            items={items}
            selectedItems={selectedItems}
            onItemSelection={onItemSelection}
          />
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  items: FileItem[];
  selectedItems: Set<string>;
  onItemSelection: (itemId: string, selected: boolean) => void;
  level?: number;
}

function FileTree({
  items,
  selectedItems,
  onItemSelection,
  level = 0,
}: FileTreeProps) {
  return (
    <div className="file-tree">
      {items.map((item) => (
        <FileTreeItem
          key={item.id}
          item={item}
          isSelected={selectedItems.has(item.id)}
          selectedItems={selectedItems}
          onSelection={onItemSelection}
          level={level}
        />
      ))}
    </div>
  );
}

interface FileTreeItemProps {
  item: FileItem;
  isSelected: boolean;
  selectedItems: Set<string>;
  onSelection: (itemId: string, selected: boolean) => void;
  level: number;
}

function FileTreeItem({
  item,
  isSelected,
  selectedItems,
  onSelection,
  level,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const getItemIcon = (currentItem: FileItem) => {
    if (currentItem.icon && currentItem.icon.startsWith('data:image/')) {
      return (
        <img
          src={currentItem.icon}
          alt="icon"
          style={{ width: '16px', height: '16px' }}
        />
      );
    }

    if (currentItem.icon) return currentItem.icon;

    if (currentItem.type === 'folder') return isExpanded ? '📂' : '📁';

    const ext = currentItem.extension?.toLowerCase() || '';
    switch (ext) {
      case 'exe':
      case 'msi':
        return '⚙️';
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'mp4':
      case 'avi':
      case 'mov':
        return '🎬';
      case 'mp3':
      case 'wav':
        return '🎵';
      case 'zip':
      case 'rar':
        return '📦';
      default:
        return '📄';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="file-item" style={{ paddingLeft: `${level * 16}px` }}>
      <div className="file-item-content">
        <div className="file-item-left">
          {hasChildren && (
            <button
              className="expand-button"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelection(item.id, e.target.checked)}
            className="item-checkbox"
          />
          <span className="item-icon">{getItemIcon(item)}</span>
          <span className="item-name" title={item.path}>
            {item.name}
          </span>
        </div>
        <div className="file-item-right">
          {item.size && <span className="item-size">{formatFileSize(item.size)}</span>}
          <span className="item-type">{item.type}</span>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <FileTree
          items={item.children!}
          selectedItems={selectedItems}
          onItemSelection={onSelection}
          level={level + 1}
        />
      )}
    </div>
  );
}
