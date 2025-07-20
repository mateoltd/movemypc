import { AnalysisProgress, AnalysisLimits } from '../../types/analysis-types';

let progressCallback: ((progress: AnalysisProgress) => void) | null = null;
let progressUpdateCounter = 0;
let analysisLimits: AnalysisLimits;

export const setProgressCallback = (
  callback: (progress: AnalysisProgress) => void,
): void => {
  progressCallback = callback;
};

export const clearProgressCallback = (): void => {
  progressCallback = null;
};

export const setAnalysisLimits = (limits: AnalysisLimits): void => {
  analysisLimits = limits;
};

export const resetProgressCounter = (): void => {
  progressUpdateCounter = 0;
};

export const updateProgress = (
  phase: 'files' | 'apps' | 'configurations',
  currentItemCount: number,
  currentPath?: string,
): void => {
  progressUpdateCounter += 1;
  if (
    progressCallback &&
    progressUpdateCounter % analysisLimits.progressUpdateInterval === 0
  ) {
    progressCallback({
      phase,
      current: currentItemCount,
      total: -1,
      currentPath,
    });
  }
};

export const sendProgress = (progress: AnalysisProgress): void => {
  if (progressCallback) {
    progressCallback(progress);
  }
};

export const getProgressUpdateCounter = (): number => {
  return progressUpdateCounter;
};

export const incrementProgressCounter = (): void => {
  progressUpdateCounter += 1;
};
