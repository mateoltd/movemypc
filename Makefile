# Makefile for MoveMyPC development

.PHONY: help build build-go build-electron test test-go test-electron clean install dev

# Default target
help:
	@echo "Available targets:"
	@echo "  build         - Build both Go backend and Electron frontend"
	@echo "  build-go      - Build Go backend only"
	@echo "  build-electron- Build Electron frontend only"
	@echo "  test          - Run all tests"
	@echo "  test-go       - Run Go tests only"
	@echo "  test-electron - Run Electron tests only"
	@echo "  clean         - Clean build artifacts"
	@echo "  install       - Install dependencies"
	@echo "  dev           - Start development environment"

# Build targets
build: build-go build-electron

build-go:
	@echo "Building Go backend..."
	@./build/build-go.sh

build-electron:
	@echo "Building Electron frontend..."
	@npm run build:main
	@npm run build:renderer
	@npx electron-builder build --publish=never

# Test targets
test: test-go test-electron

test-go:
	@echo "Running Go tests..."
	@cd backend/go && go test -v -race ./...

test-electron:
	@echo "Running Electron tests..."
	@npm test

# Development
dev:
	@echo "Starting development environment..."
	@npm run start

install:
	@echo "Installing dependencies..."
	@npm ci
	@cd backend/go && go mod download

# Clean
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf build/binaries
	@rm -rf release
	@rm -rf dist
	@cd backend/go && go clean ./...

# Platform-specific builds
build-linux:
	@GO_PLATFORM=linux ./build/build-all.sh

build-windows:
	@GO_PLATFORM=windows ./build/build-all.sh

build-macos:
	@GO_PLATFORM=darwin ./build/build-all.sh
