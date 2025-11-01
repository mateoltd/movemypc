const { platform } = require('os');

// Determine the current platform and architecture
const currentPlatform = platform();
let goBinaryName = 'movemypc';

if (currentPlatform === 'win32') {
  goBinaryName = 'movemypc.exe';
}

module.exports = {
  productName: 'MoveMyPC',
  appId: 'org.mateo.movemypc',
  asar: true,
  afterSign: '.erb/scripts/notarize.js',
  asarUnpack: '**\\*.{node,dll}',
  files: [
    'dist',
    'node_modules',
    'package.json'
  ],
  mac: {
    notarize: false,
    target: {
      target: 'default',
      arch: [
        'arm64',
        'x64'
      ]
    },
    type: 'distribution',
    hardenedRuntime: true,
    entitlements: 'assets/entitlements.mac.plist',
    entitlementsInherit: 'assets/entitlements.mac.plist',
    gatekeeperAssess: false
  },
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ]
  },
  win: {
    target: [
      'nsis'
    ]
  },
  linux: {
    target: [
      'AppImage'
    ],
    category: 'Development'
  },
  directories: {
    app: 'release/app',
    buildResources: 'assets',
    output: 'release/build'
  },
  extraResources: [
    './assets/**',
    {
      from: `build/binaries/${getPlatformArch()}/${goBinaryName}`,
      to: `movemypc/${goBinaryName}`
    }
  ],
  publish: {
    provider: 'github',
    owner: 'mateoltd',
    repo: 'movemypc'
  },
  // Hook to ensure Go binary is built before packaging
  beforeBuild: async (context) => {
    console.log('Ensuring Go binary is built...');
    const { execSync } = require('child_process');

    try {
      // Build Go binary for current platform
      if (currentPlatform === 'win32') {
        execSync('powershell.exe -File build/build-go.ps1', { stdio: 'inherit' });
      } else {
        execSync('./build/build-go.sh', { stdio: 'inherit' });
      }
      console.log('Go binary built successfully');
    } catch (error) {
      console.error('Failed to build Go binary:', error);
      throw error;
    }
  }
};

function getPlatformArch() {
  let osName;
  let arch = 'amd64'; // Default architecture

  switch (currentPlatform) {
    case 'win32':
      osName = 'windows';
      break;
    case 'darwin':
      osName = 'darwin';
      break;
    case 'linux':
      osName = 'linux';
      break;
    default:
      osName = currentPlatform;
  }

  // Detect architecture
  const { arch: nodeArch } = process;
  if (nodeArch === 'arm64' || nodeArch === 'aarch64') {
    arch = 'arm64';
  }

  return `${osName}-${arch}`;
}
