package analyzers

import (
	"path/filepath"
	"regexp"
	"runtime"
)

// ConfigPattern represents a configuration file pattern
type ConfigPattern struct {
	Pattern *regexp.Regexp `json:"pattern"`
	Type    string         `json:"type"`
}

// GetConfigPatterns returns configuration file patterns
func GetConfigPatterns() []ConfigPattern {
	return []ConfigPattern{
		{Pattern: regexp.MustCompile(`(?i)\.config$`), Type: "Application Config"},
		{Pattern: regexp.MustCompile(`(?i)\.ini$`), Type: "INI File"},
		{Pattern: regexp.MustCompile(`(?i)\.json$`), Type: "JSON Config"},
		{Pattern: regexp.MustCompile(`(?i)\.xml$`), Type: "XML Config"},
		{Pattern: regexp.MustCompile(`(?i)\.yaml$`), Type: "YAML Config"},
		{Pattern: regexp.MustCompile(`(?i)\.yml$`), Type: "YAML Config"},
		{Pattern: regexp.MustCompile(`(?i)\.toml$`), Type: "TOML Config"},
		{Pattern: regexp.MustCompile(`(?i)\.properties$`), Type: "Properties File"},
		{Pattern: regexp.MustCompile(`(?i)\.conf$`), Type: "Configuration File"},
		{Pattern: regexp.MustCompile(`(?i)\.cfg$`), Type: "Configuration File"},
		{Pattern: regexp.MustCompile(`(?i)\.settings$`), Type: "Settings File"},
		{Pattern: regexp.MustCompile(`(?i)\.plist$`), Type: "Property List"},
		{Pattern: regexp.MustCompile(`(?i)\.reg$`), Type: "Registry File"},
		{Pattern: regexp.MustCompile(`(?i)\.prefs$`), Type: "Preferences File"},
		{Pattern: regexp.MustCompile(`(?i)\.profile$`), Type: "Profile File"},
		{Pattern: regexp.MustCompile(`(?i)\.rc$`), Type: "RC Configuration"},
		{Pattern: regexp.MustCompile(`(?i)^\..*rc$`), Type: "RC Configuration"},
		{Pattern: regexp.MustCompile(`(?i)^\.env$`), Type: "Environment File"},
		{Pattern: regexp.MustCompile(`(?i)^config$`), Type: "Config Directory"},
		{Pattern: regexp.MustCompile(`(?i)^settings$`), Type: "Settings Directory"},
		// Additional Windows-specific config patterns
		{Pattern: regexp.MustCompile(`(?i)\.db$`), Type: "Database Config"},
		{Pattern: regexp.MustCompile(`(?i)\.sqlite$`), Type: "SQLite Database"},
		{Pattern: regexp.MustCompile(`(?i)\.key$`), Type: "Key File"},
		{Pattern: regexp.MustCompile(`(?i)\.crt$`), Type: "Certificate File"},
		{Pattern: regexp.MustCompile(`(?i)\.pem$`), Type: "Certificate File"},
		{Pattern: regexp.MustCompile(`(?i)\.p12$`), Type: "Certificate File"},
		{Pattern: regexp.MustCompile(`(?i)\.pfx$`), Type: "Certificate File"},
		{Pattern: regexp.MustCompile(`(?i)\.license$`), Type: "License File"},
		{Pattern: regexp.MustCompile(`(?i)\.lic$`), Type: "License File"},
		{Pattern: regexp.MustCompile(`(?i)^\.gitconfig$`), Type: "Git Config"},
		{Pattern: regexp.MustCompile(`(?i)^\.vscode$`), Type: "VS Code Settings"},
		{Pattern: regexp.MustCompile(`(?i)^\.npmrc$`), Type: "NPM Config"},
		{Pattern: regexp.MustCompile(`(?i)^\.dockerignore$`), Type: "Docker Config"},
		{Pattern: regexp.MustCompile(`(?i)^dockerfile$`), Type: "Docker Config"},
		{Pattern: regexp.MustCompile(`(?i)^\.babelrc$`), Type: "Babel Config"},
		{Pattern: regexp.MustCompile(`(?i)^\.eslintrc$`), Type: "ESLint Config"},
		{Pattern: regexp.MustCompile(`(?i)^\.prettierrc$`), Type: "Prettier Config"},
		{Pattern: regexp.MustCompile(`(?i)package\.json$`), Type: "Package Config"},
		{Pattern: regexp.MustCompile(`(?i)tsconfig\.json$`), Type: "TypeScript Config"},
		{Pattern: regexp.MustCompile(`(?i)webpack\.config\.js$`), Type: "Webpack Config"},
		{Pattern: regexp.MustCompile(`(?i)\.env\..*$`), Type: "Environment File"},
		{Pattern: regexp.MustCompile(`(?i)^hosts$`), Type: "System Config"},
		{Pattern: regexp.MustCompile(`(?i)\.bat$`), Type: "Batch Script"},
		{Pattern: regexp.MustCompile(`(?i)\.cmd$`), Type: "Command Script"},
		{Pattern: regexp.MustCompile(`(?i)\.ps1$`), Type: "PowerShell Script"},
	}
}

