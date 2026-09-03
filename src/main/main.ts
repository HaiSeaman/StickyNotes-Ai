/* ==================== 主进程入口（TypeScript 重写） ====================
 * 从原 main.js 迁移而来。业务逻辑逐字等价，仅做类型化外壳。
 * 工具模块已全部 TS 化（paths.ts / json-io.ts / security.ts / logger.ts 等）。
 * IPC handler 注册委托给 ./ipc/index.ts 的 registerIpcHandlers()。
 * ============================================================ */
import { app, BrowserWindow, Tray, Menu, nativeImage, safeStorage, protocol, screen, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';
import http from 'http';

// 以下三个模块改为懒加载（用到时才 require），加速启动
function lazyRequire<T>(mod: string): () => T {
    let cached: T | null = null;
    return (): T => {
        if (cached === null) cached = require(mod);
        return cached as T;
    };
}
const getAdmZip = lazyRequire<any>('adm-zip');
const getAwsS3 = lazyRequire<any>('@aws-sdk/client-s3');

// 日志子系统（内存缓冲 + 文件轮转 + 控制台劫持 + 进程异常捕获）
import * as logger from './lib/logger.js';

// TS 版 syncService（优先使用），导出 webdavRequest
import { webdavRequest, parseWebdavPropfindXml } from './services/syncService.js';

// TS 工具模块
import { serveLocalFile, buildRangeStreamResponse } from './lib/protocol.js';
import { streamDownloadToFile, safeFetch } from './lib/downloadUtils.js';
import { extractHttpError } from './lib/httpUtils.js';
import { getOverlayLoggerScript, getPopoutCommonCss, buildPopoutHtml } from './lib/popoutTemplate.js';

import {
    isSafeExternalUrlAsync,
    isPrivateOrLoopbackHost,
    escapeHtmlFull,
} from './lib/security.js';

import { loadJSON, saveJSON, saveJSONSync } from './lib/json-io.js';
import { trimTrailingSlash } from './lib/shared-utils.js';

import {
    getSettingsPath,
    getChatImagesDir,
    getMusicCoversDir,
} from './lib/paths.js';

// 跨模块共享状态（独立模块，避免 main ↔ ipc 可变状态循环依赖）
import { sharedState, approvedAudioPaths, approvedScanFolders, popoutWindows, todoPopoutWindows } from './lib/state.js';

// IPC handler 注册 + 活跃度刷盘（circular dep：运行时才调用，安全）
import { registerIpcHandlers, flushActivity, isPendingSave } from './ipc/index.js';

/* ==================== 全局变量 ==================== */
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// 设置缓存（主进程内部）
let settingsCache: any = null;

// 备份文件大小上限：200MB
const MAX_BACKUP_SIZE = 200 * 1024 * 1024;
// 聊天图片大小上限：20MB
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
// 剪贴板文本大小上限：1MB
export const MAX_CLIPBOARD_TEXT_SIZE = 1024 * 1024;

// 自动同步定时器
let autoSyncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;

// 退出重试计数
let quitRetryCount = 0;
const MAX_QUIT_RETRY = 10;
const QUIT_RETRY_INTERVAL = 200;

/* ==================== chatimg / musicfile 自定义协议 ====================
 * 必须在 app ready 前注册 scheme。
 */
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'chatimg',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    },
    {
        scheme: 'musicfile',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    }
]);

/* ==================== 托盘/窗口图标生成 ==================== */
// 调用点仅 createSunIcon(256)（窗口图标）与 createSunIcon(32)（托盘/任务栏叠加），
// 图标源文件本身已是目标尺寸，无需 resize（原函数 resize 分支不可达，已移除）
function createSunIcon(size: number): Electron.NativeImage {
    try {
        const assetsDir = path.join(__dirname, '..', 'assets');
        const iconPath = size <= 48
            ? path.join(assetsDir, 'tray-icon.png')
            : path.join(assetsDir, 'app-icon.png');
        const img = nativeImage.createFromPath(iconPath);
        if (img && !img.isEmpty()) {
            return img;
        }
    } catch (e: any) {
        console.warn('加载图标失败:', e.message);
    }
    return nativeImage.createEmpty().resize({ width: size, height: size });
}


/* ==================== 设置缓存 ==================== */
export function loadSettings(): any {
    if (!settingsCache) {
        settingsCache = loadJSON(getSettingsPath(), {});
    }
    return settingsCache;
}

export async function persistSettings(): Promise<boolean> {
    if (settingsCache) {
        try { return await saveJSON(getSettingsPath(), settingsCache); }
        catch (e: any) { console.error('持久化设置失败:', e.message); return false; }
    }
    return false;
}

// 失效设置缓存（sync:restore-backup 后调用）
export function invalidateSettingsCache(): void {
    settingsCache = null;
}

// 获取主窗口（供 index.ts 使用）
export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}

/* ==================== 旧版明文凭据自动迁移 ==================== */
async function migrateLegacyCreds(): Promise<void> {
    const s = loadSettings();
    const syncCfg = s.syncConfig || {};
    let migrated = false;

    if (syncCfg.s3 && (syncCfg.s3.accessKey || syncCfg.s3.secretKey)) {
        const old = syncCfg.s3;
        if (old.accessKey) {
            syncCfg.s3.accessKeyEnc = await encryptSecret(old.accessKey);
            delete old.accessKey;
            migrated = true;
        }
        if (old.secretKey) {
            syncCfg.s3.secretKeyEnc = await encryptSecret(old.secretKey);
            delete old.secretKey;
            migrated = true;
        }
    }

    if (syncCfg.webdav && syncCfg.webdav.pass) {
        syncCfg.webdav.passEnc = await encryptSecret(syncCfg.webdav.pass);
        delete syncCfg.webdav.pass;
        migrated = true;
    }

    if (migrated) {
        persistSettings();
        console.log('已自动迁移旧版明文凭据到加密存储');
    }
}

/* ==================== 窗口创建 ==================== */
function buildWindowOptions(initialBounds: any, sunIcon: Electron.NativeImage | null): Electron.BrowserWindowConstructorOptions {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
        width: initialBounds ? initialBounds.width : 880,
        height: initialBounds ? initialBounds.height : 560,
        frame: false,
        backgroundColor: '#0d0d1a',
        resizable: true,
        minWidth: 600,
        minHeight: 400,
        alwaysOnTop: false,
        skipTaskbar: false,
        show: false,
        icon: sunIcon || undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    };
    if (initialBounds && initialBounds.x !== undefined && initialBounds.y !== undefined) {
        windowOptions.x = initialBounds.x;
        windowOptions.y = initialBounds.y;
    }
    return windowOptions;
}

function attachSecurityHandlers(win: BrowserWindow): void {
    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                shell.openExternal(url);
            }
        } catch (e: any) { console.warn('打开外部链接失败:', e.message); }
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (!url || !url.startsWith('file://')) {
            e.preventDefault();
            return;
        }
        try {
            const target = path.resolve(new URL(url).pathname);
            // H7 修复：白名单需同时包含 dist/（主进程）和 dist-renderer/（渲染层），两者为兄弟目录
            const rendererDir = path.join(__dirname, '..', 'dist-renderer');
            const allowedRoots = [__dirname, rendererDir];
            const isAllowed = allowedRoots.some(root =>
                target === root || target.startsWith(root + path.sep)
            );
            if (!isAllowed) {
                e.preventDefault();
            }
        } catch (_) {
            e.preventDefault();
        }
    });
    win.webContents.on('will-attach-webview', (e, webPreferences) => {
        webPreferences.preload = path.join(__dirname, 'preload.js');
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
    });
    win.webContents.on('before-input-event', (event, input) => {
        // 软件锁定状态下彻底禁用 DevTools 快捷键（F12 / Ctrl+Shift+I / Cmd+Option+I）与刷新
        if (sharedState.isAppLocked) {
            const isF12 = input.key === 'F12';
            const isDevToolsCombo = (input.control || input.meta) && input.shift && (input.key.toLowerCase() === 'i');
            const isReloadCombo = input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
            if (isF12 || isDevToolsCombo || isReloadCombo) {
                event.preventDefault();
            }
        }
    });
}

function bindWindowBoundsEvents(win: BrowserWindow): void {
    let windowBoundsDebounceTimer: NodeJS.Timeout | null = null;
    const persistWindowBounds = () => {
        if (!win || win.isDestroyed()) return;
        if (win.isMaximized()) return;
        try {
            const bounds = win.getBounds();
            const s = loadSettings();
            s.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
            persistSettings();
        } catch (e: any) { console.warn('持久化窗口位置失败:', e.message); }
    };
    win.on('resize', () => {
        if (windowBoundsDebounceTimer) clearTimeout(windowBoundsDebounceTimer);
        windowBoundsDebounceTimer = setTimeout(persistWindowBounds, 500);
    });
    win.on('move', () => {
        if (windowBoundsDebounceTimer) clearTimeout(windowBoundsDebounceTimer);
        windowBoundsDebounceTimer = setTimeout(persistWindowBounds, 500);
    });
    win.on('close', () => {
        if (windowBoundsDebounceTimer) clearTimeout(windowBoundsDebounceTimer);
        persistWindowBounds();
    });
}

function validateWindowBounds(bounds: any): any {
    if (!bounds || typeof bounds !== 'object') return null;
    const w = parseInt(bounds.width, 10);
    const h = parseInt(bounds.height, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 600 || h < 400) return null;
    const x = parseInt(bounds.x, 10);
    const y = parseInt(bounds.y, 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { width: w, height: h };
    }
    try {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const displays = screen.getAllDisplays();
        const visible = displays.some(d => {
            return cx >= d.bounds.x && cx <= d.bounds.x + d.bounds.width
                && cy >= d.bounds.y && cy <= d.bounds.y + d.bounds.height;
        });
        if (!visible) {
            const primary = screen.getPrimaryDisplay();
            return {
                x: primary.bounds.x + 80,
                y: primary.bounds.y + 80,
                width: w, height: h
            };
        }
    } catch (e: any) { console.warn('校验窗口位置失败:', e.message); }
    return { x, y, width: w, height: h };
}

