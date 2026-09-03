import { contextBridge, ipcRenderer } from 'electron';

function safeCb(cb: Function) {
    return (_e: any, data: any) => { try { cb(data); } catch (e: any) { console.warn('[safeCb] 渲染层回调异常:', e && e.message || e); } };
}

function makeInvoke(channel: string) {
    return (...args: any[]) => ipcRenderer.invoke(channel, ...args);
}
function makeSend(channel: string) {
    return (...args: any[]) => ipcRenderer.send(channel, ...args);
}
function makeListener(channel: string) {
    return (cb: Function) => {
        const listener = safeCb(cb);
        ipcRenderer.on(channel, listener);
        return () => { ipcRenderer.removeListener(channel, listener); };
    };
}

export const api = {
    loadNotes: makeInvoke('notes:load'),
    saveNotes: makeInvoke('notes:save'),
    loadArchivedNotes: makeInvoke('notes:load-archived'),
    saveArchivedNotes: makeInvoke('notes:save-archived'),
    loadTrashedNotes: makeInvoke('notes:load-trashed'),
    saveTrashedNotes: makeInvoke('notes:save-trashed'),

    loadTodos: makeInvoke('todos:load'),
    saveTodos: makeInvoke('todos:save'),
    loadArchivedTodos: makeInvoke('todos:load-archived'),
    saveArchivedTodos: makeInvoke('todos:save-archived'),

    loadChats: makeInvoke('chat:load'),
    saveChats: makeInvoke('chat:save'),
    loadArchivedChats: makeInvoke('chat:load-archived'),
    saveArchivedChats: makeInvoke('chat:save-archived'),
    loadTrashedChats: makeInvoke('chat:load-trashed'),
    saveTrashedChats: makeInvoke('chat:save-trashed'),

    loadCalendar: makeInvoke('calendar:load'),
    saveCalendar: makeInvoke('calendar:save'),

    loadActivity: makeInvoke('activity:load'),
    incrementActivity: (type: string, date: string) => ipcRenderer.invoke('activity:increment', { type, date }),

    loadSyncConfig: makeInvoke('sync:load-config'),
    saveSyncConfig: makeInvoke('sync:save-config'),
    testSync: makeInvoke('sync:test'),
    uploadSync: makeInvoke('sync:upload'),
    listBackups: makeInvoke('sync:list-backups'),
    deleteBackup: makeInvoke('sync:delete-backup'),
    restoreBackup: makeInvoke('sync:restore-backup'),
    onRestoreDone: makeListener('sync:restore-done'),
    onAutoSyncResult: makeListener('sync:auto-result'),

    loadSettings: makeInvoke('settings:load'),
    saveSettings: makeInvoke('settings:save'),

    minimizeWindow: makeInvoke('window:minimize'),
    maximizeWindow: makeInvoke('window:maximize'),
    closeWindow: makeInvoke('window:close'),
    resizeWindow: makeInvoke('window:resize'),
    showWindowForAlarm: makeInvoke('alarm:show-window'),
    openExternalUrl: (url: string) => ipcRenderer.invoke('shell:open-external', url),

    onAppSavingBeforeQuit: makeListener('app-saving-before-quit'),

    togglePin: makeInvoke('toggle-pin'),
    getPinState: makeInvoke('get-pin-state'),
    onPinChanged: makeListener('pin-changed'),

    saveAIConfig: makeInvoke('ai:save-config'),
    loadAIConfig: makeInvoke('ai:load-config'),
    fetchModels: makeInvoke('ai:fetch-models'),
    generateContent: makeInvoke('ai:generate'),
    chat: makeInvoke('ai:chat'),
    abortChat: makeInvoke('chat:abort'),
    onChatChunk: makeListener('chat:chunk'),

    saveChatImage: makeInvoke('chat:save-image'),
    deleteChatImage: makeInvoke('chat:delete-image'),

    saveImageConfig: makeInvoke('ai:save-image-config'),
    loadImageConfig: makeInvoke('ai:load-image-config'),
    generateImage: makeInvoke('ai:generate-image'),
    generateVideo: makeInvoke('ai:generate-video'),
    abortVideo: makeInvoke('ai:abort-video'),
    selectFolder: makeInvoke('select-folder'),
    saveCustomSize: makeInvoke('ai:save-custom-size'),
    loadCustomSize: makeInvoke('ai:load-custom-size'),

    toggleFixed: makeInvoke('toggle-fixed'),
    getFixedState: makeInvoke('get-fixed-state'),
    onFixedChanged: makeListener('fixed-changed'),

    setLockPin: makeInvoke('lock:set-pin'),
    verifyLockPin: makeInvoke('lock:verify-pin'),
    hasLockPin: makeInvoke('lock:has-pin'),
    clearLockPin: makeInvoke('lock:clear-pin'),
    setAppLocked: makeInvoke('lock:set-app-locked'),

    setLaunchAtLogin: makeInvoke('startup:set'),
    getLaunchAtLogin: makeInvoke('startup:get'),

    exportChatToMarkdown: makeInvoke('chat:export-markdown'),
    copyTextToClipboard: makeInvoke('clipboard:write-text'),
    copyImageToClipboard: makeInvoke('clipboard:write-image'),

    saveNoteSnapshot: (noteId: string, content: string) => ipcRenderer.invoke('note-history:snapshot', { noteId, content }),
    listNoteHistory: makeInvoke('note-history:list'),
    toggleHistoryLock: (noteId: string, ts: number) => ipcRenderer.invoke('note-history:toggle-lock', { noteId, ts }),

    popOutNote: (noteId: string, title: string, content: string) => ipcRenderer.invoke('note:popout', { noteId, title, content }),
    pushNoteToPopout: (noteId: string, content: string) => ipcRenderer.send('popout-note:push-from-main', { noteId, content }),
    onPopoutNoteUpdate: makeListener('popout-note:update'),
    onPopoutNoteClose: makeListener('popout-note:closed'),

    popOutTodo: (noteId: string, title: string, todos: any[]) => ipcRenderer.invoke('todo:popout', { noteId, title, todos }),
    pushTodosToPopout: (noteId: string, todos: any[]) => ipcRenderer.send('popout-todo:push-from-main', { noteId, todos }),
    onPopoutTodoUpdate: makeListener('popout-todo:update'),
    onPopoutTodoClose: makeListener('popout-todo:closed'),

    getLogs: makeInvoke('logs:get'),
    refreshLogs: makeInvoke('logs:refresh'),
    copyAllLogs: makeInvoke('logs:copy-all'),
    clearLogs: makeInvoke('logs:clear'),
    reportLogs: makeInvoke('log:report'),
    reportLogsSync: (data: any) => ipcRenderer.sendSync('log:report-sync', data),
    getLogMeta: makeInvoke('logs:meta'),

    musicPickFiles: makeInvoke('music:pick-files'),
    musicPickFolder: makeInvoke('music:pick-folder'),
    musicScanFolder: (folderPath: string, recursive: boolean) => ipcRenderer.invoke('music:scan-folder', { folderPath, recursive }),
    musicReadMetadata: (filePath: string) => ipcRenderer.invoke('music:read-metadata', { filePath }),
    musicLoadPlaylist: makeInvoke('music:load-playlist'),
    musicSavePlaylist: (playlist: any) => ipcRenderer.invoke('music:save-playlist', playlist),
    musicLoadFavorites: makeInvoke('music:load-favorites'),
    musicSaveFavorites: (favorites: any) => ipcRenderer.invoke('music:save-favorites', favorites),
    musicLoadFolders: makeInvoke('music:load-folders'),
    musicSaveFolders: (folders: any) => ipcRenderer.invoke('music:save-folders', folders),
    musicEnsureThumbs: makeInvoke('music:ensure-thumbs'),

    radioLoadConfig: makeInvoke('radio:load-config'),
    radioSaveConfig: (config: any) => ipcRenderer.invoke('radio:save-config', config),
    radioGetTopStations: (limit: number) => ipcRenderer.invoke('radio:get-topstations', { limit }),
    radioGetStationsBySource: (opts: any) => ipcRenderer.invoke('radio:get-stations-by-source', opts),
    radioGetCnHkMusicStations: (limit: number) => ipcRenderer.invoke('radio:get-cnhk-music-stations', { limit }),
    radioSearch: (opts: any) => ipcRenderer.invoke('radio:search', opts),
    radioLoadFavorites: makeInvoke('radio:load-favorites'),
    radioSaveFavorites: (favorites: any) => ipcRenderer.invoke('radio:save-favorites', favorites),
    radioClearCache: makeInvoke('radio:clear-cache')
};

contextBridge.exposeInMainWorld('api', api);
