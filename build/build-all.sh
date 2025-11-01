#!/bin/bash

# Complete build script for MoveMyPC
# Builds Go backend and Electron frontend for multiple platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building MoveMyPC..."
echo "Project root: $PROJECT_ROOT"

# Function to build for a specific platform/arch
build_for_platform() {
  local platform=$1
  local arch=$2

  echo "========================================="
  echo "Building for $platform/$arch"
  echo "========================================="

  # Build Go binary
  echo "Building Go binary..."
  "$SCRIPT_DIR/build-go.sh" "$platform" "$arch"

  # Set electron-builder environment variables
  export GO_PLATFORM="$platform"
  export GO_ARCH="$arch"

  # Build Electron app
  echo "Building Electron app..."
  cd "$PROJECT_ROOT"

  if [ "$platform" = "windows" ]; then
    npm run build:main
    npm run build:renderer
    npx electron-builder build --win --publish=never
  elif [ "$platform" = "darwin" ]; then
    npm run build:main
    npm run build:renderer
    npx electron-builder build --mac --publish=never
  elif [ "$platform" = "linux" ]; then
    npm run build:main
    npm run build:renderer
    npx electron-builder build --linux --publish=never
  fi
}

# Build configurations
# Note: Adjust these based on your target platforms
PLATFORMS=("linux" "darwin" "windows")
ARCHS=("amd64" "arm64")

echo "Available platforms: ${PLATFORMS[*]}"
echo "Available architectures: ${ARCHS[*]}"

# Detect current platform for default build
CURRENT_PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
case $CURRENT_PLATFORM in
  linux)
    DEFAULT_PLATFORM="linux"
    ;;
  darwin)
    DEFAULT_PLATFORM="darwin"
    ;;
  mingw*|msys*|win32)
    DEFAULT_PLATFORM="windows"
    ;;
  *)
    DEFAULT_PLATFORM="linux"
    ;;
esac

# Allow overriding with environment variables
BUILD_PLATFORM=${GO_PLATFORM:-$DEFAULT_PLATFORM}
BUILD_ARCH=${GO_ARCH:-amd64}

echo "Building for platform: $BUILD_PLATFORM"
echo "Building for architecture: $BUILD_ARCH"

# Build for specified platform/arch
build_for_platform "$BUILD_PLATFORM" "$BUILD_ARCH"

echo "========================================="
echo "Build completed successfully!"
echo "Output available in: $PROJECT_ROOT/release/build"
echo "========================================="
