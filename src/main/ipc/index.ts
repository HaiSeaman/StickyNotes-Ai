/* ==================== IPC 处理器注册（TypeScript 重写） ====================
 * 从根目录 main.js 迁移而来。注册全部 IPC handler（handle + on），
 * 频道名与 src/preload/preload.ts 完全一致。
 * 业务逻辑逐字等价于 main.js，仅做类型化外壳。
 * 复用 main.ts 导出的辅助函数与根目录 JS 工具模块。
 * ==================================================================== */
import { ipcMain, dialog, clipboard, nativeImage, BrowserWindow, app, safeStorage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { thumbPathFor } from '../lib/coverThumbs.js';

// 从 main.ts 导入共享状态与辅助函数（circular dep：运行时才调用，安全）
import {
    getMainWindow,
    loadSettings,
    persistSettings,
    invalidateSettingsCache,
    encryptSecret,
    decryptSecret,
    maskCred,
    isMaskedCred,
    providers,
    performSync,
    scheduleAutoSync,
    loadLockState,
    persistLockState,
    hashPin,
    verifyPin,
    LOCK_MAX_ATTEMPTS,
    LOCK_COOLDOWN_MS,
    getHistoryFilePath,
    readNoteHistory,
    writeNoteHistory,
    noteHistoryCache,
    HISTORY_MAX_PER_NOTE,
    HISTORY_MIN_INTERVAL_MS,
    withDecryptedKey,
    extFromDataUrl,
    readChatImageAsDataUrl,
    dashscopeGenerate,
    dashscopeGenerateVideo,
    buildOpenAiImageUrl,
    saveImageToDisk,
    openPopoutWindow,
    openTodoPopoutWindow,
    togglePopoutPin,
    processLogReport,
    RADIO_DEFAULT_CONFIG,
    BUILTIN_CN_HK_MUSIC_STATIONS,
    radioHttpGet,
    radioGetMirror,
    radioNormalizeStation,
    dedupStationsByUrl,
    fetchCnHkMusicFromRadioBrowser,
    MUSIC_AUDIO_EXTENSIONS,
    MUSIC_MIME_MAP,
    MAX_IMAGE_SIZE,
    MAX_CLIPBOARD_TEXT_SIZE,
    bufferToImageDataUrl,
    fetchImageAsDataUrl,
    sniffImageMime,
} from '../main.js';

// 跨模块共享状态（独立模块，避免 main ↔ ipc 可变状态循环依赖）
import { sharedState, approvedAudioPaths, approvedScanFolders, popoutWindows, todoPopoutWindows } from '../lib/state.js';

// TS 工具模块
import * as logger from '../lib/logger.js';
import { extractHttpError } from '../lib/httpUtils.js';

import {
    MAX_IPC_PAYLOAD_SIZE,
    assertPayloadSize,
    isSafeExternalUrlAsync,
    isSafePublicStreamUrlAsync,
    validateAiBaseUrl,
} from '../lib/security.js';

import { loadJSON, loadJSONAsync, saveJSON, saveJSONSync } from '../lib/json-io.js';
import { trimTrailingSlash } from '../lib/shared-utils.js';
import { searchManager, executeAgenticChat } from '../services/search/index.js';

import {
    getNotesPath,
    getChatsPath,
    getTodosPath,
    getArchivedTodosPath,
    getArchivedNotesPath,
    getTrashedNotesPath,
    getArchivedChatsPath,
    getTrashedChatsPath,
    getCalendarPath,
    getActivityPath,
    getChatImagesDir,
    getMusicDir,
    getMusicPlaylistPath,
    getMusicFavoritesPath,
    getMusicFoldersPath,
    getMusicCoversDir,
    getRadioDir,
    getRadioCachePath,
    getRadioFavoritesPath,
} from '../lib/paths.js';

// C3 修复：将音频文件路径（realpath 规范形式）注册到已批准集合，供 musicfile://audio/ 协议校验
// 安全加固：注册前校验扩展名 ∈ 音频白名单且大小 ≤ 50MB（对齐协议 maxSize），
// 防止渲染进程借 save-playlist/save-favorites 把任意文件注册进白名单后经 musicfile:// 读取
const APPROVED_AUDIO_MAX_SIZE = 50 * 1024 * 1024;
async function approveAudioPath(filePath: string, knownSize?: number): Promise<void> {
    try {
        const ext = path.extname(filePath).toLowerCase();
        if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) return; // 非音频扩展名拒绝
        if (knownSize !== undefined && knownSize > APPROVED_AUDIO_MAX_SIZE) return; // 调用方已 stat，直接校验大小
        const real = await fs.promises.realpath(filePath);
        const st = knownSize !== undefined ? null : await fs.promises.stat(real);
        if (st && (!st.isFile() || st.size > APPROVED_AUDIO_MAX_SIZE)) return;
        approvedAudioPaths.add(real);
    } catch (_) { /* 文件不存在则忽略 */ }
}

// M4 修复：将扫描根目录（realpath 规范形式）注册到已批准集合
async function approveScanFolder(folderPath: string): Promise<void> {
    try {
        const real = await fs.promises.realpath(folderPath);
        approvedScanFolders.add(real);
    } catch (_) { /* 目录不存在则忽略 */ }
}

// 收音机镜像源优先 + 固定备用源的 tryUrls 列表
const RADIO_FALLBACKS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
function buildRadioTryUrls(cfg: any): string[] {
    const mirror = radioGetMirror(cfg);
    return [mirror, ...RADIO_FALLBACKS.filter(u => u !== mirror)];
}

/** 从 settings 合并出含默认值的 FM 配置（取代重复的 Object.assign 模式） */
function getMergedRadioConfig(): any {
    const s = loadSettings();
    return Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
}

/** 归一化电台列表：radioNormalizeStation + filter(Boolean)（取代 7 处重复） */
function normalizeStations(list: any[]): any[] {
    return (Array.isArray(list) ? list : []).map(radioNormalizeStation).filter(Boolean);
}

/** 依次尝试镜像源抓取指定路径的电台列表，全部失败返回 null（取代 4 处重复 tryUrls 循环） */
async function fetchRadioStations(cfg: any, pathAndQuery: string, lastErrRef?: { error?: string }): Promise<any[] | null> {
    const tryUrls = buildRadioTryUrls(cfg);
    let lastErr: any = null;
    for (const base of tryUrls) {
        try {
            const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
            if (Array.isArray(data)) {
                return normalizeStations(data);
            }
        } catch (e: any) {
            lastErr = e;
        }
    }
    if (lastErr) {
        console.warn('[radio] 所有镜像源请求失败:', lastErr.message);
        // 导出最后错误供调用方保留排障信息（如 radio:search 的 note 文案）
        if (lastErrRef) lastErrRef.error = lastErr.message;
    }
    return null;
}

// M4 修复：校验目录是否已批准（已批准扫描目录或 app 音乐目录下）
async function isApprovedFolder(realFolder: string): Promise<boolean> {
    for (const folder of approvedScanFolders) {
        if (realFolder === folder || realFolder.startsWith(folder + path.sep)) return true;
    }
    const musicDir = await fs.promises.realpath(getMusicDir()).catch(() => getMusicDir());
    if (realFolder === musicDir || realFolder.startsWith(musicDir + path.sep)) return true;
    return false;
}

// M4 修复：校验文件路径是否在已批准扫描目录或 app 音乐目录下，或已在 approvedAudioPaths 中
async function isAudioPathAllowed(filePath: string): Promise<boolean> {
    // 1. 已在已批准音频路径集合中
    try {
        const real = await fs.promises.realpath(filePath);
        if (approvedAudioPaths.has(real)) return true;
        // 2. 在已批准扫描目录或 app 音乐目录下
        return await isApprovedFolder(real);
    } catch (_) { /* realpath 失败 */ }
    return false;
}

/* ==================== 活跃度数据（热力图数据源） ====================
 * 结构：{ "YYYY-MM-DD": { note: <编辑次数>, todo: <勾选完成次数> } }
 * 内存缓存 + 防抖写盘，退出时同步刷盘
 * ================================================================ */
let activityCache: any = null;
let activityPersistTimer: NodeJS.Timeout | null = null;
const ACTIVITY_PERSIST_DEBOUNCE_MS = 1500;

function loadActivity(): any {
    if (!activityCache) activityCache = loadJSON(getActivityPath(), {});
    return activityCache;
}

function persistActivity(): void {
    if (!activityCache) return;
    if (activityPersistTimer) clearTimeout(activityPersistTimer);
    activityPersistTimer = setTimeout(async () => {
        activityPersistTimer = null;
        try { await saveJSON(getActivityPath(), activityCache); }
        catch (e: any) { console.error('活跃度写盘失败:', e.message); }
    }, ACTIVITY_PERSIST_DEBOUNCE_MS);
}

// 同步刷盘：退出前调用，确保防抖窗口内的计数不丢失
export function flushActivity(): void {
    if (activityPersistTimer) {
        clearTimeout(activityPersistTimer);
        activityPersistTimer = null;
    }
    if (activityCache) {
        try { saveJSONSync(getActivityPath(), activityCache); } catch (e: any) { console.warn('保存活动数据失败:', e.message); }
    }
}

// 获取今日日期字符串 YYYY-MM-DD（本地时区）
function getTodayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

// 仅允许 YYYY-MM-DD 格式的日期键，防原型污染（__proto__/constructor/prototype）
const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY_TYPE_SET = new Set(['note', 'todo']);

// M5 修复：校验 IPC 调用来源是否为主窗口，防止 popout 窗口被攻陷后调用特权通道
function requireMainWindowSender(event: any): void {
    const mw = getMainWindow();
    if (!mw || !event || !event.sender || event.sender !== mw.webContents) {
        throw new Error('此操作仅允许从主窗口调用');
    }
}

function incrementActivity(type: string, dateStr: string): any {
    const key = dateStr || getTodayStr();
    // 防原型污染：严格校验日期键格式，拒绝危险键（__proto__/constructor/prototype）
    if (!ACTIVITY_DATE_RE.test(key)) {
        return { note: 0, todo: 0 };
    }
    if (!ACTIVITY_TYPE_SET.has(type)) {
        return loadActivity()[key] || { note: 0, todo: 0 };
    }
    const data = loadActivity();
    // 使用 Object.prototype.hasOwnProperty 显式判断，避免触及原型链
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
        data[key] = { note: 0, todo: 0 };
    }
    if (typeof data[key].note !== 'number') data[key].note = 0;
    if (typeof data[key].todo !== 'number') data[key].todo = 0;
    if (type === 'note') data[key].note += 1;
    else if (type === 'todo') data[key].todo += 1;
    persistActivity();
    return data[key];
}

/* ==================== 写盘计数器（退出延迟逻辑用） ====================
 * 标记写盘是否进行中：退出时若仍在写，延迟退出以免数据丢失
 * 使用计数器而非布尔值，支持多个 IPC 通道并发保存
 */
let pendingSaveCount = 0;
export function isPendingSave(): boolean { return pendingSaveCount > 0; }

/* ==================== IPC handler 包装工具 ==================== */
// 包装 saveXxx handler：assertPayloadSize → 增加计数 → saveJSON → 减少计数
function wrapSaveHandler(pathGetter: () => string, label: string) {
    return async (_event: any, data: any): Promise<boolean> => {
        assertPayloadSize(data, MAX_IPC_PAYLOAD_SIZE, label);
        pendingSaveCount++;
        try {
            return await saveJSON(pathGetter(), data);
        } finally {
            pendingSaveCount--;
        }
    };
}

// 包装 IPC handler 的 try/catch：统一捕获异常并返回 { success: false, message }
function tryWrap(fn: (...args: any[]) => any): (...args: any[]) => Promise<any> {
    return async (event: any, ...args: any[]) => {
        try {
            return await fn(event, ...args);
        } catch (e: any) {
            console.error('[IPC ERROR]', e);
            logger.appendLog('ERROR', ['[IPC ERROR]', e.stack || (e.name + ': ' + e.message)], 'main');
            return { success: false, message: e.message };
        }
    };
}

/**
 * 彻底移除正文中的「🔍 已为您搜索 / 🌐 来源引文 / 参考来源」整块冗长内容。
 * 用于关闭联网搜索（方案一）时，确保模型端自带 Grounding 输出的引文也不会显示。
 */
