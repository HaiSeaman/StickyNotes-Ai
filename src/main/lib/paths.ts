/* ==================== paths.ts ====================
 * 应用数据文件路径集中管理：所有 getXxxPath / getXxxDir 统一从此模块导出。
 * 日志目录（getLogDir）由 logger.ts 提供；note_history 由 note-history 模块自管。
 * =============================================== */
import path from 'path';
import { app } from 'electron';

// 便签主数据
export function getNotesPath(): string {
    return path.join(app.getPath('userData'), 'notes.json');
}
// 待办事项主数据
export function getTodosPath(): string {
    return path.join(app.getPath('userData'), 'todos.json');
}
// 待办事项归档数据
export function getArchivedTodosPath(): string {
    return path.join(app.getPath('userData'), 'todos_archived.json');
}
// 便签归档数据
export function getArchivedNotesPath(): string {
    return path.join(app.getPath('userData'), 'notes_archived.json');
}
// 便签回收站数据
export function getTrashedNotesPath(): string {
    return path.join(app.getPath('userData'), 'notes_trashed.json');
}
// AI 聊天会话主数据
export function getChatsPath(): string {
    return path.join(app.getPath('userData'), 'chats.json');
}
// 聊天归档
export function getArchivedChatsPath(): string {
    return path.join(app.getPath('userData'), 'chats_archived.json');
}
// 聊天回收站
export function getTrashedChatsPath(): string {
    return path.join(app.getPath('userData'), 'chats_trashed.json');
}
// 应用设置
export function getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
}
// 日历数据（日期↔闹钟映射）
export function getCalendarPath(): string {
    return path.join(app.getPath('userData'), 'calendar.json');
}
// 活跃度数据
export function getActivityPath(): string {
    return path.join(app.getPath('userData'), 'activity.json');
}
// 聊天图片本地存储目录
export function getChatImagesDir(): string {
    return path.join(app.getPath('userData'), 'chat-images');
}
// 音乐模块数据目录
export function getMusicDir(): string {
    return path.join(app.getPath('userData'), 'music');
}
// 音乐播放列表持久化文件
export function getMusicPlaylistPath(): string {
    return path.join(app.getPath('userData'), 'music', 'playlist.json');
}
// 音乐收藏库持久化文件
export function getMusicFavoritesPath(): string {
    return path.join(app.getPath('userData'), 'music', 'favorites.json');
}
// 音乐文件夹列表持久化文件
export function getMusicFoldersPath(): string {
    return path.join(app.getPath('userData'), 'music', 'folders.json');
}
// 音乐专辑封面缓存目录
export function getMusicCoversDir(): string {
    return path.join(app.getPath('userData'), 'music', 'covers');
}
// FM 收音机模块数据目录
export function getRadioDir(): string {
    return path.join(app.getPath('userData'), 'radio');
}
// FM 电台缓存文件
export function getRadioCachePath(): string {
    return path.join(app.getPath('userData'), 'radio', 'cache.json');
}
// FM 电台收藏列表
export function getRadioFavoritesPath(): string {
    return path.join(app.getPath('userData'), 'radio', 'favorites.json');
}
