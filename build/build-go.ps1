# Build script for Go backend binary
# Usage: .\build-go.ps1 [-Platform <platform>] [-Arch <arch>]
# Platforms: linux, darwin, windows
# Architectures: amd64, arm64

param(
  [string]$Platform = "",
  [string]$Arch = "amd64"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Default platform detection
if (-not $Platform) {
  if ($IsWindows) {
    $Platform = "windows"
  } elseif ($IsMacOS) {
    $Platform = "darwin"
  } elseif ($IsLinux) {
    $Platform = "linux"
  } else {
    $Platform = $env:OS.ToLower()
  }
}

# Normalize platform names
switch ($Platform.ToLower()) {
  {$_ -in @("linux")} {
    $GOOS = "linux"
  }
  {$_ -in @("darwin", "macos")} {
    $GOOS = "darwin"
  }
  {$_ -in @("windows", "win32")} {
    $GOOS = "windows"
  }
  default {
    Write-Error "Unsupported platform: $Platform"
    Write-Host "Supported platforms: linux, darwin, windows"
    exit 1
  }
}

# Normalize architecture names
switch ($Arch.ToLower()) {
  {$_ -in @("amd64", "x64")} {
    $GOARCH = "amd64"
  }
  {$_ -in @("arm64", "aarch64")} {
    $GOARCH = "arm64"
  }
  default {
    Write-Error "Unsupported architecture: $Arch"
    Write-Host "Supported architectures: amd64, arm64"
    exit 1
  }
}

# Set binary name
if ($GOOS -eq "windows") {
  $BinaryName = "movemypc.exe"
} else {
  $BinaryName = "movemypc"
}

# Create output directory
$OutputDir = Join-Path $ProjectRoot "build/binaries/$GOOS-$GOARCH"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Build the binary
Write-Host "Building Go binary for $GOOS/$GOARCH..."
Push-Location (Join-Path $ProjectRoot "backend/go")

try {
  $env:GOOS = $GOOS
  $env:GOARCH = $GOARCH

  & go build `
    -ldflags="-s -w" `
    -o "$OutputDir/$BinaryName" `
    ./cmd/movemypc

  if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully built $OutputDir/$BinaryName"
    Get-Item "$OutputDir/$BinaryName" | Select-Object Name, Length, LastWriteTime
  } else {
    Write-Error "Failed to build Go binary"
    exit 1
  }
} finally {
  Pop-Location
}