function stripGroundingBlocks(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const blockPattern = /(\*{0,2}(?:🔍|🌐)\s*(?:已为您搜索|搜索关键词|来源引文|参考来源)[：:]\*{0,2}[\s\S]*?(?=(?:\n\*{0,2}(?:🔍|🌐)\s*(?:已为您搜索|搜索关键词|来源引文|参考来源)[：:]|\n\n[^\n]|(?:\n(?![\[0-9\s]))|$)))/g;
    const stripped = text.replace(blockPattern, '');
    // 清理多余连续空行与首尾空白
    return stripped.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/* ==================== 注册全部 97 个 IPC handler ==================== */
export function registerIpcHandlers(): void {

    /* ---------- 便签/待办小窗口（8 个：3 handle + 5 on） ---------- */
    // 1. 打开便签小窗口
    ipcMain.handle('note:popout', tryWrap((_event: any, data: any) => openPopoutWindow(data)));

    // 2. 便签小窗口实时输入：主进程接收后转发给主窗口
    ipcMain.on('popout-note:input', (_event: any, data: any) => {
        if (!data || !data.noteId) return;
        try {
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed()) {
                mw.webContents.send('popout-note:update', data);
            }
        } catch (e: any) { console.warn('转发便签输入失败:', e.message); }
    });

    // 3. 主窗口内容变化时推送给小窗口
    ipcMain.on('popout-note:push-from-main', (_event: any, data: any) => {
        if (!data || !data.noteId) return;
        try {
            const win = popoutWindows.get(String(data.noteId));
            if (win && !win.isDestroyed()) {
                win.webContents.send('popout-note:push', data);
            }
        } catch (e: any) { console.warn('推送便签更新失败:', e.message); }
    });

    // 4. 打开待办事项小窗口
    ipcMain.handle('todo:popout', tryWrap((_event: any, data: any) => openTodoPopoutWindow(data)));

    // 5. 待办小窗口实时输入：转发给主窗口
    ipcMain.on('popout-todo:input', (_event: any, data: any) => {
        if (!data || !data.noteId) return;
        try {
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed()) {
                mw.webContents.send('popout-todo:update', data);
            }
        } catch (e: any) { console.warn('转发待办输入失败:', e.message); }
    });

    // 6. 主窗口待办变化时推送给待办小窗口
    ipcMain.on('popout-todo:push-from-main', (_event: any, data: any) => {
        if (!data || !data.noteId) return;
        try {
            const win = todoPopoutWindows.get(String(data.noteId));
            if (win && !win.isDestroyed()) {
                win.webContents.send('popout-todo:push', data);
            }
        } catch (e: any) { console.warn('推送待办更新失败:', e.message); }
    });

    // 7. 关闭当前小窗口（由 popout 渲染进程触发）
    ipcMain.on('popout:close-current', (event: any) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                win.close();
            }
        } catch (e: any) { console.warn('关闭当前小窗口失败:', e.message); }
    });

    ipcMain.handle('popout:toggle-pin', (_event: any, { noteId, type }: { noteId: string; type: string }) => {
        try {
            return togglePopoutPin(noteId, type);
        } catch (e) {
            return { success: false, pinned: false };
        }
    });

    /* ---------- 数据持久化（便签/待办/聊天/日历/活跃度/设置，16 个 handle） ---------- */
    // 11-12. 便签数据
    ipcMain.handle('notes:load', () => loadJSONAsync(getNotesPath(), []));
    ipcMain.handle('notes:save', wrapSaveHandler(getNotesPath, '便签数据'));

    // 13-16. 待办事项数据
    ipcMain.handle('todos:load', () => loadJSONAsync(getTodosPath(), []));
    ipcMain.handle('todos:save', wrapSaveHandler(getTodosPath, '待办事项数据'));
    ipcMain.handle('todos:load-archived', () => loadJSONAsync(getArchivedTodosPath(), []));
    ipcMain.handle('todos:save-archived', wrapSaveHandler(getArchivedTodosPath, '归档待办事项数据'));

    // 17-20. 归档/回收站便签数据
    ipcMain.handle('notes:load-archived', () => loadJSONAsync(getArchivedNotesPath(), []));
    ipcMain.handle('notes:save-archived', wrapSaveHandler(getArchivedNotesPath, '归档便签数据'));
    ipcMain.handle('notes:load-trashed', () => loadJSONAsync(getTrashedNotesPath(), []));
    ipcMain.handle('notes:save-trashed', wrapSaveHandler(getTrashedNotesPath, '回收站便签数据'));

    // 21-26. 聊天主数据/归档/回收站数据
    ipcMain.handle('chat:load', () => loadJSONAsync(getChatsPath(), []));
    ipcMain.handle('chat:save', wrapSaveHandler(getChatsPath, '聊天数据'));
    ipcMain.handle('chat:load-archived', () => loadJSONAsync(getArchivedChatsPath(), []));
    ipcMain.handle('chat:save-archived', wrapSaveHandler(getArchivedChatsPath, '归档聊天数据'));
    ipcMain.handle('chat:load-trashed', () => loadJSONAsync(getTrashedChatsPath(), []));
    ipcMain.handle('chat:save-trashed', wrapSaveHandler(getTrashedChatsPath, '回收站聊天数据'));

    // 25-26. 日历数据
    ipcMain.handle('calendar:load', () => loadJSONAsync(getCalendarPath(), {}));
    ipcMain.handle('calendar:save', wrapSaveHandler(getCalendarPath, '日历数据'));

    // 27-28. 活跃度数据
    ipcMain.handle('activity:load', () => loadActivity());
    ipcMain.handle('activity:increment', (_event: any, payload: any) => {
        const type = (payload && payload.type) || 'note';
        const dateStr = (payload && payload.date) || getTodayStr();
        return incrementActivity(type, dateStr);
    });

    // 29-30. 设置（使用缓存）
    ipcMain.handle('settings:load', () => {
        const s = loadSettings();
        return {
            bgColor: s.bgColor || null,
            detailFontSize: s.detailFontSize || null,
            alarmVolume: s.alarmVolume !== undefined ? s.alarmVolume : 100,
            launchAtLogin: !!(s.launchAtLogin),
        };
    });
    ipcMain.handle('settings:save', (_event: any, settings: any) => {
        if (!settings || typeof settings !== 'object') return false;
        const s = loadSettings();
        const ALLOWED_FIELDS = ['bgColor', 'detailFontSize', 'alarmVolume', 'launchAtLogin'];
        for (const key of ALLOWED_FIELDS) {
            if (key in settings) {
                if (key === 'launchAtLogin') {
                    s[key] = !!settings[key];
                } else if (key === 'detailFontSize') {
                    const num = Number(settings[key]);
                    if (!isNaN(num) && num >= 10 && num <= 36) s[key] = num;
                } else if (key === 'alarmVolume') {
                    // 修复：范围与 UI slider（index.html max=300）及渲染端 clamp（0-300）对齐，
                    // 否则用户将音量调到 100-300 后保存会被静默丢弃
                    const num = Number(settings[key]);
                    if (!isNaN(num) && num >= 0 && num <= 300) s[key] = num;
                } else if (key === 'bgColor') {
                    // H3 修复：校验 bgColor 格式（只允许 hex 颜色或 null）
                    const val = settings[key];
                    if (val === null || val === '') {
                        s[key] = null;
                    } else if (typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
                        s[key] = val;
                    }
                } else {
                    s[key] = settings[key] || null;
                }
            }
        }
        return persistSettings();
    });

    /* ---------- 云同步（7 个 handle） ---------- */
    // 31. 加载同步配置（凭据掩码化回传）
    ipcMain.handle('sync:load-config', async () => {
        const s = loadSettings();
        const cfg = s.syncConfig || {};
        const s3Raw = cfg.s3 || {};
        const webdavRaw = cfg.webdav || {};
        let s3AccessKey = '', s3SecretKey = '', webdavPass = '';
        try { s3AccessKey = await decryptSecret(s3Raw.accessKeyEnc); } catch (e: any) { console.warn('解密S3访问密钥失败:', e.message); }
        try { s3SecretKey = await decryptSecret(s3Raw.secretKeyEnc); } catch (e: any) { console.warn('解密S3密钥失败:', e.message); }
        try { webdavPass = await decryptSecret(webdavRaw.passEnc); } catch (e: any) { console.warn('解密WebDAV密码失败:', e.message); }
        const legacyS3 = (!s3AccessKey && !!s3Raw.accessKey) || (!s3SecretKey && !!s3Raw.secretKey);
        const legacyWebdav = !webdavPass && !!webdavRaw.pass;
        return {
            s3: {
                endpoint: s3Raw.endpoint || '',
                region: s3Raw.region || '',
                bucket: s3Raw.bucket || '',
                accessKey: maskCred(s3AccessKey || s3Raw.accessKey || ''),
                secretKey: maskCred(s3SecretKey || s3Raw.secretKey || ''),
                path: s3Raw.path || ''
            },
            webdav: {
                url: webdavRaw.url || '',
                user: webdavRaw.user || '',
                pass: maskCred(webdavPass || webdavRaw.pass || ''),
                path: webdavRaw.path || '',
                allowSelfSigned: !!webdavRaw.allowSelfSigned,
                trustedCertFingerprint: webdavRaw.trustedCertFingerprint || ''
            },
            autoSync: cfg.autoSync || false,
            autoSyncInterval: cfg.autoSyncInterval || 30,
            autoSyncProvider: cfg.autoSyncProvider || 's3',
            legacyPlaintext: legacyS3 || legacyWebdav
        };
    });

    // 32. 保存同步配置（凭据加密落盘）
    ipcMain.handle('sync:save-config', async (_event: any, data: any) => {
        const s = loadSettings();
        const oldSyncConfig = s.syncConfig || {};
        const oldS3 = oldSyncConfig.s3 || {};
        const oldWebdav = oldSyncConfig.webdav || {};
        const s3Config = data.s3 || {};
        const webdavConfig = data.webdav || {};
        s.syncConfig = {
            s3: {
                endpoint: s3Config.endpoint,
                region: s3Config.region,
                bucket: s3Config.bucket,
                accessKeyEnc: isMaskedCred(s3Config.accessKey) ? oldS3.accessKeyEnc : await encryptSecret(s3Config.accessKey),
                secretKeyEnc: isMaskedCred(s3Config.secretKey) ? oldS3.secretKeyEnc : await encryptSecret(s3Config.secretKey),
                path: s3Config.path
            },
            webdav: {
                url: webdavConfig.url,
                user: webdavConfig.user,
                passEnc: isMaskedCred(webdavConfig.pass) ? oldWebdav.passEnc : await encryptSecret(webdavConfig.pass),
                path: webdavConfig.path,
                allowSelfSigned: !!webdavConfig.allowSelfSigned,
                trustedCertFingerprint: (webdavConfig.trustedCertFingerprint || '').trim()
            },
            autoSync: !!data.autoSync,
            // 安全加固：autoSyncInterval 必须为 5-1440 的有限数值（分钟），非法值回退默认 30，防 setInterval 风暴
            autoSyncInterval: (() => {
                const v = Number(data.autoSyncInterval);
                if (!Number.isFinite(v)) return 30;
                return Math.min(1440, Math.max(5, Math.round(v))) || 30;
            })(),
            autoSyncProvider: data.autoSyncProvider || 's3'
        };
        const r = persistSettings();
        scheduleAutoSync();
        return r;
    });

    // 33. 测试同步连接
    ipcMain.handle('sync:test', tryWrap(async (_event: any, providerKey: string, config: any) => {
        const provider = providers[providerKey];
        if (!provider) return { success: false, message: '未知的同步方式：' + providerKey };
        const testConfig = { ...config };
        const s = loadSettings();
        const cfg = s.syncConfig || {};
        if (providerKey === 's3') {
            const s3Raw = cfg.s3 || {};
            if (isMaskedCred(testConfig.accessKey)) {
                try { testConfig.accessKey = await decryptSecret(s3Raw.accessKeyEnc); } catch (_) { testConfig.accessKey = s3Raw.accessKey || ''; }
            }
            if (isMaskedCred(testConfig.secretKey)) {
                try { testConfig.secretKey = await decryptSecret(s3Raw.secretKeyEnc); } catch (_) { testConfig.secretKey = s3Raw.secretKey || ''; }
            }
        } else if (providerKey === 'webdav') {
            const webdavRaw = cfg.webdav || {};
            if (isMaskedCred(testConfig.pass)) {
                try { testConfig.pass = await decryptSecret(webdavRaw.passEnc); } catch (_) { testConfig.pass = webdavRaw.pass || ''; }
            }
        }
        const result = await provider.test(testConfig);
        return { success: true, message: result.message };
    }));

    // 34. 上传备份
    ipcMain.handle('sync:upload', tryWrap(async (_event: any, provider: string) => {
        const result = await performSync(provider);
        return { success: true, message: `上传成功：${result.fileName}（${(result.size / 1024).toFixed(1)} KB）→ ${result.location}`, data: result };
    }));

    // 35. 列出备份
    ipcMain.handle('sync:list-backups', async (_event: any, providerKey: string) => {
        try {
            const provider = providers[providerKey];
            if (!provider || !provider.listBackups) throw new Error('该同步方式不支持列出备份');
            const s = loadSettings();
            const syncConfig = s.syncConfig || {};
            const config = await provider.getConfig(syncConfig);
            if (!config) throw new Error('未配置同步信息');
            for (const k of provider.requiredFields) {
                if (!config[k]) throw new Error(`${provider.label} 配置不完整：缺少 ${k}`);
            }
            const items = await provider.listBackups(config);
            return {
                success: true,
                items: items.map((it: any) => ({
                    name: it.name,
                    id: it.key || it.href || it.name,
                    size: it.size || 0,
                    lastModified: it.lastModified || ''
                }))
            };
        } catch (e: any) {
            return { success: false, message: e.message, items: [] };
        }
    });

    // 36. 删除备份
    ipcMain.handle('sync:delete-backup', tryWrap(async (_event: any, providerKey: string, fileId: string) => {
        requireMainWindowSender(_event); // M5 修复：仅主窗口可调用
        const provider = providers[providerKey];
        if (!provider || !provider.deleteBackup) throw new Error('该同步方式不支持删除备份');
        if (!fileId) throw new Error('未指定要删除的文件');
        const s = loadSettings();
        const syncConfig = s.syncConfig || {};
        const config = await provider.getConfig(syncConfig);
        if (!config) throw new Error('未配置同步信息');
        await provider.deleteBackup(config, fileId);
        return { success: true, message: '已删除备份文件' };
    }));

    // 37. 恢复备份
    ipcMain.handle('sync:restore-backup', tryWrap(async (_event: any, providerKey: string, fileId: string) => {
        requireMainWindowSender(_event); // M5 修复：仅主窗口可调用
        const provider = providers[providerKey];
        if (!provider || !provider.downloadBackup) throw new Error('该同步方式不支持恢复备份');
        if (!fileId) throw new Error('未指定要恢复的文件');
        const s = loadSettings();
        const syncConfig = s.syncConfig || {};
        const config = await provider.getConfig(syncConfig);
        if (!config) throw new Error('未配置同步信息');

        // 1. 下载 ZIP
        const zipBuffer: Buffer = await provider.downloadBackup(config, fileId);
        // 安全加固：ZIP 本体与解压产物都设上限，防 Zip bomb（高压缩比恶意备份导致 OOM/磁盘写满）
        const MAX_BACKUP_ZIP_BYTES = 200 * 1024 * 1024;
        const MAX_BACKUP_UNCOMPRESSED = 500 * 1024 * 1024;
        const MAX_BACKUP_ENTRIES = 5000;
        if (zipBuffer.length > MAX_BACKUP_ZIP_BYTES) {
            throw new Error('备份文件过大（' + (zipBuffer.length / 1024 / 1024).toFixed(1) + 'MB），已拒绝恢复');
        }

        // 2. 解压到 userData（覆盖现有文件）
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipBuffer);
        const userDataDir = app.getPath('userData');
        let restoredCount = 0;
        let restoredBytes = 0;
        // M6 修复：已知数据文件应为数组类型，校验结构防注入恶意数据
        const ARRAY_TYPE_FILES = new Set(['notes.json', 'todos.json', 'archived-todos.json', 'archived-notes.json', 'trashed-notes.json', 'archived-chats.json', 'trashed-chats.json', 'chat-images.json', 'music-playlist.json', 'radio-favorites.json']);
        const entries = zip.getEntries();
        if (entries.length > MAX_BACKUP_ENTRIES) {
            throw new Error('备份条目数过多（' + entries.length + ' > ' + MAX_BACKUP_ENTRIES + '），已拒绝恢复');
        }
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            if (entry.entryName === '_backup_meta.json') continue;
            const entryName = entry.entryName.replace(/\\/g, '/');
            // 安全：路径穿越防护（zip 内不允许 .. 或绝对路径）
            if (entryName.startsWith('/') || /^[A-Za-z]:/.test(entryName) || entryName.split('/').some((seg: string) => seg === '..')) {
                console.warn('跳过可疑路径的备份条目:', entryName);
                continue;
            }
            const baseName = path.basename(entryName);
            if (!baseName) continue;
            // 安全：禁止恢复 settings.json，防止恶意备份覆盖 PIN 哈希/同步凭据/API Key
            if (baseName.toLowerCase() === 'settings.json') continue;

            // 子目录恢复：note_history/（便签历史快照，json）与 chat-images/（聊天图片，二进制）。
            // 按 entryName 重建完整相对路径（支持多层），与备份端递归收集保持一致
            const segs = entryName.split('/');
            if (segs.length >= 2) {
                const subDir = segs[0];
                const allowedSub = subDir === 'note_history' || subDir === 'chat-images';
                if (!allowedSub) {
                    console.warn('跳过非白名单子目录的备份条目:', entryName);
                    continue;
                }
                const relPath = segs.slice(1).join(path.sep);
                const relBase = path.basename(relPath);
                if (subDir === 'note_history' && !relBase.endsWith('.json')) continue;
                if (subDir === 'chat-images' && !/^[a-zA-Z0-9_.\-]+$/.test(relBase)) {
                    console.warn('跳过聊天图片非法文件名:', entryName);
                    continue;
                }
                const targetPath = path.join(userDataDir, subDir, relPath);
                // 纵深防御：最终落点必须仍在 userDataDir 内（前面已拦截 .. 段）
                if (!targetPath.startsWith(userDataDir + path.sep)) {
                    console.warn('跳过路径越界的备份条目:', entryName);
                    continue;
                }
                const data = entry.getData();
                restoredBytes += data.length;
                if (restoredBytes > MAX_BACKUP_UNCOMPRESSED) {
                    throw new Error('备份解压超过 500MB 上限，已中止恢复');
                }
                try { fs.mkdirSync(path.dirname(targetPath), { recursive: true }); } catch (e: any) { console.warn('创建恢复目录失败:', e.message); continue; }
                await fs.promises.writeFile(targetPath, data);
                restoredCount++;
                continue;
            }

            // 顶层 JSON：结构校验后写回
            if (!entryName.endsWith('.json')) continue;
            const entryData = entry.getData();
            restoredBytes += entryData.length;
            if (restoredBytes > MAX_BACKUP_UNCOMPRESSED) {
                throw new Error('备份解压超过 500MB 上限，已中止恢复');
            }
            let parsed: any;
            try {
                parsed = JSON.parse(entryData.toString('utf8'));
            } catch (e: any) {
                console.warn('跳过无效 JSON 文件:', baseName, e.message);
                continue;
            }
            if (parsed === null || typeof parsed !== 'object') {
                console.warn('跳过非对象/数组 JSON 文件:', baseName);
                continue;
            }
            if (ARRAY_TYPE_FILES.has(baseName.toLowerCase()) && !Array.isArray(parsed)) {
                console.warn('跳过结构不符的文件（应为数组）:', baseName);
                continue;
            }
            const targetPath = path.join(userDataDir, baseName);
            await fs.promises.writeFile(targetPath, entryData);
            restoredCount++;
        }

        // 3. 失效设置缓存与历史快照缓存
        invalidateSettingsCache();
        noteHistoryCache.clear();

        // 4. 通知渲染进程重载数据
        const mw = getMainWindow();
        if (mw && !mw.isDestroyed()) {
            mw.webContents.send('sync:restore-done', { restoredFiles: restoredCount });
        }

        return { success: true, message: `恢复成功，共还原 ${restoredCount} 个数据文件。软件将刷新数据。`, restoredFiles: restoredCount };
    }));

    /* ---------- 窗口控制（5 个 handle） ---------- */
    // 38. 最小化（隐藏到托盘）
    ipcMain.handle('window:minimize', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        const mw = getMainWindow();
        if (!mw) return;
        mw.hide();
    });

    // 39. 关闭窗口
    ipcMain.handle('window:close', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        app.quit();
    });

    // 39.1 在系统默认浏览器中打开外部 URL
    ipcMain.handle('shell:open-external', async (_event: any, url: string) => {
        if (!url || typeof url !== 'string') return false;
        // 仅允许 http/https 协议，防 javascript:/file: 等危险协议
        try {
            const u = new URL(url);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
            await shell.openExternal(url);
            return true;
        } catch (e: any) {
            console.warn('打开外部链接失败:', e.message);
            return false;
        }
    });

    // 40. 闹钟响铃时显示窗口
    ipcMain.handle('alarm:show-window', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        try {
            const mw = getMainWindow();
            if (!mw) return;
            if (mw.isMinimized()) mw.restore();
            if (!mw.isVisible()) mw.show();
            mw.focus();
        } catch (e: any) { console.warn('显示闹钟窗口失败:', e.message); }
    });

    // 41. 最大化/还原切换
    ipcMain.handle('window:maximize', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        const mw = getMainWindow();
        if (!mw) return false;
        if (mw.isMaximized()) {
            mw.unmaximize();
            return false;
        } else {
            mw.maximize();
            return true;
        }
    });

    // 42. 窗口缩放（右下角手柄）
    ipcMain.handle('window:resize', (_event: any, w: number, h: number) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        const mw = getMainWindow();
        if (!mw) return;
        if (!Number.isFinite(w) || !Number.isFinite(h)) return;
        const width = Math.max(600, Math.round(w));
        const height = Math.max(400, Math.round(h));
        mw.setBounds({
            width,
            height,
            x: mw.getPosition()[0],
            y: mw.getPosition()[1],
        });
    });

    /* ---------- 软件锁 PIN（4 个 handle） ---------- */
    // 43. 设置 PIN（安全加固：仅主窗口可调用；已设置 PIN 时必须验证当前 PIN 才能重设，防被攻陷窗口无鉴权覆盖锁）
    ipcMain.handle('lock:set-pin', async (_event: any, pin: string, currentPin?: string) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        if (!pin || !/^\d{4}$/.test(pin)) {
            return { success: false, message: 'PIN 必须为 4 位数字' };
        }
        const s = loadSettings();
        if (s.lockHash && s.lockSalt) {
            // 已设置过 PIN：要求验证当前 PIN（首次设置不受限）
            if (!safeStorage.isEncryptionAvailable()) {
                return { success: false, message: '系统加密服务不可用，无法安全校验 PIN。请登录系统账户后重试。' };
            }
            if (!currentPin) {
                return { success: false, message: '请输入当前 PIN 以修改' };
            }
            let plainHash: string, plainSalt: string;
            try {
                plainHash = safeStorage.decryptString(Buffer.from(s.lockHash, 'base64'));
                plainSalt = safeStorage.decryptString(Buffer.from(s.lockSalt, 'base64'));
            } catch (e: any) {
                return { success: false, message: 'PIN 解密失败，请重新设置' };
            }
            if (!(await verifyPin(currentPin, plainHash, plainSalt))) {
                return { success: false, message: '当前 PIN 错误，无法修改' };
            }
        }
        const { hash, salt } = await hashPin(pin);
        if (!safeStorage.isEncryptionAvailable()) {
            return { success: false, message: '系统加密服务不可用，无法安全保存 PIN。请登录系统账户后重试。' };
        }
        let encHash, encSalt;
        try {
            encHash = safeStorage.encryptString(hash).toString('base64');
            encSalt = safeStorage.encryptString(salt).toString('base64');
        } catch (e: any) {
            return { success: false, message: '加密失败：' + e.message };
        }
        s.lockHash = encHash;
        s.lockSalt = encSalt;
        persistSettings();
        return { success: true, message: 'PIN 已设置' };
    });

    // 44. 校验 PIN（用于解锁）
    ipcMain.handle('lock:verify-pin', async (_event: any, pin: string) => {
        if (!sharedState.lockStateLoaded) { loadLockState(); sharedState.lockStateLoaded = true; }
        const now = Date.now();
        if (now < sharedState.lockCooldownUntil) {
            const remain = Math.ceil((sharedState.lockCooldownUntil - now) / 1000);
            return { success: false, message: `输错次数过多，请 ${remain} 秒后再试`, cooldownRemain: remain };
        }
        const s = loadSettings();
        if (!s.lockHash || !s.lockSalt) {
            return { success: false, message: '尚未设置 PIN' };
        }
        if (!safeStorage.isEncryptionAvailable()) {
            return { success: false, message: '系统加密服务不可用，无法安全校验 PIN。请登录系统账户后重试。' };
        }
        let plainHash, plainSalt;
        try {
            plainHash = safeStorage.decryptString(Buffer.from(s.lockHash, 'base64'));
            plainSalt = safeStorage.decryptString(Buffer.from(s.lockSalt, 'base64'));
        } catch (e: any) {
            return { success: false, message: 'PIN 解密失败，请重新设置' };
        }
        if (await verifyPin(pin || '', plainHash, plainSalt)) {
            sharedState.lockFailCount = 0;
            persistLockState();
            return { success: true, message: '解锁成功' };
        } else {
            sharedState.lockFailCount++;
            if (sharedState.lockFailCount >= LOCK_MAX_ATTEMPTS) {
                sharedState.lockCooldownUntil = Date.now() + LOCK_COOLDOWN_MS;
                sharedState.lockFailCount = 0;
                persistLockState();
                return { success: false, message: `连续输错 ${LOCK_MAX_ATTEMPTS} 次，请等待 30 秒后再试`, cooldownRemain: 30 };
            }
            persistLockState();
            const left = LOCK_MAX_ATTEMPTS - sharedState.lockFailCount;
            return { success: false, message: `PIN 错误，还剩 ${left} 次机会` };
        }
    });

    // 45. 查询是否已设置 PIN
    ipcMain.handle('lock:has-pin', () => {
        const s = loadSettings();
        return !!(s.lockHash && s.lockSalt);
    });

    // 46. 清除 PIN（必须验证当前 PIN 才能清除，防渲染进程被攻陷后无鉴权清除应用锁）
    ipcMain.handle('lock:clear-pin', async (_event: any, pin?: string) => {
        requireMainWindowSender(_event); // M5 修复：仅主窗口可调用
        const s = loadSettings();
        if (!s.lockHash || !s.lockSalt) {
            return { success: false, message: '尚未设置 PIN' };
        }
        if (!safeStorage.isEncryptionAvailable()) {
            return { success: false, message: '系统加密服务不可用，无法安全校验 PIN。' };
        }
        if (!pin) {
            return { success: false, message: '请输入当前 PIN 以确认清除' };
        }
        let plainHash: string, plainSalt: string;
        try {
            plainHash = safeStorage.decryptString(Buffer.from(s.lockHash, 'base64'));
            plainSalt = safeStorage.decryptString(Buffer.from(s.lockSalt, 'base64'));
        } catch (e: any) {
            return { success: false, message: 'PIN 解密失败，请重新设置' };
        }
        if (!(await verifyPin(pin, plainHash, plainSalt))) {
            return { success: false, message: 'PIN 错误，无法清除' };
        }
        delete s.lockHash;
        delete s.lockSalt;
        delete s.lockFailCount;
        delete s.lockCooldownUntil;
        await persistSettings();
        sharedState.lockFailCount = 0;
        sharedState.lockCooldownUntil = 0;
        sharedState.lockStateLoaded = true;
        return { success: true };
    });

    ipcMain.handle('lock:set-app-locked', (_event, locked: boolean) => {
        sharedState.isAppLocked = !!locked;
        if (sharedState.isAppLocked) {
            const mainWin = getMainWindow();
            // 锁定生效时，如已开 DevTools 则强制关闭
            if (mainWin && !mainWin.isDestroyed() && mainWin.webContents.isDevToolsOpened()) {
                mainWin.webContents.closeDevTools();
            }
        }
        return true;
    });

    /* ---------- 开机启动（2 个 handle） ---------- */
    // 47. 设置开机启动
    ipcMain.handle('startup:set', tryWrap((_event: any, open: boolean) => {
        app.setLoginItemSettings({
            openAtLogin: !!open,
            args: ['--hidden']
        });
        return { success: true, open: !!open };
    }));

    // 48. 查询开机启动状态
    ipcMain.handle('startup:get', () => {
        try {
            const settings = app.getLoginItemSettings();
            return !!(settings && settings.openAtLogin);
        } catch (_) {
            return false;
        }
    });

    /* ---------- 导出聊天与剪贴板（3 个 handle） ---------- */
    // 49. 导出聊天会话为 Markdown
    ipcMain.handle('chat:export-markdown', tryWrap(async (_event: any, { title, content }: { title: string; content: string }) => {
        assertPayloadSize(content, MAX_IPC_PAYLOAD_SIZE, '导出内容');
        const safeTitle = (title || 'AI会话').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        const defaultName = `${safeTitle}_${ts}.md`;

        const result = await dialog.showSaveDialog({
            title: '保存 Markdown 文件',
            defaultPath: defaultName,
            filters: [
                { name: 'Markdown 文件', extensions: ['md'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        const normalizedPath = path.normalize(result.filePath);
        if (!path.isAbsolute(normalizedPath)) {
            return { success: false, error: '无效的文件保存路径' };
        }
        fs.writeFileSync(normalizedPath, content || '', 'utf8');
        return { success: true, filePath: normalizedPath };
    }));

    // 50. 剪贴板写入文本
    ipcMain.handle('clipboard:write-text', (_event: any, text: string) => {
        try {
            if (typeof text !== 'string') return false;
            if (text.length > MAX_CLIPBOARD_TEXT_SIZE) return false;
            clipboard.writeText(text);
            return true;
        } catch (_) {
            return false;
        }
    });

    // 51. 剪贴板写入图片
    ipcMain.handle('clipboard:write-image', (_event: any, dataUrl: string) => {
        try {
            if (!dataUrl || typeof dataUrl !== 'string') return false;
            if (dataUrl.length > MAX_IMAGE_SIZE * 1.4) return false;
            const base64 = dataUrl.replace(/^data:image\/[\w.+-]+;base64,/, '');
            if (!base64) return false;
            let img = nativeImage.createEmpty();
            try {
                // 优先按二进制内容自动嗅探格式解码（PNG/JPEG/WebP 等）。
                // 修复：dataURL 中 MIME 声明与实际数据不符（例如百炼/部分模型返回的
                // JPEG 图片被硬编码为 data:image/png）时，createFromDataURL 会返回
                // 空图像导致复制失败，而 createFromBuffer 能正确识别。
                img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
            } catch (_) { /* 解码失败，退回 createFromDataURL 再试一次 */ }
            if (img.isEmpty()) {
                img = nativeImage.createFromDataURL(dataUrl);
            }
            if (img.isEmpty()) return false;
            clipboard.writeImage(img);
            return true;
        } catch (_) {
            return false;
        }
    });

    /* ---------- 便签历史版本快照（4 个 handle） ---------- */
    // 52. 保存便签时顺便生成快照
    ipcMain.handle('note-history:snapshot', (_event: any, { noteId, content }: { noteId: string; content: string }) => {
        if (!noteId || content === undefined || content === null) return { saved: false };
        try {
            const history = readNoteHistory(noteId);
            const nowTs = Date.now();
            const lastUnlocked = [...history].reverse().find((h: any) => !h.locked);
            if (lastUnlocked && (nowTs - lastUnlocked.ts) < HISTORY_MIN_INTERVAL_MS) {
                return { saved: false, reason: 'too-frequent' };
            }
            if (lastUnlocked && lastUnlocked.content === content) {
                return { saved: false, reason: 'unchanged' };
            }
            history.push({ ts: nowTs, content: String(content), locked: false });
            const unlocked = history.filter((h: any) => !h.locked);
            const locked = history.filter((h: any) => h.locked);
            if (unlocked.length > HISTORY_MAX_PER_NOTE) {
                unlocked.sort((a: any, b: any) => a.ts - b.ts);
                const keepUnlocked = unlocked.slice(unlocked.length - HISTORY_MAX_PER_NOTE);
                const newHistory = [...locked, ...keepUnlocked].sort((a: any, b: any) => a.ts - b.ts);
                writeNoteHistory(noteId, newHistory);
            } else {
                writeNoteHistory(noteId, history);
            }
            return { saved: true };
        } catch (e: any) {
            return { saved: false, message: e.message };
        }
    });

    // 53. 读取历史快照列表
    ipcMain.handle('note-history:list', (_event: any, noteId: string) => {
        return readNoteHistory(noteId);
    });

    // 55. 切换某条历史快照的锁死状态
    ipcMain.handle('note-history:toggle-lock', tryWrap((_event: any, { noteId, ts }: { noteId: string; ts: number }) => {
        if (!noteId || ts === undefined || ts === null) return { success: false };
        const history = readNoteHistory(noteId);
        const item = history.find((h: any) => h.ts === ts);
        if (!item) return { success: false, message: '快照不存在' };
        item.locked = !item.locked;
        writeNoteHistory(noteId, history);
        return { success: true, locked: !!item.locked };
    }));

    /* ---------- 窗口置顶/固定（4 个 handle） ---------- */
    // 56. 切换主窗口置顶
    ipcMain.handle('toggle-pin', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        if (sharedState.isAppLocked) return sharedState.isPinned;
        const mw = getMainWindow();
        if (!mw) return false;
        sharedState.isPinned = !sharedState.isPinned;
        mw.setAlwaysOnTop(sharedState.isPinned, 'normal');
        mw.webContents.send('pin-changed', sharedState.isPinned);
        return sharedState.isPinned;
    });

    // 57. 获取置顶状态
    ipcMain.handle('get-pin-state', () => sharedState.isPinned);

    // 58. 切换窗口固定
    ipcMain.handle('toggle-fixed', (_event: any) => {
        requireMainWindowSender(_event); // 仅主窗口可调用
        if (sharedState.isAppLocked) return sharedState.isFixed;
        const mw = getMainWindow();
        if (!mw) return false;
        sharedState.isFixed = !sharedState.isFixed;
        try { mw.setMovable(!sharedState.isFixed); } catch (e: any) { console.warn('设置窗口可移动失败:', e.message); }
        mw.webContents.send('fixed-changed', sharedState.isFixed);
        return sharedState.isFixed;
    });

    // 59. 获取固定状态
    ipcMain.handle('get-fixed-state', () => sharedState.isFixed);

    /* ---------- AI 配置与对话（16 个 handle） ---------- */
    // 60. 保存 AI 配置
    ipcMain.handle('ai:save-config', async (_event: any, config: any) => {
        const s = loadSettings();
        if (!s.aiConfig) s.aiConfig = {};
        validateAiBaseUrl(config.baseUrl, 'AI API 地址');
        const oldEncryptedKey = s.aiConfig.encryptedKey;
        s.aiConfig.baseUrl = config.baseUrl || '';
        s.aiConfig.encryptedKey = isMaskedCred(config.apiKey) ? oldEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
        s.aiConfig.model = config.model || '';
        s.aiConfig.temperature = config.temperature ?? 1;
        s.aiConfig.prompt = config.prompt || '';
        
        // 🌐 联网搜索配置
        if (config.webSearch !== undefined) {
            if (!s.aiConfig.webSearch) s.aiConfig.webSearch = {};
            s.aiConfig.webSearch.enabled = Boolean(config.webSearch.enabled);
            s.aiConfig.webSearch.provider = config.webSearch.provider || 'builtin';
            s.aiConfig.webSearch.customUrl = config.webSearch.customUrl || '';
            s.aiConfig.webSearch.resultCount = Number(config.webSearch.resultCount) || 5;
            if (config.webSearch.apiKey !== undefined) {
                s.aiConfig.webSearch.encryptedKey = isMaskedCred(config.webSearch.apiKey)
                    ? s.aiConfig.webSearch.encryptedKey
                    : (config.webSearch.apiKey ? await encryptSecret(config.webSearch.apiKey, 'Web Search API Key') : '');
            }
        }
        return persistSettings();
    });

    // 61. 加载 AI 配置（apiKey 掩码化回传）
    ipcMain.handle('ai:load-config', async () => {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        let apiKey = '';
        try { apiKey = maskCred(await decryptSecret(cfg.encryptedKey, 'API Key')); } catch (e: any) {
            console.error('加载 API Key 失败:', e.message);
        }

        const ws = cfg.webSearch || {};
        let wsApiKey = '';
        if (ws.encryptedKey) {
            try { wsApiKey = maskCred(await decryptSecret(ws.encryptedKey, 'Web Search API Key')); } catch (e: any) {
                console.warn('加载联网搜索 API Key 失败:', e.message);
            }
        }

        return {
            baseUrl: cfg.baseUrl || '',
            apiKey: apiKey,
            model: cfg.model || '',
            temperature: cfg.temperature ?? 1,
            prompt: cfg.prompt || '',
            webSearch: {
                enabled: Boolean(ws.enabled),
                provider: ws.provider || 'builtin',
                apiKey: wsApiKey,
                customUrl: ws.customUrl || '',
                resultCount: ws.resultCount || 5,
            }
        };
    });

    // 61.1 测试联网搜索连接
    // （已删除未使用的 ai:test-search handler —— 渲染层零调用，preload 对应 API 同步移除）

    // 62. 获取模型列表（带速率限制：每分钟最多 10 次）
    const fetchModelsRateLimiter = (() => {
        const timestamps: number[] = [];
        const LIMIT = 10;
        const WINDOW_MS = 60000;
        return {
            check(): boolean {
                const now = Date.now();
                // H6 修复：使用 filter 替代 shift() 清理过期条目，避免内存泄漏
                // 虽然 filter 是 O(n)，但 timestamps 最多只有 LIMIT 个元素
                const validIdx = timestamps.findIndex(t => t >= now - WINDOW_MS);
                if (validIdx > 0) {
                    timestamps.splice(0, validIdx);
                } else if (validIdx === -1) {
                    timestamps.length = 0;
                }
                if (timestamps.length >= LIMIT) return false;
                timestamps.push(now);
                return true;
            }
        };
    })();

    ipcMain.handle('ai:fetch-models', async (_event: any, baseUrl: string, apiKey: string) => {
        if (!fetchModelsRateLimiter.check()) {
            throw new Error('请求过于频繁，请稍后再试（每分钟最多 10 次）');
        }
        validateAiBaseUrl(baseUrl, 'API 地址');
        const s = loadSettings();
        const savedBaseUrl = s.aiConfig && s.aiConfig.baseUrl;
        if (savedBaseUrl && trimTrailingSlash(savedBaseUrl) !== trimTrailingSlash(baseUrl)) {
            throw new Error('传入的 API 地址与已保存配置不一致，请先保存设置');
        }
        let actualKey: string | null = apiKey;
        if (isMaskedCred(apiKey)) {
            const cfg = s.aiConfig || {};
            try { actualKey = await decryptSecret(cfg.encryptedKey, 'API Key'); }
            catch (e: any) { throw new Error('无法读取已保存的 API Key，请重新输入。'); }
        }
        try {
            const url = trimTrailingSlash(baseUrl) + '/models';
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${actualKey}` },
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(await extractHttpError(response));
            }
            const data = await response.json();
            const models = (data.data || []).map((m: any) => m.id).sort();
            return models;
        } finally {
            actualKey = null;
        }
    });

    // 63. AI 生成（单轮）
    ipcMain.handle('ai:generate', async (_event: any, userContent: string) => {
        assertPayloadSize(userContent, MAX_IPC_PAYLOAD_SIZE, 'ai:generate 入参');
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        if (!cfg.baseUrl || !cfg.model) throw new Error('AI 配置不完整，请先在 AI 设置中配置');
        validateAiBaseUrl(cfg.baseUrl, 'AI API 地址');
        return await withDecryptedKey(() => decryptSecret(cfg.encryptedKey, 'API Key'), async (apiKey: string) => {
            if (!apiKey) throw new Error('API Key 未配置');
            const url = trimTrailingSlash(cfg.baseUrl) + '/chat/completions';
            const messages: any[] = [];
            if (cfg.prompt) messages.push({ role: 'system', content: cfg.prompt });
            messages.push({ role: 'user', content: userContent });
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model: cfg.model,
                    messages: messages,
                    temperature: cfg.temperature ?? 1,
                }),
                signal: AbortSignal.timeout(30000),
            });
            if (!resp.ok) {
                throw new Error(await extractHttpError(resp));
            }
            const data = await resp.json();
            return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        });
    });

    // 64. 保存聊天图片到磁盘
    ipcMain.handle('chat:save-image', (_event: any, dataUrl: string) => {
        if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
            throw new Error('无效的图片数据');
        }
        if (dataUrl.length > MAX_IMAGE_SIZE * 1.4) {
            throw new Error('图片数据过大（超过 ' + (MAX_IMAGE_SIZE / 1024 / 1024) + 'MB 上限），已拒绝');
        }
        const dir = getChatImagesDir();
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = extFromDataUrl(dataUrl);
        const rand = crypto.randomBytes(4).toString('hex');
        const fileName = `${Date.now()}-${rand}.${ext}`;
        const filePath = path.join(dir, fileName);
        fs.writeFileSync(filePath, buffer);
        return fileName;
    });

    // 65. 批量删除聊天图片
    // （已删除未使用的 chat:delete-images-batch handler —— 渲染层零调用，preload 对应 API 同步移除）
    ipcMain.handle('chat:delete-image', (_event: any, fileName: string) => {
        if (!fileName) return false;
        const dir = getChatImagesDir();
        const filePath = path.normalize(path.join(dir, fileName));
        if (filePath !== dir && !filePath.startsWith(dir + path.sep)) return false;
        try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (e: any) { console.warn('删除聊天图片失败:', e.message); }
        return false;
    });

    // 66. AI 多轮对话（流式输出 + 多模态 + 思考模式）
    ipcMain.handle('ai:chat', async (event: any, payload: any) => {
        assertPayloadSize(payload, MAX_IPC_PAYLOAD_SIZE, 'ai:chat 入参');
        // P0 修复 C4：原子性检查+赋值，消除 TOCTOU 竞态窗口
        // 关键改进：整个检查+赋值+配置加载在同一个同步段中完成，中间不插入 await
        const ac = new AbortController();
        // 在赋值前检查并立即赋值（同步操作，不可中断）
        if (sharedState.chatAbortController) {
            throw new Error('上一次对话仍在进行中，请点击"中止"按钮后再发送新消息');
        }
        sharedState.chatAbortController = ac;
        // 立即加载配置（在第一个 await 前完成，确保原子性）
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        if (!cfg.baseUrl || !cfg.model) {
            sharedState.chatAbortController = null;
            throw new Error('AI 配置不完整，请先在 AI 设置中配置');
        }
        try {
        validateAiBaseUrl(cfg.baseUrl, 'AI API 地址');
        return await withDecryptedKey(() => decryptSecret(cfg.encryptedKey, 'API Key'), async (apiKey: string) => {
            if (!apiKey) throw new Error('API Key 未配置');
            const url = trimTrailingSlash(cfg.baseUrl) + '/chat/completions';

            const input = (payload && Array.isArray(payload.messages)) ? payload : { messages: Array.isArray(payload) ? payload : [] };
            const wantThinking = !!(payload && payload.thinking);
            const wantWebSearch = !!(payload && payload.webSearch);
            let lastUserPrompt = '';
            if (Array.isArray(input.messages)) {
                for (let i = input.messages.length - 1; i >= 0; i--) {
                    if (input.messages[i]?.role === 'user') {
                        const userMsg = input.messages[i];
                        if (typeof userMsg.content === 'string') {
                            lastUserPrompt = userMsg.content;
                        } else if (Array.isArray(userMsg.content)) {
                            const txtPart = userMsg.content.find((p: any) => p && p.type === 'text');
                            if (txtPart && txtPart.text) lastUserPrompt = txtPart.text;
                        }
                        break;
                    }
                }
            }

            const messages: any[] = [];
            if (cfg.prompt) messages.push({ role: 'system', content: cfg.prompt });
            if (Array.isArray(input.messages)) {
                for (const m of input.messages) {
                    if (!m || !m.role || !m.content) continue;
                    if (m.role !== 'user' && m.role !== 'assistant') continue;
                    if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
                        const parts: any[] = [{ type: 'text', text: m.content }];
                        // P3 修复：异步读取图片，避免 20MB 级图片同步读盘阻塞主进程
                        for (const img of m.images) {
                            if (!img) continue;
                            let url = img.dataUrl;
                            if (!url && img.path) {
                                url = await readChatImageAsDataUrl(img.path);
                            }
                            if (url) parts.push({ type: 'image_url', image_url: { url: url } });
                        }
                        messages.push({ role: 'user', content: parts });
                    } else {
                        messages.push({ role: m.role, content: m.content });
                    }
                }
            }
            if (messages.length === 0 || (cfg.prompt && messages.length === 1)) {
                throw new Error('没有可发送的对话内容');
            }

            const reqBody: any = {
                model: cfg.model,
                messages: messages,
                temperature: cfg.temperature ?? 1,
                stream: true,
            };
            if (wantThinking) {
                reqBody.enable_thinking = true;
            } else {
                reqBody.enable_thinking = false;
            }

            const startTs = Date.now();
            // M2 修复：ac 已在 await 前同步创建并赋值，此处不再重复创建
            const timeoutId = setTimeout(() => { try { ac.abort(); } catch (e: any) { console.warn('中止请求失败:', e.message); } }, 180000);
            let aborted = false;

            const sender = event.sender;
            let chatResult: any = null;
            try {
                const searchRaw = s.aiConfig?.webSearch || {};
            let searchApiKey = searchRaw.apiKey || '';
            if (searchRaw.encryptedKey) {
                try {
                    searchApiKey = await decryptSecret(searchRaw.encryptedKey, 'Web Search API Key');
                } catch (e: any) {
                    console.warn('[ai:chat] 解密搜索 API Key 失败，降级为空:', e.message);
                }
            }
            const searchConfig = {
                provider: searchRaw.provider || 'builtin',
                apiKey: searchApiKey,
                apiUrl: searchRaw.customUrl || '',
                maxResults: Number(searchRaw.resultCount) || 5,
                timeoutMs: 8000
            };
                chatResult = await executeAgenticChat(messages, {
                    baseUrl: cfg.baseUrl,
                    apiKey: apiKey,
                    model: cfg.model,
                    temperature: cfg.temperature ?? 1,
                    prompt: cfg.prompt,
                    enableThinking: wantThinking,
                    webSearchEnabled: wantWebSearch,
                    webSearchConfig: searchConfig,
                    signal: ac.signal,
                    onChunk: (evt) => {
                        // 保护：发送目标 webContents 可能已销毁（popout/主窗口关闭），吞掉发送异常避免中断流
                        try {
                            if (!sender.isDestroyed()) sender.send('chat:chunk', evt);
                        } catch (e: any) {
                            console.warn('[ai:chat] 推送 chunk 失败:', e.message);
                        }
                    }
                });
            } catch (err: any) {
                if (ac.signal.aborted) {
                    aborted = true;
                } else {
                    throw err;
                }
            } finally {
                clearTimeout(timeoutId);
                if (sharedState.chatAbortController === ac) {
                    sharedState.chatAbortController = null;
                }
            }

            const elapsedMs = Date.now() - startTs;
            // 方案一：关闭联网搜索时，彻底移除模型自带 Grounding 输出的搜索/引文冗长块
            const finalContent = chatResult ? chatResult.content : '';
            return {
                content: wantWebSearch ? finalContent : stripGroundingBlocks(finalContent),
                reasoning: chatResult ? chatResult.reasoning : '',
                model: chatResult ? chatResult.model : cfg.model,
                sources: chatResult ? chatResult.sources : [],
                usage: chatResult ? chatResult.usage : { input: 0, output: 0, total: 0 },
                elapsedMs: elapsedMs,
                aborted: aborted || (chatResult ? chatResult.aborted : false)
            };
        });
        } catch (err) {
            // M2 修复：早期错误（配置不完整/解密失败等）时清理 controller，
            // 避免后续 ai:chat 永远被"上一次对话仍在进行中"阻塞
            if (sharedState.chatAbortController === ac) {
                sharedState.chatAbortController = null;
            }
            throw err;
        }
    });

    // 67. 中断当前 AI 对话请求
    ipcMain.handle('chat:abort', () => {
        if (sharedState.chatAbortController) {
            try { sharedState.chatAbortController.abort(); } catch (e: any) { console.warn('中止对话请求失败:', e.message); }
            sharedState.chatAbortController = null;
            return true;
        }
        return false;
    });

    // 68. 保存自定义图片尺寸
    ipcMain.handle('ai:save-custom-size', (_event: any, size: string) => {
        const s = loadSettings();
        if (!s.aiConfig) s.aiConfig = {};
        s.aiConfig.customImageSize = size || '';
        return persistSettings();
    });

    // 69. 加载自定义图片尺寸
    ipcMain.handle('ai:load-custom-size', () => {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        return cfg.customImageSize || '';
    });

    // 70. 保存图片生成配置（支持双标准，互不覆盖）
    ipcMain.handle('ai:save-image-config', async (_event: any, config: any) => {
        const s = loadSettings();
        if (!s.aiConfig) s.aiConfig = {};
        if (config.provider !== undefined) {
            s.aiConfig.imageProvider = config.provider || 'openai';
        }
        const provider = s.aiConfig.imageProvider || 'openai';
        if (provider === 'dashscope') {
            if (config.baseUrl !== undefined) {
                validateAiBaseUrl(config.baseUrl, '百炼图片 API 地址');
                s.aiConfig.dashscopeBaseUrl = config.baseUrl;
            }
            if (config.apiKey !== undefined) s.aiConfig.dashscopeEncryptedKey = isMaskedCred(config.apiKey) ? s.aiConfig.dashscopeEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
            if (config.model !== undefined) s.aiConfig.dashscopeModel = config.model || 'qwen-image-2.0-pro';
            if (config.size !== undefined) s.aiConfig.dashscopeSize = config.size || '2048*2048';
        } else {
            if (config.baseUrl !== undefined) {
                validateAiBaseUrl(config.baseUrl, 'OpenAI 图片 API 地址');
                s.aiConfig.imageBaseUrl = config.baseUrl;
            }
            if (config.apiKey !== undefined) s.aiConfig.imageEncryptedKey = isMaskedCred(config.apiKey) ? s.aiConfig.imageEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
            if (config.model !== undefined) s.aiConfig.imageModel = config.model || 'dall-e-3';
            if (config.size !== undefined) s.aiConfig.imageSize = config.size || '1024x1024';
        }
        if (config.savePath !== undefined) {
            // M3 修复：校验 savePath，防渲染进程指定任意目录（如系统启动目录）写入文件
            const savePath = String(config.savePath || '').trim();
            if (savePath) {
                if (!path.isAbsolute(savePath)) {
                    throw new Error('图片保存路径必须为绝对路径');
                }
                const normalized = path.normalize(savePath);
                // 拒绝系统关键目录，防恶意写入
                const sysRoot = process.env.SystemRoot || 'C:\\Windows';
                const blockedPrefixes = [
                    sysRoot.toLowerCase(),
                    'c:\\program files',
                    'c:\\program files (x86)',
                    'c:\\programdata',
                ];
                const lower = normalized.toLowerCase();
                for (const prefix of blockedPrefixes) {
                    if (lower === prefix || lower.startsWith(prefix + path.sep)) {
                        throw new Error('图片保存路径不能位于系统关键目录：' + normalized);
                    }
                }
                s.aiConfig.imageSavePath = normalized;
                s.aiConfig.dashscopeSavePath = normalized;
            } else {
                s.aiConfig.imageSavePath = '';
                s.aiConfig.dashscopeSavePath = '';
            }
        }
        if (config.videoT2vModel !== undefined) s.aiConfig.videoT2vModel = config.videoT2vModel;
        if (config.videoI2vModel !== undefined) s.aiConfig.videoI2vModel = config.videoI2vModel;
        if (config.videoBaseUrl !== undefined) {
            validateAiBaseUrl(config.videoBaseUrl, '百炼视频 API 地址');
            s.aiConfig.dashscopeVideoBaseUrl = config.videoBaseUrl;
        }
        if (config.videoApiKey !== undefined) s.aiConfig.dashscopeVideoEncryptedKey = isMaskedCred(config.videoApiKey) ? s.aiConfig.dashscopeVideoEncryptedKey : await encryptSecret(config.videoApiKey, 'API Key');
        return persistSettings();
    });

    // 71. 加载图片生成配置（按当前 provider 返回，apiKey 掩码化）
    ipcMain.handle('ai:load-image-config', async () => {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        const provider = cfg.imageProvider || 'openai';
        let dashscopeKey = '', imageKey = '', videoKey = '';
        try { dashscopeKey = maskCred(await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key')); } catch (e: any) { console.warn('解密DashScope密钥失败:', e.message); }
        try { imageKey = maskCred(await decryptSecret(cfg.imageEncryptedKey, 'API Key')); } catch (e: any) { console.warn('解密图片密钥失败:', e.message); }
        try { videoKey = maskCred(await decryptSecret(cfg.dashscopeVideoEncryptedKey, 'API Key')); } catch (e: any) { console.warn('解密视频密钥失败:', e.message); }
        const unifiedSavePath = cfg.imageSavePath || cfg.dashscopeSavePath || '';
        if (provider === 'dashscope') {
            return {
                provider,
                baseUrl: cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com',
                apiKey: dashscopeKey,
                model: cfg.dashscopeModel || 'qwen-image-2.0-pro',
                size: cfg.dashscopeSize || '2048*2048',
                savePath: unifiedSavePath,
                videoT2vModel: cfg.videoT2vModel || 'wan2.7-t2v-2026-04-25',
                videoI2vModel: cfg.videoI2vModel || 'wan2.7-i2v-2026-04-25',
                videoBaseUrl: cfg.dashscopeVideoBaseUrl || '',
                videoApiKey: videoKey,
            };
        }
        return {
            provider,
            baseUrl: cfg.imageBaseUrl || cfg.baseUrl || '',
            apiKey: imageKey,
            model: cfg.imageModel || 'dall-e-3',
            size: cfg.imageSize || '1024x1024',
            savePath: unifiedSavePath,
            videoT2vModel: cfg.videoT2vModel || 'wan2.7-t2v-2026-04-25',
            videoI2vModel: cfg.videoI2vModel || 'wan2.7-i2v-2026-04-25',
            videoBaseUrl: cfg.dashscopeVideoBaseUrl || '',
            videoApiKey: videoKey,
        };
    });

    // 72. 中断当前视频生成轮询
    ipcMain.handle('ai:abort-video', () => {
        if (sharedState.videoAbortController) {
            try { sharedState.videoAbortController.abort(); } catch (e: any) { console.warn('中止视频请求失败:', e.message); }
            sharedState.videoAbortController = null;
            return true;
        }
        return false;
    });

    // 72.1 选择文件夹（图片保存路径等）
    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog({
            title: '选择文件夹',
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths.length) return '';
        return result.filePaths[0];
    });

    // 73. 生成图片（根据 provider 分流到 OpenAI 或 DashScope）
    ipcMain.handle('ai:generate-image', async (_event: any, params: any) => {
        assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'ai:generate-image 入参');
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        const provider = cfg.imageProvider || 'openai';

        if (provider === 'dashscope') {
            const baseUrl = cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com';
            validateAiBaseUrl(baseUrl, '百炼图片 API 地址');
            return await withDecryptedKey(async () => {
                let k = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
                if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
                return k;
            }, async (apiKey: string) => {
                if (!baseUrl) throw new Error('百炼 API 地址未配置');
                if (!apiKey) throw new Error('API Key 未配置');
                const model = params.model || cfg.dashscopeModel || 'qwen-image-2.0-pro';
                let size = params.size || cfg.dashscopeSize || '2048*2048';
                if (size === 'auto' || size === '默认') {
                    size = '';
                } else {
                    size = size.replace('x', '*');
                }
                const prompt = params.prompt || '';
                if (!prompt) throw new Error('提示词不能为空');
                return await dashscopeGenerate(baseUrl, apiKey, model, prompt, size, params.imageData, cfg);
            });
        }

        // OpenAI 标准
        const baseUrl = cfg.imageBaseUrl || cfg.baseUrl || '';
        validateAiBaseUrl(baseUrl, 'OpenAI 图片 API 地址');
        return await withDecryptedKey(async () => {
            let k = await decryptSecret(cfg.imageEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
            return k;
        }, async (apiKey: string) => {
            if (!baseUrl) throw new Error('图片生成 API 地址未配置');
            if (!apiKey) throw new Error('API Key 未配置');
            const model = params.model || cfg.imageModel || 'dall-e-3';
            const rawSize = params.size || cfg.imageSize || '1024x1024';
            const useDefaultSize = (rawSize === 'auto' || rawSize === '默认' || rawSize === '');
            const size = useDefaultSize ? '1024x1024' : rawSize;
            const prompt = params.prompt || '';
            if (!prompt) throw new Error('提示词不能为空');

            let url, resp;
            if (params.imageData) {
                // 图生图: /images/edits (multipart)
                url = buildOpenAiImageUrl(baseUrl, '/images/edits');
                const base64Data = params.imageData.replace(/^data:image\/[\w.+-]+;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                // 修复：按魔数嗅探真实格式决定 multipart 的 MIME 与文件名，
                // 避免用户上传 JPEG/WebP 时被硬编码为 image/png 导致部分服务端格式校验失败
                const sniffedMime = sniffImageMime(imageBuffer, 'image/png');
                const mimeExt = sniffedMime === 'image/jpeg' ? 'jpg' : sniffedMime === 'image/webp' ? 'webp' : sniffedMime === 'image/gif' ? 'gif' : 'png';
                const form = new FormData();
                form.append('image', new Blob([imageBuffer], { type: sniffedMime }), 'image.' + mimeExt);
                form.append('prompt', prompt);
                form.append('model', model);
                form.append('n', '1');
                form.append('size', size);
                resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + apiKey },
                    body: form,
                    signal: AbortSignal.timeout(60000),
                });
            } else {
                // 文生图: /images/generations
                url = buildOpenAiImageUrl(baseUrl, '/images/generations');
                resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                    body: JSON.stringify({
                        model: model,
                        prompt: prompt,
                        n: 1,
                        size: size,
                    }),
                    signal: AbortSignal.timeout(60000),
                });
            }

            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error('HTTP ' + resp.status + ': ' + (errText || resp.statusText));
            }
            const data = await resp.json();
            // 提取图片并转为 dataURL，同时保存到磁盘
            const item = data && data.data && data.data[0];
            if (!item) throw new Error('API 未返回图片数据');
            if (item.b64_json) {
                // 修复：按魔数嗅探真实格式构造 dataURL（部分模型返回的 b64 数据可能不是 PNG）
                const dataUrl = bufferToImageDataUrl(Buffer.from(item.b64_json, 'base64'));
                saveImageToDisk(dataUrl, cfg);
                return dataUrl;
            }
            if (item.url) {
                if (!(await isSafeExternalUrlAsync(item.url))) {
                    throw new Error('AI 服务返回的图片地址不安全（需 https 外网地址），已拒绝下载');
                }
                // 下载图片 URL 转为 dataURL（复用 fetchImageAsDataUrl：Content-Type + 魔数嗅探正确 MIME）
                return await fetchImageAsDataUrl(item.url, cfg);
            }
            throw new Error('API 未返回图片数据');
        });
    });

    // 74. 生成视频（仅支持阿里云百炼 wan2.7 系列）
    ipcMain.handle('ai:generate-video', async (_event: any, params: any) => {
        assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'ai:generate-video 入参');
        if (sharedState.videoGenerating) {
            throw new Error('上一次视频生成仍在进行中，请等待完成后再试');
        }
        sharedState.videoGenerating = true;
        try {
            const s = loadSettings();
            const cfg = s.aiConfig || {};
            const baseUrl = cfg.dashscopeVideoBaseUrl || cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com';
            validateAiBaseUrl(baseUrl, '百炼视频 API 地址');
            return await withDecryptedKey(async () => {
                let k = await decryptSecret(cfg.dashscopeVideoEncryptedKey, 'API Key');
                if (!k) k = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
                if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
                return k;
            }, async (apiKey: string) => {
                if (!baseUrl) throw new Error('百炼 API 地址未配置');
                if (!apiKey) throw new Error('API Key 未配置');

                let model = params.model;
                if (!model) {
                    if (params.modelType === 't2v') {
                        model = cfg.videoT2vModel || 'wan2.7-t2v-2026-04-25';
                    } else if (params.modelType === 'i2v') {
                        model = cfg.videoI2vModel || 'wan2.7-i2v-2026-04-25';
                    } else {
                        model = params.imageData
                            ? (cfg.videoI2vModel || 'wan2.7-i2v-2026-04-25')
                            : (cfg.videoT2vModel || 'wan2.7-t2v-2026-04-25');
                    }
                }
                const prompt = params.prompt || '';
                if (!prompt) throw new Error('提示词不能为空');
                const size = params.size || '';
                const duration = params.duration || 5;
                const ratio = params.ratio || '16:9';
                return await dashscopeGenerateVideo(baseUrl, apiKey, model, prompt, size, params.imageData, cfg, duration, ratio);
            });
        } finally {
            sharedState.videoGenerating = false;
        }
    });

    /* ---------- 音乐播放器（6 个 handle） ---------- */
    // 75. 文件选择对话框
    ipcMain.handle('music:pick-files', tryWrap(async () => {
        const result = await dialog.showOpenDialog({
            title: '选择音乐文件',
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'weba', 'webm'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });
        if (result.canceled || !result.filePaths.length) return { success: true, files: [] };
        const files: any[] = [];
        for (const p of result.filePaths) {
            const ext = path.extname(p).toLowerCase();
            if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) continue;
            try {
                const st = await fs.promises.stat(p);
                if (st.isFile()) {
                    files.push({ filePath: p, size: st.size });
                    await approveAudioPath(p); // C3 修复：注册到已批准集合
                }
            } catch (e: any) { console.warn('获取文件信息失败:', e.message); }
        }
        return { success: true, files };
    }));

    // 76. 文件夹选择对话框
    ipcMain.handle('music:pick-folder', tryWrap(async () => {
        const result = await dialog.showOpenDialog({
            title: '选择音乐文件夹',
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths.length) return { success: true, folderPath: '' };
        // M4 修复：将用户通过 dialog 选定的目录注册到已批准集合
        await approveScanFolder(result.filePaths[0]);
        return { success: true, folderPath: result.filePaths[0] };
    }));

    // 77. 递归扫描文件夹
    ipcMain.handle('music:scan-folder', tryWrap(async (_event: any, { folderPath, recursive }: { folderPath: string; recursive: boolean }) => {
        if (!folderPath || typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
            throw new Error('文件夹路径无效');
        }
        // M4 修复：仅允许扫描已批准目录（通过 music:pick-folder 选定）或 app 音乐目录
        let isAllowed = false;
        try {
            const realFolder = await fs.promises.realpath(folderPath);
            isAllowed = await isApprovedFolder(realFolder);
        } catch (_) { /* realpath 失败 */ }
        if (!isAllowed) {
            throw new Error('目录未授权，请先通过"选择文件夹"按钮选定目录');
        }
        assertPayloadSize({ folderPath, recursive }, MAX_IPC_PAYLOAD_SIZE, 'music:scan-folder');
        const doRecursive = recursive !== false;
        const MAX_FILES = 2000;
        const files: any[] = [];
        // P3 修复：所有 approveAudioPath 并发执行（fs.promises 底层线程池排队），
        // 避免 2000 文件逐个 await 串行 realpath 拖慢扫描
        const pendingApprovals: Promise<void>[] = [];
        const walk = async (dir: string, depth: number) => {
            if (files.length >= MAX_FILES) return;
            let entries: fs.Dirent[];
            try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
            catch (_) { return; }
            for (const entry of entries) {
                if (files.length >= MAX_FILES) return;
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (MUSIC_AUDIO_EXTENSIONS.includes(ext)) {
                        try {
                            // P3 修复：复用本次 stat 的 size，避免 approveAudioPath 内部再 stat 一次
                            const st = await fs.promises.stat(fullPath);
                            if (st.isFile()) {
                                files.push({ filePath: fullPath, size: st.size });
                                pendingApprovals.push(approveAudioPath(fullPath, st.size)); // C3 修复：注册到已批准集合
                            }
                        } catch (e: any) { console.warn('获取文件信息失败:', e.message); }
                    }
                } else if (entry.isDirectory() && doRecursive && depth < 10) {
                    await walk(fullPath, depth + 1);
                }
            }
        };
        await walk(folderPath, 0);
        // 等待所有并发注册完成（防止 handler 返回时 approvedAudioPaths 未就绪）
        await Promise.all(pendingApprovals);
        return { success: true, files, truncated: files.length >= MAX_FILES };
    }));

    // 78. 读取音频文件元数据
    ipcMain.handle('music:read-metadata', tryWrap(async (_event: any, { filePath }: { filePath: string }) => {
        if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
            throw new Error('文件路径无效');
        }
        const ext = path.extname(filePath).toLowerCase();
        if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) {
            throw new Error('不支持的音频格式：' + ext);
        }
        // M4 修复：仅允许读取已批准路径（pick-files 选定/scan-folder 发现）或已批准扫描目录/app音乐目录下的文件
        if (!(await isAudioPathAllowed(filePath))) {
            throw new Error('文件未授权，请通过文件选择器或文件夹扫描添加');
        }
        const st = await fs.promises.stat(filePath);
        if (!st.isFile()) throw new Error('路径不是文件');
        await approveAudioPath(filePath); // C3 修复：注册到已批准集合

        let title = path.basename(filePath, ext);
        let artist = '';
        let album = '';
        let duration = 0;
        let coverPath = '';

        try {
            const mimeType = MUSIC_MIME_MAP[ext];
            const rs = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
            try {
                const { parseStream } = require('music-metadata');
                const metadata = await parseStream(rs, mimeType);
                if (metadata.common) {
                    title = metadata.common.title || title;
                    artist = (metadata.common.artist && String(metadata.common.artist)) || '';
                    album = (metadata.common.album && String(metadata.common.album)) || '';
                }
                if (metadata.format && metadata.format.duration) {
                    duration = Math.round(metadata.format.duration);
                }
                if (metadata.common && metadata.common.picture && metadata.common.picture.length > 0) {
                    const pic = metadata.common.picture[0];
                    if (pic.data && pic.data.length > 5 * 1024 * 1024) {
                        console.warn('[Music] 封面图过大，跳过:', pic.data.length);
                    } else {
                        const coverExt = pic.format === 'image/png' ? '.png'
                            : pic.format === 'image/webp' ? '.webp' : '.jpg';
                        const hash = crypto.createHash('sha256').update(pic.data).digest('hex').slice(0, 32);
                        const coverFileName = hash + coverExt;
                        const coverFullPath = path.join(getMusicCoversDir(), coverFileName);
                        try {
                            await fs.promises.mkdir(getMusicCoversDir(), { recursive: true });
                            await fs.promises.access(coverFullPath).catch(async () => {
                                await fs.promises.writeFile(coverFullPath, pic.data);
                            });
                            coverPath = coverFullPath;
                            // 缩略图：96×96 JPEG，列表项使用（控制条大封面仍用原图）
                            const thumbPath = thumbPathFor(coverFullPath);
                            try {
                                const img = nativeImage.createFromBuffer(pic.data);
                                if (!img.isEmpty()) {
                                    const thumbBuf = img.resize({ width: 96, height: 96, quality: 'good' }).toJPEG(85);
                                    await fs.promises.mkdir(path.dirname(thumbPath), { recursive: true });
                                    await fs.promises.access(thumbPath).catch(() => fs.promises.writeFile(thumbPath, thumbBuf));
                                }
                            } catch (e: any) {
                                console.warn('[Music] 缩略图生成失败:', e.message);
                            }
                        } catch (e: any) {
                            console.warn('[Music] 封面保存失败:', e.message);
                        }
                    }
                }
            } finally {
                rs.destroy();
            }
        } catch (e: any) {
            console.warn('[Music] 元数据解析失败，降级使用文件名:', filePath, e.message);
        }

        return {
            success: true,
            metadata: {
                filePath,
                title,
                artist,
                album,
                duration,
                coverPath,
                thumbPath: coverPath ? thumbPathFor(coverPath) : '',
                size: st.size
            }
        };
    }));

    // 79b. 补齐已有封面缩略图（幂等：已存在跳过；供音乐 tab 激活时后台触发）
    ipcMain.handle('music:ensure-thumbs', tryWrap(async () => {
        const coversDir = getMusicCoversDir();
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(coversDir, { withFileTypes: true });
        } catch (_) {
            return { success: true, generated: 0, skipped: 0 };
        }
        let generated = 0, skipped = 0;
        for (const ent of entries) {
            if (!ent.isFile()) continue; // 跳过 thumb 子目录等
            const src = path.join(coversDir, ent.name);
            const thumb = thumbPathFor(src);
            try {
                await fs.promises.access(thumb);
                skipped++;
                continue;
            } catch (_) { /* 缩略图缺失，需生成 */ }
            try {
                const buf = await fs.promises.readFile(src);
                const img = nativeImage.createFromBuffer(buf);
                if (img.isEmpty()) { skipped++; continue; }
                const thumbBuf = img.resize({ width: 96, height: 96, quality: 'good' }).toJPEG(85);
                await fs.promises.mkdir(path.dirname(thumb), { recursive: true });
                await fs.promises.writeFile(thumb, thumbBuf);
                generated++;
            } catch (e: any) {
                console.warn('[Music] 缩略图生成失败:', src, e.message);
                skipped++;
            }
        }
        return { success: true, generated, skipped };
    }));

    // 79. 加载播放列表
    ipcMain.handle('music:load-playlist', tryWrap(async () => {
        const data = await loadJSONAsync<any[]>(getMusicPlaylistPath(), []);
        const playlist = Array.isArray(data) ? data : [];
        // C3 修复：将播放列表中的音频路径注册到已批准集合（重启后恢复播放权限）
        for (const item of playlist) {
            if (item && typeof item.filePath === 'string' && path.isAbsolute(item.filePath)) {
                await approveAudioPath(item.filePath);
            }
        }
        return { success: true, playlist };
    }));

    // 80. 保存播放列表
    ipcMain.handle('music:save-playlist', tryWrap(async (_event: any, playlist: any[]) => {
        assertPayloadSize(playlist, MAX_IPC_PAYLOAD_SIZE, 'music:save-playlist');
        if (!Array.isArray(playlist)) throw new Error('播放列表格式无效');
        await fs.promises.mkdir(getMusicDir(), { recursive: true });
        // C3 修复：保存时同步注册到已批准集合
        for (const item of playlist) {
            if (item && typeof item.filePath === 'string' && path.isAbsolute(item.filePath)) {
                await approveAudioPath(item.filePath);
            }
        }
        await saveJSON(getMusicPlaylistPath(), playlist);
        return { success: true };
    }));

    // 80a. 加载音乐收藏列表
    ipcMain.handle('music:load-favorites', tryWrap(async () => {
        const data = await loadJSONAsync<Record<string, any>>(getMusicFavoritesPath(), {});
        const favorites = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        for (const item of Object.values(favorites)) {
            if (item && typeof (item as any).filePath === 'string' && path.isAbsolute((item as any).filePath)) {
                await approveAudioPath((item as any).filePath);
            }
        }
        return { success: true, favorites };
    }));

    // 80b. 保存音乐收藏列表
    ipcMain.handle('music:save-favorites', tryWrap(async (_event: any, favorites: any) => {
        assertPayloadSize(favorites, MAX_IPC_PAYLOAD_SIZE, 'music:save-favorites');
        if (!favorites || typeof favorites !== 'object' || Array.isArray(favorites)) throw new Error('收藏列表格式无效');
        await fs.promises.mkdir(getMusicDir(), { recursive: true });
        for (const item of Object.values(favorites)) {
            if (item && typeof (item as any).filePath === 'string' && path.isAbsolute((item as any).filePath)) {
                await approveAudioPath((item as any).filePath);
            }
        }
        await saveJSON(getMusicFavoritesPath(), favorites);
        return { success: true };
    }));

    // 80c. 加载保存的音频文件夹列表
    ipcMain.handle('music:load-folders', tryWrap(async () => {
        const data = await loadJSONAsync<string[]>(getMusicFoldersPath(), []);
        const folders = Array.isArray(data) ? data.filter(f => typeof f === 'string' && f.trim()) : [];
        for (const folder of folders) {
            await approveScanFolder(folder);
        }
        return { success: true, folders };
    }));

    // 80d. 保存音频文件夹列表
    ipcMain.handle('music:save-folders', tryWrap(async (_event: any, folders: string[]) => {
        assertPayloadSize(folders, MAX_IPC_PAYLOAD_SIZE, 'music:save-folders');
        if (!Array.isArray(folders)) throw new Error('文件夹列表格式无效');
        await fs.promises.mkdir(getMusicDir(), { recursive: true });
        const validFolders = folders.filter(f => typeof f === 'string' && f.trim());
        for (const folder of validFolders) {
            await approveScanFolder(folder);
        }
        await saveJSON(getMusicFoldersPath(), validFolders);
        return { success: true };
    }));

    /* ---------- FM 收音机（10 个 handle） ---------- */
    // 81. 加载 FM 配置
    ipcMain.handle('radio:load-config', tryWrap(async () => {
        return { success: true, config: getMergedRadioConfig() };
    }));

    // 82. 保存 FM 配置
    ipcMain.handle('radio:save-config', tryWrap(async (_event: any, config: any) => {
        assertPayloadSize(config, MAX_IPC_PAYLOAD_SIZE, 'radio:save-config');
        const s = loadSettings();
        if (!s.aiConfig) s.aiConfig = {};
        const old = s.aiConfig.radioConfig || {};
        const next = Object.assign({}, old);
        if (config.apiBaseUrl !== undefined) {
            if (config.apiBaseUrl === 'cnhk-music') {
                next.apiBaseUrl = 'cnhk-music';
            } else {
                validateAiBaseUrl(config.apiBaseUrl, 'FM API 地址');
                if (config.apiBaseUrl && !(await isSafePublicStreamUrlAsync(config.apiBaseUrl))) {
                    throw new Error('FM API 地址不安全：不允许指向内网或本地地址');
                }
                next.apiBaseUrl = config.apiBaseUrl;
            }
        }
        if (config.timeout !== undefined) {
            const t = Number(config.timeout);
            if (!Number.isFinite(t) || t < 3000 || t > 30000) {
                throw new Error('请求超时必须在 3000-30000ms 之间');
            }
            next.timeout = t;
        }
        if (config.customStations !== undefined) {
            if (!Array.isArray(config.customStations)) throw new Error('自定义电台列表格式无效');
            const mapped = config.customStations.slice(0, 500).map((st: any) => ({
                name: String(st.name || '').slice(0, 128),
                url: String(st.url || '').slice(0, 1024),
                homepage: String(st.homepage || '').slice(0, 512),
                favicon: String(st.favicon || '').slice(0, 512),
                country: String(st.country || '').slice(0, 64),
                tags: String(st.tags || '').slice(0, 256)
            })).filter((st: any) => st.name && st.url);
            // C4 修复：异步 DNS 校验自定义电台 URL，剔除指向内网/本地的地址
            const safeStations: any[] = [];
            for (const st of mapped) {
                if (await isSafePublicStreamUrlAsync(st.url)) {
                    safeStations.push(st);
                } else {
                    console.warn('[radio] 自定义电台 URL 未通过 SSRF 校验，已剔除:', st.url);
                }
            }
            next.customStations = safeStations;
        }
        s.aiConfig.radioConfig = next;
        await persistSettings();
        return { success: true };
    }));

    // 83. 获取 RadioBrowser 可用镜像列表
    // （已删除未使用的 radio:get-servers handler —— 渲染层零调用，preload 对应 API 同步移除）

    // 84. 获取热门电台（带 7 天本地缓存）
    ipcMain.handle('radio:get-topstations', tryWrap(async (_event: any, { limit }: { limit?: number } = {}) => {
        const cfg = getMergedRadioConfig();
        const lim = Math.max(1, Math.min(200, Number(limit) || 50));
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cachePath = getRadioCachePath();
        const custom = normalizeStations(cfg.customStations);

        let cached: any = null;
        try {
            cached = await loadJSONAsync(cachePath, null);
        } catch (e: any) {
            cached = null;
        }
        const cacheFresh = !!(cached && Array.isArray(cached.stations) && cached.fetchedAt
            && (Date.now() - cached.fetchedAt) < SEVEN_DAYS_MS);
        if (cacheFresh) {
            const cachedChinaHk = Array.isArray(cached.chinaHk) ? cached.chinaHk : [];
            return { success: true, stations: dedupStationsByUrl(cachedChinaHk, custom, cached.stations), fromCache: true };
        }

        const [topRes, cnRes, hkRes] = await Promise.all([
            fetchRadioStations(cfg, '/json/stations/topvote/' + lim),
            fetchRadioStations(cfg, '/json/stations/bycountryexact/China?limit=50'),
            fetchRadioStations(cfg, '/json/stations/bycountryexact/Hong%20Kong?limit=30')
        ]);
        const topStations = topRes || [];
        const chinaHkStations = dedupStationsByUrl(cnRes || [], hkRes || []);

        if (topRes === null && cnRes === null && hkRes === null) {
            if (cached && Array.isArray(cached.stations) && cached.stations.length > 0) {
                const cachedChinaHk = Array.isArray(cached.chinaHk) ? cached.chinaHk : [];
                return { success: true, stations: dedupStationsByUrl(cachedChinaHk, custom, cached.stations), fromCache: true, note: 'API 不可用，使用旧缓存' };
            }
            return { success: true, stations: dedupStationsByUrl(chinaHkStations, custom), fromCache: false, note: 'API 不可用且无缓存' };
        }

        try {
            await fs.promises.mkdir(getRadioDir(), { recursive: true });
            await saveJSON(cachePath, { stations: topStations, chinaHk: chinaHkStations, fetchedAt: Date.now() });
        } catch (e: any) {
            console.error('[radio:get-topstations] 写缓存失败:', e.message);
        }

        return { success: true, stations: dedupStationsByUrl(chinaHkStations, custom, topStations), fromCache: false };
    }));

    // 85. 获取中文/香港音乐电台（精选 + RadioBrowser 筛选，带 7 天缓存）
    ipcMain.handle('radio:get-cnhk-music-stations', tryWrap(async (_event: any, { limit }: { limit?: number } = {}) => {
        const cfg = getMergedRadioConfig();
        const lim = Math.max(1, Math.min(200, Number(limit) || 50));
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cachePath = getRadioCachePath();
        const custom = normalizeStations(cfg.customStations);
        const curated = normalizeStations(BUILTIN_CN_HK_MUSIC_STATIONS);

        let cached: any = null;
        try {
            cached = await loadJSONAsync(cachePath, null);
        } catch (e: any) {
            cached = null;
        }
        const cachedCnHk = cached && Array.isArray(cached.cnhkMusic) ? cached.cnhkMusic : null;
        const cacheFresh = !!(cachedCnHk && cached.fetchedAtCnHk
            && (Date.now() - cached.fetchedAtCnHk) < SEVEN_DAYS_MS);
        if (cacheFresh) {
            return { success: true, stations: dedupStationsByUrl(curated, custom, cachedCnHk).slice(0, lim), fromCache: true };
        }

        // 修复：此前构造 radioCfg（强制默认 apiBaseUrl）却把原 cfg 传给抓取函数，
        // 用户在设置面板配置的自定义镜像地址在此通道完全不生效。统一使用同一 cfg。
        const rbStations = await fetchCnHkMusicFromRadioBrowser(cfg, buildRadioTryUrls(cfg));

        if (rbStations === null) {
            if (cachedCnHk && cachedCnHk.length > 0) {
                return { success: true, stations: dedupStationsByUrl(curated, custom, cachedCnHk).slice(0, lim), fromCache: true, note: 'API 不可用，使用旧缓存' };
            }
            return { success: true, stations: dedupStationsByUrl(curated, custom).slice(0, lim), fromCache: false, note: 'API 不可用，仅显示精选电台' };
        }

        try {
            await fs.promises.mkdir(getRadioDir(), { recursive: true });
            const newCache = Object.assign({}, cached || {}, {
                cnhkMusic: rbStations,
                fetchedAtCnHk: Date.now()
            });
            await saveJSON(cachePath, newCache);
        } catch (e: any) {
            console.error('[radio:get-cnhk-music-stations] 写缓存失败:', e.message);
        }

        return { success: true, stations: dedupStationsByUrl(curated, custom, rbStations).slice(0, lim), fromCache: false };
    }));

    // 86. 按来源获取电台
    ipcMain.handle('radio:get-stations-by-source', tryWrap(async (_event: any, { source, limit }: { source?: string; limit?: number } = {}) => {
        const cfg = getMergedRadioConfig();
        const lim = Math.max(1, Math.min(200, Number(limit) || 100));
        const src = encodeURIComponent(String(source || 'topvote').slice(0, 32));

        let pathAndQuery: string;
        switch (src) {
            case 'topvote':
                pathAndQuery = '/json/stations/topvote/' + lim;
                break;
            case 'topclick':
                pathAndQuery = '/json/stations/topclick/' + lim;
                break;
            case 'recent':
                pathAndQuery = '/json/stations/lastclick/' + lim;
                break;
            case 'bycountry-china':
                pathAndQuery = '/json/stations/bycountryexact/China?limit=' + lim;
                break;
            case 'bycountry-hongkong':
                pathAndQuery = '/json/stations/bycountryexact/Hong%20Kong?limit=' + lim;
                break;
            default:
                pathAndQuery = '/json/stations/topvote/' + lim;
        }

        let stations = await fetchRadioStations(cfg, pathAndQuery);
        const custom = normalizeStations(cfg.customStations);
        if (stations === null) {
            return { success: true, stations: dedupStationsByUrl(custom), source: src, note: 'API 不可用' };
        }
        return { success: true, stations: dedupStationsByUrl(custom, stations), source: src };
    }));

    // 87. 搜索电台
    ipcMain.handle('radio:search', tryWrap(async (_event: any, { keyword, country, tag, limit }: { keyword?: string; country?: string; tag?: string; limit?: number } = {}) => {
        const cfg = getMergedRadioConfig();
        const lim = Math.max(1, Math.min(200, Number(limit) || 50));

        let pathAndQuery: string;
        if (keyword) {
            pathAndQuery = '/json/stations/byname/' + encodeURIComponent(String(keyword).slice(0, 128)) + '?limit=' + lim;
        } else if (country) {
            pathAndQuery = '/json/stations/bycountry/' + encodeURIComponent(String(country).slice(0, 64)) + '?limit=' + lim;
        } else if (tag) {
            pathAndQuery = '/json/stations/bytag/' + encodeURIComponent(String(tag).slice(0, 64)) + '?limit=' + lim;
        } else {
            pathAndQuery = '/json/stations/topvote/' + lim;
        }

        const searchErr: { error?: string } = {};
        const stations = await fetchRadioStations(cfg, pathAndQuery, searchErr);
        return { success: true, stations: stations || [], note: stations === null ? ('搜索失败' + (searchErr.error ? ': ' + searchErr.error : '')) : undefined };
    }));

    // 88. 加载收藏列表
    ipcMain.handle('radio:load-favorites', tryWrap(async () => {
        const data = await loadJSONAsync(getRadioFavoritesPath(), []);
        return { success: true, favorites: Array.isArray(data) ? data : [] };
    }));

    // 89. 保存收藏列表
    ipcMain.handle('radio:save-favorites', tryWrap(async (_event: any, favorites: any[]) => {
        assertPayloadSize(favorites, MAX_IPC_PAYLOAD_SIZE, 'radio:save-favorites');
        if (!Array.isArray(favorites)) throw new Error('收藏列表格式无效');
        await fs.promises.mkdir(getRadioDir(), { recursive: true });
        await saveJSON(getRadioFavoritesPath(), favorites);
        return { success: true };
    }));

    // 90. 清除电台缓存
    ipcMain.handle('radio:clear-cache', tryWrap(async () => {
        try {
            await fs.promises.unlink(getRadioCachePath());
        } catch (e: any) {
            if (e.code !== 'ENOENT') throw e;
        }
        return { success: true };
    }));

    /* ---------- 日志管理（7 个：6 handle + 1 on） ---------- */
    // 91. 渲染进程/子窗口批量上报日志（异步）
    ipcMain.handle('log:report', tryWrap(async (_event: any, data: any) => processLogReport(data)));

    // 92. 崩溃兜底同步上报通道（sendSync 配对）
    ipcMain.on('log:report-sync', (event: any, data: any) => {
        try {
            event.returnValue = processLogReport(data);
        } catch (e: any) {
            console.error('[IPC ERROR]', e);
            logger.appendLog('ERROR', ['[log:report-sync]', e.message], 'main');
            event.returnValue = { success: false, message: e.message };
        }
    });

    // 93. 获取日志文本（支持过滤）
    ipcMain.handle('logs:get', (_e: any, filter: any) => {
        try {
            return logger.getAllLogs(filter);
        } catch (e: any) {
            return '读取日志失败: ' + e.message;
        }
    });

    // 94. 刷新日志：先刷入文件再返回最新内容
    ipcMain.handle('logs:refresh', (_e: any, filter: any) => {
        try {
            logger.flushLogFile();
            return logger.getAllLogs(filter);
        } catch (e: any) {
            return '刷新日志失败: ' + e.message;
        }
    });

    // 95. 获取日志元数据
    ipcMain.handle('logs:meta', tryWrap(async () => {
        const stats = logger.getLogStats();
        let currentFile = '';
        try { currentFile = logger.getWritableLogPath(); } catch (e: any) { console.warn('获取日志路径失败:', e.message); }
        return {
            success: true,
            total: stats.total,
            byLevel: stats.byLevel,
            bySource: stats.bySource,
            logDir: logger.getLogDir(),
            currentFile: currentFile,
        };
    }));

    // 96. 复制全部日志到剪贴板（主进程 clipboard，绕过 CSP）
    ipcMain.handle('logs:copy-all', (_e: any, text: string) => {
        try {
            const content = typeof text === 'string' ? text : logger.getAllLogs();
            if (!content) return { success: false, message: '日志为空' };
            if (content.length > MAX_CLIPBOARD_TEXT_SIZE) {
                return { success: false, message: '日志内容过大（' + Math.round(content.length / 1024) + 'KB），请清空后重试' };
            }
            clipboard.writeText(content);
            return { success: true, message: '已复制 ' + content.length + ' 字符' };
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    });

    // 97. 清空日志（内存 + 当天文件）
    ipcMain.handle('logs:clear', () => {
        try {
            logger.clearAllLogs();
            return { success: true };
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    });
}
