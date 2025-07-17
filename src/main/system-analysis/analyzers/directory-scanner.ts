import { join } from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { 
  generateFileId, 
  getFileExtension, 
  isDirectoryAccessible, 
  safeReaddir, 
  safeStat 
} from '../utils/file-utils';
import { shouldExcludePath, isPathExcluded } from '../managers/exclusion-manager';
import { updateProgress, sendProgress } from '../managers/progress-manager';
import { processBatch } from '../processors/concurrent-processor';
import { 
  FileItem, 
  AnalysisLimits, 
  AnalysisWarning 
} from '../../types/analysis-types';

/**
 * Scans a directory recursively and returns file items
 * @param dirPath - Directory path to scan
 * @param parentId - Parent directory ID
 * @param depth - Current depth level
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of file items
 */
export const scanDirectory = async (
  dirPath: string,
  analysisLimits: AnalysisLimits,
  parentId?: string,
  depth = 0,
): Promise<FileItem[]> => {
  if (depth > analysisLimits.maxDepth || shouldExcludePath(dirPath)) {
    return [];
  }

  const items: FileItem[] = [];

  try {
    const isAccessible = await isDirectoryAccessible(dirPath);
    if (!isAccessible) {
      return [];
    }

    const entries = await safeReaddir(dirPath);
    if (entries.length === 0) {
      return [];
    }

    if (isPathExcluded(dirPath)) {
      return [];
    }

    // Check for large directories and emit warning
    if (entries.length > analysisLimits.warningDirectorySize) {
      const warning: AnalysisWarning = {
        type: 'large_directory',
        path: dirPath,
        details: `Directory contains ${entries.length} files`,
        fileCount: entries.length,
        canExclude: true,
      };

      sendProgress({
        phase: 'files',
        current: 0,
        total: -1,
        currentPath: dirPath,
        warning,
      });
    }

    const processEntry = async (entry: string): Promise<FileItem | null> => {
      const fullPath = join(dirPath, entry);

      if (shouldExcludePath(fullPath)) {
        return null;
      }

      const stats = await safeStat(fullPath);
      if (!stats) {
        return null;
      }

      const id = generateFileId(fullPath);
      updateProgress('files', 0, fullPath);

      if (stats.isDirectory()) {
        const folderItem: FileItem = {
          id,
          name: entry,
          path: fullPath,
          type: 'folder',
          parent: parentId,
          modifiedDate: stats.mtime,
          children: [],
        };

        try {
          const children = await scanDirectory(fullPath, analysisLimits, id, depth + 1);
          folderItem.children = children;
        } catch (error) {
          log.warn(`Failed to scan subdirectory ${fullPath}:`, error);
          folderItem.children = [];
        }

        return folderItem;
      }
      
      if (stats.isFile()) {
        if (stats.size > analysisLimits.largeSizeThreshold) {
          log.info(
            `Large file: ${fullPath} (${(stats.size / 1024 ** 3).toFixed(2)} GB)`,
          );
        }

        const fileItem: FileItem = {
          id,
          name: entry,
          path: fullPath,
          type: 'file',
          size: stats.size,
          parent: parentId,
          modifiedDate: stats.mtime,
          extension: getFileExtension(entry),
        };

        return fileItem;
      }

      return null;
    };

    const processedItems = await processBatch(entries, processEntry, analysisLimits);
    items.push(...processedItems.filter((item) => item !== null));
  } catch (error) {
    log.warn(`Failed to scan directory ${dirPath}:`, error);
  }

  return items;
};

/**
 * Scans multiple directories concurrently
 * @param directories - Array of directory paths to scan
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of all file items
 */
export const scanDirectories = async (
  directories: string[],
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const allFiles: FileItem[] = [];
  const processedPaths = new Set<string>();

  const processDirOperation = async (dir: string): Promise<FileItem[]> => {
    const normalizedPath = dir.toLowerCase();
    if (processedPaths.has(normalizedPath)) {
      return [];
    }
    processedPaths.add(normalizedPath);

    const isAccessible = await isDirectoryAccessible(dir);
    if (!isAccessible) {
      return [];
    }

    return await scanDirectory(dir, analysisLimits);
  };

  const processedResults = await processBatch(directories, processDirOperation, analysisLimits);

  processedResults.forEach((result) => {
    if (Array.isArray(result)) {
      allFiles.push(...result);
    }
  });

  // Remove duplicates based on path
  const uniqueFiles = new Map<string, FileItem>();
  allFiles.forEach((file) => {
    if (!uniqueFiles.has(file.path)) {
      uniqueFiles.set(file.path, file);
    }
  });

  return Array.from(uniqueFiles.values());
}; 