import log from 'electron-log';
import { isDirectoryAccessible } from '../utils/file-utils';
import { sendProgress } from '../managers/manager';
import { processConcurrentOperations } from '../processors/concurrent';
import { scanDirectory } from './directory-scanner';
import { getConfigurationDirectories, CONFIG_PATTERNS } from '../../config';
import { FileItem, AnalysisLimits } from '../../types/analysis-types';

/**
 * Filters files to find configuration files based on patterns
 * @param files - Array of file items to filter
 * @returns Array of configuration file items
 */
const filterConfigurationFiles = (files: FileItem[]): FileItem[] => {
  const configFiles: FileItem[] = [];

  const checkFileForConfig = (file: FileItem): void => {
    if (file.type === 'file') {
      const matchesPattern = CONFIG_PATTERNS.some((pattern) =>
        pattern.pattern.test(file.name.toLowerCase()),
      );

      if (matchesPattern) {
        configFiles.push(file);
      }
    }

    // Recursively check children if it's a folder
    if (file.type === 'folder' && file.children) {
      file.children.forEach(checkFileForConfig);
    }
  };

  files.forEach(checkFileForConfig);
  return configFiles;
};

/**
 * Processes a single configuration directory
 * @param configDir - Configuration directory path
 * @param index - Directory index for progress tracking
 * @param total - Total number of directories
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of configuration file items
 */
const processConfigDir = async (
  configDir: string,
  index: number,
  total: number,
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const dirConfigs: FileItem[] = [];

  sendProgress({
    phase: 'configurations',
    current: index,
    total,
    currentPath: configDir,
  });

  const isAccessible = await isDirectoryAccessible(configDir);
  if (!isAccessible) {
    return dirConfigs;
  }

  try {
    const files = await scanDirectory(configDir, analysisLimits);
    const configFiles = filterConfigurationFiles(files);
    dirConfigs.push(...configFiles);
  } catch (error: any) {
    const errorCode = error.code || 'UNKNOWN';
    const errorMessage = error.message || 'Unknown error';

    switch (errorCode) {
      case 'EACCES':
        log.warn(
          `Permission denied scanning configuration directory: ${configDir}`,
        );
        break;
      case 'ENOENT':
        log.warn(`Configuration directory no longer exists: ${configDir}`);
        break;
      case 'EMFILE':
      case 'ENFILE':
        log.error(
          `Too many open files when scanning configuration directory: ${configDir}`,
        );
        break;
      default:
        log.warn(
          `Failed to scan configuration directory ${configDir} (${errorCode}): ${errorMessage}`,
        );
    }
  }

  return dirConfigs;
};

/**
 * Analyzes system configuration files
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of configuration file items
 */
export const analyzeConfigurations = async (
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const configDirs = getConfigurationDirectories();
  const configs: FileItem[] = [];

  sendProgress({
    phase: 'configurations',
    current: 0,
    total: configDirs.length,
  });

  const configDirResults = await processConcurrentOperations(
    configDirs.map((dir, index) => ({ dir, index })),
    async ({ dir, index }) =>
      processConfigDir(dir, index, configDirs.length, analysisLimits),
    analysisLimits.concurrencyLevel,
  );

  configDirResults.forEach((result) => {
    if (Array.isArray(result)) {
      configs.push(...result);
    }
  });

  return configs;
};

/**
 * Scans for configuration files in user-specified directories
 * @param directories - Array of directory paths to scan
 * @param analysisLimits - Analysis limits configuration
 * @returns Promise resolving to array of configuration file items
 */
export const scanUserConfigurations = async (
  directories: string[],
  analysisLimits: AnalysisLimits,
): Promise<FileItem[]> => {
  const userConfigs: FileItem[] = [];

  const scanUserConfigDir = async (dir: string): Promise<FileItem[]> => {
    const configs: FileItem[] = [];

    const isAccessible = await isDirectoryAccessible(dir);
    if (!isAccessible) {
      return configs;
    }

    try {
      const files = await scanDirectory(dir, analysisLimits);
      const configFiles = filterConfigurationFiles(files);
      configs.push(...configFiles);
    } catch (error: any) {
      const errorCode = error.code || 'UNKNOWN';
      const errorMessage = error.message || 'Unknown error';

      switch (errorCode) {
        case 'EACCES':
          log.warn(
            `Permission denied scanning user configuration directory: ${dir}`,
          );
          break;
        case 'ENOENT':
          log.warn(`User configuration directory no longer exists: ${dir}`);
          break;
        case 'EMFILE':
        case 'ENFILE':
          log.error(
            `Too many open files when scanning user configuration directory: ${dir}`,
          );
          break;
        default:
          log.warn(
            `Failed to scan user configuration directory ${dir} (${errorCode}): ${errorMessage}`,
          );
      }
    }

    return configs;
  };

  const results = await processConcurrentOperations(
    directories,
    scanUserConfigDir,
    analysisLimits.concurrencyLevel,
  );

  results.forEach((result) => {
    if (Array.isArray(result)) {
      userConfigs.push(...result);
    }
  });

  return userConfigs;
};

/**
 * Gets configuration patterns for external use
 * @returns Array of configuration patterns
 */
export const getConfigurationPatterns = () => {
  return CONFIG_PATTERNS;
};
