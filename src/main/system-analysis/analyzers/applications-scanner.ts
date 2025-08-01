import { join } from 'path';
import log from 'electron-log';
import {
  generateFileId,
  getFileExtension,
  isExecutableFile,
} from '../utils/file-utils';
import {
  isDirectoryAccessible,
  safeReaddir,
  safeStat,
} from '../service/file.service';
import { sendProgress } from '../managers/manager';
import {
  processConcurrentOperations,
  processBatch,
} from '../processors/concurrent';
import { getApplicationDirectories } from '../../config';
import { FileItem, AnalysisLimits } from '../../types/analysis-types';

/**
 * Processes an application directory entry to identify executable applications
 * @param entry - Directory entry name
 * @param appDir - Application directory path
 * @returns Promise resolving to FileItem or null
 */
const processAppEntry = async (
  entry: string,
  appDir: string,
): Promise<FileItem | null> => {
  const fullPath = join(appDir, entry);

  const stats = await safeStat(fullPath);
  if (!stats) {
    return null;
  }

  if (stats.isDirectory()) {
    try {
      const appFiles = await safeReaddir(fullPath);
      const hasExecutable = appFiles.some((file) => isExecutableFile(file));

      if (hasExecutable) {
        return {
          id: generateFileId(fullPath),
          name: entry,
          path: fullPath,
          type: 'folder',
          modifiedDate: stats.mtime,
        };
      }
    } catch (error: any) {
      const errorCode = error.code || 'UNKNOWN';
      const errorMessage = error.message || 'Unknown error';

      switch (errorCode) {
        case 'EACCES':
          log.warn(
            `Permission denied checking executable files in: ${fullPath}`,
          );
          break;
        case 'ENOENT':
          log.debug(`Application directory no longer exists: ${fullPath}`);
          break;
        case 'EMFILE':
        case 'ENFILE':
          log.error(
            `Too many open files when checking executable files in: ${fullPath}`,
          );
          break;
        default:
          log.warn(
            `Failed to check executable files in ${fullPath} (${errorCode}): ${errorMessage}`,
          );
      }
    }
  } else if (isExecutableFile(entry)) {
    return {
      id: generateFileId(fullPath),
      name: entry,
      path: fullPath,
      type: 'file',
      size: stats.size,
      modifiedDate: stats.mtime,
      extension: getFileExtension(entry),
    };
  }

  return null;
};

/**
 * Processes a single application directory
 * @param appDir - Application directory path
 * @param index - Directory index for progress tracking
 * @param total - Total number of directories
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of application file items
 */
const processAppDir = async (
  appDir: string,
  index: number,
  total: number,
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const dirApps: FileItem[] = [];

  sendProgress({
    phase: 'apps',
    current: index,
    total,
    currentPath: appDir,
  });

  const isAccessible = await isDirectoryAccessible(appDir);
  if (!isAccessible) {
    return dirApps;
  }

  const entries = await safeReaddir(appDir);
  if (entries.length === 0) {
    return dirApps;
  }

  // Limit entries to avoid processing too many files
  const limitedEntries = entries.slice(0, 100);

  const processAppEntryWithDir = async (
    entry: string,
  ): Promise<FileItem | null> => {
    return processAppEntry(entry, appDir);
  };

  const processedApps = await processBatch(
    limitedEntries,
    processAppEntryWithDir,
    analysisLimits,
  );
  dirApps.push(...processedApps.filter((app) => app !== null));

  return dirApps;
};

/**
 * Analyzes installed applications on the system
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of application file items
 */
export const analyzeApplications = async (
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const appDirs = getApplicationDirectories();
  const apps: FileItem[] = [];

  sendProgress({
    phase: 'apps',
    current: 0,
    total: appDirs.length,
  });

  const appDirResults = await processConcurrentOperations(
    appDirs.map((dir, index) => ({ dir, index })),
    async ({ dir, index }) =>
      processAppDir(dir, index, appDirs.length, analysisLimits),
    analysisLimits.concurrencyLevel,
  );

  appDirResults.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      apps.push(...result.value);
    } else if (result.status === 'rejected') {
      log.error('Application directory processing failed:', result.reason);
    }
  });

  return apps;
};

/**
 * Scans for portable applications in specified directories
 * @param directories - Array of directory paths to scan
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of portable application file items
 */
export const scanPortableApps = async (
  directories: string[],
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const portableApps: FileItem[] = [];

  const scanPortableDir = async (dir: string): Promise<FileItem[]> => {
    const isAccessible = await isDirectoryAccessible(dir);
    if (!isAccessible) {
      return [];
    }

    const entries = await safeReaddir(dir);

    const processEntry = async (entry: string): Promise<FileItem | null> => {
      const fullPath = join(dir, entry);
      const stats = await safeStat(fullPath);

      if (stats && stats.isFile() && isExecutableFile(entry)) {
        return {
          id: generateFileId(fullPath),
          name: entry,
          path: fullPath,
          type: 'file',
          size: stats.size,
          modifiedDate: stats.mtime,
          extension: getFileExtension(entry),
        };
      }
      return null;
    };

    const results = await processConcurrentOperations(
      entries,
      processEntry,
      Math.min(entries.length, analysisLimits.concurrencyLevel),
    );

    const apps: FileItem[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        apps.push(result.value);
      }
    });

    return apps;
  };

  const results = await processConcurrentOperations(
    directories,
    scanPortableDir,
    analysisLimits.concurrencyLevel,
  );

  results.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      portableApps.push(...result.value);
    } else if (result.status === 'rejected') {
      log.error('Portable application scanning failed:', result.reason);
    }
  });

  return portableApps;
};
