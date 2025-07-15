import { homedir } from 'os';
import { join, extname, dirname, basename } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

interface FileItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  children?: FileItem[];
  parent?: string;
  modifiedDate?: Date;
  extension?: string;
}

interface AnalysisProgress {
  phase: 'files' | 'apps' | 'configurations';
  current: number;
  total: number;
  currentPath?: string;
}

interface SystemAnalysisResult {
  files: FileItem[];
  apps: FileItem[];
  configurations: FileItem[];
}

// Configuration for analysis
const ANALYSIS_CONFIG = {
  maxDepth: 5,
  excludePatterns: [
    /node_modules/,
    /\.git/,
    /AppData\/Local\/Temp/,
    /System Volume Information/,
    /\$Recycle\.Bin/,
    /Windows\/System32/,
    /Program Files\/Windows/,
    /\.tmp$/,
    /\.temp$/,
    /cache/i,
    /logs?/i,
  ],
  fileSizeLimit: 1024 * 1024 * 1024, // 1GB
  maxFilesPerDirectory: 1000,
  batchSize: 100, // Process files in batches
  progressUpdateInterval: 50, // Update progress every N files
};

// Common application directories
const APP_DIRECTORIES = [
  join(process.env.PROGRAMFILES || 'C:\\Program Files'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'),
  join(homedir(), 'AppData', 'Local'),
  join(homedir(), 'AppData', 'Roaming'),
];

// Configuration file patterns
const CONFIG_PATTERNS = [
  { pattern: /\.config$/, type: 'Application Config' },
  { pattern: /\.ini$/, type: 'INI File' },
  { pattern: /\.json$/, type: 'JSON Config' },
  { pattern: /\.xml$/, type: 'XML Config' },
  { pattern: /\.yaml$/, type: 'YAML Config' },
  { pattern: /\.yml$/, type: 'YAML Config' },
  { pattern: /\.toml$/, type: 'TOML Config' },
  { pattern: /\.properties$/, type: 'Properties File' },
  { pattern: /\.conf$/, type: 'Configuration File' },
  { pattern: /\.cfg$/, type: 'Configuration File' },
];

let progressCallback: ((progress: AnalysisProgress) => void) | null = null;
let fileCounter = 0;
let progressUpdateCounter = 0;

export const setProgressCallback = (callback: (progress: AnalysisProgress) => void) => {
  progressCallback = callback;
};

const shouldExcludePath = (path: string): boolean => {
  return ANALYSIS_CONFIG.excludePatterns.some(pattern => pattern.test(path));
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
  if (progressCallback && progressUpdateCounter % ANALYSIS_CONFIG.progressUpdateInterval === 0) {
    progressCallback({
      phase,
      current: fileCounter,
      total: -1, // Unknown total
      currentPath
    });
  }
};

const processBatch = async <T>(items: T[], processor: (item: T) => Promise<any>): Promise<any[]> => {
  const results: any[] = [];
  
  for (let i = 0; i < items.length; i += ANALYSIS_CONFIG.batchSize) {
    const batch = items.slice(i, i + ANALYSIS_CONFIG.batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    
    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    });
    
    // Allow other operations to run between batches
    await new Promise(resolve => setImmediate(resolve));
  }
  
  return results;
};

