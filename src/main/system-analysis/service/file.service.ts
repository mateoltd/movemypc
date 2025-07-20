import * as fs from 'fs';
import { promisify } from 'util';
import { withRetry } from './retry.service';
import { safeExecute } from './error.service';

export const readdir = promisify(fs.readdir);
export const stat = promisify(fs.stat);
export const access = promisify(fs.access);

// Retryable file system error codes for transient errors
const RETRYABLE_ERROR_CODES = [
  'EBUSY',
  'EAGAIN',
  'EMFILE',
  'ENFILE',
  'ENOBUFS',
];

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
          return RETRYABLE_ERROR_CODES.includes(error.code);
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
          return RETRYABLE_ERROR_CODES.includes(error.code);
        },
      });
    },
    null,
    `getting stats for ${path}`,
  );
};
