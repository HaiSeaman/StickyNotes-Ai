/* ==================== popoutTemplate.ts ====================
 * 弹出小窗口的 HTML 模板构建。
 * 注意：tsup 编译后所有 main 代码合并进 dist/main.js，__dirname = dist/。
 *       overlay-logger.js 由 Vite 从 public/ 复制到 dist-renderer/，
 *       所以从 dist/ 出发需上溯一层到项目根，再进入 dist-renderer/。
 * =============================================== */
import path from 'path';
import fs from 'fs';
import { escapeHtmlFull } from './security.js';

let _overlayLoggerScriptCache: string | null = null;

export function getOverlayLoggerScript(): string {
    if (_overlayLoggerScriptCache !== null) {
        return _overlayLoggerScriptCache;
    }
    try {
        const filePath = path.join(__dirname, '..', 'dist-renderer', 'overlay-logger.js');
        let raw = fs.readFileSync(filePath, 'utf-8');
        raw = raw.replace(/<\/script>/gi, '<\\/script>');
        _overlayLoggerScriptCache = raw;
    } catch (e: any) {
        // L18 修复：失败时不缓存空字符串，保持 null 让下次调用可重试
        // （开发态下 dist-renderer/overlay-logger.js 可能后于主进程生成）
        // 仅当文件确实不存在时才缓存空串，避免热路径上反复尝试读不存在的文件
        if (e.code === 'ENOENT') {
            _overlayLoggerScriptCache = '';
        }
        console.error('[main] 读取 overlay-logger.js 失败:', e.message);
    }
    return _overlayLoggerScriptCache || '';
}

export function getPopoutCommonCss(): string {
    return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.titlebar-actions{display:flex;align-items:center;-webkit-app-region:no-drag}
.tb-btn{
    width:22px;height:22px;border:none;background:transparent;
    border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
    color:#666;transition:all 0.15s ease;margin-left:4px;
    user-select:none;-webkit-user-select:none;
    -webkit-app-region:no-drag;
}
.tb-btn:hover{background:rgba(0,0,0,0.08);color:#1A1A1A}
.tb-btn.pin.active{color:#FF9500;background:rgba(255,149,0,0.15)}
.tb-btn.pin.active:hover{background:rgba(255,149,0,0.25)}
.tb-btn.close:hover{background:#FF3B30;color:#FFF}
.titlebar-title{font-size:12px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;user-select:none;-webkit-user-select:none}
`;
}

export function buildPopoutHtml(data: { title?: string; content?: string; noteId?: string | number }): string {
    const title = escapeHtmlFull(data.title || '便签');
    const content = escapeHtmlFull(data.content || '');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title>
<style>
${getPopoutCommonCss()}
body{
    background:rgba(250,250,252,0.78);
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
    background:rgba(255,255,255,0.35);
    border-bottom:1px solid rgba(0,0,0,0.06);
    border-radius:10px 10px 0 0;
    -webkit-app-region:drag;
    cursor:move;
}
.content-wrap{flex:1;display:flex;min-height:0}
textarea{
    flex:1;width:100%;height:100%;
    padding:12px 14px;border:none;outline:none;resize:none;
    background:transparent;color:#1A1A1A;
    font-size:14px;line-height:1.65;font-family:inherit;
    user-select:text;-webkit-user-select:text;
}
textarea::placeholder{color:#999}
.status-bar{
    height:20px;flex-shrink:0;
    padding:0 10px;
    display:flex;align-items:center;justify-content:space-between;
    background:rgba(255,255,255,0.3);
    border-top:1px solid rgba(0,0,0,0.04);
    border-radius:0 0 10px 10px;
    font-size:10px;color:#888;
    user-select:none;-webkit-user-select:none;
}
.status-tip{opacity:0.7}
.status-saved{color:#34C759;font-weight:600;opacity:0;transition:opacity 0.3s}
.status-saved.show{opacity:1}
</style></head>
<body>
<div class="titlebar">
    <div class="titlebar-title" title="${title}">📌 ${title}</div>
    <div class="titlebar-actions">
        <button class="tb-btn pin active" id="pinBtn" title="已置顶（点击取消置顶）"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V8a3.5 3.5 0 0 0-7 0v6L5 17z"/></svg></button>
        <button class="tb-btn close" id="closeBtn" title="关闭并同步回主窗口"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
</div>
<div class="content-wrap">
    <textarea id="content" placeholder="在此输入便签内容..." spellcheck="true">${content}</textarea>
</div>
<div class="status-bar">
    <span class="status-tip">双击标题栏 = 缩回主窗口 · 默认置顶</span>
    <span class="status-saved" id="savedTip">✓ 已同步</span>
</div>
<script>
${getOverlayLoggerScript()}
setupOverlayLogging({
    source: 'popout-note',
    reportApi: function(batch) { return window.popout.reportLogs(batch); },
    errorPrefix: 'popout未捕获异常:'
});
const noteId = ${JSON.stringify(String(data.noteId)).replace(/<\/script>/gi, '<\\/script>')};
const contentEl = document.getElementById('content');
const savedTip = document.getElementById('savedTip');
const closeBtn = document.getElementById('closeBtn');
const pinBtn = document.getElementById('pinBtn');
let debounceTimer = null;

contentEl.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        window.popout.sendInput({ noteId, content: contentEl.value });
        showSaved();
    }, 400);
});

function showSaved() {
    savedTip.classList.add('show');
    setTimeout(() => savedTip.classList.remove('show'), 1200);
}

closeBtn.addEventListener('click', () => {
    window.popout.sendInput({ noteId, content: contentEl.value });
    window.popout.close();
});

pinBtn.addEventListener('click', async () => {
    try {
        const r = await window.popout.togglePin({ noteId, type: 'note' });
        if (r && r.success) {
            pinBtn.classList.toggle('active', r.pinned);
            pinBtn.title = r.pinned ? '已置顶（点击取消置顶）' : '未置顶（点击置顶）';
        }
    } catch (_) {}
});
</script></body></html>`;
}
