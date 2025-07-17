import log from 'electron-log';
import { detectDeviceSpecs, calculateOptimalLimits } from '../../utils';
import { getUserDirectories } from '../../config';
import { 
  initializeExclusionManager, 
  addDirectoryExclusion, 
  removeDirectoryExclusion, 
  getExcludedDirectories 
} from '../managers/exclusion-manager';
import { 
  setProgressCallback, 
  clearProgressCallback, 
  setAnalysisLimits, 
  resetProgressCounter 
} from '../managers/progress-manager';
import { resetFileCounter } from '../utils/file-utils';
import { scanDirectories } from '../analyzers/directory-scanner';
import { analyzeApplications } from '../analyzers/applications-scanner';
import { analyzeConfigurations } from '../analyzers/configurations-scanner';
import { 
  AnalysisProgress, 
  SystemAnalysisResult, 
  AnalysisLimits 
} from '../../types/analysis-types';

/**
 * Main analysis orchestrator that coordinates all system analysis modules
 */
export class AnalysisOrchestrator {
  private analysisLimits: AnalysisLimits | null = null;
  private isInitialized = false;

  /**
   * Initializes the analysis orchestrator with device-specific settings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize exclusion manager
      initializeExclusionManager();

      // Detect device specifications and calculate optimal limits
      const deviceSpecs = await detectDeviceSpecs();
      this.analysisLimits = calculateOptimalLimits(deviceSpecs);

      // Set analysis limits for progress manager
      setAnalysisLimits(this.analysisLimits);

      // Reset counters
      resetProgressCounter();
      resetFileCounter();

      // Log initialization info
      log.info(
        `Device specs: ${deviceSpecs.cpuCores} cores, ${deviceSpecs.availableMemoryGB.toFixed(1)}GB RAM, ${deviceSpecs.diskSpeedTier} disk`,
      );
      log.info(
        `Analysis limits: warn at ${this.analysisLimits.warningDirectorySize} files/dir, batch size ${this.analysisLimits.batchSize}, concurrency level ${this.analysisLimits.concurrencyLevel}`,
      );

      this.isInitialized = true;
    } catch (error) {
      log.error('Failed to initialize analysis orchestrator:', error);
      throw error;
    }
  }

  /**
   * Sets the progress callback for analysis updates
   * @param callback - Progress callback function
   */
  setProgressCallback(callback: (progress: AnalysisProgress) => void): void {
    setProgressCallback(callback);
  }

  /**
   * Clears the progress callback
   */
  clearProgressCallback(): void {
    clearProgressCallback();
  }

  /**
   * Adds a directory to the exclusion list
   * @param path - Directory path to exclude
   */
  addDirectoryExclusion(path: string): void {
    addDirectoryExclusion(path);
  }

  /**
   * Removes a directory from the exclusion list
   * @param path - Directory path to remove from exclusions
   */
  removeDirectoryExclusion(path: string): void {
    removeDirectoryExclusion(path);
  }

  /**
   * Gets the list of excluded directories
   * @returns Array of excluded directory paths
   */
  getExcludedDirectories(): string[] {
    return getExcludedDirectories();
  }

  /**
   * Gets the current analysis limits
   * @returns Analysis limits configuration
   */
  getAnalysisLimits(): AnalysisLimits | null {
    return this.analysisLimits;
  }

  /**
   * Analyzes user files in configured directories
   * @returns Promise resolving to array of user file items
   */
  async analyzeUserFiles(): Promise<import('../../types/analysis-types').FileItem[]> {
    if (!this.isInitialized || !this.analysisLimits) {
      throw new Error('Analysis orchestrator not initialized');
    }

    const userDirs = getUserDirectories();
    return await scanDirectories(userDirs, this.analysisLimits);
  }

  /**
   * Analyzes installed applications
   * @returns Promise resolving to array of application file items
   */
  async analyzeApplications(): Promise<import('../../types/analysis-types').FileItem[]> {
    if (!this.isInitialized || !this.analysisLimits) {
      throw new Error('Analysis orchestrator not initialized');
    }

    return await analyzeApplications(this.analysisLimits);
  }

