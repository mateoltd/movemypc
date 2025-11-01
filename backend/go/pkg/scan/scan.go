package scan

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/mateoltd/movemypc/backend/go/pkg/fileutils"
)

// Scanner handles directory scanning operations
type Scanner struct {
	exclusions ExclusionManager
	limits     AnalysisLimits
	progressCh chan<- AnalysisProgress
	warnings   []AnalysisWarning
	mu         sync.RWMutex
}

// NewScanner creates a new scanner instance
func NewScanner(exclusions ExclusionManager, limits AnalysisLimits, progressCh chan<- AnalysisProgress) *Scanner {
	return &Scanner{
		exclusions: exclusions,
		limits:     limits,
		progressCh: progressCh,
		warnings:   make([]AnalysisWarning, 0),
	}
}

// ScanDirectory scans a directory recursively
func (s *Scanner) ScanDirectory(ctx context.Context, req ScanRequest) (*ScanResult, error) {
	if req.Depth > s.limits.MaxDepth {
		return &ScanResult{Items: []FileItem{}}, nil
	}

	if s.shouldExcludePath(req.Path) {
		return &ScanResult{Items: []FileItem{}}, nil
	}

	// Validate directory access
	if !fileutils.IsValidDirectory(req.Path) {
		return &ScanResult{Items: []FileItem{}}, nil
	}

	entries, err := os.ReadDir(req.Path)
	if err != nil {
		s.addWarning(AnalysisWarning{
			Type:       "permission_denied",
			Path:       req.Path,
			Details:    fmt.Sprintf("Failed to read directory: %v", err),
			CanExclude: true,
		})
		return &ScanResult{Items: []FileItem{}}, nil
	}

	// Check for large directories
	if len(entries) > s.limits.WarningDirectorySize {
		s.addWarning(AnalysisWarning{
			Type:       "large_directory",
			Path:       req.Path,
			Details:    fmt.Sprintf("Directory contains %d files", len(entries)),
			FileCount:  len(entries),
			CanExclude: true,
		})
	}

	// Process entries with worker pool
	items, err := s.processEntries(ctx, req, entries)
	if err != nil {
		return nil, fmt.Errorf("failed to process entries: %w", err)
	}

	result := &ScanResult{
		Items:    items,
		Warnings: s.getWarnings(),
	}

	return result, nil
}

// processEntries processes directory entries using a worker pool
func (s *Scanner) processEntries(ctx context.Context, req ScanRequest, entries []os.DirEntry) ([]FileItem, error) {
	var items []FileItem
	semaphore := make(chan struct{}, s.limits.ConcurrencyLevel)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var errs []error

	// Worker pool processing
	for _, entry := range entries {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		wg.Add(1)
		go func(entry os.DirEntry) {
			defer wg.Done()

			// Acquire semaphore
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			item, err := s.processEntry(ctx, req, entry)
			if err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
				return
			}

			if item != nil {
				mu.Lock()
				items = append(items, *item)
				mu.Unlock()
			}
		}(entry)
	}

	wg.Wait()

	// Check for processing errors
	if len(errs) > 0 {
		return nil, fmt.Errorf("encountered %d errors during processing", len(errs))
	}

	return items, nil
}

// processEntry processes a single directory entry
func (s *Scanner) processEntry(ctx context.Context, req ScanRequest, entry os.DirEntry) (*FileItem, error) {
	fullPath := filepath.Join(req.Path, entry.Name())

	if s.shouldExcludePath(fullPath) {
		return nil, nil
	}

	info, err := entry.Info()
	if err != nil {
		// Skip files we can't stat
		return nil, nil
	}

	id := fileutils.GenerateFileId(fullPath)

	// Send progress update
	select {
	case s.progressCh <- AnalysisProgress{
		Phase:       "files",
		Current:     0,
		Total:       -1,
		CurrentPath: fullPath,
	}:
	default:
		// Channel is full, skip progress update
	}

	if info.IsDir() {
		return s.processDirectory(ctx, req, fullPath, entry.Name(), id, info)
	}

	return s.processFile(req, fullPath, entry.Name(), id, info)
}

