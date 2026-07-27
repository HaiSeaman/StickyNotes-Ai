const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, safeStorage, dialog, protocol, clipboard, screen, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
// music-metadata-browser：解析音频 ID3/Vorbis 标签与封面图（V7.4 音乐模块）
// parseNodeStream 接受 Node.js 可读流，避免一次性读入大文件到内存
const { parseNodeStream } = require('music-metadata-browser');

// 日志子系统（内存缓冲 + 文件轮转 + 控制台劫持 + 进程异常捕获）
// 加载时立即劫持 console 并注册 process 异常处理，所有 console.log/warn/error 自动旁路记录
const logger = require('./logger');

const { registerAiHandlers } = require('./services/aiService');
const { buildWebdavRequestContext, webdavRequest, parseWebdavPropfindXml } = require('./services/syncService');
const { serveLocalFile, cleanTtsCache, saveAudioToTtsCache } = require('./main/protocol');
const { getOverlayLoggerScript, getPopoutCommonCss, buildPopoutHtml } = require('./main/popoutTemplate');

/* ==================== 全局变量 ==================== */
let mainWindow = null;
let tray = null;
let isPinned = false;
let isFixed = false;
let settingsCache = null;  // 设置缓存，避免重复读盘

// 备份文件大小上限：200MB（防止下载超大 ZIP 把内存撑爆导致 OOM 崩溃）
const MAX_BACKUP_SIZE = 200 * 1024 * 1024;
// 聊天图片大小上限：20MB（防止用户粘贴超大图片导致 base64 撑爆 IPC 与堆内存）
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
// 剪贴板文本大小上限：1MB（防止撑爆剪贴板）
const MAX_CLIPBOARD_TEXT_SIZE = 1024 * 1024;

/* ==================== 安全工具函数 ====================
 * assertPayloadSize / isSafeExternalUrl / validateAiBaseUrl / escapeHtmlFull
 * 已迁移至 security.js（含 MAX_IPC_PAYLOAD_SIZE 常量）。
 * ================================================== */
const {
    MAX_IPC_PAYLOAD_SIZE,
    assertPayloadSize,
    isSafeExternalUrl,
    isSafePublicStreamUrl,
    validateAiBaseUrl,
    escapeHtmlFull,
} = require('./security');

// JSON 文件原子读写（loadJSON / saveJSON / saveJSONSync）：损坏自动备份 + Windows EPERM 重试
const { loadJSON, saveJSON, saveJSONSync } = require('./json-io');

/* ==================== 文件路径 ====================
 * 所有 getXxxPath / getXxxDir 已迁移至 paths.js，通过解构导入。
 * 日志目录（getLogDir）由 logger.js 提供；note_history 目录由 note-history 模块自管。
 * ================================================== */
const {
    getNotesPath,
    getArchivedNotesPath,
    getTrashedNotesPath,
    getArchivedChatsPath,
    getTrashedChatsPath,
    getSettingsPath,
    getCalendarPath,
    getActivityPath,
    getChatImagesDir,
    getTtsCacheDir,
    getMusicDir,
    getMusicPlaylistPath,
    getMusicCoversDir,
    getRadioDir,
    getRadioCachePath,
    getRadioFavoritesPath,
} = require('./paths');

/* ==================== TTS 语音缓存基础设施 ====================
 * 合成音频一律落盘到 userData/tts_cache/，渲染进程通过 ttsfile:// 协议按需加载。
 * 设计与 chat-images 同构：前端零 base64 内存占用，主进程统一管控文件生命周期。
 * 缓存策略：7 天过期 + 100MB 总量上限，app 启动时静默清理（异步、不阻塞启动）。
 * ============================================================= */
const TTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 天
const TTS_CACHE_MAX_SIZE = 100 * 1024 * 1024;            // 100MB

/**
 * 公共本地文件服务：为 chatimg/ttsfile 协议提供统一的文件读取逻辑。
 * 包含路径穿越防护、stat 校验、大小限制、MIME 映射、异步读取。
 *
 * @param {string} requestUrl - 协议请求的 URL（如 chatimg://chat-images/xxx.png）
 * @param {string} dir - 文件所在目录的绝对路径
 * @param {Object} mimeMap - 扩展名到 MIME 类型的映射
 * @param {Object} [options]
 * @param {string} [options.defaultMime='application/octet-stream'] - 未知扩展名的默认 MIME
 * @param {number} [options.maxSize=0] - 文件大小上限（字节，0 表示不限制）
 * @param {boolean} [options.requireRealpath=false] - 是否做 realpath 符号链接二次校验
 * @returns {Promise<Response>} Electron 协议 Response 对象
 */


/* ==================== chatimg 自定义协议 ====================
 * 渲染进程通过 <img src="chatimg://chat-images/<filename>"> 直接加载本地图片，
 * 由主进程读取磁盘文件返回。相比 IPC dataUrl 方案，浏览器可异步加载与缓存，
 * 渲染进程无需持有完整 base64，既省内存又简化渲染逻辑。
 * 必须在 app ready 前注册 scheme，否则不会被当作标准协议处理。
 */
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'chatimg',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    },
    /* ttsfile 协议：渲染进程 <audio src="ttsfile://tts_cache/xxx.mp3"> 加载本地合成音频。
     * 与 chatimg 同构：主进程读盘返回，渲染进程零 base64 内存占用。
     * 必须在 app ready 前注册 scheme，否则不会被当作标准协议处理（无法用于 <audio>）。 */
    {
        scheme: 'ttsfile',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    },
    /* musicfile 协议：渲染进程 <audio src="musicfile://audio/<encoded-path>"> 加载本地音乐文件，
     * <img src="musicfile://cover/<encoded-path>"> 加载专辑封面。
     * 与 ttsfile 同构：主进程读盘返回，含 realpath 二次校验防 symlink 逃逸。
     * 必须在 app ready 前注册 scheme，否则不会被当作标准协议处理。 */
    {
        scheme: 'musicfile',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    }
]);

/* ==================== 托盘/窗口图标生成（太阳 ☀️） ====================
 * 绘制一个暖橙色太阳：中心实心圆 + 8 条向外辐射的光线
 * 用于托盘图标（size=32）、窗口/任务栏图标（size=256），保持一致的品牌识别
 *
 * 合并自原 createTrayImage（32）与 createSunIconLarge（256）：
 *   - 几何比例（rSun/rayInner/rayOuter）两档完全一致，按 size 比例缩放
 *   - rayWidth、AA 羽化半宽、角度阈值按尺寸分档：低分辨率需更宽 AA 避免锯齿，
 *     高分辨率需更紧角度阈值避免光线发糊；两档常量分别调校，不可统一缩放
 *   - 光线外端 AA 的 offset/divisor 两档独立调校（small: 0.8/1.6, large: 2/5），
 *     严禁改动任一档常量，否则会改变已验证的视觉输出
 * ================================================================ */
function createSunIcon(size) {
    const isLarge = size >= 128;
    // 几何（按 size 比例，32 与 256 两档比例完全一致）
    const rSun = Math.round(size * 0.21875);
    const rayInner = Math.round(size * 0.28125);
    const rayOuter = Math.round(size * 0.4375);
    // AA 与角度阈值（按尺寸分档，分别调校，不可混用）
    const rayWidth    = isLarge ? 12   : 1.6;
    const sunAA       = isLarge ? 2    : 0.8;   // 太阳圆边缘 AA 羽化半宽
    const rayBoundTol = isLarge ? 2    : 0.5;   // 光线内外端边界容差
    const raySideAA   = isLarge ? 3    : 0.6;   // 光线侧边 AA 羽化半宽
    const rayEndAA    = isLarge ? 3    : 0.8;   // 光线外端 AA 触发半宽（dist > rayOuter - rayEndAA）
    const rayEndOff   = isLarge ? 2    : 0.8;   // 光线外端 AA 公式 rayOuter 偏移量（两档独立调校）
    const rayEndDiv   = isLarge ? 5    : 1.6;   // 光线外端 AA 衰减分母（两档独立调校）
    const angleThresh = isLarge ? 0.08 : 0.5;

    try {
        const buf = Buffer.alloc(size * size * 4);
        const cx = size / 2;
        const cy = size / 2;
        // 太阳暖色调：中心橙黄、光线偏橙
        const sunColor = [255, 170, 60];    // 太阳中心：暖橙黄
        const rayColor = [255, 140, 40];    // 光线：橙色
        // 8 条光线方向（0°、45°、90°...，弧度）
        const rayAngles = [];
        for (let i = 0; i < 8; i++) rayAngles.push((i * Math.PI) / 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                let r = 0, g = 0, b = 0, a = 0;

                // 1. 太阳中心实心圆（带抗锯齿边缘）
                if (dist <= rSun + sunAA) {
                    let alpha = 255;
                    if (dist > rSun - sunAA) {
                        alpha = Math.round((rSun + sunAA - dist) * 255 / (2 * sunAA));
                    }
                    r = sunColor[0]; g = sunColor[1]; b = sunColor[2];
                    a = Math.max(0, Math.min(255, alpha));
                }

                // 2. 8 条光线（矩形条，沿辐射方向延伸）
                if (a === 0 && dist >= rayInner - rayBoundTol && dist <= rayOuter + rayBoundTol) {
                    const angle = Math.atan2(dy, dx);
                    // 计算点到中心连线与每条光线方向的夹角，取最小值
                    let minAngleDiff = Math.PI;
                    for (const ra of rayAngles) {
                        let diff = Math.abs(angle - ra);
                        if (diff > Math.PI) diff = 2 * Math.PI - diff;
                        if (diff < minAngleDiff) minAngleDiff = diff;
                    }
                    // 垂直于光线方向的偏移距离 = dist * sin(夹角)
                    const perpDist = Math.abs(dist * Math.sin(minAngleDiff));
                    if (minAngleDiff < angleThresh && perpDist <= rayWidth) {
                        // 光线亮度随距离略微衰减，边缘抗锯齿
                        let alpha = 255;
                        if (perpDist > rayWidth - raySideAA) {
                            alpha = Math.round((rayWidth - perpDist) * 255 / raySideAA);
                        }
                        if (dist > rayOuter - rayEndAA) {
                            alpha = Math.min(alpha, Math.round((rayOuter + rayEndOff - dist) * 255 / rayEndDiv));
                        }
                        r = rayColor[0]; g = rayColor[1]; b = rayColor[2];
                        a = Math.max(0, Math.min(255, alpha));
                    }
                }

                buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = a;
            }
        }

        if (typeof nativeImage.createFromBitmap === 'function') {
            const img = nativeImage.createFromBitmap(buf, { width: size, height: size });
            if (img && !img.isEmpty()) return img;
        }
    } catch (_) { /* fallback */ }

    // 仅小尺寸有 dataURL 像素兜底；大尺寸无兜底（返回 null，由调用方处理）
    if (!isLarge) {
        try {
            const pixel = nativeImage.createFromDataURL(
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVQ4T2NkYPj/n4EBBJgYKAQMowYMowYMowYMowYMowYMIwoMowYMFQAAeX0P+R6HDXkAAAAASUVORK5CYII='
            );
            return pixel.resize({ width: size, height: size });
        } catch (_) {
            return nativeImage.createEmpty().resize({ width: size, height: size });
        }
    }
    return null;
}

/* ==================== SSE 流解析工具 ====================
 * SSE（Server-Sent Events）是 HTTP 长连接流式协议，服务端以 "data: <payload>\n\n" 格式
 * 逐帧推送。AI 对话流式输出（OpenAI/百炼等）均采用此协议。
 *
 * 本解析器从 fetch Response 的 ReadableStream 逐块读取，按 \n 分行：
 * - buffer 技巧：每次 read() 拿到的不一定是完整行（可能截断在行中间），
 *   所以 split('\n') 后保留最后一段（lines.pop()）到下一轮拼接，确保不丢半行。
 * - 跳过空行和 ':' 开头的注释行（SSE 协议用注释做心跳保活）。
 * - '[DONE]' 是 OpenAI 约定的流结束标记，跳过即可（外层 reader.read() 会拿到 done=true）。
 * - 单行 JSON 解析失败时静默跳过，避免一行坏数据中断整个流。
 *
 * 任何需要流式的地方（chat / generate / translate）都可复用此函数。
 */
async function parseSSEStream(resp, onChunk) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // 按行处理 SSE
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';  // 保留最后不完整的行，下轮拼接
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || line.startsWith(':')) continue;  // 空行或注释（心跳）
                if (!line.startsWith('data:')) continue;      // 只处理 data: 帧
                const data = line.slice(5).trim();
                if (data === '[DONE]') continue;              // OpenAI 流结束标记
                try { onChunk(JSON.parse(data)); } catch (_) { /* 单行解析失败跳过 */ }
            }
        }
    } finally {
        try { reader.releaseLock(); } catch (_) {}
    }
}

/* ==================== 设置缓存 ==================== */
function loadSettings() {
    if (!settingsCache) {
        settingsCache = loadJSON(getSettingsPath(), {});
    }
    return settingsCache;
}
// 异步持久化：内部 catch 错误并日志，使 fire-and-forget 调用不产生 unhandled rejection
async function persistSettings() {
    if (settingsCache) {
        try { return await saveJSON(getSettingsPath(), settingsCache); }
        catch (e) { console.error('持久化设置失败:', e.message); return false; }
    }
    return false;
}

/* ==================== 旧版明文凭据自动迁移 ====================
 * 老版本会把 S3 accessKey/secretKey、WebDAV pass 以明文存到 settings.json。
 * 新版本一律用 safeStorage 加密后写入 *Enc 字段。这里在启动时检测到明文就
 * 加密写回并删除明文字段，避免明文密码一直躺在磁盘上让用户以为"升级就安全了"。
 * 注意：encryptSecret 在 safeStorage 不可用时会抛错，调用方要 try/catch 兜底。
 * ===================================================================== */
async function migrateLegacyCreds() {
    const s = loadSettings();
    const syncCfg = s.syncConfig || {};
    let migrated = false;

    // S3 明文 accessKey / secretKey 迁移
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

    // WebDAV 明文 pass 迁移
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
function buildWindowOptions(initialBounds, sunIcon) {
    const windowOptions = {
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
            backgroundThrottling: false,
        },
    };
    if (initialBounds && initialBounds.x !== undefined && initialBounds.y !== undefined) {
        windowOptions.x = initialBounds.x;
        windowOptions.y = initialBounds.y;
    }
    return windowOptions;
}

function attachSecurityHandlers(win) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                shell.openExternal(url);
            }
        } catch (_) {}
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (!url || !url.startsWith('file://')) {
            e.preventDefault();
            return;
        }
        try {
            const target = path.resolve(new URL(url).pathname);
            if (!target.startsWith(__dirname + path.sep) && target !== __dirname) {
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
}

function bindWindowBoundsEvents(win) {
    let windowBoundsDebounceTimer = null;
    const persistWindowBounds = () => {
        if (!win || win.isDestroyed()) return;
        if (win.isMaximized()) return;
        try {
            const bounds = win.getBounds();
            const s = loadSettings();
            s.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
            persistSettings();
        } catch (_) {}
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

function createWindow() {
    const sunIcon = createSunIcon(256);
    const savedSettings = loadSettings();
    const savedBounds = savedSettings.windowBounds || null;
    const initialBounds = validateWindowBounds(savedBounds);

    const windowOptions = buildWindowOptions(initialBounds, sunIcon);
    mainWindow = new BrowserWindow(windowOptions);

    try {
        if (typeof mainWindow.setBackgroundMaterial === 'function') {
            mainWindow.setBackgroundMaterial('mica');
        }
    } catch (_) { /* 忽略 */ }

    attachSecurityHandlers(mainWindow);
    mainWindow.loadFile('index.html');

    const startHidden = process.argv.includes('--hidden');
    let windowShown = false;
    mainWindow.once('ready-to-show', () => {
        if (startHidden) { windowShown = true; return; }
        if (!windowShown) { windowShown = true; mainWindow.show(); }
    });
    setTimeout(() => {
        if (!windowShown && !startHidden && mainWindow) { windowShown = true; mainWindow.show(); }
    }, 5000);

    try {
        const taskbarIcon = createSunIcon(32);
        if (taskbarIcon && !taskbarIcon.isEmpty() && typeof mainWindow.setOverlayIcon === 'function') {
            mainWindow.setOverlayIcon(taskbarIcon, '便签');
        }
    } catch (_) { /* 忽略 */ }

    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('focus', () => { quitRetryCount = 0; });
    bindWindowBoundsEvents(mainWindow);
}

/**
 * 校验保存的窗口 bounds 是否在某个屏幕可见范围内
 * 多显示器场景：拔了副屏后，保存的坐标可能不在任何屏幕内，需重置为默认值
 * @param {{x:number,y:number,width:number,height:number}|null} bounds
 * @returns {{x:number,y:number,width:number,height:number}|null} 校验后的 bounds，null 表示使用默认值
 */
function validateWindowBounds(bounds) {
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
        // 检查窗口中心点是否在某个显示器内
        const cx = x + w / 2;
        const cy = y + h / 2;
        const displays = screen.getAllDisplays();
        const visible = displays.some(d => {
            return cx >= d.bounds.x && cx <= d.bounds.x + d.bounds.width
                && cy >= d.bounds.y && cy <= d.bounds.y + d.bounds.height;
        });
        if (!visible) {
            // 找不到对应屏幕：把窗口放回主屏左上区域
            const primary = screen.getPrimaryDisplay();
            return {
                x: primary.bounds.x + 80,
                y: primary.bounds.y + 80,
                width: w, height: h
            };
        }
    } catch (_) {}
    return { x, y, width: w, height: h };
}

/* ==================== 便签独立悬浮小窗口（扯出小纸条） ====================
 * 用户在主窗口中点击"扯出小纸条"按钮 → 弹出独立小窗口
 * - 极简：标题栏（含置顶切换按钮 + 关闭按钮）+ textarea + 状态栏
 * - 毛玻璃背景（mica）
 * - 默认置顶（alwaysOnTop），可由顶部按钮切换
 * - 关闭小窗口时把最新内容同步回主窗口
 * - 数据流：主窗口 → IPC → 主进程打开小窗口 → 小窗口输入 → 实时同步回主进程 → 推送给主窗口
 * ============================================================ */
const popoutWindows = new Map();  // noteId → BrowserWindow（便签内容小窗口）
const todoPopoutWindows = new Map();  // noteId → BrowserWindow（待办事项小窗口）

/**
 * 打开（或聚焦）一个便签的"内容"独立悬浮小窗口
 * @param {{noteId:string|number, title:string, content:string}} data
 */
function openPopoutWindow(data) {
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

/**
 * 打开（或聚焦）一个便签的"待办事项"独立悬浮小窗口
 * @param {{noteId:string|number, title:string, todos:Array}} data
 */
function openTodoPopoutWindow(data) {
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

/**
 * popout 窗口创建公共逻辑（便签内容窗口与待办窗口共享）
 *
 * 安全等价性保证：
 *  - BrowserWindow 配置（frame/alwaysOnTop/skipTaskbar/resizable/webPreferences 等）逐字一致
 *  - setWindowOpenHandler / will-navigate 安全拦截逻辑逐字一致
 *  - ready-to-show / closed 事件回调结构一致
 *  - 仅 width/height/minWidth/minHeight/html 构造器/closedChannel/map 因类型不同有差异
 *
 * @param {Object} opts
 * @param {Object} opts.data - 原始 data（必须含 noteId）
 * @param {Map} opts.map - 窗口存储 Map（popoutWindows 或 todoPopoutWindows）
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.minWidth
 * @param {number} opts.minHeight
 * @param {Function} opts.buildHtml - HTML 构造函数（buildPopoutHtml 或 buildTodoPopoutHtml）
 * @param {string} opts.closedChannel - 关闭时通知主窗口的 IPC channel 名
 */
function openPopoutWindowCommon(opts) {
    const { data, map, width, height, minWidth, minHeight, buildHtml, closedChannel } = opts;
    if (!data || !data.noteId) return { success: false, message: '缺少 noteId' };
    const noteId = String(data.noteId);
    // 已存在则聚焦
    const existing = map.get(noteId);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        existing.show();
        return { success: true, alreadyOpen: true };
    }
    // 创建小窗口
    const parent = mainWindow;
    const win = new BrowserWindow({
        width,
        height,
        minWidth,
        minHeight,
        frame: false,
        alwaysOnTop: true,             // 默认死死钉在最上层
        skipTaskbar: false,            // 任务栏可见（方便用户切换）
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
    // 加载一个独立的极简 HTML 页面
    const htmlString = buildHtml(data);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlString));
    // 安全：阻止 popout 窗口打开新窗口 / 导航到外部 URL（防 XSS 后 RCE）
    win.webContents.setWindowOpenHandler(() => { return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => {
        // data: URL 加载的文档不允许导航到任何其他 URL
        if (!url || !url.startsWith('data:')) e.preventDefault();
    });
    win.once('ready-to-show', () => {
        win.show();
    });
    // 关闭时把最新内容回传主窗口
    win.on('closed', () => {
        map.delete(noteId);
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(closedChannel, { noteId });
            }
        } catch (_) {}
    });
    map.set(noteId, win);
    return { success: true };
}

/**
 * 切换任意小窗口的置顶状态
 * @param {string} noteId
 * @param {'note'|'todo'} type - note=便签内容小窗口, todo=待办事项小窗口
 * @returns {{success:boolean, pinned:boolean}}
 */
function togglePopoutPin(noteId, type) {
    const map = type === 'todo' ? todoPopoutWindows : popoutWindows;
    const win = map.get(String(noteId));
    if (!win || win.isDestroyed()) return { success: false, pinned: false };
    const cur = win.isAlwaysOnTop();
    const next = !cur;
    win.setAlwaysOnTop(next);
    // 通知小窗口自身更新按钮 UI
    try {
        win.webContents.send('popout-pin-changed', { pinned: next });
    } catch (_) {}
    return { success: true, pinned: next };
}

/**
 * 构建便签小窗口的极简 HTML
 * 设计：毛玻璃半透明背景 + 标题栏（标题 + 置顶按钮 + 关闭按钮）+ 纯净 textarea
 */
/**
 * popout 窗口共用 CSS（两份 popout HTML 完全一致的部分）。
 * 注意：body 与 .titlebar 因 opacity/rgba 差异，由各 builder 自行定义，不在此处合并。
 * 严禁"顺手优化"任何属性值（配色、数值、顺序必须逐字等价）。
 */


/**
 * 读取 overlay-logger.js 内容并缓存，供 popout 内联 HTML 注入。
 * popout 窗口使用 data: URL 加载，CSP 仅允许 'unsafe-inline'，无法 <script src> 外部文件，
 * 因此在主进程读取文件内容后作为内联 <script> 注入到 HTML 字符串中。
 */


/**
 * 构建待办事项小窗口的 HTML
 * 设计：毛玻璃半透明背景 + 标题栏（标题 + 置顶按钮 + 关闭按钮）+ 待办列表 + 输入框
 */
function buildTodoPopoutHtml(data) {
    const title = escapeHtmlFull(data.title || '待办事项');
    // 序列化 todos 为 JSON 字符串（转义 </script> 防内联脚本 Breakout XSS）
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
.todo-defer{
    width:20px;height:20px;border:none;background:transparent;
    color:#AAA;cursor:pointer;border-radius:4px;
    display:flex;align-items:center;justify-content:center;padding:0;
    opacity:0;transition:all 0.18s;
}
.todo-item:hover .todo-defer{opacity:1}
.todo-defer:hover{background:rgba(255,159,10,0.18);color:#FF9F0A}
.todo-item.deferred{opacity:0.7;border-left:2px solid #FF9F0A;padding-left:8px;background:rgba(255,159,10,0.04)}
.todo-defer-badge{display:inline-block;background:rgba(255,159,10,0.22);color:#FF9F0A;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-right:6px;letter-spacing:0.3px}
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
// 不再直接 require('electron')，杜绝 RCE 风险
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

// 生成唯一 ID：Date.now()*1000 + 随机数，碰撞概率远低于 Date.now()+random*1000
// 必须定义在内联 script 内（popout 窗口渲染进程上下文），不能引用主进程的函数
function genId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }

function render(){
    if (!todos || todos.length === 0){
        listWrap.innerHTML = '<div class="todo-empty">暂无待办事项</div>';
    } else {
        // 排序：未延期未完成在前，已完成次之，已延期到底部
        const sorted = todos.slice().sort((a, b) => {
            const aD = !!a.deferred, bD = !!b.deferred;
            if (aD !== bD) return aD ? 1 : -1;
            const aDone = !!a.done, bDone = !!b.done;
            if (aDone !== bDone) return aDone ? 1 : -1;
            return 0;
        });
        let html = '';
        sorted.forEach(t => {
            const deferred = !!t.deferred;
            html += '<div class="todo-item'+(deferred?' deferred':'')+'" data-id="'+t.id+'">'
                + '<div class="todo-check'+(t.done?' checked':'')+'" data-act="toggle">'+(t.done?'✓':'')+'</div>'
                + '<span class="todo-text'+(t.done?' done':'')+'">'
                    + (deferred ? '<span class="todo-defer-badge">⏰ 延期</span>' : '')
                    + escapeHtml(t.text)
                + '</span>'
                + (t.done || deferred ? '' : '<button class="todo-defer" data-act="defer" title="延期到明天"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>')
                + '<button class="todo-del" data-act="del" title="删除">✕</button>'
                + '</div>';
        });
        listWrap.innerHTML = html;
    }
    const doneCount = todos.filter(t => t.done).length;
    const deferredCount = todos.filter(t => t.deferred).length;
    countText.textContent = '共 ' + todos.length + ' 项 · 已完成 ' + doneCount + (deferredCount ? ' · 延期 ' + deferredCount : '');
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
            if (t.done && t.deferred) t.deferred = false;
            render(); syncToMain();
        }
    } else if (e.target.dataset.act === 'del'){
        todos = todos.filter(x => String(x.id) !== String(id));
        render(); syncToMain();
    } else if (e.target.dataset.act === 'defer'){
        const t = todos.find(x => String(x.id) === String(id));
        if (t){
            t.deferred = true;
            t.deferredAt = Date.now();
            t.done = false;
            // 移到末尾
            todos = todos.filter(x => String(x.id) !== String(id));
            todos.push(t);
            render(); syncToMain();
        }
    }
});

// 添加待办
function addTodo(){
    const text = inputEl.value.trim();
    if (!text) return;
    todos.push({ id: genId(), text, done: false });
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
    } catch (_) {}
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

// 打开便签小窗口
ipcMain.handle('note:popout', tryWrap((_event, data) => openPopoutWindow(data)));

// 关闭便签小窗口
ipcMain.handle('note:close-popout', tryWrap((_event, noteId) => {
    const id = String(noteId);
    const win = popoutWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.close();
    }
    return { success: true };
}));

// 小窗口实时输入：主进程接收后转发给主窗口
ipcMain.on('popout-note:input', (_event, data) => {
    if (!data || !data.noteId) return;
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('popout-note:update', data);
        }
        // 同时把内容推送给所有同名小窗口（避免有多个时不同步，正常情况只有一个）
        const win = popoutWindows.get(String(data.noteId));
        if (win && !win.isDestroyed()) {
            // 不回推给来源窗口避免死循环
        }
    } catch (_) {}
});

