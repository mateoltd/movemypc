import log from 'electron-log';
import { EXCLUDE_PATTERNS } from '../../config';
import { ExclusionManager } from '../../types/analysis-types';

let exclusionManager: ExclusionManager;
let isCleanupRegistered = false;

export const createExclusionManager = (): ExclusionManager => {
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

/**
 * Cleanup function to be called when analysis is complete or interrupted
 */
export const cleanupExclusionManager = (): void => {
  if (exclusionManager) {
    exclusionManager.excludedPaths.clear();
    log.debug('Exclusion manager cleanup completed');
  }
};

/**
 * Registers cleanup handlers for process termination
 */
const registerCleanupHandlers = (): void => {
  if (isCleanupRegistered) {
    return;
  }

  const cleanup = () => {
    log.info('Cleaning up exclusion manager state...');
    cleanupExclusionManager();
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception in exclusion manager:', error);
    cleanup();
  });

  isCleanupRegistered = true;
};

export const initializeExclusionManager = (): void => {
  exclusionManager = createExclusionManager();
  registerCleanupHandlers();
  log.debug('Exclusion manager initialized');
};

export const getExclusionManager = (): ExclusionManager => {
  if (!exclusionManager) {
    initializeExclusionManager();
  }
  return exclusionManager;
};

export const addDirectoryExclusion = (path: string): void => {
  if (exclusionManager) {
    exclusionManager.addExclusion(path);
  }
};

export const removeDirectoryExclusion = (path: string): void => {
  if (exclusionManager) {
    exclusionManager.removeExclusion(path);
  }
};

export const getExcludedDirectories = (): string[] => {
  return exclusionManager ? Array.from(exclusionManager.excludedPaths) : [];
};

export const shouldExcludePath = (path: string): boolean => {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(path));
};

export const isPathExcluded = (path: string): boolean => {
  if (!exclusionManager) {
    return false;
  }
  return exclusionManager.isExcluded(path);
};
