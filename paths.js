/* ==================== paths.js ====================
 * 应用数据文件路径集中管理：所有 getXxxPath / getXxxDir 统一从此模块导出。
 * 从 main.js 提取，避免路径字符串散落在各处导致不一致。
 * 日志目录（getLogDir）由 logger.js 提供；note_history 由 note-history 模块自管。
 * =============================================== */
const path = require('path');
const { app } = require('electron');

// 便签主数据
function getNotesPath() {
    return path.join(app.getPath('userData'), 'notes.json');
}
// 待办事项主数据
function getTodosPath() {
    return path.join(app.getPath('userData'), 'todos.json');
}
// 待办事项归档数据
function getArchivedTodosPath() {
    return path.join(app.getPath('userData'), 'todos_archived.json');
}
// 便签归档数据
function getArchivedNotesPath() {
    return path.join(app.getPath('userData'), 'notes_archived.json');
}
// 便签回收站数据
function getTrashedNotesPath() {
    return path.join(app.getPath('userData'), 'notes_trashed.json');
}
// 聊天归档：独立 JSON 持久化，结构与 aiChats 一致，便于备份与还原
function getArchivedChatsPath() {
    return path.join(app.getPath('userData'), 'chats_archived.json');
}
// 聊天回收站
function getTrashedChatsPath() {
    return path.join(app.getPath('userData'), 'chats_trashed.json');
}
// 应用设置
function getSettingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}
// 日历数据（日期↔闹钟映射）
function getCalendarPath() {
    return path.join(app.getPath('userData'), 'calendar.json');
}
/**
 * 活跃度数据：记录每日便签编辑次数 + 待办勾选次数，供热力图展示
 * 结构：{ "2026-07-16": { note: 2, todo: 3 }, ... }
 * 轻量级：每次操作 +1，单文件 JSON，避免卡顿
 */
function getActivityPath() {
    return path.join(app.getPath('userData'), 'activity.json');
}
/**
 * 聊天图片本地存储目录：userData/chat-images/
 * 前端只保存文件名（path），通过 chatimg:// 协议按需加载，避免 base64 塞爆 localStorage。
 */
function getChatImagesDir() {
    return path.join(app.getPath('userData'), 'chat-images');
}
/**
 * 音乐模块数据目录：userData/music/
 * 子目录：covers/（专辑封面缓存）、playlist.json（播放列表持久化）
 * 主进程统一管控，渲染进程通过 musicfile:// 协议加载本地音频与封面。
 */
function getMusicDir() {
    return path.join(app.getPath('userData'), 'music');
}
/**
 * 音乐播放列表持久化文件：userData/music/playlist.json
 * 字段：[{ filePath, title, artist, album, duration, coverPath, addedAt }]
 */
function getMusicPlaylistPath() {
    return path.join(app.getPath('userData'), 'music', 'playlist.json');
}
/**
 * 音乐专辑封面缓存目录：userData/music/covers/
 * 文件名以图片内容 SHA-256 命名，避免重复存储。
 */
function getMusicCoversDir() {
    return path.join(app.getPath('userData'), 'music', 'covers');
}
/**
 * FM 收音机模块数据目录：userData/radio/
 * 子目录：cache.json（热门电台 7 天缓存）、favorites.json（收藏列表）
 */
function getRadioDir() {
    return path.join(app.getPath('userData'), 'radio');
}
/**
 * FM 电台缓存文件：userData/radio/cache.json
 * 7 天过期，避免 RadioBrowser API 不可达时无电台可用。
 */
function getRadioCachePath() {
    return path.join(app.getPath('userData'), 'radio', 'cache.json');
}
/**
 * FM 电台收藏列表：userData/radio/favorites.json
 * 用户主动收藏的电台，永久保存。
 */
function getRadioFavoritesPath() {
    return path.join(app.getPath('userData'), 'radio', 'favorites.json');
}

module.exports = {
    getNotesPath,
    getTodosPath,
    getArchivedTodosPath,
    getArchivedNotesPath,
    getTrashedNotesPath,
    getArchivedChatsPath,
    getTrashedChatsPath,
    getSettingsPath,
    getCalendarPath,
    getActivityPath,
    getChatImagesDir,
    getMusicDir,
    getMusicPlaylistPath,
    getMusicCoversDir,
    getRadioDir,
    getRadioCachePath,
    getRadioFavoritesPath,
};