// 主窗口内容变化时推送给小窗口
ipcMain.on('popout-note:push-from-main', (_event, data) => {
    if (!data || !data.noteId) return;
    try {
        const win = popoutWindows.get(String(data.noteId));
        if (win && !win.isDestroyed()) {
            win.webContents.send('popout-note:push', data);
        }
    } catch (_) {}
});

/* ==================== 待办事项小窗口 IPC ==================== */

// 打开待办事项小窗口
ipcMain.handle('todo:popout', tryWrap((_event, data) => openTodoPopoutWindow(data)));

// 关闭待办事项小窗口
ipcMain.handle('todo:close-popout', tryWrap((_event, noteId) => {
    const id = String(noteId);
    const win = todoPopoutWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.close();
    }
    return { success: true };
}));

// 待办小窗口实时输入：转发给主窗口
ipcMain.on('popout-todo:input', (_event, data) => {
    if (!data || !data.noteId) return;
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('popout-todo:update', data);
        }
    } catch (_) {}
});

// 主窗口待办变化时推送给待办小窗口
ipcMain.on('popout-todo:push-from-main', (_event, data) => {
    if (!data || !data.noteId) return;
    try {
        const win = todoPopoutWindows.get(String(data.noteId));
        if (win && !win.isDestroyed()) {
            win.webContents.send('popout-todo:push', data);
        }
    } catch (_) {}
});

/* ==================== 小窗口置顶切换 IPC ==================== */
ipcMain.handle('popout:toggle-pin', (_event, { noteId, type }) => {
    try {
        return togglePopoutPin(noteId, type);
    } catch (e) {
        return { success: false, pinned: false };
    }
});

// 退出时关闭所有小窗口（便签 + 待办）
// 注：此处仅做资源清理，不阻止退出；pendingSaveCount 延迟退出逻辑在 app 末尾的统一 before-quit 中处理
app.on('before-quit', () => {
    // 先 close() 触发 popout 的 beforeunload flush（destroy 会绕过 beforeunload），再兜底 destroy()
    const closeAllPopouts = (set) => {
        set.forEach((win) => {
            if (!win || win.isDestroyed()) return;
            try { win.close(); } catch (_) {}
            // close 异步，兜底强制销毁（下一轮事件循环）
            setTimeout(() => { try { if (!win.isDestroyed()) win.destroy(); } catch (_) {} }, 0);
        });
        set.clear();
    };
    try { closeAllPopouts(popoutWindows); } catch (_) {}
    try { closeAllPopouts(todoPopoutWindows); } catch (_) {}
    // 刷盘活跃度防抖计数，避免退出时丢失最近 1.5s 内的操作
    try { flushActivity(); } catch (_) {}
    // 退出前刷盘日志，防最后一批日志丢失（与 will-quit 互为兜底）
    try { logger.flushLogFile(); } catch (_) {}
});

/* ==================== 托盘创建 ==================== */
function createTray() {
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
    } catch (err) { console.error('托盘创建失败:', err.message); }
}

/* ==================== IPC 处理器 ==================== */

// 便签数据
ipcMain.handle('notes:load', () => loadJSON(getNotesPath(), []));
// 标记写盘是否进行中：退出时若仍在写，延迟退出以免数据丢失
// 使用计数器而非布尔值，支持多个 IPC 通道并发保存（如 notes:save 与 calendar:save 交错）
let pendingSaveCount = 0;
function isPendingSave() { return pendingSaveCount > 0; }
// 包装 saveXxx handler 的公共逻辑：assertPayloadSize → 增加计数 → saveJSON → 减少计数
// 6 个 saveXxx handler 共享此逻辑，避免重复代码
// try/finally 保证 saveJSON 抛异常时计数也能递减（saveJSON 内部已 try/catch，理论上不会抛）
function wrapSaveHandler(pathGetter, label) {
    return async (_event, data) => {
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
// 仅适用于"成功返回任意值、失败统一返回 {success:false, message}"的 handler
// 不适用于返回结构特殊的 handler（如 sync:list-backups 在失败时还要带 items:[]）
// async 包装保证 handler 内部 await 不会因同步 catch 漏接 Promise rejection
function tryWrap(fn) {
    return async (event, ...args) => {
        try {
            return await fn(event, ...args);
        } catch (e) {
            // 必须记录到日志，否则所有 IPC 业务异常被静默吞掉
            console.error('[IPC ERROR]', e);
            logger.appendLog('ERROR', ['[IPC ERROR]', e.stack || (e.name + ': ' + e.message)], 'main');
            return { success: false, message: e.message };
        }
    };
}

ipcMain.handle('notes:save', wrapSaveHandler(getNotesPath, '便签数据'));

// 归档便签数据（独立的 notes_archived.json，结构与 notes.json 相同）
ipcMain.handle('notes:load-archived', () => loadJSON(getArchivedNotesPath(), []));
ipcMain.handle('notes:save-archived', wrapSaveHandler(getArchivedNotesPath, '归档便签数据'));

// 垃圾桶便签数据（独立的 notes_trashed.json，结构相同，含 trashedAt 字段）
ipcMain.handle('notes:load-trashed', () => loadJSON(getTrashedNotesPath(), []));
ipcMain.handle('notes:save-trashed', wrapSaveHandler(getTrashedNotesPath, '回收站便签数据'));

// 聊天归档数据（独立的 chats_archived.json，结构与 aiChats 一致，含 archivedAt 字段）
ipcMain.handle('chat:load-archived', () => loadJSON(getArchivedChatsPath(), []));
ipcMain.handle('chat:save-archived', wrapSaveHandler(getArchivedChatsPath, '归档聊天数据'));

// 聊天垃圾桶数据（独立的 chats_trashed.json，结构相同，含 trashedAt 字段）
ipcMain.handle('chat:load-trashed', () => loadJSON(getTrashedChatsPath(), []));
ipcMain.handle('chat:save-trashed', wrapSaveHandler(getTrashedChatsPath, '回收站聊天数据'));

// 日历数据：日期↔闹钟映射，存入 calendar.json
// 结构：{ "2026-07-16": { alarms: [{h,m,s,label,sound,enabled}] } }
ipcMain.handle('calendar:load', () => loadJSON(getCalendarPath(), {}));
ipcMain.handle('calendar:save', wrapSaveHandler(getCalendarPath, '日历数据'));

/* ==================== 活跃度数据（热力图数据源） ====================
 * 结构：{ "YYYY-MM-DD": { note: <编辑次数>, todo: <勾选完成次数> } }
 * 向后兼容：旧数据没有 activity.json 时返回 {}，热力图按 0 活跃度渲染
 * 轻量策略：每次 +1 直接写盘（JSON 通常 <10KB，性能无忧）
 * ================================================================ */
// 活跃度内存缓存（避免每次 increment 都读盘）
let activityCache = null;
// 防抖写盘：连续编辑/勾选待办时合并写入，避免每次 +1 都触发一次磁盘 IO
// 窗口设为 1.5s：足够聚合连续操作，又不会在退出时丢失太多数据
let activityPersistTimer = null;
const ACTIVITY_PERSIST_DEBOUNCE_MS = 1500;
function loadActivity() {
    if (!activityCache) activityCache = loadJSON(getActivityPath(), {});
    return activityCache;
}
function persistActivity() {
    if (!activityCache) return;
    if (activityPersistTimer) clearTimeout(activityPersistTimer);
    activityPersistTimer = setTimeout(async () => {
        activityPersistTimer = null;
        try { await saveJSON(getActivityPath(), activityCache); }
        catch (e) { console.error('活跃度写盘失败:', e.message); }
    }, ACTIVITY_PERSIST_DEBOUNCE_MS);
}
// 同步刷盘：退出前调用，确保防抖窗口内的计数不丢失（用 saveJSONSync 避免异步未完成即退出）
function flushActivity() {
    if (activityPersistTimer) {
        clearTimeout(activityPersistTimer);
        activityPersistTimer = null;
    }
    if (activityCache) {
        try { saveJSONSync(getActivityPath(), activityCache); } catch (_) {}
    }
}

// 获取今日日期字符串 YYYY-MM-DD（本地时区）
function getTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

ipcMain.handle('activity:load', () => loadActivity());

/**
 * 给指定日期的指定类型计数 +1
 * @param {string} type - 'note'（便签编辑）或 'todo'（待办完成）
 * @param {string} [dateStr] - 日期字符串 YYYY-MM-DD，缺省为今天
 */
function incrementActivity(type, dateStr) {
    const key = dateStr || getTodayStr();
    const data = loadActivity();
    if (!data[key]) data[key] = { note: 0, todo: 0 };
    if (typeof data[key].note !== 'number') data[key].note = 0;
    if (typeof data[key].todo !== 'number') data[key].todo = 0;
    if (type === 'note') data[key].note += 1;
    else if (type === 'todo') data[key].todo += 1;
    persistActivity();
    return data[key];
}

// IPC：增计数。payload: { type: 'note'|'todo', date?: 'YYYY-MM-DD' }
ipcMain.handle('activity:increment', (_event, payload) => {
    const type = (payload && payload.type) || 'note';
    const dateStr = (payload && payload.date) || getTodayStr();
    return incrementActivity(type, dateStr);
});

// 设置（使用缓存）
ipcMain.handle('settings:load', () => {
    const s = loadSettings();
    return {
        bgColor: s.bgColor || null,
        detailFontSize: s.detailFontSize || null,
        alarmVolume: s.alarmVolume !== undefined ? s.alarmVolume : 100,
        launchAtLogin: !!(s.launchAtLogin),
        lockHash: s.lockHash || null,
        lockSalt: s.lockSalt || null
    };
});
ipcMain.handle('settings:save', (_event, settings) => {
    const s = loadSettings();
    s.bgColor = settings.bgColor || null;
    if (settings.detailFontSize !== undefined) s.detailFontSize = settings.detailFontSize;
    if (settings.alarmVolume !== undefined) s.alarmVolume = settings.alarmVolume;
    if (settings.launchAtLogin !== undefined) s.launchAtLogin = !!settings.launchAtLogin;
    return persistSettings();
});

/* ==================== 数据同步（S3 / WebDAV 上传备份） ====================
 * 设计：单向上传备份，不做双向同步
 * 备份文件：将 userData 下所有 .json 数据文件打包成 zip 后上传
 * 依赖：@aws-sdk/client-s3（S3 标准接口）+ 原生 https 模块（WebDAV PUT）
 * ================================================================ */

// 自动同步定时器
let autoSyncTimer = null;
// 自动同步防重入标志：避免上一次同步未结束时又启动下一次
let isSyncing = false;

/* ==================== 通用工具函数 ==================== */

// 去除字符串末尾的斜杠（统一处理 baseUrl 等场景）
function trimTrailingSlash(s) {
    return (s || '').trim().replace(/\/+$/, '');
}

// 同步凭据加解密（与 AI Key 一致的安全等级，避免明文落盘）
// label 参数用于错误消息中区分凭据类型（默认 '凭据'，AI Key 场景传 'API Key'）
async function encryptSecret(plain, label) {
    label = label || '凭据';
    if (!plain) return null;
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(plain).toString('base64');
    }
    throw new Error('系统加密服务不可用，' + label + '无法安全保存。请登录系统账户或使用支持加密的环境。');
}
async function decryptSecret(encrypted, label) {
    label = label || '凭据';
    if (!encrypted) return '';
    if (!safeStorage.isEncryptionAvailable()) {
        // 安全降级：加密服务不可用时绝不返回明文（无论旧版明文还是密文），
        // 强制用户重新输入凭据，避免明文凭据在不可信环境中流转
        throw new Error('系统加密服务不可用，无法解密' + label + '。请登录系统账户后重启软件，或重新输入' + label + '。');
    }
    try {
        return await safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (e) {
        // 解密失败可能是密文损坏或跨设备迁移，明确抛错让用户重新配置
        console.error(label + '解密失败：', e && e.message ? e.message : '未知错误');
        throw new Error(label + '解密失败：' + (e && e.message ? e.message : '未知错误') + '。请重新配置' + label + '。');
    }
}

/**
 * 凭据掩码：仅保留末尾 4 位用于界面识别，其余用圆点遮蔽。
 * 用于 sync:load-config / ai:load-config 回传给渲染进程时，避免明文凭据进入渲染进程内存。
 * @param {string} cred - 明文凭据
 * @returns {string} 掩码后的字符串（如 '••••1234'），空凭据返回空字符串
 */
function maskCred(cred) {
    if (!cred) return '';
    if (cred.length <= 4) return '••••';
    return '••••' + cred.slice(-4);
}

/**
 * 判断渲染进程回传的凭据是否为掩码占位（即用户未修改，应保留已保存的加密值）。
 * @param {string} value - 渲染进程回传的凭据值
 * @returns {boolean} true 表示是掩码占位，应保留原加密值
 */
function isMaskedCred(value) {
    return typeof value === 'string' && value.startsWith('••••');
}

// 统一构造 S3 客户端配置（uploadToS3 / testS3Connection 共用，避免重复）
function buildS3Config(config) {
    const endpoint = trimTrailingSlash(config.endpoint);
    const s3Config = {
        region: config.region || 'auto',
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey
        },
        forcePathStyle: true,  // 兼容 MinIO 等自建服务
        // 兼容 Cloudflare R2 等第三方 S3 服务，规避 AWS SDK v3 强制校验报错
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    };
    if (endpoint) s3Config.endpoint = endpoint;
    return s3Config;
}

// 统一构造 S3Client，避免 5 处 getS3Client(config) 重复
function getS3Client(config) {
    return new S3Client(buildS3Config(config));
}

// 公共 HTTP 请求工具（替代 uploadToWebdav / testWebdavConnection 各自内嵌的 sendRequest）
function sendHttpRequest(lib, opts, body) {
    return new Promise((res2, rej2) => {
        const r = lib.request(opts, (resp) => {
            let data = '';
            resp.on('data', (c) => data += c);
            resp.on('end', () => res2({
                statusCode: resp.statusCode,
                statusMessage: resp.statusMessage,
                body: data
            }));
        });
        r.on('error', (e) => rej2(e));
        r.on('timeout', () => { r.destroy(new Error('请求超时')); });
        if (body) r.write(body);
        r.end();
    });
}

// 统一从 HTTP 错误响应中提取可读信息（ai:generate / ai:chat 共用）
async function extractHttpError(resp) {
    let errMsg = 'HTTP ' + resp.status;
    try {
        const errJson = await resp.json();
        if (errJson.error && errJson.error.message) {
            errMsg += ': ' + errJson.error.message;
        } else {
            const text = await resp.text().catch(() => resp.statusText);
            errMsg += ': ' + text;
        }
    } catch (_) {
        const text = await resp.text().catch(() => '');
        errMsg += ': ' + (text || resp.statusText);
    }
    return errMsg;
}

// 包装 fetch：把底层网络错误转成用户能看懂的提示
async function safeFetch(url, options) {
    try {
        return await fetch(url, options);
    } catch (e) {
        const cause = (e.cause && e.cause.code) ? ('（' + e.cause.code + '）') : '';
        throw new Error('网络请求失败：' + (e.message || '无法连接到服务器') + cause);
    }
}

// 自动扫描 userData 下所有数据文件，新增数据文件无需改此函数
// 异步实现：用 fs.promises 避免在文件多/目录大时阻塞主进程 IPC 队列
async function getBackupFiles() {
    const dir = app.getPath('userData');
    let entries = [];
    try {
        entries = await fs.promises.readdir(dir);
    } catch (e) {
        console.error('扫描备份目录失败:', e.message);
        return [];
    }
    const candidates = entries
        .filter(name => name.endsWith('.json'))           // 只备份 JSON
        .filter(name => !name.endsWith('.tmp'))            // 排除原子写入临时文件
        .filter(name => !name.includes('.corrupt-'))       // 排除损坏备份
        .map(name => ({ name, path: path.join(dir, name) }));
    const result = [];
    for (const f of candidates) {
        try {
            const stat = await fs.promises.stat(f.path);
            if (stat.isFile()) result.push(f);
        } catch (_) { /* 忽略 stat 失败的文件 */ }
    }
    return result;
}

/**
 * 将所有数据文件打包为 zip，返回 Buffer（异步：用 fs.promises 避免阻塞主进程）
 * @returns {Promise<Buffer>} ZIP 数据
 * @throws  {Error} 当 userData 下没有任何可备份的 .json 文件时抛错
 */
async function createBackupZip() {
    const zip = new AdmZip();
    const files = await getBackupFiles();
    if (files.length === 0) throw new Error('没有可备份的数据文件');
    for (const f of files) {
        try {
            // 大小校验：跳过超过 200MB 的单个文件，避免把整个文件读进 RAM 导致 OOM
            const stat = await fs.promises.stat(f.path);
            if (stat.size > MAX_BACKUP_SIZE) {
                console.warn('跳过超大文件 ' + f.name + '（' + (stat.size/1024/1024).toFixed(1) + 'MB > 200MB 上限）');
                continue;
            }
            const content = await fs.promises.readFile(f.path);
            zip.addFile(f.name, content);
        } catch (e) {
            console.warn('跳过文件 ' + f.name + ':', e.message);
        }
    }
    // 添加备份元信息（不含本机路径，避免隐私泄露）
    const meta = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        fileCount: files.length,
        appVersion: app.getVersion()  // 用版本号代替路径，既方便排查又不泄露用户名
    };
    zip.addFile('_backup_meta.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf8'));
    return zip.toBuffer();
}

// 生成带时间戳的备份文件名
function getBackupFileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return '便签备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.zip';
}

// 规范化路径前缀：确保以 / 或空开头，以 / 结尾
function normalizePathPrefix(prefix) {
    if (!prefix) return '';
    let p = prefix.trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (!p.endsWith('/')) p = p + '/';
    return p;
}

// 拼接 WebDAV 完整路径，避免双斜杠，并对每段路径做 encodeURIComponent
// baseUrl: 末尾 / 已去除，形如 http://host:5005 或 http://host:5005/mydav
// pathPrefix: 已规范化，形如 /xxx/ 或 ''
// fileName: 可选，未 encode 的文件名
// 返回：规范化后的绝对 path（如 /mydav/xxx/file.zip，每段已 encode），URL 非法时返回 null
function joinWebdavPath(baseUrl, pathPrefix, fileName) {
    let urlObj;
    try {
        urlObj = new URL(baseUrl);
    } catch (e) {
        return null;
    }
    // baseUrl 的 pathname 末尾补 /（如 /mydav -> /mydav/）
    let path = urlObj.pathname;
    if (!path.endsWith('/')) path += '/';
    // pathPrefix 形如 /xxx/，去掉开头 / 避免与 path 末尾 / 重复
    // 每段分别 encode，避免整段 encode 把 / 也编码掉
    let prefix = pathPrefix || '';
    if (prefix.startsWith('/')) prefix = prefix.slice(1);
    if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
    if (prefix) {
        // 按 / 分段 encode，保留 / 作为路径分隔符
        const segs = prefix.split('/').map(s => s ? encodeURIComponent(s) : '');
        path += segs.join('/') + '/';
    } else {
        // prefix 为空时确保 path 已以 / 结尾（前面已处理）
    }
    if (fileName) path += encodeURIComponent(fileName);
    // 用 URL 对象再规范化一次，处理 ./.. 等异常，杜绝双斜杠
    try {
        const finalUrl = new URL(path, urlObj.origin + '/');
        return finalUrl.pathname;
    } catch (e) {
        return path;
    }
}

/**
 * S3 上传
 * @param {Object} config        - S3 配置
 * @param {Buffer} zipBuffer     - 待上传的 ZIP 数据
 * @param {string} fileName      - 文件名
 * @returns {Promise<{success: boolean, location: string}>}
 * @throws  {Error} 网络错误 / 权限不足 / bucket 不存在
 */
async function uploadToS3(config, zipBuffer, fileName) {
    const s3 = getS3Client(config);
    const pathPrefix = normalizePathPrefix(config.path);
    const key = (pathPrefix + fileName).replace(/^\//, ''); // S3 key 不以 / 开头

    const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: zipBuffer,
        ContentType: 'application/zip'
    });
    await s3.send(command);
    return { success: true, location: `s3://${config.bucket}/${key}` };
}

/**
 * S3 测试连接（通过 HeadBucket 检查 bucket 是否可访问）
 * @throws {Error} 当 bucket 不可访问时
 */
async function testS3Connection(config) {
    const s3 = getS3Client(config);
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true, message: '连接成功，存储桶可访问' };
}

/**
 * S3 列出备份文件
 * @returns {Promise<Array<{name:string, size:number, lastModified:string}>>}
 */
async function listS3Backups(config) {
    const s3 = getS3Client(config);
    const pathPrefix = normalizePathPrefix(config.path);
    const prefix = pathPrefix.replace(/^\//, '');
    const command = new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        MaxKeys: 1000
    });
    const data = await s3.send(command);
    const items = [];
    if (data.Contents) {
        for (const obj of data.Contents) {
            if (!obj.Key || !obj.Key.endsWith('.zip')) continue;
            // 只返回文件名（去掉路径前缀），方便前端展示与后续删除/下载
            const name = obj.Key.split('/').pop();
            items.push({
                name: name,
                key: obj.Key,
                size: obj.Size || 0,
                lastModified: obj.LastModified ? obj.LastModified.toISOString() : ''
            });
        }
    }
    // 按修改时间倒序（最新的在前）
    items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
    return items;
}

/**
 * S3 删除指定备份
 * @param {string} key - 完整的 S3 object key
 */
