import log from 'electron-log';
import { logError, LogContext } from '../utils/logging';
import { withRetry, RetryOptions } from './retry.service';

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

  private failures = 0;

  private lastFailureTime = 0;

  private successes = 0;

  constructor(private options: CircuitBreakerOptions) {
    // Constructor intentionally empty - options are stored in private field
  }

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
    this.successes += 1;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      log.info('Circuit breaker transitioning to CLOSED state');
    }
  }

  private onFailure(): void {
    this.failures += 1;
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
 * Module-level cache for circuit breaker instances
 * Uses WeakMap to allow garbage collection of unused function references
 */
const circuitBreakerCache = new WeakMap<Function, CircuitBreaker>();

/**
 * Generates a cache key for circuit breaker options to ensure proper instance reuse
 * @param options - Circuit breaker options
 * @returns String representation of the options
 */
const getOptionsKey = (options: Partial<CircuitBreakerOptions>): string => {
  const defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeout: 30000,
    monitoringPeriod: 60000,
  };

  const finalOptions = { ...defaultOptions, ...options };
  return `${finalOptions.failureThreshold}-${finalOptions.resetTimeout}-${finalOptions.monitoringPeriod}`;
};

/**
 * Extended cache that combines function and options for composite keys
 */
const compositeCircuitBreakerCache = new Map<string, CircuitBreaker>();

/**
 * Wraps a function with both retry and circuit breaker patterns
 * @param fn - Function to wrap
 * @param retryOptions - Retry options
 * @param circuitBreakerOptions - Circuit breaker options OR existing CircuitBreaker instance
 * @returns Wrapped function with error recovery
 */
export const withErrorRecovery = <T>(
  fn: () => Promise<T>,
  retryOptions: Partial<RetryOptions> = {},
  circuitBreakerOptions: Partial<CircuitBreakerOptions> | CircuitBreaker = {},
): (() => Promise<T>) => {
  // Check if a CircuitBreaker instance was passed directly
  let circuitBreaker: CircuitBreaker;

  if (circuitBreakerOptions instanceof CircuitBreaker) {
    // Use the provided CircuitBreaker instance
    circuitBreaker = circuitBreakerOptions;
    // Cache the provided instance for this function
    circuitBreakerCache.set(fn, circuitBreaker);
  } else {
    // Try to get existing circuit breaker from WeakMap cache first
    const existingCircuitBreaker = circuitBreakerCache.get(fn);

    if (existingCircuitBreaker) {
      circuitBreaker = existingCircuitBreaker;
    } else {
      // If not found in WeakMap, check composite cache with function name and options
      const functionKey = fn.name || fn.toString().slice(0, 100); // Use function name or truncated string
      const optionsKey = getOptionsKey(circuitBreakerOptions);
      const compositeKey = `${functionKey}-${optionsKey}`;

      const cachedCircuitBreaker =
        compositeCircuitBreakerCache.get(compositeKey);

      if (cachedCircuitBreaker) {
        circuitBreaker = cachedCircuitBreaker;
      } else {
        // Create new circuit breaker and cache it
        circuitBreaker = createCircuitBreaker(circuitBreakerOptions);
        compositeCircuitBreakerCache.set(compositeKey, circuitBreaker);
      }

      // Also cache in WeakMap for faster lookup
      circuitBreakerCache.set(fn, circuitBreaker);
    }
  }

  return async (): Promise<T> => {
    return circuitBreaker.execute(async () => {
      return withRetry(fn, retryOptions);
    });
  };
};

/**
 * Clears all cached circuit breakers
 * Useful for testing or when you want to reset all circuit breaker states
 */
export const clearCircuitBreakerCache = (): void => {
  compositeCircuitBreakerCache.clear();
};

/**
 * Gets the current circuit breaker for a function, if it exists
 * @param fn - Function to get circuit breaker for
 * @returns Circuit breaker instance or undefined if not cached
 */
export const getCircuitBreakerForFunction = <T>(
  fn: () => Promise<T>,
): CircuitBreaker | undefined => {
  return circuitBreakerCache.get(fn);
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
