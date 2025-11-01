package scan

import (
	"path/filepath"
	"sync"
)

// SimpleExclusionManager implements ExclusionManager interface
type SimpleExclusionManager struct {
	excludedPaths map[string]bool
	mu            sync.RWMutex
}

// NewSimpleExclusionManager creates a new exclusion manager
func NewSimpleExclusionManager() *SimpleExclusionManager {
	return &SimpleExclusionManager{
		excludedPaths: make(map[string]bool),
	}
}

// IsExcluded checks if a path is excluded
func (em *SimpleExclusionManager) IsExcluded(path string) bool {
	em.mu.RLock()
	defer em.mu.RUnlock()

	cleanPath := filepath.Clean(path)

	// Check exact match
	if em.excludedPaths[cleanPath] {
		return true
	}

	// Check if any parent directory is excluded
	for p := cleanPath; p != "." && p != "/"; p = filepath.Dir(p) {
		if em.excludedPaths[p] {
			return true
		}
	}

	return false
}

// AddExclusion adds a path to exclusions
func (em *SimpleExclusionManager) AddExclusion(path string) {
	em.mu.Lock()
	defer em.mu.Unlock()

	em.excludedPaths[filepath.Clean(path)] = true
}

// RemoveExclusion removes a path from exclusions
func (em *SimpleExclusionManager) RemoveExclusion(path string) {
	em.mu.Lock()
	defer em.mu.Unlock()

	delete(em.excludedPaths, filepath.Clean(path))
}

// AddPatternExclusion adds exclusion based on pattern matching
func (em *SimpleExclusionManager) AddPatternExclusion(pattern string) error {
	// For now, just treat as literal path
	em.AddExclusion(pattern)
	return nil
}

// GetExclusions returns a copy of all excluded paths
func (em *SimpleExclusionManager) GetExclusions() []string {
	em.mu.RLock()
	defer em.mu.RUnlock()

	paths := make([]string, 0, len(em.excludedPaths))
	for path := range em.excludedPaths {
		paths = append(paths, path)
	}

	return paths
}
