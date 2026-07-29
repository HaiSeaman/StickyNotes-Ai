/* ==================== DOM 引用 ==================== */
// 公共工具函数从 renderer/utils.js 引入（消除与 chatTab.js 的重复定义）
const { pad2, formatChatTime, debounce, loadScript } = window.RendererUtils;
const $ = (id) => document.getElementById(id);
const noteInput = $('noteInput');
const noteList = $('noteList');
const todoList = $('todoList');
const todoInput = $('todoInput');
const todoCount = $('todoCount');
const todoAddBtn = $('todoAddBtn');
const newNoteBtn = $('newNoteBtn');
const pinBtn = $('pinBtn');
const minBtn = $('minBtn');
const closeBtn = $('closeBtn');
const fixedBtn = $('fixedBtn');
const settingsAiBtn = $('settingsAiBtn');  // 复用变量名，指向设置面板内的 AI 设置按钮
const aiModal = $('aiModal');
const modalCloseBtn = $('modalCloseBtn');
const aiBaseUrl = $('aiBaseUrl');
const aiApiKey = $('aiApiKey');
const aiModelInput = $('aiModelSelect');
const modelList = $('modelList');
const searchModelsBtn = $('searchModelsBtn');
const modelStatus = $('modelStatus');
const aiTemperature = $('aiTemperature');
const tempValue = $('tempValue');
const aiPrompt = $('aiPrompt');
const modalSaveBtn = $('modalSaveBtn');
// AI 聊天模块
const chatList = $('chatList');
const chatMessages = $('chatMessages');
const chatInput = $('chatInput');
const chatSendBtn = $('chatSendBtn');
const chatRegenBtn = $('chatRegenBtn');
const chatThinkingBtn = $('chatThinkingBtn');
const chatUploadBtn = $('chatUploadBtn');
const chatFileInput = $('chatFileInput');
const chatAttachments = $('chatAttachments');
const chatNewBtn = $('chatNewBtn');
const chatDelBtn = $('chatDelBtn');
const chatTitle = $('chatTitle');
const startupToggle = $('startupToggle');
let startupToggleState = { open: false };

// 软件锁相关元素
const lockBtn = $('lockBtn');
const lockOverlay = $('lockOverlay');
const lockPinInputs = $('lockPinInputs');
const lockMessage = $('lockMessage');
const lockSubmitBtn = $('lockSubmitBtn');
const lockExitBtn = $('lockExitBtn');
const setPinOverlay = $('setPinOverlay');
const setPinInputs = $('setPinInputs');
const setPinConfirmInputs = $('setPinConfirmInputs');
const setPinMessage = $('setPinMessage');
const setPinConfirmBtn = $('setPinConfirmBtn');
const setPinCancelBtn = $('setPinCancelBtn');
let isLocked = false;  // 当前是否处于锁定状态
const settingsPaletteBtn = $('settingsPaletteBtn');  // 指向设置面板内的背景色按钮
const palettePanel = $('palettePanel');
const paletteGrid = $('paletteGrid');
const winEl = $('window');
const resizeHandle = $('resizeHandle');
const createPrompt = $('createPrompt');
const createOptimizeBtn = $('createOptimizeBtn');
const createGenBtn = $('createGenBtn');
const createUploadBtn = $('createUploadBtn');
const createFileInput = $('createFileInput');
const createImage = $('createImage');
const createPlaceholder = $('createPlaceholder');
const uploadPreview = $('uploadPreview');
const uploadPreviewImg = $('uploadPreviewImg');
const createCopyBtn = $('createCopyBtn');
const imgProvider = $('imgProvider');
const imgBaseUrl = $('imgBaseUrl');
const imgApiKey = $('imgApiKey');
const imgModel = $('imgModel');
const imgSaveBtn = $('imgSaveBtn');
const createSize = $('createSize');
const uploadFilename = $('uploadFilename');
const uploadClose = $('uploadClose');

/* ==================== 创作：图片/视频模式切换 DOM ==================== */
const createModeImageBtn = $('createModeImageBtn');
const createModeVideoBtn = $('createModeVideoBtn');
const createVideo = $('createVideo');
const videoT2vModel = $('videoT2vModel');
const videoI2vModel = $('videoI2vModel');
const videoBaseUrl = $('videoBaseUrl');
const videoApiKey = $('videoApiKey');
const createModelSelect = $('createModelSelect');
const createVideoDuration = $('createVideoDuration');
const createVideoRatio = $('createVideoRatio');
let createMode = 'image';  // 'image' 或 'video'
const browsePathBtn = $('browsePathBtn');
const imgSavePath = $('imgSavePath');



/* ==================== Markdown 预览 DOM ==================== */
const mdToggleBtn = $('mdToggleBtn');
const notePreviewWrap = $('notePreviewWrap');
const editorWrap = document.querySelector('.editor-wrap');

/* ==================== 闹钟页 DOM ==================== */
const clockDate = $('clockDate');
const clockTime = $('clockTime');
const clockWeek = $('clockWeek');
const timerDisplay = $('timerDisplay');
const timerRingFg = $('timerRingFg');
const timerH = $('timerH');
const timerM = $('timerM');
const timerS = $('timerS');
const timerStartBtn = $('timerStartBtn');
const timerPauseBtn = $('timerPauseBtn');
const timerResetBtn = $('timerResetBtn');
const alarmH = $('alarmH');
const alarmM = $('alarmM');
const alarmS = $('alarmS');
const alarmAddBtn = $('alarmAddBtn');
const alarmList = $('alarmList');
const alarmCount = $('alarmCount');
const alarmStopBtn = $('alarmStopBtn');
const timerLabel = $('timerLabel');
const timerSound = $('timerSound');
const alarmLabel = $('alarmLabel');
const alarmSound = $('alarmSound');

/* ==================== 调色板颜色 ==================== */
const PALETTE = [
    { hex: '#F7F3EE', name: '暖白米色' },
    { hex: '#DCE8F2', name: '浅雾蓝' },
    { hex: '#E6E0F2', name: '浅熏衣草' },
    { hex: '#F2E0E8', name: '浅粉' },
    { hex: '#E6F2E0', name: '浅薄荷' },
    { hex: '#F2F2DC', name: '浅香槟' },
    { hex: '#C8F0E8', name: '浅青' },
    { hex: '#F0C8C8', name: '浅玫瑰红' },
    { hex: '#1C1C1E', name: '苹果深色', dark: true },  // iOS systemBackground dark
];

/* ==================== 图标常量集中管理（避免重复硬编码） ==================== */
const SVG_PREFIX = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"';
const ICONS = {
    copy: '<svg ' + SVG_PREFIX + '><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    sparkle: '<svg ' + SVG_PREFIX + '><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>',
};

/* ==================== 状态 ==================== */
let notes = [];
let archivedNotes = [];   // 归档便签
let trashedNotes = [];    // 垃圾桶便签
let todos = [];           // 独立待办事项主数据
let archivedTodos = [];   // 归档待办事项
let currentNoteId = null;
let saveTimer = null;
let todoSaveTimer = null;
let pushTimer = null;          // pushNoteToPopout 的独立防抖计时器（200ms），与 saveTimer 解耦
let contentDirty = false;
let selectedColor = null;
const SAVE_DELAY = 500;
let noteSearchKeyword = '';        // 便签列表搜索关键字
let archiveSearchKeyword = '';     // 归档搜索关键字
let trashSearchKeyword = '';       // 垃圾桶搜索关键字
let todoArchiveSearchKeyword = ''; // 待办归档搜索关键字

/* ==================== 工具函数 ==================== */
const now = () => Date.now();

// genId() 与 previewText() 已抽取至 shared-utils.js（全局共享，避免与 calendar.js 重复定义）

/**
 * 将时间戳格式化为"年月日 时:分"
 * @param {number} ts - 时间戳（毫秒）
 * @returns {string} 格式如"2026年07月17日 14:30"
 */
function formatNoteCreatedTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const sortNotes = (arr) => arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    // textContent→innerHTML 会转义 & < >，但不会转义引号；
    // 补充转义 " 和 ' 以保证在属性上下文（如 title="..."）中也安全，防 XSS 突破属性边界
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// debounce / pad2 / formatChatTime 已抽取至 renderer/utils.js（见文件顶部引用）

/* ==================== 文件夹列表渲染泛型 ====================
 * 归档/垃圾桶（便签 & 聊天）4 个列表结构同构，统一为 renderFolderList 调用。
 * titleFn 返回原始标题文本（renderFolderList 内部 escapeHtml 转义）；
 * metaFn 返回 meta 区域的最终 HTML 字符串（调用方自行 escapeHtml）；
 * searchTextFn 返回用于搜索过滤的原始文本；
 * infoAction 非 null 时在 folder-item-info 上添加 data-action；
 * sortFn 可选，对 filtered 结果排序（返回新数组，不修改原数组）。
 */
function renderFolderList(opts) {
    var listEl = opts.listEl;
    var countEl = opts.countEl;
    var items = opts.items;
    var keyword = opts.keyword;
    var emptyText = opts.emptyText;
    var searchEmptyText = opts.searchEmptyText;
    var titleFn = opts.titleFn;
    var metaFn = opts.metaFn;
    var searchTextFn = opts.searchTextFn;
    var restoreAction = opts.restoreAction;
    var deleteAction = opts.deleteAction;
    var restoreTitle = opts.restoreTitle;
    var infoAction = opts.infoAction;
    var sortFn = opts.sortFn;
    if (countEl) countEl.textContent = items.length;
    if (items.length === 0) {
        listEl.innerHTML = '<div class="folder-empty">' + escapeHtml(emptyText) + '</div>';
        return;
    }
    var kw = (keyword || '').trim().toLowerCase();
    var filtered = kw ? items.filter(function(it) { return searchTextFn(it).toLowerCase().indexOf(kw) !== -1; }) : items;
    if (filtered.length === 0) {
        listEl.innerHTML = '<div class="folder-empty">' + escapeHtml(searchEmptyText) + '</div>';
        return;
    }
    if (sortFn) filtered = sortFn(filtered);
    listEl.innerHTML = filtered.map(function(it) {
        var title = escapeHtml(titleFn(it));
        var meta = metaFn(it);
        var infoAttr = infoAction ? ' data-action="' + infoAction + '"' : '';
        return '<div class="folder-item" data-id="' + it.id + '">' +
            '<div class="folder-item-info"' + infoAttr + '>' +
            '<div class="folder-item-title">' + title + '</div>' +
            '<div class="folder-item-meta">' + meta + '</div>' +
            '</div>' +
            '<div class="folder-item-actions">' +
            '<button class="folder-item-btn restore-btn" data-action="' + restoreAction + '" title="' + restoreTitle + '">还原</button>' +
            '<button class="folder-item-btn delete-btn" data-action="' + deleteAction + '" title="永久删除">删除</button>' +
            '</div></div>';
    }).join('');
}

/* ==================== 文件夹搜索绑定泛型 ====================
 * 5 个搜索框（便签/归档/垃圾桶/聊天归档/聊天垃圾桶）绑定逻辑同构：
 * input 事件 200ms 防抖 → 设置 keyword → 重新渲染；
 * keydown 事件 stopPropagation 防止触发便签快捷键。
 */
function bindFolderSearch(inputEl, setKeyword, renderFn, wait) {
    if (wait === undefined) wait = 200;
    var debounced = debounce(function(val) {
        setKeyword(val);
        renderFn();
    }, wait);
    inputEl.addEventListener('input', function(e) { debounced(e.target.value); });
    inputEl.addEventListener('keydown', function(e) { e.stopPropagation(); });
}

/* ==================== 模态框关闭绑定泛型 ====================
 * 8 个模态框（AI/日志/同步/备份/归档/垃圾桶/聊天归档/聊天垃圾桶）关闭逻辑同构：
 * 点击遮罩（e.target === modal）或关闭按钮时移除 open 类；
 * onClose 可选回调用于额外清理（如清空状态），在移除 open 后执行。
 */
function bindModalClose(modal, closeBtn, onClose) {
    var close = function() {
        modal.classList.remove('open');
        if (typeof onClose === 'function') onClose();
    };
    modal.addEventListener('click', function(e) {
        if (e.target === modal) close();
    });
    if (closeBtn) {
        closeBtn.addEventListener('click', close);
    }
}

// 按钮闪烁反馈：把按钮文字颜色临时改成 color，ms 毫秒后还原
// 替代 17 处重复的 `btn.style.color = '#xxx'; setTimeout(() => { btn.style.color = ''; }, 1500);`
// 颜色含义：#FF9F0A 橙(空内容提示) / #FF453A 红(失败) / #34C759 绿(成功) / #0A84FF 蓝(popout成功)
// 默认 ms=1500（多数调用点），popout 成功反馈用 1200，调用时显式传入
function flashBtn(btn, color, ms = 1500) {
    btn.style.color = color;
    setTimeout(() => { btn.style.color = ''; }, ms);
}

/* ==================== 渲染进程日志劫持与批量上报 ====================
 * 劫持主窗口 console.log/warn/error，攒满 20 条或每 2 秒批量 IPC 上报主进程。
 * 严格遵循防抖/节流规范，绝不每条日志发一次 IPC。
 * 崩溃兜底：beforeunload + window error 事件同步 flush，防丢失最后几条日志。
 * 安全：通过 window.api.reportLogs（contextBridge）上报，不触发 CSP connect-src。
 * ===================================================================== */
(function setupRendererLogging() {
    const LOG_BATCH_SIZE = 20;          // 攒满 20 条触发一次上报
    const LOG_FLUSH_INTERVAL = 2000;    // 定时上报间隔 2 秒
    const LOG_SOURCE = 'renderer';      // 主窗口渲染进程来源标识
    let pending = [];                   // 待上报日志队列
    let flushTimer = null;              // 定时上报器

    // 安全序列化对象（避免循环引用崩溃）
    function safeStringify(obj) {
        try { return JSON.stringify(obj); } catch (_) { return String(obj); }
    }

    // 入队：格式化消息 + 加入待上报队列
    function enqueue(level, args) {
        try {
            const msg = Array.from(args).map(a => {
                if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
                if (typeof a === 'object') return safeStringify(a);
                return String(a);
            }).join(' ');
            pending.push({ level, msg, ts: Date.now() });
            if (pending.length >= LOG_BATCH_SIZE) flush();
        } catch (_) { /* 日志失败不影响业务 */ }
    }

    // 批量上报：一次 IPC 传整个队列，清空 pending
    function flush() {
        if (pending.length === 0) return;
        const batch = pending;
        pending = [];
        try {
            window.api.reportLogs({ source: LOG_SOURCE, entries: batch }).catch(() => {});
        } catch (_) { /* IPC 未就绪（如启动极早期），静默丢弃 */ }
    }

    // 崩溃兜底用同步 IPC（sendSync），保证进程死亡前"遗言"100%送达
    function flushSync() {
        if (pending.length === 0) return;
        const batch = pending;
        pending = [];
        try {
            window.api.reportLogsSync({ source: LOG_SOURCE, entries: batch });
        } catch (_) { /* 同步发送失败时放弃，至少已尝试 */ }
    }

    // 劫持 console，保留原行为（DevTools 仍可看到）
    const origLog = console.log, origWarn = console.warn, origErr = console.error;
    console.log = function (...a) { origLog(...a); enqueue('INFO', a); };
    console.warn = function (...a) { origWarn(...a); enqueue('WARN', a); };
    console.error = function (...a) { origErr(...a); enqueue('ERROR', a); };

    // 定时上报器（不阻止页面卸载）
    flushTimer = setInterval(flush, LOG_FLUSH_INTERVAL);
    if (flushTimer.unref) flushTimer.unref();

    // 崩溃兜底 1：页面卸载前同步 flush（改为 sendSync，防异步 invoke 发不出）
    window.addEventListener('beforeunload', flushSync);
    // 崩溃兜底 2：未捕获异常时同步 flush（保留最后一条错误日志）
    window.addEventListener('error', (e) => {
        enqueue('ERROR', ['渲染进程未捕获异常:', e.message, e.filename + ':' + e.lineno]);
        flushSync();
    });
    // 崩溃兜底 3：未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (e) => {
        enqueue('ERROR', ['渲染进程未处理 Promise 拒绝:', e.reason]);
        flushSync();
    });
})();

// 窗口关闭时强制 flush 所有防抖队列，防最后一次输入/保存永久丢失
// pushTimer 用 ipcRenderer.send（fire-and-forget）能可靠送达；saveNotes 的 invoke
// 其 send 部分也是同步发出，主进程 notes:save 内部用 writeFileSync 同步落盘
window.addEventListener('beforeunload', () => {
    // 1. pushNoteToPopout 防抖（raw setTimeout，立即补发最后一次推送）
    if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
        const _note = notes.find(n => n.id === currentNoteId);
        if (_note && _note.id) {
            try { window.api.pushNoteToPopout(String(_note.id), _note.content || ''); } catch (e) { console.warn('推送便签到小窗失败:', e.message); }
        }
    }
    // 2. 保存防抖（contentDirty 标记有未落盘数据，直接 invoke 同步发出）
    if (saveTimer && contentDirty) {
        clearTimeout(saveTimer);
        saveTimer = null;
        try { window.api.saveNotes(notes); } catch (e) { console.error('退出时保存便签失败:', e.message); }
    }
    // 3. 待办事项刷盘（清空防抖定时器并直接同步 flush 避免退出丢数据）
    if (todoSaveTimer) {
        clearTimeout(todoSaveTimer);
        todoSaveTimer = null;
    }
    try { window.api.saveTodos(todos); } catch (e) { console.error('退出时保存待办失败:', e.message); }
    // 4. 清理全局定时器，避免窗口关闭后仍触发回调报错
    if (clockTimerId) { clearInterval(clockTimerId); clockTimerId = null; }
    if (alarmTimerId) { clearInterval(alarmTimerId); alarmTimerId = null; }
});

// 监听主进程退出前的强行刷盘通知
if (window.api && window.api.onAppSavingBeforeQuit) {
    window.api.onAppSavingBeforeQuit(() => {
        if (saveTimer && contentDirty) {
            clearTimeout(saveTimer);
            saveTimer = null;
            try { window.api.saveNotes(notes); } catch (e) { console.error('退出前保存便签失败:', e.message); }
        }
        if (todoSaveTimer) {
            clearTimeout(todoSaveTimer);
            todoSaveTimer = null;
        }
        try { window.api.saveTodos(todos); } catch (e) { console.error('退出前保存待办失败:', e.message); }
    });
}

/* ==================== 数据持久化 ==================== */
// 串行化保存：保存期间若有新保存请求，标记 pending，待当前保存结束后再来一次，
// 避免合并 Promise 导致保存期间的数据变更丢失
let saveInFlight = null;
let savePending = false;
const saveNotesToDisk = async () => {
    if (saveInFlight) {
        savePending = true;  // 标记：当前保存结束后再保存一次
        return saveInFlight;
    }
    saveInFlight = (async () => {
        try {
            await window.api.saveNotes(notes);
        } finally {
            saveInFlight = null;
        }
    })();
    await saveInFlight;
    if (savePending) {
        savePending = false;
        return saveNotesToDisk();
    }
};
// 串行化保存独立待办数据
let saveTodosInFlight = null;
let saveTodosPending = false;

const saveTodosToDisk = async () => {
    if (!window.api || !window.api.saveTodos) return;
    if (saveTodosInFlight) {
        saveTodosPending = true;
        return saveTodosInFlight;
    }
    saveTodosInFlight = (async () => {
        try {
            await window.api.saveTodos(todos);
        } finally {
            saveTodosInFlight = null;
        }
    })();
    await saveTodosInFlight;
    if (saveTodosPending) {
        saveTodosPending = false;
        return saveTodosToDisk();
    }
};

const saveTodosToDiskDebounced = () => {
    if (todoSaveTimer) clearTimeout(todoSaveTimer);
    todoSaveTimer = setTimeout(() => {
        saveTodosToDisk();
        todoSaveTimer = null;
    }, 400);
};

const saveArchivedTodosToDisk = async () => {
    if (!window.api || !window.api.saveArchivedTodos) return;
    await window.api.saveArchivedTodos(archivedTodos);
};

async function loadNotesFromDisk() {
    notes = await window.api.loadNotes();
    if (!Array.isArray(notes)) notes = [];
    sortNotes(notes);
    // 同时加载归档和垃圾桶数据
    archivedNotes = await window.api.loadArchivedNotes();
    if (!Array.isArray(archivedNotes)) archivedNotes = [];
    trashedNotes = await window.api.loadTrashedNotes();
    if (!Array.isArray(trashedNotes)) trashedNotes = [];

    // 加载独立待办事项及归档待办数据
    if (window.api.loadTodos) {
        todos = await window.api.loadTodos();
        if (!Array.isArray(todos)) todos = [];
    }
    if (window.api.loadArchivedTodos) {
        archivedTodos = await window.api.loadArchivedTodos();
        if (!Array.isArray(archivedTodos)) archivedTodos = [];
    }
}

let detailFontSize = 14;  // 详情页正文字体大小（px），通过 CSS 变量 --detail-font-size 应用

// 定时器 ID（保存以便后续清理，避免内存泄漏）
let clockTimerId = null;
let alarmTimerId = null;

const saveSettingsToDisk = async () => {
    await window.api.saveSettings({
        bgColor: selectedColor,
        detailFontSize,
        alarmVolume,
        launchAtLogin: startupToggleState ? startupToggleState.open : false
    });
};

async function loadSettingsFromDisk() {
    const s = await window.api.loadSettings();
    selectedColor = s.bgColor || null;
    if (s.detailFontSize && Number.isFinite(s.detailFontSize)) detailFontSize = s.detailFontSize;
    if (s.alarmVolume !== undefined && Number.isFinite(s.alarmVolume)) {
        alarmVolume = Math.max(0, Math.min(300, s.alarmVolume));
        if (alarmVolumeSlider) alarmVolumeSlider.value = String(alarmVolume);
        if (alarmVolumeValue) alarmVolumeValue.textContent = alarmVolume + '%';
        setAlarmVolume(alarmVolume);
    }
    // 启动时恢复背景色与深色主题
    if (selectedColor) {
        const matched = PALETTE.find(c => c.hex === selectedColor);
        const isDark = !!(matched && matched.dark);
        if (winEl) {
            winEl.style.background = selectedColor;
            winEl.classList.toggle('dark-theme', isDark);
        }
    }
    // 恢复开机启动状态
    if (s.launchAtLogin !== undefined) {
        startupToggleState = startupToggleState || { open: false };
        startupToggleState.open = !!s.launchAtLogin;
        updateStartupToggleUI();
    }
}

/**
 * 应用详情页字体大小到 CSS 变量 --detail-font-size
 * 仅影响引用了该变量的详情页元素，顶部工具栏/菜单栏/titlebar 不引用，因此不受影响
 * @param {number} size - 字体大小（px）
 */
function applyDetailFontSize(size) {
    detailFontSize = size;
    document.documentElement.style.setProperty('--detail-font-size', size + 'px');
}

/* ==================== 当前便签工具 ==================== */
const getCurrentNote = () => notes.find(n => n.id === currentNoteId) || null;

/* ==================== 渲染：左侧便签列表 ==================== */
function renderNoteList() {
    sortNotes(notes);
    // 按搜索关键字过滤便签（搜索正文 content）
    const kw = noteSearchKeyword.trim().toLowerCase();
    const filtered = kw ? notes.filter(n => (n.content || '').toLowerCase().includes(kw)) : notes;
    // 使用 DocumentFragment 减少回流
    const frag = document.createDocumentFragment();
    if (filtered.length === 0 && kw) {
        // 有搜索关键字但无匹配时显示空状态提示
        const empty = document.createElement('div');
        empty.className = 'note-search-empty';
        empty.textContent = '没有匹配的便签';
        frag.appendChild(empty);
    } else {
        filtered.forEach(n => {
            const div = document.createElement('div');
            div.className = 'note-item' + (n.id === currentNoteId ? ' active' : '');
            div.dataset.id = n.id;
            let html = `<div class="note-title">${escapeHtml(previewText(n.content))}</div>`;
            // 创建时间：全黑色小字，显示在标题正下方
            const timeStr = formatNoteCreatedTime(n.createdAt);
            if (timeStr) {
                html += `<div class="note-created-time">${escapeHtml(timeStr)}</div>`;
            }

            // 悬停时显示的快捷归档按钮（删除按钮左边）和删除按钮
            html += `<button class="note-archive" data-action="archive-note" title="归档此便签">📦</button>`;
            html += `<button class="note-del" data-action="delete-note" title="删除此便签">✕</button>`;
            div.innerHTML = html;
            frag.appendChild(div);
        });
    }
    noteList.innerHTML = '';
    noteList.appendChild(frag);
    // 若当前便签不存在，自动切换（基于完整 notes 数组，而非过滤后的列表）
    if (!notes.find(n => n.id === currentNoteId)) {
        if (notes.length > 0) switchNote(notes[0].id);
        else { currentNoteId = null; renderEditor(); renderTodoList(); }
    }
}

// 事件委托：点击便签列表项
noteList.addEventListener('click', (e) => {
    // 点击归档按钮
    if (e.target.dataset.action === 'archive-note' || e.target.closest('[data-action="archive-note"]')) {
        e.stopPropagation();
        const item = e.target.closest('.note-item');
        if (item && item.dataset.id) archiveNote(Number(item.dataset.id));
        return;
    }
    // 点击删除按钮
    if (e.target.dataset.action === 'delete-note' || e.target.closest('[data-action="delete-note"]')) {
        e.stopPropagation();
        const item = e.target.closest('.note-item');
        if (item && item.dataset.id) deleteNote(Number(item.dataset.id));
        return;
    }
    const item = e.target.closest('.note-item');
    if (item && item.dataset.id) {
        switchNote(Number(item.dataset.id));
    }
});

