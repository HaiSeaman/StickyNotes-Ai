/* ==================== logger.js ====================
 * 日志系统模块：内存缓冲 + 文件轮转 + 控制台劫持。
 * 从 main.js 提取，通过 require('./logger') 加载。
 * 加载时自动劫持 console.log/warn/error 并注册 process 异常处理。
 * ================================================== */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// ===== 日志常量 =====
const LOG_BUFFER_MAX = 1000;
const LOG_FILE_FLUSH_THRESHOLD = 50;
const LOG_FILE_FLUSH_INTERVAL = 3000;
const LOG_FILE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const LOG_RETENTION_DAYS = 7;

// ===== 日志状态 =====
let logBuffer = [];
let logPendingFlush = [];
let logFlushTimer = null;
let logFileReady = false;
let currentLogDate = '';
let currentLogIndex = 0;

// ===== 日志函数 =====
function logTimestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function logDateString() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function appendLog(level, args, source) {
    try {
        const src = source || 'main';
        const msg = Array.from(args).map(a => {
            if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
            if (typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
            return String(a);
        }).join(' ');
        const line = '[' + logTimestamp() + '] [' + level + '] [' + src + '] ' + msg;
        logBuffer.push({ ts: Date.now(), level, source: src, msg: line });
        if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
        if (logFileReady) {
            logPendingFlush.push(line);
            if (logPendingFlush.length > 1000) {
                logPendingFlush.shift(); // 内存上限保护：超过1000条丢弃最旧日志防OOM
            }
            if (logPendingFlush.length >= LOG_FILE_FLUSH_THRESHOLD) {
                flushLogFile();
            }
        }
    } catch (_) { /* 日志失败不影响业务 */ }
}

function getWritableLogPath() {
    const today = logDateString();
    if (currentLogDate !== today) {
        currentLogDate = today;
        currentLogIndex = 0;
    }
    const logDir = path.join(app.getPath('userData'), 'logs');
    while (true) {
        const fileName = currentLogIndex === 0
            ? 'app-' + today + '.log'
            : 'app-' + today + '-' + currentLogIndex + '.log';
        const filePath = path.join(logDir, fileName);
        try {
            if (!fs.existsSync(filePath)) {
                return filePath;
            }
            const stat = fs.statSync(filePath);
            if (stat.size < LOG_FILE_MAX_SIZE) {
                return filePath;
            }
            currentLogIndex++;
        } catch (_) {
            return filePath;
        }
    }
}

function flushLogFile() {
    if (!logFileReady || logPendingFlush.length === 0) return;
    const lines = logPendingFlush;
    logPendingFlush = [];
    try {
        fs.appendFileSync(getWritableLogPath(), lines.join('\n') + '\n', 'utf8');
    } catch (_) { /* 写文件失败静默忽略 */ }
}

function initLogFile() {
    try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        currentLogDate = logDateString();
        currentLogIndex = 0;
        const logPath = getWritableLogPath();
        if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, '', 'utf8');
        logFileReady = true;
        if (!logFlushTimer) {
            logFlushTimer = setInterval(flushLogFile, LOG_FILE_FLUSH_INTERVAL);
            if (logFlushTimer.unref) logFlushTimer.unref();
        }
        appendLog('INFO', ['应用日志系统初始化完成，日志目录:', logDir]);
    } catch (e) {
        logFileReady = false;
    }
}

async function cleanOldLogs() {
    const logDir = path.join(app.getPath('userData'), 'logs');
    let files;
    try {
        files = await fs.promises.readdir(logDir);
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('读取日志目录失败:', e.message);
        return 0;
    }
    const now = Date.now();
    const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const f of files) {
        if (!/^app-\d{4}-\d{2}-\d{2}(-\d+)?\.log$/.test(f)) continue;
        const filePath = path.join(logDir, f);
        try {
            const stat = await fs.promises.stat(filePath);
            if (now - stat.mtimeMs > maxAge) {
                await fs.promises.unlink(filePath);
                deleted++;
            }
        } catch (_) { /* 单个文件清理失败跳过 */ }
    }
    if (deleted > 0) {
        appendLog('INFO', ['清理过期日志文件:', deleted, '个（超过', LOG_RETENTION_DAYS, '天）']);
    }
    return deleted;
}

function getAllLogs(filter) {
    try {
        if (logBuffer.length > 0) {
            let arr = logBuffer;
            if (filter && filter.source) {
                arr = arr.filter(l => l.source === filter.source);
            }
            if (filter && filter.level) {
                arr = arr.filter(l => l.level === filter.level);
            }
            return arr.map(l => l.msg).join('\n');
        }
        if (logFileReady) {
            const data = fs.readFileSync(getWritableLogPath(), 'utf8');
            return data;
        }
    } catch (_) {}
    return '';
}

function clearAllLogs() {
    logBuffer = [];
    logPendingFlush = [];
    try {
        if (logFileReady) {
            const today = logDateString();
            const mainPath = path.join(app.getPath('userData'), 'logs', 'app-' + today + '.log');
            fs.writeFileSync(mainPath, '', 'utf8');
            const logDir = path.join(app.getPath('userData'), 'logs');
            const files = fs.readdirSync(logDir);
            for (const f of files) {
                if (new RegExp('^app-' + today.replace(/-/g, '\\-') + '-\\d+\\.log$').test(f)) {
                    try { fs.unlinkSync(path.join(logDir, f)); } catch (_) {}
                }
            }
            currentLogIndex = 0;
        }
    } catch (_) {}
}

function getLogDir() {
    return path.join(app.getPath('userData'), 'logs');
}

function getLogStats() {
    const stats = { total: logBuffer.length, byLevel: {}, bySource: {} };
    for (const l of logBuffer) {
        stats.byLevel[l.level] = (stats.byLevel[l.level] || 0) + 1;
        stats.bySource[l.source] = (stats.bySource[l.source] || 0) + 1;
    }
    return stats;
}

// ===== 控制台劫持（加载时立即执行，确保后续所有 console 调用被捕获）=====
const _origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};
console.log = function (...args) {
    _origConsole.log(...args);
    appendLog('INFO', args, 'main');
};
console.warn = function (...args) {
    _origConsole.warn(...args);
    appendLog('WARN', args, 'main');
};
console.error = function (...args) {
    _origConsole.error(...args);
    appendLog('ERROR', args, 'main');
};

// ===== 进程异常处理（加载时注册，防崩溃前留痕）=====
process.on('uncaughtException', (err) => {
    appendLog('ERROR', ['未捕获异常:', err.stack || (err.name + ': ' + err.message)], 'main');
    flushLogFile();
});
process.on('unhandledRejection', (reason) => {
    appendLog('ERROR', ['未处理的 Promise 拒绝:', reason], 'main');
    flushLogFile();
});

module.exports = {
    appendLog,
    flushLogFile,
    getWritableLogPath,
    initLogFile,
    cleanOldLogs,
    getAllLogs,
    clearAllLogs,
    getLogDir,
    getLogStats,
    // 常量导出（供 IPC handler 使用）
    MAX_REPORT_ENTRIES: 500,
    MAX_ENTRY_MSG_LEN: 8192,
};
