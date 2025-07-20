/**
 * System Analysis Module Index
 *
 * This file provides centralized access to all system analysis modules
 * for better organization and easier imports.
 */

// Core orchestrator
export { default as AnalysisOrchestrator } from './core/orchestrator';

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
  cleanupExclusionManager,
} from './managers/exclusion';

export {
  setProgressCallback,
  clearProgressCallback,
  setAnalysisLimits,
  resetProgressCounter,
  updateProgress,
  sendProgress,
  getProgressUpdateCounter,
  incrementProgressCounter,
} from './managers/manager';

// Processors
export {
  processConcurrentOperations,
  processBatch,
  processWithControlledConcurrency,
} from './processors/concurrent';

// Utilities
export {
  generateFileId,
  getFileExtension,
  resetFileCounter,
  getFileCounter,
  isExecutableFile,
  formatFileSize,
  cleanupFileUtils,
} from './utils/file-utils';

// File Service
export {
  isDirectoryAccessible,
  safeReaddir,
  safeStat,
  readdir,
  stat,
  access,
} from './service/file.service';

// Error Service
export {
  safeExecute,
  CircuitBreaker,
  createCircuitBreaker,
  withErrorRecovery,
  CircuitBreakerOptions,
} from './service/error.service';

// Retry Service
export { withRetry, RetryOptions } from './service/retry.service';

export {
  logError,
  logOperationStart,
  logOperationSuccess,
  logOperationRetry,
  logPerformanceMetrics,
  logSystemResources,
  LogContext,
  ErrorSeverity,
} from './utils/logging';

// Analyzers
export { scanDirectory, scanDirectories } from './analyzers/directory-scanner';

export {
  analyzeApplications,
  scanPortableApps,
} from './analyzers/applications-scanner';

export {
  analyzeConfigurations,
  scanUserConfigurations,
  getConfigurationPatterns,
} from './analyzers/configurations-scanner';

export type {
  FileItem,
  AnalysisProgress,
  SystemAnalysisResult,
  AnalysisLimits,
  AnalysisWarning,
  ExclusionManager,
} from '../types/analysis-types';