async function deleteS3Backup(config, key) {
    const s3 = getS3Client(config);
    // 路径校验：key 必须以 pathPrefix 开头，防止误删其他路径
    const pathPrefix = normalizePathPrefix(config.path).replace(/^\//, '');
    if (pathPrefix && !key.startsWith(pathPrefix)) {
        throw new Error('文件路径不在备份目录内，拒绝删除');
    }
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    return { success: true };
}

/**
 * S3 下载指定备份，返回 ZIP Buffer
 * @param {string} key - 完整的 S3 object key
 * @returns {Promise<Buffer>}
 */
async function downloadS3Backup(config, key) {
    const s3 = getS3Client(config);
    const pathPrefix = normalizePathPrefix(config.path).replace(/^\//, '');
    if (pathPrefix && !key.startsWith(pathPrefix)) {
        throw new Error('文件路径不在备份目录内，拒绝下载');
    }
    const data = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    // 大小上限校验：先看 S3 响应的 ContentLength，超 200MB 直接拒绝
    const contentLength = parseInt(data.ContentLength || '0', 10);
    if (contentLength > MAX_BACKUP_SIZE) {
        try { data.Body.destroy(); } catch (_) {}
        throw new Error(`备份文件过大（${(contentLength/1024/1024).toFixed(1)}MB），超过 200MB 上限`);
    }
    // SDK v3 Body 是 Readable 流，转成 Buffer；同时累计大小防 OOM
    const chunks = [];
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
        try { data.Body.destroy(); } catch (_) {}
        throw e;
    }
    return Buffer.concat(chunks);
}

// 重用 services/syncService.js 模块中导出的 WebDAV 工具函数，避免重复声明

// 重用 services/syncService.js 模块中导出的 webdavRequest 工具函数

/**
 * WebDAV 上传（HTTP PUT + Basic Auth）
 * 兼容自签发证书的 HTTPS 服务（如自建 NAS），自动用 MKCOL 创建目录。
 *
 * @param {Object}  config               - WebDAV 配置
 * @param {string}  config.url          - 服务地址，如 http://host:5005 或 http://host:5005/mydav
 * @param {string}  config.user         - 用户名
 * @param {string}  config.pass         - 密码
 * @param {string}  config.path         - 路径前缀，如 /WebDAV/
 * @param {boolean} [config.allowSelfSigned] - 是否允许自签证书，默认 false（校验证书）
 * @param {Buffer}  zipBuffer            - 待上传的 ZIP 数据
 * @param {string}  fileName            - 文件名（未 encode）
 *
 * @returns {Promise<{success: boolean, location: string}>}
 * @throws  {Error} 地址格式错误 / HTTP 状态码非 2xx / 网络超时
 */
function uploadToWebdav(config, zipBuffer, fileName) {
    const baseUrl = trimTrailingSlash(config.url);
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    const pathPrefix = normalizePathPrefix(config.path);

    // 用 joinWebdavPath 规范化目录路径与文件路径，避免双斜杠
    const dirPath = joinWebdavPath(baseUrl, pathPrefix);          // 如 /mydav/WebDAV/
    const filePath = joinWebdavPath(baseUrl, pathPrefix, fileName); // 如 /mydav/WebDAV/file.zip
    if (!dirPath || !filePath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }

    // 记录 MKCOL 阶段的错误信息，供最终 PUT 失败时附带，方便用户排错
    let mkcolError = null;

    // 步骤1：如果有路径前缀，先尝试 MKCOL 创建目录（已存在返回 405 视为成功）
    const mkcolPromise = pathPrefix
        ? webdavRequest(config, 'MKCOL', dirPath, { headers: { 'Authorization': 'Basic ' + auth }, timeoutMs: 15000 })
            .then((r) => {
                // 201 创建成功 / 405 方法不允许（目录已存在）/ 2xx 都视为目录可用
                if (r.statusCode === 201 || r.statusCode === 405 || (r.statusCode >= 200 && r.statusCode < 300)) {
                    return;  // 目录已就绪
                }
                const bodyStr = r.body.toString();
                mkcolError = `MKCOL 返回 ${r.statusCode}${bodyStr ? ': ' + bodyStr.slice(0, 200) : ''}`;
                console.warn('[WebDAV] ' + mkcolError + '，继续尝试 PUT 上传');
            })
            .catch((e) => {
                mkcolError = 'MKCOL 创建目录失败: ' + e.message;
                console.warn('[WebDAV] ' + mkcolError);
            })
        : Promise.resolve();

    // 步骤2：PUT 上传 ZIP 文件
    return mkcolPromise.then(() => {
        return webdavRequest(config, 'PUT', filePath, {
            headers: {
                'Authorization': 'Basic ' + auth,
                'Content-Type': 'application/zip',
                'Content-Length': zipBuffer.length
            },
            body: zipBuffer,
            timeoutMs: 30000
        });
    }).then((r) => {
        if (r.statusCode >= 200 && r.statusCode < 300) {
            return { success: true, location: baseUrl + filePath };
        }
        // PUT 失败时把 MKCOL 阶段的错误一并附上，方便用户排错
        const bodyStr = r.body.toString();
        const detail = mkcolError ? `（前置 MKCOL 阶段：${mkcolError}）` : '';
        throw new Error(`HTTP ${r.statusCode}: ${bodyStr || r.statusMessage}${detail}`);
    });
}

/**
 * WebDAV 测试连接（PROPFIND 检查目录是否存在/可访问）
 *
 * @param {Object}  config               - WebDAV 配置（同 uploadToWebdav）
 * @param {boolean} [config.allowSelfSigned] - 是否允许自签证书，默认 false
 * @returns {Promise<{success: boolean, message: string}>}
 */
function testWebdavConnection(config) {
    const baseUrl = trimTrailingSlash(config.url);
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    const pathPrefix = normalizePathPrefix(config.path);

    // 用 joinWebdavPath 拼接 baseUrl 与 pathPrefix，避免双斜杠
    const fullPath = joinWebdavPath(baseUrl, pathPrefix);
    if (!fullPath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }

    const body = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop/></propfind>';
    return webdavRequest(config, 'PROPFIND', fullPath, {
        headers: {
            'Authorization': 'Basic ' + auth,
            // 显式声明 Depth，部分 WebDAV 服务端（如 Nextcloud/某些 NAS）严格要求此头，缺失会返回 400
            'Depth': '1',
            'Content-Type': 'application/xml; charset=utf-8'
        },
        body: body,
        timeoutMs: 15000
    }).then((res) => {
        const sc = res.statusCode;
        if (sc === 207 || (sc >= 200 && sc < 300)) {
            return { success: true, message: '连接成功，WebDAV 服务可用' };
        } else if (sc === 401 || sc === 403) {
            throw new Error('认证失败（用户名或密码错误）');
        } else if (sc === 404) {
            // 404 既可能是目录不存在（可恢复），也可能是 URL 写错（不可恢复）
            // 保守提示，提醒用户用实际上传验证
            return {
                success: true,
                message: '收到 404 响应：服务可达，但目标目录不存在或 URL 路径错误。上传时会尝试自动创建目录。'
            };
        } else {
            throw new Error(`HTTP ${sc}: ${res.statusMessage || res.body.toString()}`);
        }
    });
}

/**
 * WebDAV 列出备份文件（PROPFIND Depth:1，解析 XML 提取 .zip 文件）
 * @returns {Promise<Array<{name:string, size:number, lastModified:string}>>}
 */
function listWebdavBackups(config) {
    const baseUrl = trimTrailingSlash(config.url);
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    const pathPrefix = normalizePathPrefix(config.path);

    const fullPath = joinWebdavPath(baseUrl, pathPrefix);
    if (!fullPath) {
        return Promise.reject(new Error('WebDAV 地址或路径格式错误，无法解析'));
    }

    const body = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getlastmodified/></prop></propfind>';
    return webdavRequest(config, 'PROPFIND', fullPath, {
        headers: {
            'Authorization': 'Basic ' + auth,
            'Depth': '1',
            'Content-Type': 'application/xml; charset=utf-8'
        },
        body: body,
        timeoutMs: 15000
    }).then((res) => {
        const sc = res.statusCode;
        const bodyStr = res.body.toString();
        if (sc !== 207 && !(sc >= 200 && sc < 300)) {
            throw new Error('列出备份失败：HTTP ' + sc + (bodyStr ? ': ' + bodyStr.slice(0, 200) : ''));
        }
        // 解析 WebDAV PROPFIND XML 响应（multistatus）
        // 注意：href 保留原始 encoded 形式（不 decode），直接用于后续 DELETE/GET 请求
        // 否则中文路径会因未 encode 导致 HTTP 400
        const items = [];
        // 匹配任意 namespace 前缀或无前缀的 <...response> 到 </...response>
        const responseBlocks = bodyStr.match(/<([^:>]+:)?response[\s>][\s\S]*?<\/([^:>]+:)?response>/gi) || [];
        for (const respBlock of responseBlocks) {
            const hrefMatch = /<([^:>]+:)?href[^>]*>([^<]+)<\/([^:>]+:)?href>/i.exec(respBlock);
            if (!hrefMatch) continue;
            const href = hrefMatch[2];  // 保留原始 encoded 形式
            // 检测 .zip 结尾时要考虑 encoded 后可能含 %2E 等情况，先 decode 再判断
            const decodedHref = decodeURIComponent(href);
            if (!decodedHref.endsWith('.zip')) continue;
            const name = decodedHref.split('/').pop();  // 显示用解码后的文件名
            if (!name) continue;
            const sizeMatch = /<([^:>]+:)?getcontentlength[^>]*>([^<]+)<\/([^:>]+:)?getcontentlength>/i.exec(respBlock);
            const modMatch = /<([^:>]+:)?getlastmodified[^>]*>([^<]+)<\/([^:>]+:)?getlastmodified>/i.exec(respBlock);
            items.push({
                name: name,         // 解码后的文件名（仅用于显示）
                href: href,         // 原始 encoded 形式（用于 DELETE/GET）
                size: sizeMatch ? parseInt(sizeMatch[2], 10) || 0 : 0,
                lastModified: modMatch ? modMatch[2] : ''
            });
        }
        // 按修改时间倒序
        items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
        return items;
    });
}

/**
 * WebDAV 删除指定备份（DELETE）
 * @param {string} href - 文件在服务器上的路径（已 encode 的 URL path）
 */
function deleteWebdavBackup(config, href) {
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    return webdavRequest(config, 'DELETE', href, {
        headers: { 'Authorization': 'Basic ' + auth },
        timeoutMs: 15000
    }).then((res) => {
        // 204 No Content / 200 OK 都视为删除成功
        if (res.statusCode === 204 || res.statusCode === 200 || (res.statusCode >= 200 && res.statusCode < 300)) {
            return { success: true };
        } else if (res.statusCode === 404) {
            // 文件不存在也算成功（幂等删除）
            return { success: true };
        } else {
            const bodyStr = res.body.toString();
            throw new Error('删除失败：HTTP ' + res.statusCode + (bodyStr ? ': ' + bodyStr.slice(0, 200) : ''));
        }
    });
}

/**
 * WebDAV 下载指定备份（GET），返回 ZIP Buffer
 * @param {string} href - 文件在服务器上的路径（已 encode 的 URL path）
 * @returns {Promise<Buffer>}
 */
function downloadWebdavBackup(config, href) {
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    // maxSize 由 webdavRequest 内部校验：先看 Content-Length，下载过程中累计超限也会中断
    return webdavRequest(config, 'GET', href, {
        headers: { 'Authorization': 'Basic ' + auth },
        timeoutMs: 60000,
        maxSize: MAX_BACKUP_SIZE
    }).then((res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            return res.body;
        }
        throw new Error('下载失败：HTTP ' + res.statusCode);
    });
}

/* ==================== Provider 注册表 ====================
 * 每个 provider 自描述「标签 / 必填字段 / 取配置 / 测试 / 上传 / 列出 / 删除 / 下载」
 * 新增 provider（如 OneDrive）只需在此处加一项，performSync / sync:test 等无需改动
 * 注意：getConfig 为 async，负责把加密凭据（*Enc 后缀）解密为明文，
 *       供 test/upload 直接使用；非凭据字段保持原样。
 * ================================================================= */
const providers = {
    s3: {
        label: 'S3',
        requiredFields: ['endpoint', 'region', 'bucket', 'accessKey', 'secretKey'],
        getConfig: async (syncConfig) => {
            const raw = syncConfig.s3 || {};
            // 解密凭据；旧版明文兼容（*Enc 缺失时回退明文字段）
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
        test: (config) => testS3Connection(config),
        upload: (config, buf, name) => uploadToS3(config, buf, name),
        listBackups: (config) => listS3Backups(config),
        deleteBackup: (config, id) => deleteS3Backup(config, id),   // id = S3 object key
        downloadBackup: (config, id) => downloadS3Backup(config, id)
    },
    webdav: {
        label: 'WebDAV',
        requiredFields: ['url', 'user', 'pass'],
        getConfig: async (syncConfig) => {
            const raw = syncConfig.webdav || {};
            const pass = (await decryptSecret(raw.passEnc)) || raw.pass || '';
            return {
                url: raw.url || '',
                user: raw.user || '',
                pass,
                path: raw.path || '',
                allowSelfSigned: !!raw.allowSelfSigned
            };
        },
        test: (config) => testWebdavConnection(config),
        upload: (config, buf, name) => uploadToWebdav(config, buf, name),
        listBackups: (config) => listWebdavBackups(config),
        deleteBackup: (config, id) => deleteWebdavBackup(config, id),   // id = WebDAV href
        downloadBackup: (config, id) => downloadWebdavBackup(config, id)
    }
    // 未来新增 provider 示例：
    // onedrive: { label: 'OneDrive', requiredFields: [...], test: ..., upload: ... }
};

/**
 * 执行一次同步上传（根据当前配置）
 * 关键顺序：防重入 → 校验配置 → 打包 ZIP → 上传，避免配置不全时白白消耗 CPU 打包
 *
 * isSyncing 防重入提升到 performSync 内部，确保手动上传(sync:upload)与自动上传
 * 都受同一把锁保护，避免并发上传叠加导致 ZIP 损坏或凭据竞争。
 *
 * @param {string} providerKey - 's3' 或 'webdav'
 * @returns {Promise<{provider: string, fileName: string, size: number, location: string}>}
 * @throws  {Error} 正在同步中 / 未知的 provider / 未配置 / 配置不完整 / 上传失败
 */
async function performSync(providerKey) {
    // 防重入：手动上传与自动上传共用此锁
    if (isSyncing) throw new Error('正在同步中，请稍后再试');
    isSyncing = true;

    let targetConfig = null;
    try {
        const provider = providers[providerKey];
        if (!provider) throw new Error('未知的同步方式：' + providerKey);

        const s = loadSettings();
        const syncConfig = s.syncConfig || {};
        targetConfig = await provider.getConfig(syncConfig);
        if (!targetConfig) throw new Error('未配置同步信息');

        // 先校验配置：避免配置不全时白白浪费 CPU 打包
        for (const k of provider.requiredFields) {
            if (!targetConfig[k]) throw new Error(`${provider.label} 配置不完整：缺少 ${k}`);
        }

        // 配置 OK 后再打包（异步：避免大文件读取阻塞主进程）
        const zipBuffer = await createBackupZip();
        const fileName = getBackupFileName();

        const result = await provider.upload(targetConfig, zipBuffer, fileName);
        return { provider: provider.label, fileName, size: zipBuffer.length, location: result.location };
    } finally {
        // 主动清除明文凭据引用，缩短密码在内存中的留存时间，降低被内存转储泄露的风险
        if (targetConfig) {
            targetConfig.pass = null;
            targetConfig.secretKey = null;
            targetConfig.accessKey = null;
            targetConfig.user = null;
        }
        // 释放 isSyncing 锁，确保即使上传失败也能重新触发
        isSyncing = false;
    }
}

// 自动同步调度（防重入已由 performSync 内部处理，此处只需捕获"正在同步"错误跳过）
function scheduleAutoSync() {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    const s = loadSettings();
    const syncConfig = s.syncConfig || {};
    if (!syncConfig.autoSync || !syncConfig.autoSyncProvider) return;
    const intervalMin = syncConfig.autoSyncInterval || 30;
    const intervalMs = intervalMin * 60 * 1000;
    autoSyncTimer = setInterval(async () => {
        try {
            const result = await performSync(syncConfig.autoSyncProvider);
            console.log('[自动同步] 成功:', result.fileName);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sync:auto-result', {
                    success: true,
                    message: `自动同步成功：${result.fileName}（${(result.size / 1024).toFixed(1)} KB）`
                });
            }
        } catch (e) {
            // "正在同步中"属于预期行为（手动上传进行时自动触发撞锁），静默跳过
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

// 同步配置：保存/加载（凭据加密存储，掩码回传，避免明文进入渲染进程）
ipcMain.handle('sync:load-config', async () => {
    const s = loadSettings();
    const cfg = s.syncConfig || {};
    const s3Raw = cfg.s3 || {};
    const webdavRaw = cfg.webdav || {};
    // 凭据解密后掩码化回传渲染进程，避免明文凭据进入渲染进程内存（防 DevTools 窥探 / XSS 泄露）
    // 解密失败时（safeStorage 不可用）返回空，前端提示用户重新输入
    let s3AccessKey = '', s3SecretKey = '', webdavPass = '';
    try { s3AccessKey = await decryptSecret(s3Raw.accessKeyEnc); } catch (_) {}
    try { s3SecretKey = await decryptSecret(s3Raw.secretKeyEnc); } catch (_) {}
    try { webdavPass = await decryptSecret(webdavRaw.passEnc); } catch (_) {}
    // 旧版明文兼容：加密字段缺失但存在旧版明文字段，掩码化后回传并标记 legacyPlaintext
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
            allowSelfSigned: !!webdavRaw.allowSelfSigned
        },
        autoSync: cfg.autoSync || false,
        autoSyncInterval: cfg.autoSyncInterval || 30,
        autoSyncProvider: cfg.autoSyncProvider || 's3',
        // 旧版明文凭据检测：前端据此清空密码框并提示重新输入，保存时自动加密落盘
        legacyPlaintext: legacyS3 || legacyWebdav
    };
});

ipcMain.handle('sync:save-config', async (_event, data) => {
    const s = loadSettings();
    const oldSyncConfig = s.syncConfig || {};
    const oldS3 = oldSyncConfig.s3 || {};
    const oldWebdav = oldSyncConfig.webdav || {};
    const s3Config = data.s3 || {};
    const webdavConfig = data.webdav || {};
    // 凭据掩码处理：若渲染进程回传的是掩码占位（用户未修改），保留已保存的加密值；
    // 否则加密新值覆盖。避免掩码字符串被当真实密码加密落盘
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
            allowSelfSigned: !!webdavConfig.allowSelfSigned
        },
        autoSync: !!data.autoSync,
        autoSyncInterval: data.autoSyncInterval || 30,
        autoSyncProvider: data.autoSyncProvider || 's3'
    };
    const r = persistSettings();
    scheduleAutoSync();  // 重新调度
    return r;
});

// 同步测试：用 providers 注册表统一分发，新增 provider 无需改这里
// 若凭据为掩码占位（用户未修改），从磁盘读取已保存的加密值解密后使用
ipcMain.handle('sync:test', tryWrap(async (_event, providerKey, config) => {
    const provider = providers[providerKey];
    if (!provider) return { success: false, message: '未知的同步方式：' + providerKey };
    // 掩码占位 → 从磁盘解密读取真实凭据，避免渲染进程回传明文
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

ipcMain.handle('sync:upload', tryWrap(async (_event, provider) => {
    const result = await performSync(provider);
    return { success: true, message: `上传成功：${result.fileName}（${(result.size / 1024).toFixed(1)} KB）→ ${result.location}`, data: result };
}));

/**
 * 列出指定 provider 上的现有备份文件
 * 返回 [{name, id, size, lastModified}]（id 为 S3 key 或 WebDAV href，供删除/下载用）
 */
ipcMain.handle('sync:list-backups', async (_event, providerKey) => {
    try {
        const provider = providers[providerKey];
        if (!provider || !provider.listBackups) throw new Error('该同步方式不支持列出备份');
        const s = loadSettings();
        const syncConfig = s.syncConfig || {};
        const config = await provider.getConfig(syncConfig);
        if (!config) throw new Error('未配置同步信息');
        // 校验必填字段，避免凭据为空时白跑一趟
        for (const k of provider.requiredFields) {
            if (!config[k]) throw new Error(`${provider.label} 配置不完整：缺少 ${k}`);
        }
        const items = await provider.listBackups(config);
        // 统一字段名：前端用 id 标识文件（S3=key, WebDAV=href）
        return {
            success: true,
            items: items.map(it => ({
                name: it.name,
                id: it.key || it.href || it.name,
                size: it.size || 0,
                lastModified: it.lastModified || ''
            }))
        };
    } catch (e) {
        return { success: false, message: e.message, items: [] };
    }
});

/**
 * 删除指定 provider 上的一个备份文件
 * @param {string} providerKey - 's3' 或 'webdav'
 * @param {string} fileId - S3 key 或 WebDAV href
 */
ipcMain.handle('sync:delete-backup', tryWrap(async (_event, providerKey, fileId) => {
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

/**
 * 恢复备份：从指定 provider 下载一个备份 ZIP，解压覆盖到 userData 目录
 * @param {string} providerKey - 's3' 或 'webdav'
 * @param {string} fileId - S3 key 或 WebDAV href
 * @returns {Promise<{success:boolean, message:string, restoredFiles?:number}>}
 */
ipcMain.handle('sync:restore-backup', tryWrap(async (_event, providerKey, fileId) => {
    const provider = providers[providerKey];
    if (!provider || !provider.downloadBackup) throw new Error('该同步方式不支持恢复备份');
    if (!fileId) throw new Error('未指定要恢复的文件');
    const s = loadSettings();
    const syncConfig = s.syncConfig || {};
    const config = await provider.getConfig(syncConfig);
    if (!config) throw new Error('未配置同步信息');

    // 1. 下载 ZIP
    const zipBuffer = await provider.downloadBackup(config, fileId);

    // 2. 解压到 userData（覆盖现有文件）
    const zip = new AdmZip(zipBuffer);
    const userDataDir = app.getPath('userData');
    let restoredCount = 0;
    const entries = zip.getEntries();
    for (const entry of entries) {
        // 跳过目录条目和元信息文件
        if (entry.isDirectory) continue;
        if (entry.entryName === '_backup_meta.json') continue;
        // 安全：只解压 .json 数据文件，防止 zip slip 攻击（路径穿越）
        if (!entry.entryName.endsWith('.json')) continue;
        // 防 Zip Slip：仅取 basename 落地到 userData，避免恶意 ZIP 通过 ../ 写入任意路径
        const baseName = path.basename(entry.entryName);
        if (!baseName) { continue; }  // 跳过纯目录条目
        // 安全：禁止恢复 settings.json，防止恶意备份覆盖 PIN 哈希/同步凭据/API Key
        // settings.json 含 lockHash/lockSalt/syncConfig/aiConfig，被替换后 PIN 锁失效、数据流向攻击者
        if (baseName === 'settings.json') continue;
        const targetPath = path.join(userDataDir, baseName);
        fs.writeFileSync(targetPath, entry.getData());
        restoredCount++;
    }

    // 3. 失效设置缓存（恢复的 settings.json 已覆盖磁盘上的旧版，避免读到陈旧缓存）
    settingsCache = null;

    // 4. 通知渲染进程重载数据
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync:restore-done', { restoredFiles: restoredCount });
    }

    return { success: true, message: `恢复成功，共还原 ${restoredCount} 个数据文件。软件将刷新数据。`, restoredFiles: restoredCount };
}));

// 窗口控制（最小化即隐藏到托盘）
ipcMain.handle('window:minimize', () => {
    if (!mainWindow) return;
    mainWindow.hide();
});
ipcMain.handle('window:close', () => { app.quit(); });

// 闹钟响铃时由渲染进程调用：把窗口从托盘恢复并置顶一下，确保用户能听到铃声并看到提示
// （即使窗口原本被 hide() 到托盘，也会被重新 show + focus，避免错过闹钟）
ipcMain.handle('alarm:show-window', () => {
    try {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    } catch (_) { /* 忽略 */ }
});

// 窗口最大化/还原切换
ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
    } else {
        mainWindow.maximize();
        return true;
    }
});

// 窗口缩放（右下角手柄）
ipcMain.handle('window:resize', (_event, w, h) => {
    if (!mainWindow) return;
    // 数值校验：防 NaN/Infinity/字符串导致 setBounds 异常
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    const width = Math.max(600, Math.round(w));
    const height = Math.max(400, Math.round(h));
    mainWindow.setBounds({
        width,
        height,
        x: mainWindow.getPosition()[0],
        y: mainWindow.getPosition()[1],
    });
});

/* ==================== 软件锁（4 位 PIN + scrypt 哈希） ====================
 * 安全设计：
 * 1. PIN 不明文存储，使用 Node.js 内置 crypto.scryptSync 生成 64 字节哈希
 * 2. 每个用户配一个随机 16 字节 salt（防彩虹表）
 * 3. 哈希+salt 经 safeStorage 二次加密后存到 settings.json（防文件被复制后离线破解）
 * 4. 锁屏覆盖层由渲染进程实现，主进程只负责密码校验
 * 5. 输错 5 次后强制冷却 30 秒（防暴力破解）
 * ================================================================ */
const LOCK_MAX_ATTEMPTS = 5;
const LOCK_COOLDOWN_MS = 30000;
let lockFailCount = 0;
let lockCooldownUntil = 0;
let lockStateLoaded = false;  // 标记是否已从磁盘加载锁定状态（懒加载）

// 持久化锁定状态到 settings.json：防止重启进程后暴力破解计数被清零
// 攻击者若能通过任务管理器杀进程重置计数，5 次限制形同虚设
function loadLockState() {
    try {
        const s = loadSettings();
        lockFailCount = Number(s.lockFailCount) || 0;
        lockCooldownUntil = Number(s.lockCooldownUntil) || 0;
        // 冷却期已过则清零，避免遗留状态误判
        if (lockCooldownUntil && Date.now() > lockCooldownUntil) {
            lockFailCount = 0;
            lockCooldownUntil = 0;
            delete s.lockFailCount;
            delete s.lockCooldownUntil;
            persistSettings();
        }
    } catch (_) { /* 读取失败保持默认 0，不阻断解锁流程 */ }
}
function persistLockState() {
    try {
        const s = loadSettings();
        if (lockFailCount > 0) s.lockFailCount = lockFailCount;
        else delete s.lockFailCount;
        if (lockCooldownUntil > Date.now()) s.lockCooldownUntil = lockCooldownUntil;
        else delete s.lockCooldownUntil;
        persistSettings();
    } catch (_) { /* 持久化失败不影响内存计数 */ }
}

/**
 * 生成 PIN 的 scrypt 哈希（带随机 salt）
 * 异步版本：避免 scryptSync 阻塞事件循环（默认参数约 100ms）
 * @param {string} pin - 4 位 PIN
 * @returns {Promise<{hash:string, salt:string}>} base64 编码的 hash 和 salt
 */
async function hashPin(pin) {
    const salt = crypto.randomBytes(16);
    const hash = await new Promise((resolve, reject) => {
        crypto.scrypt(pin, salt, 64, (err, key) => err ? reject(err) : resolve(key));
    });
    return {
        hash: hash.toString('base64'),
        salt: salt.toString('base64')
    };
}

/**
 * 校验 PIN 是否正确
 * 异步版本：避免 scryptSync 阻塞事件循环
 * @param {string} pin - 用户输入的 4 位 PIN
 * @param {string} savedHashBase64 - 已保存的哈希（base64）
 * @param {string} savedSaltBase64 - 已保存的 salt（base64）
 * @returns {Promise<boolean>}
 */
async function verifyPin(pin, savedHashBase64, savedSaltBase64) {
    try {
        const salt = Buffer.from(savedSaltBase64, 'base64');
        const expected = Buffer.from(savedHashBase64, 'base64');
        const actual = await new Promise((resolve, reject) => {
            crypto.scrypt(pin, salt, 64, (err, key) => err ? reject(err) : resolve(key));
        });
        // 用 timingSafeEqual 防计时攻击
        if (actual.length !== expected.length) return false;
        return crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

// 设置 PIN（首次设置或修改 PIN）
// 哈希+salt 经 safeStorage 加密后落盘，避免直接被文件读取
ipcMain.handle('lock:set-pin', async (_event, pin) => {
    if (!pin || !/^\d{4}$/.test(pin)) {
        return { success: false, message: 'PIN 必须为 4 位数字' };
    }
    const { hash, salt } = await hashPin(pin);
    // 安全降级：safeStorage 不可用时绝不落盘，避免明文 hash 被离线爆破
    // 4 位 PIN 只有 1 万种组合，一旦明文 hash 泄露几秒就能爆破完
    if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, message: '系统加密服务不可用，无法安全保存 PIN。请登录系统账户后重试。' };
    }
    let encHash, encSalt;
    try {
        encHash = safeStorage.encryptString(hash).toString('base64');
        encSalt = safeStorage.encryptString(salt).toString('base64');
    } catch (e) {
        return { success: false, message: '加密失败：' + e.message };
    }
    const s = loadSettings();
    s.lockHash = encHash;
    s.lockSalt = encSalt;
    persistSettings();
    return { success: true, message: 'PIN 已设置' };
});

// 校验 PIN（用于解锁）
// 返回 {success, message, cooldownRemain?}
ipcMain.handle('lock:verify-pin', async (_event, pin) => {
    // 启动时加载持久化的锁定状态（仅首次）
    if (!lockStateLoaded) { loadLockState(); lockStateLoaded = true; }
    // 冷却期内直接拒绝
    const now = Date.now();
    if (now < lockCooldownUntil) {
        const remain = Math.ceil((lockCooldownUntil - now) / 1000);
        return { success: false, message: `输错次数过多，请 ${remain} 秒后再试`, cooldownRemain: remain };
    }
    const s = loadSettings();
    if (!s.lockHash || !s.lockSalt) {
        return { success: false, message: '尚未设置 PIN' };
    }
    // safeStorage 不可用时拒绝校验：避免明文 hash 被直接读出后离线爆破
    if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, message: '系统加密服务不可用，无法安全校验 PIN。请登录系统账户后重试。' };
    }
    // 解密哈希和 salt
    let plainHash, plainSalt;
    try {
        plainHash = safeStorage.decryptString(Buffer.from(s.lockHash, 'base64'));
        plainSalt = safeStorage.decryptString(Buffer.from(s.lockSalt, 'base64'));
    } catch (e) {
        return { success: false, message: 'PIN 解密失败，请重新设置' };
    }
    if (await verifyPin(pin || '', plainHash, plainSalt)) {
        lockFailCount = 0;
        persistLockState();
        return { success: true, message: '解锁成功' };
    } else {
        lockFailCount++;
        if (lockFailCount >= LOCK_MAX_ATTEMPTS) {
            lockCooldownUntil = Date.now() + LOCK_COOLDOWN_MS;
            lockFailCount = 0;
            persistLockState();
            return { success: false, message: `连续输错 ${LOCK_MAX_ATTEMPTS} 次，请等待 30 秒后再试`, cooldownRemain: 30 };
        }
        persistLockState();
        const left = LOCK_MAX_ATTEMPTS - lockFailCount;
        return { success: false, message: `PIN 错误，还剩 ${left} 次机会` };
    }
});

