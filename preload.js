const { contextBridge, ipcRenderer } = require('electron');

/**
 * 安全地向渲染进程暴露 API。
 * 渲染进程通过 window.api 访问。
 */
// 包装回调：渲染层回调抛错时不影响 IPC 消息派发，避免未捕获异常导致渲染进程崩溃
function safeCb(cb) {
    return (_e, data) => { try { cb(data); } catch (e) { console.warn('[safeCb] 渲染层回调异常:', e && e.message || e); } };
}

// IPC 工厂函数：减少 invoke/send/on 包装的重复代码
function makeInvoke(channel) {
    return (...args) => ipcRenderer.invoke(channel, ...args);
}
function makeSend(channel) {
    return (...args) => ipcRenderer.send(channel, ...args);
}
function makeListener(channel) {
    return (cb) => {
        const listener = safeCb(cb);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    };
}
contextBridge.exposeInMainWorld('api', {
    /* ===== 便签数据 ===== */
    loadNotes: makeInvoke('notes:load'),
    saveNotes: makeInvoke('notes:save'),
    loadArchivedNotes: makeInvoke('notes:load-archived'),
    saveArchivedNotes: makeInvoke('notes:save-archived'),
    loadTrashedNotes: makeInvoke('notes:load-trashed'),
    saveTrashedNotes: makeInvoke('notes:save-trashed'),

    /* ===== 聊天归档/垃圾桶（独立 JSON 持久化，与便签归档/垃圾桶一致）===== */
    loadArchivedChats: makeInvoke('chat:load-archived'),
    saveArchivedChats: makeInvoke('chat:save-archived'),
    loadTrashedChats: makeInvoke('chat:load-trashed'),
    saveTrashedChats: makeInvoke('chat:save-trashed'),

    /* ===== 日历数据（日期↔闹钟映射）===== */
    loadCalendar: makeInvoke('calendar:load'),
    saveCalendar: makeInvoke('calendar:save'),

    /* ===== 活跃度数据（热力图数据源）===== */
    loadActivity: makeInvoke('activity:load'),
    incrementActivity: (type, date) => ipcRenderer.invoke('activity:increment', { type, date }),

    /* ===== 数据同步（S3 / WebDAV 上传备份）===== */
    loadSyncConfig: makeInvoke('sync:load-config'),
    saveSyncConfig: makeInvoke('sync:save-config'),
    testSync: makeInvoke('sync:test'),
    uploadSync: makeInvoke('sync:upload'),
    listBackups: makeInvoke('sync:list-backups'),
    deleteBackup: makeInvoke('sync:delete-backup'),
    restoreBackup: makeInvoke('sync:restore-backup'),
    onRestoreDone: makeListener('sync:restore-done'),
    onAutoSyncResult: makeListener('sync:auto-result'),

    /* ===== 设置 ===== */
    loadSettings: makeInvoke('settings:load'),
    saveSettings: makeInvoke('settings:save'),

    /* ===== 窗口控制 ===== */
    minimizeWindow: makeInvoke('window:minimize'),
    maximizeWindow: makeInvoke('window:maximize'),
    closeWindow: makeInvoke('window:close'),
    resizeWindow: makeInvoke('window:resize'),
    // 闹钟响铃时恢复并聚焦主窗口（从托盘/最小化中唤起）
    showWindowForAlarm: makeInvoke('alarm:show-window'),

    onAppSavingBeforeQuit: makeListener('app-saving-before-quit'),

    /* ===== 置顶 ===== */
    togglePin: makeInvoke('toggle-pin'),
    getPinState: makeInvoke('get-pin-state'),
    onPinChanged: makeListener('pin-changed'),

    /* ===== AI 配置 ===== */
    saveAIConfig: makeInvoke('ai:save-config'),
    loadAIConfig: makeInvoke('ai:load-config'),
    fetchModels: makeInvoke('ai:fetch-models'),
    generateContent: makeInvoke('ai:generate'),
    /* ===== AI 多轮对话（聊天，流式输出）===== */
    chat: makeInvoke('ai:chat'),
    abortChat: makeInvoke('chat:abort'),
    onChatChunk: makeListener('chat:chunk'),

    /* ===== AI 翻译（文本）===== */
    translate: makeInvoke('ai:translate'),

    /* ===== 聊天图片本地存储（落盘到 userData/chat-images，前端只存文件名）===== */
    saveChatImage: makeInvoke('chat:save-image'),
    deleteChatImage: makeInvoke('chat:delete-image'),

    /* ===== 透明度 ===== */
    setOpacity: makeInvoke('window:set-opacity'),
    getOpacity: makeInvoke('window:get-opacity'),

    /* ===== AI 图片生成 ===== */
    saveImageConfig: makeInvoke('ai:save-image-config'),
    loadImageConfig: makeInvoke('ai:load-image-config'),
    generateImage: makeInvoke('ai:generate-image'),
    generateVideo: makeInvoke('ai:generate-video'),
    abortVideo: makeInvoke('ai:abort-video'),
    selectFolder: makeInvoke('select-folder'),
    saveCustomSize: makeInvoke('ai:save-custom-size'),
    loadCustomSize: makeInvoke('ai:load-custom-size'),

    /* ===== 窗口固定 ===== */
    toggleFixed: makeInvoke('toggle-fixed'),
    getFixedState: makeInvoke('get-fixed-state'),
    onFixedChanged: makeListener('fixed-changed'),

    /* ===== 软件锁（4 位 PIN + scrypt 哈希） ===== */
    setLockPin: makeInvoke('lock:set-pin'),
    verifyLockPin: makeInvoke('lock:verify-pin'),
    hasLockPin: makeInvoke('lock:has-pin'),
    clearLockPin: makeInvoke('lock:clear-pin'),

    /* ===== 开机启动 ===== */
    setLaunchAtLogin: makeInvoke('startup:set'),
    getLaunchAtLogin: makeInvoke('startup:get'),

    /* ===== 导出聊天会话为 Markdown ===== */
    exportChatToMarkdown: makeInvoke('chat:export-markdown'),

    /* ===== 剪贴板：复制文本 ===== */
    copyTextToClipboard: makeInvoke('clipboard:write-text'),

    /* ===== 剪贴板：写入图片（dataURL） ===== */
    copyImageToClipboard: makeInvoke('clipboard:write-image'),

    /* ===== 便签历史版本快照 ===== */
    saveNoteSnapshot: (noteId, content) => ipcRenderer.invoke('note-history:snapshot', { noteId, content }),
    listNoteHistory: makeInvoke('note-history:list'),
    clearNoteHistory: makeInvoke('note-history:clear'),
    toggleHistoryLock: (noteId, ts) => ipcRenderer.invoke('note-history:toggle-lock', { noteId, ts }),

    /* ===== 便签独立悬浮小窗口 ===== */
    popOutNote: (noteId, title, content) => ipcRenderer.invoke('note:popout', { noteId, title, content }),
    pushNoteToPopout: (noteId, content) => ipcRenderer.send('popout-note:push-from-main', { noteId, content }),
    onPopoutNoteUpdate: makeListener('popout-note:update'),
    onPopoutNoteClose: makeListener('popout-note:closed'),

    /* ===== 待办事项独立悬浮小窗口 ===== */
    popOutTodo: (noteId, title, todos) => ipcRenderer.invoke('todo:popout', { noteId, title, todos }),
    pushTodosToPopout: (noteId, todos) => ipcRenderer.send('popout-todo:push-from-main', { noteId, todos }),
    onPopoutTodoUpdate: makeListener('popout-todo:update'),
    onPopoutTodoClose: makeListener('popout-todo:closed'),

    /* ===== 应用日志查看器 ===== */
    // getLogs/refreshLogs 支持可选 filter 参数 {source?, level?}
    getLogs: makeInvoke('logs:get'),
    refreshLogs: makeInvoke('logs:refresh'),
    copyAllLogs: makeInvoke('logs:copy-all'),
    clearLogs: makeInvoke('logs:clear'),
    // 渲染进程批量上报日志（主窗口 console 劫持后调用）
    reportLogs: makeInvoke('log:report'),
    // 崩溃兜底同步上报（sendSync 保证进程死亡前"遗言"100%送达）
    reportLogsSync: (data) => ipcRenderer.sendSync('log:report-sync', data),
    // 获取日志元数据（统计信息 + 当前文件路径），供 UI 显示
    getLogMeta: makeInvoke('logs:meta'),

    /* ===== AI 语音工坊（TTS：合成 / 缓存清理）=====
     * 架构：主进程负责所有百炼 HTTP 请求与音频落盘；渲染进程只管 UI 与 <audio> 播放。
     * 音频通过自定义 ttsfile:// 协议加载（非 file://，非 base64），符合 CSP 与最小传输约束。
     * API Key 加密落盘 + 掩码回传，复用现有 encryptApiKey/maskCred/isMaskedCred 三件套。
     */
    // 配置存取（API Key 加密落盘，掩码回传；掩码占位时保留旧密钥）
    saveTtsConfig: makeInvoke('tts:save-config'),
    loadTtsConfig: makeInvoke('tts:load-config'),
    // 文本→语音合成：返回 { success, url:'ttsfile://...', durationMs? }
    // 渲染进程 audio.src = url 即可播放，绝不回传 base64
    ttsSynthesize: makeInvoke('tts:synthesize'),
    // 手动触发缓存清理（启动时主进程已自动调用一次）
    ttsCleanupCache: makeInvoke('tts:cleanup-cache'),
    // 下载音频文件（主进程弹保存对话框 + 复制文件，替代 <a download> blob）
    ttsSaveAudio: (ttsUrl, suggestedName) => ipcRenderer.invoke('tts:save-audio', { ttsUrl, suggestedName }),

    /* ===== 音乐模块（V7.4 P0 骨架）=====
     * 架构：主进程负责文件对话框/扫描/元数据/播放列表持久化，
     *       渲染进程通过 musicfile:// 协议加载本地音频与封面。
     * P0 阶段：IPC 骨架可用，元数据返回文件名，播放列表可持久化。
     * P2 阶段：接入 music-metadata-browser 解析 ID3/Vorbis 标签与封面。
     */
    // 选择音乐文件（多选），返回 [{ filePath, size }]
    musicPickFiles: makeInvoke('music:pick-files'),
    // 选择音乐文件夹，返回 { folderPath }
    musicPickFolder: makeInvoke('music:pick-folder'),
    // 递归扫描文件夹，返回 [{ filePath, size }] + truncated 标记
    musicScanFolder: (folderPath, recursive) => ipcRenderer.invoke('music:scan-folder', { folderPath, recursive }),
    // 读取音频元数据（P0 返回文件名，P2 返回完整标签+封面）
    musicReadMetadata: (filePath) => ipcRenderer.invoke('music:read-metadata', { filePath }),
    // 加载/保存播放列表（持久化到 userData/music/playlist.json）
    musicLoadPlaylist: makeInvoke('music:load-playlist'),
    musicSavePlaylist: (playlist) => ipcRenderer.invoke('music:save-playlist', playlist),

    /* ===== FM 收音机模块（V7.4 P0 骨架）=====
     * 架构：主进程负责 RadioBrowser API 调用与配置加密存储，
     *       渲染进程通过 <audio> 加载网络电台流。
     * P0 阶段：配置存取、收藏/缓存读写可用，API 调用返回空数组。
     * P3 阶段：接入实际 RadioBrowser HTTP 请求。
     */
    // 配置存取（API 基址/超时/代理/默认国家/自定义电台列表）
    radioLoadConfig: makeInvoke('radio:load-config'),
    radioSaveConfig: (config) => ipcRenderer.invoke('radio:save-config', config),
    // RadioBrowser API 镜像与电台查询（P0 骨架，P3 接入实际请求）
    radioGetServers: makeInvoke('radio:get-servers'),
    radioGetTopStations: (limit) => ipcRenderer.invoke('radio:get-topstations', { limit }),
    radioGetStationsBySource: (opts) => ipcRenderer.invoke('radio:get-stations-by-source', opts),
    radioGetCnHkMusicStations: (limit) => ipcRenderer.invoke('radio:get-cnhk-music-stations', { limit }),
    radioSearch: (opts) => ipcRenderer.invoke('radio:search', opts),
    // 收藏列表持久化
    radioLoadFavorites: makeInvoke('radio:load-favorites'),
    radioSaveFavorites: (favorites) => ipcRenderer.invoke('radio:save-favorites', favorites),
    // 清除电台缓存
    radioClearCache: makeInvoke('radio:clear-cache'),
});
