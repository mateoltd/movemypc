import { logOperationRetry, LogContext } from '../utils/logging';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: any) => boolean;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryCondition: (error: any) => {
    // Retry on transient errors
    const retryableErrors = [
      'EBUSY',
      'EAGAIN',
      'ENOBUFS',
      'ENOMEM',
      'ETIMEDOUT',
    ];
    return retryableErrors.includes(error.code);
  },
};

/**
 * Sleep utility function
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Calculates the delay for the next retry attempt using exponential backoff
 * @param attempt - Current attempt number (0-based)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
const calculateDelay = (attempt: number, options: RetryOptions): number => {
  const delay = options.baseDelay * options.backoffMultiplier ** attempt;
  return Math.min(delay, options.maxDelay);
};

/**
 * Retries a function with exponential backoff
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Promise resolving to the function result
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> => {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };

  if (config.maxAttempts <= 0) {
    throw new Error('maxAttempts must be greater than 0');
  }

  let lastError: any;

  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (
        attempt === config.maxAttempts - 1 ||
        !(config.retryCondition && config.retryCondition(error))
      ) {
        throw error;
      }

      const delay = calculateDelay(attempt, config);

      // Use enhanced logging for retry attempts
      const context: LogContext = {
        operation: 'retry operation',
        attemptNumber: attempt + 1,
        totalAttempts: config.maxAttempts,
        errorCode: (error as any).code,
      };

      logOperationRetry(error, context);
      await sleep(delay);
    }
  }

  throw lastError;
};
