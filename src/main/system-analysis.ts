import { extname, join } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import log from 'electron-log';
import {
  EXCLUDE_PATTERNS,
  CONFIG_PATTERNS,
  getUserDirectories,
  getApplicationDirectories,
  getConfigurationDirectories,
} from './config';
import { detectDeviceSpecs, calculateOptimalLimits } from './utils';
import {
  FileItem,
  AnalysisProgress,
  SystemAnalysisResult,
  AnalysisLimits,
  AnalysisWarning,
  ExclusionManager,
} from './types/analysis-types';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

let progressCallback: ((progress: AnalysisProgress) => void) | null = null;
let fileCounter = 0;
let progressUpdateCounter = 0;
let analysisLimits: AnalysisLimits;
let exclusionManager: ExclusionManager;

const createExclusionManager = (): ExclusionManager => {
  const excludedPaths = new Set<string>();

  return {
    excludedPaths,
    addExclusion: (path: string) => excludedPaths.add(path.toLowerCase()),
    removeExclusion: (path: string) => excludedPaths.delete(path.toLowerCase()),
    isExcluded: (path: string) => {
      const normalizedPath = path.toLowerCase();
      return Array.from(excludedPaths).some(
        (excluded) =>
          normalizedPath.startsWith(excluded) ||
          excluded.startsWith(normalizedPath),
      );
    },
  };
};

export const setProgressCallback = (
  callback: (progress: AnalysisProgress) => void,
) => {
  progressCallback = callback;
};

export const addDirectoryExclusion = (path: string) => {
  if (exclusionManager) {
    exclusionManager.addExclusion(path);
  }
};

export const removeDirectoryExclusion = (path: string) => {
  if (exclusionManager) {
    exclusionManager.removeExclusion(path);
  }
};

export const getExcludedDirectories = (): string[] => {
  return exclusionManager ? Array.from(exclusionManager.excludedPaths) : [];
};

const shouldExcludePath = (path: string): boolean => {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(path));
};

const generateFileId = (path: string): string => {
  fileCounter += 1;
  return `file-${fileCounter}-${Buffer.from(path).toString('base64').slice(0, 8)}`;
};

const getFileExtension = (filename: string): string => {
  const ext = extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
};

const updateProgress = (
  phase: 'files' | 'apps' | 'configurations',
  currentPath?: string,
) => {
  progressUpdateCounter += 1;
  if (
    progressCallback &&
    progressUpdateCounter % analysisLimits.progressUpdateInterval === 0
  ) {
    progressCallback({
      phase,
      current: fileCounter,
      total: -1,
      currentPath,
    });
  }
};

const processConcurrentOperations = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results: R[] = [];

  // Process items in groups based on concurrency level
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  // Process each chunk sequentially, but items within each chunk concurrently
  await chunks.reduce(async (previousPromise, chunk) => {
    await previousPromise;
    const chunkPromises = chunk.map(processor);
    const chunkResults = await Promise.allSettled(chunkPromises);

    chunkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
  }, Promise.resolve());

  return results;
};

const processBatch = async <T>(
  items: T[],
  processor: (item: T) => Promise<any>,
): Promise<any[]> => {
  const results: any[] = [];
  const batches: T[][] = [];

  // Create batches
  for (let i = 0; i < items.length; i += analysisLimits.batchSize) {
    batches.push(items.slice(i, i + analysisLimits.batchSize));
  }

  // Process batches based on device concurrency level
  if (analysisLimits.concurrencyLevel === 1) {
    // Sequential processing for low-end devices
    await batches.reduce(async (previousPromise, batch) => {
      await previousPromise;
      const batchResults = await Promise.allSettled(batch.map(processor));
      const successfulResults = batchResults
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => (result as PromiseFulfilledResult<any>).value);
      results.push(...successfulResults);
    }, Promise.resolve());
  } else {
    // Concurrent processing for higher-end devices
    const processConcurrentBatches = async (
      batchGroup: T[][],
    ): Promise<any[]> => {
      const batchPromises = batchGroup.map(async (batch) => {
        const batchResults = await Promise.allSettled(batch.map(processor));
        return batchResults
          .filter((result) => result.status === 'fulfilled' && result.value)
          .map((result) => (result as PromiseFulfilledResult<any>).value);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      const allResults: any[] = [];
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        }
      });
      return allResults;
    };

    // Process batches in groups based on concurrency level
    const batchGroups: T[][][] = [];
    for (let i = 0; i < batches.length; i += analysisLimits.concurrencyLevel) {
      batchGroups.push(batches.slice(i, i + analysisLimits.concurrencyLevel));
    }

    // Process each batch group sequentially
    await batchGroups.reduce(async (previousPromise, batchGroup) => {
      await previousPromise;
      const groupResults = await processConcurrentBatches(batchGroup);
      results.push(...groupResults);
    }, Promise.resolve());
  }

  return results;
};