// processDirectory processes a directory entry
func (s *Scanner) processDirectory(ctx context.Context, req ScanRequest, fullPath, name, id string, info os.FileInfo) (*FileItem, error) {
	folderItem := FileItem{
		ID:           id,
		Name:         name,
		Path:         fullPath,
		Type:         "folder",
		Parent:       req.ParentID,
		ModifiedDate: info.ModTime(),
		RootCategory: req.RootCategory,
		Children:     []FileItem{},
	}

	// Recursively scan subdirectory
	childReq := ScanRequest{
		Path:         fullPath,
		Limits:       req.Limits,
		RootCategory: req.RootCategory,
		ParentID:     id,
		Depth:        req.Depth + 1,
	}

	childResult, err := s.ScanDirectory(ctx, childReq)
	if err != nil {
		// Log error but continue with empty children
		s.addWarning(AnalysisWarning{
			Type:       "permission_denied",
			Path:       fullPath,
			Details:    fmt.Sprintf("Failed to scan subdirectory: %v", err),
			CanExclude: false,
		})
	} else {
		folderItem.Children = childResult.Items
		// Merge warnings
		for _, warning := range childResult.Warnings {
			s.addWarning(warning)
		}
	}

	return &folderItem, nil
}

// processFile processes a file entry
func (s *Scanner) processFile(req ScanRequest, fullPath, name, id string, info os.FileInfo) (*FileItem, error) {
	// Check for large files
	if info.Size() > req.Limits.LargeSizeThreshold {
		// This is just informational, not a warning that blocks processing
	}

	fileItem := FileItem{
		ID:           id,
		Name:         name,
		Path:         fullPath,
		Type:         "file",
		Size:         info.Size(),
		Parent:       req.ParentID,
		ModifiedDate: info.ModTime(),
		Extension:    fileutils.GetFileExtension(name),
		RootCategory: req.RootCategory,
	}

	return &fileItem, nil
}

// shouldExcludePath checks if a path should be excluded
func (s *Scanner) shouldExcludePath(path string) bool {
	if s.exclusions != nil && s.exclusions.IsExcluded(path) {
		return true
	}

	// Check for built-in exclusions
	base := filepath.Base(path)
	switch base {
	case "node_modules", ".git", ".svn", ".hg", "__pycache__", ".DS_Store":
		return true
	}

	return false
}

// addWarning adds a warning to the scanner
func (s *Scanner) addWarning(warning AnalysisWarning) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.warnings = append(s.warnings, warning)
}

// getWarnings returns a copy of current warnings
func (s *Scanner) getWarnings() []AnalysisWarning {
	s.mu.RLock()
	defer s.mu.RUnlock()
	warnings := make([]AnalysisWarning, len(s.warnings))
	copy(warnings, s.warnings)
	return warnings
}

// ScanDirectories scans multiple directories concurrently
func (s *Scanner) ScanDirectories(ctx context.Context, directories []string) (*ScanResult, error) {
	var allItems []FileItem
	processedPaths := make(map[string]bool)
	var mu sync.Mutex
	semaphore := make(chan struct{}, runtime.NumCPU())

	var wg sync.WaitGroup
	errCh := make(chan error, len(directories))

	for _, dir := range directories {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		normalizedPath := filepath.Clean(dir)
		mu.Lock()
		if processedPaths[normalizedPath] {
			mu.Unlock()
			continue
		}
		processedPaths[normalizedPath] = true
		mu.Unlock()

		wg.Add(1)
		go func(directory string) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			rootCategory := filepath.Base(directory)
			if rootCategory == "" || rootCategory == "." {
				rootCategory = "Other"
			}

			req := ScanRequest{
				Path:         directory,
				Limits:       s.limits,
				RootCategory: rootCategory,
				Depth:        0,
			}

			result, err := s.ScanDirectory(ctx, req)
			if err != nil {
				errCh <- fmt.Errorf("failed to scan %s: %w", directory, err)
				return
			}

			mu.Lock()
			allItems = append(allItems, result.Items...)
			// Merge warnings
			for _, warning := range result.Warnings {
				s.addWarning(warning)
			}
			mu.Unlock()
		}(dir)
	}

	wg.Wait()
	close(errCh)

	// Check for errors
	var errs []error
	for err := range errCh {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return nil, fmt.Errorf("encountered errors during directory scanning: %v", errs)
	}

	// Remove duplicates based on path
	uniqueItems := make(map[string]FileItem)
	for _, item := range allItems {
		if _, exists := uniqueItems[item.Path]; !exists {
			uniqueItems[item.Path] = item
		}
	}

	result := &ScanResult{
		Items:    make([]FileItem, 0, len(uniqueItems)),
		Warnings: s.getWarnings(),
	}

	for _, item := range uniqueItems {
		result.Items = append(result.Items, item)
	}

	return result, nil
}