function createWindow(): void {
    const sunIcon = createSunIcon(256);
    const savedSettings = loadSettings();
    const savedBounds = savedSettings.windowBounds || null;
    const initialBounds = validateWindowBounds(savedBounds);

    const windowOptions = buildWindowOptions(initialBounds, sunIcon);
    mainWindow = new BrowserWindow(windowOptions);

    try {
        if (typeof (mainWindow as any).setBackgroundMaterial === 'function') {
            (mainWindow as any).setBackgroundMaterial('mica');
        }
    } catch (e: any) { console.warn('设置窗口背景失败:', e.message); }

    attachSecurityHandlers(mainWindow);
    mainWindow.loadFile('dist-renderer/index.html');

    const startHidden = process.argv.includes('--hidden');
    let windowShown = false;
    const showWindow = () => {
        if (windowShown || startHidden) return;
        // P0 修复：窗口可能在 5s 兜底定时器触发前被关闭（mainWindow=null），
        // 直接 mainWindow!.show() 会抛 TypeError 落进 uncaughtException 钩子导致 app.exit(1)
        if (!mainWindow || mainWindow.isDestroyed()) return;
        windowShown = true;
        mainWindow.show();
    };
    mainWindow.once('ready-to-show', showWindow);
    const showFallbackTimer = setTimeout(showWindow, 5000);
    mainWindow.on('closed', () => {
        clearTimeout(showFallbackTimer);
        mainWindow = null;
    });

    try {
        const taskbarIcon = createSunIcon(32);
        if (taskbarIcon && !taskbarIcon.isEmpty() && typeof mainWindow.setOverlayIcon === 'function') {
            mainWindow.setOverlayIcon(taskbarIcon, '便签');
        }
    } catch (e: any) { console.warn('设置任务栏图标失败:', e.message); }

    mainWindow.on('focus', () => { quitRetryCount = 0; });
    bindWindowBoundsEvents(mainWindow);
}

/* ==================== 便签独立悬浮小窗口 ==================== */
export function openPopoutWindow(data: any): any {
    return openPopoutWindowCommon({
        data,
        map: popoutWindows,
        width: 320,
        height: 360,
        minWidth: 220,
        minHeight: 200,
        buildHtml: buildPopoutHtml,
        closedChannel: 'popout-note:closed'
    });
}

export function openTodoPopoutWindow(data: any): any {
    return openPopoutWindowCommon({
        data,
        map: todoPopoutWindows,
        width: 340,
        height: 420,
        minWidth: 240,
        minHeight: 240,
        buildHtml: buildTodoPopoutHtml,
        closedChannel: 'popout-todo:closed'
    });
}

function openPopoutWindowCommon(opts: any): any {
    const { data, map, width, height, minWidth, minHeight, buildHtml, closedChannel } = opts;
    if (!data || !data.noteId) return { success: false, message: '缺少 noteId' };
    const noteId = String(data.noteId);
    const existing = map.get(noteId);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        existing.show();
        return { success: true, alreadyOpen: true };
    }
    const parent = mainWindow;
    const win = new BrowserWindow({
        width,
        height,
        minWidth,
        minHeight,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        resizable: true,
        maximizable: false,
        backgroundColor: '#FAFAFA',
        transparent: true,
        hasShadow: true,
        parent: parent || undefined,
        webPreferences: {
            preload: path.join(__dirname, 'popout-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    const htmlString = buildHtml(data);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlString));
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => { return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e) => {
        e.preventDefault();
    });
    win.once('ready-to-show', () => {
        win.show();
    });
    win.on('closed', () => {
        map.delete(noteId);
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(closedChannel, { noteId });
            }
        } catch (e: any) { console.warn('通知主窗口关闭失败:', e.message); }
    });
    map.set(noteId, win);
    return { success: true };
}

export function togglePopoutPin(noteId: string, type: string): any {
    const map = type === 'todo' ? todoPopoutWindows : popoutWindows;
    const win = map.get(String(noteId));
    if (!win || win.isDestroyed()) return { success: false, pinned: false };
    const cur = win.isAlwaysOnTop();
    const next = !cur;
    win.setAlwaysOnTop(next, next ? 'screen-saver' : 'normal');
    try {
        win.webContents.send('popout-pin-changed', { pinned: next });
    } catch (e: any) { console.warn('通知置顶状态失败:', e.message); }
    return { success: true, pinned: next };
}

