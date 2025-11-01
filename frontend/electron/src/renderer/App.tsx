import React, { useState, useEffect } from 'react';
import './App.css';

// Types matching the Go backend
interface FileItem {
  id: string;
  name: string;
  path: string;
  type: string; // "file" or "folder"
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

type ViewMode = 'welcome' | 'analyzing' | 'results';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up Electron IPC listeners
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
  }, []);

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setViewMode('analyzing');
    setError(null);
    setAnalysis(null);
    setSelectedItems(new Set());

    try {
      await window.electronAPI.analyzeSystem();
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setIsAnalyzing(false);
      setViewMode('welcome');
      setError('Failed to start system analysis');
    }
  };

  const handleItemSelection = (itemId: string, selected: boolean) => {
    setSelectedItems(prev => {
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
    setSelectedItems(prev => {
      const newSet = new Set(prev);

      const addItemsRecursively = (itemList: FileItem[]) => {
        itemList.forEach(item => {
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
    if (selectedItems.size === 0 || !analysis) return;

    // Collect selected items from all categories
    const transferItems: Array<{id: string, name: string, path: string}> = [];

    const collectSelected = (items: FileItem[]) => {
      items.forEach(item => {
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
      window.electronAPI.transferFiles({ files: transferItems });
      alert(`Initiating transfer of ${transferItems.length} items...`);
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
        <p>Please wait while we scan your files, applications, and configurations...</p>

        {progress && (
          <div className="progress-container">
            <div className="progress-info">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: progress.total > 0 ? `${Math.min((progress.current / progress.total) * 100, 100)}%` : '0%'
                  }}
                />
              </div>
              <div className="progress-details">
                <span className="progress-phase">
                  {progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1)}
                </span>
                <span className="progress-count">
                  {progress.current}{progress.total > 0 ? ` / ${progress.total}` : ''}
                </span>
              </div>
              {progress.currentPath && (
                <div className="current-path">
                  📁 {progress.currentPath}
                </div>
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

    const totalItems = analysis.files.length + analysis.apps.length + analysis.configurations.length;
    const selectedCount = selectedItems.size;

    return (
      <div className="results-screen">
        <div className="results-header">
          <h2>Analysis Complete</h2>
          <p>Found {totalItems} items across your system</p>
          {selectedCount > 0 && (
            <p className="selection-summary">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for transfer
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
          <button
            className="secondary-button"
            onClick={() => setViewMode('welcome')}
          >
            New Analysis
          </button>
          <button
            className="primary-button"
            onClick={handleTransferSelected}
            disabled={selectedCount === 0}
          >
            Transfer Selected Items ({selectedCount})
          </button>
        </div>
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
  onSelectAll
}: FileCategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const selectedInCategory = items.filter(item => selectedItems.has(item.id)).length;
  const allSelected = selectedInCategory === items.length && items.length > 0;
  const someSelected = selectedInCategory > 0 && selectedInCategory < items.length;

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

function FileTree({ items, selectedItems, onItemSelection, level = 0 }: FileTreeProps) {
  return (
    <div className="file-tree">
      {items.map(item => (
        <FileTreeItem
          key={item.id}
          item={item}
          isSelected={selectedItems.has(item.id)}
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
  onSelection: (itemId: string, selected: boolean) => void;
  level: number;
}

function FileTreeItem({ item, isSelected, onSelection, level }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const getItemIcon = (item: FileItem) => {
    if (item.icon && item.icon.startsWith('data:image/')) {
      return <img src={item.icon} alt="icon" style={{ width: '16px', height: '16px' }} />;
    }

    if (item.icon) return item.icon;

    if (item.type === 'folder') return isExpanded ? '📂' : '📁';

    // File type icons based on extension
    const ext = item.extension?.toLowerCase() || '';
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
      unitIndex++;
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
          {item.size && (
            <span className="item-size">{formatFileSize(item.size)}</span>
          )}
          <span className="item-type">{item.type}</span>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <FileTree
          items={item.children!}
          selectedItems={new Set()} // Children inherit parent selection logic
          onItemSelection={onSelection}
          level={level + 1}
        />
      )}
    </div>
  );
}
