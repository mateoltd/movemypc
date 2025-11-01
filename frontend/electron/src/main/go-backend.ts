import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import log from 'electron-log';
import path from 'path';
// Using built-in fetch (Node.js 18+)

const GO_BINARY_NAME = 'movemypc';
const GO_PORT = 31337;
const GO_HOST = 'http://localhost';

class GoBackendManager {
  private goProcess: ChildProcess | null = null;
  private isReady = false;
  private baseUrl = `${GO_HOST}:${GO_PORT}`;

  /**
   * Starts the Go backend process
   */
  async start(): Promise<void> {
    if (this.goProcess) {
      log.info('Go backend is already running');
      return;
    }

    try {
      const { command, args } = this.getGoCommand();

      log.info('Starting Go backend with command:', command, args);

      this.goProcess = spawn(command, args, {
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: app.isPackaged ? undefined : path.join(process.cwd(), 'backend', 'go'),
      });

      // Handle process output
      this.goProcess.stdout?.on('data', (data) => {
        log.info('[Go Backend]', data.toString());
      });

      this.goProcess.stderr?.on('data', (data) => {
        log.error('[Go Backend]', data.toString());
      });

      this.goProcess.on('exit', (code) => {
        log.info('Go backend exited with code:', code);
        this.isReady = false;
        this.goProcess = null;
      });

      this.goProcess.on('error', (error) => {
        log.error('Failed to start Go backend:', error);
        this.isReady = false;
      });

      // Wait for the backend to be ready
      await this.waitForReady();

    } catch (error) {
      log.error('Failed to start Go backend:', error);
      throw error;
    }
  }

  /**
   * Stops the Go backend process
   */
  async stop(): Promise<void> {
    if (!this.goProcess) {
      return;
    }

    log.info('Stopping Go backend...');

    // Try graceful shutdown first
    try {
      await fetch(`${this.baseUrl}/shutdown`, { method: 'POST' });
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      log.warn('Graceful shutdown failed, forcing kill');
    }

    // Force kill if still running
    if (this.goProcess && !this.goProcess.killed) {
      this.goProcess.kill('SIGTERM');

      // Wait a bit more
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (this.goProcess && !this.goProcess.killed) {
            this.goProcess.kill('SIGKILL');
          }
        }, 5000);

        this.goProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve(undefined);
        });
      });
    }

    this.goProcess = null;
    this.isReady = false;
  }

  /**
   * Checks if the Go backend is ready
   */
  async isBackendReady(): Promise<boolean> {
    if (!this.goProcess || this.goProcess.killed) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { status: string };
        return data.status === 'ok';
      }
    } catch (error) {
      // Backend not ready
    }

    return false;
  }

  /**
   * Makes an HTTP request to the Go backend
   */
  async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.isReady) {
      throw new Error('Go backend is not ready');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Waits for the Go backend to be ready
   */
  private async waitForReady(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isBackendReady()) {
        this.isReady = true;
        log.info('Go backend is ready');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Go backend failed to start within timeout');
  }

  /**
   * Gets the command and args to start the Go backend
   */
  private getGoCommand(): { command: string; args: string[] } {
    if (app.isPackaged) {
      // In packaged app, binary is in resources
      return {
        command: path.join(process.resourcesPath, 'movemypc', GO_BINARY_NAME),
        args: []
      };
    } else {
      // In development, run go directly
      return {
        command: 'go',
        args: ['run', './cmd/movemypc']
      };
    }
  }
}

// Global instance
const goBackend = new GoBackendManager();

export default goBackend;

// Export functions for backward compatibility
export const startGoBackend = () => goBackend.start();
export const stopGoBackend = () => goBackend.stop();
export const isBackendReady = () => goBackend.isBackendReady();
export const backendRequest = (endpoint: string, options?: RequestInit) =>
  goBackend.request(endpoint, options);
