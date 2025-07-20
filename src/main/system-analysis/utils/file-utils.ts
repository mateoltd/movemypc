import { extname } from 'path';
import log from 'electron-log';

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
