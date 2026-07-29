import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private popoutWindows: Map<string, BrowserWindow> = new Map();

  public createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const preloadPath = path.join(app.getAppPath(), 'dist', 'preload.js');

    this.mainWindow = new BrowserWindow({
      width: Math.min(420, width),
      height: Math.min(680, height),
      minWidth: 320,
      minHeight: 400,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      resizable: true,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    });

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      this.mainWindow.loadFile(path.join(app.getAppPath(), 'index.html'));
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public createPopoutWindow(noteId: string): BrowserWindow {
    if (this.popoutWindows.has(noteId)) {
      const win = this.popoutWindows.get(noteId)!;
      if (!win.isDestroyed()) {
        win.focus();
        return win;
      }
      this.popoutWindows.delete(noteId);
    }

    const preloadPath = path.join(app.getAppPath(), 'dist', 'popout-preload.js');
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    const popwin = new BrowserWindow({
      width: 360,
      height: 480,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      popwin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#popout?id=${noteId}`);
    } else {
      popwin.loadFile(path.join(app.getAppPath(), 'index.html'), {
        hash: `popout?id=${noteId}`
      });
    }

    popwin.on('closed', () => {
      this.popoutWindows.delete(noteId);
    });

    this.popoutWindows.set(noteId, popwin);
    return popwin;
  }

  public closePopoutWindow(noteId: string): boolean {
    const win = this.popoutWindows.get(noteId);
    if (win && !win.isDestroyed()) {
      win.close();
      this.popoutWindows.delete(noteId);
      return true;
    }
    return false;
  }
}

export const windowManager = new WindowManager();