/* ==================== 构建待办事项小窗口的 HTML ==================== */
function buildTodoPopoutHtml(data: any): string {
    const title = escapeHtmlFull(data.title || '待办事项');
    const todosJson = JSON.stringify(data.todos || []).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title>
<style>
${getPopoutCommonCss()}
body{
    background:rgba(250,250,252,0.82);
    backdrop-filter:blur(20px) saturate(160%);
    -webkit-backdrop-filter:blur(20px) saturate(160%);
    border-radius:10px;
    border:1px solid rgba(255,255,255,0.4);
    box-shadow:0 8px 32px rgba(0,0,0,0.18);
    display:flex;flex-direction:column;
    -webkit-app-region:no-drag;
}
.titlebar{
    height:32px;flex-shrink:0;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 10px;
    background:rgba(255,255,255,0.4);
    border-bottom:1px solid rgba(0,0,0,0.06);
    border-radius:10px 10px 0 0;
    -webkit-app-region:drag;
    cursor:move;
}
.todo-list-wrap{flex:1;overflow-y:auto;padding:8px 10px;min-height:0}
.todo-list-wrap::-webkit-scrollbar{width:5px}
.todo-list-wrap::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.18);border-radius:3px}
.todo-item{
    display:flex;align-items:center;gap:8px;
    padding:6px 8px;border-radius:6px;
    font-size:13px;color:#1A1A1A;
    transition:background 0.15s;
}
.todo-item:hover{background:rgba(0,0,0,0.05)}
.todo-check{
    width:16px;height:16px;border-radius:50%;
    border:1.5px solid #BBB;background:transparent;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;flex-shrink:0;color:#fff;font-size:10px;
    transition:all 0.18s;
}
.todo-check.checked{background:linear-gradient(135deg,#7fb3b3,#6ba3c9);border-color:transparent}
.todo-text{flex:1;word-break:break-word;user-select:text;-webkit-user-select:text}
.todo-text.done{text-decoration:line-through;color:#999}
.todo-del{
    width:18px;height:18px;border:none;background:transparent;
    color:#AAA;cursor:pointer;border-radius:3px;font-size:11px;
    display:flex;align-items:center;justify-content:center;
    opacity:0;transition:all 0.18s;
}
.todo-item:hover .todo-del{opacity:1}
.todo-del:hover{background:rgba(224,139,139,0.2);color:#E08B8B}

.todo-empty{padding:20px;text-align:center;color:#999;font-size:12px}
.todo-input-bar{
    flex-shrink:0;display:flex;gap:6px;padding:8px 10px;
    background:rgba(255,255,255,0.4);
    border-top:1px solid rgba(0,0,0,0.06);
    border-radius:0 0 10px 10px;
}
.todo-input-bar input{
    flex:1;border:1px solid rgba(0,0,0,0.1);border-radius:6px;
    padding:5px 10px;font-size:13px;background:rgba(255,255,255,0.6);
    color:#1A1A1A;outline:none;font-family:inherit;
}
.todo-input-bar input:focus{border-color:#7fb3b3;box-shadow:0 0 0 2px rgba(127,179,179,0.15)}
.todo-input-bar button{
    width:28px;height:28px;border:none;border-radius:6px;
    background:linear-gradient(135deg,#7fb3b3,#6ba3c9);
    color:#fff;cursor:pointer;font-size:16px;font-weight:600;
    display:flex;align-items:center;justify-content:center;
    transition:transform 0.15s;
}
.todo-input-bar button:hover{transform:scale(1.08)}
.todo-count-bar{
    flex-shrink:0;height:18px;padding:0 10px;
    display:flex;align-items:center;justify-content:space-between;
    background:rgba(255,255,255,0.3);
    font-size:10px;color:#888;
    user-select:none;-webkit-user-select:none;
}
.todo-saved{color:#34C759;font-weight:600;opacity:0;transition:opacity 0.3s}
.todo-saved.show{opacity:1}
</style></head>
<body>
<div class="titlebar">
    <div class="titlebar-title" title="${title}">✅ ${title}</div>
    <div class="titlebar-actions">
        <button class="tb-btn pin active" id="pinBtn" title="已置顶（点击取消置顶）"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V8a3.5 3.5 0 0 0-7 0v6L5 17z"/></svg></button>
        <button class="tb-btn close" id="closeBtn" title="关闭并同步回主窗口"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
</div>
<div class="todo-list-wrap" id="todoListWrap"></div>
<div class="todo-input-bar">
    <input type="text" id="todoInput" placeholder="添加待办...">
    <button id="todoAddBtn" title="添加">+</button>
</div>
<div class="todo-count-bar">
    <span id="todoCountText">共 0 项</span>
    <span class="todo-saved" id="savedTip">✓ 已同步</span>
</div>
<script>
// 日志劫持：批量上报 popout 窗口日志（source='popout-todo'），复用 overlay-logger.js 共享模块
${getOverlayLoggerScript()}
setupOverlayLogging({
    source: 'popout-todo',
    reportApi: function(batch) { return window.popout.reportLogs(batch); },
    errorPrefix: 'popout未捕获异常:'
});
// 安全模式：通过 preload 暴露的 window.popout API 与主进程通信
const noteId = ${JSON.stringify(String(data.noteId))};
let todos = ${todosJson};
let syncTimer = null;
const listWrap = document.getElementById('todoListWrap');
const inputEl = document.getElementById('todoInput');
const addBtn = document.getElementById('todoAddBtn');
const countText = document.getElementById('todoCountText');
const savedTip = document.getElementById('savedTip');
const closeBtn = document.getElementById('closeBtn');
const pinBtn = document.getElementById('pinBtn');

function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// 生成唯一 ID：Date.now()*1000 + 单调递增计数器，消除同毫秒碰撞
// 必须定义在内联 script 内（popout 窗口渲染进程上下文），不能引用主进程的函数
// L1 修复：单调递增计数器替代随机数，消除同毫秒内 1/1000 碰撞概率
let _genIdCounter = 0;
function genId() { _genIdCounter = (_genIdCounter + 1) % 1000; return Date.now() * 1000 + _genIdCounter; }

function render(){
    if (!todos || todos.length === 0){
        listWrap.innerHTML = '<div class="todo-empty">暂无待办事项</div>';
    } else {
        // 排序：未完成在前，已完成在后
        const sorted = todos.slice().sort((a, b) => {
            const aDone = !!a.done, bDone = !!b.done;
            if (aDone !== bDone) return aDone ? 1 : -1;
            return 0;
        });
        let html = '';
        sorted.forEach(t => {
            html += '<div class="todo-item" data-id="'+t.id+'">'
                + '<div class="todo-check'+(t.done?' checked':'')+'" data-act="toggle">'+(t.done?'✓':'')+'</div>'
                + '<span class="todo-text'+(t.done?' done':'')+'">'
                    + escapeHtml(t.text)
                + '</span>'
                + '<button class="todo-del" data-act="del" title="删除">✕</button>'
                + '</div>';
        });
        listWrap.innerHTML = html;
    }
    const doneCount = todos.filter(t => t.done).length;
    countText.textContent = '共 ' + todos.length + ' 项 · 已完成 ' + doneCount;
}

function showSaved(){
    savedTip.classList.add('show');
    setTimeout(() => savedTip.classList.remove('show'), 1200);
}

function syncToMain(){
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        window.popout.sendTodoInput({ noteId, todos: todos });
        showSaved();
    }, 250);
}

// 列表点击委托
listWrap.addEventListener('click', (e) => {
    const item = e.target.closest('.todo-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.dataset.act === 'toggle'){
        const t = todos.find(x => String(x.id) === String(id));
        if (t){
            t.done = !t.done;
            render(); syncToMain();
        }
    } else if (e.target.dataset.act === 'del'){
        todos = todos.filter(x => String(x.id) !== String(id));
        render(); syncToMain();
    }
});

// 添加待办
function addTodo(){
    const text = inputEl.value.trim();
    if (!text) return;
    todos.push({ id: genId(), text, done: false, createdAt: Date.now(), updatedAt: Date.now() });
    inputEl.value = '';
    render(); syncToMain();
}
addBtn.addEventListener('click', addTodo);
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); addTodo(); }
});

// 关闭按钮
closeBtn.addEventListener('click', () => {
    window.popout.sendTodoInput({ noteId, todos: todos });
    window.popout.close();
});

// 置顶切换按钮
pinBtn.addEventListener('click', async () => {
    try {
        const r = await window.popout.togglePin({ noteId, type: 'todo' });
        if (r && r.success){
            pinBtn.classList.toggle('active', r.pinned);
            pinBtn.title = r.pinned ? '已置顶（点击取消置顶）' : '未置顶（点击置顶）';
        }
    } catch (e) { console.warn('切换置顶失败:', e.message); }
});

// 监听主进程推送的待办更新（主窗口改 → 推给小窗口）
window.popout.onTodoPush((data) => {
    if (data && data.todos){
        todos = data.todos;
        render();
    }
});

// 监听置顶状态变化（外部触发）
window.popout.onPinChanged((data) => {
    if (data && data.pinned !== undefined){
        pinBtn.classList.toggle('active', data.pinned);
        pinBtn.title = data.pinned ? '已置顶（点击取消置顶）' : '未置顶（点击置顶）';
    }
});

// 双击标题栏 = 关闭
document.querySelector('.titlebar').addEventListener('dblclick', () => {
    window.popout.sendTodoInput({ noteId, todos: todos });
    window.popout.close();
});

render();
</script>
</body></html>`;
}

/* ==================== 托盘创建 ==================== */
function createTray(): void {
    try {
        const icon = createSunIcon(32);
        tray = new Tray(icon);
        const ctxMenu = Menu.buildFromTemplate([
            {
                label: '显示便签',
                click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } },
            },
            { type: 'separator' },
            {
                label: '退出',
                click: () => { app.quit(); },
            },
        ]);
        tray.setToolTip('便签');
        tray.setContextMenu(ctxMenu);
        tray.on('double-click', () => {
            if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        });
    } catch (err: any) { console.error('托盘创建失败:', err.message); }
}

/* ==================== 同步凭据加解密 ==================== */
export async function encryptSecret(plain: string, label?: string): Promise<string | null> {
    label = label || '凭据';
    if (!plain) return null;
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(plain).toString('base64');
    }
    throw new Error('系统加密服务不可用，' + label + '无法安全保存。请登录系统账户或使用支持加密的环境。');
}

export async function decryptSecret(encrypted: string, label?: string): Promise<string> {
    label = label || '凭据';
    if (!encrypted) return '';
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('系统加密服务不可用，无法解密' + label + '。请登录系统账户后重启软件，或重新输入' + label + '。');
    }
    try {
        return await safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (e: any) {
        console.error(label + '解密失败：', e && e.message ? e.message : '未知错误');
        throw new Error(label + '解密失败：' + (e && e.message ? e.message : '未知错误') + '。请重新配置' + label + '。');
    }
}

// 掩码前缀：U+200B 零宽空格 + 4 个 ••••
// 零宽空格在真实凭据（base64/hex/API Key）中几乎不可能出现，
// 因此前缀匹配比"后缀是否可打印 ASCII"的启发式可靠得多，不会误判。
// 修复：此前仅用 '••••' 前缀 + ASCII 启发式，导致：
//   1) ≤4 字符凭据的掩码恰好是 '••••'，isMaskedCred 判定为 false，掩码被当新凭据加密覆盖原密码；
//   2) 含中文/emoji 的凭据，掩码后缀非 ASCII，同样被判 false 覆盖原密码。
const MASK_PREFIX = '\u200B••••';
const LEGACY_MASK_PREFIX = '••••';

export function maskCred(cred: string): string {
    if (!cred) return '';
    if (cred.length <= 4) return MASK_PREFIX;
    return MASK_PREFIX + cred.slice(-4);
}

export function isMaskedCred(value: string): boolean {
    if (typeof value !== 'string') return false;
    // 新格式：U+200B 前缀（唯一可靠，真实凭据不可能以零宽空格开头）
    if (value.startsWith(MASK_PREFIX)) return true;
    // 旧格式兼容（迁移期）：'••••' 开头的掩码。
    // '••••' 恰好 4 字符（≤4 字符凭据的旧掩码）也认；
    // 更长的保持旧启发式（后缀须为纯可打印 ASCII），避免误判真实凭据。
    if (value.startsWith(LEGACY_MASK_PREFIX)) {
        if (value.length === LEGACY_MASK_PREFIX.length) return true;
        if (value.length > LEGACY_MASK_PREFIX.length) {
            return /^[\x20-\x7E]+$/.test(value.slice(LEGACY_MASK_PREFIX.length));
        }
    }
    return false;
}

/* ==================== 通用工具函数 ==================== */
function buildS3Config(config: any): any {
    const endpoint = trimTrailingSlash(config.endpoint);
    const s3Config: any = {
        region: config.region || 'auto',
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    };
    if (endpoint) s3Config.endpoint = endpoint;
    return s3Config;
}

function getS3Client(config: any): any {
    const { S3Client } = getAwsS3();
    return new S3Client(buildS3Config(config));
}

async function fetchWithErrorWrap(url: string, options?: any): Promise<Response> {
    try {
        return await fetch(url, options);
    } catch (e: any) {
        const cause = (e.cause && e.cause.code) ? ('（' + e.cause.code + '）') : '';
        throw new Error('网络请求失败：' + (e.message || '无法连接到服务器') + cause);
    }
}

// 备份时额外包含的子目录（相对 userData）：便签历史快照、聊天图片
// 自动同步（定时触发）排除 chat-images 大目录，仅手动同步携带全量
const BACKUP_SUBDIRS = ['note_history', 'chat-images'];

async function getBackupFiles(excludeChatImages = false): Promise<any[]> {
    const dir = app.getPath('userData');
    const result: any[] = [];
    // 顶层 *.json
    try {
        const entries = await fs.promises.readdir(dir);
        const candidates = entries
            .filter(name => name.endsWith('.json'))
            .filter(name => !name.endsWith('.tmp'))
            .filter(name => !name.includes('.corrupt-'))
            .map(name => ({ name, path: path.join(dir, name) }));
        for (const f of candidates) {
            try {
                const stat = await fs.promises.stat(f.path);
                if (stat.isFile()) result.push(f);
            } catch (e: any) { console.warn('获取文件信息失败:', e.message); }
        }
    } catch (e: any) {
        console.error('扫描备份目录失败:', e.message);
    }
    // 白名单子目录（递归，保留相对路径作为 zip entry 名）
    for (const sub of BACKUP_SUBDIRS) {
        if (excludeChatImages && sub === 'chat-images') continue;
        const subDir = path.join(dir, sub);
        if (!fs.existsSync(subDir)) continue;
        try {
            await collectDirFiles(subDir, sub, result, 20000);
        } catch (e: any) {
            console.warn('扫描子目录失败 ' + sub + ':', e.message);
        }
    }
    return result;
}

async function collectDirFiles(absDir: string, relPrefix: string, out: any[], maxEntries: number): Promise<void> {
    let entries: string[];
    try {
        entries = await fs.promises.readdir(absDir);
    } catch (_) { return; }
    for (const name of entries) {
        if (out.length >= maxEntries) {
            console.warn('备份文件数量达到上限 ' + maxEntries + '，停止收集');
            return;
        }
        const abs = path.join(absDir, name);
        const rel = relPrefix + '/' + name;
        let stat: any;
        try { stat = await fs.promises.stat(abs); } catch (_) { continue; }
        if (stat.isDirectory()) {
            await collectDirFiles(abs, rel, out, maxEntries);
        } else if (stat.isFile()) {
            out.push({ name: rel, path: abs });
        }
    }
}

async function createBackupZip(excludeChatImages = false): Promise<Buffer> {
    const AdmZip = getAdmZip();
    const zip = new AdmZip();
    const files = await getBackupFiles(excludeChatImages);
    if (files.length === 0) throw new Error('没有可备份的数据文件');
    const MAX_SINGLE_FILE = 50 * 1024 * 1024; // 单文件 50MB 上限
    // P3 修复：备份累计总上限 200MB，超限即中断（避免数据膨胀后全量读入内存导致峰值爆炸）
    let totalBytes = 0;
    let packedCount = 0;
    for (const f of files) {
        try {
            const stat = await fs.promises.stat(f.path);
            if (stat.size > MAX_SINGLE_FILE) {
                console.warn('跳过超大文件 ' + f.name + '（' + (stat.size/1024/1024).toFixed(1) + 'MB > 50MB 单文件上限）');
                continue;
            }
            if (totalBytes + stat.size > MAX_BACKUP_SIZE) {
                console.warn('备份总大小达到上限 ' + (MAX_BACKUP_SIZE/1024/1024) + 'MB，停止收集');
                break;
            }
            const content = await fs.promises.readFile(f.path);
            zip.addFile(f.name, content);
            totalBytes += stat.size;
            packedCount++;
        } catch (e: any) {
            console.warn('跳过文件 ' + f.name + ':', e.message);
        }
    }
    const meta = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        fileCount: packedCount,  // 修复：此前用候选总数，跳过超大/超限文件后与实际不符
        appVersion: app.getVersion()
    };
    zip.addFile('_backup_meta.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf8'));
    return zip.toBuffer();
}

function getBackupFileName(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return '便签备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.zip';
}

function normalizePathPrefix(prefix: string): string {
    if (!prefix) return '';
    let p = prefix.trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (!p.endsWith('/')) p = p + '/';
    return p;
}

function joinWebdavPath(baseUrl: string, pathPrefix: string, fileName?: string): string | null {
    let urlObj: URL;
    try {
        urlObj = new URL(baseUrl);
    } catch (e) {
        return null;
    }
    let urlPath = urlObj.pathname;
    if (!urlPath.endsWith('/')) urlPath += '/';
    let prefix = pathPrefix || '';
    if (prefix.startsWith('/')) prefix = prefix.slice(1);
    if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
    if (prefix) {
        const segs = prefix.split('/').map(s => s ? encodeURIComponent(s) : '');
        urlPath += segs.join('/') + '/';
    }
    if (fileName) urlPath += encodeURIComponent(fileName);
    try {
        const finalUrl = new URL(urlPath, urlObj.origin + '/');
        return finalUrl.pathname;
    } catch (e) {
        return urlPath;
    }
}

/* ==================== S3 上传/测试/列出/删除/下载 ==================== */
async function uploadToS3(config: any, zipBuffer: Buffer, fileName: string): Promise<{ success: boolean, location: string }> {
    const s3 = getS3Client(config);
    const { PutObjectCommand } = getAwsS3();
    const pathPrefix = normalizePathPrefix(config.path);
    const key = (pathPrefix + fileName).replace(/^\//, '');
    const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: zipBuffer,
        ContentType: 'application/zip'
    });
    await s3.send(command);
    return { success: true, location: `s3://${config.bucket}/${key}` };
}

async function testS3Connection(config: any): Promise<{ success: boolean, message: string }> {
    const s3 = getS3Client(config);
    const { HeadBucketCommand } = getAwsS3();
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true, message: '连接成功，存储桶可访问' };
}

