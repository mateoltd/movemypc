import log from 'electron-log';
import { logError, logOperationRetry, LogContext } from './logging';

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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let lastError: any;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (
        attempt === config.maxAttempts - 1 ||
        !config.retryCondition!(error)
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

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;

  private failures: number = 0;

  private lastFailureTime: number = 0;

  private successes: number = 0;

  constructor(private options: CircuitBreakerOptions) {}

  /**
   * Executes a function with circuit breaker protection
   * @param fn - Function to execute
   * @returns Promise resolving to the function result
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        log.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      log.info('Circuit breaker transitioning to CLOSED state');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      log.warn(
        `Circuit breaker transitioning to OPEN state after ${this.failures} failures`,
      );
    }
  }

  /**
   * Gets the current state of the circuit breaker
   * @returns Current circuit breaker state
   */
  getState(): string {
    return this.state;
  }

  /**
   * Gets circuit breaker statistics
   * @returns Object containing failure and success counts
   */
  getStats(): { failures: number; successes: number; state: string } {
    return {
      failures: this.failures,
      successes: this.successes,
      state: this.state,
    };
  }
}

/**
 * Creates a circuit breaker with default options
 * @param options - Circuit breaker options
 * @returns Circuit breaker instance
 */
export const createCircuitBreaker = (
  options: Partial<CircuitBreakerOptions> = {},
): CircuitBreaker => {
  const defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
  };

  return new CircuitBreaker({ ...defaultOptions, ...options });
};

/**
 * Wraps a function with both retry and circuit breaker patterns
 * @param fn - Function to wrap
 * @param retryOptions - Retry options
 * @param circuitBreakerOptions - Circuit breaker options
 * @returns Wrapped function with error recovery
 */
export const withErrorRecovery = <T>(
  fn: () => Promise<T>,
  retryOptions: Partial<RetryOptions> = {},
  circuitBreakerOptions: Partial<CircuitBreakerOptions> = {},
): (() => Promise<T>) => {
  const circuitBreaker = createCircuitBreaker(circuitBreakerOptions);

  return async (): Promise<T> => {
    return await circuitBreaker.execute(async () => {
      return await withRetry(fn, retryOptions);
    });
  };
};

/**
 * Safely executes a function with error handling
 * @param fn - Function to execute
 * @param fallback - Fallback function or value
 * @param context - Context string for logging
 * @returns Promise resolving to the function result or fallback
 */
export const safeExecute = async <T>(
  fn: () => Promise<T>,
  fallback: T | (() => T | Promise<T>),
  context: string = 'Unknown operation',
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    // Use logging for safe execution failures
    const logContext: LogContext = {
      operation: context,
      errorCode: (error as any).code,
    };

    logError(error, logContext);

    if (typeof fallback === 'function') {
      try {
        return await (fallback as () => T | Promise<T>)();
      } catch (fallbackError) {
        const fallbackLogContext: LogContext = {
          operation: `${context} fallback`,
          errorCode: (fallbackError as any).code,
        };

        logError(fallbackError, fallbackLogContext);
        throw fallbackError;
      }
    }

    return fallback as T;
  }
};