// 查询是否已设置 PIN
ipcMain.handle('lock:has-pin', () => {
    const s = loadSettings();
    return !!(s.lockHash && s.lockSalt);
});

// 清除 PIN（修改 PIN 时先清除再设置，或遗忘时手动清空 settings.json）
ipcMain.handle('lock:clear-pin', () => {
    const s = loadSettings();
    delete s.lockHash;
    delete s.lockSalt;
    delete s.lockFailCount;
    delete s.lockCooldownUntil;
    persistSettings();
    lockFailCount = 0;
    lockCooldownUntil = 0;
    lockStateLoaded = true;
    return { success: true };
});

/* ==================== 开机启动 ====================
 * 使用 Electron 官方 API app.setLoginItemSettings
 * - 不写注册表（macOS 用 LSSharedFileList，Windows 用 RegisterApplicationRestart/注册表）
 * - args: ['--hidden'] 让开机启动时隐藏到托盘，不打扰用户
 * - 跨平台兼容，无需新增 npm 依赖
 * ============================================================ */
ipcMain.handle('startup:set', tryWrap((_event, open) => {
    app.setLoginItemSettings({
        openAtLogin: !!open,
        args: ['--hidden']
    });
    return { success: true, open: !!open };
}));

ipcMain.handle('startup:get', () => {
    try {
        const settings = app.getLoginItemSettings();
        return !!(settings && settings.openAtLogin);
    } catch (_) {
        return false;
    }
});

/* ==================== 导出聊天会话为 Markdown 文件 ====================
 * 弹出系统保存对话框，让用户选择本地文件夹保存
 * 文件名格式：会话标题_YYYYMMDD-HHmmss.md
 * 安全：使用 dialog.showSaveDialog，避免直接写任意路径
 * ============================================================ */
ipcMain.handle('chat:export-markdown', tryWrap(async (_event, { title, content }) => {
    // 入口大小校验：防恶意渲染进程发送超大 content 导致 writeFileSync 撑爆磁盘/内存
    assertPayloadSize(content, MAX_IPC_PAYLOAD_SIZE, '导出内容');
    // 文件名安全化：去掉 Windows 非法字符
    const safeTitle = (title || 'AI会话').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
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
    fs.writeFileSync(result.filePath, content || '', 'utf8');
    return { success: true, filePath: result.filePath };
}));

/* ==================== 剪贴板：写入文本 ============================ */
ipcMain.handle('clipboard:write-text', (_event, text) => {
    try {
        if (typeof text !== 'string') return false;
        // 大小校验：防止超大文本撑爆剪贴板（上限 1MB）
        if (text.length > MAX_CLIPBOARD_TEXT_SIZE) return false;
        clipboard.writeText(text);
        return true;
    } catch (_) {
        return false;
    }
});

/* ==================== 剪贴板：写入图片 ============================ */
ipcMain.handle('clipboard:write-image', (_event, dataUrl) => {
    try {
        if (!dataUrl || typeof dataUrl !== 'string') return false;
        // 大小校验：防止超大 dataUrl 撑爆内存
        if (dataUrl.length > MAX_IMAGE_SIZE * 1.4) return false;
        const img = nativeImage.createFromDataURL(dataUrl);
        if (img.isEmpty()) return false;
        clipboard.writeImage(img);
        return true;
    } catch (_) {
        return false;
    }
});

/* ==================== 便签历史版本快照（后悔药） ====================
 * 设计目标：每次自动保存时在后台悄悄为每条便签保留最近若干历史版本
 * - 每条便签保留最近 10 个快照（仅计未锁定的；锁定的版本不计入滚动名额）
 * - 同一条便签 60 秒内只生成一次快照（避免连续输入导致爆炸）
 * - 锁定的版本永远不会被滚动覆盖，相当于永久保险
 * - 存储位置：userData/note_history/{noteId}.json
 * - 文件结构：[{ ts, content, locked?:boolean }, ...]
 * ============================================================ */
const HISTORY_DIR = path.join(app.getPath('userData'), 'note_history');
const HISTORY_MAX_PER_NOTE = 10;
const HISTORY_MIN_INTERVAL_MS = 60 * 1000;  // 同条便签 60s 内只生成一次快照

function ensureHistoryDir() {
    try {
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    } catch (_) {}
}

function getHistoryFilePath(noteId) {
    // 白名单校验：noteId 只允许数字（兼容 Date.now() 和数字字符串）
    // 防止恶意 noteId 含 ../ 之类字符造成路径穿越，写入 HISTORY_DIR 之外
    if (!/^\d+$/.test(String(noteId))) {
        throw new Error('非法的 noteId');
    }
    const fp = path.join(HISTORY_DIR, `note_${noteId}.json`);
    // 双重保险：确认最终路径仍在 HISTORY_DIR 内，防止路径穿越
    if (!fp.startsWith(HISTORY_DIR + path.sep)) {
        throw new Error('路径越界');
    }
    return fp;
}

/**
 * 读取某条便签的历史快照列表
 * @param {string|number} noteId
 * @returns {Array<{ts:number, content:string, locked?:boolean}>}
 */
function readNoteHistory(noteId) {
    try {
        const fp = getHistoryFilePath(noteId);
        if (!fs.existsSync(fp)) return [];
        const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (!Array.isArray(data)) return [];
        return data;
    } catch (_) {
        return [];
    }
}

/**
 * 写入某条便签的历史快照列表
 */
function writeNoteHistory(noteId, history) {
    try {
        ensureHistoryDir();
        const fp = getHistoryFilePath(noteId);
        fs.writeFileSync(fp, JSON.stringify(history), 'utf8');
    } catch (_) {}
}

// 渲染进程调用：保存便签时顺便生成快照（满足时间间隔条件才生成）
ipcMain.handle('note-history:snapshot', (_event, { noteId, content }) => {
    if (!noteId || content === undefined || content === null) return { saved: false };
    try {
        const history = readNoteHistory(noteId);
        const nowTs = Date.now();
        // 60 秒内已生成过快照则跳过（只看最后一个未锁定的）
        const lastUnlocked = [...history].reverse().find(h => !h.locked);
        if (lastUnlocked && (nowTs - lastUnlocked.ts) < HISTORY_MIN_INTERVAL_MS) {
            return { saved: false, reason: 'too-frequent' };
        }
        // 内容与最后一个未锁定的快照相同则跳过
        if (lastUnlocked && lastUnlocked.content === content) {
            return { saved: false, reason: 'unchanged' };
        }
        history.push({ ts: nowTs, content: String(content), locked: false });
        // 滚动清理：只清理未锁定的旧快照，保留最近 HISTORY_MAX_PER_NOTE 个未锁定的
        // 锁定的版本永远保留，不计入名额
        const unlocked = history.filter(h => !h.locked);
        const locked = history.filter(h => h.locked);
        if (unlocked.length > HISTORY_MAX_PER_NOTE) {
            // 按时间排序，保留最新的 N 个未锁定
            unlocked.sort((a, b) => a.ts - b.ts);
            const keepUnlocked = unlocked.slice(unlocked.length - HISTORY_MAX_PER_NOTE);
            // 重组：锁定的 + 保留的未锁定，按时间顺序
            const newHistory = [...locked, ...keepUnlocked].sort((a, b) => a.ts - b.ts);
            writeNoteHistory(noteId, newHistory);
        } else {
            writeNoteHistory(noteId, history);
        }
        return { saved: true };
    } catch (e) {
        return { saved: false, message: e.message };
    }
});

// 读取某条便签的历史快照列表
ipcMain.handle('note-history:list', (_event, noteId) => {
    return readNoteHistory(noteId);
});

// 删除某条便签的所有历史快照（便签被删除时调用）
ipcMain.handle('note-history:clear', (_event, noteId) => {
    try {
        const fp = getHistoryFilePath(noteId);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        return true;
    } catch (_) {
        return false;
    }
});

// 切换某条历史快照的锁死状态（图钉/锁头）
// 参数：{ noteId, ts } - 用 ts 作为快照的唯一标识
ipcMain.handle('note-history:toggle-lock', tryWrap((_event, { noteId, ts }) => {
    if (!noteId || ts === undefined || ts === null) return { success: false };
    const history = readNoteHistory(noteId);
    const item = history.find(h => h.ts === ts);
    if (!item) return { success: false, message: '快照不存在' };
    item.locked = !item.locked;
    writeNoteHistory(noteId, history);
    return { success: true, locked: !!item.locked };
}));

// 置顶
ipcMain.handle('toggle-pin', () => {
    if (!mainWindow) return false;
    isPinned = !isPinned;
    mainWindow.setAlwaysOnTop(isPinned, 'normal');
    mainWindow.webContents.send('pin-changed', isPinned);
    return isPinned;
});
ipcMain.handle('get-pin-state', () => isPinned);

// 窗口固定
ipcMain.handle('toggle-fixed', () => {
    if (!mainWindow) return false;
    isFixed = !isFixed;
    try { mainWindow.setMovable(!isFixed); } catch(_) {}
    mainWindow.webContents.send('fixed-changed', isFixed);
    return isFixed;
});
ipcMain.handle('get-fixed-state', () => isFixed);

/* ==================== AI 配置 ==================== */

/**
 * 统一包装：解密 API Key → 执行业务回调 → 出作用域自动 GC 释放明文引用
 * 替代原先 7 处 `let apiKey = await decryptSecret(...); try { ... } finally { apiKey = null; }` 模式
 *
 * @param {() => Promise<string>} keyResolver - 异步返回解密后的明文 key
 *        单 key 站点：() => decryptSecret(cfg.encryptedKey, 'API Key')
 *        多 key fallback 站点：在 resolver 内部完成回退逻辑后 return
 * @param {(apiKey: string) => Promise<*>} fn - 业务回调，入参为明文 key
 * @returns {*} fn 的返回值
 *
 * 安全说明：原代码用 finally { apiKey = null } 手动清引用，改用闭包后由 V8 GC 在
 * withDecryptedKey 返回时回收 key 常量。key 作为 const 局部变量，fn 返回后不再被任何
 * 闭包捕获，即可被 GC。即便 keyResolver 或 fn 抛错，key 也会随包装函数出栈而被 GC，
 * 比原代码（throw 发生在 try 外时 finally 不执行）覆盖更彻底。
 */
async function withDecryptedKey(keyResolver, fn) {
    const key = await keyResolver();
    try {
        return await fn(key);
    } finally {
        /* key 出作用域自动 GC：不保留任何对明文的引用 */
    }
}

// 保存 AI 配置
ipcMain.handle('ai:save-config', async (_event, config) => {
    const s = loadSettings();
    if (!s.aiConfig) s.aiConfig = {};
    // SSRF 防护：baseUrl 必须是 http/https 协议，拒绝 file:/data:/javascript: 等危险协议
    // 防止 XSS 篡改 baseUrl 后，后续 AI 请求的 Authorization Header（含明文 API Key）被发往攻击者服务器
    validateAiBaseUrl(config.baseUrl, 'AI API 地址');
    const oldEncryptedKey = s.aiConfig.encryptedKey;  // 先保存旧值，避免被覆盖后丢失
    s.aiConfig.baseUrl = config.baseUrl || '';
    // 若 apiKey 为掩码占位（用户未修改），保留已保存的加密值；否则加密新值
    s.aiConfig.encryptedKey = isMaskedCred(config.apiKey) ? oldEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
    s.aiConfig.model = config.model || '';
    s.aiConfig.temperature = config.temperature ?? 1;
    s.aiConfig.prompt = config.prompt || '';
    return persistSettings();
});

// 加载 AI 配置（apiKey 掩码化回传，避免明文进入渲染进程）
ipcMain.handle('ai:load-config', async () => {
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    let apiKey = '';
    try { apiKey = maskCred(await decryptSecret(cfg.encryptedKey, 'API Key')); } catch (e) {
        // 解密失败（safeStorage 不可用等）：返回空，前端提示用户重新输入
        console.error('加载 API Key 失败:', e.message);
    }
    return {
        baseUrl: cfg.baseUrl || '',
        apiKey: apiKey,
        model: cfg.model || '',
        temperature: cfg.temperature ?? 1,
        prompt: cfg.prompt || '',
    };
});

// 获取模型列表（若 apiKey 为掩码占位，从磁盘读取已保存的加密值解密后使用）
ipcMain.handle('ai:fetch-models', async (_event, baseUrl, apiKey) => {
    // SSRF 防护：复用公共校验函数，与 ai:save-config 等入口保持一致
    validateAiBaseUrl(baseUrl, 'API 地址');
    const s = loadSettings();
    // 若已保存配置，校验传入的 baseUrl 与已保存的一致（防 XSS 篡改请求目标）
    const savedBaseUrl = s.aiConfig && s.aiConfig.baseUrl;
    if (savedBaseUrl && trimTrailingSlash(savedBaseUrl) !== trimTrailingSlash(baseUrl)) {
        throw new Error('传入的 API 地址与已保存配置不一致，请先保存设置');
    }
    let actualKey = apiKey;
    if (isMaskedCred(apiKey)) {
        // 掩码占位 → 从磁盘解密读取，避免渲染进程回传明文
        const cfg = s.aiConfig || {};
        try { actualKey = await decryptSecret(cfg.encryptedKey, 'API Key'); }
        catch (e) { throw new Error('无法读取已保存的 API Key，请重新输入。'); }
    }
    try {
        const url = trimTrailingSlash(baseUrl) + '/models';
        const response = await safeFetch(url, {
            headers: { 'Authorization': `Bearer ${actualKey}` },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            throw new Error(await extractHttpError(response));
        }
        const data = await response.json();
        const models = (data.data || []).map(m => m.id).sort();
        return models;
    } finally {
        // 主动清除明文密钥引用，缩短在内存中的留存时间
        actualKey = null;
    }
});

// AI 生成
ipcMain.handle('ai:generate', async (_event, userContent) => {
    assertPayloadSize(userContent, MAX_IPC_PAYLOAD_SIZE, 'ai:generate 入参');
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    if (!cfg.baseUrl || !cfg.model) throw new Error('AI 配置不完整，请先在 AI 设置中配置');
    validateAiBaseUrl(cfg.baseUrl, 'AI API 地址');
    return await withDecryptedKey(() => decryptSecret(cfg.encryptedKey, 'API Key'), async (apiKey) => {
        if (!apiKey) throw new Error('API Key 未配置');
        const url = trimTrailingSlash(cfg.baseUrl) + '/chat/completions';
        const messages = [];
        if (cfg.prompt) messages.push({ role: 'system', content: cfg.prompt });
        messages.push({ role: 'user', content: userContent });
        const resp = await safeFetch(url, {
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

/* ==================== 聊天图片本地存储 ====================
 * 渲染进程把附件图片（dataUrl）通过 IPC 交给主进程落盘到 userData/chat-images/，
 * 仅返回文件名。前端 localStorage 只存文件名，避免 base64 撑爆存储。
 * 显示时通过 chatimg:// 协议加载；发送给 AI 时主进程按文件名读回 dataUrl。
 */

// dataUrl -> 文件扩展名（用于生成可读文件名与正确 MIME）
// 安全说明：显式拒绝 SVG（可内嵌 <script>/onerror 等 XSS 向量），降级为 png
function extFromDataUrl(dataUrl) {
    // 正则修复：[a-zA-Z0-9+] 增加 + 以正确匹配 svg+xml，否则 + 不匹配导致正则失败返回 png
    // 但即便扩展名降级为 png，实际文件内容仍是 SVG XML，双击打开仍可能在浏览器执行脚本
    const m = /^data:image\/([a-zA-Z0-9+]+);/.exec(dataUrl || '');
    if (!m) return 'png';
    const t = m[1].toLowerCase();
    if (t === 'jpeg') return 'jpg';
    if (t === 'svg+xml') return 'png';  // 拒绝 SVG 落盘，降级为 png
    return t;
}

/**
 * 保存一张聊天图片到磁盘
 * @param {string} dataUrl - data:image/xxx;base64,... 形式
 * @returns {string} 生成的文件名（如 1730000000000-a1b2c3.png）
 */
ipcMain.handle('chat:save-image', (_event, dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
        throw new Error('无效的图片数据');
    }
    // 大小校验：base64 编码膨胀约 4/3 倍，按 1.4 倍估算实际字节数
    // 防止恶意渲染进程发送超大 base64 字符串导致 Buffer.from 撑爆内存 OOM
    if (dataUrl.length > MAX_IMAGE_SIZE * 1.4) {
        throw new Error('图片数据过大（超过 ' + (MAX_IMAGE_SIZE / 1024 / 1024) + 'MB 上限），已拒绝');
    }
    const dir = getChatImagesDir();
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = extFromDataUrl(dataUrl);
    // 文件名用 crypto.randomBytes 生成（密码学安全），避免 Math.random 可预测
    const rand = crypto.randomBytes(4).toString('hex');
    const fileName = `${Date.now()}-${rand}.${ext}`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, buffer);
    return fileName;
});

/**
 * 删除一张聊天图片（删除会话时清理孤儿文件，避免磁盘堆积）
 * @param {string} fileName - 文件名
 */
ipcMain.handle('chat:delete-image', (_event, fileName) => {
    if (!fileName) return false;
    const dir = getChatImagesDir();
    const filePath = path.normalize(path.join(dir, fileName));
    // 路径穿越防护：仅允许删除 chat-images 目录下的文件
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) return false;
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch (e) { console.warn('删除聊天图片失败:', e.message); }
    return false;
});

/**
 * 按文件名读取 chat-images 下的图片并返回 dataUrl（供发送给 AI 时使用）
 * @param {string} fileName - 文件名
 * @returns {string|null} dataUrl 或 null（文件不存在时）
 */
function readChatImageAsDataUrl(fileName) {
    if (!fileName) return null;
    const dir = getChatImagesDir();
    const filePath = path.normalize(path.join(dir, fileName));
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) return null;
    try {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
        // 大小校验：超过 20MB 拒绝读取，避免 base64 放大后撑爆 IPC 和堆内存
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_IMAGE_SIZE) {
            console.warn('聊天图片过大（' + (stat.size/1024/1024).toFixed(1) + 'MB > 20MB 上限），拒绝读取:', fileName);
            return null;
        }
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(fileName).toLowerCase();
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
        const mime = mimeMap[ext] || 'image/png';
        return 'data:' + mime + ';base64,' + buffer.toString('base64');
    } catch (e) {
        console.warn('读取聊天图片失败:', e.message);
        return null;
    }
}

// AI 多轮对话（聊天模式）：流式输出 + 多模态 + 思考模式
// 入参：{ messages: [{role, content, images?}], thinking: bool }
// 通过 webContents.send 推送流式 chunk，最终返回 { content, reasoning, model, usage, elapsedMs }
// 支持中断：chat:abort IPC 可中止当前请求
let chatAbortController = null;  // 当前 chat 请求的 AbortController
let videoGenerating = false;  // 视频生成防重入标志：避免快速连续点击导致任务堆叠
let videoAbortController = null;  // 当前视频生成轮询的 AbortController：用户可中止/退出时清理
ipcMain.handle('ai:chat', async (event, payload) => {
    assertPayloadSize(payload, MAX_IPC_PAYLOAD_SIZE, 'ai:chat 入参');
    // 防重入：上一次对话仍在进行时拒绝新请求，避免单例 controller 被覆盖导致幽灵请求无法中止
    if (chatAbortController) {
        throw new Error('上一次对话仍在进行中，请点击"中止"按钮后再发送新消息');
    }
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    if (!cfg.baseUrl || !cfg.model) throw new Error('AI 配置不完整，请先在 AI 设置中配置');
    validateAiBaseUrl(cfg.baseUrl, 'AI API 地址');
    return await withDecryptedKey(() => decryptSecret(cfg.encryptedKey, 'API Key'), async (apiKey) => {
        if (!apiKey) throw new Error('API Key 未配置');
        const url = trimTrailingSlash(cfg.baseUrl) + '/chat/completions';

        // 入参兼容：既支持 {messages,thinking} 也兼容旧版直接传 messages 数组
        const input = (payload && Array.isArray(payload.messages)) ? payload : { messages: Array.isArray(payload) ? payload : [] };
        const wantThinking = !!(payload && payload.thinking);

        const messages = [];
        if (cfg.prompt) messages.push({ role: 'system', content: cfg.prompt });
        if (Array.isArray(input.messages)) {
            input.messages.forEach(m => {
                if (!m || !m.role || !m.content) return;
                if (m.role !== 'user' && m.role !== 'assistant') return;
                if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
                    const parts = [{ type: 'text', text: m.content }];
                    m.images.forEach(img => {
                        if (!img) return;
                        // 新版：前端只存 path，主进程按文件名读回 dataUrl 发给 AI
                        // 旧版兼容：仍可能直接带 dataUrl
                        let url = img.dataUrl;
                        if (!url && img.path) {
                            url = readChatImageAsDataUrl(img.path);
                        }
                        if (url) parts.push({ type: 'image_url', image_url: { url: url } });
                    });
                    messages.push({ role: 'user', content: parts });
                } else {
                    messages.push({ role: m.role, content: m.content });
                }
            });
        }
        if (messages.length === 0 || (cfg.prompt && messages.length === 1)) {
            throw new Error('没有可发送的对话内容');
        }

        const reqBody = {
            model: cfg.model,
            messages: messages,
            temperature: cfg.temperature ?? 1,
            stream: true,  // 启用流式输出
        };
        // 思考模式控制（兼容阿里云 dashscope / Qwen3 / DeepSeek-R1 等）
        // 关键：Qwen3 系列默认开启思考，必须显式传 enable_thinking:false 才能关闭
        if (wantThinking) {
            reqBody.enable_thinking = true;
        } else {
            reqBody.enable_thinking = false;
        }

        const startTs = Date.now();
        // 创建可中断的 AbortController，同时支持超时和用户手动中止
        // 使用局部变量 ac 固定引用当前请求的 controller，避免模块级 chatAbortController 被并发覆盖后误判
        const ac = new AbortController();
        chatAbortController = ac;
        const timeoutId = setTimeout(() => { try { ac.abort(); } catch (_) {} }, 180000);
        let aborted = false;  // 标记是否被用户主动中断

        // 解析 SSE 流
        let fullContent = '';
        let fullReasoning = '';
        let modelName = cfg.model;
        let modelNameUpdated = false;  // 标记是否已从流中获取过真实模型名
        let usage = { input: 0, output: 0, total: 0 };
        const sender = event.sender;

        try {
            const resp = await safeFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify(reqBody),
                signal: ac.signal,  // 流式给 3 分钟，可被 chat:abort 中止
            });

            if (!resp.ok) {
                throw new Error(await extractHttpError(resp));
            }

            await parseSSEStream(resp, (chunk) => {
                // 模型名：以流中首个 chunk.model 为准（服务端可能路由到实际模型）
                if (chunk.model && !modelNameUpdated) {
                    modelName = chunk.model;
                    modelNameUpdated = true;
                }
                // usage（部分厂商在末尾 chunk 带 usage）
                if (chunk.usage) {
                    usage = {
                        input: chunk.usage.prompt_tokens || chunk.usage.input_tokens || 0,
                        output: chunk.usage.completion_tokens || chunk.usage.output_tokens || 0,
                        total: chunk.usage.total_tokens || 0
                    };
                }
                const choice = chunk.choices && chunk.choices[0];
                if (!choice) return;
                const delta = choice.delta || {};
                // 内容增量
                if (delta.content) {
                    fullContent += delta.content;
                    sender.send('chat:chunk', { type: 'content', text: delta.content });
                }
                // 思考过程增量（兼容各家字段）
                const reasoningDelta = delta.reasoning_content || delta.thinking || delta.reasoning || '';
                if (reasoningDelta) {
                    fullReasoning += reasoningDelta;
                    sender.send('chat:chunk', { type: 'reasoning', text: reasoningDelta });
                }
            });
        } catch (err) {
            // 用户主动中断或超时中断时，返回已接收的内容（不作为错误处理）
            // 用局部 ac 判断而非模块级 chatAbortController，避免并发场景误判
            if (ac.signal.aborted) {
                aborted = true;
            } else {
                // 其他错误正常抛出
                throw err;
            }
        } finally {
            clearTimeout(timeoutId);
            // 仅当模块级变量仍指向本次请求时才清空，防止并发覆盖误清后续请求
            if (chatAbortController === ac) {
                chatAbortController = null;
            }
            // apiKey 清理交给 withDecryptedKey 出作用域 GC
        }

        const elapsedMs = Date.now() - startTs;
        return {
            content: fullContent,
            reasoning: fullReasoning,
            model: modelName,
            usage: usage,
            elapsedMs: elapsedMs,
            aborted: aborted  // 标记是否被用户中断
        };
    });
});

