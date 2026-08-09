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
  done: boolean;
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
}

/**
 * 活跃度追踪数据模型
 */
export interface ActivityData {
  [dateStr: string]: {
    note?: number;
    todo?: number;
    aiChatsCount?: number;
    activeMinutes?: number;
  };
}

/**
 * 云同步配置
 */
export interface SyncConfig {
  provider: 'webdav' | 's3' | 'custom';
  url?: string;
  user?: string;
  pass?: string;
  allowSelfSigned?: boolean;
  trustedCertFingerprint?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  accessKeyEnc?: string;
  secretKeyEnc?: string;
  passEnc?: string;
  path?: string;
  autoSync?: boolean;
  autoSyncProvider?: string;
  autoSyncInterval?: number;
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
 * 用户设置模型
 */
export interface UserSettings {
  bgColor?: string | null;
  detailFontSize?: number;
  alarmVolume?: number;
  launchAtLogin?: boolean;
  [key: string]: unknown;
}

/**
 * 音乐元数据
 */
export interface MusicMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  filePath: string;
  coverArtUrl?: string;
}

/**
 * 电台模型
 */

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
  customStations?: RadioStation[];
  lastStationId?: string;
  volume?: number;
}
