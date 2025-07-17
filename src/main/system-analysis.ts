import { extname, dirname, basename } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { EXCLUDE_PATTERNS, CONFIG_PATTERNS, getUserDirectories, getApplicationDirectories, getConfigurationDirectories } from './config';
import { detectDeviceSpecs, calculateOptimalLimits } from './utils';
import { FileItem, AnalysisProgress, SystemAnalysisResult, AnalysisLimits, AnalysisWarning, ExclusionManager } from './types/analysis-types';

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
      return Array.from(excludedPaths).some(excluded => 
        normalizedPath.startsWith(excluded) || excluded.startsWith(normalizedPath)
      );
    }
  };
};

export const setProgressCallback = (callback: (progress: AnalysisProgress) => void) => {
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
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(path));
};

const generateFileId = (path: string): string => {
  return `file-${++fileCounter}-${Buffer.from(path).toString('base64').slice(0, 8)}`;
};

const getFileExtension = (filename: string): string => {
  const ext = extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
};

const updateProgress = (phase: 'files' | 'apps' | 'configurations', currentPath?: string) => {
  progressUpdateCounter++;
  if (progressCallback && progressUpdateCounter % analysisLimits.progressUpdateInterval === 0) {
    progressCallback({
      phase,
      current: fileCounter,
      total: -1,
      currentPath
    });
  }
};

const processBatch = async <T>(items: T[], processor: (item: T) => Promise<any>): Promise<any[]> => {
  const results: any[] = [];
  
  for (let i = 0; i < items.length; i += analysisLimits.batchSize) {
    const batch = items.slice(i, i + analysisLimits.batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    });
    
    await new Promise(resolve => setImmediate(resolve));
  }
  
  return results;
};

const scanDirectory = async (
  dirPath: string,
  depth: number = 0,
  parentId?: string
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
    } catch (readdirError) {
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
        canExclude: true
      };
      
      if (progressCallback) {
        progressCallback({
          phase: 'files',
          current: fileCounter,
          total: -1,
          currentPath: dirPath,
          warning
        });
      }
    }
    
    const processEntry = async (entry: string): Promise<FileItem | null> => {
      const fullPath = dirPath + '\\' + entry;
      
      if (shouldExcludePath(fullPath)) {
        return null;
      }

      try {
        let stats;
        try {
          stats = await stat(fullPath);
        } catch (statError) {
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
            children: []
          };

          try {
            const children = await scanDirectory(fullPath, depth + 1, id);
            folderItem.children = children;
          } catch (recursiveError) {
            folderItem.children = [];
          }
          
          return folderItem;
        } else if (stats.isFile()) {
          if (stats.size > analysisLimits.largeSizeThreshold) {
            console.info(`Large file: ${fullPath} (${(stats.size / (1024 ** 3)).toFixed(2)} GB)`);
          }

          const fileItem: FileItem = {
            id,
            name: entry,
            path: fullPath,
            type: 'file',
            size: stats.size,
            parent: parentId,
            modifiedDate: stats.mtime,
            extension: getFileExtension(entry)
          };

          return fileItem;
        }
      } catch (itemError) {
        return null;
      }
      
      return null;
    };

    const processedItems = await processBatch(entries, processEntry);
    items.push(...processedItems.filter(item => item !== null));
    
  } catch (accessError) {
    // Silent fail for inaccessible directories
  }

  return items;
};

