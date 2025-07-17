export interface FileItem {
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

export interface AnalysisWarning {
  type: 'large_directory' | 'slow_directory' | 'permission_denied';
  path: string;
  details: string;
  fileCount?: number;
  canExclude: boolean;
}

export interface AnalysisProgress {
  phase: 'files' | 'apps' | 'configurations';
  current: number;
  total: number;
  currentPath?: string;
  warning?: AnalysisWarning;
}

export interface SystemAnalysisResult {
  files: FileItem[];
  apps: FileItem[];
  configurations: FileItem[];
}

export interface ConfigPattern {
  pattern: RegExp;
  type: string;
}

export interface DeviceSpecs {
  totalMemoryGB: number;
  availableMemoryGB: number;
  cpuCores: number;
  diskSpeedTier: 'slow' | 'medium' | 'fast';
}

export interface AnalysisLimits {
  maxDepth: number;
  batchSize: number;
  progressUpdateInterval: number;
  largeSizeThreshold: number;
  warningDirectorySize: number;
  slowDirectoryThreshold: number;
}

export interface ExclusionManager {
  excludedPaths: Set<string>;
  addExclusion: (path: string) => void;
  removeExclusion: (path: string) => void;
  isExcluded: (path: string) => boolean;
}
