#!/bin/bash

# Build script for Go backend binary
# Usage: ./build-go.sh [platform] [arch]
# Platforms: linux, darwin, windows
# Architectures: amd64, arm64

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
PLATFORM=${1:-$(uname -s | tr '[:upper:]' '[:lower:]')}
ARCH=${2:-amd64}

# Normalize platform names
case $PLATFORM in
  linux)
    GOOS=linux
    ;;
  darwin|macos)
    GOOS=darwin
    ;;
  windows|win32)
    GOOS=windows
    ;;
  *)
    echo "Unsupported platform: $PLATFORM"
    echo "Supported platforms: linux, darwin, windows"
    exit 1
    ;;
esac

# Normalize architecture names
case $ARCH in
  amd64|x64)
    GOARCH=amd64
    ;;
  arm64|aarch64)
    GOARCH=arm64
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    echo "Supported architectures: amd64, arm64"
    exit 1
    ;;
esac

# Set binary name
if [ "$GOOS" = "windows" ]; then
  BINARY_NAME="movemypc.exe"
else
  BINARY_NAME="movemypc"
fi

# Create output directory
OUTPUT_DIR="$PROJECT_ROOT/build/binaries/$GOOS-$GOARCH"
mkdir -p "$OUTPUT_DIR"

# Build the binary
echo "Building Go binary for $GOOS/$GOARCH..."
cd "$PROJECT_ROOT/backend/go"

GOOS=$GOOS GOARCH=$GOARCH go build \
  -ldflags="-s -w" \
  -o "$OUTPUT_DIR/$BINARY_NAME" \
  ./cmd/movemypc

if [ $? -eq 0 ]; then
  echo "Successfully built $OUTPUT_DIR/$BINARY_NAME"
  ls -la "$OUTPUT_DIR/$BINARY_NAME"
else
  echo "Failed to build Go binary"
  exit 1
fi
