import { app, BrowserWindow } from 'electron';
import { windowManager } from './managers/windowManager.js';
import { registerIpcHandlers } from './ipc/index.js';

app.whenReady().then(() => {
  registerIpcHandlers();
  windowManager.createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
