import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Note, TodoItem, TodoGroup, ActivityData, UserSettings, SyncConfig, AiConfig, MusicMetadata, RadioConfig } from '../../types/index.js';

export class StorageManager {
  private userDataPath: string;
  private notesFile: string;
  private todosFile: string;
  private settingsFile: string;
  private activityFile: string;
  private historyDir: string;

  constructor() {
    this.userDataPath = app.getPath('userData');
    this.notesFile = path.join(this.userDataPath, 'notes.json');
    this.todosFile = path.join(this.userDataPath, 'todos.json');
    this.settingsFile = path.join(this.userDataPath, 'settings.json');
    this.activityFile = path.join(this.userDataPath, 'activity.json');
    this.historyDir = path.join(this.userDataPath, 'history');

    this.ensureDirectoryExists(this.historyDir);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      console.error(`[StorageManager] Read error for ${filePath}:`, error);
      return fallback;
    }
  }

  private writeJsonFile<T>(filePath: string, data: T): boolean {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`[StorageManager] Write error for ${filePath}:`, error);
      return false;
    }
  }

  // Note Storage
  public getNotes(): Note[] {
    return this.readJsonFile<Note[]>(this.notesFile, []);
  }

  public saveNotes(notes: Note[]): boolean {
    return this.writeJsonFile<Note[]>(this.notesFile, notes);
  }

  // Todo Storage
  public getTodos(): { groups: TodoGroup[]; items: TodoItem[] } {
    return this.readJsonFile(this.todosFile, { groups: [], items: [] });
  }

  public saveTodos(data: { groups: TodoGroup[]; items: TodoItem[] }): boolean {
    return this.writeJsonFile(this.todosFile, data);
  }

  // Settings Storage
  public getSettings(): UserSettings {
    return this.readJsonFile<UserSettings>(this.settingsFile, {
      theme: 'system',
      alwaysOnTop: false,
      autoStart: false,
      fontSize: 14
    });
  }

  public saveSettings(settings: UserSettings): boolean {
    return this.writeJsonFile<UserSettings>(this.settingsFile, settings);
  }

  // Activity Storage
  public getActivity(): ActivityData[] {
    return this.readJsonFile<ActivityData[]>(this.activityFile, []);
  }

  public saveActivity(activity: ActivityData[]): boolean {
    return this.writeJsonFile<ActivityData[]>(this.activityFile, activity);
  }

  // Note History
  public getHistory(noteId: string): any[] {
    const file = path.join(this.historyDir, `${noteId}.json`);
    return this.readJsonFile<any[]>(file, []);
  }

  public saveHistory(noteId: string, history: any[]): boolean {
    const file = path.join(this.historyDir, `${noteId}.json`);
    return this.writeJsonFile(file, history);
  }
}

export const storageManager = new StorageManager();
