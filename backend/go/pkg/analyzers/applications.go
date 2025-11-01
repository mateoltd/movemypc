package analyzers

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/mateoltd/movemypc/backend/go/pkg/fileutils"
	"github.com/mateoltd/movemypc/backend/go/pkg/scan"
)

// ApplicationsAnalyzer handles application discovery and analysis
type ApplicationsAnalyzer struct {
	limits    scan.AnalysisLimits
	progressCh chan<- scan.AnalysisProgress
}

// NewApplicationsAnalyzer creates a new applications analyzer
func NewApplicationsAnalyzer(limits scan.AnalysisLimits, progressCh chan<- scan.AnalysisProgress) *ApplicationsAnalyzer {
	return &ApplicationsAnalyzer{
		limits:     limits,
		progressCh: progressCh,
	}
}

// AnalyzeApplications analyzes installed applications on the system
func (aa *ApplicationsAnalyzer) AnalyzeApplications(ctx context.Context) ([]scan.FileItem, error) {
	appDirs := GetApplicationDirectories()
	var allApps []scan.FileItem
	var mu sync.Mutex
	semaphore := make(chan struct{}, aa.limits.ConcurrencyLevel)

	var wg sync.WaitGroup
	errCh := make(chan error, len(appDirs))

	for i, appDir := range appDirs {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		wg.Add(1)
		go func(dir string, index int) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Send progress update
			select {
			case aa.progressCh <- scan.AnalysisProgress{
				Phase:      "apps",
				Current:    index,
				Total:      len(appDirs),
				CurrentPath: dir,
			}:
			default:
			}

			apps, err := aa.processAppDirectory(ctx, dir)
			if err != nil {
				errCh <- fmt.Errorf("failed to process app directory %s: %w", dir, err)
				return
			}

			mu.Lock()
			allApps = append(allApps, apps...)
			mu.Unlock()
		}(appDir, i)
	}

	wg.Wait()
	close(errCh)

	// Check for errors
	var errs []error
	for err := range errCh {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return nil, fmt.Errorf("encountered errors during application analysis: %v", errs)
	}

	return allApps, nil
}

// processAppDirectory processes a single application directory
func (aa *ApplicationsAnalyzer) processAppDirectory(ctx context.Context, appDir string) ([]scan.FileItem, error) {
	if !fileutils.IsValidDirectory(appDir) {
		return []scan.FileItem{}, nil
	}

	entries, err := os.ReadDir(appDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %s: %w", appDir, err)
	}

	// Limit entries to avoid processing too many files
	maxEntries := 100
	if len(entries) > maxEntries {
		entries = entries[:maxEntries]
	}

	var apps []scan.FileItem
	semaphore := make(chan struct{}, aa.limits.ConcurrencyLevel)
	var mu sync.Mutex

	var wg sync.WaitGroup
	for _, entry := range entries {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		wg.Add(1)
		go func(ent os.DirEntry) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			app, err := aa.processAppEntry(ctx, ent, appDir)
			if err != nil {
				// Log error but continue
				return
			}

			if app != nil {
				mu.Lock()
				apps = append(apps, *app)
				mu.Unlock()
			}
		}(entry)
	}

	wg.Wait()

	return apps, nil
}

// processAppEntry processes a single application entry
func (aa *ApplicationsAnalyzer) processAppEntry(ctx context.Context, entry os.DirEntry, appDir string) (*scan.FileItem, error) {
	fullPath := filepath.Join(appDir, entry.Name())

	info, err := entry.Info()
	if err != nil {
		return nil, nil // Skip entries we can't stat
	}

	if entry.IsDir() {
		return aa.processAppDirectoryEntry(fullPath, entry.Name(), info)
	}

	if fileutils.IsExecutableFile(entry.Name()) {
		return aa.processAppFileEntry(fullPath, entry.Name(), info)
	}

	return nil, nil
}

// processAppDirectoryEntry processes a directory that might contain an application
func (aa *ApplicationsAnalyzer) processAppDirectoryEntry(fullPath, name string, info os.FileInfo) (*scan.FileItem, error) {
	// Check if directory contains executable files
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, nil
	}

	var executableFile string
	for _, entry := range entries {
		if !entry.IsDir() && fileutils.IsExecutableFile(entry.Name()) {
			executableFile = entry.Name()
			break
		}
	}

	if executableFile == "" {
		return nil, nil
	}

	executablePath := filepath.Join(fullPath, executableFile)
	targetPath := executablePath
	displayName := name

	// Handle shortcuts on Windows
	if runtime.GOOS == "windows" && strings.HasSuffix(strings.ToLower(executableFile), ".lnk") {
		if resolved, err := fileutils.ResolveShortcut(executablePath); err == nil && resolved != "" {
			targetPath = resolved
			displayName = fileutils.GetAppDisplayName(executableFile, resolved)
		}
	} else {
		displayName = fileutils.GetAppDisplayName(executableFile, "")
	}

	// Try to extract icon
	icon := "⚙️" // Default icon
	if runtime.GOOS == "windows" {
		if extractedIcon, err := fileutils.ExtractIconFromExecutable(targetPath); err == nil && extractedIcon != "" {
			icon = extractedIcon
		}
	}

	return &scan.FileItem{
		ID:           fileutils.GenerateFileId(fullPath),
		Name:         displayName,
		Path:         fullPath,
		Type:         "folder",
		ModifiedDate: info.ModTime(),
		RootCategory: "Applications",
		Icon:         icon,
	}, nil
}

