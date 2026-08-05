import {
  Note,
  NoteHistorySnapshot,
  TodoItem,
  ActivityData,
  UserSettings,
  SyncConfig,
  AiConfig,
  ImageConfig,
  MusicMetadata,
  RadioStation,
  RadioConfig
} from './entities.js';

/**
 * ipcRenderer.invoke / ipcMain.handle 类型的双向通信契约表
 */
export interface IpcChannelMap {
  // 独立便签与待办窗口
  'note:popout': (data: { noteId: string; title: string; content: string }) => boolean;
  'todo:popout': (data: { noteId: string; title: string; todos: unknown }) => boolean;
  'popout:close-by-id': (params: { noteId: string; type?: 'note' | 'todo' }) => boolean;
  'popout:toggle-pin': (params: { noteId: string; type: 'note' | 'todo' }) => boolean;

  // 数据持久化（便签/待办/聊天/日历/活跃度/设置）
  'notes:load': () => Note[];
  'notes:save': (notes: Note[]) => boolean;
  'notes:load-archived': () => Note[];
  'notes:save-archived': (notes: Note[]) => boolean;
  'notes:load-trashed': () => Note[];
  'notes:save-trashed': (notes: Note[]) => boolean;
  'todos:load': () => TodoItem[];
  'todos:save': (todos: TodoItem[]) => boolean;
  'todos:load-archived': () => TodoItem[];
  'todos:save-archived': (todos: TodoItem[]) => boolean;
  'chat:load': () => unknown[];
  'chat:save': (chats: unknown[]) => boolean;
  'chat:load-archived': () => unknown[];
  'chat:save-archived': (chats: unknown[]) => boolean;
  'chat:load-trashed': () => unknown[];
  'chat:save-trashed': (chats: unknown[]) => boolean;
  'calendar:load': () => Record<string, unknown>;
  'calendar:save': (data: Record<string, unknown>) => boolean;
  'activity:load': () => ActivityData;
  'activity:increment': (payload: { type: string; date?: string }) => ActivityData;
  'settings:load': () => UserSettings;
  'settings:save': (settings: UserSettings) => boolean;

  // 历史版本快照
  'note-history:snapshot': (payload: { noteId: string; content: string }) => boolean;
  'note-history:list': (noteId: string) => NoteHistorySnapshot[];
  'note-history:clear': (noteId: string) => boolean;
  'note-history:toggle-lock': (payload: { noteId: string; ts: number }) => boolean;

  // 云同步
  'sync:load-config': () => SyncConfig;
  'sync:save-config': (config: SyncConfig) => boolean;
  'sync:test': (providerKey: string, config: SyncConfig) => { success: boolean; message?: string };
  'sync:upload': (providerKey: string) => { success: boolean; message?: string };
  'sync:list-backups': (providerKey: string) => Array<{ id: string; name: string; size?: number; updatedAt?: string }>;
  'sync:delete-backup': (providerKey: string, fileId: string) => boolean;
  'sync:restore-backup': (providerKey: string, fileId: string) => boolean;

  // 窗口控制与密码锁
  'window:minimize': () => void;
  'window:close': () => void;
  'window:maximize': () => void;
  'window:resize': (w: number, h: number) => void;
  'alarm:show-window': () => void;
  'toggle-pin': () => boolean;
  'get-pin-state': () => boolean;
  'toggle-fixed': () => boolean;
  'get-fixed-state': () => boolean;
  'lock:set-pin': (pin: string) => boolean;
  'lock:verify-pin': (pin: string) => boolean;
  'lock:has-pin': () => boolean;
  'lock:clear-pin': (pin?: string) => { success: boolean; message?: string };
  'lock:set-app-locked': (locked: boolean) => boolean;
  'lock:is-app-locked': () => boolean;
  'startup:set': (open: boolean) => boolean;
  'startup:get': () => boolean;

  // 剪贴板与导出
  'chat:export-markdown': (payload: { title: string; content: string }) => boolean;
  'clipboard:write-text': (text: string) => void;
  'clipboard:write-image': (dataUrl: string) => void;

  // AI 大模型与生成式工具
  'ai:save-config': (config: AiConfig) => boolean;
  'ai:load-config': () => AiConfig;
  'ai:fetch-models': (baseUrl: string, apiKey: string) => string[];
  'ai:generate': (userContent: string) => string;
  'ai:chat': (payload: { messages: unknown[]; stream?: boolean }) => unknown;
  'chat:abort': () => void;
  'chat:save-image': (dataUrl: string) => string;
  'chat:delete-image': (fileName: string) => boolean;
  'chat:delete-images-batch': (paths: string[]) => { success: boolean; deletedCount?: number; error?: string };
  'ai:save-custom-size': (size: string) => boolean;
  'ai:load-custom-size': () => string;
  'ai:save-image-config': (config: ImageConfig) => boolean;
  'ai:load-image-config': () => ImageConfig;
  'ai:generate-image': (params: unknown) => unknown;
  'ai:generate-video': (params: unknown) => unknown;
  'ai:abort-video': () => void;

  // 音乐播放器
  'music:pick-files': () => string[];
  'music:pick-folder': () => string | null;
  'music:scan-folder': (payload: { folderPath: string; recursive?: boolean }) => string[];
  'music:read-metadata': (payload: { filePath: string }) => MusicMetadata;
  'music:load-playlist': () => string[];
  'music:save-playlist': (playlist: string[]) => boolean;

  // 网络电台
  'radio:load-config': () => RadioConfig;
  'radio:save-config': (config: RadioConfig) => boolean;
  'radio:get-servers': () => string[];
  'radio:get-topstations': (payload?: { limit?: number }) => RadioStation[];
  'radio:get-cnhk-music-stations': (payload?: { limit?: number }) => RadioStation[];
  'radio:get-stations-by-source': (opts?: { source?: string; limit?: number }) => RadioStation[];
  'radio:search': (opts?: { keyword?: string; country?: string; tag?: string; limit?: number }) => RadioStation[];
  'radio:load-favorites': () => RadioStation[];
  'radio:save-favorites': (favorites: RadioStation[]) => boolean;
  'radio:clear-cache': () => boolean;

  // 日志管理
  'log:report': (data: unknown) => boolean;
  'logs:get': (filter?: unknown) => unknown[];
  'logs:refresh': (filter?: unknown) => unknown[];
  'logs:meta': () => unknown;
  'logs:copy-all': (text: string) => boolean;
  'logs:clear': () => boolean;
}

/**
 * ipcRenderer.send / ipcMain.on 类型的单向消息传递契约表
 */
export interface IpcEventMap {
  'popout-note:input': (data: { noteId: string; content: string }) => void;
  'popout-note:push-from-main': (data: { noteId: string; content: string }) => void;
  'popout-todo:input': (data: { noteId: string; todos: unknown }) => void;
  'popout-todo:push-from-main': (data: { noteId: string; todos: unknown }) => void;
  'popout:close-current': () => void;
}

/**
 * ipcRenderer.sendSync 类型的同步消息传递契约表
 */
export interface IpcSyncMap {
  'log:report-sync': (data: unknown) => boolean;
}
