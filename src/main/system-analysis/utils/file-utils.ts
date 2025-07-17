import { extname } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import log from 'electron-log';
import { withRetry, safeExecute } from './error-recovery';

export const readdir = promisify(fs.readdir);
export const stat = promisify(fs.stat);
export const access = promisify(fs.access);

let fileCounter = 0;
let isCleanupRegistered = false;

/**
 * Registers cleanup handlers for process termination
 */
const registerCleanupHandlers = (): void => {
  if (isCleanupRegistered) {
    return;
  }

  const cleanup = () => {
    log.info('Cleaning up file utils state...');
    resetFileCounter();
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception in file utils:', error);
    cleanup();
  });

  isCleanupRegistered = true;
};

/**
 * Generates a unique file ID based on path and counter
 * @param path - File path
 * @returns Unique file ID
 */
export const generateFileId = (path: string): string => {
  registerCleanupHandlers();
  fileCounter += 1;
  return `file-${fileCounter}-${Buffer.from(path).toString('base64').slice(0, 8)}`;
};

/**
 * Extracts file extension from filename
 * @param filename - Name of the file
 * @returns File extension without the dot
 */
export const getFileExtension = (filename: string): string => {
  const ext = extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
};

/**
 * Checks if a directory is accessible for reading
 * @param dirPath - Directory path to check
 * @returns Promise resolving to true if accessible
 */
export const isDirectoryAccessible = async (
  dirPath: string,
): Promise<boolean> => {
  try {
    await access(dirPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely reads directory contents w/ error handling and retry logic
 * @param dirPath - Directory path to read
 * @returns Promise resolving to array of entries or empty array if failed
 */
export const safeReaddir = async (dirPath: string): Promise<string[]> => {
  return await safeExecute(
    async () => {
      return await withRetry(async () => await readdir(dirPath), {
        maxAttempts: 3,
        baseDelay: 500,
        retryCondition: (error: any) => {
          // Retry on transient file system errors
          const retryableErrors = [
            'EBUSY',
            'EAGAIN',
            'EMFILE',
            'ENFILE',
            'ENOBUFS',
          ];
          return retryableErrors.includes(error.code);
        },
      });
    },
    [],
    `reading directory ${dirPath}`,
  );
};

/**
 * Safely gets file/directory stats w/ error handling and retry logic
 * @param path - Path to get stats for
 * @returns Promise resolving to stats or null if failed
 */
export const safeStat = async (path: string): Promise<fs.Stats | null> => {
  return await safeExecute(
    async () => {
      return await withRetry(async () => await stat(path), {
        maxAttempts: 3,
        baseDelay: 300,
        retryCondition: (error: any) => {
          // Retry on transient file system errors
          const retryableErrors = [
            'EBUSY',
            'EAGAIN',
            'EMFILE',
            'ENFILE',
            'ENOBUFS',
          ];
          return retryableErrors.includes(error.code);
        },
      });
    },
    null,
    `getting stats for ${path}`,
  );
};

/**
 * Resets the file counter (useful for testing or restarting analysis)
 */
export const resetFileCounter = (): void => {
  fileCounter = 0;
  log.debug('File counter reset to 0');
};

/**
 * Cleanup function to be called when analysis is complete or interrupted
 */
export const cleanupFileUtils = (): void => {
  resetFileCounter();
  log.debug('File utils cleanup completed');
};

/**
 * Gets the current file counter value
 * @returns Current file counter value
 */
export const getFileCounter = (): number => {
  return fileCounter;
};

/**
 * Checks if a file is executable (Windows specific)
 * @param filename - Name of the file
 * @returns True if file has executable extension
 */
export const isExecutableFile = (filename: string): boolean => {
  const ext = getFileExtension(filename);
  return ext === 'exe' || ext === 'msi';
};

/**
 * Formats file size in human-readable format
 * @param sizeInBytes - Size in bytes
 * @returns Formatted size string
 */
export const formatFileSize = (sizeInBytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = sizeInBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};
