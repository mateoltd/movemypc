/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path, { join } from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as fs from 'fs-extra';
import { homedir, hostname, networkInterfaces } from 'os';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { startGoBackend, stopGoBackend, backendRequest } from './go-backend';
import { startServer, connectToServer, sendData } from './network';
import discoveryService from './discovery';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

function getLocalIpAddress() {
  const nets = networkInterfaces();
  return (
    Object.keys(nets).reduce((found, name) => {
      if (found) return found;
      const networkList = nets[name]!;
      const ipv4Net = networkList.find(
        (net) => net.family === 'IPv4' && !net.internal,
      );
      return ipv4Net?.address || found;
    }, '') || '127.0.0.1'
  ); // fallback
}

ipcMain.handle('get-local-device-info', async () => {
  return {
    hostname: hostname(),
    ipAddress: getLocalIpAddress(),
  };
});

ipcMain.handle('analyze-system', async (event) => {
  try {
    // Start scan
    const scanResult = await backendRequest('/scan', {
      method: 'POST',
      body: JSON.stringify({
        path: homedir(), // Start from user home directory
        limits: {
          maxDepth: 3,
          batchSize: 10,
          progressUpdateInterval: 100,
          largeSizeThreshold: 1024 * 1024 * 1024, // 1GB
          warningDirectorySize: 1000,
          slowDirectoryThreshold: 5000,
          concurrencyLevel: 4,
        },
      }),
    });

    // Poll for progress and completion
    const pollProgress = async () => {
      try {
        const status = await backendRequest(`/scan/${scanResult.jobId}/status`);
        event.sender.send('analysis-progress', {
          phase: 'files',
          current: status.current || 0,
          total: status.total || -1,
          currentPath: status.currentPath || '',
        });

        if (status.completed) {
          // Get applications
          const apps = await backendRequest('/applications');

          // Get configurations
          const configs = await backendRequest('/configurations');

          const analysis = {
            files: status.items || [],
            apps: apps.items || [],
            configurations: configs.items || [],
          };

          event.sender.send('analysis-complete', analysis);
          return analysis;
        } else {
          // Continue polling
          setTimeout(pollProgress, 500);
        }
      } catch (error) {
        event.sender.send('analysis-error', 'Failed to get scan status');
      }
    };

    // Start polling
    setTimeout(pollProgress, 500);

    return { jobId: scanResult.jobId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    event.sender.send('analysis-error', errorMessage);
    throw error;
  }
});

ipcMain.handle('add-directory-exclusion', async (event, dirPath: string) => {
  try {
    await backendRequest('/exclusions/add', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    });
    log.info('Exclusion added:', dirPath);
  } catch (error) {
    log.error('Failed to add exclusion:', error);
    throw error;
  }
});

ipcMain.handle('remove-directory-exclusion', async (event, dirPath: string) => {
  try {
    await backendRequest('/exclusions/remove', {
      method: 'DELETE',
      body: JSON.stringify({ path: dirPath }),
    });
    log.info('Exclusion removed:', dirPath);
  } catch (error) {
    log.error('Failed to remove exclusion:', error);
    throw error;
  }
});

ipcMain.handle('get-excluded-directories', async () => {
  try {
    const response = await backendRequest('/exclusions');
    return response.exclusions || [];
  } catch (error) {
    log.error('Failed to get exclusions:', error);
    return [];
  }
});

ipcMain.handle('connect-to-server', async (event, ipAddress: string) => {
  if (mainWindow) {
    connectToServer(ipAddress, mainWindow);
  }
});

ipcMain.handle('transfer-files', async (event, selectedItems: any) => {
  sendData({ type: 'file-transfer-request', payload: selectedItems });
});

ipcMain.handle('flush-discovery', () => {
  if (mainWindow) discoveryService.flush(mainWindow);
});

ipcMain.on('file-transfer-request', (event, payload) => {
  const transferDir = join(homedir(), 'transferred-files');
  fs.ensureDirSync(transferDir);

  const { files } = payload;

  files.forEach((file: { id: string; name: string; path: string }) => {
    const destPath = join(transferDir, file.name);
    fs.copy(file.path, destPath)
      .then(() => console.log(`Copied ${file.path} to ${destPath}`))
      .catch((err: Error) => {
        console.error(`Error copying ${file.path}:`, err);
        mainWindow?.webContents.send('file-copy-error', {
          fileName: file.name,
          error: err.message,
        });
      });
  });
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  // Ensure discovery events are sent only after the renderer is ready to receive them
  mainWindow.webContents.once('did-finish-load', () => {
    discoveryService.flush(mainWindow!);
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', async () => {
  discoveryService.stopBroadcasting();

  // Stop the Go backend
  try {
    await stopGoBackend();
    log.info('Go backend stopped successfully');
  } catch (error) {
    log.error('Failed to stop Go backend:', error);
  }

  // Respect the user's preference of not quitting automatically
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    // Start the Go backend first
    try {
      await startGoBackend();
      log.info('Go backend started successfully');
    } catch (error) {
      log.error('Failed to start Go backend:', error);
      // Continue without backend - app might still work for basic functionality
    }

    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
    if (mainWindow) {
      startServer(mainWindow);
      discoveryService.startBroadcasting();
    }
  })
  .catch(console.log);