// 中断当前 AI 对话请求（用户点击暂停按钮时调用）
ipcMain.handle('chat:abort', () => {
    if (chatAbortController) {
        try { chatAbortController.abort(); } catch (_) {}
        chatAbortController = null;
        return true;
    }
    return false;
});

/* ==================== AI 翻译（文本） ====================
 * 复用 ai:chat 的多模态能力，但使用固定的系统提示词，非流式输出。
 * 文本翻译：ai:translate(text, targetLang)
 * ============================================================ */

// 目标语言代码 → 语言名称映射（用于动态构建系统提示词）
const TRANSLATE_LANG_MAP = {
    zh: '简体中文',
    en: '英文（English）',
    ja: '日文（日本語）',
    fr: '法文（Français）',
    de: '德文（Deutsch）',
    pt: '葡萄牙文（Português）',
    ar: '阿拉伯文（العربية）',
    es: '西班牙文（Español）',
};

/**
 * 根据目标语言代码构建翻译系统提示词
 * @param {string} langCode - 语言代码（zh/en/ja/fr/de/pt/ar/es），默认 zh
 * @returns {string} 系统提示词
 */
function buildTranslatePrompt(langCode, hasImages) {
    const langName = TRANSLATE_LANG_MAP[langCode] || TRANSLATE_LANG_MAP.zh;
    let prompt = '你是一个资深的 IT 翻译专家，请把用户输入的内容翻译为通俗易懂的' + langName +
        '，保持代码和专有名词的原意。如果内容已经是目标语言，请直接润色输出。只输出翻译结果，不要解释。';
    if (hasImages) {
        prompt += ' 用户可能传入图片，请识别图片中的文字（OCR）并翻译为' + langName +
            '。如果图片中无可识别文字，请简要描述图片内容并翻译。';
    }
    return prompt;
}

// 构建翻译 user 消息 content：有图时返回 OpenAI Vision parts 数组，无图时返回纯字符串
function buildTranslateUserContent(text, images) {
    if (!Array.isArray(images) || images.length === 0) {
        return String(text);
    }
    const parts = [];
    if (text && String(text).trim()) {
        parts.push({ type: 'text', text: String(text) });
    }
    images.forEach(img => {
        if (!img) return;
        // 复用聊天图片读取逻辑：前端只传 path，主进程读回 base64 dataUrl
        let url = img.dataUrl;
        if (!url && img.path) {
            url = readChatImageAsDataUrl(img.path);
        }
        if (url) parts.push({ type: 'image_url', image_url: { url: url } });
    });
    // 若 parts 为空（图片读取失败且无文本），兜底返回空文本
    return parts.length > 0 ? parts : [{ type: 'text', text: '' }];
}

// 文本翻译：非流式，直接返回译文。支持 targetLang 参数选择目标语言。
// 支持单图 OCR 翻译：第 3 个参数 images 为数组，元素 {path} 或 {dataUrl}
ipcMain.handle('ai:translate', async (_event, text, targetLang, images) => {
    assertPayloadSize(text, MAX_IPC_PAYLOAD_SIZE, 'ai:translate 入参');
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    if (!cfg.baseUrl || !cfg.model) throw new Error('AI 配置不完整，请先在 AI 设置中配置');
    validateAiBaseUrl(cfg.baseUrl, 'AI API 地址');
    return await withDecryptedKey(() => decryptSecret(cfg.encryptedKey, 'API Key'), async (apiKey) => {
        if (!apiKey) throw new Error('API Key 未配置');
        const hasImages = Array.isArray(images) && images.length > 0;
        if ((!text || !String(text).trim()) && !hasImages) throw new Error('请输入要翻译的内容');
        // 根据目标语言动态构建提示词（有图时附加 OCR 指令）
        const systemPrompt = buildTranslatePrompt(targetLang || 'zh', hasImages);
        const url = trimTrailingSlash(cfg.baseUrl) + '/chat/completions';
        // 有图时 user content 为 parts 数组（OpenAI Vision 格式），无图时为纯字符串
        const userContent = buildTranslateUserContent(text || '', images);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];
        const resp = await safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({
                model: cfg.model,
                messages: messages,
                temperature: Math.min(cfg.temperature ?? 0.3, 0.5),  // 翻译用低温度保证稳定
            }),
            signal: AbortSignal.timeout(60000),
        });
        if (!resp.ok) throw new Error(await extractHttpError(resp));
        const data = await resp.json();
        return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    });
});

// 窗口透明度
ipcMain.handle('window:set-opacity', (_event, val) => {
    if (!mainWindow) return;
    // 数值校验：防 NaN/字符串导致 setOpacity 行为未定义
    if (typeof val !== 'number' || !Number.isFinite(val)) return;
    const opacity = Math.max(0.2, Math.min(1, val));
    mainWindow.setOpacity(opacity);
    const s = loadSettings();
    s.opacity = opacity;
    persistSettings();
    return opacity;
});
ipcMain.handle('window:get-opacity', () => {
    const s = loadSettings();
    return s.opacity ?? 1;
});

// 选择文件夹
ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// 保存自定义图片尺寸（自动保存，不加入推荐列表）
ipcMain.handle('ai:save-custom-size', (_event, size) => {
    const s = loadSettings();
    if (!s.aiConfig) s.aiConfig = {};
    s.aiConfig.customImageSize = size || '';
    return persistSettings();
});

// 加载自定义图片尺寸
ipcMain.handle('ai:load-custom-size', () => {
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    return cfg.customImageSize || '';
});

/* ==================== AI 图片生成 ==================== */

// 保存图片生成配置（支持双标准，互不覆盖）
// 设计原则：仅当字段被"显式传入"（非 undefined）时才写入，避免切换 provider
// 时仅传 {provider} 把另一份已保存的配置清空。
ipcMain.handle('ai:save-image-config', async (_event, config) => {
    const s = loadSettings();
    if (!s.aiConfig) s.aiConfig = {};
    if (config.provider !== undefined) {
        s.aiConfig.imageProvider = config.provider || 'openai';
    }
    const provider = s.aiConfig.imageProvider || 'openai';
    if (provider === 'dashscope') {
        // SSRF 防护：校验百炼图片 API 地址协议
        if (config.baseUrl !== undefined) {
            validateAiBaseUrl(config.baseUrl, '百炼图片 API 地址');
            s.aiConfig.dashscopeBaseUrl = config.baseUrl;
        }
        // 掩码占位时保留已保存的加密值，避免掩码字符串被当真实密钥加密落盘
        if (config.apiKey !== undefined) s.aiConfig.dashscopeEncryptedKey = isMaskedCred(config.apiKey) ? s.aiConfig.dashscopeEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
        if (config.model !== undefined) s.aiConfig.dashscopeModel = config.model || 'qwen-image-2.0-pro';
        if (config.size !== undefined) s.aiConfig.dashscopeSize = config.size || '2048*2048';
    } else {
        // SSRF 防护：校验 OpenAI 图片 API 地址协议
        if (config.baseUrl !== undefined) {
            validateAiBaseUrl(config.baseUrl, 'OpenAI 图片 API 地址');
            s.aiConfig.imageBaseUrl = config.baseUrl;
        }
        if (config.apiKey !== undefined) s.aiConfig.imageEncryptedKey = isMaskedCred(config.apiKey) ? s.aiConfig.imageEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
        if (config.model !== undefined) s.aiConfig.imageModel = config.model || 'dall-e-3';
        if (config.size !== undefined) s.aiConfig.imageSize = config.size || '1024x1024';
    }
    // 保存路径统一存储到 imageSavePath（图片/视频/TTS 三模块共用同一保存路径）
    // 同时同步到 dashscopeSavePath 以兼容旧版配置读取逻辑
    if (config.savePath !== undefined) {
        s.aiConfig.imageSavePath = config.savePath;
        s.aiConfig.dashscopeSavePath = config.savePath;
    }
    // 视频生成模型配置（视频生成只用 dashscope，但配置统一存储，与 provider 无关）
    if (config.videoT2vModel !== undefined) s.aiConfig.videoT2vModel = config.videoT2vModel;
    if (config.videoI2vModel !== undefined) s.aiConfig.videoI2vModel = config.videoI2vModel;
    // 视频生成独立配置（留空则 fallback 到图片生成的 dashscope 字段，老配置不受影响）
    if (config.videoBaseUrl !== undefined) {
        validateAiBaseUrl(config.videoBaseUrl, '百炼视频 API 地址');
        s.aiConfig.dashscopeVideoBaseUrl = config.videoBaseUrl;
    }
    if (config.videoApiKey !== undefined) s.aiConfig.dashscopeVideoEncryptedKey = isMaskedCred(config.videoApiKey) ? s.aiConfig.dashscopeVideoEncryptedKey : await encryptSecret(config.videoApiKey, 'API Key');
    return persistSettings();
});

// 加载图片生成配置（按当前 provider 返回对应数据，apiKey 掩码化回传）
ipcMain.handle('ai:load-image-config', async () => {
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    const provider = cfg.imageProvider || 'openai';
    // 掩码化回传，避免明文 API Key 进入渲染进程
    let dashscopeKey = '', imageKey = '', videoKey = '';
    try { dashscopeKey = maskCred(await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key')); } catch (_) {}
    try { imageKey = maskCred(await decryptSecret(cfg.imageEncryptedKey, 'API Key')); } catch (_) {}
    try { videoKey = maskCred(await decryptSecret(cfg.dashscopeVideoEncryptedKey, 'API Key')); } catch (_) {}
    // 保存路径统一使用 imageSavePath（图片/视频/TTS 三模块共用）
    // fallback 到 dashscopeSavePath 仅为兼容老版本配置数据
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

/* ==================== TTS 语音配置存取 ====================
 * 严格复用 encryptSecret / maskCred / isMaskedCred 三件套，
 * 与图片/视频配置存取模式完全一致：掩码占位时保留旧密钥，避免掩码字符串被当真实密钥加密落盘。
 * 三级 Key fallback：ttsEncryptedKey → dashscopeEncryptedKey → encryptedKey(聊天)
 *   老配置（已有图片或聊天百炼 Key）零改动即可使用 TTS，无需重复填写。
 * ================================================================== */

// 保存 TTS 配置（API Key 加密落盘；掩码占位时保留旧密钥）
ipcMain.handle('tts:save-config', async (_event, config) => {
    const s = loadSettings();
    if (!s.aiConfig) s.aiConfig = {};
    const cfg = s.aiConfig;
    // 仅当字段被显式传入（非 undefined）时才写入，避免部分保存清空其他字段
    // SSRF 防护：校验 TTS API 地址协议
    if (config.baseUrl !== undefined) {
        validateAiBaseUrl(config.baseUrl, 'TTS API 地址');
        cfg.ttsBaseUrl = config.baseUrl;
    }
    if (config.apiKey !== undefined) {
        // 掩码占位时保留已保存的加密值，避免掩码字符串被当真实密钥加密落盘
        cfg.ttsEncryptedKey = isMaskedCred(config.apiKey) ? cfg.ttsEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
    }
    if (config.model !== undefined) cfg.ttsModel = config.model || 'cosyvoice-v1';
    if (config.voice !== undefined) cfg.ttsVoice = config.voice || '';
    if (config.format !== undefined) cfg.ttsFormat = config.format || 'mp3';
    if (config.sampleRate !== undefined) cfg.ttsSampleRate = config.sampleRate || 22050;
    // 自定义音色列表：保留字段以兼容旧配置数据（克隆功能已下线，不再写入新数据）
    if (config.customVoices !== undefined) cfg.ttsCustomVoices = config.customVoices || [];
    return persistSettings();
});

// 加载 TTS 配置（apiKey 掩码化回传，避免明文进入渲染进程）
// 三级 Key fallback：优先解密 tts 专用 Key，失败/为空则 fallback 到图片百炼 Key，再 fallback 到聊天 Key
ipcMain.handle('tts:load-config', async () => {
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    let ttsKey = '';
    try {
        // 三级 fallback 解密：tts 专用 → 图片共用百炼 → 聊天通用
        let raw = await decryptSecret(cfg.ttsEncryptedKey, 'API Key');
        if (!raw) raw = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
        if (!raw) raw = await decryptSecret(cfg.encryptedKey, 'API Key');
        ttsKey = maskCred(raw);
    } catch (e) {
        // 解密失败（safeStorage 不可用等）：返回空，前端提示用户重新输入
        console.error('加载 TTS API Key 失败:', e.message);
    }
    return {
        baseUrl: cfg.ttsBaseUrl || 'https://dashscope.aliyuncs.com',
        apiKey: ttsKey,
        model: cfg.ttsModel || 'cosyvoice-v1',
        voice: cfg.ttsVoice || '',
        format: cfg.ttsFormat || 'mp3',
        sampleRate: cfg.ttsSampleRate || 22050,
        customVoices: cfg.ttsCustomVoices || [],
    };
});

// 自动保存图片到磁盘
function saveImageToDisk(dataUrl, cfg) {
    try {
        // 保存路径统一使用 imageSavePath（图片/视频/TTS 三模块共用），fallback 兼容老配置
        const saveDir = (cfg && (cfg.imageSavePath || cfg.dashscopeSavePath)) || app.getPath('userData');
        if (!fs.existsSync(saveDir)) { fs.mkdirSync(saveDir, { recursive: true }); }
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = 'ai_image_' + Date.now() + '.png';
        const filePath = path.join(saveDir, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log('图片已保存:', path.basename(filePath));
    } catch (err) {
        console.error('自动保存图片失败:', err.message);
    }
}

// 下载图片 URL 并转为 dataURL，同时保存到磁盘
// 抽取自 extractImageFromResponse / dashscopeGenerate 的 3 处重复逻辑
// 注意：本函数不包含 SSRF 校验（错误消息因调用点不同而异），调用方需在调用前自行校验 URL
async function fetchImageAsDataUrl(url, cfg) {
    const imgResp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const imgBuf = await imgResp.arrayBuffer();
    const dataUrl = 'data:image/png;base64,' + Buffer.from(imgBuf).toString('base64');
    saveImageToDisk(dataUrl, cfg);
    return dataUrl;
}

// 从 OpenAI 响应中提取图片并转为 dataURL，同时保存到磁盘
async function extractImageFromResponse(data, cfg) {
    const item = data && data.data && data.data[0];
    if (!item) throw new Error('API 未返回图片数据');
    // 优先使用 b64_json
    if (item.b64_json) {
        const dataUrl = 'data:image/png;base64,' + item.b64_json;
        saveImageToDisk(dataUrl, cfg);
        return dataUrl;
    }
    // 回退到 URL 下载
    if (item.url) {
        // SSRF 防护：校验返回的 URL 是安全的外网 https 地址，防止 AI 服务被篡改返回内网/元数据 URL
        if (!isSafeExternalUrl(item.url)) {
            throw new Error('AI 服务返回的图片地址不安全（需 https 外网地址），已拒绝下载');
        }
        return await fetchImageAsDataUrl(item.url, cfg);
    }
    throw new Error('API 未返回图片数据');
}

// 阿里云百炼 Qwen-Image 同步生成：multimodal-generation 接口
// 千问文生图模型支持同步调用，一次请求即可获得结果
async function dashscopeGenerate(baseUrl, apiKey, model, prompt, size, imageData, cfg) {
    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
    };
    // 构建请求体：multimodal-generation 使用 messages 格式
    const content = [{ text: prompt }];
    if (imageData) {
        // 图生图：在 content 中加入 image 字段
        content.push({ image: imageData });
    }
    const body = {
        model,
        input: {
            messages: [{ role: 'user', content }],
        },
        parameters: { n: 1 },
    };
    // 仅当 size 非空且非"默认"时才传入 size 参数（让 AI 自动选择）
    if (size && size !== 'auto' && size !== '默认') {
        body.parameters.size = size;
    }

    // 判断 URL 是否已包含完整路径（用户可能填的是完整端点 URL 或仅 base URL）
    // 用 URL 对象规范化拼接，避免字符串 includes 在子串匹配时误判（如 baseUrl 含 /generation-relay）
    let requestUrl;
    try {
        const base = new URL(trimTrailingSlash(baseUrl));
        // 路径以 /api/v1/services/aigc/multimodal-generation/generation 结尾视为完整端点
        if (base.pathname.endsWith('/api/v1/services/aigc/multimodal-generation/generation')) {
            requestUrl = base.href;
        } else {
            // 仅 base URL：自动补全 multimodal-generation 路径
            requestUrl = base.origin + '/api/v1/services/aigc/multimodal-generation/generation';
        }
    } catch (e) {
        throw new Error('百炼 API 地址格式错误：' + e.message);
    }

    const resp = await safeFetch(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),  // 同步调用可能耗时较长
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('百炼请求失败 HTTP ' + resp.status + ': ' + (errText || resp.statusText));
    }
    const data = await resp.json();

    // 检查错误码
    if (data.code && data.code !== '') {
        throw new Error('百炼错误 [' + data.code + ']: ' + (data.message || '未知错误'));
    }

    // 解析响应：output.choices[0].message.content[0].image
    const choices = data && data.output && data.output.choices;
    if (choices && choices.length > 0) {
        const msgContent = choices[0].message && choices[0].message.content;
        if (msgContent && msgContent.length > 0) {
            const imageItem = msgContent.find(c => c.image);
            if (imageItem && imageItem.image) {
                // SSRF 防护：校验图片 URL
                if (!isSafeExternalUrl(imageItem.image)) {
                    throw new Error('百炼返回的图片地址不安全（需 https 外网地址），已拒绝下载');
                }
                // 下载图片 URL 转为 dataURL
                return await fetchImageAsDataUrl(imageItem.image, cfg);
            }
        }
    }

    // 兼容旧版异步格式（output.results[0].url），以防万一是万相模型
    const results = data && data.output && data.output.results;
    if (results && results.length > 0 && results[0].url) {
        // SSRF 防护：校验图片 URL
        if (!isSafeExternalUrl(results[0].url)) {
            throw new Error('百炼返回的图片地址不安全（需 https 外网地址），已拒绝下载');
        }
        return await fetchImageAsDataUrl(results[0].url, cfg);
    }

    throw new Error('百炼未返回图片数据：' + JSON.stringify(data).slice(0, 500));
}

/**
 * 下载视频 URL 并保存到本地磁盘，返回本地文件路径。
 * 保存目录统一使用 imageSavePath（图片/视频/TTS 三模块共用同一保存路径）
 * fallback 到 dashscopeSavePath 仅为兼容老版本配置数据
 * @param {string} videoUrl - 视频下载地址
 * @param {object} cfg - AI 配置对象
 * @returns {Promise<string>} 本地视频文件绝对路径
 */
async function saveVideoToDisk(videoUrl, cfg) {
    // SSRF 防护：校验视频 URL 是安全的外网 https 地址
    if (!isSafeExternalUrl(videoUrl)) {
        throw new Error('视频下载地址不安全（需 https 外网地址），已拒绝下载');
    }
    // 保存路径统一使用 imageSavePath（与图片/TTS 共用），不再单独读取 videoSavePath
    const saveDir = (cfg && (cfg.imageSavePath || cfg.dashscopeSavePath)) || app.getPath('userData');
    if (!fs.existsSync(saveDir)) { fs.mkdirSync(saveDir, { recursive: true }); }
    const fileName = 'ai_video_' + Date.now() + '.mp4';
    const filePath = path.join(saveDir, fileName);
    // 流式下载到磁盘：避免一次性把整段视频读进内存导致 OOM（几百 MB 视频会让 Node 崩溃）
    const resp = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!resp.ok) {
        throw new Error('下载视频失败 HTTP ' + resp.status + ': ' + resp.statusText);
    }
    if (!resp.body) {
        // 兜底：环境不支持流式读取时退回一次性 Buffer
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(filePath, buf);
        console.log('视频已保存:', path.basename(filePath));
        return filePath;
    }
    const fileStream = fs.createWriteStream(filePath);
    const reader = resp.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(Buffer.from(value));
        }
    } finally {
        fileStream.end();
        await new Promise((resolve) => fileStream.on('finish', resolve));
    }
    console.log('视频已保存到:', filePath);
    return filePath;
}

