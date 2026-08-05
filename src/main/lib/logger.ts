/* ==================== logger.ts ====================
 * 日志系统模块：内存缓冲 + 文件轮转 + 控制台劫持。
 * 加载时自动劫持 console.log/warn/error 并注册 process 异常处理。
 * ================================================== */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// ===== 日志常量 =====
const LOG_BUFFER_MAX = 1000;
const LOG_FILE_FLUSH_THRESHOLD = 50;
const LOG_FILE_FLUSH_INTERVAL = 3000;
const LOG_FILE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const LOG_RETENTION_DAYS = 7;

// 供 IPC handler 使用的常量
export const MAX_REPORT_ENTRIES = 500;
export const MAX_ENTRY_MSG_LEN = 8192;

// ===== 日志状态 =====
interface LogEntry {
    ts: number;
    level: string;
    source: string;
    msg: string;
}

// M14 修复：使用环形缓冲区替代数组 shift()，避免 O(n) 操作
// 固定大小数组 + 头尾指针，push 淘汰旧条目为 O(1)
class RingBuffer<T> {
    private buf: (T | undefined)[];
    private head = 0; // 下一个写入位置
    private count = 0; // 当前元素数
    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.buf = new Array<T | undefined>(capacity);
    }

    push(item: T): void {
        this.buf[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
    }

    get length(): number {
        return this.count;
    }

    toArray(): T[] {
        const out: T[] = [];
        if (this.count < this.capacity) {
            // 未满，从 0 到 head-1
            for (let i = 0; i < this.count; i++) out.push(this.buf[i] as T);
        } else {
            // 已满，从 head（最旧）到 capacity-1，再 0 到 head-1（最新）
            for (let i = 0; i < this.capacity; i++) {
                const idx = (this.head + i) % this.capacity;
                out.push(this.buf[idx] as T);
            }
        }
        return out;
    }

    filter(predicate: (item: T) => boolean): T[] {
        return this.toArray().filter(predicate);
    }
}

let logBuffer: RingBuffer<LogEntry> = new RingBuffer<LogEntry>(LOG_BUFFER_MAX);
let logPendingFlush: string[] = [];
let logFlushTimer: NodeJS.Timeout | null = null;
let logFileReady = false;
let currentLogDate = '';
let currentLogIndex = 0;

// ===== 日志函数 =====
function logTimestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function logDateString(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function appendLog(level: string, args: any[], source?: string): void {
    try {
        const src = source || 'main';
        let msg = Array.from(args).map(a => {
            if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
            if (typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
            return String(a);
        }).join(' ');
        // L5 修复：实现 MAX_ENTRY_MSG_LEN 截断逻辑，防超大日志条目撑爆内存缓冲和日志文件
        if (msg.length > MAX_ENTRY_MSG_LEN) {
            msg = msg.slice(0, MAX_ENTRY_MSG_LEN) + '…(truncated, original ' + msg.length + ' chars)';
        }
        const line = '[' + logTimestamp() + '] [' + level + '] [' + src + '] ' + msg;
        // M14 修复：RingBuffer.push 自动淘汰旧条目，无需 shift()
        logBuffer.push({ ts: Date.now(), level, source: src, msg: line });
        if (logFileReady) {
            logPendingFlush.push(line);
            if (logPendingFlush.length > 1000) {
                logPendingFlush.shift();
            }
            if (logPendingFlush.length >= LOG_FILE_FLUSH_THRESHOLD) {
                flushLogFile();
            }
        }
    } catch (_) { /* 日志失败不影响业务 */ }
}

export function getWritableLogPath(): string {
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

export function flushLogFile(): void {
    if (!logFileReady || logPendingFlush.length === 0) return;
    const lines = logPendingFlush;
    logPendingFlush = [];
    try {
        fs.appendFileSync(getWritableLogPath(), lines.join('\n') + '\n', 'utf8');
    } catch (_) {
        // H1 修复：写文件失败时回填未写队列，避免日志丢失
        logPendingFlush = lines.concat(logPendingFlush);
        // 防止回填后队列无限增长
        if (logPendingFlush.length > 1000) {
            logPendingFlush = logPendingFlush.slice(-1000);
        }
    }
}

export function initLogFile(): void {
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

export async function cleanOldLogs(): Promise<number> {
    const logDir = path.join(app.getPath('userData'), 'logs');
    let files: string[];
    try {
        files = await fs.promises.readdir(logDir);
    } catch (e: any) {
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

export function getAllLogs(filter?: { source?: string; level?: string }): string {
    try {
        if (logBuffer.length > 0) {
            // M14 修复：RingBuffer 需先转数组再过滤
            let arr = logBuffer.toArray();
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

export function clearAllLogs(): void {
    // M14 修复：重置为新的 RingBuffer 实例
    logBuffer = new RingBuffer<LogEntry>(LOG_BUFFER_MAX);
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

export function getLogDir(): string {
    return path.join(app.getPath('userData'), 'logs');
}

export function getLogStats(): { total: number; byLevel: Record<string, number>; bySource: Record<string, number> } {
    const stats = { total: logBuffer.length, byLevel: {} as Record<string, number>, bySource: {} as Record<string, number> };
    // M14 修复：RingBuffer 需先转数组再迭代
    for (const l of logBuffer.toArray()) {
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
console.log = function (...args: any[]) {
    _origConsole.log(...args);
    appendLog('INFO', args, 'main');
};
console.warn = function (...args: any[]) {
    _origConsole.warn(...args);
    appendLog('WARN', args, 'main');
};
console.error = function (...args: any[]) {
    _origConsole.error(...args);
    appendLog('ERROR', args, 'main');
};

// ===== 进程异常处理（加载时注册，防崩溃前留痕）=====
// H2 修复：uncaughtException 后进程状态不可预测，记录日志后应优雅退出，防数据损坏
process.on('uncaughtException', (err: Error) => {
    try {
        _origConsole.error('未捕获异常:', err.stack || (err.name + ': ' + err.message));
        appendLog('ERROR', ['未捕获异常:', err.stack || (err.name + ': ' + err.message)], 'main');
        flushLogFile();
    } catch (_) { /* 尽力而为 */ }
    // 退出前允许 before-quit 钩子执行刷盘（flushActivity 等）
    try { app.exit(1); } catch (_) { process.exit(1); }
});
process.on('unhandledRejection', (reason: unknown) => {
    appendLog('ERROR', ['未处理的 Promise 拒绝:', reason], 'main');
    flushLogFile();
});
