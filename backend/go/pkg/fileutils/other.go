//go:build !windows

package fileutils

import (
	"fmt"
)

// ExtractIconFromExecutable is only supported on Windows
func ExtractIconFromExecutable(executablePath string) (string, error) {
	return "", fmt.Errorf("icon extraction is only supported on Windows")
}

// ResolveShortcut is only supported on Windows
func ResolveShortcut(shortcutPath string) (string, error) {
	return "", fmt.Errorf("shortcut resolution is only supported on Windows")
}