/* ==================== TTS 语音合成 Service（百炼 CosyVoice）====================
 * 与图片/视频生成同构：原生 fetch + SSRF https 校验 + 错误码统一处理。
 * 合成模式：HTTP 同步合成（v1），返回音频 URL 或 base64，主进程统一落盘到 tts_cache。
 * 情感控制（Director Mode）：通过 parameters.instruct 字段实现（严格遵循官方 model+input+parameters 三层结构）。
 * 声音复刻：先上传音频到百炼临时存储拿 oss:// URL，再调注册接口拿 voice_id。
 * 严格不引入第三方 SDK，全部原生 fetch + Node 内置模块。
 * ============================================================================= */

// TTS 单次合成文本长度上限（百炼单次请求限制 + IPC payload 约束）
const TTS_TEXT_MAX_LENGTH = 1000;
// TTS HTTP 请求超时（合成通常 3-10 秒，给 60 秒余量）
const TTS_REQUEST_TIMEOUT_MS = 60000;

/**
 * 构建百炼 TTS HTTP 请求 URL。
 * 铁血纪律：new URL().origin 只取 scheme://host[:port]，用户输入的任何 path（如 /compatible-mode/v1）统统剥离。
 * @param {string} baseUrl - 用户配置的百炼 API 地址（可能带 path）
 * @param {string} apiPath - 官方标准路径 /api/v1/services/aigc/text2audio/generation
 * @returns {string} 完整请求 URL（origin + apiPath）
 */
function buildTtsUrl(baseUrl, apiPath) {
    let origin = baseUrl || 'https://dashscope.aliyuncs.com';
    try {
        const u = new URL(origin);
        origin = u.origin;  // 只取 scheme://host[:port]，丢弃任何 path
    } catch (e) {
        throw new Error('百炼 TTS API 地址格式错误：' + e.message);
    }
    return origin + apiPath;
}

/**
 * 阿里云百炼文本转语音（HTTP 同步合成，非实时）。
 * 官方 Endpoint: POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
 * 适用于 CosyVoice 系列 + Qwen-Audio-TTS 系列（共用同一 endpoint，请求体结构相同）。
 * 请求体结构: { model, input:{ text, voice, format, sample_rate, instruction? } }
 *   —— voice/format/sample_rate 全部放在 input 内，无 parameters 对象（实测确认）
 * @param {string} baseUrl - 百炼 API 地址
 * @param {string} apiKey - 明文 API Key（由 withDecryptedKey 解密后传入）
 * @param {string} model - 模型名（cosyvoice-v1 / qwen-audio-3.0-tts-plus / qwen-audio-3.0-tts-flash 等）
 * @param {string} voice - 音色 id（必须与模型严格匹配，否则报 411 Engine error；留空则按模型自动匹配默认音色）
 * @param {string} text - 待合成文本
 * @param {string} [instruct] - 情感指令（cosyvoice 用 input.instruction；qwen-audio 不支持，自动跳过）
 * @param {string} [format='mp3'] - 输出音频格式
 * @returns {Promise<{url: string, durationMs?: number}>} ttsfile:// 本地路径
 */
async function dashscopeTts(baseUrl, apiKey, model, voice, text, instruct, format) {
    // 入参校验
    if (!apiKey) throw new Error('API Key 未配置');
    if (!text || !text.trim()) throw new Error('待合成文本不能为空');
    if (text.length > TTS_TEXT_MAX_LENGTH) {
        throw new Error('文本过长（超过 ' + TTS_TEXT_MAX_LENGTH + ' 字上限），请缩短后重试');
    }
    const useModel = model || 'cosyvoice-v1';
    const useFormat = (format || 'mp3').toLowerCase();

    // 默认音色按精确模型区分（音色与模型必须严格匹配，否则报 411 Engine error）
    // qwen-audio-3.0-tts-plus → longanlingxin（旗舰音色）
    // qwen-audio-3.0-tts-flash → longanhuan_v3.6（精品中文音色）
    // cosyvoice 系列 → longxiaochun
    // 注意：模型名匹配使用小写比较（用户可能在设置中输入不同大小写），但 useModel 原值传给 API
    let useVoice = voice || '';
    if (!useVoice) {
        const modelLower = useModel.toLowerCase();
        if (modelLower === 'qwen-audio-3.0-tts-plus') {
            useVoice = 'longanlingxin';
        } else if (modelLower === 'qwen-audio-3.0-tts-flash') {
            useVoice = 'longanhuan_v3.6';
        } else if (modelLower.indexOf('qwen-audio') === 0) {
            // 兜底：未知 qwen-audio 变体按 flash 默认音色处理
            useVoice = 'longanhuan_v3.6';
        } else {
            useVoice = 'longxiaochun';
        }
    }

    // 官方 HTTP 端点路径（实测确认：text2audio/generation 会报 url error，SpeechSynthesizer 才是正确路径）
    const reqUrl = buildTtsUrl(baseUrl, '/api/v1/services/audio/tts/SpeechSynthesizer');
    // SSRF 校验：必须 https
    try {
        const u = new URL(reqUrl);
        if (u.protocol !== 'https:') throw new Error('仅支持 https 协议');
    } catch (e) {
        throw new Error('百炼 TTS API 地址不安全：' + e.message);
    }

    // 防呆日志 —— fetch 前打印最终 URL 和模型/音色，方便排查
    console.info('[TTS] 最终请求 URL:', reqUrl, '| model:', useModel, '| voice:', useVoice);

    // 请求体：所有字段放在 input 内（实测确认无 parameters 对象）
    const input = {
        text: text,
        voice: useVoice,
        format: useFormat,
        sample_rate: 22050
    };
    // 情感指令：仅 cosyvoice 系列支持 input.instruction；qwen-audio 系列不支持，跳过避免报错
    if (instruct && instruct.trim() && useModel.indexOf('qwen-audio') !== 0) {
        input.instruction = instruct.trim();
    }
    const body = { model: useModel, input: input };

    const resp = await fetch(reqUrl, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TTS_REQUEST_TIMEOUT_MS)
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('百炼 TTS 请求失败 HTTP ' + resp.status + ': ' + (errText || resp.statusText).slice(0, 500));
    }
    const data = await resp.json();

    // 错误码检查（百炼同步返回的错误格式）
    if (data.code) {
        throw new Error('百炼 TTS 错误 [' + data.code + ']: ' + (data.message || '未知错误'));
    }

    // 解析音频：百炼返回两种格式
    //  1) output.audio.url → 公网 URL（可能是 http://，需升级为 https:// 再过 SSRF 校验），需下载
    //  2) output.audio → data:audio/mpeg;base64,xxx dataURL
    let audioBuffer = null;
    let ext = useFormat;

    const audioField = data.output && data.output.audio;
    if (typeof audioField === 'string' && audioField.startsWith('data:audio/')) {
        // 格式 2：直接 base64 dataURL
        const m = /^data:audio\/(\w+);base64,/.exec(audioField);
        if (m) ext = m[1] === 'mpeg' ? 'mp3' : m[1];
        const base64Data = audioField.replace(/^data:audio\/\w+;base64,/, '');
        audioBuffer = Buffer.from(base64Data, 'base64');
    } else if (audioField && typeof audioField.url === 'string') {
        // 格式 1：公网 URL，下载（复用 SSRF 校验）
        // 百炼 OSS 返回的 URL 可能是 http://，升级为 https:// 再校验（阿里云 OSS 支持 https）
        let audioUrl = audioField.url;
        if (audioUrl.indexOf('http://') === 0) audioUrl = 'https://' + audioUrl.slice(7);
        if (!isSafeExternalUrl(audioUrl)) {
            throw new Error('百炼返回的音频地址不安全（需 https 外网地址），已拒绝下载');
        }
        const dlResp = await fetch(audioUrl, { signal: AbortSignal.timeout(TTS_REQUEST_TIMEOUT_MS) });
        if (!dlResp.ok) {
            throw new Error('下载合成音频失败 HTTP ' + dlResp.status + ': ' + dlResp.statusText);
        }
        audioBuffer = Buffer.from(await dlResp.arrayBuffer());
    } else {
        throw new Error('百炼 TTS 未返回音频数据：' + JSON.stringify(data).slice(0, 500));
    }

    if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('百炼 TTS 返回的音频数据为空');
    }

    // 落盘到 tts_cache，返回 ttsfile:// URL
    const ttsUrl = await saveAudioToTtsCache(audioBuffer, ext);
    return { url: ttsUrl, durationMs: data.output && data.output.duration_ms };
}

/**
 * 阿里云百炼 wan2.7 视频生成（异步任务模式）
 * 文生视频（T2V）使用 wan2.7-t2v-2026-04-25：input.prompt + parameters.ratio
 * 图生视频（I2V）使用 wan2.7-i2v-2026-04-25：input.media[{type:first_frame,url:dataURL}]
 *   - i2v 直接支持 Base64 dataURL，无需上传到 OSS
 *   - i2v 无 ratio 参数（视频宽高比与输入素材保持一致）
 *
 * @param {string} baseUrl - 百炼 API 地址
 * @param {string} apiKey - API Key
 * @param {string} model - 模型名（如 wan2.7-t2v-2026-04-25）
 * @param {string} prompt - 文本提示词
 * @param {string} size - 兼容旧参数（720P/1080P 或 16:9 等），优先级低于 ratio/duration
 * @param {string} imageData - 图生视频的本地图片 dataURL（i2v 直接支持 Base64 格式）
 * @param {object} cfg - 配置对象（用于获取保存路径）
 * @param {number} [duration=5] - 视频时长（秒），可选 2-15
 * @param {string} [ratio='16:9'] - 视频宽高比（仅 t2v 有效），可选 16:9/9:16/1:1/4:3/3:4
 * @returns {Promise<string>} 保存到本地的视频文件路径
 */
function buildVideoRequestBody(model, prompt, size, imageData, duration, ratio, isI2v) {
    // 解析分辨率：优先从 size 参数中提取 720P/1080P，默认 720P
    let resolution = '720P';
    if (size && /^\d+[Pp]$/.test(size)) {
        resolution = size.toUpperCase();
    }

    // 解析时长：t2v 3-15 秒，i2v 2-15 秒，默认 5 秒
    let finalDuration = 5;
    if (duration && !isNaN(duration)) {
        const minDur = isI2v ? 2 : 3;
        finalDuration = Math.max(minDur, Math.min(15, parseInt(duration, 10)));
    }

    // 构建请求体（t2v 和 i2v 结构不同）
    const body = { model, input: {}, parameters: { resolution, duration: finalDuration } };

    if (isI2v) {
        // 图生视频：使用 input.media 数组，type=first_frame，url 直接用 dataURL
        if (!imageData) {
            throw new Error('图生视频需要上传一张参考图片，请先点击"上传"按钮选择图片');
        }
        body.input.prompt = prompt || '';
        body.input.media = [{ type: 'first_frame', url: imageData }];
    } else {
        // 文生视频：使用 input.prompt + parameters.ratio
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

async function createVideoTask(requestUrl, headers, body) {
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

async function pollVideoTask(queryUrl, queryHeaders, ac) {
    const maxAttempts = 60;
    const intervalMs = 5000;
    for (let i = 0; i < maxAttempts; i++) {
        if (ac.signal.aborted) throw new Error('用户已取消视频生成');
        // 可中断的 sleep：用户 abort 时立即拒绝
        await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, intervalMs);
            ac.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('用户已取消视频生成')); }, { once: true });
        });
        if (ac.signal.aborted) throw new Error('用户已取消视频生成');

        // 单次查询失败重试 3 次（网络抖动 / 503 / 超时不该让 5 分钟等待全白费）
        let queryResp = null;
        let lastErr = null;
        for (let retry = 0; retry < 3; retry++) {
            try {
                queryResp = await safeFetch(queryUrl, {
                    method: 'GET',
                    headers: queryHeaders,
                    signal: ac.signal,
                });
                if (queryResp.ok) break;
                lastErr = new Error(await extractHttpError(queryResp));
            } catch (e) {
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
        // PENDING / RUNNING 继续轮询
    }
    throw new Error('视频生成任务超时（5分钟内未完成）');
}

async function dashscopeGenerateVideo(baseUrl, apiKey, model, prompt, size, imageData, cfg, duration, ratio) {
    const isI2v = model && /i2v/i.test(model);

    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',  // 必须开启异步模式
    };

    const body = buildVideoRequestBody(model, prompt, size, imageData, duration, ratio, isI2v);

    // 构建创建任务的 endpoint URL：若 baseUrl 未含完整路径则自动补全
    // 安全：用 URL pathname endsWith 替代 includes 子串匹配，防止 https://evil.com/video-synthesis-relay 绕过
    let requestUrl;
    let baseOrigin;
    try {
        const base = new URL(trimTrailingSlash(baseUrl));
        baseOrigin = base.origin;
        if (base.pathname.endsWith('/api/v1/services/aigc/video-generation/video-synthesis')) {
            requestUrl = base.href;
        } else {
            requestUrl = base.origin + '/api/v1/services/aigc/video-generation/video-synthesis';
        }
    } catch (e) {
        throw new Error('百炼 API 地址格式错误：' + e.message);
    }

    const taskId = await createVideoTask(requestUrl, headers, body);

    // 轮询查询任务状态：间隔 5 秒，最多 60 次（5 分钟超时）
    // encodeURIComponent 防止 taskId 含特殊字符破坏 URL 结构
    const queryUrl = baseOrigin + '/api/v1/tasks/' + encodeURIComponent(taskId);
    const queryHeaders = { 'Authorization': 'Bearer ' + apiKey };
    // 暴露 AbortController 给用户中断（ai:abort-video IPC）；退出软件时也会 abort
    const ac = new AbortController();
    videoAbortController = ac;
    try {
        const videoUrl = await pollVideoTask(queryUrl, queryHeaders, ac);
        return await saveVideoToDisk(videoUrl, cfg);
    } finally {
        // 仅当模块级变量仍指向本次请求时才清空，防止并发覆盖误清后续请求
        if (videoAbortController === ac) videoAbortController = null;
    }
}

// 中断当前视频生成轮询（用户点击取消按钮或退出软件时调用）
ipcMain.handle('ai:abort-video', () => {
    if (videoAbortController) {
        try { videoAbortController.abort(); } catch (_) {}
        videoAbortController = null;
        return true;
    }
    return false;
});

// 智能拼接 OpenAI 图片端点 URL
// 兼容 baseUrl 带 /v1（如 https://apihub.agnes-ai.com/v1）和不带 /v1（如 https://api.openai.com）两种写法
// 用 URL 对象解析路径，避免字符串 includes 在子串匹配时误判（如 baseUrl 含 /v1-images）
function buildOpenAiImageUrl(baseUrl, imagePath) {
    const trimmed = trimTrailingSlash(baseUrl);
    try {
        const u = new URL(trimmed);
        // 路径以 /v1、/v2 等版本号结尾 → 直接追加 /images/xxx
        if (/\/v\d+$/.test(u.pathname)) {
            return trimmed + imagePath;  // imagePath 形如 '/images/generations'
        }
    } catch (e) { /* URL 解析失败走下面的字符串拼接兜底 */ }
    // 路径不含版本号 → 补 /v1（向后兼容老配置）
    return trimmed + '/v1' + imagePath;
}

// 生成图片（根据 provider 分流到 OpenAI 或 DashScope 逻辑）
ipcMain.handle('ai:generate-image', async (_event, params) => {
    assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'ai:generate-image 入参');
    const s = loadSettings();
    const cfg = s.aiConfig || {};
    const provider = cfg.imageProvider || 'openai';

    if (provider === 'dashscope') {
        // ===== 阿里云百炼 Qwen-Image（同步 multimodal-generation 接口）=====
        const baseUrl = cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com';
        validateAiBaseUrl(baseUrl, '百炼图片 API 地址');
        return await withDecryptedKey(async () => {
            let k = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
            return k;
        }, async (apiKey) => {
            if (!baseUrl) throw new Error('百炼 API 地址未配置');
            if (!apiKey) throw new Error('API Key 未配置');
            const model = params.model || cfg.dashscopeModel || 'qwen-image-2.0-pro';
            // 处理尺寸：如果是 auto/默认 则不传 size，让 AI 自动选择
            let size = params.size || cfg.dashscopeSize || '2048*2048';
            if (size === 'auto' || size === '默认') {
                size = '';  // 空字符串表示让 AI 自动选择
            } else {
                size = size.replace('x', '*');
            }
            const prompt = params.prompt || '';
            if (!prompt) throw new Error('提示词不能为空');
            return await dashscopeGenerate(baseUrl, apiKey, model, prompt, size, params.imageData, cfg);
        });
    }

    // ===== OpenAI 标准 =====
    const baseUrl = cfg.imageBaseUrl || cfg.baseUrl || '';
    validateAiBaseUrl(baseUrl, 'OpenAI 图片 API 地址');
    return await withDecryptedKey(async () => {
        let k = await decryptSecret(cfg.imageEncryptedKey, 'API Key');
        if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
        return k;
    }, async (apiKey) => {
        if (!baseUrl) throw new Error('图片生成 API 地址未配置');
        if (!apiKey) throw new Error('API Key 未配置');
        const model = params.model || cfg.imageModel || 'dall-e-3';
        // 处理尺寸：auto/默认 时不传 size 参数，让 OpenAI 用默认值
        const rawSize = params.size || cfg.imageSize || '1024x1024';
        const useDefaultSize = (rawSize === 'auto' || rawSize === '默认' || rawSize === '');
        const size = useDefaultSize ? '1024x1024' : rawSize;
        const prompt = params.prompt || '';
        if (!prompt) throw new Error('提示词不能为空');

        let url, resp;
        if (params.imageData) {
            // 图生图: /images/edits (multipart)
            url = buildOpenAiImageUrl(baseUrl, '/images/edits');
            const base64Data = params.imageData.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const form = new FormData();
            form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'image.png');
            form.append('prompt', prompt);
            form.append('model', model);
            form.append('n', '1');
            form.append('size', size);
            // 不发送 response_format：Agnes/LiteLLM 等代理会返回 400 UnsupportedParamsError
            // extractImageFromResponse 已兼容 b64_json 和 url 两种响应格式
            resp = await safeFetch(url, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey },
                body: form,
                signal: AbortSignal.timeout(60000),
            });
        } else {
            // 文生图: /images/generations
            url = buildOpenAiImageUrl(baseUrl, '/images/generations');
            resp = await safeFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    n: 1,
                    size: size,
                    // 不发送 response_format：Agnes/LiteLLM 等代理会返回 400 UnsupportedParamsError
                    // extractImageFromResponse 已兼容 b64_json 和 url 两种响应格式
                }),
                signal: AbortSignal.timeout(60000),
            });
        }

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error('HTTP ' + resp.status + ': ' + (errText || resp.statusText));
        }
        const data = await resp.json();
        return await extractImageFromResponse(data, cfg);
    });
});

/**
 * 生成视频（仅支持阿里云百炼 wan2.7 系列）。
 * 接收参数：{ prompt, imageData, size, model, modelType, duration, ratio }
 * - modelType: 't2v'（文生视频）/ 'i2v'（图生视频）/ 'image'（图片，不会进入此 handler）
 *   优先级高于 model 参数；根据 modelType 从配置中读取对应模型名
 * - model: 直接指定模型名（优先级低于 modelType）
 * - duration: 视频时长（秒），3-15，默认 5
 * - ratio: 视频宽高比，16:9/9:16/1:1/4:3/3:4，默认 16:9
 * - i2v 模型会自动上传本地图片到百炼临时存储获取 oss:// URL，再调用图生视频接口。
 * 返回保存到本地的视频文件路径。
 */
ipcMain.handle('ai:generate-video', async (_event, params) => {
    assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'ai:generate-video 入参');
    // 防重入：视频生成耗时较长（轮询查询），快速连续点击会导致任务堆叠、配额浪费
    if (videoGenerating) {
        throw new Error('上一次视频生成仍在进行中，请等待完成后再试');
    }
    videoGenerating = true;
    try {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        // 视频生成只支持百炼
        // baseUrl 三级 fallback：视频专用 → 图片共用百炼 → 官方默认
        // （老配置未填 dashscopeVideoBaseUrl 时自动回退，不影响已有用户）
        const baseUrl = cfg.dashscopeVideoBaseUrl || cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com';
        validateAiBaseUrl(baseUrl, '百炼视频 API 地址');
        return await withDecryptedKey(async () => {
            // key 三级 fallback：视频专用 Key → 图片共用百炼 Key → 聊天通用 Key
            let k = await decryptSecret(cfg.dashscopeVideoEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
            return k;
        }, async (apiKey) => {
            if (!baseUrl) throw new Error('百炼 API 地址未配置');
            if (!apiKey) throw new Error('API Key 未配置');

            // 模型选择：优先用 modelType 从配置读取，其次用 params.model，最后根据有无图片选择
            let model = params.model;
            if (!model) {
                if (params.modelType === 't2v') {
                    model = cfg.videoT2vModel || 'wan2.7-t2v-2026-04-25';
                } else if (params.modelType === 'i2v') {
                    model = cfg.videoI2vModel || 'wan2.7-i2v-2026-04-25';
                } else {
                    // 未指定 modelType，根据有无图片选择
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
            // i2v 模型会在 dashscopeGenerateVideo 内部上传图片到百炼临时存储
            return await dashscopeGenerateVideo(baseUrl, apiKey, model, prompt, size, params.imageData, cfg, duration, ratio);
        });
    } finally {
        videoGenerating = false;
        // apiKey 清理交给 withDecryptedKey 出作用域 GC
    }
});

/* ==================== TTS 语音工坊：合成业务 IPC ====================
 * 设计：主进程负责所有百炼 HTTP 请求与音频落盘；渲染进程只管 UI 与 <audio> 播放。
 * 音频通过自定义 ttsfile:// 协议加载（非 file://，非 base64），符合 CSP 与最小传输约束。
 * API Key 加密落盘 + 掩码回传，复用现有 encryptApiKey/maskCred/isMaskedCred 三件套。
 * ============================================================================= */

// TTS 合成防重入标志（避免快速连续点击导致任务堆叠、配额浪费）
let ttsSynthesizing = false;

// ===== TTS 业务 IPC Handler =====

// 1. 文本→语音合成（核心 handler，涉网 + 涉密钥）
ipcMain.handle('tts:synthesize', tryWrap(async (_event, params) => {
    assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'tts:synthesize 入参');
    // 防重入：合成耗时 3-10 秒，快速连续点击会导致任务堆叠、配额浪费
    if (ttsSynthesizing) {
        throw new Error('上一次语音合成仍在进行中，请等待完成后再试');
    }
    ttsSynthesizing = true;
    try {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        // baseUrl 三级 fallback：tts 专用 → 图片共用百炼 → 官方默认
        const baseUrl = cfg.ttsBaseUrl || cfg.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com';
        validateAiBaseUrl(baseUrl, 'TTS API 地址');

        return await withDecryptedKey(async () => {
            // key 三级 fallback：tts 专用 → 图片共用百炼 → 聊天通用
            let k = await decryptSecret(cfg.ttsEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.dashscopeEncryptedKey, 'API Key');
            if (!k) k = await decryptSecret(cfg.encryptedKey, 'API Key');
            return k;
        }, async (apiKey) => {
            if (!baseUrl) throw new Error('百炼 TTS API 地址未配置');
            if (!apiKey) throw new Error('API Key 未配置，请在设置面板的语音模型配置中填写');

            const text = params.text || '';
            // 项目硬约束：TTS 文本上限 1000 字符，防超长文本导致合成超时/配额浪费
            if (text.length > 1000) throw new Error('TTS 文本超出 1000 字符限制（当前 ' + text.length + ' 字符）');
            // 音色：仅使用渲染进程传入的 voice，不回退到 cfg.ttsVoice
            // 原因：cfg.ttsVoice 可能在用户切换模型后变为过期值（旧模型音色与新模型不匹配），回退会导致 411 Engine error
            // 渲染进程已实现音色持久化（防抖保存 + initTtsVoiceSelect 恢复），voice 始终与当前模型匹配
            const voice = params.voice || '';
            // 模型 cosyvoice-v1，情感控制通过 parameters.instruct 字段实现
            let model = params.model || cfg.ttsModel || 'cosyvoice-v1';
            const instruct = params.instruct || '';
            const format = params.format || cfg.ttsFormat || 'mp3';

            // 调百炼 TTS Service（SSRF 校验 + fetch + 落盘）
            const result = await dashscopeTts(baseUrl, apiKey, model, voice, text, instruct, format);
            // 合成成功后自动保存音频到统一保存路径（图片/视频/TTS 共用 imageSavePath）
            try {
                const saveDir = (cfg.imageSavePath || cfg.dashscopeSavePath) || '';
                if (saveDir) {
                    // 从 ttsfile:// URL 解析本地文件路径
                    const ttsUrl = new URL(result.url);
                    const cacheDir = getTtsCacheDir();
                    const cacheFile = decodeURIComponent(ttsUrl.pathname.slice(1));
                    const srcPath = path.join(cacheDir, cacheFile);
                    if (fs.existsSync(srcPath)) {
                        if (!fs.existsSync(saveDir)) { fs.mkdirSync(saveDir, { recursive: true }); }
                        const ext = path.extname(cacheFile) || '.mp3';
                        const autoName = 'tts_' + Date.now() + ext;
                        fs.copyFileSync(srcPath, path.join(saveDir, autoName));
                        console.log('[TTS] 音频已自动保存到:', path.join(saveDir, autoName));
                    }
                }
            } catch (autoErr) {
                // 自动保存失败不影响主流程（缓存里已有，用户可手动下载）
                console.warn('[TTS] 自动保存音频失败:', autoErr.message);
            }
            return { success: true, url: result.url, durationMs: result.durationMs };
        });
    } finally {
        ttsSynthesizing = false;
        // apiKey 清理交给 withDecryptedKey 出作用域 GC
    }
}));

// 2. 手动触发缓存清理（不涉网，调 cleanTtsCache）
ipcMain.handle('tts:cleanup-cache', tryWrap(async () => {
    const result = await cleanTtsCache();
    return { success: true, deleted: result.deleted };
}));

// 下载音频文件 —— 用 dialog.showSaveDialog 替代 <a download> blob（CSP 严格时 blob download 不可靠）
// 复用 chat:export-markdown 的模式：主进程弹保存对话框 + 同步落盘
ipcMain.handle('tts:save-audio', tryWrap(async (_event, { ttsUrl, suggestedName }) => {
    if (!ttsUrl || typeof ttsUrl !== 'string') throw new Error('音频 URL 无效');
    // 从 ttsfile:// URL 解析本地文件路径（与 ttsfile protocol handler 同款校验）
    const url = new URL(ttsUrl);
    const dir = getTtsCacheDir();
    const fileName = decodeURIComponent(url.pathname.slice(1));
    const filePath = path.normalize(path.join(dir, fileName));
    // 路径穿越防护
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) {
        throw new Error('音频文件路径非法');
    }
    if (!fs.existsSync(filePath)) throw new Error('音频文件不存在，可能已被缓存清理');
    // 弹保存对话框
    const ext = path.extname(filePath).slice(1) || 'mp3';
    const safeName = (suggestedName || 'tts_audio').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const result = await dialog.showSaveDialog({
        title: '保存语音文件',
        defaultPath: safeName + '_' + Date.now() + '.' + ext,
        filters: [
            { name: '音频文件', extensions: [ext] },
            { name: '所有文件', extensions: ['*'] }
        ]
    });
    if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
    }
    // 同步复制文件到用户选择的路径
    fs.copyFileSync(filePath, result.filePath);
    return { success: true, path: result.filePath };
}));

