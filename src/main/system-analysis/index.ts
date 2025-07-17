/**
 * System Analysis Module Index
 * 
 * This file provides centralized access to all system analysis modules
 * for better organization and easier imports.
 */

// Core orchestrator
export { AnalysisOrchestrator } from './core/analysis-orchestrator';

// Managers
export {
  createExclusionManager,
  initializeExclusionManager,
  getExclusionManager,
  addDirectoryExclusion,
  removeDirectoryExclusion,
  getExcludedDirectories,
  shouldExcludePath,
  isPathExcluded,
} from './managers/exclusion-manager';

export {
  setProgressCallback,
  clearProgressCallback,
  setAnalysisLimits,
  resetProgressCounter,
  updateProgress,
  sendProgress,
  getProgressUpdateCounter,
  incrementProgressCounter,
} from './managers/progress-manager';

// Processors
export {
  processConcurrentOperations,
  processBatch,
  processWithControlledConcurrency,
} from './processors/concurrent-processor';

// Utilities
export {
  generateFileId,
  getFileExtension,
  isDirectoryAccessible,
  safeReaddir,
  safeStat,
  resetFileCounter,
  getFileCounter,
  isExecutableFile,
  formatFileSize,
  readdir,
  stat,
  access,
} from './utils/file-utils';

// Analyzers
export {
  scanDirectory,
  scanDirectories,
} from './analyzers/directory-scanner';

export {
  analyzeApplications,
  scanPortableApps,
} from './analyzers/applications-scanner';

export {
  analyzeConfigurations,
  scanUserConfigurations,
  getConfigurationPatterns,
} from './analyzers/configurations-scanner';

// Re-export types for convenience
export type {
  FileItem,
  AnalysisProgress,
  SystemAnalysisResult,
  AnalysisLimits,
  AnalysisWarning,
  ExclusionManager,
} from '../types/analysis-types'; 