// 右键菜单：便签删除
const noteCtxMenu = $('noteCtxMenu');
let ctxMenuNoteId = null;
noteList.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.note-item');
    if (!item || !item.dataset.id) return;
    e.preventDefault();
    ctxMenuNoteId = Number(item.dataset.id);
    noteCtxMenu.style.left = e.clientX + 'px';
    noteCtxMenu.style.top = e.clientY + 'px';
    noteCtxMenu.classList.add('open');
});
// 点击菜单项
noteCtxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'delete' && ctxMenuNoteId !== null) {
        deleteNote(ctxMenuNoteId);
    }
    noteCtxMenu.classList.remove('open');
    ctxMenuNoteId = null;
});
// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    if (!noteCtxMenu.contains(e.target)) noteCtxMenu.classList.remove('open');
});
document.addEventListener('contextmenu', (e) => {
    if (!noteList.contains(e.target)) noteCtxMenu.classList.remove('open');
});

// 删除便签函数（删除后进入垃圾桶，不弹确认框）
async function deleteNote(id) {
    // 取消挂起的自动保存定时器，防止切换后回调用错 currentNoteId 写盘
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // 修复：删除/归档/切换/新建便签时也清理 pushTimer，避免向已不存在的便签推送脏数据
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    // 找到被删除的便签，移入垃圾桶（添加 trashedAt 字段记录删除时间）
    const deleted = notes.find(n => n.id === id);
    if (deleted) {
        deleted.trashedAt = now();
        trashedNotes.unshift(deleted);
        await window.api.saveTrashedNotes(trashedNotes);
    }
    notes = notes.filter(n => n.id !== id);
    if (currentNoteId === id) {
        currentNoteId = notes.length > 0 ? notes[0].id : null;
    }
    await saveNotesToDisk();
    renderNoteList();
    renderEditor();
    renderTodoList();
}

// 归档便签函数（点击即归档，不弹确认框，移入归档文件夹）
async function archiveNote(id) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // 修复：删除/归档/切换/新建便签时也清理 pushTimer，避免向已不存在的便签推送脏数据
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const archived = notes.find(n => n.id === id);
    if (archived) {
        archived.archivedAt = now();
        archivedNotes.unshift(archived);
        await window.api.saveArchivedNotes(archivedNotes);
    }
    notes = notes.filter(n => n.id !== id);
    if (currentNoteId === id) {
        currentNoteId = notes.length > 0 ? notes[0].id : null;
    }
    await saveNotesToDisk();
    renderNoteList();
    renderEditor();
}

let switchNoteToken = 0;  // 自增 token，防止快速连续切便签时旧回调覆盖新状态导致 UI 闪烁
async function switchNote(id) {
    // 取消挂起的自动保存定时器，防止切换后回调把旧内容写到新便签
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // 修复：删除/归档/切换/新建便签时也清理 pushTimer，避免向已不存在的便签推送脏数据
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    // 保存当前便签的未保存内容
    if (contentDirty && currentNoteId) {
        const cur = getCurrentNote();
        if (cur) { cur.content = noteInput.value; cur.updatedAt = now(); contentDirty = false; }
    }
    const myToken = ++switchNoteToken;
    currentNoteId = id;
    await saveNotesToDisk();
    // 如果在 await 期间用户又切了别的便签，本次回调作废，不刷新 UI（避免闪烁）
    if (myToken !== switchNoteToken) return;
    renderNoteList();
    renderEditor();
}

async function createNote() {
    // 取消挂起的自动保存定时器，防止新建后回调把内容写到新便签
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // 修复：删除/归档/切换/新建便签时也清理 pushTimer，避免向已不存在的便签推送脏数据
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (contentDirty && currentNoteId) {
        const cur = getCurrentNote();
        if (cur) { cur.content = noteInput.value; cur.updatedAt = now(); contentDirty = false; }
    }
    const newNote = { id: genId(), content: '', createdAt: now(), updatedAt: now() };
    notes.push(newNote);
    currentNoteId = newNote.id;
    await saveNotesToDisk();
    renderNoteList();
    renderEditor();
    renderTodoList();
    noteInput.focus();
    // 埋点：新建便签算一次编辑
    if (window.api && window.api.incrementActivity) {
        try { window.api.incrementActivity('note'); } catch (e) { console.warn('便签埋点上报失败:', e.message); }
    }
}

function renderEditor() {
    const note = getCurrentNote();
    if (note) {
        noteInput.value = note.content;
        noteInput.placeholder = '在此输入便签内容...';
        // 不再使用 disabled 锁定输入框，避免初始化时序问题导致无法输入
        noteInput.removeAttribute('disabled');
        noteInput.disabled = false;
    } else {
        noteInput.value = '';
        noteInput.placeholder = '点击 + 新建便签';
        // 无便签时也不禁用，允许用户直接开始输入（输入时自动新建便签）
        noteInput.removeAttribute('disabled');
        noteInput.disabled = false;
    }
    contentDirty = false;
    // 切换便签后若处于 Markdown 预览模式，刷新预览内容
    if (typeof refreshMarkdownPreviewIfActive === 'function') {
        refreshMarkdownPreviewIfActive();
    }
}

// 格式化待办显示时间 (月-日 时:分)
function formatTodoTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
}

// 事件委托：待办列表（含归档操作按钮与完成/删除）
todoList.addEventListener('click', (e) => {
    const item = e.target.closest('.todo-item');
    if (!item || !item.dataset.id) return;
    const todoId = Number(item.dataset.id);
    if (e.target.classList.contains('todo-check')) {
        toggleTodo(todoId);
    } else if (e.target.closest('.todo-archive-btn')) {
        e.stopPropagation();
        archiveTodo(todoId);
    } else if (e.target.classList.contains('todo-del')) {
        e.stopPropagation();
        deleteTodo(todoId);
    }
});

function renderTodoList() {
    todoList.innerHTML = '';
    // 排序：未完成在前，已完成在后；同等状态按创建时间倒序
    const sorted = todos.slice().sort((a, b) => {
        const aDone = !!a.done;
        const bDone = !!b.done;
        if (aDone !== bDone) return aDone ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
    todoCount.textContent = todos.length;
    const frag = document.createDocumentFragment();
    sorted.forEach(t => {
        const item = document.createElement('div');
        item.className = 'todo-item';
        item.dataset.id = t.id;

        const chk = document.createElement('div');
        chk.className = 'todo-check' + (t.done ? ' checked' : '');
        chk.textContent = t.done ? '\u2713' : '';

        const contentWrap = document.createElement('div');
        contentWrap.className = 'todo-content-wrap';

        const txt = document.createElement('span');
        txt.className = 'todo-text' + (t.done ? ' done' : '');
        txt.textContent = t.text;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'todo-time';
        if (t.done && t.completedAt) {
            timeSpan.textContent = `完成于 ${formatTodoTime(t.completedAt)}`;
        } else {
            timeSpan.textContent = formatTodoTime(t.createdAt || t.id);
        }
        contentWrap.append(txt, timeSpan);

        // 归档按钮（复用小图标样式）
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'todo-archive-btn';
        archiveBtn.title = '归档此待办';
        archiveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';

        const del = document.createElement('button');
        del.className = 'todo-del';
        del.textContent = '\u2715';

        item.append(chk, contentWrap, archiveBtn, del);
        frag.appendChild(item);
    });
    todoList.appendChild(frag);
}

async function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    const currentTime = now();
    todos.push({
        id: genId(),
        text,
        done: false,
        createdAt: currentTime,
        updatedAt: currentTime
    });
    todoInput.value = '';
    saveTodosToDiskDebounced();
    renderTodoList();
    pushTodosToPopoutIfOpen();
    todoInput.focus();
}

async function toggleTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.updatedAt = now();
    if (t.done) {
        t.completedAt = now();
    } else {
        delete t.completedAt;
    }
    saveTodosToDiskDebounced();
    renderTodoList();
    pushTodosToPopoutIfOpen();
    if (t.done && window.api && window.api.incrementActivity) {
        try { window.api.incrementActivity('todo'); } catch (e) { console.warn('待办埋点上报失败:', e.message); }
    }
}

async function deleteTodo(id) {
    todos = todos.filter(x => x.id !== id);
    saveTodosToDiskDebounced();
    renderTodoList();
    pushTodosToPopoutIfOpen();
}

async function archiveTodo(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    todos = todos.filter(x => x.id !== id);
    t.archivedAt = now();
    archivedTodos.unshift(t);
    await saveTodosToDisk();
    await saveArchivedTodosToDisk();
    renderTodoList();
    if (typeof renderTodoArchiveList === 'function') renderTodoArchiveList();
    pushTodosToPopoutIfOpen();
}

async function saveContentAndFlush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // 修复：删除/归档/切换/新建便签时也清理 pushTimer，避免向已不存在的便签推送脏数据
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const note = getCurrentNote();
    if (note) { note.content = noteInput.value; note.updatedAt = now(); }
    contentDirty = false;
    await saveNotesToDisk();
    renderNoteList();
    // 埋点：手动保存（Ctrl+Enter 或切换便签触发）给今日便签编辑 +1
    // 注意：handleContentInput 的防抖自动保存不走此路径，避免连续输入导致计数爆炸
    if (window.api && window.api.incrementActivity) {
        try { window.api.incrementActivity('note'); } catch (e) { console.warn('便签埋点上报失败:', e.message); }
    }
}

function handleContentInput() {
    contentDirty = true;
    const note = getCurrentNote();
    if (note) { note.content = noteInput.value; note.updatedAt = now(); }
    // 实时推送给独立小窗口（如果已扯出）—— 主窗口改 → 小窗口同步
    // P1-2: 改为 200ms 防抖（独立计时器，与 500ms 保存防抖解耦），避免快速输入时 IPC 压力堆积
    if (note && note.id && typeof window.api.pushNoteToPopout === 'function') {
        const nid = String(note.id);
        const ncontent = note.content || '';
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            try { window.api.pushNoteToPopout(nid, ncontent); } catch (e) { console.warn('推送便签到小窗失败:', e.message); }
            pushTimer = null;
        }, 200);
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        contentDirty = false;
        await saveNotesToDisk();
        renderNoteList();
        // 后台悄悄生成历史快照（后悔药）：主进程会做时间间隔/内容变化校验
        if (note && note.id) {
            try { await window.api.saveNoteSnapshot(note.id, note.content || ''); } catch (e) { console.error('保存便签历史快照失败:', e.message); }
        }
    }, SAVE_DELAY);
}

/* ==================== 标题栏按钮 ==================== */
minBtn.addEventListener('click', () => window.api.minimizeWindow());

const maxBtn = $('maxBtn');
maxBtn.addEventListener('click', async () => {
    const isMax = await window.api.maximizeWindow();
    maxBtn.title = isMax ? '还原窗口' : '最大化';
});

pinBtn.addEventListener('click', async () => {
    const p = await window.api.togglePin();
    pinBtn.classList.toggle('active', p);
    pinBtn.title = p ? '取消置顶' : '窗口置顶';
});

fixedBtn.addEventListener('click', async () => {
    const f = await window.api.toggleFixed();
    fixedBtn.classList.toggle('active', f);
    fixedBtn.title = f ? '已固定（点击解除）' : '固定窗口位置';
});

/* ==================== 便签历史版本（后悔药） ====================
 * 在便签内容区右上角加一个小钟表按钮，点击弹出历史时间点列表
 * 点击某个时间点，把当时的内容恢复到输入框
 * 历史快照由主进程在每次自动保存时悄悄生成（60s 间隔，最多 10 个）
 * ============================================================ */
const noteHistoryBtn = $('noteHistoryBtn');
const noteHistoryPanel = $('noteHistoryPanel');
const noteHistoryList = $('noteHistoryList');

noteHistoryBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const note = getCurrentNote();
    if (!note || !note.id) return;
    let history = [];
    try { history = await window.api.listNoteHistory(note.id) || []; }
    catch (_) { history = []; }
    if (history.length === 0) {
        // 无历史：闪烁提示
        flashBtn(noteHistoryBtn, '#FF9F0A');
        return;
    }
    renderHistoryList(note, history);
    closeAllPanels();
    noteHistoryPanel.classList.add('open');
    positionPanel(noteHistoryBtn, noteHistoryPanel);
});

/**
 * 渲染历史快照列表
 * 展示规则：锁定的版本在底部独立分组（带"已锁死"标签），未锁定的在上面按时间倒序
 * 点击锁形按钮：切换锁定状态，不触发内容恢复
 * 点击列表项：恢复内容
 */
function renderHistoryList(note, history) {
    noteHistoryList.innerHTML = '';
    // 分两组：未锁定 + 锁定
    const unlocked = history.filter(h => !h.locked);
    const locked = history.filter(h => h.locked);
    // 未锁定的倒序（最新在最上）
    const sortedUnlocked = unlocked.slice().sort((a, b) => b.ts - a.ts);
    // 锁定的也倒序
    const sortedLocked = locked.slice().sort((a, b) => b.ts - a.ts);

    const appendItem = (item, isLocked) => {
        const li = document.createElement('div');
        li.className = 'history-item' + (isLocked ? ' locked' : '');
        const mainCol = document.createElement('div');
        mainCol.className = 'history-main';
        const time = document.createElement('div');
        time.className = 'history-time';
        try { time.textContent = new Date(item.ts).toLocaleString('zh-CN'); }
        catch (_) { time.textContent = String(item.ts); }
        const preview = document.createElement('div');
        preview.className = 'history-preview';
        preview.textContent = (item.content || '').slice(0, 60) + ((item.content || '').length > 60 ? '...' : '');
        mainCol.appendChild(time);
        mainCol.appendChild(preview);
        // 锁定按钮（图钉图标）
        const lockBtn = document.createElement('button');
        lockBtn.className = 'history-lock-btn' + (isLocked ? ' active' : '');
        lockBtn.title = isLocked ? '已锁死（点击解锁）' : '锁死此版本（永久保留）';
        lockBtn.innerHTML = isLocked
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 8V7a4 4 0 1 0-8 0v1H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2zm-6 0V7a2 2 0 1 1 4 0v1h-4z"/></svg>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
        lockBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            try {
                const r = await window.api.toggleHistoryLock(note.id, item.ts);
                if (r && r.success) {
                    // 重新拉取并重渲染
                    const fresh = await window.api.listNoteHistory(note.id) || [];
                    renderHistoryList(note, fresh);
                }
            } catch (e) { console.warn('切换历史记录锁失败:', e.message); }
        });
        mainCol.appendChild(lockBtn);
        li.appendChild(mainCol);
        // 点击列表项恢复内容（点击锁形按钮不触发）
        li.addEventListener('click', () => {
            if (noteInput.value !== item.content) {
                noteInput.value = item.content;
                const cur = getCurrentNote();
                if (cur) { cur.content = item.content; cur.updatedAt = now(); contentDirty = true; }
                handleContentInput();
            }
            closeNoteHistoryPanel();
        });
        noteHistoryList.appendChild(li);
    };

    // 先渲染未锁定的
    sortedUnlocked.forEach(item => appendItem(item, false));
    // 如果有锁定的，加一个分隔标题再渲染锁定的
    if (sortedLocked.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'history-separator';
        sep.textContent = `🔒 已锁死版本（${sortedLocked.length}）· 永久保留`;
        noteHistoryList.appendChild(sep);
        sortedLocked.forEach(item => appendItem(item, true));
    }
}

function closeNoteHistoryPanel() {
    if (noteHistoryPanel) noteHistoryPanel.classList.remove('open');
}

/* ==================== 便签一键转长图（复制到剪贴板） ====================
 * 用户点击导出图片按钮 → 把当前便签内容渲染成高清长图 → 自动复制到剪贴板
 * 严格要求：
 *   1. 只用最干净的浅色主题（白底黑字），不带任何深色效果
 *   2. 不带任何外边框/软件皮肤，纯粹干净内容
 *   3. 自动复制到剪贴板，用户直接 Ctrl+V 发送
 * 实现方案：用 SVG foreignObject 包裹 HTML 内容 → 转 canvas → toDataURL → clipboard
 * ============================================================ */
const exportImageBtn = $('exportImageBtn');
exportImageBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const note = getCurrentNote();
    if (!note || !note.content || !note.content.trim()) {
        // 空内容：闪烁提示
        flashBtn(exportImageBtn, '#FF9F0A');
        return;
    }
    try {
        const dataUrl = await renderNoteToImageDataUrl(note);
        if (!dataUrl) {
            flashBtn(exportImageBtn, '#FF453A');
            return;
        }
        const ok = await window.api.copyImageToClipboard(dataUrl);
        if (ok) {
            // 成功：闪绿
            flashBtn(exportImageBtn, '#34C759');
        } else {
            flashBtn(exportImageBtn, '#FF453A');
        }
    } catch (err) {
        flashBtn(exportImageBtn, '#FF453A');
    }
});

/**
 * 把便签渲染为图片 dataURL
 * 方案：直接用 Canvas 2D API 绘制文本（避免 SVG foreignObject 在 Chromium 中的安全限制）
 * 严格要求：白底黑字、无外框、无深色效果
 * @param {{title?:string, content:string}} note
 * @returns {Promise<string|null>} dataURL 或 null
 */
function noteLineHeight(fs) {
    return Math.ceil(fs * 1.75);
}

function wrapNoteText(ctx, text, maxWidth, font) {
    ctx.font = font;
    const lines = [];
    const paragraphs = String(text).split('\n');
    for (const para of paragraphs) {
        if (para === '') { lines.push(''); continue; }
        let current = '';
        for (let i = 0; i < para.length; i++) {
            const ch = para[i];
            const test = current + ch;
            if (ctx.measureText(test).width > maxWidth && current.length > 0) {
                lines.push(current);
                current = ch;
            } else {
                current = test;
            }
        }
        if (current !== '') lines.push(current);
        else if (lines.length === 0) lines.push('');
    }
    return lines.length > 0 ? lines : [''];
}

function buildNoteRenderItems(mctx, title, blocks, opts) {
    const { innerWidth, fontFamily, monoFamily } = opts;
    const renderItems = [];
    let cursorMarginTop = 0;

    if (title) {
        const titleLines = wrapNoteText(mctx, title, innerWidth, `600 18px ${fontFamily}`);
        for (const line of titleLines) {
            renderItems.push({ text: line, fontSize: 18, fontWeight: '600', color: '#0A0A0A', fontFamily, indent: 0, marginTop: cursorMarginTop });
            cursorMarginTop = 0;
        }
        renderItems.push({ text: '', fontSize: 4, fontWeight: '400', color: '#E5E5E5', fontFamily, indent: 0, marginTop: 8, isDivider: true });
        cursorMarginTop = 10;
    }

    for (const block of blocks) {
        if (block.type === 'code') {
            const codeLines = String(block.text).split('\n');
            const codeFont = `400 13px ${monoFamily}`;
            const codePadX = 12, codePadY = 10;
            const codeMaxWidth = innerWidth - codePadX * 2;
            const wrappedCode = [];
            for (const cl of codeLines) {
                const ws = wrapNoteText(mctx, cl === '' ? '' : cl, codeMaxWidth, codeFont);
                for (const w of ws) wrappedCode.push(w);
            }
            renderItems.push({ text: '', fontSize: 0, isCodeBlockStart: true, marginTop: cursorMarginTop > 0 ? cursorMarginTop : 8, codePadY });
            for (const w of wrappedCode) {
                renderItems.push({ text: w, fontSize: 13, fontWeight: '400', color: '#2A2A2A', fontFamily: monoFamily, indent: 0, isCodeLine: true, codePadX, codePadY });
            }
            renderItems.push({ text: '', fontSize: 0, isCodeBlockEnd: true, codePadY });
            cursorMarginTop = 8;
        } else if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
            const cfg = block.type === 'h1' ? { fs: 18, mt: 14, mb: 4 } : block.type === 'h2' ? { fs: 17, mt: 12, mb: 4 } : { fs: 16, mt: 10, mb: 4 };
            const font = `600 ${cfg.fs}px ${fontFamily}`;
            const wrapped = wrapNoteText(mctx, block.text, innerWidth, font);
            for (const line of wrapped) {
                renderItems.push({ text: line, fontSize: cfg.fs, fontWeight: '600', color: '#0A0A0A', fontFamily, indent: 0, marginTop: cursorMarginTop > 0 ? 0 : cfg.mt });
                cursorMarginTop = 0;
            }
            cursorMarginTop = cfg.mb;
        } else if (block.type === 'list') {
            const font = `400 15px ${fontFamily}`;
            const indent = 18;
            const wrapped = wrapNoteText(mctx, block.text, innerWidth - indent, font);
            for (const line of wrapped) {
                renderItems.push({ text: line, fontSize: 15, fontWeight: '400', color: '#1A1A1A', fontFamily, indent, isList: true, marginTop: cursorMarginTop > 0 ? 0 : 2 });
                cursorMarginTop = 0;
            }
            cursorMarginTop = 2;
        } else {
            const font = `400 15px ${fontFamily}`;
            const wrapped = wrapNoteText(mctx, block.text, innerWidth, font);
            for (const line of wrapped) {
                renderItems.push({ text: line, fontSize: 15, fontWeight: '400', color: '#1A1A1A', fontFamily, indent: 0, marginTop: cursorMarginTop > 0 ? 0 : 4 });
                cursorMarginTop = 0;
            }
            cursorMarginTop = 4;
        }
    }

    renderItems.push({ text: '', fontSize: 4, fontWeight: '400', color: '#EEEEEE', fontFamily, indent: 0, marginTop: 16, isDivider: true });
    const tsStr = `便签 · ${new Date().toLocaleString('zh-CN')}`;
    renderItems.push({ text: tsStr, fontSize: 11, fontWeight: '400', color: '#999999', fontFamily, indent: 0, marginTop: 6, align: 'right' });
    return renderItems;
}

function measureNoteHeight(renderItems, padding) {
    let totalHeight = padding * 2;
    for (const item of renderItems) {
        if (item.isCodeBlockStart) { totalHeight += item.marginTop || 0; totalHeight += item.codePadY; continue; }
        if (item.isCodeBlockEnd) { totalHeight += item.codePadY; continue; }
        if (item.isDivider) { totalHeight += (item.marginTop || 0) + 4 + 4; continue; }
        totalHeight += (item.marginTop || 0) + noteLineHeight(item.fontSize);
    }
    return totalHeight;
}