async function listS3Backups(config: any): Promise<any[]> {
    const s3 = getS3Client(config);
    const { ListObjectsV2Command } = getAwsS3();
    const pathPrefix = normalizePathPrefix(config.path);
    const prefix = pathPrefix.replace(/^\//, '');
    const command = new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        MaxKeys: 1000
    });
    const data = await s3.send(command);
    const items: any[] = [];
    if (data.Contents) {
        for (const obj of data.Contents) {
            if (!obj.Key || !obj.Key.endsWith('.zip')) continue;
            const name = obj.Key.split('/').pop();
            items.push({
                name: name,
                key: obj.Key,
                size: obj.Size || 0,
                lastModified: obj.LastModified ? obj.LastModified.toISOString() : ''
            });
        }
    }
    items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
    return items;
}

async function deleteS3Backup(config: any, key: string): Promise<{ success: boolean }> {
    const s3 = getS3Client(config);
    const { DeleteObjectCommand } = getAwsS3();
    const pathPrefix = normalizePathPrefix(config.path).replace(/^\//, '');
    if (pathPrefix && !key.startsWith(pathPrefix)) {
        throw new Error('文件路径不在备份目录内，拒绝删除');
    }
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    return { success: true };
}

async function downloadS3Backup(config: any, key: string): Promise<Buffer> {
    const s3 = getS3Client(config);
    const { GetObjectCommand } = getAwsS3();
    const pathPrefix = normalizePathPrefix(config.path).replace(/^\//, '');
    if (pathPrefix && !key.startsWith(pathPrefix)) {
        throw new Error('文件路径不在备份目录内，拒绝下载');
    }
    const data = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const contentLength = parseInt(data.ContentLength || '0', 10);
    if (contentLength > MAX_BACKUP_SIZE) {
        try { data.Body.destroy(); } catch (e: any) { console.warn('关闭S3响应流失败:', e.message); }
        throw new Error(`备份文件过大（${(contentLength/1024/1024).toFixed(1)}MB），超过 200MB 上限`);
    }
    const chunks: Buffer[] = [];
    let totalSize = 0;
    try {
        for await (const chunk of data.Body) {
            const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            totalSize += buf.length;
            if (totalSize > MAX_BACKUP_SIZE) {
                throw new Error('下载过程中超过 200MB 上限，已中断');
            }
            chunks.push(buf);
        }
    } catch (e) {
        try { data.Body.destroy(); } catch (err: any) { console.warn('关闭S3响应流失败:', err.message); }
        throw e;
    }
    return Buffer.concat(chunks);
}

/* ==================== WebDAV 上传/测试/列出/删除/下载 ==================== */
function uploadToWebdav(config: any, zipBuffer: Buffer, fileName: string): Promise<{ success: boolean, location: string }> {
    const baseUrl = trimTrailingSlash(config.url);
    const pathPrefix = normalizePathPrefix(config.path);
    const dirPath = joinWebdavPath(baseUrl, pathPrefix);
    const filePath = joinWebdavPath(baseUrl, pathPrefix, fileName);
    if (!dirPath || !filePath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }
    // P1 修复 C2：不再手动计算 auth，webdavRequest 自动从 config.user/config.pass 注入
    let mkcolError: string | null = null;
    const mkcolPromise = pathPrefix
        ? webdavRequest(config as any, 'MKCOL', dirPath, { timeoutMs: 15000 } as any)
            .then((r: any) => {
                if (r.statusCode === 201 || r.statusCode === 405 || (r.statusCode >= 200 && r.statusCode < 300)) {
                    return;
                }
                const bodyStr = r.body.toString();
                mkcolError = `MKCOL 返回 ${r.statusCode}${bodyStr ? ': ' + bodyStr.slice(0, 200) : ''}`;
                console.warn('[WebDAV] ' + mkcolError + '，继续尝试 PUT 上传');
            })
            .catch((e: any) => {
                mkcolError = 'MKCOL 创建目录失败: ' + e.message;
                console.warn('[WebDAV] ' + mkcolError);
            })
        : Promise.resolve();
    return mkcolPromise.then(() => {
        return webdavRequest(config as any, 'PUT', filePath, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Length': zipBuffer.length
            },
            body: zipBuffer,
            timeoutMs: 30000
        } as any);
    }).then((r: any) => {
        if (r.statusCode >= 200 && r.statusCode < 300) {
            return { success: true, location: baseUrl + filePath };
        }
        const bodyStr = r.body.toString();
        const detail = mkcolError ? `（前置 MKCOL 阶段：${mkcolError}）` : '';
        throw new Error(`HTTP ${r.statusCode}: ${bodyStr || r.statusMessage}${detail}`);
    });
}

function testWebdavConnection(config: any): Promise<{ success: boolean, message: string }> {
    const baseUrl = trimTrailingSlash(config.url);
    const pathPrefix = normalizePathPrefix(config.path);
    const fullPath = joinWebdavPath(baseUrl, pathPrefix);
    if (!fullPath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }
    const body = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop/></propfind>';
    // P1 修复 C2：不再手动计算 auth，webdavRequest 自动从 config.user/config.pass 注入
    return webdavRequest(config as any, 'PROPFIND', fullPath, {
        headers: {
            'Depth': '1',
            'Content-Type': 'application/xml; charset=utf-8'
        },
        body: body,
        timeoutMs: 15000
    } as any).then((res: any) => {
        const sc = res.statusCode;
        if (sc === 207 || (sc >= 200 && sc < 300)) {
            return { success: true, message: '连接成功，WebDAV 服务可用' };
        } else if (sc === 401 || sc === 403) {
            throw new Error('认证失败（用户名或密码错误）');
        } else if (sc === 404) {
            return {
                success: true,
                message: '收到 404 响应：服务可达，但目标目录不存在或 URL 路径错误。上传时会尝试自动创建目录。'
            };
        } else {
            throw new Error(`HTTP ${sc}: ${res.statusMessage || res.body.toString()}`);
        }
    });
}

function listWebdavBackups(config: any): Promise<any[]> {
    const baseUrl = trimTrailingSlash(config.url);
    const pathPrefix = normalizePathPrefix(config.path);
    const fullPath = joinWebdavPath(baseUrl, pathPrefix);
    if (!fullPath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }
    const body = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getlastmodified/></prop></propfind>';
    // P1 修复 C2：不再手动计算 auth
    return webdavRequest(config as any, 'PROPFIND', fullPath, {
        headers: {
            'Depth': '1',
            'Content-Type': 'application/xml; charset=utf-8'
        },
        body: body,
        timeoutMs: 15000
    } as any).then((res: any) => {
        const sc = res.statusCode;
        const bodyStr = res.body.toString();
        if (sc !== 207 && !(sc >= 200 && sc < 300)) {
            throw new Error('列出备份失败：HTTP ' + sc + (bodyStr ? ': ' + bodyStr.slice(0, 200) : ''));
        }
        return parseWebdavPropfindXml(bodyStr);
    });
}

function deleteWebdavBackup(config: any, href: string): Promise<{ success: boolean }> {
    // P1 修复 C2：不再手动计算 auth
    return webdavRequest(config as any, 'DELETE', href, {
        timeoutMs: 15000
    } as any).then((res: any) => {
        if (res.statusCode === 204 || res.statusCode === 200 || (res.statusCode >= 200 && res.statusCode < 300)) {
            return { success: true };
        } else if (res.statusCode === 404) {
            return { success: true };
        } else {
            const bodyStr = res.body.toString();
            throw new Error('删除失败：HTTP ' + res.statusCode + (bodyStr ? ': ' + bodyStr.slice(0, 200) : ''));
        }
    });
}

