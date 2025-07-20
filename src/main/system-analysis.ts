/**
 * System Analysis - Main Entry Point
 *
 * This file serves as the main entry point for system analysis functionality.
 * It now delegates to the modular architecture under ./system-analysis/ for better maintainability.
 *
 * Architecture:
 * - managers/: Progress tracking, exclusion management
 * - processors/: Concurrent processing utilities
 * - analyzers/: Directory, application, and configuration scanners
 * - utils/: File system utilities and helpers
 * - core/: Main orchestrator that coordinates all modules
 */

import AnalysisOrchestrator from './system-analysis/core/orchestrator';
import { AnalysisProgress, SystemAnalysisResult } from './types/analysis-types';

// Global orchestrator instance
let globalOrchestrator: AnalysisOrchestrator | null = null;

/**
 * Gets or creates the global analysis orchestrator instance
 * @returns AnalysisOrchestrator instance
 */
const getOrchestrator = (): AnalysisOrchestrator => {
  if (!globalOrchestrator) {
    globalOrchestrator = new AnalysisOrchestrator();
  }
  return globalOrchestrator;
};

/**
 * Sets the progress callback for analysis updates
 * @param callback - Progress callback function
 */
export const setProgressCallback = (
  callback: (progress: AnalysisProgress) => void,
): void => {
  const orchestrator = getOrchestrator();
  orchestrator.setProgressCallback(callback);
};

/**
 * Adds a directory to the exclusion list
 * @param path - Directory path to exclude
 */
export const addDirectoryExclusion = (path: string): void => {
  const orchestrator = getOrchestrator();
  orchestrator.addDirectoryExclusion(path);
};

/**
 * Removes a directory from the exclusion list
 * @param path - Directory path to remove from exclusions
 */
export const removeDirectoryExclusion = (path: string): void => {
  const orchestrator = getOrchestrator();
  orchestrator.removeDirectoryExclusion(path);
};

/**
 * Gets the list of excluded directories
 * @returns Array of excluded directory paths
 */
export const getExcludedDirectories = (): string[] => {
  const orchestrator = getOrchestrator();
  return orchestrator.getExcludedDirectories();
};

/**
 * Performs a complete system analysis
 * This is the main entry point for system analysis functionality
 * @returns Promise resolving to system analysis result
 */
export const analyzeSystem = async (): Promise<SystemAnalysisResult> => {
  const orchestrator = getOrchestrator();

  try {
    // Initialize the orchestrator if not already initialized
    await orchestrator.initialize();

    // Perform complete analysis
    return await orchestrator.performCompleteAnalysis();
  } catch (error) {
    // Reset orchestrator state on error
    orchestrator.reset();
    throw error;
  }
};

/**
 * Performs selective analysis for specific types
 * @param types - Array of analysis types to perform ('files', 'apps', 'configurations')
 * @returns Promise resolving to partial system analysis result
 */
export const analyzeSystemSelective = async (
  types: Array<'files' | 'apps' | 'configurations'>,
): Promise<Partial<SystemAnalysisResult>> => {
  const orchestrator = getOrchestrator();

  try {
    // Initialize the orchestrator if not already initialized
    await orchestrator.initialize();

    // Perform selective analysis
    return await orchestrator.performSelectiveAnalysis(types);
  } catch (error) {
    // Reset orchestrator state on error
    orchestrator.reset();
    throw error;
  }
};

/**
 * Analyzes only user files
 * @returns Promise resolving to array of user file items
 */
export const analyzeUserFiles = async (): Promise<
  import('./types/analysis-types').FileItem[]
> => {
  const orchestrator = getOrchestrator();

  try {
    await orchestrator.initialize();
    return await orchestrator.analyzeUserFiles();
  } catch (error) {
    orchestrator.reset();
    throw error;
  }
};

/**
 * Analyzes only installed applications
 * @returns Promise resolving to array of application file items
 */
export const analyzeApplications = async (): Promise<
  import('./types/analysis-types').FileItem[]
> => {
  const orchestrator = getOrchestrator();

  try {
    await orchestrator.initialize();
    return await orchestrator.analyzeApplications();
  } catch (error) {
    orchestrator.reset();
    throw error;
  }
};

/**
 * Analyzes only system configuration files
 * @returns Promise resolving to array of configuration file items
 */
export const analyzeConfigurations = async (): Promise<
  import('./types/analysis-types').FileItem[]
> => {
  const orchestrator = getOrchestrator();

  try {
    await orchestrator.initialize();
    return await orchestrator.analyzeConfigurations();
  } catch (error) {
    orchestrator.reset();
    throw error;
  }
};

/**
 * Resets the analysis system state
 * Useful for clearing caches, exclusions, and preparing for a fresh analysis
 */
export const resetAnalysisSystem = (): void => {
  if (globalOrchestrator) {
    globalOrchestrator.reset();
    globalOrchestrator = null;
  }
};

/**
 * Gets the current analysis limits configuration
 * @returns Analysis limits or null if not initialized
 */
export const getAnalysisLimits = () => {
  const orchestrator = getOrchestrator();
  return orchestrator.getAnalysisLimits();
};

// Export types for external use
export type {
  AnalysisProgress,
  SystemAnalysisResult,
  FileItem,
  AnalysisLimits,
  AnalysisWarning,
  ExclusionManager,
} from './types/analysis-types';
