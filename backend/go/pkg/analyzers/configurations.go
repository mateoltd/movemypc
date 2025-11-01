package analyzers

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/mateoltd/movemypc/backend/go/pkg/fileutils"
	"github.com/mateoltd/movemypc/backend/go/pkg/scan"
)

// ConfigurationsAnalyzer handles configuration file discovery and analysis
type ConfigurationsAnalyzer struct {
	limits     scan.AnalysisLimits
	progressCh chan<- scan.AnalysisProgress
	patterns   []ConfigPattern
}

// NewConfigurationsAnalyzer creates a new configurations analyzer
func NewConfigurationsAnalyzer(limits scan.AnalysisLimits, progressCh chan<- scan.AnalysisProgress) *ConfigurationsAnalyzer {
	return &ConfigurationsAnalyzer{
		limits:     limits,
		progressCh: progressCh,
		patterns:   GetConfigPatterns(),
	}
}

// AnalyzeConfigurations analyzes system configuration files
func (ca *ConfigurationsAnalyzer) AnalyzeConfigurations(ctx context.Context) ([]scan.FileItem, error) {
	configDirs := GetConfigurationDirectories()
	var allConfigs []scan.FileItem
	var mu sync.Mutex
	semaphore := make(chan struct{}, ca.limits.ConcurrencyLevel)

	var wg sync.WaitGroup
	errCh := make(chan error, len(configDirs))

	for i, configDir := range configDirs {
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
			case ca.progressCh <- scan.AnalysisProgress{
				Phase:       "configurations",
				Current:     index,
				Total:       len(configDirs),
				CurrentPath: dir,
			}:
			default:
			}

			configs, err := ca.processConfigDirectory(ctx, dir)
			if err != nil {
				errCh <- fmt.Errorf("failed to process config directory %s: %w", dir, err)
				return
			}

			mu.Lock()
			allConfigs = append(allConfigs, configs...)
			mu.Unlock()
		}(configDir, i)
	}

	wg.Wait()
	close(errCh)

	// Check for errors
	var errs []error
	for err := range errCh {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return nil, fmt.Errorf("encountered errors during configuration analysis: %v", errs)
	}

	return allConfigs, nil
}

// processConfigDirectory processes a single configuration directory
func (ca *ConfigurationsAnalyzer) processConfigDirectory(ctx context.Context, configDir string) ([]scan.FileItem, error) {
	if !fileutils.IsValidDirectory(configDir) {
		return []scan.FileItem{}, nil
	}

	// Use the scanner to scan the directory
	scanner := scan.NewScanner(nil, ca.limits, ca.progressCh)
	req := scan.ScanRequest{
		Path:         configDir,
		Limits:       ca.limits,
		RootCategory: "Configurations",
		Depth:        0,
	}

	result, err := scanner.ScanDirectory(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to scan directory %s: %w", configDir, err)
	}

	// Filter for configuration files
	configFiles := ca.filterConfigurationFiles(result.Items)

	return configFiles, nil
}

// filterConfigurationFiles filters files to find configuration files based on patterns
func (ca *ConfigurationsAnalyzer) filterConfigurationFiles(files []scan.FileItem) []scan.FileItem {
	var configFiles []scan.FileItem

	var checkFileForConfig func(file scan.FileItem)
	checkFileForConfig = func(file scan.FileItem) {
		if file.Type == "file" {
			// Check if file matches any configuration pattern
			for _, pattern := range ca.patterns {
				if pattern.Pattern.MatchString(strings.ToLower(file.Name)) {
					configFile := file
					configFile.RootCategory = "Configurations"
					configFiles = append(configFiles, configFile)
					break
				}
			}
		}

		// Recursively check children if it's a folder
		for _, child := range file.Children {
			checkFileForConfig(child)
		}
	}

	for _, file := range files {
		checkFileForConfig(file)
	}

	return configFiles
}

// ScanUserConfigurations scans for configuration files in user-specified directories
func (ca *ConfigurationsAnalyzer) ScanUserConfigurations(ctx context.Context, directories []string) ([]scan.FileItem, error) {
	var allConfigs []scan.FileItem
	var mu sync.Mutex
	semaphore := make(chan struct{}, ca.limits.ConcurrencyLevel)

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

			configs, err := ca.scanUserConfigDir(ctx, directory)
			if err != nil {
				errCh <- fmt.Errorf("failed to scan user config directory %s: %w", directory, err)
				return
			}

			mu.Lock()
			allConfigs = append(allConfigs, configs...)
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
		return nil, fmt.Errorf("encountered errors during user configuration scanning: %v", errs)
	}

	return allConfigs, nil
}

// scanUserConfigDir scans a single user configuration directory
func (ca *ConfigurationsAnalyzer) scanUserConfigDir(ctx context.Context, dir string) ([]scan.FileItem, error) {
	if !fileutils.IsValidDirectory(dir) {
		return []scan.FileItem{}, nil
	}

	// Use the scanner to scan the directory
	scanner := scan.NewScanner(nil, ca.limits, ca.progressCh)
	req := scan.ScanRequest{
		Path:         dir,
		Limits:       ca.limits,
		RootCategory: "Configurations",
		Depth:        0,
	}

	result, err := scanner.ScanDirectory(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to scan directory %s: %w", dir, err)
	}

	// Filter for configuration files
	configFiles := ca.filterConfigurationFiles(result.Items)

	return configFiles, nil
}

// GetConfigurationPatterns returns the configuration patterns used by the analyzer
func (ca *ConfigurationsAnalyzer) GetConfigurationPatterns() []ConfigPattern {
	patterns := make([]ConfigPattern, len(ca.patterns))
	copy(patterns, ca.patterns)
	return patterns
}
