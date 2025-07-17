import log from 'electron-log';
import { formatFileSize } from './file-utils';

/**
 * Enhanced logging context interface
 */
export interface LogContext {
  operation: string;
  path?: string;
  fileSize?: number;
  duration?: number;
  attemptNumber?: number;
  totalAttempts?: number;
  errorCode?: string;
  systemInfo?: {
    availableMemory?: number;
    openFileDescriptors?: number;
    diskSpace?: number;
  };
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Error categorization based on error codes
 */
const ERROR_CATEGORIES = {
  PERMISSION: ['EACCES', 'EPERM'],
  NOT_FOUND: ['ENOENT', 'ENOTDIR'],
  RESOURCE_EXHAUSTION: ['EMFILE', 'ENFILE', 'ENOBUFS', 'ENOMEM'],
  NETWORK: ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTCONN'],
  TRANSIENT: ['EBUSY', 'EAGAIN', 'EWOULDBLOCK'],
  FILESYSTEM: ['EIO', 'ENOSPC', 'EROFS'],
  INVALID_INPUT: ['EINVAL', 'ELOOP', 'ENAMETOOLONG'],
};

/**
 * Gets error category from error code
 */
const getErrorCategory = (errorCode: string): string => {
  for (const [category, codes] of Object.entries(ERROR_CATEGORIES)) {
    if (codes.includes(errorCode)) {
      return category;
    }
  }
  return 'UNKNOWN';
};

/**
 * Gets error severity based on error code and context
 */
const getErrorSeverity = (
  errorCode: string,
  context: LogContext,
): ErrorSeverity => {
  const category = getErrorCategory(errorCode);

  switch (category) {
    case 'RESOURCE_EXHAUSTION':
      return ErrorSeverity.CRITICAL;
    case 'FILESYSTEM':
      return ErrorSeverity.HIGH;
    case 'PERMISSION':
      return ErrorSeverity.MEDIUM;
    case 'TRANSIENT':
      return ErrorSeverity.LOW;
    default:
      return ErrorSeverity.MEDIUM;
  }
};

/**
 * Generates actionable suggestions based on error type
 */
const getActionableSuggestions = (
  errorCode: string,
  context: LogContext,
): string[] => {
  const category = getErrorCategory(errorCode);
  const suggestions: string[] = [];

  switch (category) {
    case 'PERMISSION':
      suggestions.push('Check file/directory permissions');
      suggestions.push('Run with appropriate privileges');
      suggestions.push('Verify user has access to the path');
      break;

    case 'NOT_FOUND':
      suggestions.push('Verify the path exists');
      suggestions.push('Check for typos in the path');
      suggestions.push(
        'Ensure the file/directory has not been moved or deleted',
      );
      break;

    case 'RESOURCE_EXHAUSTION':
      suggestions.push('Close unnecessary file handles');
      suggestions.push('Increase system file descriptor limits');
      suggestions.push('Free up system memory');
      suggestions.push('Consider reducing concurrency level');
      break;

    case 'FILESYSTEM':
      suggestions.push('Check disk space availability');
      suggestions.push('Verify disk is not read-only');
      suggestions.push('Run disk check utilities');
      break;

    case 'TRANSIENT':
      suggestions.push('Retry the operation');
      suggestions.push('Wait before retrying');
      suggestions.push('Check system load');
      break;

    case 'INVALID_INPUT':
      suggestions.push('Validate input parameters');
      suggestions.push('Check path length limits');
      suggestions.push('Resolve symbolic links');
      break;

    default:
      suggestions.push('Check system logs for more details');
      suggestions.push('Verify system configuration');
  }

  return suggestions;
};

/**
 * Formats an error message with context and suggestions
 */
const formatErrorMessage = (
  error: any,
  context: LogContext,
  suggestions: string[],
): string => {
  const errorCode = error.code || 'UNKNOWN';
  const errorMessage = error.message || 'Unknown error';
  const category = getErrorCategory(errorCode);
  const severity = getErrorSeverity(errorCode, context);

  let message = `[${severity}] ${context.operation} failed`;

  if (context.path) {
    message += ` for path: ${context.path}`;
  }

  message += `\n  Error: ${errorMessage} (${errorCode})`;
  message += `\n  Category: ${category}`;

  if (context.duration) {
    message += `\n  Duration: ${context.duration}ms`;
  }

  if (context.attemptNumber && context.totalAttempts) {
    message += `\n  Attempt: ${context.attemptNumber}/${context.totalAttempts}`;
  }

  if (context.fileSize) {
    message += `\n  File size: ${formatFileSize(context.fileSize)}`;
  }

  if (context.systemInfo) {
    message += `\n  System info:`;
    if (context.systemInfo.availableMemory) {
      message += ` Memory: ${formatFileSize(context.systemInfo.availableMemory)}`;
    }
    if (context.systemInfo.openFileDescriptors) {
      message += ` Open FDs: ${context.systemInfo.openFileDescriptors}`;
    }
  }

  if (suggestions.length > 0) {
    message += `\n  Suggestions:`;
    suggestions.forEach((suggestion) => {
      message += `\n    - ${suggestion}`;
    });
  }

  return message;
};

/**
 * Enhanced error logging with context and actionable suggestions
 */
export const logError = (error: any, context: LogContext): void => {
  const errorCode = error.code || 'UNKNOWN';
  const suggestions = getActionableSuggestions(errorCode, context);
  const message = formatErrorMessage(error, context, suggestions);
  const severity = getErrorSeverity(errorCode, context);

  switch (severity) {
    case ErrorSeverity.CRITICAL:
      log.error(`CRITICAL: ${message}`);
      break;
    case ErrorSeverity.HIGH:
      log.error(`HIGH: ${message}`);
      break;
    case ErrorSeverity.MEDIUM:
      log.warn(`MEDIUM: ${message}`);
      break;
    case ErrorSeverity.LOW:
      log.info(`LOW: ${message}`);
      break;
    default:
      log.error(message);
  }
};

/**
 * Logs operation start with context
 */
export const logOperationStart = (context: LogContext): void => {
  let message = `Starting ${context.operation}`;

  if (context.path) {
    message += ` for path: ${context.path}`;
  }

  log.debug(message);
};

/**
 * Logs operation success with context
 */
export const logOperationSuccess = (context: LogContext): void => {
  let message = `${context.operation} completed successfully`;

  if (context.path) {
    message += ` for path: ${context.path}`;
  }

  if (context.duration) {
    message += ` in ${context.duration}ms`;
  }

  log.debug(message);
};

/**
 * Logs operation retry with context
 */
export const logOperationRetry = (error: any, context: LogContext): void => {
  const errorCode = error.code || 'UNKNOWN';
  let message = `Retrying ${context.operation}`;

  if (context.path) {
    message += ` for path: ${context.path}`;
  }

  if (context.attemptNumber && context.totalAttempts) {
    message += ` (attempt ${context.attemptNumber}/${context.totalAttempts})`;
  }

  message += ` after error: ${error.message || 'Unknown error'} (${errorCode})`;

  log.warn(message);
};

/**
 * Logs performance metrics
 */
export const logPerformanceMetrics = (
  operation: string,
  metrics: {
    itemsProcessed: number;
    duration: number;
    errors: number;
    retries: number;
    averageItemTime?: number;
  },
): void => {
  const itemsPerSecond = metrics.itemsProcessed / (metrics.duration / 1000);

  let message = `Performance metrics for ${operation}:`;
  message += `\n  Items processed: ${metrics.itemsProcessed}`;
  message += `\n  Duration: ${metrics.duration}ms`;
  message += `\n  Items/second: ${itemsPerSecond.toFixed(2)}`;
  message += `\n  Errors: ${metrics.errors}`;
  message += `\n  Retries: ${metrics.retries}`;

  if (metrics.averageItemTime) {
    message += `\n  Average item time: ${metrics.averageItemTime.toFixed(2)}ms`;
  }

  log.info(message);
};

/**
 * Logs system resource usage
 */
export const logSystemResources = (
  operation: string,
  resources: {
    memoryUsage: number;
    openFileDescriptors?: number;
    cpuUsage?: number;
  },
): void => {
  let message = `System resources during ${operation}:`;
  message += `\n  Memory usage: ${formatFileSize(resources.memoryUsage)}`;

  if (resources.openFileDescriptors) {
    message += `\n  Open file descriptors: ${resources.openFileDescriptors}`;
  }

  if (resources.cpuUsage) {
    message += `\n  CPU usage: ${resources.cpuUsage.toFixed(2)}%`;
  }

  log.debug(message);
};
