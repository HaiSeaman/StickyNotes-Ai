import { ipcMain } from 'electron';
import { storageManager } from '../managers/storageManager.js';
import { windowManager } from '../managers/windowManager.js';
import { securityManager } from '../managers/securityManager.js';
import { Note, TodoItem, TodoGroup, UserSettings, ActivityData } from '../../types/index.js';

export function registerIpcHandlers(): void {
  // Notes
  ipcMain.handle('notes:get', () => {
    return storageManager.getNotes();
  });

  ipcMain.handle('notes:save', (_event, notes: Note[]) => {
    securityManager.assertPayloadSize(notes, undefined, 'notes:save');
    return storageManager.saveNotes(notes);
  });

  ipcMain.handle('popout:create', (_event, noteId: string) => {
    windowManager.createPopoutWindow(noteId);
    return { success: true };
  });

  ipcMain.handle('popout:close', (_event, noteId: string) => {
    return { success: windowManager.closePopoutWindow(noteId) };
  });

  // Todos
  ipcMain.handle('todos:get', () => {
    return storageManager.getTodos();
  });

  ipcMain.handle('todos:save', (_event, data: { groups: TodoGroup[]; items: TodoItem[] }) => {
    securityManager.assertPayloadSize(data, undefined, 'todos:save');
    return storageManager.saveTodos(data);
  });

  // Settings
  ipcMain.handle('settings:get', () => {
    return storageManager.getSettings();
  });

  ipcMain.handle('settings:save', (_event, settings: UserSettings) => {
    securityManager.assertPayloadSize(settings, undefined, 'settings:save');
    return storageManager.saveSettings(settings);
  });

  // Activity
  ipcMain.handle('activity:get', () => {
    return storageManager.getActivity();
  });

  ipcMain.handle('activity:save', (_event, activity: ActivityData[]) => {
    securityManager.assertPayloadSize(activity, undefined, 'activity:save');
    return storageManager.saveActivity(activity);
  });

  // Note History
  ipcMain.handle('notes:get-history', (_event, noteId: string) => {
    return storageManager.getHistory(noteId);
  });

  ipcMain.handle('notes:save-history', (_event, { noteId, history }: { noteId: string; history: any[] }) => {
    securityManager.assertPayloadSize(history, undefined, 'notes:save-history');
    return storageManager.saveHistory(noteId, history);
  });
}
