import bonjourLib from 'bonjour-service';
import { hostname } from 'os';
import { BrowserWindow } from 'electron';

interface QueuedEvent {
  kind: 'up' | 'down';
  svc: any;
}

class Discovery {
  private bonjour: any;
  private browser: any;
  private service: any;
  private queue: QueuedEvent[] = [];
  private rendererReady = false;

  constructor() {
    // bonjour-service exports a function, not constructor
    this.bonjour = new (bonjourLib as any)();
    this.browser = this.bonjour.find({ type: 'movemypc' });

    this.browser.on('up', (svc: any) => this.enqueue('up', svc));
    this.browser.on('down', (svc: any) => this.enqueue('down', svc));
  }

  startBroadcasting(port = 9876) {
    this.service = this.bonjour.publish({
      name: `MoveMyPC (${hostname()})`,
      type: 'movemypc',
      port,
    });
  }

  stopBroadcasting() {
    this.service?.stop?.();
    this.bonjour?.destroy?.();
  }

  /** called once main window is fully ready */
  flush(win: BrowserWindow) {
    this.rendererReady = true;
    this.queue.forEach((e) => this.send(e, win));
    this.queue = [];
  }

  private enqueue(kind: 'up' | 'down', svc: any) {
    const evt: QueuedEvent = { kind, svc };
    if (this.rendererReady && BrowserWindow.getAllWindows().length) {
      this.send(evt, BrowserWindow.getAllWindows()[0]);
    } else {
      this.queue.push(evt);
    }
  }

  private send(evt: QueuedEvent, win: BrowserWindow) {
    const payload = {
      name: evt.svc.name,
      host: evt.svc.host,
      port: evt.svc.port,
    };
    win.webContents.send(`peer-${evt.kind}`, payload);
  }
}

export default new Discovery();