function downloadWebdavBackup(config: any, href: string): Promise<Buffer> {
    // P1 修复 C2：不再手动计算 auth
    return webdavRequest(config as any, 'GET', href, {
        timeoutMs: 60000,
        maxSize: MAX_BACKUP_SIZE
    } as any).then((res: any) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            return res.body;
        }
        throw new Error('下载失败：HTTP ' + res.statusCode);
    });
}

/* ==================== Provider 注册表 ==================== */
export const providers: any = {
    s3: {
        label: 'S3',
        requiredFields: ['endpoint', 'region', 'bucket', 'accessKey', 'secretKey'],
        getConfig: async (syncConfig: any) => {
            const raw = syncConfig.s3 || {};
            const accessKey = (await decryptSecret(raw.accessKeyEnc)) || raw.accessKey || '';
            const secretKey = (await decryptSecret(raw.secretKeyEnc)) || raw.secretKey || '';
            return {
                endpoint: raw.endpoint || '',
                region: raw.region || '',
                bucket: raw.bucket || '',
                accessKey,
                secretKey,
                path: raw.path || ''
            };
        },
        test: (config: any) => testS3Connection(config),
        upload: (config: any, buf: Buffer, name: string) => uploadToS3(config, buf, name),
        listBackups: (config: any) => listS3Backups(config),
        deleteBackup: (config: any, id: string) => deleteS3Backup(config, id),
        downloadBackup: (config: any, id: string) => downloadS3Backup(config, id)
    },
    webdav: {
        label: 'WebDAV',
        requiredFields: ['url', 'user', 'pass'],
        getConfig: async (syncConfig: any) => {
            const raw = syncConfig.webdav || {};
            const pass = (await decryptSecret(raw.passEnc)) || raw.pass || '';
            return {
                url: raw.url || '',
                user: raw.user || '',
                pass,
                path: raw.path || '',
                allowSelfSigned: !!raw.allowSelfSigned,
                trustedCertFingerprint: raw.trustedCertFingerprint || ''
            };
        },
        test: (config: any) => testWebdavConnection(config),
        upload: (config: any, buf: Buffer, name: string) => uploadToWebdav(config, buf, name),
        listBackups: (config: any) => listWebdavBackups(config),
        deleteBackup: (config: any, id: string) => deleteWebdavBackup(config, id),
        downloadBackup: (config: any, id: string) => downloadWebdavBackup(config, id)
    }
};

export async function performSync(providerKey: string, isAutoSync = false): Promise<{ provider: string, fileName: string, size: number, location: string }> {
    if (isSyncing) throw new Error('正在同步中，请稍后再试');
    isSyncing = true;
    let targetConfig: any = null;
    try {
        const provider = providers[providerKey];
        if (!provider) throw new Error('未知的同步方式：' + providerKey);
        const s = loadSettings();
        const syncConfig = s.syncConfig || {};
        targetConfig = await provider.getConfig(syncConfig);
        if (!targetConfig) throw new Error('未配置同步信息');
        for (const k of provider.requiredFields) {
            if (!targetConfig[k]) throw new Error(`${provider.label} 配置不完整：缺少 ${k}`);
        }
        const zipBuffer = await createBackupZip(isAutoSync);
        const fileName = getBackupFileName();
        const result = await provider.upload(targetConfig, zipBuffer, fileName);
        return { provider: provider.label, fileName, size: zipBuffer.length, location: result.location };
    } finally {
        if (targetConfig) {
            // 释放敏感字段引用（JS 字符串不可变，内存中的副本只能依赖 GC，
            // 此前用 Buffer 随机覆盖属无效操作——覆盖的是副本，原字符串不受影响，已移除）
            const sensitiveKeys = ['pass', 'secretKey', 'accessKey', 'user'] as const;
            for (const key of sensitiveKeys) {
                targetConfig[key] = null;
            }
        }
        targetConfig = null;
        isSyncing = false;
    }
}

export function scheduleAutoSync(): void {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    const s = loadSettings();
    const syncConfig = s.syncConfig || {};
    if (!syncConfig.autoSync || !syncConfig.autoSyncProvider) return;
    // 纵深防御：即使旧配置里存了非法值，也 clamp 到 5-1440 分钟（防 setInterval 风暴）
    const rawMin = Number(syncConfig.autoSyncInterval);
    const intervalMin = Number.isFinite(rawMin) ? Math.min(1440, Math.max(5, Math.round(rawMin))) : 30;
    const intervalMs = intervalMin * 60 * 1000;
    autoSyncTimer = setInterval(async () => {
        try {
            const result = await performSync(syncConfig.autoSyncProvider, true);
            console.log('[自动同步] 成功:', result.fileName);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sync:auto-result', {
                    success: true,
                    message: `自动同步成功：${result.fileName}（${(result.size / 1024).toFixed(1)} KB）`
                });
            }
        } catch (e: any) {
            if (e.message.includes('正在同步中')) {
                console.log('[自动同步] 手动同步进行中，跳过本次自动触发');
                return;
            }
            console.error('[自动同步] 失败:', e.message);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sync:auto-result', {
                    success: false,
                    message: '自动同步失败：' + e.message
                });
            }
        }
    }, intervalMs);
}

/* ==================== 软件锁（PIN + scrypt 哈希） ==================== */
export const LOCK_MAX_ATTEMPTS = 5;
export const LOCK_COOLDOWN_MS = 30000;

// 内存中的失败计数（防 settings.json 删除绕过）
let inMemoryLockFailCount = 0;
let inMemoryLockCooldownUntil = 0;

export function loadLockState(): void {
    try {
        const s = loadSettings();
        // 取内存和文件中的较大值，防止删除 settings.json 重置
        sharedState.lockFailCount = Math.max(Number(s.lockFailCount) || 0, inMemoryLockFailCount);
        sharedState.lockCooldownUntil = Math.max(Number(s.lockCooldownUntil) || 0, inMemoryLockCooldownUntil);
        if (sharedState.lockCooldownUntil && Date.now() > sharedState.lockCooldownUntil) {
            sharedState.lockFailCount = 0;
            sharedState.lockCooldownUntil = 0;
            inMemoryLockFailCount = 0;
            inMemoryLockCooldownUntil = 0;
            delete s.lockFailCount;
            delete s.lockCooldownUntil;
            persistSettings();
        }
    } catch (e: any) { console.warn('读取锁定状态失败:', e.message); }
}

export function persistLockState(): void {
    try {
        const s = loadSettings();
        if (sharedState.lockFailCount > 0) {
            s.lockFailCount = sharedState.lockFailCount;
            inMemoryLockFailCount = sharedState.lockFailCount;
        } else {
            delete s.lockFailCount;
            inMemoryLockFailCount = 0;
        }
        if (sharedState.lockCooldownUntil > Date.now()) {
            s.lockCooldownUntil = sharedState.lockCooldownUntil;
            inMemoryLockCooldownUntil = sharedState.lockCooldownUntil;
        } else {
            delete s.lockCooldownUntil;
            inMemoryLockCooldownUntil = 0;
        }
        persistSettings();
    } catch (e: any) { console.warn('持久化锁定状态失败:', e.message); }
}

export async function hashPin(pin: string): Promise<{ hash: string, salt: string }> {
    const salt = crypto.randomBytes(16);
    const hash = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(pin, salt, 64, (err, key) => err ? reject(err) : resolve(key));
    });
    return {
        hash: hash.toString('base64'),
        salt: salt.toString('base64')
    };
}

export async function verifyPin(pin: string, savedHashBase64: string, savedSaltBase64: string): Promise<boolean> {
    try {
        const salt = Buffer.from(savedSaltBase64, 'base64');
        const expected = Buffer.from(savedHashBase64, 'base64');
        const actual = await new Promise<Buffer>((resolve, reject) => {
            crypto.scrypt(pin, salt, 64, (err, key) => err ? reject(err) : resolve(key));
        });
        if (actual.length !== expected.length) return false;
        return crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

/* ==================== 便签历史版本快照 ==================== */
export const HISTORY_MAX_PER_NOTE = 10;
export const HISTORY_MIN_INTERVAL_MS = 60 * 1000;
let HISTORY_DIR: string = '';

export const noteHistoryCache = new Map<string, any[]>();
const noteHistoryDirty = new Set<string>();

function ensureHistoryDir(): void {
    try {
        if (!HISTORY_DIR) HISTORY_DIR = path.join(app.getPath('userData'), 'note_history');
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    } catch (e: any) { console.warn('创建历史目录失败:', e.message); }
}

export function getHistoryFilePath(noteId: any): string {
    if (!/^\d+$/.test(String(noteId))) {
        throw new Error('非法的 noteId');
    }
    const fp = path.join(HISTORY_DIR, `note_${noteId}.json`);
    if (!fp.startsWith(HISTORY_DIR + path.sep)) {
        throw new Error('路径越界');
    }
    return fp;
}

export function readNoteHistory(noteId: any): any[] {
    const key = String(noteId);
    if (noteHistoryCache.has(key)) {
        return noteHistoryCache.get(key)!;
    }
    try {
        ensureHistoryDir();
        const fp = getHistoryFilePath(noteId);
        if (!fs.existsSync(fp)) {
            noteHistoryCache.set(key, []);
            return [];
        }
        const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        const arr = Array.isArray(data) ? data : [];
        noteHistoryCache.set(key, arr);
        return arr;
    } catch (_) {
        noteHistoryCache.set(key, []);
        return [];
    }
}

export function writeNoteHistory(noteId: any, history: any[]): void {
    const key = String(noteId);
    noteHistoryCache.set(key, history);
    noteHistoryDirty.add(key);
    flushNoteHistoryAsync(noteId).catch((e: any) => {
        console.error('异步写入历史快照失败:', e.message);
    });
}

async function flushNoteHistoryAsync(noteId: any): Promise<void> {
    const key = String(noteId);
    if (!noteHistoryCache.has(key)) return;
    const history = noteHistoryCache.get(key)!;
    try {
        ensureHistoryDir();
        const fp = getHistoryFilePath(noteId);
        const ok = await saveJSON(fp, history);
        if (ok) noteHistoryDirty.delete(key);
    } catch (e: any) {
        console.error('写入历史快照失败:', e.message);
    }
}

function flushAllNoteHistorySync(): void {
    for (const noteId of noteHistoryDirty) {
        try {
            if (!noteHistoryCache.has(noteId)) continue;
            const history = noteHistoryCache.get(noteId)!;
            ensureHistoryDir();
            const fp = getHistoryFilePath(noteId);
            saveJSONSync(fp, history);
        } catch (e: any) {
            console.error('退出刷盘历史快照失败:', e.message);
        }
    }
    noteHistoryDirty.clear();
}

/* ==================== AI 辅助函数 ==================== */
export async function withDecryptedKey(keyResolver: () => Promise<string>, fn: (apiKey: string) => Promise<any>): Promise<any> {
    const key = await keyResolver();
    try {
        return await fn(key);
    } finally {
        /* key 出作用域自动 GC */
    }
}

export function extFromDataUrl(dataUrl: string): string {
    const m = /^data:image\/([a-zA-Z0-9+]+);/.exec(dataUrl || '');
    if (!m) return 'png';
    const t = m[1].toLowerCase();
    if (t === 'jpeg') return 'jpg';
    if (t === 'svg+xml') return 'png';
    return t;
}

// P3 修复：异步读取（fs.promises），避免 20MB 级图片同步读盘阻塞主进程事件循环
export async function readChatImageAsDataUrl(fileName: string): Promise<string | null> {
    if (!fileName) return null;
    const dir = getChatImagesDir();
    const filePath = path.normalize(path.join(dir, fileName));
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) return null;
    try {
        const stat = await fs.promises.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) return null;
        if (stat.size > MAX_IMAGE_SIZE) {
            console.warn('聊天图片过大（' + (stat.size/1024/1024).toFixed(1) + 'MB > 20MB 上限），拒绝读取:', fileName);
            return null;
        }
        const buffer = await fs.promises.readFile(filePath);
        const ext = path.extname(fileName).toLowerCase();
        const mime = IMAGE_MIME_MAP[ext] || 'image/png';
        return 'data:' + mime + ';base64,' + buffer.toString('base64');
    } catch (e: any) {
        console.warn('读取聊天图片失败:', e.message);
        return null;
    }
}

