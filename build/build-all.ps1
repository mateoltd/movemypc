# Complete build script for MoveMyPC
# Builds Go backend and Electron frontend for multiple platforms

param(
  [string]$Platform = "",
  [string]$Arch = "amd64"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Building MoveMyPC..." -ForegroundColor Green
Write-Host "Project root: $ProjectRoot"

# Function to build for a specific platform/arch
function Build-ForPlatform {
  param(
    [string]$Platform,
    [string]$Arch
  )

  Write-Host "=========================================" -ForegroundColor Yellow
  Write-Host "Building for $Platform/$Arch" -ForegroundColor Yellow
  Write-Host "=========================================" -ForegroundColor Yellow

  # Build Go binary
  Write-Host "Building Go binary..." -ForegroundColor Cyan
  & "$ScriptDir\build-go.ps1" -Platform $Platform -Arch $Arch

  # Set environment variables for electron-builder
  $env:GO_PLATFORM = $Platform
  $env:GO_ARCH = $Arch

  # Build Electron app
  Write-Host "Building Electron app..." -ForegroundColor Cyan
  Push-Location $ProjectRoot

  try {
    & npm run build:main
    & npm run build:renderer

    switch ($Platform) {
      "windows" {
        & npx electron-builder build --win --publish=never
      }
      "darwin" {
        & npx electron-builder build --mac --publish=never
      }
      "linux" {
        & npx electron-builder build --linux --publish=never
      }
    }
  } finally {
    Pop-Location
  }
}

# Detect current platform for default build
if (-not $Platform) {
  if ($IsWindows) {
    $Platform = "windows"
  } elseif ($IsMacOS) {
    $Platform = "darwin"
  } elseif ($IsLinux) {
    $Platform = "linux"
  } else {
    $Platform = "windows" # Default fallback
  }
}

Write-Host "Building for platform: $Platform" -ForegroundColor Green
Write-Host "Building for architecture: $Arch" -ForegroundColor Green

# Build for specified platform/arch
Build-ForPlatform -Platform $Platform -Arch $Arch

Write-Host "=========================================" -ForegroundColor Yellow
Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "Output available in: $ProjectRoot\release\build" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Yellow