  /**
   * Analyzes system configuration files
   * @returns Promise resolving to array of configuration file items
   */
  async analyzeConfigurations(): Promise<import('../../types/analysis-types').FileItem[]> {
    if (!this.isInitialized || !this.analysisLimits) {
      throw new Error('Analysis orchestrator not initialized');
    }

    return await analyzeConfigurations(this.analysisLimits);
  }

  /**
   * Performs a complete system analysis
   * @returns Promise resolving to system analysis result
   */
  async performCompleteAnalysis(): Promise<SystemAnalysisResult> {
    if (!this.isInitialized || !this.analysisLimits) {
      throw new Error('Analysis orchestrator not initialized');
    }

    const startTime = Date.now();
    
    try {
      // Reset counters for new analysis
      resetProgressCounter();
      resetFileCounter();

      // Perform all analysis tasks concurrently
      const [filesResult, appsResult, configurationsResult] = await Promise.allSettled([
        this.analyzeUserFiles(),
        this.analyzeApplications(),
        this.analyzeConfigurations(),
      ]);

      // Extract results, defaulting to empty arrays on failure
      const files = filesResult.status === 'fulfilled' ? filesResult.value : [];
      const apps = appsResult.status === 'fulfilled' ? appsResult.value : [];
      const configurations = configurationsResult.status === 'fulfilled' ? configurationsResult.value : [];

      // Log any failures
      if (filesResult.status === 'rejected') {
        log.error('User files analysis failed:', filesResult.reason);
      }
      if (appsResult.status === 'rejected') {
        log.error('Applications analysis failed:', appsResult.reason);
      }
      if (configurationsResult.status === 'rejected') {
        log.error('Configurations analysis failed:', configurationsResult.reason);
      }

      const result: SystemAnalysisResult = {
        files,
        apps,
        configurations,
      };

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const totalItems = files.length + apps.length + configurations.length;
      
      log.info(
        `Analysis completed: ${totalItems} items in ${duration.toFixed(2)}s`,
      );

      return result;
    } catch (error) {
      log.error('Complete analysis failed:', error);
      throw error;
    }
  }

  /**
   * Performs selective analysis based on specified types
   * @param types - Array of analysis types to perform
   * @returns Promise resolving to system analysis result
   */
  async performSelectiveAnalysis(
    types: Array<'files' | 'apps' | 'configurations'>,
  ): Promise<Partial<SystemAnalysisResult>> {
    if (!this.isInitialized || !this.analysisLimits) {
      throw new Error('Analysis orchestrator not initialized');
    }

    const startTime = Date.now();
    const result: Partial<SystemAnalysisResult> = {};

    try {
      // Reset counters for new analysis
      resetProgressCounter();
      resetFileCounter();

      // Create promises for requested analysis types
      const promises: Promise<any>[] = [];
      const promiseTypes: Array<'files' | 'apps' | 'configurations'> = [];

      if (types.includes('files')) {
        promises.push(this.analyzeUserFiles());
        promiseTypes.push('files');
      }

      if (types.includes('apps')) {
        promises.push(this.analyzeApplications());
        promiseTypes.push('apps');
      }

      if (types.includes('configurations')) {
        promises.push(this.analyzeConfigurations());
        promiseTypes.push('configurations');
      }

      // Execute selected analyses
      const results = await Promise.allSettled(promises);

      // Map results back to the result object
      results.forEach((promiseResult, index) => {
        const type = promiseTypes[index];
        if (promiseResult.status === 'fulfilled') {
          result[type] = promiseResult.value;
        } else {
          log.error(`${type} analysis failed:`, promiseResult.reason);
          result[type] = [];
        }
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      log.info(
        `Selective analysis completed for [${types.join(', ')}] in ${duration.toFixed(2)}s`,
      );

      return result;
    } catch (error) {
      log.error('Selective analysis failed:', error);
      throw error;
    }
  }

  /**
   * Resets the orchestrator state for a new analysis session
   */
  reset(): void {
    clearProgressCallback();
    resetProgressCounter();
    resetFileCounter();
    this.isInitialized = false;
    this.analysisLimits = null;
  }
} 