export function saveImageToDisk(dataUrl: string, cfg: any): void {
    try {
        let saveDir = (cfg && (cfg.imageSavePath || cfg.dashscopeSavePath)) || app.getPath('userData');
        // 纵深防御：校验为绝对路径且不在系统关键目录，防 cfg 来源变化后任意目录写入
        const SYSTEM_DIR_PREFIXES = [process.env.SystemRoot, process.env.WINDIR, process.env.ProgramFiles, process.env.ProgramFiles + ' (x86)', process.env.ProgramData, process.env.USERPROFILE + '\\Desktop'];
        try {
            saveDir = path.resolve(saveDir || '');
            const lowerDir = saveDir.toLowerCase();
            if (!path.isAbsolute(saveDir) ||
                SYSTEM_DIR_PREFIXES.some(p => p && lowerDir.startsWith(p.toLowerCase() + path.sep))) {
                console.warn('拒绝写入系统关键目录，回退到 userData:', saveDir);
                saveDir = app.getPath('userData');
            }
        } catch (_) {
            saveDir = app.getPath('userData');
        }
        if (!fs.existsSync(saveDir)) { fs.mkdirSync(saveDir, { recursive: true }); }
        const base64Data = dataUrl.replace(/^data:image\/[\w.+-]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        // 修复：按图片真实格式决定扩展名（此前固定 .png，JPEG 内容存成 .png 会损坏无法打开）
        const ext = sniffImageExt(buffer);
        // 修复：文件名加随机后缀，避免同毫秒多图互相覆盖
        const fileName = 'ai_image_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
        const filePath = path.join(saveDir, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log('图片已保存:', path.basename(filePath));
    } catch (err: any) {
        console.error('自动保存图片失败:', err.message);
    }
}

export async function fetchImageAsDataUrl(url: string, cfg: any): Promise<string> {
    // 安全下载：入口 URL 校验 + 重定向逐跳校验（safeFetch）+ 大小限制（防 OOM）
    const imgResp = await safeFetch(url, { signal: AbortSignal.timeout(30000) });
    if (!imgResp.ok) {
        throw new Error('图片下载失败 HTTP ' + imgResp.status + ': ' + imgResp.statusText);
    }
    const contentLength = parseInt(imgResp.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_SIZE) {
        throw new Error('图片过大（' + (contentLength / 1024 / 1024).toFixed(1) + 'MB），超过 20MB 上限');
    }
    // 流式读取并累计大小，超限即中止（不信任 Content-Length）
    const reader = imgResp.body ? imgResp.body.getReader() : null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_IMAGE_SIZE) {
                try { await reader.cancel(); } catch (_) {}
                throw new Error('图片下载超过 20MB 上限，已中止');
            }
            chunks.push(value);
        }
        try { await reader.cancel(); } catch (_) {}
    }
    const imgBuf = Buffer.concat(chunks.map(c => Buffer.from(c)));
    if (imgBuf.length > MAX_IMAGE_SIZE) {
        throw new Error('图片过大（' + (imgBuf.length / 1024 / 1024).toFixed(1) + 'MB），超过 20MB 上限');
    }
    // 修复：按 Content-Type + 魔数嗅探生成正确 MIME 的 dataURL，
    // 避免实际为 JPEG/WebP 的图片被硬编码为 image/png 导致后续复制失败
    const dataUrl = bufferToImageDataUrl(imgBuf, imgResp.headers.get('content-type') || '');
    saveImageToDisk(dataUrl, cfg);
    return dataUrl;
}

export async function dashscopeGenerate(baseUrl: string, apiKey: string, model: string, prompt: string, size: string, imageData: string, cfg: any): Promise<string> {
    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
    };
    const content: any[] = [{ text: prompt }];
    if (imageData) {
        content.push({ image: imageData });
    }
    const body: any = {
        model,
        input: {
            messages: [{ role: 'user', content }],
        },
        parameters: { n: 1 },
    };
    if (size && size !== 'auto' && size !== '默认') {
        body.parameters.size = size;
    }

    let requestUrl: string;
    try {
        const base = new URL(trimTrailingSlash(baseUrl));
        if (base.pathname.endsWith('/api/v1/services/aigc/multimodal-generation/generation')) {
            requestUrl = base.href;
        } else {
            requestUrl = base.origin + '/api/v1/services/aigc/multimodal-generation/generation';
        }
    } catch (e: any) {
        throw new Error('百炼 API 地址格式错误：' + e.message);
    }

    const resp = await fetchWithErrorWrap(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('百炼请求失败 HTTP ' + resp.status + ': ' + (errText || resp.statusText));
    }
    const data = await resp.json();

    if (data.code && data.code !== '') {
        throw new Error('百炼错误 [' + data.code + ']: ' + (data.message || '未知错误'));
    }

    const choices = data && data.output && data.output.choices;
    if (choices && choices.length > 0) {
        const msgContent = choices[0].message && choices[0].message.content;
        if (msgContent && msgContent.length > 0) {
            const imageItem = msgContent.find((c: any) => c.image);
            if (imageItem && imageItem.image) {
                if (!(await isSafeExternalUrlAsync(imageItem.image))) {
                    throw new Error('百炼返回的图片地址不安全（需 https 外网地址），已拒绝下载');
                }
                return await fetchImageAsDataUrl(imageItem.image, cfg);
            }
        }
    }

    const results = data && data.output && data.output.results;
    if (results && results.length > 0 && results[0].url) {
        if (!(await isSafeExternalUrlAsync(results[0].url))) {
            throw new Error('百炼返回的图片地址不安全（需 https 外网地址），已拒绝下载');
        }
        return await fetchImageAsDataUrl(results[0].url, cfg);
    }

    throw new Error('百炼未返回图片数据：' + JSON.stringify(data).slice(0, 500));
}

async function saveVideoToDisk(videoUrl: string, cfg: any): Promise<string> {
    if (!(await isSafeExternalUrlAsync(videoUrl))) {
        throw new Error('视频下载地址不安全（需 https 外网地址），已拒绝下载');
    }
    const saveDir = (cfg && (cfg.imageSavePath || cfg.dashscopeSavePath)) || app.getPath('userData');
    if (!fs.existsSync(saveDir)) { fs.mkdirSync(saveDir, { recursive: true }); }
    const fileName = 'ai_video_' + Date.now() + '.mp4';
    const filePath = path.join(saveDir, fileName);
    try {
        await streamDownloadToFile(videoUrl, filePath, { timeout: 120000 });
    } catch (err) {
        try { await fs.promises.unlink(filePath); } catch (e: any) { console.warn('删除临时文件失败:', e.message); }
        throw err;
    }
    console.log('视频已保存:', path.basename(filePath));
    return filePath;
}

function buildVideoRequestBody(model: string, prompt: string, size: string, imageData: string, duration: any, ratio: string, isI2v: boolean): any {
    let resolution = '720P';
    if (size && /^\d+[Pp]$/.test(size)) {
        resolution = size.toUpperCase();
    }
    let finalDuration = 5;
    if (duration && !isNaN(duration)) {
        const minDur = isI2v ? 2 : 3;
        finalDuration = Math.max(minDur, Math.min(15, parseInt(duration, 10)));
    }
    const body: any = { model, input: {}, parameters: { resolution, duration: finalDuration } };
    if (isI2v) {
        if (!imageData) {
            throw new Error('图生视频需要上传一张参考图片，请先点击"上传"按钮选择图片');
        }
        body.input.prompt = prompt || '';
        body.input.media = [{ type: 'first_frame', url: imageData }];
    } else {
        body.input.prompt = prompt;
        let finalRatio = '16:9';
        if (ratio && /^\d+:\d+$/.test(ratio)) {
            finalRatio = ratio;
        } else if (size && size.includes(':')) {
            finalRatio = size;
        }
        body.parameters.ratio = finalRatio;
    }
    return body;
}

