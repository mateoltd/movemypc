import log from 'electron-log';
import { logError, LogContext } from '../system-analysis/utils/logging';

/**
 * Processes items concurrently with controlled concurrency level using p-limit
 * 
 * Features:
 * - True concurrent pool: up to `concurrency` operations run simultaneously
 * - Error handling: Returns PromiseSettledResult to preserve both successes and failures
 * - Order preservation: Results correspond to input order regardless of completion time
 * - Robust logging: Integrates with existing error service for comprehensive error tracking
 * 
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations (minimum: 1)
 * @returns Promise resolving to array of PromiseSettledResult containing all results and errors
 * 
 * @example
 * 
 * const items = [1, 2, 3, 4, 5];
 * const processor = async (num: number) => num * 2;
 * const results = await processConcurrentWithPool(items, processor, 3);
 * 
 * // Extract successful results
 * const successful = results
 *   .filter((result): result is PromiseFulfilledResult<number> => 
 *     result.status === 'fulfilled')
 *   .map(result => result.value);
 * 
 * // Handle errors
 * const errors = results
 *   .filter((result): result is PromiseRejectedResult => 
 *     result.status === 'rejected')
 *   .map(result => result.reason);
 *
 */
export const processConcurrentWithPool = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> => {
  // Validate inputs
  if (concurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }
  
  if (items.length === 0) {
    return [];
  }

  try {
    // Import p-limit dynamically to handle ESM module
    const { default: pLimit } = await import('p-limit');
    
    // Create a limiter with the specified concurrency
    const limit = pLimit(concurrency);
    
    log.info(`Starting concurrent processing: ${items.length} items with concurrency ${concurrency}`);
    
    // Map each item to a limited promise that preserves order
    const limitedPromises = items.map((item, index) =>
      limit(async () => {
        const startTime = Date.now();
        
        try {
          // Execute the processor with error handling
          const result = await processor(item);
          
          const duration = Date.now() - startTime;
          if (duration > 5000) { // Log slow operations
            log.warn(`Slow operation detected: item ${index} took ${duration}ms`);
          }
          
          return result;
        } catch (error) {
          // Error logging with context
          const logContext: LogContext = {
            operation: 'processConcurrentWithPool',
            duration: Date.now() - startTime,
            errorCode: (error as any).code,
          };
          
          logError(error, logContext);
          throw error;
        }
      })
    );

    // Execute all promises and return settled results preserving order
    const results = await Promise.allSettled(limitedPromises);
    
    // Log summary statistics
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    log.info(`Concurrent processing completed: ${successful} successful, ${failed} failed out of ${items.length} total`);
    
    return results;
    
  } catch (error) {
    log.error('Fatal error in concurrent processing:', error);
    throw error;
  }
};

/**
 * Helper function to extract successful results from PromiseSettledResult array
 * @param results - Array of PromiseSettledResult
 * @returns Array of successful values
 */
export const extractSuccessfulResults = <T>(
  results: PromiseSettledResult<T>[]
): T[] => {
  return results
    .filter((result): result is PromiseFulfilledResult<T> => 
      result.status === 'fulfilled')
    .map(result => result.value);
};

/**
 * Helper function to extract failed results from PromiseSettledResult array
 * @param results - Array of PromiseSettledResult
 * @returns Array of error reasons
 */
export const extractFailedResults = <T>(
  results: PromiseSettledResult<T>[]
): any[] => {
  return results
    .filter((result): result is PromiseRejectedResult => 
      result.status === 'rejected')
    .map(result => result.reason);
};

 