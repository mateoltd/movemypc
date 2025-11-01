//go:build windows

package fileutils

import (
	"fmt"
	"os/exec"
	"strings"
)

// ExtractIconFromExecutable extracts icon from a Windows executable file
func ExtractIconFromExecutable(executablePath string) (string, error) {
	// Only attempt icon extraction for .exe, .msi files
	ext := GetFileExtension(executablePath)
	if ext != "exe" && ext != "msi" {
		return "", fmt.Errorf("unsupported file type for icon extraction: %s", ext)
	}

	// PowerShell script to extract the icon
	powershellScript := fmt.Sprintf(`
		try {
			Add-Type -AssemblyName System.Drawing
			$icon = [System.Drawing.Icon]::ExtractAssociatedIcon("%s")
			if ($icon) {
				$bitmap = $icon.ToBitmap()
				$memoryStream = New-Object System.IO.MemoryStream
				$bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
				$iconBytes = $memoryStream.ToArray()
				$base64 = [System.Convert]::ToBase64String($iconBytes)
				Write-Output $base64
				$memoryStream.Dispose()
				$bitmap.Dispose()
				$icon.Dispose()
			}
		} catch {
			Write-Error "Failed to extract icon: $_"
		}
	`, strings.ReplaceAll(executablePath, `\`, `\\`))

	cmd := exec.Command("powershell", "-Command", powershellScript)
	cmd.WaitDelay = 5000000000 // 5 seconds timeout

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to execute PowerShell script: %w", err)
	}

	result := strings.TrimSpace(string(output))
	if result == "" || strings.Contains(result, "Error") {
		return "", fmt.Errorf("failed to extract icon: invalid output")
	}

	return fmt.Sprintf("data:image/png;base64,%s", result), nil
}

// ResolveShortcut resolves a Windows shortcut (.lnk) file to its target path
func ResolveShortcut(shortcutPath string) (string, error) {
	if !strings.HasSuffix(strings.ToLower(shortcutPath), ".lnk") {
		return "", fmt.Errorf("not a shortcut file: %s", shortcutPath)
	}

	// PowerShell script to resolve the shortcut target
	powershellScript := fmt.Sprintf(`
		try {
			$shell = New-Object -ComObject WScript.Shell
			$shortcut = $shell.CreateShortcut("%s")
			Write-Output $shortcut.TargetPath
		} catch {
			Write-Error "Failed to resolve shortcut: $_"
		}
	`, strings.ReplaceAll(shortcutPath, `\`, `\\`))

	cmd := exec.Command("powershell", "-Command", powershellScript)
	cmd.WaitDelay = 3000000000 // 3 seconds timeout

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to execute PowerShell script: %w", err)
	}

	targetPath := strings.TrimSpace(string(output))
	if targetPath == "" || strings.Contains(targetPath, "Error") {
		return "", fmt.Errorf("failed to resolve shortcut: invalid output")
	}

	return targetPath, nil
}