async function createVideoTask(requestUrl: string, headers: any, body: any): Promise<string> {
    const createResp = await safeFetch(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    if (!createResp.ok) {
        throw new Error(await extractHttpError(createResp));
    }
    const createData = await createResp.json();
    if (createData.code && createData.code !== '') {
        throw new Error('百炼错误 [' + createData.code + ']: ' + (createData.message || '未知错误'));
    }
    const taskId = createData && createData.output && createData.output.task_id;
    if (!taskId) {
        throw new Error('百炼未返回任务ID：' + JSON.stringify(createData).slice(0, 500));
    }
    console.log('视频生成任务已创建，task_id:', taskId);
    return taskId;
}

async function pollVideoTask(queryUrl: string, queryHeaders: any, ac: AbortController): Promise<string> {
    const maxAttempts = 60;
    const intervalMs = 5000;
    // P0 修复：abort 监听只注册一次（此前每轮循环 addEventListener 且从不移除，任务成功也残留最多 60 个监听）
    const abortPromise = new Promise<never>((_, reject) => {
        ac.signal.addEventListener('abort', () => reject(new Error('用户已取消视频生成')), { once: true });
    });
    for (let i = 0; i < maxAttempts; i++) {
        if (ac.signal.aborted) throw new Error('用户已取消视频生成');
        await Promise.race([
            new Promise<void>(resolve => setTimeout(resolve, intervalMs)),
            abortPromise
        ]);
        if (ac.signal.aborted) throw new Error('用户已取消视频生成');

        let queryResp: Response | null = null;
        let lastErr: any = null;
        for (let retry = 0; retry < 3; retry++) {
            try {
                queryResp = await safeFetch(queryUrl, {
                    method: 'GET',
                    headers: queryHeaders,
                    signal: ac.signal,
                });
                if (queryResp.ok) break;
                lastErr = new Error(await extractHttpError(queryResp));
            } catch (e: any) {
                if (ac.signal.aborted) throw e;
                lastErr = e;
                if (retry < 2) await new Promise(r => setTimeout(r, 2000));
            }
        }
        if (!queryResp || !queryResp.ok) {
            throw lastErr || new Error('视频任务查询失败（重试 3 次后仍失败）');
        }

        const queryData = await queryResp.json();
        const status = queryData && queryData.output && queryData.output.task_status;
        console.log('视频生成任务状态 [' + (i + 1) + '/' + maxAttempts + ']:', status);

        if (status === 'SUCCEEDED') {
            const videoUrl = queryData.output.video_url;
            if (!videoUrl) {
                throw new Error('百炼任务成功但未返回视频URL：' + JSON.stringify(queryData).slice(0, 500));
            }
            return videoUrl;
        }
        if (status === 'FAILED') {
            const errMsg = (queryData.output && queryData.output.message) || '任务失败';
            throw new Error('视频生成任务失败：' + errMsg);
        }
    }
    throw new Error('视频生成任务超时（5分钟内未完成）');
}

export async function dashscopeGenerateVideo(baseUrl: string, apiKey: string, model: string, prompt: string, size: string, imageData: string, cfg: any, duration: any, ratio: string): Promise<string> {
    const isI2v = !!(model && /i2v/i.test(model));
    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
    };
    const body = buildVideoRequestBody(model, prompt, size, imageData, duration, ratio, isI2v);

    let requestUrl: string;
    let baseOrigin: string;
    try {
        const base = new URL(trimTrailingSlash(baseUrl));
        baseOrigin = base.origin;
        if (base.pathname.endsWith('/api/v1/services/aigc/video-generation/video-synthesis')) {
            requestUrl = base.href;
        } else {
            requestUrl = base.origin + '/api/v1/services/aigc/video-generation/video-synthesis';
        }
    } catch (e: any) {
        throw new Error('百炼 API 地址格式错误：' + e.message);
    }

    const taskId = await createVideoTask(requestUrl, headers, body);
    const queryUrl = baseOrigin + '/api/v1/tasks/' + encodeURIComponent(taskId);
    const queryHeaders = { 'Authorization': 'Bearer ' + apiKey };
    const ac = new AbortController();
    sharedState.videoAbortController = ac;
    try {
        const videoUrl = await pollVideoTask(queryUrl, queryHeaders, ac);
        return await saveVideoToDisk(videoUrl, cfg);
    } finally {
        if (sharedState.videoAbortController === ac) sharedState.videoAbortController = null;
    }
}

export function buildOpenAiImageUrl(baseUrl: string, imagePath: string): string {
    const trimmed = trimTrailingSlash(baseUrl);
    try {
        const u = new URL(trimmed);
        if (/\/v\d+$/.test(u.pathname)) {
            return trimmed + imagePath;
        }
    } catch (e: any) { console.warn('解析URL失败:', e.message); }
    return trimmed + '/v1' + imagePath;
}

/* ==================== 文件 MIME 类型映射 ==================== */
const IMAGE_MIME_MAP: any = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'
};

/* ==================== 图片格式嗅探工具 ====================
 * 修复：此前下载的图片一律被硬编码为 data:image/png;base64,...
 * 若实际是 JPEG/WebP，MIME 声明与数据不符会导致：
 *   1. nativeImage.createFromDataURL 返回空图 → 复制图片失败
 *   2. saveImageToDisk 存成 .png 扩展名 → 文件实际损坏打不开
 * 以下工具按二进制魔数嗅探真实格式，Content-Type 仅作兜底。
 */
export function sniffImageMime(buffer: Buffer, fallbackMime = 'image/png'): string {
    if (!buffer || buffer.length === 0) return fallbackMime;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    // JPEG: FF D8 FF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    // WebP: RIFF .... WEBP
    if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
    // GIF: 47 49 46 38
    if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif';
    // BMP: 42 4D
    if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
    return fallbackMime;
}

/** 由图片二进制推断扩展名（仅 main.ts 内部使用，非导出） */
function sniffImageExt(buffer: Buffer): string {
    switch (sniffImageMime(buffer, '')) {
        case 'image/jpeg': return '.jpg';
        case 'image/webp': return '.webp';
        case 'image/gif': return '.gif';
        case 'image/bmp': return '.bmp';
        default: return '.png';
    }
}

/** 由图片二进制构造 dataURL：优先使用服务端 Content-Type，魔数嗅探兜底，避免 MIME 声明与数据不符 */
export function bufferToImageDataUrl(buffer: Buffer, contentType?: string): string {
    let declared = '';
    if (contentType) {
        const mime = contentType.split(';')[0].trim().toLowerCase();
        if (/^image\/[\w.+-]+$/.test(mime)) declared = mime;
    }
    const mime = sniffImageMime(buffer, declared || 'image/png');
    return 'data:' + mime + ';base64,' + buffer.toString('base64');
}

/* ==================== 音乐模块常量 ==================== */
export const MUSIC_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.weba', '.webm'];
export const MUSIC_MIME_MAP: any = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
    '.weba': 'audio/webm', '.webm': 'audio/webm'
};

/* ==================== FM 收音机模块 ==================== */
export const RADIO_DEFAULT_CONFIG: any = {
    apiBaseUrl: 'https://all.api.radio-browser.info',
    timeout: 10000,
    customStations: []
};

export const BUILTIN_CN_HK_MUSIC_STATIONS = [
    { name: 'RTHK Radio 1', url: 'http://rthkaudio1.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,news', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 2', url: 'http://rthkaudio2.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,pop', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 3', url: 'http://rthkaudio3.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,english', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 4', url: 'http://rthkaudio4.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,classical', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' }
];

export function radioHttpGet(urlStr: string, timeoutMs?: number): Promise<{ data: any, statusCode: number }> {
    return new Promise((resolve, reject) => {
        const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
        let parsed: URL;
        try {
            parsed = new URL(urlStr);
        } catch (e: any) {
            return reject(new Error('URL 解析失败: ' + e.message));
        }
        const lib: any = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : null);
        if (!lib) return reject(new Error('不支持的协议: ' + parsed.protocol));
        // M7 修复：SSRF 防护 — 复用 security.ts 的统一实现 isPrivateOrLoopbackHost，
        // 覆盖 IPv4-mapped/十进制整数 IP(如 2130706433=127.0.0.1)、RFC1918、
        // 环回 127/8、链路本地 169.254/16、0.0.0.0/8、CGNAT 100.64/10、广播、
        // IPv6 ULA/link-local、.local/.internal 等（内联实现此前遗漏了其中多项）。
        // 注意：URL.hostname 对 IPv6 返回带方括号形式，isPrivateOrLoopbackHost 内部会剥离。
        const host = parsed.hostname.toLowerCase();
        if (isPrivateOrLoopbackHost(host)) {
            return reject(new Error('安全限制：不允许访问内网/本地地址'));
        }
        let resRef: any = null;
        const req = lib.get(parsed, {
            headers: { 'User-Agent': 'StickyNotes/7.4', 'Accept': 'application/json' },
            timeout,
        }, (res: any) => {
            resRef = res;
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            const MAX_BODY = 5 * 1024 * 1024;
            res.on('data', (c: Buffer) => {
                totalBytes += c.length;
                if (totalBytes > MAX_BODY) {
                    res.destroy();
                    reject(new Error('响应体超过 5MB 限制'));
                    return;
                }
                chunks.push(c);
            });
            res.on('error', reject);
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                const statusCode = res.statusCode || 0;
                if (statusCode < 200 || statusCode >= 300) {
                    return reject(new Error('HTTP ' + statusCode));
                }
                try {
                    resolve({ data: JSON.parse(body), statusCode });
                } catch (e: any) {
                    reject(new Error('JSON 解析失败: ' + e.message));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            if (resRef) resRef.destroy();
            reject(new Error('请求超时 (' + timeout + 'ms): ' + urlStr));
        });
    });
}

export function radioGetMirror(cfg: any): string {
    const base = (cfg && cfg.apiBaseUrl) || RADIO_DEFAULT_CONFIG.apiBaseUrl;
    if (base === 'https://all.api.radio-browser.info') {
        const mirrors = ['de1', 'nl1', 'at1'];
        const pick = mirrors[Math.floor(Math.random() * mirrors.length)];
        return 'https://' + pick + '.api.radio-browser.info';
    }
    return base;
}

export function radioNormalizeStation(raw: any): any | null {
    if (!raw || typeof raw !== 'object') return null;
    const url = String(raw.url || raw.streamurl || '').slice(0, 1024);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const tags = Array.isArray(raw.tags) ? raw.tags.join(',') : String(raw.tags || '');
    // 安全加固：favicon 必须为 http/https，否则置空（防 file:// 本地探测与内网 SSRF 探测）
    const favicon = String(raw.favicon || '').slice(0, 512);
    return {
        name: String(raw.name || raw.stationname || '未知电台').slice(0, 128),
        url,
        favicon: /^https?:\/\//i.test(favicon) ? favicon : '',
        country: String(raw.country || '').slice(0, 64),
        tags: tags.slice(0, 256),
        bitrate: Number(raw.bitrate) || 0,
        codec: String(raw.codec || '').slice(0, 32),
        homepage: String(raw.homepage || '').slice(0, 512)
    };
}

export function dedupStationsByUrl(...arrays: any[][]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const arr of arrays) {
        if (!Array.isArray(arr)) continue;
        for (const s of arr) {
            if (s && s.url && !seen.has(s.url)) {
                seen.add(s.url);
                result.push(s);
            }
        }
    }
    return result;
}