const scanDirectory = async (
  dirPath: string,
  parentId?: string,
  depth = 0,
): Promise<FileItem[]> => {
  if (depth > analysisLimits.maxDepth || shouldExcludePath(dirPath)) {
    return [];
  }

  const items: FileItem[] = [];

  try {
    await access(dirPath, fs.constants.R_OK);

    let entries: string[] = [];
    try {
      entries = await readdir(dirPath);
    } catch {
      return [];
    }

    if (exclusionManager.isExcluded(dirPath)) {
      return [];
    }

    if (entries.length > analysisLimits.warningDirectorySize) {
      const warning: AnalysisWarning = {
        type: 'large_directory',
        path: dirPath,
        details: `Directory contains ${entries.length} files`,
        fileCount: entries.length,
        canExclude: true,
      };

      if (progressCallback) {
        progressCallback({
          phase: 'files',
          current: fileCounter,
          total: -1,
          currentPath: dirPath,
          warning,
        });
      }
    }

    const processEntry = async (entry: string): Promise<FileItem | null> => {
      const fullPath = join(dirPath, entry);

      if (shouldExcludePath(fullPath)) {
        return null;
      }

      try {
        let stats;
        try {
          stats = await stat(fullPath);
        } catch {
          return null;
        }

        const id = generateFileId(fullPath);
        updateProgress('files', fullPath);

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
            const children = await scanDirectory(fullPath, id, depth + 1);
            folderItem.children = children;
          } catch {
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
      } catch {
        return null;
      }

      return null;
    };

    const processedItems = await processBatch(entries, processEntry);
    items.push(...processedItems.filter((item) => item !== null));
  } catch {
    // Silent fail for inaccessible directories
  }

  return items;
};

const analyzeUserFiles = async (): Promise<FileItem[]> => {
  const userDirs = getUserDirectories();
  const allFiles: FileItem[] = [];
  const processedPaths = new Set<string>();

  const processDirOperation = async (dir: string): Promise<FileItem[]> => {
    try {
      await access(dir, fs.constants.R_OK);

      const normalizedPath = dir.toLowerCase();
      if (processedPaths.has(normalizedPath)) {
        return [];
      }
      processedPaths.add(normalizedPath);

      return await scanDirectory(dir);
    } catch {
      return [];
    }
  };

  // Use concurrent processing based on device capabilities
  const processDirResults = await processConcurrentOperations(
    userDirs,
    processDirOperation,
    analysisLimits.concurrencyLevel,
  );

  processDirResults.forEach((result) => {
    allFiles.push(...result);
  });

  const uniqueFiles = new Map<string, FileItem>();
  allFiles.forEach((file) => {
    if (!uniqueFiles.has(file.path)) {
      uniqueFiles.set(file.path, file);
    }
  });

  return Array.from(uniqueFiles.values());
};

