import { EXCLUDE_PATTERNS } from '../../config';
import { ExclusionManager } from '../../types/analysis-types';

let exclusionManager: ExclusionManager;

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

export const initializeExclusionManager = (): void => {
  exclusionManager = createExclusionManager();
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