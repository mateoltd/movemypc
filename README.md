# MoveMyPC

A modern file analysis and transfer application built with Go backend and Electron frontend. Analyze your system's files, applications, and configurations, then securely transfer selected items between devices.

## Architecture

- **Backend**: Go HTTP server providing REST API for system analysis
- **Frontend**: Modern React application in Electron for the UI
- **Communication**: HTTP over localhost between Go and Electron

## Prerequisites

- **Go 1.21+** for the backend
- **Node.js 18+** and **npm** for the frontend
- **Git** for cloning the repository

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/mateoltd/movemypc
cd movemypc
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Go dependencies
cd backend/go && go mod download && cd ../..
```

### 3. Development Mode

```bash
# Start both Go backend and Electron frontend
npm run dev

# Or manually run each part:
# Terminal 1: Go backend
npm run dev:go

# Terminal 2: Electron frontend
npm start

# Or use the Makefile
make dev
```

### 4. Build for Production

```bash
# Build everything for current platform
make build

# Or use npm scripts
npm run build        # Builds Go + Electron
npm run package      # Creates distributable package
```

## Testing

### Backend Tests

```bash
# Run Go tests
cd backend/go
go test -v ./...

# With coverage
go test -v -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Frontend Tests

```bash
# Run React/Electron tests
npm test

# Run with coverage
npm test -- --coverage
```

### Run All Tests

```bash
# Run both Go and React tests
npm run test:all

# Or run individually
npm run test:go      # Go backend tests
npm test             # React/Electron tests
```

### Integration Testing

```bash
# Build and run the full application
make build
# Then run the built application to test end-to-end
```

## Development Workflow

### Backend Development (Go)

1. **Make changes** in `backend/go/`
2. **Test locally**:
   ```bash
   cd backend/go
   go run ./cmd/movemypc
   ```
3. **Run tests**:
   ```bash
   go test ./...
   ```
4. **Build for testing**:
   ```bash
   ./build/build-go.sh
   ```

### Frontend Development (React/Electron)

1. **Make changes** in `frontend/electron/src/renderer/`
2. **Start development environment**:
   ```bash
   npm run dev          # Starts both Go backend and Electron
   ```
3. **Or run components separately**:
   ```bash
   npm run dev:go       # Go backend only
   npm start            # Electron + React dev server
   ```
4. **Hot reload** is enabled - React changes reflect automatically
5. **Test individual components**:
   ```bash
   npm run start:main     # Electron main process only
   npm run start:renderer # React dev server only
   ```

### Full Development Cycle

```bash
# Quick start (both backend and frontend)
npm run dev

# Or manually in separate terminals:
# Terminal 1: Go backend
npm run dev:go

# Terminal 2: Electron + React
npm start
```

### Hot Development with File Watching

The development setup includes:
- **Go backend**: Auto-restarts on code changes
- **React frontend**: Hot module replacement
- **Electron main**: Auto-restarts on changes
- **TypeScript**: Automatic compilation

## Project Structure

```
movemypc/
├── backend/go/                    # Go backend
│   ├── cmd/movemypc/             # Main application entry
│   ├── pkg/
│   │   ├── scan/                 # Directory scanning logic
│   │   ├── analyzers/            # File/application analysis
│   │   └── fileutils/            # Cross-platform utilities
│   └── internal/api/             # HTTP handlers
├── frontend/electron/            # Electron application
│   └── src/
│       ├── main/                 # Electron main process
│       │   ├── main.ts          # Main entry point
│       │   ├── go-backend.ts    # Go backend communication
│       │   └── *.ts             # Other Electron files
│       └── renderer/            # React frontend
│           ├── App.tsx          # Main React component
│           ├── App.css          # Styles
│           └── index.tsx        # React entry point
├── build/                        # Build scripts and config
├── assets/                       # Icons and resources
├── .github/workflows/            # CI/CD pipelines
├── Makefile                      # Development shortcuts
└── package.json                  # Node.js configuration
```

## Build Scripts

### Go Backend

```bash
# Build for current platform
./build/build-go.sh

# Build for specific platform/arch
./build/build-go.sh linux amd64
./build/build-go.sh darwin arm64
./build/build-go.sh windows amd64
```

### Electron Frontend

```bash
# Development build
npm run build:main
npm run build:renderer

# Production build
npm run package
```

### Cross-platform Builds

```bash
# Build everything for current platform
make build

# Build for specific platforms
GO_PLATFORM=linux ./build/build-all.sh
GO_PLATFORM=darwin ./build/build-all.sh
GO_PLATFORM=windows ./build/build-all.sh
```

## Debugging

### Backend (Go)

- **Logs**: Go backend outputs to Electron console
- **Debug mode**: Set `LOG_LEVEL=debug` environment variable
- **API testing**: Use curl or Postman to test endpoints:
  ```bash
  curl http://localhost:31337/health
  curl -X POST http://localhost:31337/scan -H "Content-Type: application/json" -d '{"path":"."}'
  ```

### Frontend (React/Electron)

- **React DevTools**: Automatically available in development
- **Electron DevTools**: Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- **Hot reload**: Changes to React components reload automatically

### Common Issues

1. **Go backend not starting**: Check if port 31337 is available
2. **Build failures**: Ensure all dependencies are installed
3. **Permission errors**: Run with appropriate permissions for file system access

## Deployment

### Local Distribution

```bash
# Create distributable package
npm run package

# Output in release/build/ directory
```

### CI/CD

The project includes GitHub Actions workflow (`.github/workflows/ci.yml`) that:
- Tests Go and React code
- Builds binaries for multiple platforms
- Creates releases automatically

### System Requirements

- **Minimum**: 4GB RAM, 2GB disk space
- **Recommended**: 8GB RAM, modern CPU for faster scanning
- **Supported OS**: Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run the full test suite
5. Submit a pull request

### Code Quality

- **Go**: Follow standard Go conventions, use `gofmt`
- **TypeScript/React**: Use ESLint, follow React best practices
- **Tests**: Maintain >80% coverage for both Go and TypeScript


---

**Note**: This application performs deep system analysis and requires appropriate permissions to access files and directories on your system.