const analyzeApplications = async (): Promise<FileItem[]> => {
  const appDirs = getApplicationDirectories();
  const apps: FileItem[] = [];

  if (progressCallback) {
    progressCallback({ phase: 'apps', current: 0, total: appDirs.length });
  }

  const processAppDir = async (
    appDir: string,
    index: number,
  ): Promise<FileItem[]> => {
    const dirApps: FileItem[] = [];

    if (progressCallback) {
      progressCallback({
        phase: 'apps',
        current: index,
        total: appDirs.length,
        currentPath: appDir,
      });
    }

    try {
      await access(appDir, fs.constants.R_OK);

      let entries: string[] = [];
      try {
        entries = await readdir(appDir);
      } catch {
        return dirApps;
      }

      const processAppEntry = async (
        entry: string,
      ): Promise<FileItem | null> => {
        const fullPath = join(appDir, entry);

        try {
          let stats;
          try {
            stats = await stat(fullPath);
          } catch {
            return null;
          }

          if (stats.isDirectory()) {
            try {
              const appFiles = await readdir(fullPath);
              const hasExecutable = appFiles.some(
                (file) => file.endsWith('.exe') || file.endsWith('.msi'),
              );

              if (hasExecutable) {
                return {
                  id: generateFileId(fullPath),
                  name: entry,
                  path: fullPath,
                  type: 'folder',
                  modifiedDate: stats.mtime,
                };
              }
            } catch {
              // Silent fail
            }
          } else if (entry.endsWith('.exe') || entry.endsWith('.msi')) {
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
        } catch {
          // Silent fail
        }

        return null;
      };

      const limitedEntries = entries.slice(0, 100);
      const processedApps = await processBatch(limitedEntries, processAppEntry);
      dirApps.push(...processedApps.filter((app) => app !== null));
    } catch {
      // Silent fail
    }

    return dirApps;
  };

  const appDirResults = await processConcurrentOperations(
    appDirs.map((dir, index) => ({ dir, index })),
    async ({ dir, index }) => processAppDir(dir, index),
    analysisLimits.concurrencyLevel,
  );

  appDirResults.forEach((result) => {
    apps.push(...result);
  });

  return apps;
};

const analyzeConfigurations = async (): Promise<FileItem[]> => {
  const configDirs = getConfigurationDirectories();
  const configs: FileItem[] = [];

  if (progressCallback) {
    progressCallback({
      phase: 'configurations',
      current: 0,
      total: configDirs.length,
    });
  }

  const processConfigDir = async (
    configDir: string,
    index: number,
  ): Promise<FileItem[]> => {
    const dirConfigs: FileItem[] = [];

    if (progressCallback) {
      progressCallback({
        phase: 'configurations',
        current: index,
        total: configDirs.length,
        currentPath: configDir,
      });
    }

    try {
      await access(configDir, fs.constants.R_OK);

      let files: FileItem[] = [];
      try {
        files = await scanDirectory(configDir, undefined, 0);
      } catch {
        return dirConfigs;
      }

      const configFiles = files.filter((file) => {
        if (file.type === 'file') {
          return CONFIG_PATTERNS.some((pattern) =>
            pattern.pattern.test(file.name.toLowerCase()),
          );
        }
        return false;
      });

      dirConfigs.push(...configFiles);
    } catch {
      // Silent fail
    }

    return dirConfigs;
  };

  const configDirResults = await processConcurrentOperations(
    configDirs.map((dir, index) => ({ dir, index })),
    async ({ dir, index }) => processConfigDir(dir, index),
    analysisLimits.concurrencyLevel,
  );

  configDirResults.forEach((result) => {
    configs.push(...result);
  });

  return configs;
};

export const analyzeSystem = async (): Promise<SystemAnalysisResult> => {
  fileCounter = 0;
  progressUpdateCounter = 0;

  const deviceSpecs = await detectDeviceSpecs();
  analysisLimits = calculateOptimalLimits(deviceSpecs);
  exclusionManager = createExclusionManager();

  log.info(
    `Device specs: ${deviceSpecs.cpuCores} cores, ${deviceSpecs.availableMemoryGB.toFixed(1)}GB RAM, ${deviceSpecs.diskSpeedTier} disk`,
  );
  log.info(
    `Analysis limits: warn at ${analysisLimits.warningDirectorySize} files/dir, batch size ${analysisLimits.batchSize}, concurrency level ${analysisLimits.concurrencyLevel}`,
  );

  const startTime = Date.now();

  try {
    let files: FileItem[] = [];
    let apps: FileItem[] = [];
    let configurations: FileItem[] = [];

    const [filesResult, appsResult, configurationsResult] =
      await Promise.allSettled([
        analyzeUserFiles(),
        analyzeApplications(),
        analyzeConfigurations(),
      ]);

    if (filesResult.status === 'fulfilled') {
      files = filesResult.value;
    }

    if (appsResult.status === 'fulfilled') {
      apps = appsResult.value;
    }

    if (configurationsResult.status === 'fulfilled') {
      configurations = configurationsResult.value;
    }

    const result = {
      files,
      apps,
      configurations,
    };

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    log.info(
      `Analysis completed: ${fileCounter} items in ${duration.toFixed(2)}s`,
    );

    return result;
  } catch (error) {
    log.error('Analysis error:', error);
    return {
      files: [],
      apps: [],
      configurations: [],
    };
  }
};
