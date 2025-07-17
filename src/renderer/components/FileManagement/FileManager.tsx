import React, { useState, useMemo } from 'react';
import ComputerIcon from '../Icons/ComputerIcon';

interface FileItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  children?: FileItem[];
  parent?: string;
}

interface FileManagerProps {
  title: string;
  items: FileItem[];
  selectedItems: string[];
  onSelectionChange: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
}

function FileManager({
  title,
  items,
  selectedItems,
  onSelectionChange,
  onSelectAll,
}: FileManagerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Build tree structure from flat items
  const buildTree = (flatItems: FileItem[]): FileItem[] => {
    const itemMap = new Map<string, FileItem>();
    const roots: FileItem[] = [];

    // First pass: create map of all items
    flatItems.forEach((item) => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree structure
    flatItems.forEach((item) => {
      const treeItem = itemMap.get(item.id)!;
      if (item.parent) {
        const parent = itemMap.get(item.parent);
        if (parent) {
          parent.children!.push(treeItem);
        } else {
          roots.push(treeItem);
        }
      } else {
        roots.push(treeItem);
      }
    });

    return roots;
  };

  const treeItems = useMemo(() => buildTree(items), [items]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchTerm) return treeItems;

    const filterTree = (itemsToFilter: FileItem[]): FileItem[] => {
      return itemsToFilter.reduce((acc, item) => {
        const matchesSearch =
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.path.toLowerCase().includes(searchTerm.toLowerCase());

        if (item.children) {
          const filteredChildren = filterTree(item.children);
          if (matchesSearch || filteredChildren.length > 0) {
            acc.push({
              ...item,
              children: filteredChildren,
            });
          }
        } else if (matchesSearch) {
          acc.push(item);
        }

        return acc;
      }, [] as FileItem[]);
    };

    return filterTree(treeItems);
  }, [treeItems, searchTerm]);

  // Sort items
  const sortedItems = useMemo(() => {
    const sortTree = (itemsToSort: FileItem[]): FileItem[] => {
      return itemsToSort
        .map((item) => ({
          ...item,
          children: item.children ? sortTree(item.children) : undefined,
        }))
        .sort((a, b) => {
          // Always put folders first
          if (a.type === 'folder' && b.type === 'file') return -1;
          if (a.type === 'file' && b.type === 'folder') return 1;

          let comparison = 0;
          switch (sortBy) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'size':
              comparison = (a.size || 0) - (b.size || 0);
              break;
            case 'type':
              comparison = a.type.localeCompare(b.type);
              break;
            default:
              comparison = a.name.localeCompare(b.name);
              break;
          }

          return sortOrder === 'asc' ? comparison : -comparison;
        });
    };

    return sortTree(filteredItems);
  }, [filteredItems, sortBy, sortOrder]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const getFileIcon = (item: FileItem) => {
    if (item.type === 'folder') {
      return expandedFolders.has(item.id) ? '📂' : '📁';
    }

    const ext = item.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📈';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        return '🖼️';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return '🎬';
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'aac':
        return '🎵';
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
        return '📦';
      case 'exe':
      case 'msi':
        return '⚙️';
      default:
        return '📄';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
  };

  const renderTreeItem = (item: FileItem, level: number = 0) => {
    const isSelected = selectedItems.includes(item.id);
    const isExpanded = expandedFolders.has(item.id);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id} className="file-item-container">
        <div
          className={`file-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
        >
          <div className="file-item-left">
            {item.type === 'folder' && (
              <button
                type="button"
                className="expand-button"
                onClick={() => toggleFolder(item.id)}
                disabled={!hasChildren}
              >
                {(() => {
                  if (!hasChildren) return '';
                  return isExpanded ? '▼' : '▶';
                })()}
              </button>
            )}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectionChange(item.id, e.target.checked)}
              className="file-checkbox"
            />
            <span className="file-icon">{getFileIcon(item)}</span>
            <span className="file-name" title={item.path}>
              {item.name}
            </span>
          </div>
          <div className="file-item-right">
            <span className="file-size">{formatFileSize(item.size)}</span>
            <span className="file-type">{item.type}</span>
          </div>
        </div>

        {item.type === 'folder' && isExpanded && hasChildren && (
          <div className="folder-children">
            {item.children!.map((child) => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleSort = (newSortBy: 'name' | 'size' | 'type') => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const allItemsSelected =
    items.length > 0 && items.every((item) => selectedItems.includes(item.id));
  const someItemsSelected = selectedItems.length > 0 && !allItemsSelected;

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <div className="file-manager-title">
          <ComputerIcon />
          <h3>{title}</h3>
          <span className="item-count">({items.length} items)</span>
        </div>

        <div className="file-manager-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>

          <div className="select-all-container">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="select-all-label">
              <input
                type="checkbox"
                checked={allItemsSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someItemsSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="select-all-checkbox"
              />
              Select All
            </label>
          </div>
        </div>
      </div>

      <div className="file-manager-toolbar">
        <div className="sort-controls">
          <span>Sort by:</span>
          <button
            type="button"
            className={`sort-button ${sortBy === 'name' ? 'active' : ''}`}
            onClick={() => handleSort('name')}
          >
            Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            className={`sort-button ${sortBy === 'size' ? 'active' : ''}`}
            onClick={() => handleSort('size')}
          >
            Size {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            className={`sort-button ${sortBy === 'type' ? 'active' : ''}`}
            onClick={() => handleSort('type')}
          >
            Type {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        <div className="selection-info">
          {selectedItems.length > 0 && (
            <span>{selectedItems.length} selected</span>
          )}
        </div>
      </div>

      <div className="file-list-container">
        <div className="file-list-header">
          <div className="file-list-header-left">
            <span>Name</span>
          </div>
          <div className="file-list-header-right">
            <span>Size</span>
            <span>Type</span>
          </div>
        </div>

        <div className="file-list">
          {sortedItems.length > 0 ? (
            sortedItems.map((item) => renderTreeItem(item))
          ) : (
            <div className="empty-state">
              <span>No files found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileManager;
