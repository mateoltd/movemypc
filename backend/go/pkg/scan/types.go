package scan

import "time"

// FileItem represents a file or directory item
type FileItem struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Path         string     `json:"path"`
	Type         string     `json:"type"` // "file" or "folder"
	Size         int64      `json:"size,omitempty"`
	Children     []FileItem `json:"children,omitempty"`
	Parent       string     `json:"parent,omitempty"`
	ModifiedDate time.Time  `json:"modifiedDate,omitempty"`
	Extension    string     `json:"extension,omitempty"`
	RootCategory string     `json:"rootCategory,omitempty"`
	Icon         string     `json:"icon,omitempty"`
}

// AnalysisWarning represents a warning during analysis
type AnalysisWarning struct {
	Type      string `json:"type"` // "large_directory", "slow_directory", "permission_denied"
	Path      string `json:"path"`
	Details   string `json:"details"`
	FileCount int    `json:"fileCount,omitempty"`
	CanExclude bool  `json:"canExclude"`
}

// AnalysisProgress represents progress information
type AnalysisProgress struct {
	Phase      string           `json:"phase"` // "files", "apps", "configurations"
	Current    int              `json:"current"`
	Total      int              `json:"total"`
	CurrentPath string          `json:"currentPath,omitempty"`
	Warning    *AnalysisWarning `json:"warning,omitempty"`
}

// AnalysisLimits contains configuration limits for analysis
type AnalysisLimits struct {
	MaxDepth               int `json:"maxDepth"`
	BatchSize              int `json:"batchSize"`
	ProgressUpdateInterval int `json:"progressUpdateInterval"`
	LargeSizeThreshold     int64 `json:"largeSizeThreshold"`
	WarningDirectorySize   int `json:"warningDirectorySize"`
	SlowDirectoryThreshold int `json:"slowDirectoryThreshold"`
	ConcurrencyLevel       int `json:"concurrencyLevel"`
}

// ScanRequest represents a scan request
type ScanRequest struct {
	Path           string         `json:"path"`
	Limits         AnalysisLimits `json:"limits"`
	RootCategory   string         `json:"rootCategory,omitempty"`
	ParentID       string         `json:"parentId,omitempty"`
	Depth          int            `json:"depth"`
}

// ScanResult represents the result of a scan operation
type ScanResult struct {
	Items    []FileItem `json:"items"`
	Warnings []AnalysisWarning `json:"warnings,omitempty"`
	Error    string     `json:"error,omitempty"`
}

// ExclusionManager manages path exclusions
type ExclusionManager interface {
	IsExcluded(path string) bool
	AddExclusion(path string)
	RemoveExclusion(path string)
	GetExclusions() []string
}