const scanDirectory = async (
  dirPath: string,
  depth: number = 0,
  parentId?: string
): Promise<FileItem[]> => {
  if (depth > ANALYSIS_CONFIG.maxDepth || shouldExcludePath(dirPath)) {
    return [];
  }

  const items: FileItem[] = [];
  
  try {
    // Check if we have read access to the directory
    await access(dirPath, fs.constants.R_OK);
    
    let entries: string[] = [];
    try {
      entries = await readdir(dirPath);
    } catch (readdirError) {
      console.warn(`Cannot read directory ${dirPath}:`, readdirError);
      return [];
    }
    
    if (entries.length > ANALYSIS_CONFIG.maxFilesPerDirectory) {
      console.warn(`Directory ${dirPath} has too many files (${entries.length}), limiting to ${ANALYSIS_CONFIG.maxFilesPerDirectory}`);
    }

    const limitedEntries = entries.slice(0, ANALYSIS_CONFIG.maxFilesPerDirectory);
    
    // Process entries in batches to avoid memory issues
    const processEntry = async (entry: string): Promise<FileItem | null> => {
      const fullPath = join(dirPath, entry);
      
      if (shouldExcludePath(fullPath)) {
        return null;
      }

      try {
        let stats;
        try {
          stats = await stat(fullPath);
        } catch (statError) {
          console.warn(`Cannot stat ${fullPath}:`, statError);
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

          // Recursively scan subdirectory with error handling
          try {
            const children = await scanDirectory(fullPath, depth + 1, id);
            folderItem.children = children;
          } catch (recursiveError) {
            console.warn(`Error scanning subdirectory ${fullPath}:`, recursiveError);
            folderItem.children = [];
          }
          
          return folderItem;
        } else if (stats.isFile()) {
          if (stats.size > ANALYSIS_CONFIG.fileSizeLimit) {
            console.warn(`File ${fullPath} is too large (${stats.size} bytes), skipping`);
            return null;
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
        console.warn(`Error processing item ${fullPath}:`, itemError);
        return null;
      }
      
      return null;
    };

    const processedItems = await processBatch(limitedEntries, processEntry);
    items.push(...processedItems.filter(item => item !== null));
    
  } catch (accessError) {
    console.warn(`Cannot access directory ${dirPath}:`, accessError);
  }

  return items;
};

const analyzeUserFiles = async (): Promise<FileItem[]> => {
  const userDirs = [
    join(homedir(), 'Documents'),
    join(homedir(), 'Pictures'),
    join(homedir(), 'Videos'),
    join(homedir(), 'Music'),
    join(homedir(), 'Downloads'),
    join(homedir(), 'Desktop'),
  ];

  const allFiles: FileItem[] = [];
  
  // Process directories in parallel for better performance
  const processDirResults = await Promise.allSettled(
    userDirs.map(async (dir) => {
      try {
        await access(dir, fs.constants.R_OK);
        return await scanDirectory(dir);
      } catch (error) {
        console.warn(`Cannot access user directory ${dir}:`, error);
        return [];
      }
    })
  );

  processDirResults.forEach(result => {
    if (result.status === 'fulfilled') {
      allFiles.push(...result.value);
    }
  });

  return allFiles;
};

const analyzeApplications = async (): Promise<FileItem[]> => {
  const apps: FileItem[] = [];
  
  if (progressCallback) {
    progressCallback({ phase: 'apps', current: 0, total: APP_DIRECTORIES.length });
  }

  const processAppDir = async (appDir: string, index: number): Promise<FileItem[]> => {
    const dirApps: FileItem[] = [];
    
    if (progressCallback) {
      progressCallback({ 
        phase: 'apps', 
        current: index, 
        total: APP_DIRECTORIES.length,
        currentPath: appDir 
      });
    }

    try {
      await access(appDir, fs.constants.R_OK);
      
      let entries: string[] = [];
      try {
        entries = await readdir(appDir);
      } catch (readdirError) {
        console.warn(`Cannot read app directory ${appDir}:`, readdirError);
        return dirApps;
      }
      
      // Process app entries in batches
      const processAppEntry = async (entry: string): Promise<FileItem | null> => {
        const fullPath = join(appDir, entry);
        
        try {
          let stats;
          try {
            stats = await stat(fullPath);
          } catch (statError) {
            console.warn(`Cannot stat app ${fullPath}:`, statError);
            return null;
          }
          
          if (stats.isDirectory()) {
            try {
              // Look for executable files in the app directory
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
              console.warn(`Cannot read app directory contents ${fullPath}:`, appDirError);
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
          console.warn(`Error processing app ${fullPath}:`, appError);
        }
        
        return null;
      };

      const limitedEntries = entries.slice(0, 100); // Limit to first 100 apps
      const processedApps = await processBatch(limitedEntries, processAppEntry);
      dirApps.push(...processedApps.filter(app => app !== null));
      
    } catch (accessError) {
      console.warn(`Cannot access app directory ${appDir}:`, accessError);
    }

    return dirApps;
  };

  // Process app directories in parallel
  const appDirResults = await Promise.allSettled(
    APP_DIRECTORIES.map((dir, index) => processAppDir(dir, index))
  );

  appDirResults.forEach(result => {
    if (result.status === 'fulfilled') {
      apps.push(...result.value);
    }
  });

  return apps;
};

const analyzeConfigurations = async (): Promise<FileItem[]> => {
  const configs: FileItem[] = [];
  
  const configDirs = [
    join(homedir(), 'AppData', 'Roaming'),
    join(homedir(), 'AppData', 'Local'),
    join(homedir(), '.config'),
    join(homedir()),
  ];

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
        console.warn(`Error scanning config directory ${configDir}:`, scanError);
        return dirConfigs;
      }
      
      // Filter for configuration files
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
      console.warn(`Cannot access config directory ${configDir}:`, accessError);
    }

    return dirConfigs;
  };

  // Process config directories in parallel
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
  
  const startTime = Date.now();
  
  try {
    console.log('Starting comprehensive system analysis...');
    
    let files: FileItem[] = [];
    let apps: FileItem[] = [];
    let configurations: FileItem[] = [];
    
    // Run all analysis phases in parallel for better performance
    const [filesResult, appsResult, configurationsResult] = await Promise.allSettled([
      analyzeUserFiles(),
      analyzeApplications(),
      analyzeConfigurations()
    ]);
    
    if (filesResult.status === 'fulfilled') {
      files = filesResult.value;
      console.log(`Found ${files.length} user files`);
    } else {
      console.error('Error analyzing user files:', filesResult.reason);
    }
    
    if (appsResult.status === 'fulfilled') {
      apps = appsResult.value;
      console.log(`Found ${apps.length} applications`);
    } else {
      console.error('Error analyzing applications:', appsResult.reason);
    }
    
    if (configurationsResult.status === 'fulfilled') {
      configurations = configurationsResult.value;
      console.log(`Found ${configurations.length} configuration files`);
    } else {
      console.error('Error analyzing configurations:', configurationsResult.reason);
    }
    
    const result = {
      files,
      apps,
      configurations,
    };
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`System analysis completed successfully in ${duration.toFixed(2)} seconds`);
    console.log(`Total items processed: ${fileCounter}`);
    
    return result;
  } catch (error) {
    console.error('Critical error during system analysis:', error);
    // Return partial results even on error
    return {
      files: [],
      apps: [],
      configurations: [],
    };
  }
};
