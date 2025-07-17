import { totalmem, freemem, cpus } from 'os';
import * as fs from 'fs';
import { DeviceSpecs, AnalysisLimits } from '../types/analysis-types';

export const detectDeviceSpecs = async (): Promise<DeviceSpecs> => {
  const totalMemoryBytes = totalmem();
  const freeMemoryBytes = freemem();
  const totalMemoryGB = totalMemoryBytes / (1024 ** 3);
  const availableMemoryGB = freeMemoryBytes / (1024 ** 3);
  const cpuCores = cpus().length;
  
  const diskSpeedTier = await detectDiskSpeed();
  
  return {
    totalMemoryGB,
    availableMemoryGB,
    cpuCores,
    diskSpeedTier,
  };
};

const detectDiskSpeed = async (): Promise<'slow' | 'medium' | 'fast'> => {
  try {
    const testFile = 'temp_speed_test.tmp';
    const testData = Buffer.alloc(1024 * 1024, 'a');
    
    const startTime = Date.now();
    await fs.promises.writeFile(testFile, testData);
    await fs.promises.readFile(testFile);
    await fs.promises.unlink(testFile);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    
    if (duration < 50) return 'fast';
    if (duration < 200) return 'medium';
    return 'slow';
  } catch {
    return 'medium';
  }
};

export const calculateOptimalLimits = (specs: DeviceSpecs): AnalysisLimits => {
  const baseMultiplier = Math.min(specs.cpuCores / 4, 3);
  const memoryMultiplier = Math.min(specs.availableMemoryGB / 4, 2);
  const diskMultiplier = specs.diskSpeedTier === 'fast' ? 2 : specs.diskSpeedTier === 'medium' ? 1.5 : 1;
  
  const performanceScore = baseMultiplier * memoryMultiplier * diskMultiplier;
  
  const batchSize = Math.min(
    Math.max(50, Math.floor(200 * performanceScore)),
    1000
  );
  
  const progressUpdateInterval = Math.max(25, Math.floor(100 / performanceScore));
  
  const warningDirectorySize = Math.max(50000, Math.floor(100000 * performanceScore));
  const slowDirectoryThreshold = Math.max(20000, Math.floor(50000 * performanceScore));
  
  return {
    maxDepth: 8,
    batchSize,
    progressUpdateInterval,
    largeSizeThreshold: 5 * 1024 * 1024 * 1024,
    warningDirectorySize,
    slowDirectoryThreshold,
  };
}; 