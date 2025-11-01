// Package fileutils provides cross-platform file utilities for the MoveMyPC application.
// It includes functions for file ID generation, extension detection, size formatting,
// and platform-specific operations like icon extraction and shortcut resolution.
package fileutils

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	fileCounter     int64
	counterMutex    sync.Mutex
	cleanupOnce     sync.Once
	shutdownChannel chan struct{}
)

// FileInfo represents information about a file or directory
type FileInfo struct {
	Path        string    `json:"path"`
	Name        string    `json:"name"`
	Size        int64     `json:"size"`
	IsDir       bool      `json:"isDir"`
	ModTime     time.Time `json:"modTime"`
	Permissions string    `json:"permissions"`
}

// init initializes the fileutils package
func init() {
	shutdownChannel = make(chan struct{})
	setupCleanupHandlers()
}

// setupCleanupHandlers registers cleanup handlers for graceful shutdown
func setupCleanupHandlers() {
	cleanupOnce.Do(func() {
		// Reset counter on shutdown
		go func() {
			<-shutdownChannel
			resetFileCounter()
		}()
	})
}

// Shutdown signals the package to clean up resources
func Shutdown() {
	close(shutdownChannel)
}

// resetFileCounter resets the global file counter to 0
func resetFileCounter() {
	counterMutex.Lock()
	defer counterMutex.Unlock()
	fileCounter = 0
}

// GenerateFileId generates a unique file ID based on path and counter
func GenerateFileId(path string) string {
	counterMutex.Lock()
	fileCounter++
	counter := fileCounter
	counterMutex.Unlock()

	// Create a hash of the path for uniqueness
	hash := sha256.Sum256([]byte(path))
	shortHash := fmt.Sprintf("%x", hash)[:8]

	return fmt.Sprintf("file-%d-%s", counter, shortHash)
}

// GetFileExtension extracts file extension from filename
func GetFileExtension(filename string) string {
	ext := filepath.Ext(filename)
	return strings.ToLower(strings.TrimPrefix(ext, "."))
}

// CleanupFileUtils performs cleanup operations
func CleanupFileUtils() {
	resetFileCounter()
}

// GetFileCounter returns the current file counter value
func GetFileCounter() int64 {
	counterMutex.Lock()
	defer counterMutex.Unlock()
	return fileCounter
}

// IsExecutableFile checks if a file is executable based on its extension
func IsExecutableFile(filename string) bool {
	ext := GetFileExtension(filename)
	executableExtensions := map[string]bool{
		"exe": true, "msi": true, "bat": true, "cmd": true, "com": true, "scr": true, "pif": true,
		"lnk": true,  // Windows shortcuts
		"appx": true, "msix": true, // Windows Store app packages
		"jar": true,  // Java applications
		"app": true,  // macOS applications (for cross-platform compatibility)
		"deb": true, "rpm": true, // Linux packages (for cross-platform compatibility)
	}

	return executableExtensions[ext]
}

// FormatFileSize formats file size in human-readable format
func FormatFileSize(sizeInBytes int64) string {
	const unit = 1024
	if sizeInBytes < unit {
		return fmt.Sprintf("%d B", sizeInBytes)
	}
	div, exp := int64(unit), 0
	for n := sizeInBytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(sizeInBytes)/float64(div), "KMGTPE"[exp])
}

// GetDefaultIcon returns a default icon based on file type
func GetDefaultIcon(filename string, fileType string) string {
	if fileType == "folder" || fileType == "directory" {
		return "📁"
	}

	ext := GetFileExtension(filename)
	switch ext {
	case "exe", "msi":
		return "⚙️"
	case "pdf":
		return "📄"
	case "doc", "docx":
		return "📝"
	case "xls", "xlsx":
		return "📊"
	case "ppt", "pptx":
		return "📈"
	case "jpg", "jpeg", "png", "gif", "bmp":
		return "🖼️"
	case "mp4", "avi", "mov", "wmv":
		return "🎬"
	case "mp3", "wav", "flac", "aac":
		return "🎵"
	case "zip", "rar", "7z", "tar":
		return "📦"
	default:
		return "📄"
	}
}

// GetAppDisplayName gets the display name for an application
func GetAppDisplayName(filename string, targetPath string) string {
	name := filename

	// If it's a shortcut, use the shortcut name without .lnk
	if strings.HasSuffix(strings.ToLower(filename), ".lnk") {
		name = filename[:len(filename)-4] // Remove .lnk extension
	} else if targetPath != "" {
		// Use target filename if available
		name = filepath.Base(targetPath)
	}

	// Remove common executable extensions
	extensionsToRemove := []string{".exe", ".msi", ".bat", ".cmd"}
	for _, ext := range extensionsToRemove {
		if strings.HasSuffix(strings.ToLower(name), ext) {
			name = name[:len(name)-len(ext)]
			break
		}
	}

	// Format the name (capitalize first letter of each word)
	words := strings.FieldsFunc(name, func(r rune) bool {
		return r == ' ' || r == '-' || r == '_'
	})

	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
		}
	}

	return strings.Join(words, " ")
}

// GetFileInfo gets file information for a given path
func GetFileInfo(path string) (*FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info for %s: %w", path, err)
	}

	fileInfo := &FileInfo{
		Path:        path,
		Name:        filepath.Base(path),
		Size:        info.Size(),
		IsDir:       info.IsDir(),
		ModTime:     info.ModTime(),
		Permissions: info.Mode().String(),
	}

	return fileInfo, nil
}

// ValidatePath validates that a path exists and is accessible
func ValidatePath(path string) error {
	if path == "" {
		return fmt.Errorf("path cannot be empty")
	}

	// Check for path traversal attempts
	if strings.Contains(path, "..") {
		return fmt.Errorf("path contains invalid '..' segments")
	}

	// Convert to absolute path and check if it exists
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Basic existence check
	if _, err := os.Stat(absPath); err != nil {
		return fmt.Errorf("path does not exist or is not accessible: %w", err)
	}

	return nil
}

// IsValidFile checks if a file exists and is readable
func IsValidFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// IsValidDirectory checks if a directory exists and is accessible
func IsValidDirectory(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// GetPlatformInfo returns platform-specific information
func GetPlatformInfo() map[string]string {
	return map[string]string{
		"os":   runtime.GOOS,
		"arch": runtime.GOARCH,
		"pid":  strconv.Itoa(os.Getpid()),
	}
}