/* ==================== 音乐模块 IPC Handler（V7.4 P0 骨架）====================
 * 设计与 TTS 同构：tryWrap 统一异常捕获，主进程负责文件 I/O，渲染进程零 base64 内存占用。
 * P0 阶段实现：文件选择对话框、文件夹扫描、播放列表持久化、元数据解析骨架。
 * 元数据解析（music-metadata-browser）在 P2 阶段接入，P0 仅返回文件名与大小。
 * 安全：
 *   - 文件路径必须为绝对路径，扩展名在白名单内
 *   - IPC 载荷大小校验（复用 assertPayloadSize）
 *   - 播放列表写入使用 saveJSON 原子写
 * ======================================================================== */

// 支持的音频扩展名白名单（与 musicfile:// 协议 audio 分支保持一致）
const MUSIC_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.weba', '.webm'];

// 文件选择对话框：返回用户挑选的音频文件路径列表
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
    // 异步 stat 收集文件大小，过滤非音频扩展名
    const files = [];
    for (const p of result.filePaths) {
        const ext = path.extname(p).toLowerCase();
        if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) continue;
        try {
            const st = await fs.promises.stat(p);
            if (st.isFile()) files.push({ filePath: p, size: st.size });
        } catch (_) { /* 跳过无法访问的文件 */ }
    }
    return { success: true, files };
}));

// 文件夹选择对话框：返回用户挑选的文件夹路径
ipcMain.handle('music:pick-folder', tryWrap(async () => {
    const result = await dialog.showOpenDialog({
        title: '选择音乐文件夹',
        properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { success: true, folderPath: '' };
    return { success: true, folderPath: result.filePaths[0] };
}));

// 递归扫描文件夹，返回所有音频文件路径（带大小）
// 限制：最多扫描 2000 个文件，防止超大目录卡住主进程
ipcMain.handle('music:scan-folder', tryWrap(async (_event, { folderPath, recursive }) => {
    if (!folderPath || typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
        throw new Error('文件夹路径无效');
    }
    assertPayloadSize({ folderPath, recursive }, MAX_IPC_PAYLOAD_SIZE, 'music:scan-folder');
    const doRecursive = recursive !== false;  // 默认递归
    const MAX_FILES = 2000;
    const files = [];
    const walk = async (dir, depth) => {
        if (files.length >= MAX_FILES) return;
        let entries;
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
        catch (_) { return; }  // 权限/不存在等跳过
        for (const entry of entries) {
            if (files.length >= MAX_FILES) return;
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (MUSIC_AUDIO_EXTENSIONS.includes(ext)) {
                    try {
                        const st = await fs.promises.stat(fullPath);
                        if (st.isFile()) files.push({ filePath: fullPath, size: st.size });
                    } catch (_) { /* 跳过 */ }
                }
            } else if (entry.isDirectory() && doRecursive && depth < 10) {
                await walk(fullPath, depth + 1);
            }
        }
    };
    await walk(folderPath, 0);
    return { success: true, files, truncated: files.length >= MAX_FILES };
}));

// 读取音频文件元数据（P1+P2 实现：接入 music-metadata-browser 解析 ID3/Vorbis 标签与封面）
// 解析失败时降级返回文件名作为标题，保证可用性
// 封面图保存到 userData/music/covers/{sha256}.{ext}，避免重复存储
// crypto 已在文件顶部 require；parseNodeStream 在顶部 require 区块统一引入

// MIME 类型映射（用于 music-metadata 的 mimeType 提示）
const MUSIC_MIME_MAP = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
    '.weba': 'audio/webm', '.webm': 'audio/webm'
};

ipcMain.handle('music:read-metadata', tryWrap(async (_event, { filePath }) => {
    if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('文件路径无效');
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) {
        throw new Error('不支持的音频格式：' + ext);
    }
    const st = await fs.promises.stat(filePath);
    if (!st.isFile()) throw new Error('路径不是文件');

    let title = path.basename(filePath, ext);
    let artist = '';
    let album = '';
    let duration = 0;
    let coverPath = '';

    try {
        // 使用 Node.js 可读流解析元数据（避免一次性读入大文件到内存）
        const mimeType = MUSIC_MIME_MAP[ext];
        const rs = fs.createReadStream(filePath);
        // 高水位标记设为 1MB，平衡读取效率与内存占用
        rs.highWaterMark = 1024 * 1024;
        try {
            const metadata = await parseNodeStream(rs, { mimeType });
            if (metadata.common) {
                title = metadata.common.title || title;
                artist = (metadata.common.artist && String(metadata.common.artist)) || '';
                album = (metadata.common.album && String(metadata.common.album)) || '';
            }
            if (metadata.format && metadata.format.duration) {
                duration = Math.round(metadata.format.duration);
            }
            // 封面图：取第一张，保存到 covers/ 目录（按内容哈希命名去重）
            if (metadata.common && metadata.common.picture && metadata.common.picture.length > 0) {
                const pic = metadata.common.picture[0];
                if (pic.data && pic.data.length > 5 * 1024 * 1024) {
                    // 封面图过大，跳过写入（防止恶意音频文件塞入超大图片导致磁盘/内存滥用）
                    console.warn('[Music] 封面图过大，跳过:', pic.data.length);
                } else {
                    const coverExt = pic.format === 'image/png' ? '.png'
                        : pic.format === 'image/webp' ? '.webp' : '.jpg';
                    // 用图片内容 SHA-256 作为文件名，相同封面自动去重
                    const hash = crypto.createHash('sha256').update(pic.data).digest('hex').slice(0, 32);
                    const coverFileName = hash + coverExt;
                    const coverFullPath = path.join(getMusicCoversDir(), coverFileName);
                    try {
                        await fs.promises.mkdir(getMusicCoversDir(), { recursive: true });
                        // 文件不存在时才写入（去重）
                        await fs.promises.access(coverFullPath).catch(async () => {
                            await fs.promises.writeFile(coverFullPath, pic.data);
                        });
                        coverPath = coverFullPath;
                    } catch (e) {
                        console.warn('[Music] 封面保存失败:', e.message);
                    }
                }
            }
        } finally {
            // 无论解析成功或失败，都要关闭流释放文件句柄（防止 FD 泄漏）
            rs.destroy();
        }
    } catch (e) {
        console.warn('[Music] 元数据解析失败，降级使用文件名:', filePath, e.message);
        // 降级：title 已设为文件名，其他字段为空
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
            size: st.size
        }
    };
}));

// 加载播放列表（启动时自动加载）
ipcMain.handle('music:load-playlist', tryWrap(async () => {
    const data = await loadJSON(getMusicPlaylistPath(), []);
    return { success: true, playlist: Array.isArray(data) ? data : [] };
}));

// 保存播放列表（1.5s 防抖由渲染进程负责，主进程直接落盘）
ipcMain.handle('music:save-playlist', tryWrap(async (_event, playlist) => {
    assertPayloadSize(playlist, MAX_IPC_PAYLOAD_SIZE, 'music:save-playlist');
    if (!Array.isArray(playlist)) throw new Error('播放列表格式无效');
    // 确保目录存在
    await fs.promises.mkdir(getMusicDir(), { recursive: true });
    await saveJSON(getMusicPlaylistPath(), playlist);
    return { success: true };
}));

/* ==================== FM 收音机模块 IPC Handler（V7.4 P0 骨架）====================
 * 设计：主进程负责 RadioBrowser API 调用（含 SSRF 校验 + 超时），渲染进程零跨域。
 * P0 阶段实现：配置加密存储、收藏/缓存本地读写、API 调用骨架。
 * 实际 HTTP 请求在 P3 阶段接入，P0 仅返回空数组与默认配置。
 * 安全：
 *   - API 基址必须通过 validateAiBaseUrl 校验（与 TTS 同款 SSRF 防护）
 *   - 电台流 URL 不在主进程校验（在渲染进程 <audio> 加载时由 Chromium 处理）
 *   - 配置加密存储：与 TTS 一致，避免明文落盘
 * ======================================================================== */

// RadioBrowser API 默认配置
const RADIO_DEFAULT_CONFIG = {
    apiBaseUrl: 'https://all.api.radio-browser.info',
    timeout: 10000,
    useProxy: false,
    defaultCountry: 'China',
    customStations: []  // 用户导入的自定义电台列表
};

// 注：原内置 BUILTIN_CN_HK_STATIONS 数组使用的均为 HLS .m3u8 流地址，
// Chromium 原生 <audio> 元素无法播放 HLS。改为通过 RadioBrowser API 的
// bycountryexact/China 与 bycountryexact/Hong%20Kong 端点实时拉取直接
// Icecast/Shoutcast MP3/AAC 流地址（详见 radio:get-topstations）。

// 加载 FM 配置（与 TTS 配置同级存储在 settings.aiConfig.radioConfig，加密字段无）
// 注意：FM 配置不含密钥，但仍按 TTS 模式存入 aiConfig 命名空间，避免散落
ipcMain.handle('radio:load-config', tryWrap(async () => {
    const s = loadSettings();
    const cfg = (s.aiConfig && s.aiConfig.radioConfig) || {};
    // 合并默认值（缺字段时回填）
    const merged = Object.assign({}, RADIO_DEFAULT_CONFIG, cfg);
    return { success: true, config: merged };
}));

// 保存 FM 配置（字段级合并，未传入字段保留原值，与 tts:save-config 同款逻辑）
ipcMain.handle('radio:save-config', tryWrap(async (_event, config) => {
    assertPayloadSize(config, MAX_IPC_PAYLOAD_SIZE, 'radio:save-config');
    const s = loadSettings();
    if (!s.aiConfig) s.aiConfig = {};
    const old = s.aiConfig.radioConfig || {};
    const next = Object.assign({}, old);
    if (config.apiBaseUrl !== undefined) {
        // cnhk-music 是内置数据源标识（非 URL），跳过 SSRF 校验
        // 其他值必须通过 validateAiBaseUrl + isSafePublicStreamUrl 校验
        if (config.apiBaseUrl === 'cnhk-music') {
            next.apiBaseUrl = 'cnhk-music';
        } else {
            // SSRF 校验：API 基址必须是 http(s) 公网地址（允许 http:，兼容自建 API）
            validateAiBaseUrl(config.apiBaseUrl, 'FM API 地址');
            if (config.apiBaseUrl && !isSafePublicStreamUrl(config.apiBaseUrl)) {
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
    if (config.useProxy !== undefined) next.useProxy = !!config.useProxy;
    if (config.defaultCountry !== undefined) next.defaultCountry = String(config.defaultCountry).slice(0, 64);
    if (config.customStations !== undefined) {
        if (!Array.isArray(config.customStations)) throw new Error('自定义电台列表格式无效');
        // 自定义电台字段裁剪与校验（防止渲染进程塞入异常结构）
        next.customStations = config.customStations.slice(0, 500).map(st => ({
            name: String(st.name || '').slice(0, 128),
            url: String(st.url || '').slice(0, 1024),
            homepage: String(st.homepage || '').slice(0, 512),
            favicon: String(st.favicon || '').slice(0, 512),
            country: String(st.country || '').slice(0, 64),
            tags: String(st.tags || '').slice(0, 256)
        })).filter(st => st.name && st.url)
        .filter(st => {
            // SSRF 校验：拒绝内网/本地/非 http(s) 地址（允许 http: 公网流，兼容 Icecast/Shoutcast 电台）
            if (!isSafePublicStreamUrl(st.url)) {
                console.warn('[radio] 自定义电台 URL 未通过 SSRF 校验，已剔除:', st.url);
                return false;
            }
            return true;
        });
    }
    s.aiConfig.radioConfig = next;
    await persistSettings();
    return { success: true };
}));

// ===== FM 电台 HTTP 工具与镜像选择（P3 阶段：真实接入 RadioBrowser API）=====
// 以下三个 helper 仅服务 radio:get-servers / radio:get-topstations / radio:search
// 不复用 TTS/AI 模块的 fetch 逻辑：RadioBrowser 要求带 User-Agent 头，且需要镜像回退

/**
 * 发起 GET 请求并解析 JSON 响应。
 * - 根据 URL 协议自动选择 https / http 模块
 * - 设置 User-Agent: StickyNotes/7.4（RadioBrowser 强制要求 UA，否则可能被限流）
 * - 超时自动中断（默认 10000ms）
 * - 非 2xx 状态码或 JSON 解析失败均 reject
 * @param {string} urlStr - 完整 URL
 * @param {number} [timeoutMs=10000] - 超时毫秒
 * @returns {Promise<{data: any, statusCode: number}>}
 */
function radioHttpGet(urlStr, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
        let parsed;
        try {
            parsed = new URL(urlStr);
        } catch (e) {
            return reject(new Error('URL 解析失败: ' + e.message));
        }
        // 仅允许 http/https 协议，防止 file:/ data: 等被误用
        const lib = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : null);
        if (!lib) return reject(new Error('不支持的协议: ' + parsed.protocol));
        let resRef = null;  // 超时时需要销毁 res，避免流挂死
        const req = lib.get(parsed, {
            headers: { 'User-Agent': 'StickyNotes/7.4', 'Accept': 'application/json' },
            timeout,
        }, (res) => {
            resRef = res;
            const chunks = [];
            let totalBytes = 0;
            const MAX_BODY = 5 * 1024 * 1024;  // 5MB 上限，防止 OOM
            res.on('data', (c) => {
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
                } catch (e) {
                    reject(new Error('JSON 解析失败: ' + e.message));
                }
            });
        });
        req.on('error', reject);
        // socket 空闲超时：直接中断并 reject，避免请求挂死
        req.on('timeout', () => {
            req.destroy();
            if (resRef) resRef.destroy();
            reject(new Error('请求超时 (' + timeout + 'ms): ' + urlStr));
        });
    });
}

/**
 * 从配置中选择一个 RadioBrowser 镜像基址。
 * - 若 apiBaseUrl 为官方 all.api 聚合地址，则随机挑一个直连子镜像（de1/nl1/at1）以加速
 * - 否则直接使用用户配置的 apiBaseUrl
 * @param {Object} cfg - 已合并默认值的 radio 配置
 * @returns {string} 形如 https://de1.api.radio-browser.info
 */
function radioGetMirror(cfg) {
    const base = (cfg && cfg.apiBaseUrl) || RADIO_DEFAULT_CONFIG.apiBaseUrl;
    if (base === 'https://all.api.radio-browser.info') {
        const mirrors = ['de1', 'nl1', 'at1'];
        const pick = mirrors[Math.floor(Math.random() * mirrors.length)];
        return 'https://' + pick + '.api.radio-browser.info';
    }
    return base;
}

/**
 * 将 RadioBrowser 原始 station 对象规范化为前端统一格式，并做字段裁剪与过滤。
 * - 过滤 url 为空 / 非 http(s) 的电台
 * - 字符串字段按上限裁剪，避免渲染进程被异常长字符串撑爆
 * @param {Object} raw - RadioBrowser 原始 station
 * @returns {Object|null} 规范化后的 station，或 null（不合法时丢弃）
 */
function radioNormalizeStation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const url = String(raw.url || raw.streamurl || '').slice(0, 1024);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const tags = Array.isArray(raw.tags) ? raw.tags.join(',') : String(raw.tags || '');
    return {
        name: String(raw.name || raw.stationname || '未知电台').slice(0, 128),
        url,
        favicon: String(raw.favicon || '').slice(0, 512),
        country: String(raw.country || '').slice(0, 64),
        tags: tags.slice(0, 256),
        bitrate: Number(raw.bitrate) || 0,
        codec: String(raw.codec || '').slice(0, 32),
        homepage: String(raw.homepage || '').slice(0, 512)
    };
}

/**
 * 将多个电台数组合并为一个，并按 URL 去重。
 * - 传入数组的顺序决定了去重后元素的优先级（先出现的 URL 保留，后出现的丢弃）
 * - 非数组参数静默跳过；url 为空的条目跳过
 * @param  {...Array} arrays - 多个 station 数组
 * @returns {Array} 去重后的 station 数组
 */