const analyzeUserFiles = async (): Promise<FileItem[]> => {
  const userDirs = getUserDirectories();
  const allFiles: FileItem[] = [];
  const processedPaths = new Set<string>();
  
  const processDirResults = await Promise.allSettled(
    userDirs.map(async (dir) => {
      try {
        await access(dir, fs.constants.R_OK);
        
        const normalizedPath = dir.toLowerCase();
        if (processedPaths.has(normalizedPath)) {
          return [];
        }
        processedPaths.add(normalizedPath);
        
        return await scanDirectory(dir);
      } catch (error) {
        return [];
      }
    })
  );

  processDirResults.forEach(result => {
    if (result.status === 'fulfilled') {
      allFiles.push(...result.value);
    }
  });

  const uniqueFiles = new Map<string, FileItem>();
  allFiles.forEach(file => {
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

  const processAppDir = async (appDir: string, index: number): Promise<FileItem[]> => {
    const dirApps: FileItem[] = [];
    
    if (progressCallback) {
      progressCallback({ 
        phase: 'apps', 
        current: index, 
        total: appDirs.length,
        currentPath: appDir 
      });
    }

    try {
      await access(appDir, fs.constants.R_OK);
      
      let entries: string[] = [];
      try {
        entries = await readdir(appDir);
      } catch (readdirError) {
        return dirApps;
      }
      
      const processAppEntry = async (entry: string): Promise<FileItem | null> => {
        const fullPath = appDir + '\\' + entry;
        
        try {
          let stats;
          try {
            stats = await stat(fullPath);
          } catch (statError) {
            return null;
          }
          
          if (stats.isDirectory()) {
            try {
              const appFiles = await readdir(fullPath);
              const hasExecutable = appFiles.some(file => 
                file.endsWith('.exe') || file.endsWith('.msi')
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
            } catch (appDirError) {
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
              extension: getFileExtension(entry)
            };
          }
        } catch (appError) {
          // Silent fail
        }
        
        return null;
      };

      const limitedEntries = entries.slice(0, 100);
      const processedApps = await processBatch(limitedEntries, processAppEntry);
      dirApps.push(...processedApps.filter(app => app !== null));
      
    } catch (accessError) {
      // Silent fail
    }

    return dirApps;
  };

  const appDirResults = await Promise.allSettled(
    appDirs.map((dir, index) => processAppDir(dir, index))
  );

  appDirResults.forEach(result => {
    if (result.status === 'fulfilled') {
      apps.push(...result.value);
    }
  });

  return apps;
};

const analyzeConfigurations = async (): Promise<FileItem[]> => {
  const configDirs = getConfigurationDirectories();
  const configs: FileItem[] = [];
  
  if (progressCallback) {
    progressCallback({ phase: 'configurations', current: 0, total: configDirs.length });
  }

  const processConfigDir = async (configDir: string, index: number): Promise<FileItem[]> => {
    const dirConfigs: FileItem[] = [];
    
    if (progressCallback) {
      progressCallback({ 
        phase: 'configurations', 
        current: index, 
        total: configDirs.length,
        currentPath: configDir 
      });
    }

    try {
      await access(configDir, fs.constants.R_OK);
      
      let files: FileItem[] = [];
      try {
        files = await scanDirectory(configDir, 0);
      } catch (scanError) {
        return dirConfigs;
      }
      
      const configFiles = files.filter(file => {
        if (file.type === 'file') {
          return CONFIG_PATTERNS.some(pattern => 
            pattern.pattern.test(file.name.toLowerCase())
          );
        }
        return false;
      });
      
      dirConfigs.push(...configFiles);
    } catch (accessError) {
      // Silent fail
    }

    return dirConfigs;
  };

  const configDirResults = await Promise.allSettled(
    configDirs.map((dir, index) => processConfigDir(dir, index))
  );

  configDirResults.forEach(result => {
    if (result.status === 'fulfilled') {
      configs.push(...result.value);
    }
  });

  return configs;
};

export const analyzeSystem = async (): Promise<SystemAnalysisResult> => {
  fileCounter = 0;
  progressUpdateCounter = 0;
  
  const deviceSpecs = await detectDeviceSpecs();
  analysisLimits = calculateOptimalLimits(deviceSpecs);
  exclusionManager = createExclusionManager();
  
  console.log(`Device specs: ${deviceSpecs.cpuCores} cores, ${deviceSpecs.availableMemoryGB.toFixed(1)}GB RAM, ${deviceSpecs.diskSpeedTier} disk`);
  console.log(`Analysis limits: warn at ${analysisLimits.warningDirectorySize} files/dir, batch size ${analysisLimits.batchSize}`);
  
  const startTime = Date.now();
  
  try {
    let files: FileItem[] = [];
    let apps: FileItem[] = [];
    let configurations: FileItem[] = [];
    
    const [filesResult, appsResult, configurationsResult] = await Promise.allSettled([
      analyzeUserFiles(),
      analyzeApplications(),
      analyzeConfigurations()
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
    console.log(`Analysis completed: ${fileCounter} items in ${duration.toFixed(2)}s`);
    
    return result;
  } catch (error) {
    console.error('Analysis error:', error);
    return {
      files: [],
      apps: [],
      configurations: [],
    };
  }
};