// processAppFileEntry processes a file that is an executable application
func (aa *ApplicationsAnalyzer) processAppFileEntry(fullPath, name string, info os.FileInfo) (*scan.FileItem, error) {
	targetPath := fullPath
	displayName := name

	// Handle shortcuts on Windows
	if runtime.GOOS == "windows" && strings.HasSuffix(strings.ToLower(name), ".lnk") {
		if resolved, err := fileutils.ResolveShortcut(fullPath); err == nil && resolved != "" {
			targetPath = resolved
			displayName = fileutils.GetAppDisplayName(name, resolved)
		}
	} else {
		displayName = fileutils.GetAppDisplayName(name, "")
	}

	// Try to extract icon
	icon := "⚙️" // Default icon
	if runtime.GOOS == "windows" {
		if extractedIcon, err := fileutils.ExtractIconFromExecutable(targetPath); err == nil && extractedIcon != "" {
			icon = extractedIcon
		}
	}

	return &scan.FileItem{
		ID:           fileutils.GenerateFileId(fullPath),
		Name:         displayName,
		Path:         fullPath,
		Type:         "file",
		Size:         info.Size(),
		ModifiedDate: info.ModTime(),
		Extension:    fileutils.GetFileExtension(name),
		RootCategory: "Applications",
		Icon:         icon,
	}, nil
}

// ScanPortableApps scans for portable applications in specified directories
func (aa *ApplicationsAnalyzer) ScanPortableApps(ctx context.Context, directories []string) ([]scan.FileItem, error) {
	var allApps []scan.FileItem
	var mu sync.Mutex
	semaphore := make(chan struct{}, aa.limits.ConcurrencyLevel)

	var wg sync.WaitGroup
	errCh := make(chan error, len(directories))

	for _, dir := range directories {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		wg.Add(1)
		go func(directory string) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			apps, err := aa.scanPortableDir(ctx, directory)
			if err != nil {
				errCh <- fmt.Errorf("failed to scan portable directory %s: %w", directory, err)
				return
			}

			mu.Lock()
			allApps = append(allApps, apps...)
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
		return nil, fmt.Errorf("encountered errors during portable app scanning: %v", errs)
	}

	return allApps, nil
}

// scanPortableDir scans a single portable applications directory
func (aa *ApplicationsAnalyzer) scanPortableDir(ctx context.Context, dir string) ([]scan.FileItem, error) {
	if !fileutils.IsValidDirectory(dir) {
		return []scan.FileItem{}, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %s: %w", dir, err)
	}

	var apps []scan.FileItem
	semaphore := make(chan struct{}, aa.limits.ConcurrencyLevel)
	var mu sync.Mutex

	var wg sync.WaitGroup
	for _, entry := range entries {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		wg.Add(1)
		go func(ent os.DirEntry) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			app, err := aa.processPortableEntry(ent, dir)
			if err != nil {
				return
			}

			if app != nil {
				mu.Lock()
				apps = append(apps, *app)
				mu.Unlock()
			}
		}(entry)
	}

	wg.Wait()

	return apps, nil
}

// processPortableEntry processes a single entry in a portable applications directory
func (aa *ApplicationsAnalyzer) processPortableEntry(entry os.DirEntry, dir string) (*scan.FileItem, error) {
	fullPath := filepath.Join(dir, entry.Name())

	info, err := entry.Info()
	if err != nil {
		return nil, nil
	}

	if !entry.IsDir() && fileutils.IsExecutableFile(entry.Name()) {
		targetPath := fullPath
		displayName := entry.Name()

		// Handle shortcuts on Windows
		if runtime.GOOS == "windows" && strings.HasSuffix(strings.ToLower(entry.Name()), ".lnk") {
			if resolved, err := fileutils.ResolveShortcut(fullPath); err == nil && resolved != "" {
				targetPath = resolved
				displayName = fileutils.GetAppDisplayName(entry.Name(), resolved)
			}
		} else {
			displayName = fileutils.GetAppDisplayName(entry.Name(), "")
		}

		// Try to extract icon
		icon := "⚙️" // Default icon
		if runtime.GOOS == "windows" {
			if extractedIcon, err := fileutils.ExtractIconFromExecutable(targetPath); err == nil && extractedIcon != "" {
				icon = extractedIcon
			}
		}

		return &scan.FileItem{
			ID:           fileutils.GenerateFileId(fullPath),
			Name:         displayName,
			Path:         fullPath,
			Type:         "file",
			Size:         info.Size(),
			ModifiedDate: info.ModTime(),
			Extension:    fileutils.GetFileExtension(entry.Name()),
			RootCategory: "Applications",
			Icon:         icon,
		}, nil
	}

	return nil, nil
}