// GetApplicationDirectories returns common application directories for the current platform
func GetApplicationDirectories() []string {
	var dirs []string

	switch runtime.GOOS {
	case "windows":
		// Program Files directories
		programFiles := []string{
			filepath.Join("C:", "Program Files"),
			filepath.Join("C:", "Program Files (x86)"),
		}
		for _, pf := range programFiles {
			dirs = append(dirs, pf)
		}

		// User application directories
		homeDir, _ := getHomeDir()
		if homeDir != "" {
			userAppDirs := []string{
				filepath.Join(homeDir, "AppData", "Local"),
				filepath.Join(homeDir, "AppData", "Roaming"),
				filepath.Join(homeDir, "Applications"),
				filepath.Join(homeDir, "Programs"),
				filepath.Join(homeDir, "Software"),
				filepath.Join(homeDir, "Desktop"),
				filepath.Join(homeDir, "AppData", "Local", "Programs"),
				filepath.Join(homeDir, "scoop", "apps"),
			}
			dirs = append(dirs, userAppDirs...)
		}

		// System directories
		systemDirs := []string{
			filepath.Join("C:", "PortableApps"),
			filepath.Join("C:", "Tools"),
			filepath.Join("C:", "Apps"),
			filepath.Join("C:", "ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
		}
		dirs = append(dirs, systemDirs...)

		// Additional drive letters
		for _, drive := range []string{"D", "E", "F"} {
			dirs = append(dirs, filepath.Join(drive+":", "Program Files"))
			dirs = append(dirs, filepath.Join(drive+":", "Program Files (x86)"))
		}

	case "darwin":
		homeDir, _ := getHomeDir()
		if homeDir != "" {
			dirs = append(dirs, filepath.Join(homeDir, "Applications"))
			dirs = append(dirs, "/Applications")
			dirs = append(dirs, "/System/Applications")
		}

	case "linux":
		homeDir, _ := getHomeDir()
		if homeDir != "" {
			dirs = append(dirs, filepath.Join(homeDir, ".local", "bin"))
			dirs = append(dirs, filepath.Join(homeDir, "bin"))
			dirs = append(dirs, filepath.Join(homeDir, ".bin"))
		}

		systemDirs := []string{
			"/usr/bin",
			"/usr/local/bin",
			"/opt",
			"/snap/bin",
			"/usr/share/applications",
		}
		dirs = append(dirs, systemDirs...)
	}

	return dirs
}

// GetConfigurationDirectories returns common configuration directories for the current platform
func GetConfigurationDirectories() []string {
	var dirs []string

	homeDir, _ := getHomeDir()
	if homeDir == "" {
		return dirs
	}

	switch runtime.GOOS {
	case "windows":
		dirs = []string{
			filepath.Join(homeDir, "AppData", "Roaming"),
			filepath.Join(homeDir, "AppData", "Local"),
			filepath.Join(homeDir, ".config"),
			filepath.Join(homeDir, ".ssh"),
			filepath.Join(homeDir, ".aws"),
			filepath.Join(homeDir, ".docker"),
			filepath.Join(homeDir, ".vscode"),
			filepath.Join(homeDir, ".vs"),
			filepath.Join(homeDir, ".android"),
			filepath.Join(homeDir, ".gradle"),
			filepath.Join(homeDir, ".npm"),
			filepath.Join(homeDir, ".nuget"),
			homeDir,
		}

	case "darwin":
		dirs = []string{
			filepath.Join(homeDir, ".config"),
			filepath.Join(homeDir, ".ssh"),
			filepath.Join(homeDir, ".aws"),
			filepath.Join(homeDir, ".docker"),
			filepath.Join(homeDir, "Library", "Preferences"),
			filepath.Join(homeDir, "Library", "Application Support"),
			homeDir,
		}

	case "linux":
		dirs = []string{
			filepath.Join(homeDir, ".config"),
			filepath.Join(homeDir, ".ssh"),
			filepath.Join(homeDir, ".aws"),
			filepath.Join(homeDir, ".docker"),
			filepath.Join(homeDir, ".vscode"),
			filepath.Join(homeDir, ".npm"),
			filepath.Join(homeDir, ".git"),
			"/etc",
			homeDir,
		}
	}

	return dirs
}

// getHomeDir returns the user's home directory
func getHomeDir() (string, error) {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join("C:", "Users", "Default"), nil // Simplified for cross-platform
	default:
		return "/tmp", nil // Simplified for cross-platform
	}
}
