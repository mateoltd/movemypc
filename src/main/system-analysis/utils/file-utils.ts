import { extname } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import log from 'electron-log';

export const readdir = promisify(fs.readdir);
export const stat = promisify(fs.stat);
export const access = promisify(fs.access);

let fileCounter = 0;

/**
 * Generates a unique file ID based on path and counter
 * @param path - File path
 * @returns Unique file ID
 */
export const generateFileId = (path: string): string => {
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
export const isDirectoryAccessible = async (dirPath: string): Promise<boolean> => {
  try {
    await access(dirPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely reads directory contents
 * @param dirPath - Directory path to read
 * @returns Promise resolving to array of entries or empty array if failed
 */
export const safeReaddir = async (dirPath: string): Promise<string[]> => {
  try {
    return await readdir(dirPath);
  } catch (error) {
    log.warn(`Failed to read directory ${dirPath}:`, error);
    return [];
  }
};

/**
 * Safely gets file/directory stats
 * @param path - Path to get stats for
 * @returns Promise resolving to stats or null if failed
 */
export const safeStat = async (path: string): Promise<fs.Stats | null> => {
  try {
    return await stat(path);
  } catch (error) {
    log.warn(`Failed to get stats for ${path}:`, error);
    return null;
  }
};

/**
 * Resets the file counter (useful for testing or restarting analysis)
 */
export const resetFileCounter = (): void => {
  fileCounter = 0;
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