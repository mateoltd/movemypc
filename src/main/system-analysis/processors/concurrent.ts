import log from 'electron-log';
import { AnalysisLimits } from '../../types/analysis-types';

/**
 * Processes items concurrently with controlled concurrency level
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @returns Promise resolving to array of results
 */
export const processConcurrentOperations = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results: R[] = [];
  const activePromises = new Set<Promise<any>>();

  // Process items in groups based on concurrency level
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  try {
    // Process each chunk sequentially, but items within each chunk concurrently
    await chunks.reduce(async (previousPromise, chunk) => {
      await previousPromise;

      const chunkPromises = chunk.map(async (item) => {
        const promise = processor(item);
        activePromises.add(promise);

        try {
          const result = await promise;
          return result;
        } finally {
          activePromises.delete(promise);
        }
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const item = chunk[index];
          log.error(
            `Concurrent operation failed for item ${JSON.stringify(item)}:`,
            result.reason,
          );
        }
      });
    }, Promise.resolve());
  } catch (error) {
    // Cleanup any remaining active promises
    log.error(
      'Error in concurrent processing, cleaning up active promises:',
      error,
    );
    await Promise.allSettled(Array.from(activePromises));
    throw error;
  }

  return results;
};

/**
 * Processes items in batches with appropriate concurrency based on device capabilities
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param analysisLimits - Analysis limits containing batch size and concurrency settings
 * @returns Promise resolving to array of results
 */
export const processBatch = async <T>(
  items: T[],
  processor: (item: T) => Promise<any>,
  analysisLimits: AnalysisLimits,
): Promise<any[]> => {
  const results: any[] = [];
  const batches: T[][] = [];
  const activePromises = new Set<Promise<any>>();

  // Create batches
  for (let i = 0; i < items.length; i += analysisLimits.batchSize) {
    batches.push(items.slice(i, i + analysisLimits.batchSize));
  }

  const processWithCleanup = async (item: T): Promise<any> => {
    const promise = processor(item);
    activePromises.add(promise);

    try {
      const result = await promise;
      return result;
    } catch (error) {
      log.error(
        `Batch processing failed for item ${JSON.stringify(item)}:`,
        error,
      );
      throw error;
    } finally {
      activePromises.delete(promise);
    }
  };

  try {
    // Process batches based on device concurrency level
    if (analysisLimits.concurrencyLevel === 1) {
      // Sequential processing for low-end devices
      await batches.reduce(async (previousPromise, batch) => {
        await previousPromise;
        const batchResults = await Promise.allSettled(
          batch.map(processWithCleanup),
        );
        const successfulResults = batchResults
          .filter((result) => result.status === 'fulfilled' && result.value)
          .map((result) => (result as PromiseFulfilledResult<any>).value);
        results.push(...successfulResults);
      }, Promise.resolve());
    } else {
      // Concurrent processing for higher-end devices
      const processConcurrentBatches = async (
        batchGroup: T[][],
      ): Promise<any[]> => {
        const batchPromises = batchGroup.map(async (batch) => {
          const batchResults = await Promise.allSettled(
            batch.map(processWithCleanup),
          );
          return batchResults
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => (result as PromiseFulfilledResult<any>).value);
        });

        const batchResults = await Promise.allSettled(batchPromises);
        const allResults: any[] = [];
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(...result.value);
          } else {
            log.error(`Batch group ${index} processing failed:`, result.reason);
          }
        });
        return allResults;
      };

      // Process batches in groups based on concurrency level
      const batchGroups: T[][][] = [];
      for (
        let i = 0;
        i < batches.length;
        i += analysisLimits.concurrencyLevel
      ) {
        batchGroups.push(batches.slice(i, i + analysisLimits.concurrencyLevel));
      }

      // Process each batch group sequentially
      await batchGroups.reduce(async (previousPromise, batchGroup) => {
        await previousPromise;
        const groupResults = await processConcurrentBatches(batchGroup);
        results.push(...groupResults);
      }, Promise.resolve());
    }
  } catch (error) {
    // Cleanup any remaining active promises
    log.error('Error in batch processing, cleaning up active promises:', error);
    await Promise.allSettled(Array.from(activePromises));
    throw error;
  }

  return results;
};

/**
 * Processes items with controlled concurrency
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @param errorHandler - Optional error handler function
 * @returns Promise resolving to array of successful results
 */
export const processWithControlledConcurrency = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  errorHandler?: (error: any, item: T) => void,
): Promise<R[]> => {
  const results: R[] = [];
  const activePromises = new Set<Promise<any>>();

  const processItem = async (item: T): Promise<void> => {
    const promise = processor(item);
    activePromises.add(promise);

    try {
      const result = await promise;
      results.push(result);
    } catch (error) {
      if (errorHandler) {
        errorHandler(error, item);
      } else {
        log.error(`Processing failed for item ${JSON.stringify(item)}:`, error);
      }
    } finally {
      activePromises.delete(promise);
    }
  };

  try {
    // Process items with controlled concurrency
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.all(batch.map(processItem));
    }
  } catch (error) {
    // Cleanup any remaining active promises
    log.error(
      'Error in controlled concurrency processing, cleaning up active promises:',
      error,
    );
    await Promise.allSettled(Array.from(activePromises));
    throw error;
  }

  return results;
};
