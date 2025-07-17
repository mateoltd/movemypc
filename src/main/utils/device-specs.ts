import { totalmem, freemem, cpus } from 'os';
import * as fs from 'fs';
import { DeviceSpecs, AnalysisLimits } from '../types/analysis-types';

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

export const detectDeviceSpecs = async (): Promise<DeviceSpecs> => {
  const totalMemoryBytes = totalmem();
  const freeMemoryBytes = freemem();
  const totalMemoryGB = totalMemoryBytes / 1024 ** 3;
  const availableMemoryGB = freeMemoryBytes / 1024 ** 3;
  const cpuCores = cpus().length;

  const diskSpeedTier = await detectDiskSpeed();

  return {
    totalMemoryGB,
    availableMemoryGB,
    cpuCores,
    diskSpeedTier,
  };
};

export const calculateOptimalConcurrency = (specs: DeviceSpecs): number => {
  // Base concurrency calculation
  let baseConcurrency = 1; // Default to sequential processing

  // CPU-based concurrency (use a fraction of available cores)
  const cpuConcurrency = Math.max(1, Math.floor(specs.cpuCores / 2));

  // Memory-based concurrency (more memory allows more concurrent processes)
  const memoryConcurrency = Math.max(
    1,
    Math.floor(specs.availableMemoryGB / 2),
  );

  // Disk-based concurrency (faster disks can handle more concurrent I/O)
  let diskConcurrency = 1;
  if (specs.diskSpeedTier === 'fast') {
    diskConcurrency = 4;
  } else if (specs.diskSpeedTier === 'medium') {
    diskConcurrency = 2;
  }

  // Take the minimum to avoid overwhelming any single resource
  baseConcurrency = Math.min(
    cpuConcurrency,
    memoryConcurrency,
    diskConcurrency,
  );

  // Apply device tier limits
  if (
    specs.cpuCores >= 8 &&
    specs.availableMemoryGB >= 8 &&
    specs.diskSpeedTier === 'fast'
  ) {
    // High-end device: allow higher concurrency
    baseConcurrency = Math.min(baseConcurrency, 6);
  } else if (specs.cpuCores >= 4 && specs.availableMemoryGB >= 4) {
    // Mid-range device: moderate concurrency
    baseConcurrency = Math.min(baseConcurrency, 3);
  } else {
    // Low-end device: sequential processing
    baseConcurrency = 1;
  }

  return Math.max(1, baseConcurrency);
};

export const calculateOptimalLimits = (specs: DeviceSpecs): AnalysisLimits => {
  const baseMultiplier = Math.min(specs.cpuCores / 4, 3);
  const memoryMultiplier = Math.min(specs.availableMemoryGB / 4, 2);
  let diskMultiplier = 1;
  if (specs.diskSpeedTier === 'fast') {
    diskMultiplier = 2;
  } else if (specs.diskSpeedTier === 'medium') {
    diskMultiplier = 1.5;
  }

  const performanceScore = baseMultiplier * memoryMultiplier * diskMultiplier;
  const concurrencyLevel = calculateOptimalConcurrency(specs);

  const batchSize = Math.min(
    Math.max(50, Math.floor(200 * performanceScore)),
    1000,
  );

  const progressUpdateInterval = Math.max(
    25,
    Math.floor(100 / performanceScore),
  );

  const warningDirectorySize = Math.max(
    50000,
    Math.floor(100000 * performanceScore),
  );
  const slowDirectoryThreshold = Math.max(
    20000,
    Math.floor(50000 * performanceScore),
  );

  return {
    maxDepth: 8,
    batchSize,
    progressUpdateInterval,
    largeSizeThreshold: 5 * 1024 * 1024 * 1024,
    warningDirectorySize,
    slowDirectoryThreshold,
    concurrencyLevel,
  };
};