export async function fetchCnHkMusicFromRadioBrowser(cfg: any, tryUrls: string[]): Promise<any[] | null> {
    const fetchFromApi = async (pathAndQuery: string) => {
        let lastErr: any = null;
        for (const base of tryUrls) {
            try {
                const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
                if (Array.isArray(data)) {
                    return data.map(radioNormalizeStation).filter(Boolean);
                }
            } catch (e: any) {
                lastErr = e;
            }
        }
        return null;
    };
    const [cnRes, hkRes] = await Promise.all([
        fetchFromApi('/json/stations/search?countrycode=CN&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=50'),
        fetchFromApi('/json/stations/search?countrycode=HK&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=30')
    ]);
    if (cnRes === null && hkRes === null) return null;
    const merged = dedupStationsByUrl(cnRes || [], hkRes || []);
    return merged.filter(s => {
        const codec = (s.codec || '').toUpperCase();
        if (codec.indexOf('HLS') >= 0 || codec.indexOf('MPEGURL') >= 0) return false;
        if (/\.m3u8(\?|$)/i.test(s.url)) return false;
        if (s.bitrate && s.bitrate < 64) return false;
        return true;
    });
}

/* ==================== 日志上报辅助 ==================== */
const ALLOWED_LOG_SOURCES = ['main', 'renderer', 'popout-note', 'popout-todo', 'music', 'radio'];

export function processLogReport(data: any): { success: boolean, accepted: number } {
    if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
        return { success: true, accepted: 0 };
    }
    const source = (typeof data.source === 'string' && ALLOWED_LOG_SOURCES.includes(data.source)) ? data.source : 'unknown';
    let entries = data.entries;
    if (entries.length > logger.MAX_REPORT_ENTRIES) entries = entries.slice(0, logger.MAX_REPORT_ENTRIES);
    let accepted = 0;
    for (const entry of entries) {
        if (!entry || typeof entry.msg !== 'string') continue;
        let msg = entry.msg;
        if (msg.length > logger.MAX_ENTRY_MSG_LEN) msg = msg.slice(0, logger.MAX_ENTRY_MSG_LEN);
        const level = ['INFO', 'WARN', 'ERROR'].includes(entry.level) ? entry.level : 'INFO';
        logger.appendLog(level, [msg], source);
        accepted++;
    }
    return { success: true, accepted };
}

/* ==================== 单实例锁 + 应用生命周期 ==================== */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        // 初始化日志文件
        try { logger.initLogFile(); } catch (e: any) { console.warn('初始化日志文件失败:', e.message); }
        // 静默清理过期日志
        try { logger.cleanOldLogs(); } catch (e: any) { console.error('启动清理过期日志失败:', e.message); }

        // 初始化历史目录路径（app ready 后才有 userData）
        ensureHistoryDir();

        // 一次性加载设置
        loadSettings();

        // session 权限处理器：拒绝所有敏感权限请求
        try {
            session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => {
                cb(false);
            });
            session.defaultSession.setPermissionCheckHandler(() => false);
        } catch (e: any) { console.error('设置权限处理器失败:', e.message); }

        // 旧版明文凭据自动迁移
        try { await migrateLegacyCreds(); } catch (e: any) {
            console.warn('旧版凭据迁移失败（safeStorage 可能不可用）：', e.message);
        }

        // chatimg 协议处理
        protocol.handle('chatimg', async (request: any) => {
            try {
                return await serveLocalFile(request.url, getChatImagesDir(), IMAGE_MIME_MAP, { maxSize: MAX_IMAGE_SIZE }, request);
            } catch (e: any) {
                console.error('chatimg 协议读取失败:', e.message);
                return new Response('Server Error', { status: 500 });
            }
        });

        // musicfile 协议处理
        protocol.handle('musicfile', async (request: any) => {
            try {
                const url = new URL(request.url);
                const kind = url.hostname;
                let mimeMap: any, maxSize: number;
                if (kind === 'audio') {
                    mimeMap = MUSIC_MIME_MAP;
                    maxSize = 50 * 1024 * 1024;
                } else if (kind === 'cover') {
                    mimeMap = IMAGE_MIME_MAP;
                    maxSize = 5 * 1024 * 1024;
                } else {
                    return new Response('Forbidden', { status: 403 });
                }
                const filePath = decodeURIComponent(url.pathname.slice(1));
                if (!path.isAbsolute(filePath)) {
                    return new Response('Forbidden', { status: 403 });
                }
                const ext = path.extname(filePath).toLowerCase();
                if (!mimeMap[ext]) {
                    return new Response('Forbidden', { status: 403 });
                }
                let realPath: string;
                try {
                    realPath = await fs.promises.realpath(filePath);
                } catch (_) {
                    return new Response('Not Found', { status: 404 });
                }
                // C3 修复：cover 仅允许 getMusicCoversDir()，audio 仅允许已批准路径，防任意文件读取
                if (kind === 'cover') {
                    let realCoversDir: string;
                    try { realCoversDir = await fs.promises.realpath(getMusicCoversDir()); }
                    catch (_) { return new Response('Not Found', { status: 404 }); }
                    if (realPath !== realCoversDir && !realPath.startsWith(realCoversDir + path.sep)) {
                        return new Response('Forbidden', { status: 403 });
                    }
                } else if (kind === 'audio') {
                    if (!approvedAudioPaths.has(realPath)) {
                        return new Response('Forbidden', { status: 403 });
                    }
                }
                const fileStat = await fs.promises.stat(realPath);
                if (!fileStat.isFile()) {
                    return new Response('Not Found', { status: 404 });
                }
                if (fileStat.size > maxSize) {
                    return new Response('Payload Too Large', { status: 413 });
                }
                // OPT-1 修复：流式 Response + Range 请求支持（与 chatimg 协议共用 buildRangeStreamResponse），
                // 使 Howler html5:true 真正生效，seek 时仅读取目标范围而非整个文件
                return buildRangeStreamResponse(realPath, fileStat.size, mimeMap[ext], request.headers.get('range'));
            } catch (e: any) {
                console.error('musicfile 协议读取失败:', e.message);
                return new Response('Server Error', { status: 500 });
            }
        });

        // 注册全部 IPC handler 频道
        registerIpcHandlers();

        createWindow();
        createTray();
        scheduleAutoSync();

        app.on('activate', () => {
            if (mainWindow) { mainWindow.show(); }
            else { createWindow(); }
        });
    }).catch((e: any) => {
        console.error('应用启动失败:', e);
        try { if (app) app.exit(1); } catch (e: any) { console.warn('退出应用失败:', e.message); }
    });
}

// before-quit：关闭小窗口 + 刷盘活跃度/历史/日志 + 延迟退出等写盘
app.on('before-quit', () => {
    // 先 close() 触发 popout 的 beforeunload flush，再兜底 destroy()
    const closeAllPopouts = (set: Map<string, BrowserWindow>) => {
        set.forEach((win) => {
            if (!win || win.isDestroyed()) return;
            try { win.close(); } catch (e: any) { console.warn('关闭窗口失败:', e.message); }
            setTimeout(() => { try { if (!win.isDestroyed()) win.destroy(); } catch (e: any) { console.warn('销毁窗口失败:', e.message); } }, 0);
        });
        set.clear();
    };
    try { closeAllPopouts(popoutWindows); } catch (e: any) { console.warn('关闭便签小窗口失败:', e.message); }
    try { closeAllPopouts(todoPopoutWindows); } catch (e: any) { console.warn('关闭待办小窗口失败:', e.message); }
    try { flushActivity(); } catch (e: any) { console.warn('保存活动数据失败:', e.message); }
    try { flushAllNoteHistorySync(); } catch (e: any) { console.warn('刷盘历史快照失败:', e.message); }
    try { logger.flushLogFile(); } catch (e: any) { console.warn('刷盘日志失败:', e.message); }
});

// 延迟退出逻辑：若写盘仍在进行中，延迟退出避免数据丢失
app.on('before-quit', (e) => {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-saving-before-quit');
        }
    } catch (e: any) { console.warn('通知主窗口退出失败:', e.message); }

    if (isPendingSave() && quitRetryCount < MAX_QUIT_RETRY) {
        e.preventDefault();
        quitRetryCount++;
        setTimeout(() => app.quit(), QUIT_RETRY_INTERVAL);
    }
});

// will-quit：清理定时器 + 刷盘日志 + 中断 video
app.on('will-quit', () => {
    try { logger.flushLogFile(); } catch (e: any) { console.warn('刷盘日志失败:', e.message); }
    try {
        if (sharedState.videoAbortController) {
            sharedState.videoAbortController.abort();
            sharedState.videoAbortController = null;
        }
    } catch (e: any) { console.warn('中止视频请求失败:', e.message); }
    try {
        if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    } catch (e: any) { console.warn('清理同步定时器失败:', e.message); }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});



export function closePopoutById(noteId: string, type: 'note' | 'todo' = 'note'): boolean {
    const map = type === 'todo' ? todoPopoutWindows : popoutWindows;
    const win = map.get(String(noteId));
    if (win && !win.isDestroyed()) {
        win.close();
        map.delete(String(noteId));
        return true;
    }
    return false;
}