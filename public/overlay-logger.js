/* ==================== overlay-logger.js ====================
 * 共享日志模块：批量上报子窗口日志到主进程，聚合到应用内日志查看器。
 * 使用方式：
 *   1. 在子窗口 HTML 中通过 <script src="overlay-logger.js"></script> 加载本文件
 *   2. 随后调用 setupOverlayLogging(opts) 启动日志劫持
 *   opts: {
 *     source: string,        // 日志来源标识（如 'popout-note'/'music'）
 *     reportApi: function,   // 批量上报函数，签名为 function(batch) -> Promise<void>
 *                            // batch 形如 { source, entries: [{level, msg, ts}] }
 *     errorPrefix: string    // 未捕获异常的前缀文本
 *   }
 * 设计要点：
 *   - 攒满 20 条或每 2 秒刷一次，降低 IPC 频率
 *   - 劫持 console.log/warn/error，无需改动业务调用点即可自动捕获
 *   - beforeunload 同步刷盘，防止窗口关闭丢日志
 *   - 全部 try/catch 兜底，日志失败绝不影响业务
 * ========================================================== */
(function (global) {
    function setupOverlayLogging(opts) {
        var LOG_BATCH_SIZE = 20;
        var LOG_FLUSH_INTERVAL = 2000;
        var LOG_SOURCE = opts.source || 'overlay';
        var reportLogs = opts.reportApi;
        var errorPrefix = opts.errorPrefix || (LOG_SOURCE + '未捕获异常:');
        var pending = [];
        var flushTimer = null;

        function safeStringify(obj) {
            try { return JSON.stringify(obj); } catch (_) { return String(obj); }
        }

        function enqueue(level, args) {
            try {
                var msg = Array.from(args).map(function(x) {
                    if (x instanceof Error) return x.stack || (x.name + ': ' + x.message);
                    if (typeof x === 'object') return safeStringify(x);
                    return String(x);
                }).join(' ');
                pending.push({ level: level, msg: msg, ts: Date.now() });
                if (pending.length >= LOG_BATCH_SIZE) flush();
            } catch (_) { /* 日志失败不影响业务 */ }
        }

        function flush() {
            if (pending.length === 0) return;
            var batch = pending;
            pending = [];
            try {
                var p = reportLogs({ source: LOG_SOURCE, entries: batch });
                if (p && p.catch) p.catch(function() {});
            } catch (_) { /* IPC 未就绪，静默丢弃 */ }
        }

        var origLog = console.log, origWarn = console.warn, origErr = console.error;
        console.log = function() { origLog.apply(console, arguments); enqueue('INFO', arguments); };
        console.warn = function() { origWarn.apply(console, arguments); enqueue('WARN', arguments); };
        console.error = function() { origErr.apply(console, arguments); enqueue('ERROR', arguments); };

        flushTimer = setInterval(flush, LOG_FLUSH_INTERVAL);
        if (flushTimer.unref) flushTimer.unref();

        window.addEventListener('beforeunload', flush);
        window.addEventListener('error', function(e) {
            enqueue('ERROR', [errorPrefix, e.message, e.filename + ':' + e.lineno]);
            flush();
        });
    }
    global.setupOverlayLogging = setupOverlayLogging;
})(typeof window !== 'undefined' ? window : this);
