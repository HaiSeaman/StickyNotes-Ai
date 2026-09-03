/**
 * 跨模块共享类型
 * 清理说明：历史类型（Note/TodoItem/AiConfig/ImageConfig/RadioStation/
 * MusicMetadata/ActivityData/UserSettings 等）此前只在无人 import 的
 * ipc.ts 契约文件中互相引用，属死代码，已随死文件一并移除。
 * 本文件仅保留生产代码（syncService.ts）实际消费的类型。
 */

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