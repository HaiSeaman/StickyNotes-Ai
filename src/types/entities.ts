/**
 * 便签数据模型
 */
export interface Note {
  id: string;
  title?: string;
  content: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  isPinned?: boolean;
  isCollapsed?: boolean;
  isLocked?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 便签历史快照
 */
export interface NoteHistorySnapshot {
  ts: number;
  content: string;
  locked?: boolean;
}

/**
 * 待办事项模型
 */
export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export interface TodoGroup {
  id: string;
  title: string;
  items: TodoItem[];
  color?: string;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 活跃度追踪数据模型
 */
export interface ActivityData {
  [dateStr: string]: {
    notesCreated?: number;
    todosCompleted?: number;
    aiChatsCount?: number;
    activeMinutes?: number;
  };
}

/**
 * 用户个性化设置模型
 */
export interface UserSettings {
  theme?: string;
  fontSize?: number;
  fontFamily?: string;
  autoStart?: boolean;
  alwaysOnTop?: boolean;
  closeToTray?: boolean;
  hotkeyToggle?: string;
  syncInterval?: number;
  soundEnabled?: boolean;
  [key: string]: unknown;
}

/**
 * 云同步配置
 */
export interface SyncConfig {
  provider: 'webdav' | 'github' | 'gitee' | 'onedrive' | 'custom';
  url?: string;
  user?: string;
  pass?: string;
  allowSelfSigned?: boolean;
  serverUrl?: string;
  username?: string;
  password?: string;
  token?: string;
  repo?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * AI 聊天与大模型配置
 */
export interface AiConfig {
  provider: 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ImageConfig {
  provider: 'openai' | 'stability' | 'midjourney' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  size?: string;
  quality?: string;
}

/**
 * 音频与电台模型
 */
export interface MusicMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  filePath: string;
  coverArtUrl?: string;
}

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
}

export interface RadioConfig {
  favorites: RadioStation[];
  lastStationId?: string;
  volume?: number;
}