function dedupStationsByUrl(...arrays) {
    const seen = new Set();
    const result = [];
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

// 获取 RadioBrowser 可用镜像列表（P3：调用 /json/servers 真实接口）
// 失败时回退到 4 个内置默认镜像，保证渲染进程永远拿到可用列表
ipcMain.handle('radio:get-servers', tryWrap(async () => {
    const s = loadSettings();
    const cfg = Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
    try {
        // 调用 ${apiBaseUrl}/json/servers 获取镜像清单
        const { data } = await radioHttpGet(cfg.apiBaseUrl + '/json/servers', cfg.timeout);
        if (Array.isArray(data) && data.length > 0) {
            // RadioBrowser 返回 [{name, ip, ...}]，构造为 {name, url} 形式
            const servers = data
                .map(it => {
                    const name = String(it.name || '').slice(0, 64);
                    return { name, url: 'https://' + name + '.api.radio-browser.info' };
                })
                .filter(it => it.name);
            if (servers.length > 0) {
                return { success: true, servers };
            }
        }
    } catch (e) {
        // API 失败不抛错，走默认镜像回退
        console.error('[radio:get-servers] 获取镜像失败，回退默认:', e.message);
    }
    return {
        success: true,
        servers: [
            { name: 'de1', url: 'https://de1.api.radio-browser.info' },
            { name: 'nl1', url: 'https://nl1.api.radio-browser.info' },
            { name: 'at1', url: 'https://at1.api.radio-browser.info' },
            { name: 'all', url: 'https://all.api.radio-browser.info' }
        ]
    };
}));

// 获取热门电台（P3：调用 /json/stations/topvote/{limit}，带 7 天本地缓存）
// 流程：读缓存(7天有效) → 命中则返回 → 否则并行请求 topvote + China + HongKong
// （含镜像回退）→ 写缓存 → 合并去重（China/HK 前置 + 自定义 + topvote，按 URL 去重）
// 说明：原内置 BUILTIN_CN_HK_STATIONS 使用 HLS .m3u8 流（Chromium 无法播放），
//   改为实时拉取 RadioBrowser bycountryexact 端点，返回的均为直接 MP3/AAC 流地址。
ipcMain.handle('radio:get-topstations', tryWrap(async (_event, { limit } = {}) => {
    const s = loadSettings();
    const cfg = Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
    // limit 限制在 1-200，防止渲染进程传入异常值
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cachePath = getRadioCachePath();
    const custom = Array.isArray(cfg.customStations)
        ? cfg.customStations.map(radioNormalizeStation).filter(Boolean)
        : [];

    // 1) 读本地缓存（try/catch 防止缓存损坏导致整体失败）
    let cached = null;
    try {
        cached = await loadJSON(cachePath, null);
    } catch (e) {
        cached = null;  // 缓存损坏不致命，忽略后走 API
    }
    // 缓存命中条件：7 天内 + 有 stations + 有 chinaHk（新旧字段兼容）
    const cacheFresh = !!(cached && Array.isArray(cached.stations) && cached.fetchedAt
        && (Date.now() - cached.fetchedAt) < SEVEN_DAYS_MS);
    if (cacheFresh) {
        // 缓存命中：合并 China/HK（若有）+ 自定义 + topvote，按 URL 去重后返回
        const cachedChinaHk = Array.isArray(cached.chinaHk) ? cached.chinaHk : [];
        return { success: true, stations: dedupStationsByUrl(cachedChinaHk, custom, cached.stations), fromCache: true };
    }

    // 2) 缓存失效或不存在，并行请求 topvote + China + HongKong（含镜像回退）
    const mirror = radioGetMirror(cfg);
    const fallbacks = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
    const tryUrls = [mirror, ...fallbacks.filter(u => u !== mirror)];
    // 单端点拉取（依次尝试镜像列表）；全部失败返回 null
    const fetchFromApi = async (pathAndQuery) => {
        let lastErr = null;
        for (const base of tryUrls) {
            try {
                const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
                if (Array.isArray(data)) {
                    return data.map(radioNormalizeStation).filter(Boolean);
                }
            } catch (e) {
                lastErr = e;
            }
        }
        return null;
    };
    const [topRes, cnRes, hkRes] = await Promise.all([
        fetchFromApi('/json/stations/topvote/' + lim),
        fetchFromApi('/json/stations/bycountryexact/China?limit=50'),
        fetchFromApi('/json/stations/bycountryexact/Hong%20Kong?limit=30')
    ]);
    const topStations = topRes || [];
    const chinaHkStations = dedupStationsByUrl(cnRes || [], hkRes || []);

    // 3) 所有镜像均失败：回退旧缓存（即使过期）或返回 China/HK + 自定义（保证列表非空）
    if (topRes === null && cnRes === null && hkRes === null) {
        if (cached && Array.isArray(cached.stations) && cached.stations.length > 0) {
            const cachedChinaHk = Array.isArray(cached.chinaHk) ? cached.chinaHk : [];
            return { success: true, stations: dedupStationsByUrl(cachedChinaHk, custom, cached.stations), fromCache: true, note: 'API 不可用，使用旧缓存' };
        }
        return { success: true, stations: dedupStationsByUrl(chinaHkStations, custom), fromCache: false, note: 'API 不可用且无缓存' };
    }

    // 4) 写入缓存（topvote + China/HK 一起缓存，try/catch 防止磁盘问题导致整体失败）
    try {
        await fs.promises.mkdir(getRadioDir(), { recursive: true });
        await saveJSON(cachePath, { stations: topStations, chinaHk: chinaHkStations, fetchedAt: Date.now() });
    } catch (e) {
        console.error('[radio:get-topstations] 写缓存失败:', e.message);
    }

    // 5) 合并返回（China/HK 前置 + 自定义 + topvote，按 URL 去重）
    return { success: true, stations: dedupStationsByUrl(chinaHkStations, custom, topStations), fromCache: false };
}));

// ==================== 中文/香港音乐电台数据源（cnhk-music）====================
// 设计：精选列表（保底，无需网络）+ RadioBrowser /search 高级筛选（动态补充）
// 精选列表中的流地址均为直接 MP3/AAC 流（Chromium <audio> 可播放，非 HLS）
// 维护说明：流地址失效时需手动更新；RadioBrowser 筛选结果会自动补充
// 注：中国大陆多数省级电台仅提供 HLS(.m3u8) 流，Chromium <audio> 无法播放，
//     因此精选列表以香港 RTHK 直流为主，大陆电台依赖 RadioBrowser 收录的直接流
const BUILTIN_CN_HK_MUSIC_STATIONS = [
    // 香港电台 RTHK 系列（HTTP 直接 MP3 流，Chromium 可播放）
    { name: 'RTHK Radio 1', url: 'http://rthkaudio1.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,news', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 2', url: 'http://rthkaudio2.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,pop', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 3', url: 'http://rthkaudio3.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,english', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' },
    { name: 'RTHK Radio 4', url: 'http://rthkaudio4.rthk.hk:80/', favicon: '', country: 'Hong Kong', tags: 'music,classical', bitrate: 128, codec: 'MP3', homepage: 'https://www.rthk.hk' }
];

/**
 * 从 RadioBrowser /json/stations/search 端点拉取 CN/HK 音乐电台（高级筛选）
 * - 并行请求 countrycode=CN 和 countrycode=HK，tag=music，hidebroken=true
 * - 客户端二次过滤：剔除 HLS 流（Chromium 无法播放）、剔除低码率
 * - 复用镜像回退机制（与 radio:get-topstations 一致）
 * @param {Object} cfg - 配置（含 timeout）
 * @param {Array<string>} tryUrls - 镜像基址列表（已按优先级排序）
 * @returns {Promise<Array|null>} 电台数组；全部镜像失败返回 null
 */
async function fetchCnHkMusicFromRadioBrowser(cfg, tryUrls) {
    // 单端点拉取（依次尝试镜像列表）
    const fetchFromApi = async (pathAndQuery) => {
        let lastErr = null;
        for (const base of tryUrls) {
            try {
                const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
                if (Array.isArray(data)) {
                    return data.map(radioNormalizeStation).filter(Boolean);
                }
            } catch (e) {
                lastErr = e;
            }
        }
        return null;
    };
    // 并行请求 CN + HK（GET 方式，参数通过 query string 传递）
    const [cnRes, hkRes] = await Promise.all([
        fetchFromApi('/json/stations/search?countrycode=CN&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=50'),
        fetchFromApi('/json/stations/search?countrycode=HK&tag=music&hidebroken=true&order=clickcount&reverse=true&limit=30')
    ]);
    // 全部失败返回 null
    if (cnRes === null && hkRes === null) return null;
    // 合并 + 客户端二次过滤：剔除 HLS 流、剔除低码率（< 64kbps）
    const merged = dedupStationsByUrl(cnRes || [], hkRes || []);
    return merged.filter(s => {
        // 剔除 HLS 流（Chromium <audio> 无法播放 .m3u8）
        const codec = (s.codec || '').toUpperCase();
        if (codec.indexOf('HLS') >= 0 || codec.indexOf('MPEGURL') >= 0) return false;
        if (/\.m3u8(\?|$)/i.test(s.url)) return false;
        // 剔除低码率（< 64kbps，音质过差）
        if (s.bitrate && s.bitrate < 64) return false;
        return true;
    });
}

// 获取中文/香港音乐电台（精选 + RadioBrowser 筛选，带 7 天缓存）
// 数据源标识：config.apiBaseUrl === 'cnhk-music'
// 流程：读缓存(7天) → 命中返回 → 否则并行请求 RadioBrowser 筛选 → 合并精选列表 → 写缓存 → 返回
// RadioBrowser 失败时仅返回精选列表 + custom（保证列表非空）
ipcMain.handle('radio:get-cnhk-music-stations', tryWrap(async (_event, { limit } = {}) => {
    const s = loadSettings();
    const cfg = Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cachePath = getRadioCachePath();
    const custom = Array.isArray(cfg.customStations)
        ? cfg.customStations.map(radioNormalizeStation).filter(Boolean)
        : [];
    const curated = BUILTIN_CN_HK_MUSIC_STATIONS.map(radioNormalizeStation).filter(Boolean);

    // 1. 读本地缓存（cnhkMusic 字段独立于 topStations，避免互相污染）
    let cached = null;
    try {
        cached = await loadJSON(cachePath, null);
    } catch (e) {
        cached = null;
    }
    const cachedCnHk = cached && Array.isArray(cached.cnhkMusic) ? cached.cnhkMusic : null;
    const cacheFresh = !!(cachedCnHk && cached.fetchedAtCnHk
        && (Date.now() - cached.fetchedAtCnHk) < SEVEN_DAYS_MS);
    if (cacheFresh) {
        return { success: true, stations: dedupStationsByUrl(curated, custom, cachedCnHk).slice(0, lim), fromCache: true };
    }

    // 2. 缓存失效 → 并行请求 RadioBrowser 筛选（复用镜像回退机制）
    // cnhk-music 数据源使用默认 RadioBrowser 镜像（config.apiBaseUrl === 'cnhk-music' 不是有效 URL）
    const radioCfg = Object.assign({}, cfg, { apiBaseUrl: RADIO_DEFAULT_CONFIG.apiBaseUrl });
    const mirror = radioGetMirror(radioCfg);
    const fallbacks = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
    const tryUrls = [mirror, ...fallbacks.filter(u => u !== mirror)];
    const rbStations = await fetchCnHkMusicFromRadioBrowser(cfg, tryUrls);

    // 3. RadioBrowser 失败：仅返回精选 + custom（保证列表非空）
    if (rbStations === null) {
        if (cachedCnHk && cachedCnHk.length > 0) {
            return { success: true, stations: dedupStationsByUrl(curated, custom, cachedCnHk).slice(0, lim), fromCache: true, note: 'API 不可用，使用旧缓存' };
        }
        return { success: true, stations: dedupStationsByUrl(curated, custom).slice(0, lim), fromCache: false, note: 'API 不可用，仅显示精选电台' };
    }

    // 4. 写入缓存（与现有 topStations 缓存合并存储，字段独立）
    try {
        await fs.promises.mkdir(getRadioDir(), { recursive: true });
        const newCache = Object.assign({}, cached || {}, {
            cnhkMusic: rbStations,
            fetchedAtCnHk: Date.now()
        });
        await saveJSON(cachePath, newCache);
    } catch (e) {
        console.error('[radio:get-cnhk-music-stations] 写缓存失败:', e.message);
    }

    // 5. 合并返回：curated 前置 + custom + RadioBrowser 唯一项后置
    return { success: true, stations: dedupStationsByUrl(curated, custom, rbStations).slice(0, lim), fromCache: false };
}));

// 按来源获取电台（P4 阶段：刷新按钮循环切换 5 种数据源）
// source 取值：'topvote' | 'topclick' | 'recent' | 'bycountry-china' | 'bycountry-hongkong'
// 端点映射：
//   topvote          → /json/stations/topvote/{limit}
//   topclick         → /json/stations/topclick/{limit}
//   recent           → /json/stations/lastclick/{limit}
//   bycountry-china  → /json/stations/bycountryexact/China?limit={limit}
//   bycountry-hongkong → /json/stations/bycountryexact/Hong%20Kong?limit={limit}
// 返回结果前置合并自定义电台并按 URL 去重；bycountry-* 来源直接返回 API 直接流地址（Chromium 可播放）
ipcMain.handle('radio:get-stations-by-source', tryWrap(async (_event, { source, limit } = {}) => {
    const s = loadSettings();
    const cfg = Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
    const lim = Math.max(1, Math.min(200, Number(limit) || 100));
    const src = String(source || 'topvote').slice(0, 32);

    // 根据来源构造端点路径（路径参数 vs 查询参数）
    let pathAndQuery;
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
            // 未知来源回退到 topvote
            pathAndQuery = '/json/stations/topvote/' + lim;
    }

    // 镜像回退：依次尝试选中镜像 + de1/nl1/at1
    const mirror = radioGetMirror(cfg);
    const fallbacks = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
    const tryUrls = [mirror, ...fallbacks.filter(u => u !== mirror)];
    let lastErr = null;
    let stations = null;
    for (const base of tryUrls) {
        try {
            const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
            if (Array.isArray(data)) {
                stations = data.map(radioNormalizeStation).filter(Boolean);
                break;
            }
        } catch (e) {
            lastErr = e;
        }
    }

    // 前置合并自定义电台并按 URL 去重（API 返回的均为直接流地址，Chromium 可播放）
    const custom = Array.isArray(cfg.customStations)
        ? cfg.customStations.map(radioNormalizeStation).filter(Boolean)
        : [];
    if (stations === null) {
        // 所有镜像失败：仅返回自定义电台（可能为空）
        return { success: true, stations: dedupStationsByUrl(custom), source: src, note: 'API 不可用: ' + (lastErr ? lastErr.message : 'unknown') };
    }
    return { success: true, stations: dedupStationsByUrl(custom, stations), source: src };
}));

// 搜索电台（P3：按 keyword/country/tag 调用对应端点，搜索结果不缓存）
// 端点优先级：keyword(byname) > country(bycountry) > tag(bytag) > topvote 回退
ipcMain.handle('radio:search', tryWrap(async (_event, { keyword, country, tag, limit } = {}) => {
    const s = loadSettings();
    const cfg = Object.assign({}, RADIO_DEFAULT_CONFIG, (s.aiConfig && s.aiConfig.radioConfig) || {});
    const lim = Math.max(1, Math.min(200, Number(limit) || 50));

    // 根据传入参数选择端点路径（topvote 回退时 limit 走路径参数，其余走 ?limit= 查询参数）
    let pathAndQuery;
    if (keyword) {
        pathAndQuery = '/json/stations/byname/' + encodeURIComponent(String(keyword).slice(0, 128)) + '?limit=' + lim;
    } else if (country) {
        pathAndQuery = '/json/stations/bycountry/' + encodeURIComponent(String(country).slice(0, 64)) + '?limit=' + lim;
    } else if (tag) {
        pathAndQuery = '/json/stations/bytag/' + encodeURIComponent(String(tag).slice(0, 64)) + '?limit=' + lim;
    } else {
        // 无任何过滤条件：回退到热门电台
        pathAndQuery = '/json/stations/topvote/' + lim;
    }

    // 镜像回退：依次尝试选中镜像 + de1/nl1/at1
    const mirror = radioGetMirror(cfg);
    const fallbacks = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
    const tryUrls = [mirror, ...fallbacks.filter(u => u !== mirror)];
    let lastErr = null;
    for (const base of tryUrls) {
        try {
            const { data } = await radioHttpGet(base + pathAndQuery, cfg.timeout);
            if (Array.isArray(data)) {
                const stations = data.map(radioNormalizeStation).filter(Boolean);
                return { success: true, stations };  // 搜索结果不缓存
            }
        } catch (e) {
            lastErr = e;
        }
    }
    // 所有镜像失败：返回空数组（搜索结果不缓存，避免脏数据）
    return { success: true, stations: [], note: '搜索失败: ' + (lastErr ? lastErr.message : 'unknown') };
}));

// 加载收藏列表
ipcMain.handle('radio:load-favorites', tryWrap(async () => {
    const data = await loadJSON(getRadioFavoritesPath(), []);
    return { success: true, favorites: Array.isArray(data) ? data : [] };
}));

// 保存收藏列表
ipcMain.handle('radio:save-favorites', tryWrap(async (_event, favorites) => {
    assertPayloadSize(favorites, MAX_IPC_PAYLOAD_SIZE, 'radio:save-favorites');
    if (!Array.isArray(favorites)) throw new Error('收藏列表格式无效');
    await fs.promises.mkdir(getRadioDir(), { recursive: true });
    await saveJSON(getRadioFavoritesPath(), favorites);
    return { success: true };
}));

// 清除电台缓存（用户在设置中点击"清除缓存"按钮时调用）
ipcMain.handle('radio:clear-cache', tryWrap(async () => {
    try {
        await fs.promises.unlink(getRadioCachePath());
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;  // 文件不存在属正常，其他错误抛出
    }
    return { success: true };
}));

/* ==================== 应用日志 IPC（全局化升级）====================
 * 供"查看日志"窗口调用：获取/清空/复制日志，以及渲染进程/子窗口批量上报。
 * 注意：logs:copy-all 在主进程用 clipboard.writeText 完成，绕过渲染进程
 *       的 CSP 限制（navigator.clipboard 在严格 CSP 下可能被拦）。
 * 新增：
 *   - log:report：接收渲染进程/子窗口批量上报的日志（tryWrap 包装）
 *   - logs:get/refresh：支持 {source?, level?} 过滤参数
 *   - logs:meta：返回日志统计信息（按级别/来源计数 + 当前文件路径）
 * ================================================== */

// 渲染进程/子窗口批量上报日志
// 入参：{source: string, entries: [{level, msg, ts}, ...]}
// 安全加固：source 白名单防日志注入；entries 数量+msg 长度限制防 DoS 冻结主进程
// 安全：source 仅作标签，不参与路径拼接；entries 大小由 IPC payload 上限约束
const ALLOWED_LOG_SOURCES = ['main', 'renderer', 'popout-note', 'popout-todo', 'music', 'radio'];
// MAX_REPORT_ENTRIES / MAX_ENTRY_MSG_LEN 已迁移至 logger.js（logger.MAX_REPORT_ENTRIES / logger.MAX_ENTRY_MSG_LEN）
// 抽取共享处理逻辑，供异步 handle 和同步 on 复用
function processLogReport(data) {
    if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
        return { success: true, accepted: 0 };
    }
    // source 白名单校验，防 ] / \n 注入伪造日志行
    const source = (typeof data.source === 'string' && ALLOWED_LOG_SOURCES.includes(data.source)) ? data.source : 'unknown';
    // entries 数量截断，防恶意/有缺陷渲染进程撑爆主进程
    let entries = data.entries;
    if (entries.length > logger.MAX_REPORT_ENTRIES) entries = entries.slice(0, logger.MAX_REPORT_ENTRIES);
    let accepted = 0;
    for (const entry of entries) {
        if (!entry || typeof entry.msg !== 'string') continue;
        // 单条 msg 长度截断，防超长字符串撑大 logBuffer
        let msg = entry.msg;
        if (msg.length > logger.MAX_ENTRY_MSG_LEN) msg = msg.slice(0, logger.MAX_ENTRY_MSG_LEN);
        const level = ['INFO', 'WARN', 'ERROR'].includes(entry.level) ? entry.level : 'INFO';
        logger.appendLog(level, [msg], source);
        accepted++;
    }
    return { success: true, accepted };
}

ipcMain.handle('log:report', tryWrap(async (_event, data) => processLogReport(data)));

// 崩溃兜底同步上报通道（sendSync 配对，保证进程死亡前"遗言"100%送达）
ipcMain.on('log:report-sync', (event, data) => {
    try {
        event.returnValue = processLogReport(data);
    } catch (e) {
        console.error('[IPC ERROR]', e);
        logger.appendLog('ERROR', ['[log:report-sync]', e.message], 'main');
        event.returnValue = { success: false, message: e.message };
    }
});

// 获取日志文本（支持可选 {source?, level?} 过滤）
// 兼容无参调用：不传 filter 返回全部
ipcMain.handle('logs:get', (_e, filter) => {
    try {
        return logger.getAllLogs(filter);
    } catch (e) {
        return '读取日志失败: ' + e.message;
    }
});

// 刷新日志：先把待写队列刷入文件，再返回最新内容（支持过滤）
ipcMain.handle('logs:refresh', (_e, filter) => {
    try {
        logger.flushLogFile();
        return logger.getAllLogs(filter);
    } catch (e) {
        return '刷新日志失败: ' + e.message;
    }
});

// 获取日志元数据（统计信息 + 当前文件路径），供 UI 显示
ipcMain.handle('logs:meta', tryWrap(async () => {
    const stats = logger.getLogStats();
    let currentFile = '';
    try { currentFile = logger.getWritableLogPath(); } catch (_) {}
    return {
        success: true,
        total: stats.total,
        byLevel: stats.byLevel,
        bySource: stats.bySource,
        logDir: logger.getLogDir(),
        currentFile: currentFile,
    };
}));

// 复制全部日志到剪贴板（主进程 clipboard，绕过 CSP）
ipcMain.handle('logs:copy-all', (_e, text) => {
    try {
        const content = typeof text === 'string' ? text : logger.getAllLogs();
        if (!content) return { success: false, message: '日志为空' };
        // 大小校验，防止撑爆剪贴板
        if (content.length > MAX_CLIPBOARD_TEXT_SIZE) {
            return { success: false, message: '日志内容过大（' + Math.round(content.length / 1024) + 'KB），请清空后重试' };
        }
        clipboard.writeText(content);
        return { success: true, message: '已复制 ' + content.length + ' 字符' };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

// 清空日志（内存 + 当天文件）
ipcMain.handle('logs:clear', () => {
    try {
        logger.clearAllLogs();
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

/* ==================== 应用生命周期 ==================== */

app.whenReady().then(async () => {
    // 初始化日志文件（必须在 userData 目录就绪后调用）
    try { logger.initLogFile(); } catch (_) {}

    // 静默清理过期日志文件（7天前），异步不阻塞启动
    // 失败仅 console.error 吞掉，不影响应用启动
    try { logger.cleanOldLogs(); } catch (e) { console.error('启动清理过期日志失败:', e.message); }

    // 静默清理 TTS 音频缓存（7天过期 + 100MB 上限，异步不阻塞启动）
    // 失败仅 console.error 吞掉，不影响应用启动
    try { cleanTtsCache(); } catch (e) { console.error('启动清理 TTS 缓存失败:', e.message); }

    // 一次性加载设置（含 opacity 等）
    const s = loadSettings();

    /* ===== 安全：设置 session 权限处理器，默认拒绝所有敏感权限请求 =====
     * 防止 XSS/导航漏洞后恶意页面调用 getUserMedia（摄像头/麦克风）、
     * 地理位置、通知、剪贴板读等 API 进行隐私窃取。
     * 桌面便签应用无需任何浏览器权限，全部拒绝。
     */
    try {
        session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
            // 拒绝所有权限请求（摄像头、麦克风、通知、地理位置、剪贴板、媒体等）
            cb(false);
        });
        session.defaultSession.setPermissionCheckHandler(() => false);
    } catch (e) { console.error('设置权限处理器失败:', e.message); }

    // 旧版明文凭据自动迁移：检测到明文 accessKey/secretKey/pass 就加密写回并删除明文
    // safeStorage 不可用时静默跳过（不阻断启动），等用户登录系统账户后下次再迁移
    try { await migrateLegacyCreds(); } catch (e) {
        console.warn('旧版凭据迁移失败（safeStorage 可能不可用）：', e.message);
    }

    /* ===== chatimg 协议处理：读取 chat-images 目录下的图片返回给渲染进程 =====
     * URL 形如 chatimg://chat-images/<filename>，filename 经 encodeURIComponent 编码。
     * 安全：解析后路径必须仍在 chat-images 目录内，杜绝路径穿越（../../etc/passwd 之类）。
     */
    protocol.handle('chatimg', async (request) => {
        try {
            const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
            return await serveLocalFile(request.url, getChatImagesDir(), mimeMap, { maxSize: MAX_IMAGE_SIZE });
        } catch (e) {
            console.error('chatimg 协议读取失败:', e.message);
            return new Response('Server Error', { status: 500 });
        }
    });

    /* ===== ttsfile 协议处理：读取 tts_cache 目录下的音频返回给渲染进程 =====
     * URL 形如 ttsfile://tts_cache/<filename>，filename 经 encodeURIComponent 编码。
     * 安全与 chatimg 同构：
     *   1. 路径穿越防护：normalize 后路径必须仍在 tts_cache 目录内
     *   2. realpath 二次校验：解析符号链接后仍必须在目录内（防 symlink 逃逸）
     *   3. 异步 stat + 文件类型 + 大小校验（≤ 20MB，复用 MAX_IMAGE_SIZE 常量思路）
     *   4. 异步 readFile，避免 readFileSync 阻塞主进程导致多音频加载时 UI 卡顿
     */
    protocol.handle('ttsfile', async (request) => {
        try {
            const mimeMap = {
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4'
            };
            return await serveLocalFile(request.url, getTtsCacheDir(), mimeMap, {
                maxSize: MAX_IMAGE_SIZE,
                defaultMime: 'audio/mpeg',
                requireRealpath: true
            });
        } catch (e) {
            console.error('ttsfile 协议读取失败:', e.message);
            return new Response('Server Error', { status: 500 });
        }
    });

    /* ===== musicfile 协议处理：读取用户挑选的本地音乐文件与专辑封面 =====
     * URL 形如：
     *   musicfile://audio/<encodeURIComponent(绝对路径)>   音频文件
     *   musicfile://cover/<encodeURIComponent(绝对路径)>    封面图片
     * 安全要点（与 ttsfile 同构 + 路径前缀白名单）：
     *   1. host 区分类型：audio / cover，其他一律 403
     *   2. 路径解码后必须为绝对路径，且扩展名必须在白名单内
     *   3. realpath 二次校验：解析符号链接后必须仍为常规文件（不做目录约束，因用户可挑任意路径）
     *   4. 文件大小限制：音频 50MB / 封面 5MB，防止超大文件撑爆渲染进程
     *   5. 异步读取，避免阻塞主进程
     * 注意：与 ttsfile 不同，本地音乐不在固定目录内（用户挑选），不能用 startsWith(dir) 校验，
     *       改用 realpath + isFile + 扩展名白名单三重校验。
     */
    protocol.handle('musicfile', async (request) => {
        try {
            const url = new URL(request.url);
            const kind = url.hostname;  // 'audio' 或 'cover'
            const audioExtMap = {
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
                '.weba': 'audio/webm', '.webm': 'audio/webm'
            };
            const coverExtMap = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'
            };
            let mimeMap, maxSize;
            if (kind === 'audio') {
                mimeMap = audioExtMap;
                maxSize = 50 * 1024 * 1024;  // 50MB
            } else if (kind === 'cover') {
                mimeMap = coverExtMap;
                maxSize = 5 * 1024 * 1024;   // 5MB
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
            // realpath 校验：解析符号链接，且必须为常规文件
            let realPath;
            try {
                realPath = await fs.promises.realpath(filePath);
            } catch (_) {
                return new Response('Not Found', { status: 404 });
            }
            const fileStat = await fs.promises.stat(realPath);
            if (!fileStat.isFile()) {
                return new Response('Not Found', { status: 404 });
            }
            if (fileStat.size > maxSize) {
                return new Response('Payload Too Large', { status: 413 });
            }
            const buffer = await fs.promises.readFile(realPath);
            return new Response(buffer, {
                headers: { 'Content-Type': mimeMap[ext], 'Cache-Control': 'max-age=3600' }
            });
        } catch (e) {
            console.error('musicfile 协议读取失败:', e.message);
            return new Response('Server Error', { status: 500 });
        }
    });

    createWindow();
    createTray();
    scheduleAutoSync();  // 启动自动同步定时器

    // 应用保存的透明度
    if (s.opacity !== undefined && mainWindow) {
        mainWindow.setOpacity(Math.max(0.2, Math.min(1, s.opacity)));
    }

    app.on('activate', () => {
        if (mainWindow) { mainWindow.show(); }
        else { createWindow(); }
    });
});

// 退出时清理资源
app.on('will-quit', () => {
    // 退出前最终刷盘日志（与 before-quit 互为兜底，防最后一批日志丢失）
    try { logger.flushLogFile(); } catch (_) {}
    // 退出时主动中断视频轮询，避免后台轮询继续浪费 API 配额
    try {
        if (videoAbortController) {
            videoAbortController.abort();
            videoAbortController = null;
        }
    } catch (_) {}
    // 清理自动同步定时器，避免退出过程中触发无意义的同步
    try {
        if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    } catch (_) {}
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// 退出前确保便签写盘完成：若写盘仍在进行中，延迟退出避免数据丢失
// 加最大重试次数避免磁盘满/文件锁导致 pendingSaveCount 永远 > 0 时的死循环
// 参数调优：10 次 × 200ms = 最多等 2 秒，给大文件写盘更充裕的时间
let quitRetryCount = 0;
const MAX_QUIT_RETRY = 10;
const QUIT_RETRY_INTERVAL = 200;  // ms
app.on('before-quit', (e) => {
    // 退出前通知主窗口渲染进程立即强行刷盘存盘未落盘的内容
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-saving-before-quit');
        }
    } catch (_) {}

    if (isPendingSave() && quitRetryCount < MAX_QUIT_RETRY) {
        e.preventDefault();
        quitRetryCount++;
        setTimeout(() => app.quit(), QUIT_RETRY_INTERVAL);
    }
    // 超过重试次数则不再阻止退出，避免死循环
});