function drawNoteToCanvas(ctx, renderItems, opts) {
    const { width, totalHeight, padding, innerWidth, monoFamily } = opts;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, totalHeight);
    ctx.textBaseline = 'top';

    let y = padding;
    let codeBlockStartY = 0;
    let codeBuffer = [];

    for (const item of renderItems) {
        if (item.isCodeBlockStart) {
            y += (item.marginTop || 0);
            codeBlockStartY = y;
            codeBuffer = [];
            y += item.codePadY;
            continue;
        }
        if (item.isCodeBlockEnd) {
            const blockH = y - codeBlockStartY + item.codePadY;
            ctx.fillStyle = '#F5F5F5';
            roundRect(ctx, padding, codeBlockStartY, innerWidth, blockH, 6);
            ctx.fill();
            ctx.font = `400 13px ${monoFamily}`;
            ctx.fillStyle = '#2A2A2A';
            let ty = codeBlockStartY + item.codePadY;
            for (const tl of codeBuffer) {
                const tY = ty + Math.ceil((noteLineHeight(13) - 13) / 2);
                ctx.fillText(tl, padding + 12, tY);
                ty += noteLineHeight(13);
            }
            y += item.codePadY;
            continue;
        }
        if (item.isDivider) {
            y += (item.marginTop || 0) + 4;
            ctx.fillStyle = item.color;
            ctx.fillRect(padding, y, innerWidth, 1);
            y += 4;
            continue;
        }
        if (item.isCodeLine) {
            codeBuffer.push(item.text);
            y += noteLineHeight(item.fontSize);
            continue;
        }
        y += (item.marginTop || 0);
        const font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`;
        ctx.font = font;
        ctx.fillStyle = item.color;
        const textY = y + Math.ceil((noteLineHeight(item.fontSize) - item.fontSize) / 2);
        const x = padding + (item.indent || 0);
        if (item.isList) {
            ctx.fillText('•', x, textY);
            ctx.fillText(item.text, x + 14, textY);
        } else if (item.align === 'right') {
            const tw = ctx.measureText(item.text).width;
            ctx.fillText(item.text, padding + innerWidth - tw, textY);
        } else {
            ctx.fillText(item.text, x, textY);
        }
        y += noteLineHeight(item.fontSize);
    }
}

async function renderNoteToImageDataUrl(note) {
    try {
        const title = (note.title && note.title.trim()) ? note.title.trim() : '';
        const content = note.content || '';
        const padding = 32;
        const width = 720;
        const scale = 2;  // 2 倍清晰度
        const innerWidth = width - padding * 2;
        const fontFamily = '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
        const monoFamily = 'Consolas, "SF Mono", "Courier New", monospace';

        const blocks = parseContentToBlocks(content);
        const measureCanvas = document.createElement('canvas');
        const mctx = measureCanvas.getContext('2d');

        const renderItems = buildNoteRenderItems(mctx, title, blocks, { innerWidth, fontFamily, monoFamily });
        const totalHeight = measureNoteHeight(renderItems, padding);

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = totalHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        drawNoteToCanvas(ctx, renderItems, { width, totalHeight, padding, innerWidth, monoFamily });

        return canvas.toDataURL('image/png');
    } catch (e) {
        return null;
    }
}

/** 圆角矩形辅助函数 */
function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/**
 * 把便签内容（Markdown 风格）解析为渲染块列表
 * 支持：代码块、标题 #/##/###、列表 -/*、数字列表 1.、普通段落
 * 同时剥离行内 **加粗** 和 `行内代码` 标记，输出纯文本
 * @param {string} text
 * @returns {Array<{type:string, text:string}>}
 */
function parseContentToBlocks(text) {
    if (!text) return [];
    const lines = String(text).split('\n');
    const blocks = [];
    let inCode = false;
    let codeBuf = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
            if (inCode) {
                blocks.push({ type: 'code', text: codeBuf.join('\n') });
                codeBuf = [];
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }
        if (inCode) { codeBuf.push(line); continue; }
        // 标题
        let m;
        if ((m = line.match(/^### (.+)$/))) { blocks.push({ type: 'h3', text: stripInline(m[1]) }); continue; }
        if ((m = line.match(/^## (.+)$/)))  { blocks.push({ type: 'h2', text: stripInline(m[1]) }); continue; }
        if ((m = line.match(/^# (.+)$/)))   { blocks.push({ type: 'h1', text: stripInline(m[1]) }); continue; }
        // 列表
        if ((m = line.match(/^[\-\*] (.+)$/))) { blocks.push({ type: 'list', text: stripInline(m[1]) }); continue; }
        if ((m = line.match(/^\d+\. (.+)$/)))  { blocks.push({ type: 'list', text: stripInline(line.match(/^\d+\./)[0] + ' ' + m[1]) }); continue; }
        // 空行
        if (line.trim() === '') { blocks.push({ type: 'text', text: '' }); continue; }
        // 普通段落
        blocks.push({ type: 'text', text: stripInline(line) });
    }
    if (inCode && codeBuf.length) blocks.push({ type: 'code', text: codeBuf.join('\n') });
    return blocks;
}

/** 剥离行内 **加粗** 和 `代码` 标记，返回纯文本 */
function stripInline(s) {
    return String(s)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
}

/* ==================== 扯出小纸条（便签独立置顶小窗口） ====================
 * 点击"扯出小纸条"按钮 → 主进程打开一个独立小窗口
 * - 小窗口始终置顶，方便对照
 * - 实时双向同步：主窗口改 → 推给小窗口；小窗口改 → 同步回主窗口
 * - 双击小窗口标题栏或点叉号 = 关闭并缩回主窗口
 * ============================================================ */
const popoutNoteBtn = $('popoutNoteBtn');
// 记录每条便签是否已扯出小窗口（避免重复打开）
let poppedOutNoteId = null;
// 标记来自小窗口的内容更新，handleContentInput 时跳过回推，避免 IPC 回环
let suppressPushToPopout = false;
// 待办小窗口更新用独立计时器，避免与 handleContentInput 的 saveTimer 交叉覆盖

popoutNoteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const note = getCurrentNote();
    if (!note || !note.id) return;
    try {
        const title = (note.title && note.title.trim()) ? note.title.trim() : '便签';
        const result = await window.api.popOutNote(note.id, title, note.content || '');
        if (result && result.success) {
            poppedOutNoteId = String(note.id);
            // 闪烁反馈
            flashBtn(popoutNoteBtn, '#0A84FF', 1200);
        } else if (result && result.message) {
            flashBtn(popoutNoteBtn, '#FF453A');
        }
    } catch (_) {
        flashBtn(popoutNoteBtn, '#FF453A');
    }
});

// 小窗口内容更新 → 同步回主窗口的 textarea 和 note 对象
if (window.api && typeof window.api.onPopoutNoteUpdate === 'function') {
    window.api.onPopoutNoteUpdate((data) => {
        if (!data || !data.noteId) return;
        const note = getCurrentNote();
        if (note && String(note.id) === String(data.noteId)) {
            if (data.content !== undefined && data.content !== noteInput.value) {
                noteInput.value = data.content;
                note.content = data.content;
                note.updatedAt = now();
                contentDirty = true;
                suppressPushToPopout = true;
                handleContentInput();
                suppressPushToPopout = false;
            }
        }
    });
}

// 小窗口关闭 → 清理标记
if (window.api && typeof window.api.onPopoutNoteClose === 'function') {
    window.api.onPopoutNoteClose((data) => {
        if (!data || !data.noteId) return;
        if (poppedOutNoteId === String(data.noteId)) {
            poppedOutNoteId = null;
        }
    });
}

/* ==================== 扯出待办小纸条（待办事项独立置顶小窗口） ====================
 * 点击"扯出待办"按钮 → 主进程打开待办小窗口
 * - 双向同步：主窗口改待办 → 推给小窗口；小窗口改待办 → 同步回主窗口
 * - 顶部含置顶切换按钮
 * ============================================================ */
const popoutTodoBtn = $('popoutTodoBtn');
let poppedOutTodoNoteId = null;

if (popoutTodoBtn) {
    popoutTodoBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const title = '待办事项';
            const result = await window.api.popOutTodo('global-todos', title, todos.slice());
            if (result && result.success) {
                poppedOutTodoNoteId = 'global-todos';
                flashBtn(popoutTodoBtn, '#0A84FF', 1200);
            } else if (result && result.message) {
                flashBtn(popoutTodoBtn, '#FF453A');
            }
        } catch (_) {
            flashBtn(popoutTodoBtn, '#FF453A');
        }
    });
}

// 待办小窗口更新 → 同步回主窗口全局 todos 并触发重渲染 + 保存
if (window.api && typeof window.api.onPopoutTodoUpdate === 'function') {
    window.api.onPopoutTodoUpdate((data) => {
        if (!data) return;
        if (Array.isArray(data.todos)) {
            todos = data.todos;
            renderTodoList();
            if (typeof pushTodosToPopoutIfOpen === 'function') pushTodosToPopoutIfOpen();
            saveTodosToDisk();
        }
    });
}

// 待办小窗口关闭 → 清理标记
if (window.api && typeof window.api.onPopoutTodoClose === 'function') {
    window.api.onPopoutTodoClose((data) => {
        if (!data) return;
        if (poppedOutTodoNoteId === 'global-todos') {
            poppedOutTodoNoteId = null;
        }
    });
}

// 主窗口改了待办 → 实时推送给待办小窗口（如果已扯出）
function pushTodosToPopoutIfOpen() {
    if (typeof window.api.pushTodosToPopout !== 'function') return;
    try {
        window.api.pushTodosToPopout('global-todos', todos.slice());
    } catch (e) { console.warn('推送待办到弹窗失败:', e.message); }
}

closeBtn.addEventListener('click', async () => {
    if (contentDirty) {
        const note = getCurrentNote();
        if (note) { note.content = noteInput.value; note.updatedAt = now(); }
        contentDirty = false;
        await saveNotesToDisk();
        renderNoteList();
    }
    window.api.closeWindow();
});

/* ==================== AI 设置模态框 ==================== */
// settingsAiBtn 事件绑定已迁移至"软件设置弹出面板"代码段中

const closeAIModal = () => {
    aiModal.classList.remove('open');
    modelStatus.textContent = '';
    modelStatus.className = 'model-status';
};

bindModalClose(aiModal, modalCloseBtn, closeAIModal);
aiTemperature.addEventListener('input', function() { tempValue.textContent = parseFloat(this.value).toFixed(1); });

/* ==================== 应用日志查看器（升级：级别+来源筛选 + 统计信息）==================== */
const logModal = $('logModal');
const logCloseBtn = $('logCloseBtn');
const logRefreshBtn = $('logRefreshBtn');
const logCopyBtn = $('logCopyBtn');
const logClearBtn = $('logClearBtn');
const logContent = $('logContent');
const logInfo = $('logInfo');
const viewLogsBtn = $('viewLogsBtn');
// 筛选下拉框引用
const logLevelFilter = $('logLevelFilter');
const logSourceFilter = $('logSourceFilter');

// 构建当前筛选条件对象（空字符串表示不筛该项）
function buildLogFilter() {
    const filter = {};
    if (logLevelFilter && logLevelFilter.value) filter.level = logLevelFilter.value;
    if (logSourceFilter && logSourceFilter.value) filter.source = logSourceFilter.value;
    return filter;
}

// 渲染日志文本到 <pre>（提取公共逻辑，避免 load/refresh 重复）
function renderLogText(text, prefix) {
    if (text && text.trim()) {
        // 用 textContent 渲染，保证日志原文不被当 HTML 解析（防 XSS），且可选中复制
        logContent.textContent = text;
        const lines = text.split('\n').length;
        const chars = text.length;
        const p = prefix ? (prefix + ' / ') : '';
        logInfo.textContent = p + '共 ' + lines + ' 行 / ' + chars + ' 字符';
    } else {
        logContent.textContent = '';
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = '暂无日志';
        logContent.appendChild(empty);
        logInfo.textContent = prefix ? (prefix + ' / 日志为空') : '日志为空';
    }
}

// 加载日志并渲染到 <pre>（带筛选参数 + 统计信息）
async function loadLogsIntoView() {
    logInfo.textContent = '加载中...';
    try {
        const filter = buildLogFilter();
        // 并行拉取日志文本 + 元数据统计
        const [text, meta] = await Promise.all([
            window.api.getLogs(filter),
            window.api.getLogMeta().catch(() => null),
        ]);
        renderLogText(text, '');
        // 在 logInfo 后追加统计信息（按级别/来源计数）
        if (meta && meta.success) {
            const lvl = meta.byLevel || {};
            const src = meta.bySource || {};
            const statParts = [];
            if (lvl.ERROR) statParts.push('ERROR:' + lvl.ERROR);
            if (lvl.WARN) statParts.push('WARN:' + lvl.WARN);
            if (lvl.INFO) statParts.push('INFO:' + lvl.INFO);
            const srcParts = Object.keys(src).map(k => k + ':' + src[k]).join(' ');
            logInfo.title = '来源分布: ' + srcParts;
            if (statParts.length > 0) {
                logInfo.textContent += '  [' + statParts.join(' ') + ']';
            }
        }
    } catch (e) {
        logContent.textContent = '加载失败: ' + e.message;
        logInfo.textContent = '加载失败';
    }
}

// 打开日志窗口
function openLogModal() {
    logModal.classList.add('open');
    loadLogsIntoView();
}
function closeLogModal() {
    logModal.classList.remove('open');
}

viewLogsBtn.addEventListener('click', openLogModal);
bindModalClose(logModal, logCloseBtn);

// 筛选下拉框变化时自动重新加载（复用 200ms 防抖，避免快速切换多次 IPC）
let logFilterDebounce = null;
function onLogFilterChange() {
    if (logFilterDebounce) clearTimeout(logFilterDebounce);
    logFilterDebounce = setTimeout(loadLogsIntoView, 200);
}
if (logLevelFilter) logLevelFilter.addEventListener('change', onLogFilterChange);
if (logSourceFilter) logSourceFilter.addEventListener('change', onLogFilterChange);

// 刷新：从主进程拉取最新日志（带筛选参数）
logRefreshBtn.addEventListener('click', async () => {
    logRefreshBtn.disabled = true;
    logRefreshBtn.textContent = '刷新中...';
    try {
        const filter = buildLogFilter();
        const text = await window.api.refreshLogs(filter);
        renderLogText(text, '已刷新');
    } catch (e) {
        logInfo.textContent = '刷新失败: ' + e.message;
    } finally {
        logRefreshBtn.disabled = false;
        logRefreshBtn.textContent = '刷新';
    }
});

// 复制全部日志：传当前显示内容给主进程，由主进程写入剪贴板（绕过 CSP）
logCopyBtn.addEventListener('click', async () => {
    logCopyBtn.disabled = true;
    logCopyBtn.textContent = '复制中...';
    try {
        const text = logContent.textContent || '';
        const result = await window.api.copyAllLogs(text);
        if (result && result.success) {
            logCopyBtn.textContent = '已复制';
            logInfo.textContent = result.message;
        } else {
            logCopyBtn.textContent = '复制失败';
            logInfo.textContent = (result && result.message) || '复制失败';
        }
    } catch (e) {
        logCopyBtn.textContent = '复制失败';
        logInfo.textContent = e.message;
    } finally {
        setTimeout(() => { logCopyBtn.disabled = false; logCopyBtn.textContent = '复制全部日志'; }, 1500);
    }
});

// 清空日志：确认后清空内存 + 文件
logClearBtn.addEventListener('click', async () => {
    if (!confirm('确定要清空全部日志吗？此操作不可恢复（内存缓冲与日志文件都会被清空）。')) return;
    logClearBtn.disabled = true;
    try {
        const result = await window.api.clearLogs();
        if (result && result.success) {
            logContent.textContent = '';
            const empty = document.createElement('div');
            empty.className = 'log-empty';
            empty.textContent = '日志已清空';
            logContent.appendChild(empty);
            logInfo.textContent = '已清空';
        } else {
            logInfo.textContent = (result && result.message) || '清空失败';
        }
    } catch (e) {
        logInfo.textContent = e.message;
    } finally {
        logClearBtn.disabled = false;
    }
});

searchModelsBtn.addEventListener('click', async () => {
    const baseUrl = aiBaseUrl.value.trim();
    const apiKey = aiApiKey.value.trim();
    if (!baseUrl) { modelStatus.textContent = '请先填写 API 地址'; modelStatus.className = 'model-status error'; return; }
    if (!apiKey) { modelStatus.textContent = '请先填写 API Key'; modelStatus.className = 'model-status error'; return; }
    searchModelsBtn.disabled = true;
    searchModelsBtn.textContent = '搜索中...';
    modelStatus.textContent = '正在获取模型列表...';
    modelStatus.className = 'model-status';
    try {
        const models = await window.api.fetchModels(baseUrl, apiKey);
        modelList.innerHTML = '';
        if (models.length === 0) {
            modelStatus.textContent = '未获取到任何模型';
            modelStatus.className = 'model-status error';
        } else {
            modelStatus.textContent = `共 ${models.length} 个模型（点击输入框选择）`;
            modelStatus.className = 'model-status success';
            const frag = document.createDocumentFragment();
            models.forEach(id => {
                const o = document.createElement('option');
                o.value = id;
                frag.appendChild(o);
            });
            modelList.appendChild(frag);
            if (!models.includes(aiModelInput.value)) aiModelInput.value = '';
        }
    } catch (err) {
        modelStatus.textContent = '请求失败：' + err.message;
        modelStatus.className = 'model-status error';
    } finally {
        searchModelsBtn.disabled = false;
        searchModelsBtn.textContent = '搜索';
    }
});

modalSaveBtn.addEventListener('click', async () => {
    const baseUrl = aiBaseUrl.value.trim();
    const apiKey = aiApiKey.value.trim();
    const model = aiModelInput.value.trim();
    const temperature = parseFloat(aiTemperature.value) || 1;
    const prompt = aiPrompt.value.trim();
    if (!baseUrl) { modelStatus.textContent = '请填写 API 地址'; modelStatus.className = 'model-status error'; return; }
    if (!apiKey) { modelStatus.textContent = '请填写 API Key'; modelStatus.className = 'model-status error'; return; }
    if (!model) { modelStatus.textContent = '请选择或输入模型'; modelStatus.className = 'model-status error'; return; }
    modalSaveBtn.disabled = true;
    modalSaveBtn.textContent = '保存中...';
    try {
        await window.api.saveAIConfig({ baseUrl, apiKey, model, temperature, prompt });
        modelStatus.textContent = '设置已保存';
        modelStatus.className = 'model-status success';
        setTimeout(closeAIModal, 800);
    } catch (err) {
        modelStatus.textContent = '保存失败：' + err.message;
        modelStatus.className = 'model-status error';
    } finally {
        modalSaveBtn.disabled = false;
        modalSaveBtn.textContent = '保存聊天设置';
    }
});

/* ==================== 图片设置：双标准接口切换与保存 ==================== */

// 不同 provider 的占位符/默认值规范差异表
const IMG_PROVIDER_PROFILES = {
    openai: {
        baseUrlPh: 'OpenAI: https://api.openai.com/v1',
        apiKeyPh: 'sk-...',
        modelPh: 'dall-e-3 / dall-e-2',
        defaultModel: 'dall-e-3',
        defaultSize: '1024x1024',
    },
    dashscope: {
        baseUrlPh: '阿里云百炼: https://llm-xxx.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        apiKeyPh: 'sk-百炼 API Key',
        modelPh: 'qwen-image-2.0-pro / wan2.7-image-pro',
        defaultModel: 'qwen-image-2.0-pro',
        defaultSize: '2048*2048',
    },
};

// 把后端返回的配置应用到表单（同时同步占位符与 provider 选择器）
function applyImageConfigToForm(imgCfg) {
    const provider = imgCfg.provider || 'openai';
    imgProvider.value = provider;
    imgBaseUrl.value = imgCfg.baseUrl || '';
    imgApiKey.value = imgCfg.apiKey || '';
    imgModel.value = imgCfg.model || '';
    imgSavePath.value = imgCfg.savePath || '';
    videoT2vModel.value = imgCfg.videoT2vModel || '';
    videoI2vModel.value = imgCfg.videoI2vModel || '';
    videoBaseUrl.value = imgCfg.videoBaseUrl || '';
    videoApiKey.value = imgCfg.videoApiKey || '';
    applyProviderPlaceholders(provider);
    // 更新创作页模型选择下拉框的选项文本
    updateModelSelectLabels(imgCfg);
}

// 根据 provider 调整占位符（让用户直观看到当前规范的填写方式）
function applyProviderPlaceholders(provider) {
    const p = IMG_PROVIDER_PROFILES[provider] || IMG_PROVIDER_PROFILES.openai;
    imgBaseUrl.placeholder = p.baseUrlPh;
    imgApiKey.placeholder = p.apiKeyPh;
    imgModel.placeholder = p.modelPh;
}

// 切换接口标准：先把当前表单内容保存到对应 provider 的字段（不丢失），
// 然后从后端加载目标 provider 的配置填充到表单
imgProvider.addEventListener('change', async () => {
    const newProvider = imgProvider.value;
    // 先保存当前表单内容到原 provider（关键：保证切换不丢数据）
    // 注意：imgProvider.value 已变成新值，需要按"切换前"的 provider 保存
    // 通过临时切回旧值来调用 saveImageConfig（保存完再切回新值）
    const oldProvider = (await window.api.loadImageConfig()).provider || 'openai';
    if (oldProvider !== newProvider) {
        const curB = imgBaseUrl.value.trim();
        const curK = imgApiKey.value.trim();
        const curM = imgModel.value.trim();
        const curPath = imgSavePath.value.trim();
        // 仅当有任何内容时才保存（避免空值覆盖已有数据）
        if (curB || curK || curM || curPath) {
            try {
                await window.api.saveImageConfig({
                    provider: oldProvider,
                    baseUrl: curB,
                    apiKey: curK,
                    model: curM,
                    savePath: curPath,
                    videoT2vModel: videoT2vModel.value.trim(),
                    videoI2vModel: videoI2vModel.value.trim(),
                    videoBaseUrl: videoBaseUrl.value.trim(),
                    videoApiKey: videoApiKey.value.trim(),
                });
            } catch (e) { console.warn('保存图像配置失败:', e.message); }
        }
    }
    // 加载新 provider 的配置填充到表单
    try {
        // 切到目标 provider 后再 loadImageConfig，后端会按新 provider 返回数据
        // 这里通过先保存 provider 字段实现（loadImageConfig 读取的是已保存的 imageProvider）
        await window.api.saveImageConfig({ provider: newProvider });
        const newCfg = await window.api.loadImageConfig();
        applyImageConfigToForm(newCfg);
        modelStatus.textContent = '已切换到「' + (newProvider === 'dashscope' ? '阿里云百炼 DashScope' : 'OpenAI 标准') + '」';
        modelStatus.className = 'model-status success';
        setTimeout(() => { if (modelStatus.textContent.startsWith('已切换')) modelStatus.textContent = ''; }, 2000);
    } catch (err) {
        modelStatus.textContent = '切换失败：' + err.message;
        modelStatus.className = 'model-status error';
    }
});

browsePathBtn.addEventListener('click', async () => {
    const p = await window.api.selectFolder();
    if (p) imgSavePath.value = p;
});

imgSaveBtn.addEventListener('click', async () => {
    const provider = imgProvider.value;
    const imgB = imgBaseUrl.value.trim();
    const imgK = imgApiKey.value.trim();
    const imgM = imgModel.value.trim();
    if (!imgB && !imgK && !imgM) {
        modelStatus.textContent = '请填写至少一项图片设置';
        modelStatus.className = 'model-status error';
        return;
    }
    imgSaveBtn.disabled = true;
    imgSaveBtn.textContent = '保存中...';
    try {
        await window.api.saveImageConfig({
            provider,
            baseUrl: imgB,
            apiKey: imgK,
            model: imgM,
            savePath: imgSavePath.value.trim(),
            videoT2vModel: videoT2vModel.value.trim(),
            videoI2vModel: videoI2vModel.value.trim(),
            videoBaseUrl: videoBaseUrl.value.trim(),
            videoApiKey: videoApiKey.value.trim(),
        });
        modelStatus.textContent = '图片设置已保存';
        modelStatus.className = 'model-status success';
        setTimeout(() => { if (modelStatus.textContent === '图片设置已保存') modelStatus.textContent = ''; }, 2000);
    } catch (err) {
        modelStatus.textContent = '保存失败：' + err.message;
        modelStatus.className = 'model-status error';
    } finally {
        imgSaveBtn.disabled = false;
        imgSaveBtn.textContent = '保存图片设置';
    }
});

/* ==================== AI 聊天模块 ==================== */
// 聊天数据：{ id, title, messages:[{role,content,ts}], createdAt, updatedAt }
let aiChats = [];
let currentChatId = null;
let chatSending = false;
// 聊天归档/垃圾桶：独立 JSON 持久化（与便签归档/垃圾桶一致），备份时一并打包
let archivedChats = [];
let trashedChats = [];
let chatArchiveSearchKeyword = '';   // 聊天归档搜索关键字
let chatTrashSearchKeyword = '';     // 聊天垃圾桶搜索关键字

const CHATS_STORAGE_KEY = 'aiChats';
const MAX_CHAT_TITLE = 18;

function loadChats() {
    try {
        const raw = localStorage.getItem(CHATS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        // 修复：原实现无 Array.isArray 校验，若 localStorage 数据被外部写入为
        // "null"/"{}"/"5" 等合法 JSON 但非数组，后续 aiChats.length 等会抛 TypeError
        aiChats = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('加载聊天记录失败:', e);
        aiChats = [];
    }
}

// 加载聊天归档/垃圾桶数据（独立 JSON 文件，与便签归档/垃圾桶同构）
async function loadArchivedAndTrashedChats() {
    archivedChats = await window.api.loadArchivedChats();
    if (!Array.isArray(archivedChats)) archivedChats = [];
    trashedChats = await window.api.loadTrashedChats();
    if (!Array.isArray(trashedChats)) trashedChats = [];
}

function saveChats() {
    try {
        localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(aiChats));
    } catch (e) {
        console.error('保存聊天记录失败:', e);
        // localStorage 配额超限（QuotaExceededError）时提醒用户清理，避免静默丢数据
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
            alert('聊天记录存储空间已满，无法保存新消息。\n建议清理归档/回收站中的旧聊天，或删除部分含大量图片的对话后重试。');
        }
    }
}

// formatChatTime 已抽取至 renderer/utils.js（见文件顶部引用）

function getCurrentChat() {
    return aiChats.find(c => c.id === currentChatId) || null;
}

function genChatTitle(text) {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    return t.length > MAX_CHAT_TITLE ? t.slice(0, MAX_CHAT_TITLE) + '…' : (t || '新对话');
}

function renderChatList() {
    chatList.innerHTML = '';
    if (aiChats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.style.padding = '20px 10px';
        empty.style.fontSize = '11px';
        empty.textContent = '暂无会话';
        chatList.appendChild(empty);
        return;
    }
    const sorted = [...aiChats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const frag = document.createDocumentFragment();
    sorted.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        item.dataset.id = chat.id;
        item.textContent = chat.title || '新对话';
        // 归档按钮（删除按钮左边，悬停显示，与便签列表卡片归档按钮一致）
        const archive = document.createElement('button');
        archive.className = 'chat-item-archive';
        archive.textContent = '📦';
        archive.title = '归档会话';
        archive.addEventListener('click', (e) => {
            e.stopPropagation();
            archiveChat(chat.id);
        });
        item.appendChild(archive);
        const del = document.createElement('button');
        del.className = 'chat-item-del';
        del.textContent = '✕';
        del.title = '删除会话';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });
        item.appendChild(del);
        item.addEventListener('click', () => switchChat(chat.id));
        frag.appendChild(item);
    });
    chatList.appendChild(frag);
}

// 解析消息附件图片的显示 src：
// 优先 dataUrl（旧版兼容，已迁移后会删除）；否则用 chatimg 协议从本地磁盘按需加载
function resolveImageSrc(img) {
    if (img.dataUrl) return img.dataUrl;
    if (img.path) return 'chatimg://chat-images/' + encodeURIComponent(img.path);
    return '';
}

// 创建单条消息 DOM 节点（从 renderMessages 抽取，供全量渲染与增量追加复用）
function createMessageDom(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (msg.role === 'user' ? 'user' : 'assistant');
    // 思考过程折叠区（仅 assistant 且有 reasoning）
    if (msg.role === 'assistant' && msg.reasoning) {
        const thinking = document.createElement('div');
        thinking.className = 'chat-thinking';
        const header = document.createElement('div');
        header.className = 'chat-thinking-header';
        header.innerHTML = '<span class="chat-thinking-arrow">▶</span><span>💭 思考过程</span>';
        const body = document.createElement('div');
        body.className = 'chat-thinking-body';
        body.textContent = msg.reasoning;
        header.addEventListener('click', () => thinking.classList.toggle('expanded'));
        thinking.appendChild(header);
        thinking.appendChild(body);
        wrap.appendChild(thinking);
    }
    // 用户消息的附件图片预览
    if (msg.role === 'user' && Array.isArray(msg.images) && msg.images.length > 0) {
        const imgWrap = document.createElement('div');
        imgWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;max-width:82%';
        msg.images.forEach(img => {
            const src = resolveImageSrc(img);
            if (!src) return;
            const im = document.createElement('img');
            im.src = src;
            im.style.cssText = 'max-width:120px;max-height:120px;border-radius:6px;object-fit:cover;cursor:pointer;border:1px solid var(--border)';
            im.title = '点击放大';
            im.addEventListener('click', () => {
                const w = window.open();
                if (!w) return;
                // 用 DOM API 创建元素而非字符串拼接，避免 src 含特殊字符时被解析为代码（XSS）
                const imgEl = w.document.createElement('img');
                imgEl.src = src;
                imgEl.style.cssText = 'max-width:100%;max-height:100%';
                w.document.body.style.margin = '0';
                w.document.body.appendChild(imgEl);
            });
            imgWrap.appendChild(im);
        });
        wrap.appendChild(imgWrap);
    }
    // 消息气泡
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    if (msg.error) bubble.classList.add('error');
    bubble.textContent = msg.content;
    // AI 回复气泡内追加统计信息（模型/耗时/Token + 一键复制按钮），位于气泡左下角
    if (msg.role === 'assistant' && !msg.error && msg.stats && msg.stats.model) {
        bubble.appendChild(buildStatsDom(msg.stats, msg.content));
    }
    wrap.appendChild(bubble);
    // meta 信息（仅显示时间，不显示模型名/token/耗时）
    if (msg.ts) {
        const meta = document.createElement('div');
        meta.className = 'chat-msg-meta';
        meta.textContent = formatChatTime(msg.ts);
        wrap.appendChild(meta);
    }
    return wrap;
}

/**
 * 构建 AI 调用统计信息 DOM（模型 | 耗时 | Token | 复制按钮）
 * 位于气泡内部左下角，极小字号、淡色
 * Token 数字后面紧跟一个"复制"按钮，点击一键复制当前 AI 回复的原始内容
 * @param {{model:string, elapsedSec:string|number, tokens:number}} stats
 * @param {string} contentForCopy - 用于复制的原始 AI 回复内容
 * @returns {HTMLDivElement}
 */
function buildStatsDom(stats, contentForCopy) {
    const el = document.createElement('div');
    el.className = 'chat-msg-stats';
    const tokenStr = (stats.tokens && stats.tokens > 0) ? stats.tokens : '—';
    const elapsed = stats.elapsedSec !== undefined ? stats.elapsedSec : '—';
    // 用 textContent 避免 XSS，模型名可能含特殊字符
    el.textContent = '当前模型: ' + (stats.model || '—') + ' | 耗时: ' + elapsed + 's | 消耗Token: ' + tokenStr;
    // 追加一键复制按钮（紧跟在 Token 数字后面）
    const copyBtn = document.createElement('button');
    copyBtn.className = 'chat-copy-btn';
    copyBtn.title = '复制当前 AI 回复';
    copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;pointer-events:none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="chat-copy-text">复制</span>';
    copyBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const text = (contentForCopy !== undefined && contentForCopy !== null) ? String(contentForCopy) : '';
        if (!text) return;
        try {
            const ok = await window.api.copyTextToClipboard(text);
            // 反馈：短暂显示"已复制"
            const textEl = copyBtn.querySelector('.chat-copy-text');
            const origText = textEl ? textEl.textContent : '';
            if (textEl) textEl.textContent = '已复制';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                if (textEl) textEl.textContent = origText || '复制';
                copyBtn.classList.remove('copied');
            }, 1200);
        } catch (e) { console.warn('复制聊天内容失败:', e.message); }
    });
    el.appendChild(copyBtn);
    return el;
}

// 全量渲染消息列表（仅在切换/删除/新建会话等场景使用，发送与流式回复走增量）
function renderMessages() {
    const chat = getCurrentChat();
    chatMessages.innerHTML = '';
    if (!chat || chat.messages.length === 0) {
        chatTitle.textContent = chat ? (chat.title || '新对话') : '新对话';
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.innerHTML = '<div class="chat-empty-icon">💬</div>开始一段新对话吧';
        chatMessages.appendChild(empty);
        return;
    }
    chatTitle.textContent = chat.title || '新对话';
    const frag = document.createDocumentFragment();
    chat.messages.forEach(msg => frag.appendChild(createMessageDom(msg)));
    chatMessages.appendChild(frag);
    // 立即滚动到底部
    scrollToBottomOfChat();
    // 异步兜底：图片加载后会改变 scrollHeight，需要在加载完成后再滚一次
    const imgs = chatMessages.querySelectorAll('img');
    if (imgs.length > 0) {
        imgs.forEach(im => {
            if (!im.complete) {
                im.addEventListener('load', scrollToBottomOfChat, { once: true });
                im.addEventListener('error', scrollToBottomOfChat, { once: true });
            }
        });
    }
    // 双 RAF 兜底：确保 DOM 完全布局后再滚一次
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottomOfChat));
}

/**
 * 滚动聊天消息容器到底部（最新消息位置）
 * 用于打开聊天详情页时默认显示在最后一条消息
 */
function scrollToBottomOfChat() {
    if (!chatMessages) return;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 增量追加单条消息：清除空状态占位后追加一条消息 DOM，滚动到底部
// 用于发送用户消息时，避免全量重建整个聊天历史造成的卡顿
function appendMessageDom(msg) {
    const empty = chatMessages.querySelector('.chat-empty');
    if (empty) empty.remove();
    chatMessages.appendChild(createMessageDom(msg));
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 流式回复结束：把流式占位气泡就地转成正式消息，而非全量重建
// 移除光标、写入最终内容、补充时间 meta；错误时把气泡标红
// 同时处理思考区：写入最终 reasoning，若无 reasoning 则移除空思考区（避免残留"正在思考..."占位）
// 新增：在气泡内左下角追加统计信息（模型/耗时/Token），仅非错误且有数据时显示
function finalizeStreamDom(streamWrap, streamBubble, finalContent, isError, finalReasoning, stats) {
    if (!streamWrap || !streamBubble) return;
    if (isError) streamBubble.classList.add('error');
    streamBubble.textContent = finalContent;
    // 非错误且有统计数据时，在气泡内追加统计信息（含一键复制按钮）
    if (!isError && stats && stats.model) {
        streamBubble.appendChild(buildStatsDom(stats, finalContent));
    }
    // 处理思考区：错误或无 reasoning 时移除；否则写入最终 reasoning 兜底
    const thinking = streamWrap.querySelector('.chat-thinking');
    if (thinking) {
        if (isError || !finalReasoning) {
            thinking.remove();
        } else {
            const body = thinking.querySelector('.chat-thinking-body');
            if (body) body.textContent = finalReasoning;
        }
    }
    // 补充时间 meta（流式占位阶段没有）
    if (!streamWrap.querySelector('.chat-msg-meta')) {
        const meta = document.createElement('div');
        meta.className = 'chat-msg-meta';
        meta.textContent = formatChatTime(Date.now());
        streamWrap.appendChild(meta);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function newChat() {
    const chat = {
        id: Date.now(),
        title: '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    aiChats.push(chat);
    currentChatId = chat.id;
    saveChats();
    renderChatList();
    renderMessages();
    if (chatInput) chatInput.focus();
}

function switchChat(id) {
    if (id === currentChatId) return;
    currentChatId = id;
    renderChatList();
    renderMessages();
}

function deleteChat(id) {
    const idx = aiChats.findIndex(c => c.id === id);
    if (idx < 0) return;
    // 移到垃圾桶而非直接删除，便于事后找回（与便签删除逻辑一致）
    const deleted = aiChats[idx];
    deleted.trashedAt = Date.now();
    trashedChats.push(deleted);
    aiChats.splice(idx, 1);
    if (currentChatId === id) {
        if (aiChats.length > 0) {
            currentChatId = aiChats[aiChats.length - 1].id;
        } else {
            // 没有会话了，自动新建一个空会话
            const chat = { id: Date.now(), title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
            aiChats.push(chat);
            currentChatId = chat.id;
        }
    }
    saveChats();
    window.api.saveTrashedChats(trashedChats);
    renderChatList();
    renderMessages();
}

// 归档会话：从 aiChats 移到 archivedChats（与便签归档逻辑一致）
function archiveChat(id) {
    const idx = aiChats.findIndex(c => c.id === id);
    if (idx < 0) return;
    const archived = aiChats[idx];
    archived.archivedAt = Date.now();
    archivedChats.push(archived);
    aiChats.splice(idx, 1);
    if (currentChatId === id) {
        if (aiChats.length > 0) {
            currentChatId = aiChats[aiChats.length - 1].id;
        } else {
            const chat = { id: Date.now(), title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
            aiChats.push(chat);
            currentChatId = chat.id;
        }
    }
    saveChats();
    window.api.saveArchivedChats(archivedChats);
    renderChatList();
    renderMessages();
}

// 永久删除会话时清理其引用的本地图片文件，避免磁盘堆积孤儿文件
function cleanupChatImages(chat) {
    if (!chat || !Array.isArray(chat.messages)) return;
    chat.messages.forEach(m => {
        if (m.role === 'user' && Array.isArray(m.images)) {
            m.images.forEach(img => {
                if (img && img.path) {
                    try { window.api.deleteChatImage(img.path); } catch (e) { console.warn('删除聊天图片失败:', e.message); }
                }
            });
        }
    });
}

// 一次性迁移：把旧版 localStorage 里的 dataUrl 图片落盘到 userData/chat-images，
// 前端只保留 path，从根本上解决 base64 撑爆 localStorage 导致卡顿/崩溃的隐患。
// 使用 localStorage 标志位避免重复迁移；部分失败时不置位，下次启动自动续迁。
async function migrateChatImagesToDisk() {
    if (localStorage.getItem('chatImagesMigratedV3') === '1') return;
    // 修复：防御性校验，aiChats 非数组时直接返回，避免 for...of 抛 TypeError
    if (!Array.isArray(aiChats)) return;
    let migrated = 0;
    let failed = 0;
    for (const chat of aiChats) {
        if (!chat || !Array.isArray(chat.messages)) continue;
        for (const m of chat.messages) {
            if (m.role !== 'user' || !Array.isArray(m.images)) continue;
            for (const img of m.images) {
                // 仅迁移有 dataUrl 且尚未落盘的图片；已带 path 的跳过
                if (img && img.dataUrl && !img.path) {
                    try {
                        const fileName = await window.api.saveChatImage(img.dataUrl);
                        if (fileName) {
                            img.path = fileName;
                            delete img.dataUrl;  // 释放 base64 占用的空间
                            migrated++;
                        } else {
                            failed++;
                        }
                    } catch (e) {
                        failed++;
                        // 落盘失败保留 dataUrl，下次启动再试
                        console.warn('迁移聊天图片失败:', e.message);
                    }
                }
            }
        }
    }
    if (migrated > 0) {
        saveChats();  // 落盘成功后立即回写 localStorage（此时体积已大幅缩小）
        console.log('已迁移 ' + migrated + ' 张聊天图片到本地磁盘');
    }
    // 仅当全部迁移成功（failed === 0）时置位，否则下次启动继续迁移剩余图片
    if (failed === 0) {
        localStorage.setItem('chatImagesMigratedV3', '1');
    }
}

// 思考模式开关状态
let chatThinkingEnabled = false;
// 当前待发送的附件列表：[{name, path, isImage}]（图片落盘后只存 path，不持有 base64）
let chatAttachmentsList = [];

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('读取文件失败'));
        r.readAsDataURL(file);
    });
}

async function addChatAttachments(files) {
    if (!files || files.length === 0) return;
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            alert('文件 "' + file.name + '" 超过 10MB 限制，已跳过');
            continue;
        }
        try {
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                // 图片：读为 dataUrl 交给主进程落盘，前端只保留文件名，避免 base64 塞爆 localStorage
                const dataUrl = await readFileAsDataURL(file);
                const fileName = await window.api.saveChatImage(dataUrl);
                chatAttachmentsList.push({ name: file.name, path: fileName, isImage: true });
            } else {
                // 非图片附件：仅记录文件名作为消息元数据，不存内容
                chatAttachmentsList.push({ name: file.name, isImage: false });
            }
        } catch (e) {
            alert('读取文件 "' + file.name + '" 失败：' + e.message);
        }
    }
    renderAttachments();
}

function renderAttachments() {
    chatAttachments.innerHTML = '';
    if (chatAttachmentsList.length === 0) {
        chatAttachments.classList.remove('has-files');
        return;
    }
    chatAttachments.classList.add('has-files');
    chatAttachmentsList.forEach((att, idx) => {
        const item = document.createElement('div');
        item.className = 'chat-attach-item';
        if (att.isImage) {
            const thumb = document.createElement('img');
            thumb.className = 'chat-attach-thumb';
            // 通过 chatimg 协议从本地磁盘加载缩略图，无需持有 base64
            thumb.src = att.path ? ('chatimg://chat-images/' + encodeURIComponent(att.path)) : '';
            item.appendChild(thumb);
        } else {
            const icon = document.createElement('span');
            icon.textContent = '📄';
            icon.style.fontSize = '14px';
            item.appendChild(icon);
        }
        const name = document.createElement('span');
        name.className = 'chat-attach-name';
        name.textContent = att.name;
        name.title = att.name;
        item.appendChild(name);
        const del = document.createElement('button');
        del.className = 'chat-attach-del';
        del.textContent = '✕';
        del.title = '移除';
        del.addEventListener('click', () => {
            chatAttachmentsList.splice(idx, 1);
            renderAttachments();
        });
        item.appendChild(del);
        chatAttachments.appendChild(item);
    });
}

async function sendChat() {
    if (chatSending) return;
    const text = chatInput.value.trim();
    if (!text && chatAttachmentsList.length === 0) return;
    let chat = getCurrentChat();
    if (!chat) {
        newChat();
        chat = getCurrentChat();
        if (!chat) return;
    }
    // 追加用户消息（含图片附件）：图片只保存磁盘文件名 path，不持有 base64
    const userMsg = {
        role: 'user',
        content: text || '(请分析以下附件)',
        ts: Date.now(),
        images: chatAttachmentsList.filter(a => a.isImage).map(a => ({ path: a.path, name: a.name })),
        files: chatAttachmentsList.filter(a => !a.isImage).map(a => a.name)
    };
    chat.messages.push(userMsg);
    // 首条消息自动生成标题
    if (chat.messages.length === 1 || chat.title === '新对话') {
        chat.title = genChatTitle(text || (chatAttachmentsList[0] && chatAttachmentsList[0].name) || '附件对话');
    }
    chat.updatedAt = Date.now();
    saveChats();
    // 清空输入
    chatInput.value = '';
    chatAttachmentsList = [];
    renderAttachments();
    renderChatList();
    // 增量渲染：只追加用户消息 DOM，不全量重建聊天历史
    appendMessageDom(userMsg);

    // 流式获取 AI 回复（extracted 到 streamAssistantReply，供 sendChat 与重新生成复用）
    await streamAssistantReply(chat);
}

/**
 * 流式获取 AI 回复并增量渲染。
 * 共享逻辑：创建流式占位气泡 → 监听 chunk → 调用 api.chat → 就地转正。
 * sendChat 追加用户消息后调用；regenerateLastReply 删除旧回复后调用。
 * @param {Object} chat - 当前会话对象（messages 已就绪，不含待生成的 assistant 回复）
 */
function createStreamPlaceholder(chatThinkingEnabled) {
    const streamWrap = document.createElement('div');
    streamWrap.className = 'chat-msg assistant';
    let thinkingEl = null, thinkingBodyEl = null;
    if (chatThinkingEnabled) {
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'chat-thinking expanded';
        const header = document.createElement('div');
        header.className = 'chat-thinking-header';
        header.innerHTML = '<span class="chat-thinking-arrow">▶</span><span>💭 思考过程</span>';
        header.addEventListener('click', () => thinkingEl.classList.toggle('expanded'));
        thinkingBodyEl = document.createElement('div');
        thinkingBodyEl.className = 'chat-thinking-body';
        thinkingBodyEl.textContent = '正在思考...';
        thinkingEl.appendChild(header);
        thinkingEl.appendChild(thinkingBodyEl);
        streamWrap.appendChild(thinkingEl);
    }
    const streamBubble = document.createElement('div');
    streamBubble.className = 'chat-msg-bubble';
    streamBubble.textContent = '正在回复......';
    streamWrap.appendChild(streamBubble);
    chatMessages.appendChild(streamWrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return { streamWrap, streamBubble, thinkingEl, thinkingBodyEl };
}

function buildChatSendMessages(chat) {
    return chat.messages.map(m => {
        const out = { role: m.role, content: m.content };
        if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
            out.images = m.images.map(i => {
                if (i.path) return { path: i.path };
                if (i.dataUrl) return { dataUrl: i.dataUrl };
                return null;
            }).filter(Boolean);
        }
        return out;
    });
}

async function streamAssistantReply(chat) {
    chatSending = true;
    const streamChatId = chat.id;
    chatRegenBtn.disabled = true;
    chatInput.disabled = true;
    setSendButtonState(true);

    const { streamWrap, streamBubble, thinkingEl, thinkingBodyEl } = createStreamPlaceholder(chatThinkingEnabled);

    let streamedContent = '';
    let streamedReasoning = '';
    let firstContentReceived = false;

    // 智能滚动 & rAF 渲染调度控制
    let contentDirty = false;
    let reasoningDirty = false;
    let streamRafId = null;

    const isScrolledNearBottom = (el, threshold = 40) => {
        if (!el) return true;
        return (el.scrollHeight - el.scrollTop - el.clientHeight) <= threshold;
    };

    const flushStreamUI = () => {
        streamRafId = null;
        const userNearBottom = isScrolledNearBottom(chatMessages);
        if (reasoningDirty && thinkingBodyEl) {
            thinkingBodyEl.textContent = streamedReasoning;
            reasoningDirty = false;
        }
        if (contentDirty && streamBubble) {
            streamBubble.textContent = streamedContent + '▌';
            contentDirty = false;
        }
        if (userNearBottom && chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };

    const scheduleStreamUI = () => {
        if (!streamRafId) {
            streamRafId = requestAnimationFrame(flushStreamUI);
        }
    };

    const removeChunkListener = window.api.onChatChunk((chunk) => {
        if (chunk.type === 'reasoning' && thinkingBodyEl) {
            if (!streamedReasoning && chunk.text) {
                thinkingBodyEl.textContent = '';
            }
            streamedReasoning += chunk.text;
            reasoningDirty = true;
            scheduleStreamUI();
        } else if (chunk.type === 'content') {
            if (!firstContentReceived) {
                firstContentReceived = true;
                streamBubble.textContent = '';
                if (thinkingEl) thinkingEl.classList.remove('expanded');
            }
            streamedContent += chunk.text;
            contentDirty = true;
            scheduleStreamUI();
        }
    });

    try {
        const sendMessages = buildChatSendMessages(chat);
        const result = await window.api.chat({ messages: sendMessages, thinking: chatThinkingEnabled });
        const finalContent = result.content || streamedContent || (result.aborted ? '（已中断）' : '（空回复）');
        const finalReasoning = result.reasoning || streamedReasoning || '';
        const stats = (result && result.model) ? {
            model: result.model,
            elapsedSec: ((result.elapsedMs || 0) / 1000).toFixed(1),
            tokens: (result.usage && result.usage.total) || 0
        } : null;
        const assistantMsg = {
            role: 'assistant',
            content: finalContent,
            reasoning: finalReasoning,
            ts: Date.now(),
            aborted: !!result.aborted,
            stats: stats
        };
        if (!aiChats.find(c => c.id === streamChatId)) {
            throw new Error('会话已不存在，回复已丢弃');
        }
        chat.messages.push(assistantMsg);
        chat.updatedAt = Date.now();
        saveChats();
        if (currentChatId === streamChatId) {
            finalizeStreamDom(streamWrap, streamBubble, finalContent, false, finalReasoning, stats);
        } else {
            if (streamWrap.parentNode) streamWrap.parentNode.removeChild(streamWrap);
        }
    } catch (err) {
        const stillExists = aiChats.find(c => c.id === streamChatId);
        if (stillExists) {
            const errMsg = { role: 'assistant', content: '请求失败：' + err.message, ts: Date.now(), error: true };
            chat.messages.push(errMsg);
            chat.updatedAt = Date.now();
            saveChats();
            if (currentChatId === streamChatId) {
                finalizeStreamDom(streamWrap, streamBubble, '请求失败：' + err.message, true, '', null);
            } else if (streamWrap.parentNode) {
                streamWrap.parentNode.removeChild(streamWrap);
            }
        } else if (streamWrap.parentNode) {
            streamWrap.parentNode.removeChild(streamWrap);
        }
    } finally {
        removeChunkListener();
        if (streamRafId) {
            cancelAnimationFrame(streamRafId);
            streamRafId = null;
        }
        chatSending = false;
        setSendButtonState(false);
        chatRegenBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

/**
 * 一键重新生成最后一条 AI 回复。
 * 找到最后一条用户消息，删除其后的 assistant 回复，重新请求 AI。
 * 新回复覆盖原有回复（先删除旧回复 DOM 与数据，再流式生成新回复）。
 */
async function regenerateLastReply() {
    if (chatSending) return;
    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) return;
    // 从末尾往前找最后一个 assistant 消息
    let lastAssistantIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx < 0) return;  // 没有可重新生成的 AI 回复
    // 删除旧的 AI 回复（覆盖原有回复）
    chat.messages.splice(lastAssistantIdx);
    chat.updatedAt = Date.now();
    saveChats();
    // 全量重新渲染（因为删除了消息，增量不适用）
    renderMessages();
    // 流式生成新回复
    await streamAssistantReply(chat);
}

// 聊天模块事件绑定
chatNewBtn.addEventListener('click', () => newChat());

chatDelBtn.addEventListener('click', () => {
    const chat = getCurrentChat();
    if (!chat) return;
    if (chat.messages.length > 0 && !confirm('确定删除当前会话？（移入垃圾桶，可事后还原）')) return;
    deleteChat(chat.id);
});

chatSendBtn.addEventListener('click', () => {
    // 暂停模式：点击中断当前 AI 回答
    if (chatSending) {
        try { window.api.abortChat(); } catch (e) { console.warn('中断 AI 回答失败:', e.message); }
        return;
    }
    sendChat();
});

/**
 * 切换发送按钮的状态：正常（发送）/ 暂停模式
 * @param {boolean} isStreaming - true=AI正在回答，显示暂停按钮；false=恢复发送按钮
 */
function setSendButtonState(isStreaming) {
    if (isStreaming) {
        chatSendBtn.classList.add('streaming');
        chatSendBtn.title = '暂停 AI 回答';
        chatSendBtn.textContent = '⏸';
        chatSendBtn.disabled = false;  // 保持可点击以触发中断
    } else {
        chatSendBtn.classList.remove('streaming');
        chatSendBtn.title = '发送';
        chatSendBtn.textContent = '➤';
        chatSendBtn.disabled = false;
    }
}

// 重新生成按钮：一键覆盖最后一条 AI 回复
chatRegenBtn.addEventListener('click', () => regenerateLastReply());

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

// chatInput 高度由 CSS .chat-input { height: 64px; resize: none; } 固定，无需 JS 监听

// 思考模式开关
chatThinkingBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chatThinkingEnabled = !chatThinkingEnabled;
    chatThinkingBtn.classList.toggle('active', chatThinkingEnabled);
    chatThinkingBtn.title = chatThinkingEnabled ? '已开启思考模式（点击关闭）' : '开启/关闭 AI 思考模式';
});
// mousedown 也触发一次，防止 click 被吞
chatThinkingBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });

// 文件上传：通过隐藏 input[type=file] 触发文件选择
chatUploadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (chatFileInput) {
        // 重置 value 以便重复选择同一文件
        chatFileInput.value = '';
        chatFileInput.click();
    }
});
chatUploadBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
chatFileInput.addEventListener('change', async () => {
    if (chatFileInput.files && chatFileInput.files.length > 0) {
        await addChatAttachments(Array.from(chatFileInput.files));
        chatFileInput.value = '';  // 重置以便重复选择同一文件
    }
});

// 初始化聊天模块
async function initChatModule() {
    loadChats();
    // 加载归档/垃圾桶数据（await 确保打开文件夹时数据已就绪，防空列表；catch 防错误传播）
    try { await loadArchivedAndTrashedChats(); } catch (e) { console.error('加载归档/垃圾桶聊天失败:', e.message); }
    if (aiChats.length === 0) {
        newChat();
    } else {
        currentChatId = aiChats[aiChats.length - 1].id;
        renderChatList();
        renderMessages();
    }
}

/* ==================== 创作页 ==================== */
createUploadBtn.addEventListener('click', () => createFileInput.click());

// 上传本地图片：显示在提示词输入框右侧的预览区，不占用生成图区域
createFileInput.addEventListener('change', function() {
    const f = this.files[0];
    if (!f) return;
    uploadFilename.textContent = f.name;
    uploadPreview.style.display = 'flex';
    const r = new FileReader();
    r.onload = (e) => {
        uploadPreviewImg.src = e.target.result;
    };
    r.readAsDataURL(f);
});

// 移除参考图：只清除右侧预览，不影响生成图区域
uploadClose.addEventListener('click', () => {
    uploadPreviewImg.src = '';
    uploadPreview.style.display = 'none';
    uploadFilename.textContent = '';
    createFileInput.value = '';
});

// 点击图片复制到剪贴板
createImage.addEventListener('click', async () => {
    await copyImageToClipboard();
});

// 复制图片按钮
createCopyBtn.addEventListener('click', async () => {
    await copyImageToClipboard();
});

async function copyImageToClipboard() {
    if (!createImage.src || createImage.style.display === 'none') return;
    try {
        // 改用主进程剪贴板 IPC（与便签导出图片复用同一通道），
        // 避免渲染进程 fetch(dataUrl) 被 CSP 的 connect-src 拦截导致复制失败
        const ok = await window.api.copyImageToClipboard(createImage.src);
        if (ok) {
            createCopyBtn.textContent = '✓ 已复制!';
        } else {
            createCopyBtn.textContent = '复制失败';
        }
        setTimeout(() => { createCopyBtn.innerHTML = ICONS.copy + '复制图片'; }, 1500);
    } catch (err) {
        createCopyBtn.textContent = '复制失败';
        setTimeout(() => { createCopyBtn.innerHTML = ICONS.copy + '复制图片'; }, 1500);
    }
}

// 尺寸自动保存（防抖）
let sizeSaveTimer = null;
createSize.addEventListener('input', () => {
    if (sizeSaveTimer) clearTimeout(sizeSaveTimer);
    sizeSaveTimer = setTimeout(async () => {
        const sz = createSize.value.trim();
        try { await window.api.saveCustomSize(sz); } catch (e) { console.error('保存自定义尺寸失败:', e.message); }
    }, 600);
});

createSize.addEventListener('change', () => {
    const sz = createSize.value.trim();
    try { window.api.saveCustomSize(sz); } catch (e) { console.error('保存自定义尺寸失败:', e.message); }
});

/* ==================== 创作：图片/视频模式切换 ==================== */
function setCreateMode(mode) {
    createMode = mode;
    if (mode === 'video') {
        createModeImageBtn.classList.remove('active');
        createModeVideoBtn.classList.add('active');
        createPrompt.placeholder = '输入视频描述提示词 (Prompt)...';
        createPlaceholder.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>生成的视频将显示在这里';
        // 视频模式：显示视频输入框，隐藏图片尺寸
        createVideoDuration.style.display = '';
        createVideoRatio.style.display = '';
        createSize.style.display = 'none';
        // 同步模型选择下拉框
        if (createModelSelect.value === 'image') {
            createModelSelect.value = 't2v';
        }
    } else {
        createModeVideoBtn.classList.remove('active');
        createModeImageBtn.classList.add('active');
        createPrompt.placeholder = '输入图片描述提示词 (Prompt)...';
        createPlaceholder.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>生成的图片将显示在这里';
        // 图片模式：隐藏视频输入框，显示图片尺寸
        createVideoDuration.style.display = 'none';
        createVideoRatio.style.display = 'none';
        createSize.style.display = '';
        // 同步模型选择下拉框
        if (createModelSelect.value === 't2v' || createModelSelect.value === 'i2v') {
            createModelSelect.value = 'image';
        }
    }
    // 重置显示区
    createImage.style.display = 'none';
    createVideo.style.display = 'none';
    createPlaceholder.style.display = 'block';
    createCopyBtn.style.display = 'none';
}

createModeImageBtn.addEventListener('click', () => setCreateMode('image'));
createModeVideoBtn.addEventListener('click', () => setCreateMode('video'));

// 模型选择下拉框联动：选择图片模型→图片模式，选择视频模型→视频模式
createModelSelect.addEventListener('change', () => {
    const val = createModelSelect.value;
    if (val === 'image') {
        if (createMode !== 'image') setCreateMode('image');
    } else {
        // t2v 或 i2v
        if (createMode !== 'video') setCreateMode('video');
    }
});

// 从 AI 设置加载模型名到下拉框选项文本
function updateModelSelectLabels(imgCfg) {
    const imageModelName = imgCfg.model || '未配置';
    const t2vModelName = imgCfg.videoT2vModel || '未配置';
    const i2vModelName = imgCfg.videoI2vModel || '未配置';
    createModelSelect.options[0].text = '生成图片模型（' + imageModelName + '）';
    createModelSelect.options[1].text = '文字生成视频（' + t2vModelName + '）';
    createModelSelect.options[2].text = '图片生成视频（' + i2vModelName + '）';
}

createGenBtn.addEventListener('click', async () => {
    const p = createPrompt.value.trim();
    if (!p) {
        createPlaceholder.textContent = '请先输入提示词';
        createPlaceholder.style.display = 'block';
        createImage.style.display = 'none';
        createVideo.style.display = 'none';
        return;
    }
    createGenBtn.disabled = true;
    createGenBtn.textContent = '生成中...';
    createPlaceholder.textContent = createMode === 'video' ? '🎬 视频生成中，预计需要 1-5 分钟，请耐心等待...' : '🔄 生成中...';
    createPlaceholder.style.display = 'block';
    createImage.style.display = 'none';
    createVideo.style.display = 'none';
    createCopyBtn.style.display = 'none';
    try {
        const imgData = (uploadPreview.style.display !== 'none' && uploadPreviewImg.src && uploadPreviewImg.src.indexOf('data:') === 0) ? uploadPreviewImg.src : null;
        if (createMode === 'video') {
            // 视频生成模式
            const duration = parseInt(createVideoDuration.value, 10) || 5;
            const ratio = createVideoRatio.value.trim() || '16:9';
            // 根据下拉框选择决定使用哪个模型
            const modelType = createModelSelect.value;
            const r = await window.api.generateVideo({
                prompt: p,
                imageData: imgData,
                duration: duration,
                ratio: ratio,
                modelType: modelType  // 't2v' 或 'i2v'，main.js 会根据此值选择对应模型
            });
            // r 是本地视频文件路径，用 file:// 协议加载
            // 校验返回值：必须是字符串且为绝对路径（Windows 盘符或 UNC/Unix /），避免异常返回被拼进 file://
            if (typeof r !== 'string' || !r || !/^[A-Za-z]:[\\/]|^\/|^\\\\/.test(r)) {
                throw new Error('视频生成返回的路径无效');
            }
            // 修复：UNC 路径 \\server\share 替换后为 //server/share，
            // 拼接 file:/// 得到 file://///server/share（5 斜杠）错误格式
            // 正确格式应为 file://server/share（RFC 8089）
            createVideo.src = r.startsWith('\\\\')
                ? 'file://' + r.slice(2).replace(/\\/g, '/')
                : 'file:///' + r.replace(/\\/g, '/');
            createVideo.style.display = 'block';
            createPlaceholder.style.display = 'none';
        } else {
            // 图片生成模式
            const sz = createSize.value.trim() || 'auto';
            const r = await window.api.generateImage({ prompt: p, imageData: imgData, size: sz });
            createImage.src = r;
            createImage.style.display = 'block';
            createPlaceholder.style.display = 'none';
            createCopyBtn.style.display = 'inline-flex';
        }
    } catch (err) {
        createPlaceholder.textContent = '失败: ' + err.message;
        createPlaceholder.style.display = 'block';
    } finally {
        createGenBtn.disabled = false;
        createGenBtn.innerHTML = ICONS.sparkle + '生成';
    }
});

createOptimizeBtn.addEventListener('click', async () => {
    const p = createPrompt.value.trim();
    if (!p) { createPrompt.focus(); return; }
    createOptimizeBtn.disabled = true;
    createOptimizeBtn.textContent = '优化中...';
    try {
        const r = await window.api.generateContent(
            '请优化以下图片生成提示词，使其更详细、更具表现力、更适合AI图片生成，只返回优化后的提示词不要其他内容：\n\n' + p
        );
        createPrompt.value = r || '优化失败';
        createPrompt.focus();
    } catch (err) {
        createPrompt.value = '优化失败: ' + err.message;
    } finally {
        createOptimizeBtn.disabled = false;
        createOptimizeBtn.innerHTML = ICONS.sparkle + '优化';
    }
});

/* ==================== 面板定位工具 ==================== */
function positionPanel(btn, panel) {
    const titlebarRect = document.querySelector('.titlebar').getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    panel.style.left = Math.max(0, (btnRect.left - titlebarRect.left + btnRect.width / 2 - panel.offsetWidth / 2)) + 'px';
    panel.style.top = '42px';
}

/* ==================== 软件设置弹出面板（三级菜单） ==================== */
const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');

settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPanel.classList.contains('open');
    closeAllPanels();
    if (!isOpen) {
        settingsPanel.classList.add('open');
        positionPanel(settingsBtn, settingsPanel);
    }
});

// AI 设置：打开模态框，并关闭设置面板
settingsAiBtn.addEventListener('click', async () => {
    closeAllPanels();
    aiModal.classList.add('open');
    if (modelStatus) {
        modelStatus.textContent = '';
        modelStatus.className = 'model-status';
    }
    // 复用启动时的统一加载逻辑（聊天/图片视频/语音三段配置），避免重复代码
    await loadAllAiConfigsToForm();
});

/* ==================== 闹钟音量弹出面板（仿透明度面板） ====================
 * 滑块范围 0-300%，>100% 时 GainNode 强行放大音量（最大 3 倍）
 * 拖动实时生效，松开后持久化到 settings.json
 * ============================================================ */
settingsAlarmVolumeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    alarmVolumeSlider.value = String(alarmVolume);
    alarmVolumeValue.textContent = alarmVolume + '%';
    alarmVolumePanel.classList.add('open');
    positionPanel(settingsBtn, alarmVolumePanel);
});

alarmVolumeSlider.addEventListener('input', function() {
    const val = parseInt(this.value, 10);
    alarmVolumeValue.textContent = val + '%';
    setAlarmVolume(val);
});

// 松开滑块时持久化
alarmVolumeSlider.addEventListener('change', async function() {
    await saveSettingsToDisk();
    // 拖动结束后试听一下当前铃声（短促一声）
    try {
        const ctx = ensureAudioCtx();
        if (ctx) {
            const soundFn = ALARM_SOUNDS[currentAlarmSound] || ALARM_SOUNDS.default;
            soundFn(ctx);
        }
    } catch (e) { console.warn('试听闹钟铃声失败:', e.message); }
});

/* ==================== 开机启动弹出面板（仿透明度面板风格） ====================
 * Toggle 开关，开启后开机自动启动到托盘
 * ============================================================ */
function updateStartupToggleUI() {
    if (startupToggle) startupToggle.checked = !!(startupToggleState && startupToggleState.open);
}

settingsStartupBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeAllPanels();
    // 同步一次系统状态
    try {
        const sysOpen = await window.api.getLaunchAtLogin();
        startupToggleState.open = !!sysOpen;
        updateStartupToggleUI();
    } catch (e) { console.warn('读取开机启动状态失败:', e.message); }
    startupPanel.classList.add('open');
    positionPanel(settingsBtn, startupPanel);
});

startupToggle.addEventListener('change', async function() {
    const open = this.checked;
    try {
        const result = await window.api.setLaunchAtLogin(open);
        if (result && result.success) {
            startupToggleState.open = open;
            await saveSettingsToDisk();
        } else {
            // 失败则回滚 UI
            updateStartupToggleUI();
            // 简单提示：闪烁按钮
            flashBtn(settingsStartupBtn, '#FF453A');
        }
    } catch (err) {
        updateStartupToggleUI();
    }
});

/* ==================== 软件锁功能（4 位 PIN + scrypt 哈希） ====================
 * 流程：
 * 1. 首次点击锁按钮 → 检查是否已设置 PIN
 *    - 未设置：弹出"设置 PIN"对话框，输入两次 PIN 确认
 *    - 已设置：直接锁定
 * 2. 锁定时显示全屏 overlay，必须输入正确 PIN 才能解锁
 * 3. 解锁 5 次失败强制冷却 30 秒（防暴力破解，由主进程控制）
 * ============================================================ */

/**
 * 读取一组 4 位 PIN 输入框的值
 * @param {HTMLElement} container - 包含 4 个 .lock-pin-box 的容器
 * @returns {string} 4 位 PIN 字符串（不足 4 位返回空串）
 */
function readPinInputs(container) {
    if (!container) return '';
    const boxes = container.querySelectorAll('.lock-pin-box');
    let pin = '';
    boxes.forEach(b => { pin += (b.value || ''); });
    return pin.length === 4 ? pin : '';
}

/**
 * 清空一组 PIN 输入框
 * @param {HTMLElement} container
 */
function clearPinInputs(container) {
    if (!container) return;
    container.querySelectorAll('.lock-pin-box').forEach(b => { b.value = ''; });
    const first = container.querySelector('.lock-pin-box');
    if (first) first.focus();
}

/**
 * 为一组 PIN 输入框绑定自动跳格逻辑
 * @param {HTMLElement} container
 */
function bindPinInputAutoJump(container) {
    if (!container) return;
    const boxes = container.querySelectorAll('.lock-pin-box');
    boxes.forEach((box, idx) => {
        box.addEventListener('input', () => {
            // 限制只能输入数字
            box.value = box.value.replace(/\D/g, '').slice(0, 1);
            if (box.value && idx < boxes.length - 1) {
                boxes[idx + 1].focus();
            }
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && idx > 0) {
                boxes[idx - 1].focus();
            } else if (e.key === 'Enter') {
                // 触发提交（null 检查防 closest 返回 null 时报错）
                const overlay = container.closest('.lock-overlay');
                const submitBtn = overlay ? overlay.querySelector('.lock-submit-btn') : null;
                if (submitBtn) submitBtn.click();
            }
        });
        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text') || '';
            const digits = text.replace(/\D/g, '').slice(0, 4);
            boxes.forEach((b, i) => { b.value = digits[i] || ''; });
            if (digits.length === 4) {
                const submitBtn = container.closest('.lock-overlay').querySelector('.lock-submit-btn');
                if (submitBtn) submitBtn.click();
            } else if (digits.length > 0) {
                boxes[Math.min(digits.length, boxes.length - 1)].focus();
            }
        });
    });
}

bindPinInputAutoJump(lockPinInputs);
bindPinInputAutoJump(setPinInputs);
bindPinInputAutoJump(setPinConfirmInputs);

/**
 * 显示设置 PIN 弹窗
 */
function showSetPinDialog() {
    clearPinInputs(setPinInputs);
    clearPinInputs(setPinConfirmInputs);
    setPinMessage.textContent = '';
    setPinOverlay.style.display = 'flex';
    setTimeout(() => {
        const first = setPinInputs.querySelector('.lock-pin-box');
        if (first) first.focus();
    }, 50);
}

/**
 * 关闭设置 PIN 弹窗
 */
function hideSetPinDialog() {
    setPinOverlay.style.display = 'none';
    clearPinInputs(setPinInputs);
    clearPinInputs(setPinConfirmInputs);
    setPinMessage.textContent = '';
}

/**
 * 锁定软件：显示锁屏 overlay
 */
function lockApp() {
    isLocked = true;
    clearPinInputs(lockPinInputs);
    lockMessage.textContent = '';
    lockOverlay.style.display = 'flex';
    setTimeout(() => {
        const first = lockPinInputs.querySelector('.lock-pin-box');
        if (first) first.focus();
    }, 50);
}

/**
 * 解锁软件：隐藏锁屏 overlay
 */
function unlockApp() {
    isLocked = false;
    lockOverlay.style.display = 'none';
    clearPinInputs(lockPinInputs);
}

// 锁按钮点击事件
lockBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    let hasPin = false;
    try { hasPin = await window.api.hasLockPin(); }
    catch (_) { hasPin = false; }
    if (hasPin) {
        // 已设置 PIN，直接锁定
        lockApp();
    } else {
        // 未设置 PIN，先弹出设置对话框
        showSetPinDialog();
    }
});

// 设置 PIN 确认按钮
setPinConfirmBtn.addEventListener('click', async () => {
    const pin1 = readPinInputs(setPinInputs);
    const pin2 = readPinInputs(setPinConfirmInputs);
    if (!pin1) {
        setPinMessage.textContent = '请输入 4 位数字 PIN';
        clearPinInputs(setPinInputs);
        return;
    }
    if (pin1 !== pin2) {
        setPinMessage.textContent = '两次输入不一致，请重新输入';
        clearPinInputs(setPinInputs);
        clearPinInputs(setPinConfirmInputs);
        return;
    }
    const result = await window.api.setLockPin(pin1);
    if (result && result.success) {
        hideSetPinDialog();
        // 设置成功后立即锁定
        lockApp();
    } else {
        setPinMessage.textContent = (result && result.message) || '设置失败';
    }
});

// 设置 PIN 取消按钮
setPinCancelBtn.addEventListener('click', () => {
    hideSetPinDialog();
});

// 锁屏 - 解锁按钮
lockSubmitBtn.addEventListener('click', async () => {
    const pin = readPinInputs(lockPinInputs);
    if (!pin) {
        lockMessage.textContent = '请输入 4 位 PIN';
        clearPinInputs(lockPinInputs);
        return;
    }
    const result = await window.api.verifyLockPin(pin);
    if (result && result.success) {
        unlockApp();
    } else {
        lockMessage.textContent = (result && result.message) || 'PIN 错误';
        clearPinInputs(lockPinInputs);
    }
});

// 锁屏 - 退出软件按钮
lockExitBtn.addEventListener('click', () => {
    window.api.closeWindow();
});

// 锁屏时按 ESC 不允许退出（防止误触解锁）
document.addEventListener('keydown', (e) => {
    if (isLocked && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

/* ==================== 调色板弹出面板 ==================== */
settingsPaletteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    renderPalette();
    palettePanel.classList.add('open');
    positionPanel(settingsBtn, palettePanel);
});

function renderPalette() {
    paletteGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    PALETTE.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch' + (selectedColor === c.hex ? ' active' : '');
        swatch.style.background = c.hex;
        swatch.title = c.name;
        swatch.dataset.hex = c.hex;
        if (c.dark) swatch.dataset.dark = '1';
        frag.appendChild(swatch);
    });
    paletteGrid.appendChild(frag);
}

// 事件委托：调色板点击
paletteGrid.addEventListener('click', (e) => {
    const swatch = e.target.closest('.palette-swatch');
    if (!swatch) return;
    e.stopPropagation();
    const hex = swatch.dataset.hex;
    const isDark = swatch.dataset.dark === '1';
    applyColor(hex, isDark);
});

/**
 * 应用背景色：同时切换深色/浅色主题
 * @param {string} hex - 颜色 hex
 * @param {boolean} isDark - 是否为深色主题（需反转文字颜色）
 */
function applyColor(hex, isDark) {
    selectedColor = hex;
    if (hex) {
        winEl.style.background = hex;
        winEl.classList.toggle('dark-theme', !!isDark);
        winEl.classList.remove('light-bg');
    } else {
        winEl.style.background = '';
        winEl.classList.remove('dark-theme', 'light-bg');
    }
    saveSettingsToDisk();
    renderPalette();
    closeAllPanels();
}

/* ==================== 字体大小弹出面板 ====================
 * 仅影响各 TAB 详情页正文（通过 CSS 变量 --detail-font-size），
 * 顶部工具栏/菜单栏/titlebar 不引用该变量，因此不受影响。
 * ============================================================ */
const settingsFontBtn = $('settingsFontBtn');
const fontSetPanel = $('fontSetPanel');
const fontSizeSlider = $('fontSizeSlider');
const fontSizeValue = $('fontSizeValue');
const fontSizeResetBtn = $('fontSizeResetBtn');
const DEFAULT_DETAIL_FONT_SIZE = 14;

settingsFontBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    fontSizeSlider.value = detailFontSize;
    fontSizeValue.textContent = detailFontSize + 'px';
    fontSetPanel.classList.add('open');
    positionPanel(settingsBtn, fontSetPanel);
});

// 拖动滑块实时改变字体大小
fontSizeSlider.addEventListener('input', (e) => {
    const size = parseInt(e.target.value, 10);
    fontSizeValue.textContent = size + 'px';
    applyDetailFontSize(size);
});

// 松开滑块时持久化保存
fontSizeSlider.addEventListener('change', () => {
    saveSettingsToDisk();
});

// 恢复默认
fontSizeResetBtn.addEventListener('click', () => {
    applyDetailFontSize(DEFAULT_DETAIL_FONT_SIZE);
    fontSizeSlider.value = DEFAULT_DETAIL_FONT_SIZE;
    fontSizeValue.textContent = DEFAULT_DETAIL_FONT_SIZE + 'px';
    saveSettingsToDisk();
});

/* ==================== FM 收音机设置面板（P5）====================
 * 存储在 settings.aiConfig.radioConfig（P0 已实现主进程 IPC）
 * 字段：apiBaseUrl / timeout / defaultCountry / customStations
 * 自定义电台 JSON 格式：{ version:1, stations:[{name,url,favicon,country,tags}] }
 */
const settingsFmBtn = $('settingsFmBtn');
const fmSettingsPanel = $('fmSettingsPanel');
const fmApiBaseUrl = $('fmApiBaseUrl');
const fmApiBaseUrlCustom = $('fmApiBaseUrlCustom');
const fmTimeout = $('fmTimeout');
const fmDefaultCountry = $('fmDefaultCountry');
const fmImportBtn = $('fmImportBtn');
const fmImportHint = $('fmImportHint');
const fmClearCacheBtn = $('fmClearCacheBtn');
const fmResetBtn = $('fmResetBtn');
const fmEnableProxy = $('fmEnableProxy');

// 加载 FM 配置并填充表单
async function loadFmConfigToForm() {
    try {
        const result = await window.api.radioLoadConfig();
        if (!result.success) return;
        const cfg = result.config;
        // 下拉选择：匹配预设值，否则显示自定义输入框
        const presetOptions = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info',
            'cnhk-music'];   // 新增：中文/香港音乐电台数据源
        if (presetOptions.includes(cfg.apiBaseUrl)) {
            fmApiBaseUrl.value = cfg.apiBaseUrl;
            fmApiBaseUrlCustom.style.display = 'none';
        } else {
            fmApiBaseUrl.value = 'custom';
            fmApiBaseUrlCustom.style.display = '';
            fmApiBaseUrlCustom.value = cfg.apiBaseUrl;
        }
        showFmError('');   // 清除错误提示
        fmTimeout.value = cfg.timeout || 10000;
        fmDefaultCountry.value = cfg.defaultCountry || 'China';
        if (fmEnableProxy) fmEnableProxy.checked = !!cfg.useProxy;
        // 显示自定义电台导入状态
        const count = (cfg.customStations || []).length;
        fmImportHint.textContent = count > 0 ? `已导入 ${count} 个电台` : '未导入';
    } catch (e) {
        console.warn('[FM] 加载配置失败:', e);
    }
}

// 收集表单数据并保存
// 注意：不再使用 alert() 阻塞 UI，改用内联错误提示（showFmError）
async function saveFmConfigFromForm() {
    let apiBaseUrl = fmApiBaseUrl.value;
    if (apiBaseUrl === 'custom') {
        apiBaseUrl = fmApiBaseUrlCustom.value.trim();
        // 自定义地址校验：必须非空且以 http(s):// 开头
        if (!apiBaseUrl || !/^https?:\/\//i.test(apiBaseUrl)) {
            showFmError('请输入有效的 http(s):// 地址');
            return false;   // 静默跳过保存，不阻塞 UI
        }
    }
    showFmError('');   // 清除错误提示
    const config = {
        apiBaseUrl,
        timeout: parseInt(fmTimeout.value, 10) || 10000,
        defaultCountry: fmDefaultCountry.value.trim() || 'China',
        useProxy: fmEnableProxy ? fmEnableProxy.checked : false
    };
    try {
        const result = await window.api.radioSaveConfig(config);
        return result.success;
    } catch (e) {
        console.error('[FM] 保存配置失败:', e);
        showFmError('保存失败：' + (e.message || '配置无效（可能 SSRF 校验未通过）'));
        return false;
    }
}

// 内联错误提示：在自定义输入框下方显示红框 + 文字，不阻塞 UI
function showFmError(msg) {
    let hint = document.getElementById('fmApiErrorHint');
    if (!hint) {
        hint = document.createElement('span');
        hint.id = 'fmApiErrorHint';
        hint.className = 'fm-error-hint';
        // 插入到自定义输入框之后
        if (fmApiBaseUrlCustom && fmApiBaseUrlCustom.parentNode) {
            fmApiBaseUrlCustom.parentNode.appendChild(hint);
        }
    }
    hint.textContent = msg || '';
    hint.style.display = msg ? '' : 'none';
    if (fmApiBaseUrlCustom) {
        fmApiBaseUrlCustom.classList.toggle('error', !!msg);
    }
}

if (settingsFmBtn) {
    settingsFmBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeAllPanels();
        await loadFmConfigToForm();
        fmSettingsPanel.classList.add('open');
        positionPanel(settingsBtn, fmSettingsPanel);
    });
}

// 下拉切换"自定义"时仅显示输入框，不立即保存（用户还没输入地址）
// 修复卡死 Bug：原逻辑切到 custom 后立即触发 fmScheduleSave → saveFmConfigFromForm
//   → 检测到空值 → alert() 同步阻塞 UI → 用户无法点击输入框
if (fmApiBaseUrl) {
    fmApiBaseUrl.addEventListener('change', () => {
        const isCustom = fmApiBaseUrl.value === 'custom';
        fmApiBaseUrlCustom.style.display = isCustom ? '' : 'none';
        showFmError('');   // 清除旧错误提示
        if (isCustom) return;   // 切换到 custom 时不保存，等用户输入有效地址
        fmScheduleSave();       // 选择预设镜像时正常保存
    });
}

// 超时/默认国家变更时自动保存（防抖 800ms）
let fmSaveTimer = null;
function fmScheduleSave() {
    clearTimeout(fmSaveTimer);
    fmSaveTimer = setTimeout(saveFmConfigFromForm, 800);
}
if (fmTimeout) fmTimeout.addEventListener('change', fmScheduleSave);
if (fmDefaultCountry) fmDefaultCountry.addEventListener('change', fmScheduleSave);
// 自定义地址改用 input 事件 + 防抖，仅在值非空且符合 URL 格式时触发保存
// 修复卡死 Bug：原逻辑用 change 事件，用户输入完成离开焦点后才触发；现在改为实时输入即可保存
if (fmApiBaseUrlCustom) {
    fmApiBaseUrlCustom.addEventListener('input', () => {
        const val = fmApiBaseUrlCustom.value.trim();
        if (val && /^https?:\/\//i.test(val)) {
            showFmError('');
            fmScheduleSave();
        }
    });
}
if (fmEnableProxy) fmEnableProxy.addEventListener('change', fmScheduleSave);

// 导入自定义电台 JSON 文件
if (fmImportBtn) {
    fmImportBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.stations || !Array.isArray(data.stations)) {
                    showFmError('JSON 格式无效：缺少 stations 数组');
                    return;
                }
                // 先加载当前配置，合并 customStations 后保存
                const cur = await window.api.radioLoadConfig();
                const cfg = cur.success ? cur.config : {};
                cfg.customStations = data.stations;
                const result = await window.api.radioSaveConfig(cfg);
                if (result.success) {
                    fmImportHint.textContent = `已导入 ${data.stations.length} 个电台`;
                    showFmError('');
                } else {
                    showFmError('导入失败：配置保存失败');
                }
            } catch (err) {
                showFmError('导入失败：' + err.message);
            }
        };
        input.click();
    });
}

// 清除电台缓存
if (fmClearCacheBtn) {
    fmClearCacheBtn.addEventListener('click', async () => {
        try {
            await window.api.radioClearCache();
            fmClearCacheBtn.textContent = '已清除';
            setTimeout(() => { fmClearCacheBtn.textContent = '清除缓存'; }, 1500);
            showFmError('');
        } catch (e) {
            showFmError('清除失败：' + e.message);
        }
    });
}

// 恢复默认
if (fmResetBtn) {
    fmResetBtn.addEventListener('click', async () => {
        const defaults = {
            apiBaseUrl: 'https://all.api.radio-browser.info',
            timeout: 10000,
            defaultCountry: 'China',
            useProxy: false
        };
        await window.api.radioSaveConfig(defaults);
        await loadFmConfigToForm();
    });
}

/* ==================== 关闭所有弹出面板 ==================== */
function closeAllPanels() {
    settingsPanel.classList.remove('open');
    palettePanel.classList.remove('open');
    fontSetPanel.classList.remove('open');
    if (alarmVolumePanel) alarmVolumePanel.classList.remove('open');
    if (startupPanel) startupPanel.classList.remove('open');
    if (noteHistoryPanel) noteHistoryPanel.classList.remove('open');
    if (fmSettingsPanel) fmSettingsPanel.classList.remove('open');
}

document.addEventListener('click', (e) => {
    // 点击设置按钮本身由其自身事件处理
    if (e.target !== settingsBtn && !settingsPanel.contains(e.target)) {
        settingsPanel.classList.remove('open');
    }
    if (palettePanel && !palettePanel.contains(e.target) && e.target !== settingsPaletteBtn) {
        palettePanel.classList.remove('open');
    }
    if (fontSetPanel && !fontSetPanel.contains(e.target) && e.target !== settingsFontBtn) {
        fontSetPanel.classList.remove('open');
    }
    if (fmSettingsPanel && !fmSettingsPanel.contains(e.target) && e.target !== settingsFmBtn) {
        fmSettingsPanel.classList.remove('open');
    }
    if (alarmVolumePanel && !alarmVolumePanel.contains(e.target) && e.target !== settingsAlarmVolumeBtn) {
        alarmVolumePanel.classList.remove('open');
    }
    if (startupPanel && !startupPanel.contains(e.target) && e.target !== settingsStartupBtn) {
        startupPanel.classList.remove('open');
    }
    if (noteHistoryPanel && !noteHistoryPanel.contains(e.target) && e.target !== noteHistoryBtn) {
        noteHistoryPanel.classList.remove('open');
    }
});

/* ==================== 数据同步设置（S3 / WebDAV） ==================== */
const settingsSyncBtn = $('settingsSyncBtn');
const syncModal = $('syncModal');
const syncCloseBtn = $('syncCloseBtn');
const syncStatus = $('syncStatus');
// S3 字段
const s3Endpoint = $('s3Endpoint');
const s3Region = $('s3Region');
const s3Bucket = $('s3Bucket');
const s3AccessKey = $('s3AccessKey');
const s3SecretKey = $('s3SecretKey');
const s3Path = $('s3Path');
const s3SaveBtn = $('s3SaveBtn');
const s3TestBtn = $('s3TestBtn');
const s3SyncBtn = $('s3SyncBtn');
const s3RestoreBtn = $('s3RestoreBtn');
// WebDAV 字段
const webdavUrl = $('webdavUrl');
const webdavUser = $('webdavUser');
const webdavPass = $('webdavPass');
const webdavPath = $('webdavPath');
const webdavAllowSelfSigned = $('webdavAllowSelfSigned');
const webdavSaveBtn = $('webdavSaveBtn');
const webdavTestBtn = $('webdavTestBtn');
const webdavSyncBtn = $('webdavSyncBtn');
const webdavRestoreBtn = $('webdavRestoreBtn');
// 自动同步
const autoSyncToggle = $('autoSyncToggle');
const autoSyncInterval = $('autoSyncInterval');
// 恢复备份模态框
const backupModal = $('backupModal');
const backupCloseBtn = $('backupCloseBtn');
const backupList = $('backupList');
const backupModalTitle = $('backupModalTitle');

let currentSyncTab = 's3';

// 设置同步状态提示
function setSyncStatus(msg, type) {
    syncStatus.textContent = msg;
    syncStatus.className = 'sync-status' + (type ? ' ' + type : '');
}

// 获取当前 S3 配置（从输入框读取）
function getS3ConfigFromInputs() {
    return {
        endpoint: s3Endpoint.value.trim(),
        region: s3Region.value.trim(),
        bucket: s3Bucket.value.trim(),
        accessKey: s3AccessKey.value.trim(),
        secretKey: s3SecretKey.value.trim(),
        path: s3Path.value.trim()
    };
}

// 获取当前 WebDAV 配置（从输入框读取）
function getWebdavConfigFromInputs() {
    return {
        url: webdavUrl.value.trim(),
        user: webdavUser.value.trim(),
        pass: webdavPass.value,
        path: webdavPath.value.trim(),
        allowSelfSigned: !!webdavAllowSelfSigned.checked
    };
}

// 加载同步配置到输入框
async function loadSyncConfigToUI() {
    try {
        const cfg = await window.api.loadSyncConfig();
        if (cfg.s3) {
            s3Endpoint.value = cfg.s3.endpoint || '';
            s3Region.value = cfg.s3.region || '';
            s3Bucket.value = cfg.s3.bucket || '';
            s3AccessKey.value = cfg.s3.accessKey || '';
            s3SecretKey.value = cfg.s3.secretKey || '';
            s3Path.value = cfg.s3.path || '';
        }
        if (cfg.webdav) {
            webdavUrl.value = cfg.webdav.url || '';
            webdavUser.value = cfg.webdav.user || '';
            webdavPass.value = cfg.webdav.pass || '';
            webdavPath.value = cfg.webdav.path || '';
            webdavAllowSelfSigned.checked = !!cfg.webdav.allowSelfSigned;
        }
        autoSyncToggle.checked = !!cfg.autoSync;
        autoSyncInterval.value = String(cfg.autoSyncInterval || 30);
        currentSyncTab = cfg.autoSyncProvider || 's3';
        // 激活对应的 tab
        document.querySelectorAll('.sync-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.syncTab === currentSyncTab);
        });
        document.querySelectorAll('.sync-tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.syncContent === currentSyncTab);
        });
        // 旧版明文凭据迁移：强制清空密码框，提示用户重新输入后保存（保存时自动加密）
        if (cfg.legacyPlaintext) {
            s3AccessKey.value = '';
            s3SecretKey.value = '';
            webdavPass.value = '';
            setSyncStatus('检测到旧版明文存储的凭据，为安全起见请重新输入 S3/WebDAV 密码并点击「保存配置」（将自动加密保存）', 'error');
        }
    } catch (e) {
        setSyncStatus('加载配置失败：' + e.message, 'error');
    }
}

// 保存同步配置
async function saveSyncConfig() {
    const data = {
        s3: getS3ConfigFromInputs(),
        webdav: getWebdavConfigFromInputs(),
        autoSync: autoSyncToggle.checked,
        autoSyncInterval: parseInt(autoSyncInterval.value, 10) || 30,
        autoSyncProvider: currentSyncTab
    };
    try {
        await window.api.saveSyncConfig(data);
        setSyncStatus('配置已保存', 'success');
    } catch (e) {
        setSyncStatus('保存失败：' + e.message, 'error');
    }
}

// 打开同步模态框
settingsSyncBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    syncModal.classList.add('open');
    loadSyncConfigToUI();
});

// 关闭
bindModalClose(syncModal, syncCloseBtn);

// Tab 切换
document.querySelectorAll('.sync-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        currentSyncTab = btn.dataset.syncTab;
        document.querySelectorAll('.sync-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sync-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('[data-sync-content="' + currentSyncTab + '"]').classList.add('active');
    });
});

// S3 保存
s3SaveBtn.addEventListener('click', saveSyncConfig);

// S3 测试
s3TestBtn.addEventListener('click', async () => {
    const config = getS3ConfigFromInputs();
    setSyncStatus('正在测试 S3 连接...', 'info');
    try {
        const r = await window.api.testSync('s3', config);
        setSyncStatus(r.message, r.success ? 'success' : 'error');
    } catch (e) {
        setSyncStatus('测试失败：' + e.message, 'error');
    }
});

// S3 立即上传
s3SyncBtn.addEventListener('click', async () => {
    setSyncStatus('正在上传备份到 S3...', 'info');
    try {
        const r = await window.api.uploadSync('s3');
        setSyncStatus(r.message, r.success ? 'success' : 'error');
    } catch (e) {
        setSyncStatus('上传失败：' + e.message, 'error');
    }
});

// WebDAV 保存
webdavSaveBtn.addEventListener('click', saveSyncConfig);

// WebDAV 测试
webdavTestBtn.addEventListener('click', async () => {
    const config = getWebdavConfigFromInputs();
    setSyncStatus('正在测试 WebDAV 连接...', 'info');
    try {
        const r = await window.api.testSync('webdav', config);
        setSyncStatus(r.message, r.success ? 'success' : 'error');
    } catch (e) {
        setSyncStatus('测试失败：' + e.message, 'error');
    }
});

// WebDAV 立即上传
webdavSyncBtn.addEventListener('click', async () => {
    setSyncStatus('正在上传备份到 WebDAV...', 'info');
    try {
        const r = await window.api.uploadSync('webdav');
        setSyncStatus(r.message, r.success ? 'success' : 'error');
    } catch (e) {
        setSyncStatus('上传失败：' + e.message, 'error');
    }
});

// 自动同步开关/间隔变化时自动保存
autoSyncToggle.addEventListener('change', saveSyncConfig);
autoSyncInterval.addEventListener('change', saveSyncConfig);

// 接收自动同步结果
if (window.api && typeof window.api.onAutoSyncResult === 'function') {
    window.api.onAutoSyncResult((data) => {
        setSyncStatus(data.message, data.success ? 'success' : 'error');
    });
}

/* ==================== 恢复备份功能 ==================== */
// 当前备份列表对应的 provider（'s3' 或 'webdav'），供删除/恢复回调引用
let backupListProvider = '';

// 打开恢复备份模态框并加载列表
async function openBackupModal(provider) {
    backupListProvider = provider;
    const label = provider === 's3' ? 'S3' : 'WebDAV';
    backupModalTitle.textContent = '恢复备份 - ' + label;
    backupModal.classList.add('open');
    backupList.innerHTML = '<div class="backup-loading">正在加载备份列表...</div>';
    try {
        const r = await window.api.listBackups(provider);
        if (!r.success) {
            backupList.innerHTML = '<div class="backup-empty">' + escapeHtml(r.message) + '</div>';
            return;
        }
        renderBackupList(r.items || []);
    } catch (e) {
        backupList.innerHTML = '<div class="backup-empty">加载失败：' + escapeHtml(e.message) + '</div>';
    }
}

// 渲染备份列表
function renderBackupList(items) {
    if (!items || items.length === 0) {
        backupList.innerHTML = '<div class="backup-empty">暂无备份文件</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'backup-item';
        const sizeKB = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '';
        const dateStr = item.lastModified ? new Date(item.lastModified).toLocaleString('zh-CN') : '';
        const metaParts = [sizeKB, dateStr].filter(Boolean).join(' · ');
        const info = document.createElement('div');
        info.className = 'backup-item-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'backup-item-name';
        nameEl.textContent = item.name;
        nameEl.title = item.name;
        info.appendChild(nameEl);
        if (metaParts) {
            const metaEl = document.createElement('div');
            metaEl.className = 'backup-item-meta';
            metaEl.textContent = metaParts;
            info.appendChild(metaEl);
        }
        div.appendChild(info);
        // 操作按钮区
        const actions = document.createElement('div');
        actions.className = 'backup-item-actions';
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'backup-item-btn restore';
        restoreBtn.textContent = '恢复备份';
        restoreBtn.addEventListener('click', () => restoreBackupItem(item));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'backup-item-btn delete';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => deleteBackupItem(item));
        actions.appendChild(restoreBtn);
        actions.appendChild(deleteBtn);
        div.appendChild(actions);
        frag.appendChild(div);
    });
    backupList.innerHTML = '';
    backupList.appendChild(frag);
}

// 恢复单个备份
async function restoreBackupItem(item) {
    if (!confirm('确定恢复备份 "' + item.name + '" 吗？\n当前本地数据将被覆盖。')) return;
    setSyncStatus('正在下载并恢复备份...', 'info');
    try {
        const r = await window.api.restoreBackup(backupListProvider, item.id);
        if (r.success) {
            setSyncStatus(r.message, 'success');
            // 恢复成功后刷新列表（列表本身不变，但提示已更新）
            // 通知用户重启或自动刷新数据
            setTimeout(() => {
                if (confirm('备份已恢复，需要刷新页面以加载还原的数据。立即刷新？')) {
                    window.location.reload();
                }
            }, 500);
        } else {
            setSyncStatus('恢复失败：' + r.message, 'error');
        }
    } catch (e) {
        setSyncStatus('恢复失败：' + e.message, 'error');
    }
}

// 删除单个备份
async function deleteBackupItem(item) {
    if (!confirm('确定删除备份 "' + item.name + '" 吗？此操作不可撤销。')) return;
    setSyncStatus('正在删除备份...', 'info');
    try {
        const r = await window.api.deleteBackup(backupListProvider, item.id);
        if (r.success) {
            setSyncStatus('已删除：' + item.name, 'success');
            // 刷新列表
            openBackupModal(backupListProvider);
        } else {
            setSyncStatus('删除失败：' + r.message, 'error');
        }
    } catch (e) {
        setSyncStatus('删除失败：' + e.message, 'error');
    }
}

// S3 恢复备份按钮
s3RestoreBtn.addEventListener('click', () => openBackupModal('s3'));

// WebDAV 恢复备份按钮
webdavRestoreBtn.addEventListener('click', () => openBackupModal('webdav'));

// 关闭恢复备份模态框
bindModalClose(backupModal, backupCloseBtn);

/* ==================== 归档文件夹 + 垃圾桶 ====================
 * 数据：archivedNotes（归档）、trashedNotes（垃圾桶），独立 JSON 持久化
 * 交互：
 *   - 便签列表卡片悬停显示归档按钮（删除按钮左边），点击立即归档
 *   - 详情页左下角工具栏：打开归档文件夹 / 打开垃圾桶
 *   - 归档文件夹：点击条目可恢复到便签列表
 *   - 垃圾桶：条目可还原到便签列表 / 永久删除；右上角"清空"一键清空
 * ============================================================ */
const archiveFolderBtn = $('archiveFolderBtn');
const trashFolderBtn = $('trashFolderBtn');
const archiveModal = $('archiveModal');
const archiveCloseBtn = $('archiveCloseBtn');
const archiveList = $('archiveList');
const archiveCount = $('archiveCount');
const trashModal = $('trashModal');
const trashCloseBtn = $('trashCloseBtn');
const trashList = $('trashList');
const trashCount = $('trashCount');
const trashClearBtn = $('trashClearBtn');

/**
 * 渲染归档文件夹列表（支持搜索关键字过滤）
 */
function renderArchiveList() {
    renderFolderList({
        listEl: archiveList,
        countEl: archiveCount,
        items: archivedNotes,
        keyword: archiveSearchKeyword,
        emptyText: '暂无归档便签',
        searchEmptyText: '没有匹配的便签',
        titleFn: function(n) { return previewText(n.content); },
        metaFn: function(n) {
            var time = escapeHtml(formatNoteCreatedTime(n.createdAt));
            var archTime = n.archivedAt ? escapeHtml(formatNoteCreatedTime(n.archivedAt)) : '';
            return '创建: ' + time + (archTime ? ' | 归档: ' + archTime : '');
        },
        searchTextFn: function(n) { return n.content || ''; },
        restoreAction: 'restore-archive',
        deleteAction: 'delete-archive',
        restoreTitle: '恢复到便签列表',
        infoAction: 'restore-archive'
    });
}

/**
 * 渲染垃圾桶列表（支持搜索关键字过滤）
 */
function renderTrashList() {
    renderFolderList({
        listEl: trashList,
        countEl: trashCount,
        items: trashedNotes,
        keyword: trashSearchKeyword,
        emptyText: '垃圾桶为空',
        searchEmptyText: '没有匹配的便签',
        titleFn: function(n) { return previewText(n.content); },
        metaFn: function(n) {
            var time = escapeHtml(formatNoteCreatedTime(n.createdAt));
            var delTime = n.trashedAt ? escapeHtml(formatNoteCreatedTime(n.trashedAt)) : '';
            return '创建: ' + time + (delTime ? ' | 删除: ' + delTime : '');
        },
        searchTextFn: function(n) { return n.content || ''; },
        restoreAction: 'restore-trash',
        deleteAction: 'delete-trash',
        restoreTitle: '还原到便签列表',
        infoAction: null
    });
}

const todoArchiveFolderBtn = $('todoArchiveFolderBtn');
const todoArchiveModal = $('todoArchiveModal');
const todoArchiveCloseBtn = $('todoArchiveCloseBtn');
const todoArchiveList = $('todoArchiveList');
const todoArchiveCount = $('todoArchiveCount');
const todoArchiveSearchInput = $('todoArchiveSearchInput');

/**
 * 渲染待办归档文件夹列表（支持搜索关键字过滤）
 */
function renderTodoArchiveList() {
    renderFolderList({
        listEl: todoArchiveList,
        countEl: todoArchiveCount,
        items: archivedTodos,
        keyword: todoArchiveSearchKeyword,
        emptyText: '暂无归档待办',
        searchEmptyText: '没有匹配的待办',
        titleFn: function(t) { return escapeHtml(t.text); },
        metaFn: function(t) {
            var time = escapeHtml(formatTodoTime(t.createdAt || t.id));
            var archTime = t.archivedAt ? escapeHtml(formatTodoTime(t.archivedAt)) : '';
            return '创建: ' + time + (archTime ? ' | 归档: ' + archTime : '');
        },
        searchTextFn: function(t) { return t.text || ''; },
        restoreAction: 'restore-todo-archive',
        deleteAction: 'delete-todo-archive',
        restoreTitle: '恢复到待办列表',
        infoAction: null
    });
}

// 打开待办归档文件夹
if (todoArchiveFolderBtn) {
    todoArchiveFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        todoArchiveSearchKeyword = '';
        if (todoArchiveSearchInput) todoArchiveSearchInput.value = '';
        renderTodoArchiveList();
        todoArchiveModal.classList.add('open');
    });
}

// 待办归档搜索
if (todoArchiveSearchInput) {
    bindFolderSearch(todoArchiveSearchInput, function(val) { todoArchiveSearchKeyword = val; }, renderTodoArchiveList);
}

// 关闭待办归档模态框
if (todoArchiveModal && todoArchiveCloseBtn) {
    bindModalClose(todoArchiveModal, todoArchiveCloseBtn);
}

// 待办归档列表事件委托：还原 / 永久删除
if (todoArchiveList) {
    todoArchiveList.addEventListener('click', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const item = e.target.closest('.folder-item');
        if (!item || !item.dataset.id) return;
        const id = Number(item.dataset.id);
        const action = actionEl.dataset.action;
        if (action === 'restore-todo-archive') {
            const t = archivedTodos.find(x => x.id === id);
            if (t) {
                delete t.archivedAt;
                todos.unshift(t);
                archivedTodos = archivedTodos.filter(x => x.id !== id);
                await saveArchivedTodosToDisk();
                await saveTodosToDisk();
                renderTodoList();
                renderTodoArchiveList();
                pushTodosToPopoutIfOpen();
            }
        } else if (action === 'delete-todo-archive') {
            archivedTodos = archivedTodos.filter(x => x.id !== id);
            await saveArchivedTodosToDisk();
            renderTodoArchiveList();
        }
    });
}
// 工具栏：打开归档文件夹
if (archiveFolderBtn) {
    archiveFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        archiveSearchKeyword = '';
        const archiveSearchInput = $('archiveSearchInput');
        if (archiveSearchInput) archiveSearchInput.value = '';
        renderArchiveList();
        archiveModal.classList.add('open');
    });
}

// 工具栏：打开垃圾桶
trashFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 打开时清空搜索框，显示全部
    trashSearchKeyword = '';
    const trashSearchInput = $('trashSearchInput');
    if (trashSearchInput) trashSearchInput.value = '';
    renderTrashList();
    trashModal.classList.add('open');
});

/* ==================== 搜索功能：三种视图通用 ====================
 * 便签列表、归档文件夹、垃圾桶均支持实时搜索
 * 输入文字时自动过滤，清空时恢复完整列表
 * ============================================================ */
// 便签列表搜索
const noteSearchInput = $('noteSearchInput');
// 防抖搜索：用户连续输入时只在停顿 200ms 后渲染一次，避免大列表每次按键都全量重建
bindFolderSearch(noteSearchInput, function(val) { noteSearchKeyword = val; }, renderNoteList);

// 归档文件夹搜索
const archiveSearchInput = $('archiveSearchInput');
bindFolderSearch(archiveSearchInput, function(val) { archiveSearchKeyword = val; }, renderArchiveList);

// 垃圾桶搜索
const trashSearchInput = $('trashSearchInput');
bindFolderSearch(trashSearchInput, function(val) { trashSearchKeyword = val; }, renderTrashList);

// 关闭归档模态框
bindModalClose(archiveModal, archiveCloseBtn);

// 关闭垃圾桶模态框
bindModalClose(trashModal, trashCloseBtn);

// 归档列表事件委托：还原 / 永久删除
archiveList.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const item = e.target.closest('.folder-item');
    if (!item || !item.dataset.id) return;
    const id = Number(item.dataset.id);
    const action = actionEl.dataset.action;
    if (action === 'restore-archive') {
        // 从归档还原到便签列表
        const note = archivedNotes.find(n => n.id === id);
        if (note) {
            delete note.archivedAt;
            notes.unshift(note);
            sortNotes(notes);
            archivedNotes = archivedNotes.filter(n => n.id !== id);
            await window.api.saveArchivedNotes(archivedNotes);
            await saveNotesToDisk();
            renderNoteList();
            renderArchiveList();
        }
    } else if (action === 'delete-archive') {
        // 永久删除归档便签
        archivedNotes = archivedNotes.filter(n => n.id !== id);
        await window.api.saveArchivedNotes(archivedNotes);
        renderArchiveList();
    }
});

// 垃圾桶列表事件委托：还原 / 永久删除
trashList.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const item = e.target.closest('.folder-item');
    if (!item || !item.dataset.id) return;
    const id = Number(item.dataset.id);
    const action = actionEl.dataset.action;
    if (action === 'restore-trash') {
        // 从垃圾桶还原到便签详情页
        const note = trashedNotes.find(n => n.id === id);
        if (note) {
            delete note.trashedAt;
            notes.unshift(note);
            sortNotes(notes);
            trashedNotes = trashedNotes.filter(n => n.id !== id);
            await window.api.saveTrashedNotes(trashedNotes);
            await saveNotesToDisk();
            renderNoteList();
            renderTrashList();
        }
    } else if (action === 'delete-trash') {
        // 永久删除垃圾桶便签
        trashedNotes = trashedNotes.filter(n => n.id !== id);
        await window.api.saveTrashedNotes(trashedNotes);
        renderTrashList();
    }
});

// 垃圾桶：清空所有便签
trashClearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (trashedNotes.length === 0) return;
    if (!confirm('确定要清空垃圾桶吗？所有便签将被永久删除，无法恢复。')) return;
    trashedNotes = [];
    await window.api.saveTrashedNotes(trashedNotes);
    renderTrashList();
});

/* ==================== AI 聊天归档/垃圾桶文件夹 ====================
 * 与便签归档/垃圾桶同构：独立 JSON 持久化，文件夹模态框查看/还原/永久删除
 * 交互：
 *   - 聊天列表条目悬停显示归档按钮（删除按钮左边），点击立即归档
 *   - 聊天输入区工具栏：打开聊天归档文件夹 / 打开聊天垃圾桶
 *   - 聊天归档：条目可还原到聊天列表 / 永久删除
 *   - 聊天垃圾桶：条目可还原 / 永久删除；右上角"清空"一键清空
 * ============================================================ */
const chatArchiveFolderBtn = $('chatArchiveFolderBtn');
const chatTrashFolderBtn = $('chatTrashFolderBtn');
const chatArchiveModal = $('chatArchiveModal');
const chatArchiveCloseBtn = $('chatArchiveCloseBtn');
const chatArchiveListEl = $('chatArchiveList');
const chatArchiveCountEl = $('chatArchiveCount');
const chatTrashModal = $('chatTrashModal');
const chatTrashCloseBtn = $('chatTrashCloseBtn');
const chatTrashListEl = $('chatTrashList');
const chatTrashCountEl = $('chatTrashCount');
const chatTrashClearBtn = $('chatTrashClearBtn');

// 提取聊天正文用于搜索与预览（拼接所有消息文本）
function getChatSearchText(chat) {
    if (!chat) return '';
    const title = chat.title || '';
    const msgs = (chat.messages || []).map(m => m.content || '').join(' ');
    return (title + ' ' + msgs);
}

function previewChatTitle(chat) {
    return (chat && chat.title) ? chat.title : '新对话';
}

/**
 * 渲染聊天归档列表（支持搜索关键字过滤）
 */
function renderChatArchiveList() {
    renderFolderList({
        listEl: chatArchiveListEl,
        countEl: chatArchiveCountEl,
        items: archivedChats,
        keyword: chatArchiveSearchKeyword,
        emptyText: '暂无归档聊天',
        searchEmptyText: '没有匹配的聊天',
        titleFn: function(c) { return previewChatTitle(c); },
        metaFn: function(c) {
            var created = escapeHtml(formatChatTime(c.createdAt, true));
            var archTime = c.archivedAt ? escapeHtml(formatChatTime(c.archivedAt, true)) : '';
            var msgCount = (c.messages || []).length;
            return '创建: ' + created + (archTime ? ' | 归档: ' + archTime : '') + ' | 消息: ' + msgCount;
        },
        searchTextFn: function(c) { return getChatSearchText(c); },
        restoreAction: 'restore-chat-archive',
        deleteAction: 'delete-chat-archive',
        restoreTitle: '还原到聊天列表',
        infoAction: 'restore-chat-archive',
        sortFn: function(arr) {
            return arr.slice().sort(function(a, b) {
                return (b.archivedAt || b.updatedAt || 0) - (a.archivedAt || a.updatedAt || 0);
            });
        }
    });
}

/**
 * 渲染聊天垃圾桶列表（支持搜索关键字过滤）
 */
function renderChatTrashList() {
    renderFolderList({
        listEl: chatTrashListEl,
        countEl: chatTrashCountEl,
        items: trashedChats,
        keyword: chatTrashSearchKeyword,
        emptyText: '聊天垃圾桶为空',
        searchEmptyText: '没有匹配的聊天',
        titleFn: function(c) { return previewChatTitle(c); },
        metaFn: function(c) {
            var created = escapeHtml(formatChatTime(c.createdAt, true));
            var delTime = c.trashedAt ? escapeHtml(formatChatTime(c.trashedAt, true)) : '';
            var msgCount = (c.messages || []).length;
            return '创建: ' + created + (delTime ? ' | 删除: ' + delTime : '') + ' | 消息: ' + msgCount;
        },
        searchTextFn: function(c) { return getChatSearchText(c); },
        restoreAction: 'restore-chat-trash',
        deleteAction: 'delete-chat-trash',
        restoreTitle: '还原到聊天列表',
        infoAction: null,
        sortFn: function(arr) {
            return arr.slice().sort(function(a, b) {
                return (b.trashedAt || b.updatedAt || 0) - (a.trashedAt || a.updatedAt || 0);
            });
        }
    });
}

// 工具栏：打开聊天归档文件夹
chatArchiveFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chatArchiveSearchKeyword = '';
    const inp = $('chatArchiveSearchInput');
    if (inp) inp.value = '';
    renderChatArchiveList();
    chatArchiveModal.classList.add('open');
});

// 工具栏：打开聊天垃圾桶
chatTrashFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chatTrashSearchKeyword = '';
    const inp = $('chatTrashSearchInput');
    if (inp) inp.value = '';
    renderChatTrashList();
    chatTrashModal.classList.add('open');
});

/* ==================== 导出当前 AI 会话为 Markdown 文件 ====================
 * 点击导出按键 → 生成 Markdown 内容 → 弹出系统保存对话框 → 落盘
 * Markdown 格式：
 *   # 会话标题
 *   > 导出时间：xxx | 消息数：N
 *   ## 👤 用户 / ## 🤖 AI
 *   消息内容
 *   （AI 回复包含：模型/耗时/Token 统计 + 思考过程折叠）
 * ============================================================ */
const chatExportMdBtn = $('chatExportMdBtn');
chatExportMdBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const chat = getCurrentChat();
    if (!chat || !chat.messages || chat.messages.length === 0) {
        // 无消息提示：闪烁按钮
        flashBtn(chatExportMdBtn, '#FF453A');
        return;
    }
    const md = buildChatMarkdown(chat);
    try {
        const result = await window.api.exportChatToMarkdown({
            title: chat.title || 'AI会话',
            content: md
        });
        if (result && result.success) {
            // 成功提示：闪绿
            flashBtn(chatExportMdBtn, '#34C759');
        } else if (result && result.canceled) {
            // 用户取消，不提示
        } else {
            flashBtn(chatExportMdBtn, '#FF453A');
        }
    } catch (err) {
        flashBtn(chatExportMdBtn, '#FF453A');
    }
});

/**
 * 把当前 AI 会话转换为 Markdown 字符串
 * @param {{title:string, messages:Array, createdAt:number}} chat
 * @returns {string}
 */
function buildChatMarkdown(chat) {
    const lines = [];
    const title = chat.title || 'AI会话';
    lines.push('# ' + title);
    lines.push('');
    const exportTime = new Date().toLocaleString('zh-CN');
    const msgCount = (chat.messages || []).length;
    lines.push('> 导出时间：' + exportTime + ' | 消息数：' + msgCount);
    lines.push('');
    lines.push('---');
    lines.push('');
    (chat.messages || []).forEach((msg, idx) => {
        const role = msg.role === 'user' ? '👤 用户' : '🤖 AI';
        lines.push('## ' + role);
        // 时间
        if (msg.ts) {
            try {
                lines.push('*' + new Date(msg.ts).toLocaleString('zh-CN') + '*');
                lines.push('');
            } catch (e) { console.warn('格式化消息时间失败:', e.message); }
        }
        // 思考过程
        if (msg.role === 'assistant' && msg.reasoning) {
            lines.push('<details>');
            lines.push('<summary>💭 思考过程</summary>');
            lines.push('');
            lines.push(msg.reasoning);
            lines.push('');
            lines.push('</details>');
            lines.push('');
        }
        // 用户消息附件图片
        if (msg.role === 'user' && Array.isArray(msg.images) && msg.images.length > 0) {
            lines.push('**附件图片：** ' + msg.images.length + ' 张');
            msg.images.forEach((img, i) => {
                if (img.path) lines.push(`![图片${i + 1}](chat-images/${img.path})`);
            });
            lines.push('');
        }
        // 消息内容
        lines.push(msg.content || '');
        lines.push('');
        // AI 统计
        if (msg.role === 'assistant' && !msg.error && msg.stats && msg.stats.model) {
            const tokenStr = (msg.stats.tokens && msg.stats.tokens > 0) ? msg.stats.tokens : '—';
            const elapsed = msg.stats.elapsedSec !== undefined ? msg.stats.elapsedSec : '—';
            lines.push('');
            lines.push('> 📊 当前模型: ' + (msg.stats.model || '—') + ' | 耗时: ' + elapsed + 's | 消耗Token: ' + tokenStr);
            lines.push('');
        }
        // 错误标记
        if (msg.error) {
            lines.push('');
            lines.push('> ⚠️ 此消息生成时发生错误');
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    });
    lines.push('');
    lines.push('— 由便签 V5.0 导出');
    return lines.join('\n');
}

// 聊天归档搜索
const chatArchiveSearchInput = $('chatArchiveSearchInput');
// 搜索框防抖 200ms（与其余搜索框一致，降低高频输入时的 DOM 重建开销）
bindFolderSearch(chatArchiveSearchInput, function(val) { chatArchiveSearchKeyword = val; }, renderChatArchiveList);

// 聊天垃圾桶搜索
const chatTrashSearchInput = $('chatTrashSearchInput');
bindFolderSearch(chatTrashSearchInput, function(val) { chatTrashSearchKeyword = val; }, renderChatTrashList);

// 关闭聊天归档模态框
bindModalClose(chatArchiveModal, chatArchiveCloseBtn);

// 关闭聊天垃圾桶模态框
bindModalClose(chatTrashModal, chatTrashCloseBtn);

// 聊天归档列表事件委托：还原 / 永久删除
chatArchiveListEl.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const item = e.target.closest('.folder-item');
    if (!item || !item.dataset.id) return;
    const id = Number(item.dataset.id);
    const action = actionEl.dataset.action;
    if (action === 'restore-chat-archive') {
        const chat = archivedChats.find(c => c.id === id);
        if (chat) {
            delete chat.archivedAt;
            aiChats.push(chat);
            archivedChats = archivedChats.filter(c => c.id !== id);
            saveChats();
            await window.api.saveArchivedChats(archivedChats);
            renderChatList();
            renderChatArchiveList();
        }
    } else if (action === 'delete-chat-archive') {
        // 永久删除归档聊天：清理其引用的本地图片后移除
        const chat = archivedChats.find(c => c.id === id);
        if (chat) cleanupChatImages(chat);
        archivedChats = archivedChats.filter(c => c.id !== id);
        await window.api.saveArchivedChats(archivedChats);
        renderChatArchiveList();
    }
});

// 聊天垃圾桶列表事件委托：还原 / 永久删除
chatTrashListEl.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const item = e.target.closest('.folder-item');
    if (!item || !item.dataset.id) return;
    const id = Number(item.dataset.id);
    const action = actionEl.dataset.action;
    if (action === 'restore-chat-trash') {
        const chat = trashedChats.find(c => c.id === id);
        if (chat) {
            delete chat.trashedAt;
            aiChats.push(chat);
            trashedChats = trashedChats.filter(c => c.id !== id);
            saveChats();
            await window.api.saveTrashedChats(trashedChats);
            renderChatList();
            renderChatTrashList();
        }
    } else if (action === 'delete-chat-trash') {
        // 永久删除垃圾桶聊天：清理其引用的本地图片后移除
        const chat = trashedChats.find(c => c.id === id);
        if (chat) cleanupChatImages(chat);
        trashedChats = trashedChats.filter(c => c.id !== id);
        await window.api.saveTrashedChats(trashedChats);
        renderChatTrashList();
    }
});

// 聊天垃圾桶：清空所有聊天
chatTrashClearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (trashedChats.length === 0) return;
    if (!confirm('确定要清空聊天垃圾桶吗？所有聊天将被永久删除，无法恢复。')) return;
    // 清理所有垃圾桶聊天引用的本地图片
    trashedChats.forEach(c => cleanupChatImages(c));
    trashedChats = [];
    await window.api.saveTrashedChats(trashedChats);
    renderChatTrashList();
});

// 接收恢复完成通知（主进程通过 webContents.send 推送）
if (window.api && typeof window.api.onRestoreDone === 'function') {
    window.api.onRestoreDone((data) => {
        setSyncStatus('已还原 ' + (data.restoredFiles || 0) + ' 个数据文件', 'success');
    });
}

/* ==================== 窗口缩放（右下角手柄） ==================== */
if (resizeHandle) {
    let isResizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startX = e.screenX;
        startY = e.screenY;
        startW = window.outerWidth;
        startH = window.outerHeight;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nwse-resize';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newW = Math.max(600, startW + (e.screenX - startX));
        const newH = Math.max(400, startH + (e.screenY - startY));
        window.api?.resizeWindow?.(newW, newH);
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });
    // 键盘方向键调整窗口大小（无障碍支持）
    resizeHandle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 50 : 10;
        let handled = false;
        let newW = window.outerWidth;
        let newH = window.outerHeight;
        switch (e.key) {
            case 'ArrowUp':
                newH = Math.max(400, newH - step);
                handled = true;
                break;
            case 'ArrowDown':
                newH = newH + step;
                handled = true;
                break;
            case 'ArrowLeft':
                newW = Math.max(600, newW - step);
                handled = true;
                break;
            case 'ArrowRight':
                newW = newW + step;
                handled = true;
                break;
            case 'Home':
                newW = 600;
                newH = 400;
                handled = true;
                break;
            case 'Enter':
            case ' ':
                // Enter/Space 触发默认大小（不改变，仅确认焦点）
                handled = true;
                break;
            default:
                break;
        }
        if (handled) {
            e.preventDefault();
            window.api?.resizeWindow?.(newW, newH);
        }
    });
}

/* ==================== 可访问性: 模态框焦点陷阱 + ESC 关闭 ==================== */
(function setupModalFocusTrap() {
    const modalSelector = '.modal-overlay, .folder-modal, .sync-modal, .backup-modal';
    const modals = document.querySelectorAll(modalSelector);
    if (modals.length === 0) return;

    let lastFocusedElement = null;
    // 模态栈：支持嵌套模态框（如设置内打开子模态框）
    let modalStack = [];
    function activeModal() { return modalStack.length > 0 ? modalStack[modalStack.length - 1] : null; }
    function isActive(modal) { return modalStack[modalStack.length - 1] === modal; }

    // 获取模态框内所有可聚焦元素（过滤不可见、禁用、或祖先隐藏的）
    function getFocusableElements(modal) {
        const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        return Array.from(modal.querySelectorAll(selector)).filter(function(el) {
            if (el.disabled) return false;
            if (el.getAttribute('tabindex') === '-1') return false;
            // offsetParent 为 null 表示元素或其祖先 display:none/position:fixed
            // 对 position:fixed 的模态框内元素需特殊处理
            if (el.offsetParent === null && el.style.position !== 'fixed') {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
            }
            return true;
        });
    }

    // 查找模态框的关闭按钮
    function findCloseButton(modal) {
        return modal.querySelector('.modal-close-btn, .folder-close, .sync-close');
    }

    // 模态框打开：入栈 → 保存焦点 → 聚焦关闭按钮
    function onModalOpen(modal) {
        if (isActive(modal)) return; // 已是栈顶
        // 仅在栈空时保存焦点（嵌套模态关闭后恢复到最初触发元素）
        if (modalStack.length === 0) {
            lastFocusedElement = document.activeElement;
        } else {
            // 栈非空，从栈中移除可能的旧记录（防止重复入栈）
            var idx = modalStack.indexOf(modal);
            if (idx !== -1) modalStack.splice(idx, 1);
        }
        modalStack.push(modal);
        // 延迟聚焦，等待 CSS display:flex 生效
        setTimeout(function() {
            if (!isActive(modal)) return; // 模态框已关闭或被覆盖
            const closeBtn = findCloseButton(modal);
            const focusables = getFocusableElements(modal);
            if (closeBtn && !closeBtn.disabled) {
                closeBtn.focus();
            } else if (focusables.length > 0) {
                focusables[0].focus();
            } else {
                modal.setAttribute('tabindex', '-1');
                modal.focus();
            }
        }, 50);
    }

    // 模态框关闭：出栈 → 栈空时恢复焦点，栈非空时聚焦外层模态
    function onModalClose(modal) {
        var idx = modalStack.indexOf(modal);
        if (idx === -1) return; // 不在栈中
        modalStack.splice(idx, 1);
        if (modalStack.length === 0) {
            // 所有模态已关闭，恢复最初焦点
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                var restoreTarget = lastFocusedElement;
                lastFocusedElement = null;
                setTimeout(function() {
                    try { restoreTarget.focus(); } catch (e) { console.warn('恢复焦点失败:', e.message); }
                }, 50);
            }
        } else {
            // 还有外层模态，聚焦到外层模态的关闭按钮
            var outer = modalStack[modalStack.length - 1];
            setTimeout(function() {
                var closeBtn = findCloseButton(outer);
                if (closeBtn && !closeBtn.disabled) {
                    closeBtn.focus();
                }
            }, 50);
        }
    }

    // MutationObserver 监听所有模态框的 class 变化
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const modal = mutation.target;
                if (modal.classList.contains('open')) {
                    onModalOpen(modal);
                } else {
                    onModalClose(modal);
                }
            }
        });
    });

    modals.forEach(function(modal) {
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    // 全局键盘处理：Tab 焦点陷阱 + ESC 关闭（捕获阶段，优先于其他处理器）
    document.addEventListener('keydown', function(e) {
        // 锁屏时不拦截
        if (typeof isLocked !== 'undefined' && isLocked) return;

        var current = activeModal();
        if (!current) return;

        // ESC: 关闭当前活动模态框（栈顶）
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            const closeBtn = findCloseButton(current);
            if (closeBtn) {
                closeBtn.click();
            } else {
                current.classList.remove('open');
            }
            return;
        }

        // Tab/Shift+Tab: 焦点陷阱（仅对栈顶模态生效）
        if (e.key === 'Tab') {
            const focusables = getFocusableElements(current);
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }
            const firstEl = focusables[0];
            const lastEl = focusables[focusables.length - 1];
            if (e.shiftKey) {
                // Shift+Tab: 在第一个元素时跳到最后一个
                if (document.activeElement === firstEl) {
                    e.preventDefault();
                    lastEl.focus();
                }
            } else {
                // Tab: 在最后一个元素时跳到第一个
                if (document.activeElement === lastEl) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        }
    }, true); // 捕获阶段
})();

/* ==================== 标签页切换 ==================== */
const tabs = document.querySelectorAll('.tab');
const tabPages = {
    notes: $('tab-notes'),
    chat: $('tab-chat'),
    create: $('tab-create'),
    clock: $('tab-clock'),
    calendar: $('tab-calendar'),
    music: $('tab-music')
};

// 内容编辑区可在便签页和闹钟页间共享移动
const contentPanel = $('contentPanel');
const notesContentSlot = $('notesContentSlot');
const clockContentSlot = $('clockContentSlot');

function moveContentPanelTo(slot) {
    if (slot && contentPanel.parentElement !== slot) {
        slot.appendChild(contentPanel);
        contentPanel.style.display = '';
        // 移动 DOM 节点后 textarea 的 disabled 状态可能被某些浏览器重置
        // 强制重新触发一次 renderEditor 确保输入框可用
        try { renderEditor(); } catch (e) { console.warn('重新渲染编辑器失败:', e.message); }
    }
}

let currentTab = 'notes';  // 记录当前激活的 tab，用于切换时调用 onTabDeactivated
tabs.forEach(tab => {
    tab.addEventListener('click', function() {
        const target = this.dataset.tab;
        // 离开编辑区时保存未落盘内容
        if (target !== 'notes' && target !== 'clock' && contentDirty) {
            const cur = getCurrentNote();
            if (cur) { cur.content = noteInput.value; cur.updatedAt = now(); }
            contentDirty = false;
            saveNotesToDisk();
        }
        // 离开日历 tab 时通知模块清理 resize 防抖计时器，避免离开后还触发一次重绘
        if (currentTab === 'calendar' && target !== 'calendar' && window.CalendarModule && window.CalendarModule.onTabDeactivated) {
            window.CalendarModule.onTabDeactivated();
        }
        // 离开音乐 tab 时通知模块（后台播放继续，无需暂停）
        if (currentTab === 'music' && target !== 'music' && window.MusicModule && window.MusicModule.onTabDeactivated) {
            window.MusicModule.onTabDeactivated();
        }
        // 离开音乐 tab 时也通知 FM 收音机模块（后台播放继续）
        if (currentTab === 'music' && target !== 'music' && window.RadioModule && window.RadioModule.onTabDeactivated) {
            window.RadioModule.onTabDeactivated();
        }
        currentTab = target;
        tabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        // 六个 tab 独立显示：便签、AI 聊天、AI 创作、闹钟、日历、音乐
        tabPages.notes.classList.toggle('active', target === 'notes');
        tabPages.chat.classList.toggle('active', target === 'chat');
        tabPages.create.classList.toggle('active', target === 'create');
        tabPages.clock.classList.toggle('active', target === 'clock');
        tabPages.calendar.classList.toggle('active', target === 'calendar');
        tabPages.music.classList.toggle('active', target === 'music');
        // 动态移动内容编辑区到对应 slot
        if (target === 'notes') {
            moveContentPanelTo(notesContentSlot);
            if (getCurrentNote()) noteInput.focus();
            // 切到便签页时若处于预览模式，刷新预览
            if (editorWrap && editorWrap.classList.contains('preview-mode')) {
                renderMarkdownPreview();
            }
        } else if (target === 'clock') {
            moveContentPanelTo(clockContentSlot);
            if (getCurrentNote()) noteInput.focus();
            if (editorWrap && editorWrap.classList.contains('preview-mode')) {
                renderMarkdownPreview();
            }
        } else if (target === 'calendar') {
            // 激活日历时刷新视图（便签可能有更新）
            if (window.CalendarModule) window.CalendarModule.onTabActivated();
        } else if (target === 'music') {
            // 激活音乐 tab 时通知模块（后台播放继续，无需特殊处理）
            if (window.MusicModule && window.MusicModule.onTabActivated) window.MusicModule.onTabActivated();
            // 同时通知 FM 收音机模块
            if (window.RadioModule && window.RadioModule.onTabActivated) window.RadioModule.onTabActivated();
        }
    });
});



/* ==================== Markdown 预览切换 ====================
 * marked 与 DOMPurify 改为懒加载：首次点击预览时才加载，加速首屏启动
 */
let mdLibsPromise = null;
function ensureMarkdownLibs() {
    if (mdLibsPromise) return mdLibsPromise;
    mdLibsPromise = (async () => {
        if (!window.marked) await loadScript('marked.min.js');
        if (!window.DOMPurify) await loadScript('purify.min.js');
    })();
    return mdLibsPromise;
}

async function renderMarkdownPreview() {
    const md = noteInput.value || '';
    try {
        await ensureMarkdownLibs();
        if (!window.marked) {
            notePreviewWrap.textContent = 'marked.js 加载失败，无法预览';
            return;
        }
        // marked 解析后用 DOMPurify 净化，移除 onerror/script/恶意表单等危险节点，防止 XSS
        marked.setOptions({ breaks: true, gfm: true });
        const rawHtml = marked.parse(md);
        if (window.DOMPurify) {
            // DOMPurify 净化：限制标签/属性白名单 + URI 正则（仅允许 https/chatimg/data:image），
            // 阻断 onerror、javascript:、恶意 data: 等 XSS 向量
            const cleanHtml = window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['p','br','strong','em','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','a','img','table','thead','tbody','tr','th','td','hr','span','div','b','i','s','sub','sup','mark'],
                ALLOWED_ATTR: ['href','src','alt','title','class','colspan','rowspan','target','rel'],
                ALLOW_DATA_ATTR: false,
                ALLOWED_URI_REGEXP: /^(?:(?:https?|chatimg):|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i
            });
            notePreviewWrap.innerHTML = cleanHtml;
        } else {
            // DOMPurify 未加载：降级为纯文本展示（textContent 自动转义 HTML），绝不渲染未净化 HTML
            notePreviewWrap.textContent = md;
        }
    } catch (e) {
        notePreviewWrap.textContent = '渲染失败：' + e.message;
    }
}

mdToggleBtn.addEventListener('click', () => {
    const isPreview = editorWrap.classList.toggle('preview-mode');
    mdToggleBtn.classList.toggle('active', isPreview);
    mdToggleBtn.innerHTML = isPreview
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>编辑'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M3 6h18M3 12h18M3 18h18"/></svg>预览';
    if (isPreview) {
        renderMarkdownPreview();
    }
});

// 便签切换时若处于预览模式，刷新预览
function refreshMarkdownPreviewIfActive() {
    if (editorWrap && editorWrap.classList.contains('preview-mode')) {
        renderMarkdownPreview();
    }
}

/* ==================== 实时时钟 ==================== */
const WEEKDAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
// pad2 已抽取至 renderer/utils.js（见文件顶部引用）

function updateClock() {
    const d = new Date();
    clockDate.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    clockTime.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    clockWeek.textContent = WEEKDAYS[d.getDay()];
}

/* ==================== Web Audio 闹钟铃声（7 种铃声） ==================== */
let audioCtx = null;
let masterGainNode = null;   // 主增益节点：实现音量放大（>100% 时强行增益）
let alarmRinging = false;
let alarmOscTimer = null;
let currentAlarmSound = 'default';
// 闹钟音量百分比：0-300（100=原始音量，>100 用 GainNode 放大，最大 300%）
let alarmVolume = 100;

function ensureAudioCtx() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // 创建主增益节点：所有 osc → masterGain → destination
            // 通过 masterGain.gain.value 控制总音量，支持 >1.0 强行放大
            if (audioCtx) {
                masterGainNode = audioCtx.createGain();
                masterGainNode.gain.value = alarmVolume / 100;
                masterGainNode.connect(audioCtx.destination);
            }
        }
        catch (e) { console.error('AudioContext 创建失败', e); }
    }
    // 窗口最小化/隐藏到托盘时 AudioContext 会被浏览器自动挂起（suspended），
    // 必须主动 resume 才能出声；这里用 Promise 形式多次尝试，避免一次失败就静音
    if (audioCtx && audioCtx.state === 'suspended') {
        try {
            const r = audioCtx.resume();
            if (r && typeof r.then === 'function') {
                r.catch(() => { /* 忽略：稍后 visibilitychange / 下次播放会再试 */ });
            }
        } catch (_) { /* 忽略 */ }
    }
    return audioCtx;
}

/**
 * 设置闹钟音量（0-300%，>100% 时 GainNode 强行放大）
 * @param {number} percent - 音量百分比
 */
function setAlarmVolume(percent) {
    const v = Math.max(0, Math.min(300, parseInt(percent, 10) || 0));
    alarmVolume = v;
    if (masterGainNode && audioCtx) {
        try {
            masterGainNode.gain.setValueAtTime(v / 100, audioCtx.currentTime);
        } catch (_) {
            masterGainNode.gain.value = v / 100;
        }
    }
}

// 基础音符播放（ADSR 包络）
function playNote(ctx, freq, startTime, duration, type, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol || 0.3, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    // 连接到 masterGain（而非直接到 destination），统一受主音量控制
    osc.connect(gain);
    if (masterGainNode) gain.connect(masterGainNode);
    else gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

// 7 种铃声模式定义（每个返回一个循环周期时长 ms）
const ALARM_SOUNDS = {
    // 1. 默认叮咚：双音循环
    default: (ctx) => {
        const t = ctx.currentTime;
        playNote(ctx, 880, t, 0.25, 'sine', 0.3);
        playNote(ctx, 660, t + 0.3, 0.25, 'sine', 0.3);
        return 800;
    },
    // 2. 苹果风格：清脆三音琶音 C5-E5-G5
    apple: (ctx) => {
        const t = ctx.currentTime;
        playNote(ctx, 523, t, 0.2, 'triangle', 0.25);       // C5
        playNote(ctx, 659, t + 0.15, 0.2, 'triangle', 0.25); // E5
        playNote(ctx, 784, t + 0.3, 0.35, 'triangle', 0.3);  // G5
        return 900;
    },
    // 3. 安卓风格：两声降调
    android: (ctx) => {
        const t = ctx.currentTime;
        playNote(ctx, 660, t, 0.2, 'square', 0.15);
        playNote(ctx, 440, t + 0.25, 0.3, 'square', 0.15);
        return 700;
    },
    // 4. 诺基亚经典：Grande Vals 片段
    nokia: (ctx) => {
        const t = ctx.currentTime;
        // E5-D5-F5-G5-C5... 简化版
        playNote(ctx, 659, t, 0.18, 'sine', 0.25);        // E5
        playNote(ctx, 587, t + 0.2, 0.18, 'sine', 0.25);   // D5
        playNote(ctx, 698, t + 0.4, 0.18, 'sine', 0.25);   // F5
        playNote(ctx, 784, t + 0.6, 0.35, 'sine', 0.3);    // G5
        playNote(ctx, 523, t + 1.0, 0.4, 'sine', 0.25);    // C5
        return 1800;
    },
    // 5. 清脆铃声：高频双音交替
    crystal: (ctx) => {
        const t = ctx.currentTime;
        playNote(ctx, 1760, t, 0.15, 'sine', 0.2);        // A6
        playNote(ctx, 2093, t + 0.18, 0.15, 'sine', 0.2);  // C7
        playNote(ctx, 1760, t + 0.36, 0.15, 'sine', 0.2);
        playNote(ctx, 2093, t + 0.54, 0.2, 'sine', 0.2);
        return 800;
    },
    // 6. 鸟鸣：频率快速变化的啁啾声
    bird: (ctx) => {
        const t = ctx.currentTime;
        // 用三个短促的高频音模拟鸟鸣
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2200, t + i * 0.15);
            osc.frequency.exponentialRampToValueAtTime(2800, t + i * 0.15 + 0.08);
            gain.gain.setValueAtTime(0, t + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.2, t + i * 0.15 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.12);
            osc.connect(gain);
            if (masterGainNode) gain.connect(masterGainNode);
            else gain.connect(ctx.destination);
            osc.start(t + i * 0.15);
            osc.stop(t + i * 0.15 + 0.13);
        }
        return 700;
    },
    // 7. 电子闹钟：方波蜂鸣
    electronic: (ctx) => {
        const t = ctx.currentTime;
        playNote(ctx, 1000, t, 0.15, 'square', 0.15);
        playNote(ctx, 1000, t + 0.25, 0.15, 'square', 0.15);
        playNote(ctx, 1000, t + 0.5, 0.15, 'square', 0.15);
        return 800;
    },
};

function startAlarmSound(soundType) {
    // 重入保护，防重复调用创建多个 tick 闭包导致闹钟铃声混乱
    if (alarmRinging) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    // 后台/最小化时 AudioContext 可能仍处于 suspended，响铃前再强制 resume 一次
    try {
        if (ctx.state === 'suspended') {
            const r = ctx.resume();
            if (r && typeof r.then === 'function') r.catch(() => {});
        }
    } catch (e) { console.warn('恢复音频上下文失败:', e.message); }
    alarmRinging = true;
    currentAlarmSound = soundType || 'default';
    const soundFn = ALARM_SOUNDS[currentAlarmSound] || ALARM_SOUNDS.default;
    const tick = () => {
        if (!alarmRinging) return;
        // 每次 tick 再兜底 resume：窗口刚从托盘恢复时可能需要补一次
        try {
            if (ctx.state === 'suspended') {
                const r = ctx.resume();
                if (r && typeof r.then === 'function') r.catch(() => {});
            }
        } catch (e) { console.warn('恢复音频上下文失败:', e.message); }
        const interval = soundFn(ctx);
        alarmOscTimer = setTimeout(tick, interval);
    };
    tick();
}

function stopAlarmSound() {
    alarmRinging = false;
    if (alarmOscTimer) { clearTimeout(alarmOscTimer); alarmOscTimer = null; }
}

// 用户首次交互后激活音频上下文
document.addEventListener('click', () => ensureAudioCtx(), { once: true });
// 窗口从隐藏/最小化恢复时，主动 resume AudioContext，避免闹钟触发时处于挂起态
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureAudioCtx();
});

/* ==================== 倒计时模块 ==================== */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52
let timerTotalSec = 0;       // 设定总秒数
let timerRemainSec = 0;      // 剩余秒数
let timerRunning = false;
let timerInterval = null;
let timerEndTs = 0;          // 目标结束时间戳（用时间戳法，防休眠漂移）

function formatHMS(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function updateTimerDisplay() {
    timerDisplay.textContent = formatHMS(timerRemainSec);
    // 进度环
    if (timerTotalSec > 0) {
        const progress = timerRemainSec / timerTotalSec;
        const offset = RING_CIRCUMFERENCE * (1 - progress);
        timerRingFg.style.strokeDashoffset = offset;
    } else {
        timerRingFg.style.strokeDashoffset = RING_CIRCUMFERENCE;
    }
}

function timerTick() {
    const now = Date.now();
    const remain = Math.max(0, Math.round((timerEndTs - now) / 1000));
    if (remain !== timerRemainSec) {
        timerRemainSec = remain;
        updateTimerDisplay();
    }
    if (timerRemainSec <= 0) {
        stopTimer();
        onTimerFinished();
    }
}

function startTimer() {
    if (timerRunning) return;
    if (timerRemainSec <= 0) {
        const h = Math.max(0, parseInt(timerH.value, 10) || 0);
        const m = Math.max(0, parseInt(timerM.value, 10) || 0);
        const s = Math.max(0, parseInt(timerS.value, 10) || 0);
        timerTotalSec = h * 3600 + m * 60 + s;
        if (timerTotalSec <= 0) return;
        timerRemainSec = timerTotalSec;
    }
    timerEndTs = Date.now() + timerRemainSec * 1000;
    timerRunning = true;
    timerInterval = setInterval(timerTick, 250); // 250ms 精度
    timerTick();
    timerStartBtn.disabled = true;
    timerPauseBtn.disabled = false;
    [timerH, timerM, timerS].forEach(i => i.disabled = true);
}

function pauseTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    timerStartBtn.disabled = false;
    timerPauseBtn.disabled = true;
    timerStartBtn.textContent = '▶ 继续';
}

function stopTimer() {
    timerRunning = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerStartBtn.disabled = false;
    timerPauseBtn.disabled = true;
    timerStartBtn.textContent = '▶ 开始';
    [timerH, timerM, timerS].forEach(i => i.disabled = false);
}

function resetTimer() {
    stopTimer();
    stopAlarmSound();
    timerDisplay.classList.remove('ringing');
    timerTotalSec = 0;
    timerRemainSec = 0;
    updateTimerDisplay();
    timerStartBtn.textContent = '▶ 开始';
}

function onTimerFinished() {
    timerDisplay.classList.add('ringing');
    const sound = timerSound.value || 'default';
    const label = timerLabel.value.trim();
    startAlarmSound(sound);
    timerStartBtn.textContent = '🔔 响铃中';
    // 尝试系统通知
    try {
        new Notification('倒计时结束', { body: label || '你的倒计时已完成！', silent: true });
    } catch (e) { console.warn('发送倒计时通知失败:', e.message); }
    alarmStopBtn.disabled = false;
    // 窗口隐藏/最小化时唤起主窗口，确保用户能听到倒计时结束铃声
    if (document.hidden && window.api && typeof window.api.showWindowForAlarm === 'function') {
        try { window.api.showWindowForAlarm(); } catch (e) { console.warn('唤起主窗口失败:', e.message); }
    }
}

timerStartBtn.addEventListener('click', startTimer);
timerPauseBtn.addEventListener('click', pauseTimer);
timerResetBtn.addEventListener('click', resetTimer);

/* ==================== 定时闹钟模块 ==================== */
let alarms = []; // { id, h, m, s, enabled, triggered }

function loadAlarms() {
    try {
        const raw = localStorage.getItem('alarms');
        // 修复：原实现 alarms = JSON.parse(raw) || []，若 raw 为 "{}" 则
        // JSON.parse 返回 {}（truthy），|| [] 不生效，alarms.sort 等会抛 TypeError
        if (raw) {
            const parsed = JSON.parse(raw);
            alarms = Array.isArray(parsed) ? parsed : [];
        }
    } catch (_) { alarms = []; }
}

function saveAlarms() {
    try { localStorage.setItem('alarms', JSON.stringify(alarms)); } catch (e) { console.error('保存闹钟失败:', e.message); }
}

function addAlarm() {
    const h = Math.max(0, Math.min(23, parseInt(alarmH.value, 10) || 0));
    const m = Math.max(0, Math.min(59, parseInt(alarmM.value, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(alarmS.value, 10) || 0));
    const label = alarmLabel.value.trim();
    const sound = alarmSound.value || 'default';
    const alarm = { id: genId(), h, m, s, enabled: true, triggered: false, label, sound };
    alarms.push(alarm);
    saveAlarms();
    renderAlarmList();
    // 添加后清空文字说明
    alarmLabel.value = '';
}

function deleteAlarm(id) {
    alarms = alarms.filter(a => a.id !== id);
    saveAlarms();
    renderAlarmList();
}

function toggleAlarm(id) {
    const a = alarms.find(x => x.id === id);
    if (a) {
        a.enabled = !a.enabled;
        a.triggered = false;
        saveAlarms();
        renderAlarmList();
    }
}

function renderAlarmList() {
    alarmCount.textContent = alarms.length;
    if (alarms.length === 0) {
        alarmList.innerHTML = '<div style="text-align:center;color:var(--text-4);padding:20px;font-size:12px">暂无闹钟，请在上方设置</div>';
        return;
    }
    // 按时间排序
    alarms.sort((a, b) => (a.h * 3600 + a.m * 60 + a.s) - (b.h * 3600 + b.m * 60 + b.s));
    const frag = document.createDocumentFragment();
    alarms.forEach(a => {
        const isRinging = a.enabled && a.triggered;
        const div = document.createElement('div');
        div.className = 'alarm-list-item' + (isRinging ? ' ringing' : '');
        div.dataset.id = a.id;
        // 计算距离触发还有多久
        let info = '';
        if (a.enabled && !a.triggered) {
            const now = new Date();
            const target = new Date(now);
            target.setHours(a.h, a.m, a.s, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
            const diff = Math.round((target - now) / 1000);
            if (diff < 60) info = `${diff}秒后响铃`;
            else if (diff < 3600) info = `${Math.floor(diff / 60)}分钟后响铃`;
            else info = `${Math.floor(diff / 3600)}小时${Math.floor((diff % 3600) / 60)}分后响铃`;
        } else if (isRinging) {
            info = '🔔 正在响铃';
        } else {
            info = '已关闭';
        }
        // 铃声名称映射
        const soundNames = { default: '默认叮咚', apple: '苹果风格', android: '安卓风格', nokia: '诺基亚经典', crystal: '清脆铃声', bird: '鸟鸣', electronic: '电子闹钟' };
        const soundName = escapeHtml(soundNames[a.sound] || '默认叮咚');
        // 文字说明与备注安全转义防护
        const labelHtml = a.label ? `<span style="color:var(--text-2)"> · ${escapeHtml(a.label)}</span>` : '';
        const noteHtml = a.note ? `<div style="font-size:12px;color:var(--text-3)">${escapeHtml(a.note)}</div>` : '';
        div.innerHTML = `
            <div class="alarm-item-left">
                <button class="alarm-item-toggle ${a.enabled ? 'on' : ''}" data-action="toggle"></button>
                <div>
                    <div class="alarm-item-time">${pad2(a.h)}:${pad2(a.m)}:${pad2(a.s)}${labelHtml}</div>
                    <div class="alarm-item-info">${info} · 🔔 ${soundName}</div>
                    ${noteHtml}
                </div>
            </div>
            <button class="alarm-item-delete" data-action="delete" title="删除">✕</button>
        `;
        frag.appendChild(div);
    });
    alarmList.innerHTML = '';
    alarmList.appendChild(frag);
}

// 事件委托
alarmList.addEventListener('click', (e) => {
    const item = e.target.closest('.alarm-list-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    const action = e.target.dataset.action;
    if (action === 'toggle') toggleAlarm(id);
    else if (action === 'delete') deleteAlarm(id);
});

alarmAddBtn.addEventListener('click', addAlarm);

alarmStopBtn.addEventListener('click', () => {
    stopAlarmSound();
    timerDisplay.classList.remove('ringing');
    timerStartBtn.textContent = '▶ 开始';
    // 重置所有已触发的闹钟状态（保留 lastTriggerKey 防止同秒重复响）
    alarms.forEach(a => { a.triggered = false; });
    saveAlarms();
    renderAlarmList();
    alarmStopBtn.disabled = true;
});

/* ==================== 闹钟/倒计时 tab 切换 ==================== */
document.querySelectorAll('.alarm-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const target = this.dataset.alarmTab;
        document.querySelectorAll('.alarm-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.alarm-panel').forEach(p => p.classList.remove('active'));
        if (target === 'timer') $('timerPanel').classList.add('active');
        else $('alarmPanel').classList.add('active');
    });
});

/* ==================== 闹钟调度（每秒检查） ==================== */
let lastCheckSec = -1;
// 记录上次检查的日期，跨天时重置 triggered 标志，避免昨天响过的闹钟在新一天仍显示"正在响铃"
let lastCheckDate = '';
// 闹钟"补触发窗口"（秒）：若因后台节流/系统休眠错过了整秒，允许在该窗口内补触发
// 例如设为 90 秒：1 分钟内补触发有效，避免长时间挂起后误响很久前的闹钟
const ALARM_FIRE_WINDOW_SEC = 90;
function checkAlarms() {
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    const nowSec = h * 3600 + m * 60 + s; // 当天累计秒数，用于判断是否进入触发窗口
    // 用标准 ISO 日期（YYYY-MM-DD）生成 key，避免 0-based 月份和跨年歧义导致误判
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // 跨天重置：日期变化时清除所有 triggered 标志，让闹钟能在新一天重新响铃
    // 保留 lastTriggerKey（含日期）防止当天重复触发
    if (lastCheckDate && lastCheckDate !== dateStr) {
        let changed = false;
        alarms.forEach(a => {
            if (a.triggered) { a.triggered = false; changed = true; }
        });
        if (changed) { saveAlarms(); renderAlarmList(); }
    }
    lastCheckDate = dateStr;
    // 用 lastTriggerKey 记录每个闹钟最近一次触发的时间戳（到秒），避免同秒重复触发，也支持跨天再次响铃
    let anyRinging = false;
    let windowHidden = document.hidden;
    alarms.forEach(a => {
        if (!a.enabled) return;
        // 日历闹钟：带 date 字段的仅在指定日期触发；普通闹钟：每天到点即触发
        if (a.date && a.date !== dateStr) return;
        const key = `${dateStr}-${a.h}-${a.m}-${a.s}`;
        if (a.lastTriggerKey === key) return; // 今天已触发过，跳过
        const alarmSec = a.h * 3600 + a.m * 60 + (a.s || 0);
        // 触发条件：当前时间到达闹钟时间，且在补触发窗口内
        // （原实现要求精确到秒匹配，窗口最小化/休眠时定时器被节流会直接错过整秒导致永不响铃）
        if (nowSec >= alarmSec && (nowSec - alarmSec) <= ALARM_FIRE_WINDOW_SEC) {
            a.triggered = true;
            a.lastTriggerKey = key;
            anyRinging = true;
        }
    });
    if (anyRinging) {
        // 找到正在响铃的闹钟，使用它的铃声
        const ringingAlarm = alarms.find(a => a.enabled && a.triggered);
        startAlarmSound(ringingAlarm ? ringingAlarm.sound : 'default');
        saveAlarms();
        renderAlarmList();
        alarmStopBtn.disabled = false;
        try {
            const label = ringingAlarm && ringingAlarm.label ? ringingAlarm.label : '';
            new Notification('闹钟响铃', { body: `${pad2(h)}:${pad2(m)}:${pad2(s)}${label ? ' · ' + label : ''}`, silent: true });
        } catch (e) { console.warn('发送闹钟通知失败:', e.message); }
        // 窗口处于隐藏/最小化（托盘）时，响铃同时把主窗口唤起，确保用户能听到并看到
        if (windowHidden && window.api && typeof window.api.showWindowForAlarm === 'function') {
            try { window.api.showWindowForAlarm(); } catch (e) { console.warn('唤起主窗口失败:', e.message); }
        }
    }
    // 每秒刷新闹钟列表中的倒计时显示（仅当秒变化时）
    if (s !== lastCheckSec) {
        lastCheckSec = s;
        if (!anyRinging && alarms.some(a => a.enabled && !a.triggered)) {
            renderAlarmListInfoOnly();
        }
    }
}

// 只刷新 info 文字，不重建整个 DOM（避免点击 toggle 时被重置）
function renderAlarmListInfoOnly() {
    const items = alarmList.querySelectorAll('.alarm-list-item');
    items.forEach(item => {
        const id = Number(item.dataset.id);
        const a = alarms.find(x => x.id === id);
        if (!a) return;
        const infoEl = item.querySelector('.alarm-item-info');
        if (!infoEl) return;
        if (a.enabled && !a.triggered) {
            const now = new Date();
            const target = new Date(now);
            target.setHours(a.h, a.m, a.s, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
            const diff = Math.round((target - now) / 1000);
            if (diff < 60) infoEl.textContent = `${diff}秒后响铃`;
            else if (diff < 3600) infoEl.textContent = `${Math.floor(diff / 60)}分钟后响铃`;
            else infoEl.textContent = `${Math.floor(diff / 3600)}小时${Math.floor((diff % 3600) / 60)}分后响铃`;
        }
    });
}

/* ==================== 启动时统一加载所有 AI 配置 ====================
 * 打开软件后自动识别 AI 聊天/图片视频生成信息的 API 地址、API Key、模型信息，
 * 填充到表单与运行时缓存，无需手动进入设置点保存即可直接使用。
 * 主进程本就从磁盘读取配置（loadSettings），此处补齐渲染进程侧的表单与缓存初始化，
 * 同时让"打开设置面板"时表单不再为空，避免用户误以为配置丢失而重复保存。
 * 各段独立 try/catch：任一模块加载失败不影响其他模块与主流程。
 * ================================================================== */
async function loadAllAiConfigsToForm() {
    // 1. AI 聊天配置
    try {
        const cfg = await window.api.loadAIConfig();
        if (aiBaseUrl) aiBaseUrl.value = cfg.baseUrl || '';
        if (aiApiKey) aiApiKey.value = cfg.apiKey || '';  // 掩码占位，保存时后端会保留旧密钥
        if (aiModelInput) aiModelInput.value = cfg.model || '';
        if (aiTemperature) aiTemperature.value = cfg.temperature ?? 1;
        if (tempValue) tempValue.textContent = (cfg.temperature ?? 1).toFixed(1);
        if (aiPrompt) aiPrompt.value = cfg.prompt || '';
    } catch (e) {
        console.error('启动加载 AI 聊天配置失败:', e.message);
    }
    // 2. 图片/视频生成配置（同时刷新创作页模型下拉框标签）
    try {
        const imgCfg = await window.api.loadImageConfig();
        applyImageConfigToForm(imgCfg);
    } catch (e) {
        console.error('启动加载图片/视频配置失败:', e.message);
    }
}

/* ==================== 初始化 ==================== */
async function initAppSettings() {
    await loadNotesFromDisk();
    await loadSettingsFromDisk();

    if (selectedColor) {
        winEl.style.background = selectedColor;
    }

    applyDetailFontSize(detailFontSize);
    if (fontSizeSlider) fontSizeSlider.value = detailFontSize;
    if (fontSizeValue) fontSizeValue.textContent = detailFontSize + 'px';

    try {
        const savedSize = await window.api.loadCustomSize();
        if (savedSize) createSize.value = savedSize;
    } catch (e) { console.warn('读取自定义尺寸失败:', e.message); }
}

async function initWindowProps() {
    try {
        const pinned = await window.api.getPinState();
        pinBtn.classList.toggle('active', pinned);
        pinBtn.title = pinned ? '取消置顶' : '窗口置顶';
    } catch (e) { console.warn('读取置顶状态失败:', e.message); }
    try {
        const f = await window.api.getFixedState();
        fixedBtn.classList.toggle('active', f);
        fixedBtn.title = f ? '已固定（点击解除）' : '固定窗口位置';
    } catch (e) { console.warn('读取固定状态失败:', e.message); }
    if (window.api && typeof window.api.onFixedChanged === 'function') {
        window.api.onFixedChanged(f => {
            fixedBtn.classList.toggle('active', f);
            fixedBtn.title = f ? '已固定（点击解除）' : '固定窗口位置';
        });
    }
    if (window.api && typeof window.api.onPinChanged === 'function') {
        window.api.onPinChanged(pinned => {
            pinBtn.classList.toggle('active', pinned);
            pinBtn.title = pinned ? '取消置顶' : '窗口置顶';
        });
    }
}

function initNoteUI() {
    if (notes.length === 0) { createNote(); return; }
    currentNoteId = notes[0].id;
    renderNoteList();
    renderEditor();
    renderTodoList();

    noteInput.addEventListener('input', handleContentInput);
    todoInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addTodo(); }
    });
    todoAddBtn.addEventListener('click', addTodo);
    newNoteBtn.addEventListener('click', createNote);
    noteInput.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); saveContentAndFlush(); }
    });
    if (getCurrentNote()) noteInput.focus();

    moveContentPanelTo(notesContentSlot);
    if (noteInput) {
        noteInput.removeAttribute('disabled');
        noteInput.disabled = false;
    }
}

function initChatAndAi() {
    initChatModule();
    migrateChatImagesToDisk().catch(e => console.warn('图片迁移任务异常:', e.message));
    loadAllAiConfigsToForm();
}

function initAlarmsAndClock() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    loadAlarms();
    renderAlarmList();
    updateTimerDisplay();
    updateClock();
    clockTimerId = setInterval(updateClock, 1000);
    alarmTimerId = setInterval(checkAlarms, 1000);
}

(async function init() {
    try {
        // 阶段1：并行 - 应用设置（含加载 notes 数据）+ 窗口属性（pin/fixed 状态）
        // 两者无共享依赖，并行可省一次 IPC 串行往返
        await Promise.all([
            initAppSettings(),
            initWindowProps()
        ]);
        // 阶段2：依赖阶段1 - 便签 UI 需要 notes 数组；聊天和闹钟与便签 UI 无依赖，可并行触发
        initNoteUI();
        initChatAndAi();
        initAlarmsAndClock();
    } catch (err) {
        console.error('初始化失败:', err);
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0a0a14;color:#fbbf24;padding:40px;font-family:monospace;font-size:14px;white-space:pre-wrap;overflow:auto';
        el.textContent = 'INIT ERROR: ' + (err.message || String(err)) + '\n\n' + (err.stack || '');
        document.body.appendChild(el);
    }
})();
