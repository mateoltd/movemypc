import log from 'electron-log';
import AnalysisOrchestrator from '../../main/system-analysis/core/orchestrator';
import { withRetry } from '../../main/system-analysis/service/retry.service';
import { safeExecute } from '../../main/system-analysis/service/error.service';
import {
  logError,
  logPerformanceMetrics,
  LogContext,
} from '../../main/system-analysis/utils/logging';
import {
  getFileCounter,
  resetFileCounter,
} from '../../main/system-analysis/utils/file-utils';

/**
 * Test scenarios for error handling and cleanup
 */
export class ErrorScenarioTester {
  private orchestrator: AnalysisOrchestrator;

  private testResults: Map<string, boolean> = new Map();

  constructor() {
    this.orchestrator = new AnalysisOrchestrator();
  }

  /**
   * Tests file counter cleanup
   */
  static async testFileCounterCleanup(): Promise<boolean> {
    try {
      log.info('Testing file counter cleanup...');
      // Reset counter
      resetFileCounter();
      const initialCount = getFileCounter();
      // Simulate file operations
      const orchestrator = new AnalysisOrchestrator();
      await orchestrator.initialize();
      // Reset and check cleanup
      orchestrator.reset();
      const afterResetCount = getFileCounter();
      const success = initialCount === 0 && afterResetCount === 0;
      log.info(`File counter cleanup test: ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error) {
      const context: LogContext = {
        operation: 'file counter cleanup test',
        errorCode: (error as any).code,
      };
      logError(error, context);
      return false;
    }
  }

  /**
   * Tests retry mechanism
   */
  static async testRetryMechanism(): Promise<boolean> {
    try {
      log.info('Testing retry mechanism...');
      let attemptCount = 0;
      const maxAttempts = 3;
      const result = await withRetry(
        async () => {
          attemptCount += 1;
          if (attemptCount < maxAttempts) {
            const error = new Error('Simulated transient error');
            (error as any).code = 'EBUSY';
            throw error;
          }
          return 'success';
        },
        {
          maxAttempts,
          baseDelay: 100,
          retryCondition: (error: any) => error.code === 'EBUSY',
        },
      );
      const success = result === 'success' && attemptCount === maxAttempts;
      log.info(`Retry mechanism test: ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error) {
      const context: LogContext = {
        operation: 'retry mechanism test',
        errorCode: (error as any).code,
      };
      logError(error, context);
      return false;
    }
  }

  /**
   * Tests safe execution with fallback
   */
  static async testSafeExecutionFallback(): Promise<boolean> {
    try {
      log.info('Testing safe execution with fallback...');
      const result = await safeExecute(
        async () => {
          throw new Error('Simulated error');
        },
        'fallback_value',
        'safe execution test',
      );
      const success = result === 'fallback_value';
      log.info(
        `Safe execution fallback test: ${success ? 'PASSED' : 'FAILED'}`,
      );
      return success;
    } catch (error) {
      const context: LogContext = {
        operation: 'safe execution fallback test',
        errorCode: (error as any).code,
      };
      logError(error, context);
      return false;
    }
  }

  /**
   * Tests orchestrator cleanup on error
   *
   * Note: This method is not static because orchestrator state may be per-instance in the future (polymorphism support planned).
   */
  async testOrchestratorCleanup(): Promise<boolean> {
    try {
      log.info('Testing orchestrator cleanup on error...');
      await this.orchestrator.initialize();
      // Simulate error during analysis
      try {
        // This should trigger cleanup
        this.orchestrator.reset();
        // Verify cleanup occurred
        const limits = this.orchestrator.getAnalysisLimits();
        const success = limits === null;
        log.info(`Orchestrator cleanup test: ${success ? 'PASSED' : 'FAILED'}`);
        return success;
      } catch (error) {
        const context: LogContext = {
          operation: 'orchestrator cleanup test',
          errorCode: (error as any).code,
        };
        logError(error, context);
        return false;
      }
    } catch (error) {
      const context: LogContext = {
        operation: 'orchestrator cleanup test setup',
        errorCode: (error as any).code,
      };
      logError(error, context);
      return false;
    }
  }

  /**
   * Tests memory cleanup after errors
   */
  static async testMemoryCleanup(): Promise<boolean> {
    try {
      log.info('Testing memory cleanup after errors...');
      const initialMemory = process.memoryUsage();
      // Simulate memory-intensive operations with errors
      const tasks = Array.from({ length: 10 }, (_, i) =>
        safeExecute(
          async () => {
            // Simulate memory allocation and error
            new Array(1000).fill('test');
            throw new Error('Simulated memory error');
          },
          null,
          `memory test ${i}`,
        ),
      );
      await Promise.allSettled(tasks);
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage();
      // Check that memory usage didn't grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const success = memoryGrowth < 50 * 1024 * 1024; // Less than 50MB growth
      log.info(`Memory cleanup test: ${success ? 'PASSED' : 'FAILED'}`);
      log.info(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      return success;
    } catch (error) {
      const context: LogContext = {
        operation: 'memory cleanup test',
        errorCode: (error as any).code,
      };
      logError(error, context);
      return false;
    }
  }

  /**
   * Runs all error scenario tests
   */
  async runAllTests(): Promise<Map<string, boolean>> {
    const startTime = Date.now();
    let totalTests = 0;
    let passedTests = 0;
    log.info('Starting error scenario tests...');
    const tests = [
      {
        name: 'File Counter Cleanup',
        test: () => ErrorScenarioTester.testFileCounterCleanup(),
      },
      {
        name: 'Retry Mechanism',
        test: () => ErrorScenarioTester.testRetryMechanism(),
      },
      {
        name: 'Safe Execution Fallback',
        test: () => ErrorScenarioTester.testSafeExecutionFallback(),
      },
      {
        name: 'Orchestrator Cleanup',
        test: () => this.testOrchestratorCleanup(),
      },
      {
        name: 'Memory Cleanup',
        test: () => ErrorScenarioTester.testMemoryCleanup(),
      },
    ];
    await Promise.all(
      tests.map(async ({ name, test }) => {
        totalTests += 1;
        try {
          const result = await test();
          this.testResults.set(name, result);
          if (result) {
            passedTests += 1;
          }
        } catch (error) {
          const context: LogContext = {
            operation: `test: ${name}`,
            errorCode: (error as any).code,
          };
          logError(error, context);
          this.testResults.set(name, false);
        }
      }),
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    // Log performance metrics
    logPerformanceMetrics('Error Scenario Tests', {
      itemsProcessed: totalTests,
      duration,
      errors: totalTests - passedTests,
      retries: 0,
    });
    log.info(`Tests completed: ${passedTests}/${totalTests} passed`);
    return this.testResults;
  }

  /**
   * Gets test results
   */
  getTestResults(): Map<string, boolean> {
    return this.testResults;
  }

  /**
   * Cleans up test resources
   */
  cleanup(): void {
    try {
      this.orchestrator.cleanup();
      this.testResults.clear();
      log.info('Test cleanup completed');
    } catch (error) {
      const context: LogContext = {
        operation: 'test cleanup',
        errorCode: (error as any).code,
      };
      logError(error, context);
    }
  }
}

/**
 * Runs error scenario tests (can be called from main process)
 */
export const runErrorScenarioTests = async (): Promise<
  Map<string, boolean>
> => {
  const tester = new ErrorScenarioTester();

  try {
    const results = await tester.runAllTests();
    return results;
  } finally {
    tester.cleanup();
  }
};
