/* ==================== radioTab.ts ====================
 * V7.4 FM 电台渲染逻辑（P3+P4 完整实现）
 * 架构：原生 HTML5 Audio 元素播放 Icecast/Shoutcast 网络流
 *       （Howler 对流式电台支持不佳，故直接使用 Audio）。
 *       电台列表直接展示名称/国家/码率；状态栏含网络速度与填充动画。
 * IPC：window.api.radio* 系列方法（preload.js 已暴露）。
 * 搜索：200ms 防抖；收藏持久化：1.5s 防抖
 * ====================================================== */

import { debounce } from '../lib/rendererUtils.js';

// ============ 状态 ============
let stations: any[] = [];          // 当前显示的电台列表 [{name,url,favicon,country,tags,bitrate,codec,homepage}]
let topStations: any[] = [];       // 热门电台缓存（避免每次切 tab 都请求）
let favorites: any[] = [];         // 收藏电台列表
let currentIndex: number = -1;      // 当前播放索引（-1 表示无）
let currentStation: any = null;  // 当前播放的电台对象（用于收藏判断 / UI 显示）
let isPlaying: boolean = false;
let currentTab: 'hot' | 'fav' | 'search' = 'hot';     // 'hot' | 'fav' | 'search'
let audio: HTMLAudioElement | null = null;           // HTML5 Audio 实例（单例，init 中创建）
let playTimeoutId: ReturnType<typeof setTimeout> | null = null;   // 10s 播放超时计时器（未进入 playing 视为失败）
let autoNextTimeoutId: ReturnType<typeof setTimeout> | null = null; // 2s 自动切换计时器（流错误后延迟切换）
let consecutiveErrors: number = 0;  // 连续错误计数（用于"全部失败"判定）
let streamErrorHandled: boolean = false;  // 同一电台的错误处理守卫（避免 error 事件与超时/拒绝重复触发）
let inited: boolean = false;             // P6 懒加载标志：首次进入 radio tab 时才执行 init()
let searchQuery: string = '';       // 上次搜索关键词（切回 search tab 时复用）
let config: any = {};            // 持久化配置 { lastTab, lastStationUrl }
let refreshSourceIndex: number = 0;     // 刷新按钮当前数据源索引（0-4 循环切换 5 种来源）
let isRefreshing: boolean = false;       // 刷新按钮重入守卫（避免短时间内重复点击触发并发刷新）
const REFRESH_SOURCES: string[] = ['topvote', 'topclick', 'recent', 'bycountry-china', 'bycountry-hongkong'];
let netSpeedInterval: ReturnType<typeof setInterval> | null = null;    // 网络速度采样计时器（每秒更新一次）
let lastBufferedEnd: number = 0;        // 上次采样的 buffered.end 值（秒）
let lastSampleTime: number = 0;         // 上次采样的时间戳（ms）
let showFavoritesOnly: boolean = false;  // 收藏夹筛选开关：true 时仅显示已收藏的电台
let isCtrlRefreshing: boolean = false;   // 控制栏刷新按钮重入守卫
let cachedDataSource: string = '';      // topStations 缓存对应的数据源（用于检测数据源切换后清空旧缓存）

// ============ DOM 引用（在 init 中填充）============
let els: any = {};

// ============ 防抖工具 ============
// 收藏持久化防抖（1.5s，沿用项目约定）
const saveFavoritesDebounced = debounce(() => {
    if (window.api && window.api.radioSaveFavorites) {
        window.api.radioSaveFavorites(favorites).catch((e: any) => { console.warn('[Radio] 保存收藏失败:', e); reportLog('warn', ['[Radio] 保存收藏失败:', e]); });
    }
}, 1500);
// 配置持久化防抖（1.5s）
const saveConfigDebounced = debounce(() => {
    if (window.api && window.api.radioSaveConfig) {
        window.api.radioSaveConfig(config).catch((e: any) => { console.warn('[Radio] 保存配置失败:', e); reportLog('warn', ['[Radio] 保存配置失败:', e]); });
    }
}, 1500);
// 搜索防抖（200ms）
const onSearchInputDebounced = debounce((q: any) => {
    searchStations(q);
}, 200);

// ============ 工具函数 ============
function defaultStationSvg(): string {
    // 默认占位封面（内联 SVG data URL，避免额外请求）
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca8af" stroke-width="1.2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/></svg>'
    );
}

function isOnline(): boolean {
    return navigator.onLine;
}

// P6 日志聚合：将 error/warn 日志转发到主进程统一记录（preload.js 已暴露 window.api.reportLogs）
function reportLog(level: any, args: any[]): void {
    try {
        if (window.api && window.api.reportLogs) {
            const msg = Array.from(args).map((a: any) => {
                if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
                if (typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
                return String(a);
            }).join(' ');
            // 主进程 log:report 期望 { source, entries: [{level, msg, ts}] }，level 必须大写
            window.api.reportLogs({
                source: 'radio',
                entries: [{ level: String(level).toUpperCase(), msg: msg.slice(0, 2000), ts: Date.now() }]
            }).catch(() => {});  // 日志上报失败静默忽略，避免 unhandled rejection
        }
    } catch (e) { console.warn('日志上报失败:', (e as any).message); }
}

function findStationIndexByUrl(list: any[], url: string): number {
    if (!url || !Array.isArray(list)) return -1;
    for (let i = 0; i < list.length; i++) {
        if (list[i].url === url) return i;
    }
    return -1;
}

function isFavorite(station: any): boolean {
    if (!station || !station.url) return false;
    return favorites.some(f => f.url === station.url);
}

// 识别良性的 play() 拒绝：切换电台/暂停会导致上一个 play() Promise 被中断
// 这类 AbortError 不是真正的流错误，不应触发 handleStreamError（否则会误增错误计数并跳台）
function isBenignPlayRejection(err: any): boolean {
    if (!err) return false;
    const name = err && err.name;
    const msg = (err && err.message) || String(err);
    if (name === 'AbortError') return true;
    // Chromium 文案兜底
    if (/interrupted by a new load request/i.test(msg)) return true;
    if (/interrupted by a call to pause/i.test(msg)) return true;
    return false;
}

// ============ 初始化 ============
async function init(): Promise<void> {
    els = {
        statusText: document.getElementById('radioStatusText'),
        statusBar: document.getElementById('radioStatusBar'),
        netSpeed: document.getElementById('radioNetSpeed'),
        prevBtn: document.getElementById('radioPrevBtn'),
        playBtn: document.getElementById('radioPlayBtn'),
        nextBtn: document.getElementById('radioNextBtn'),
        favBtn: document.getElementById('radioFavBtn'),
        stationsContainer: document.getElementById('radioStations'),
        tabBtns: document.getElementById('radioTabBtns'),
        searchInput: document.getElementById('radioSearchInput'),
        searchBtn: document.getElementById('radioSearchBtn'),
        refreshBtn: document.getElementById('radioRefreshBtn'),
        refreshCtrlBtn: document.getElementById('radioRefreshCtrlBtn'),
        streamInfo: document.getElementById('radioStreamInfo'),
        stationCurrent: document.getElementById('radioStationCurrent')
    };

    // 创建 Audio 实例（单例）
    audio = new Audio();
    // 注意：不设置 audio.crossOrigin = 'anonymous'。绝大多数 Icecast/Shoutcast
    // 网络电台流不发送 CORS 头，设置 crossOrigin 会导致浏览器拒绝加载音频。
    audio.preload = 'none';            // 流式播放无需预载
    setupAudioEvents();

    // 加载持久化配置
    try {
        const result = await window.api.radioLoadConfig();
        if (result.success && result.config) {
            config = result.config || {};
            if (config.lastTab && ['hot', 'fav', 'search'].indexOf(config.lastTab) > -1) {
                currentTab = config.lastTab;
            }
        }
    } catch (e) {
        console.warn('[Radio] 加载配置失败:', e);
        reportLog('warn', ['[Radio] 加载配置失败:', e]);
    }

    // 加载收藏
    try {
        const result = await window.api.radioLoadFavorites();
        if (result.success && Array.isArray(result.favorites)) {
            favorites = result.favorites;
        }
    } catch (e) {
        console.warn('[Radio] 加载收藏失败:', e);
        reportLog('warn', ['[Radio] 加载收藏失败:', e]);
    }

    bindEvents();
    switchTab(currentTab);   // 会触发对应 tab 的数据加载
    updatePlayButton();
    updateFavButton();
    updateNetSpeed(0);
}

function setupAudioEvents(): void {
    if (!audio) return;
    audio.addEventListener('playing', () => {
        isPlaying = true;
        clearPlayTimeout();
        consecutiveErrors = 0;   // 成功播放，重置错误计数
        updatePlayButton();
        startNetSpeedMonitor();  // 启动网络速度采样
        setStatusBarPlaying(true);  // 状态栏填充动画启动
        const s = currentStation;
        if (s) {
            updateStatus((s.name || '未知电台') + (s.country ? ' · ' + s.country : ''));
        }
    });
    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButton();
        stopNetSpeedMonitor();   // 暂停时停止采样并显示 0 KB/s
        setStatusBarPlaying(false);
    });
    audio.addEventListener('waiting', () => {
        updateStatus('缓冲中...');
    });
    audio.addEventListener('stalled', () => {
        updateStatus('缓冲中...');
    });
    audio.addEventListener('error', (e: any) => {
        console.error('[Radio] 音频错误:', e, audio && audio.error);
        reportLog('error', ['[Radio] 音频错误:', e, audio && audio.error]);
        stopNetSpeedMonitor();
        setStatusBarPlaying(false);
        handleStreamError();
    });
    audio.addEventListener('ended', () => {
        stopNetSpeedMonitor();
        setStatusBarPlaying(false);
    });
}

function bindEvents(): void {
    // 控制按钮
    if (els.prevBtn) els.prevBtn.addEventListener('click', prevStation);
    if (els.playBtn) els.playBtn.addEventListener('click', togglePlay);
    if (els.nextBtn) els.nextBtn.addEventListener('click', nextStation);
    if (els.favBtn) els.favBtn.addEventListener('click', toggleFavFilter);
    // 控制栏刷新按钮：清空缓存并重新拉取（优先中文/香港电台）
    if (els.refreshCtrlBtn) {
        els.refreshCtrlBtn.addEventListener('click', refreshAllStations);
    }
    // Tab 切换（事件委托；刷新按钮无 data-tab，closest 返回 null 自动忽略）
    if (els.tabBtns) {
        els.tabBtns.addEventListener('click', (e: any) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            switchTab(btn.dataset.tab);
        });
    }
    // 刷新按钮：循环切换 5 种数据源重新拉取电台列表
    if (els.refreshBtn) {
        els.refreshBtn.addEventListener('click', () => {
            refreshStationsBySource();
        });
    }
    // 搜索
    if (els.searchInput) {
        els.searchInput.addEventListener('input', (e: any) => onSearchInputDebounced(e.target.value));
        els.searchInput.addEventListener('keydown', (e: any) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchStations(els.searchInput.value);
            }
        });
    }
    if (els.searchBtn) {
        els.searchBtn.addEventListener('click', () => {
            if (els.searchInput) searchStations(els.searchInput.value);
        });
    }
    // 网络状态
    window.addEventListener('online', () => {
        updateStatus('网络已恢复');
    });
    window.addEventListener('offline', () => {
        updateStatus('网络未连接');
        if (audio) audio.pause();
    });
    // 电台列表点击播放（事件委托）
    // 注意：列表项使用 data-url 作为稳定标识（收藏夹筛选开启时显示列表是 stations 的子集，
    // 用 data-index 会与 stations 数组下标错位，导致操作错误电台）
    if (els.stationsContainer) {
        els.stationsContainer.addEventListener('click', (e: any) => {
            // 先检查是否点击了操作按钮（收藏/删除）
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.stopPropagation();
                const item = actionBtn.closest('.radio-item');
                if (!item) return;
                const url = item.dataset.url;
                const idx = findStationIndexByUrl(stations, url);
                if (idx < 0) return;
                const action = actionBtn.dataset.action;
                if (action === 'fav') {
                    toggleFavoriteStation(stations[idx]);
                } else if (action === 'delete') {
                    deleteStation(idx);
                }
                return;
            }
            // 否则视为点击列表项 → 播放该电台
            const item = e.target.closest('.radio-item');
            if (!item) return;
            const url = item.dataset.url;
            const idx = findStationIndexByUrl(stations, url);
            if (idx >= 0) playStation(idx);
        });
    }
}

// ============ 加载电台列表 ============
async function loadStations(): Promise<void> {
    if (!isOnline()) {
        updateStatus('网络未连接');
        return;
    }
    // 数据源分流：cnhk-music 走独立 IPC（精选 + RadioBrowser 筛选）
    if (config.apiBaseUrl === 'cnhk-music') {
        return loadCnHkMusicStations();
    }
    // 数据源切换检测：若缓存来自其他数据源，清空旧缓存
    const currentSource = config.apiBaseUrl || 'default';
    if (cachedDataSource && cachedDataSource !== currentSource) {
        topStations = [];
    }
    cachedDataSource = currentSource;
    // 复用缓存：避免每次切换到 hot tab 都请求 API
    if (topStations.length === 0) {
        updateStatus('加载电台列表...');
        try {
            const result = await window.api.radioGetTopStations(100);
            if (result.success && Array.isArray(result.stations)) {
                topStations = result.stations;
            } else {
                handleError('电台列表加载失败');
                return;
            }
        } catch (e) {
            console.error('[Radio] 加载电台列表失败:', e);
            reportLog('error', ['[Radio] 加载电台列表失败:', e]);
            handleError('电台列表加载失败');
            return;
        }
    }
    stations = topStations;
    consecutiveErrors = 0;   // 新列表加载成功，重置错误计数
    renderStations(getDisplayStations());
    // 尝试定位上次播放的电台（仅高亮，不自动播放 —— 受浏览器自动播放策略限制）
    if (config.lastStationUrl) {
        const idx = findStationIndexByUrl(stations, config.lastStationUrl);
        if (idx >= 0) {
            currentIndex = idx;
            currentStation = stations[idx];
            updateFavButton();
            updateStreamInfo(currentStation);
            updateStationDisplay();
            updateStatus((currentStation.name || '未知电台') + ' · 点击播放');
            renderStations(getDisplayStations());
            return;
        }
        // lastStationUrl 在新列表中找不到：清理脏状态，避免 currentIndex/currentStation 错位
        currentStation = null;
        currentIndex = -1;
        updateFavButton();
        updateStreamInfo(null);
        updateStationDisplay();
    } else {
        // 无 lastStationUrl：同样清理脏状态
        currentStation = null;
        currentIndex = -1;
    }
    updateStatus(stations.length > 0 ? '请选择电台' : '暂无电台');
}

// ============ 加载中文/香港音乐电台（cnhk-music 数据源）============
// 与 loadStations 类似，但调用独立 IPC：radio:get-cnhk-music-stations
// 主进程会合并精选列表 + RadioBrowser 筛选结果（带 7 天缓存）
async function loadCnHkMusicStations(): Promise<void> {
    if (!isOnline()) {
        updateStatus('网络未连接');
        return;
    }
    // 数据源切换检测：若缓存来自其他数据源，清空旧缓存
    if (cachedDataSource && cachedDataSource !== 'cnhk-music') {
        topStations = [];
    }
    cachedDataSource = 'cnhk-music';
    // 复用 topStations 缓存变量（与 hot tab 共用，切换数据源时清空）
    if (topStations.length === 0) {
        updateStatus('加载中文/香港音乐电台...');
        try {
            const result = await window.api.radioGetCnHkMusicStations(100);
            if (result.success && Array.isArray(result.stations)) {
                topStations = result.stations;
                if (result.note) {
                    console.warn('[Radio] CN/HK 音乐电台:', result.note);
                }
            } else {
                handleError('电台列表加载失败');
                return;
            }
        } catch (e) {
            console.error('[Radio] 加载中文/香港音乐电台失败:', e);
            reportLog('error', ['[Radio] 加载中文/香港音乐电台失败:', e]);
            handleError('电台列表加载失败');
            return;
        }
    }
    stations = topStations;
    consecutiveErrors = 0;   // 新列表加载成功，重置错误计数
    renderStations(getDisplayStations());
    // 尝试定位上次播放的电台（仅高亮，不自动播放）
    if (config.lastStationUrl) {
        const idx = findStationIndexByUrl(stations, config.lastStationUrl);
        if (idx >= 0) {
            currentIndex = idx;
            currentStation = stations[idx];
            updateFavButton();
            updateStreamInfo(currentStation);
            updateStationDisplay();
            updateStatus((currentStation.name || '未知电台') + ' · 点击播放');
            renderStations(getDisplayStations());
            return;
        }
        // lastStationUrl 在新列表中找不到：清理脏状态
        currentStation = null;
        currentIndex = -1;
        updateFavButton();
        updateStreamInfo(null);
        updateStationDisplay();
    } else {
        currentStation = null;
        currentIndex = -1;
    }
    updateStatus(stations.length > 0 ? ('中文/香港音乐电台 · ' + stations.length + ' 个') : '暂无电台');
}

function loadFavoritesList(): void {
    stations = favorites.slice();
    consecutiveErrors = 0;   // 切换到收藏列表，重置错误计数
    // 重新定位当前电台索引（保持高亮）；不在列表中则清理 currentIndex
    if (currentStation) {
        const idx = findStationIndexByUrl(stations, currentStation.url);
        currentIndex = idx;   // -1 表示当前电台不在收藏列表
    } else {
        currentIndex = -1;
    }
    renderStations(getDisplayStations());
    updateStatus(stations.length > 0 ? ('收藏 ' + stations.length + ' 个电台') : '暂无收藏电台');
}

// ============ 播放控制 ============
function playStation(index: number): void {
    if (!stations || index < 0 || index >= stations.length) return;
    if (!audio) return;
    if (!isOnline()) {
        updateStatus('网络未连接');
        return;
    }
    // 清理上次的超时 / 自动切换计时器
    clearPlayTimeout();
    clearAutoNextTimeout();
    streamErrorHandled = false;   // 新电台开始播放，重置错误处理守卫

    currentIndex = index;
    const station = stations[index];
    currentStation = station;
    config.lastStationUrl = station.url;
    saveConfigDebounced();

    // 切换电台时重置网络速度采样状态（避免沿用上一电台的 buffered 基线）
    lastBufferedEnd = 0;
    lastSampleTime = 0;
    stopNetSpeedMonitor();   // 旧电台的采样计时器停止；playing 事件触发后会重新启动
    updateNetSpeed(0);

    // 更新 UI
    updateFavButton();
    updateStreamInfo(station);
    updateStationDisplay();
    updateStatus('切换中...');
    renderStations(getDisplayStations());   // 高亮当前电台

    // 设置音频源并播放
    try {
        audio.src = station.url;
        const p = audio.play();
        if (p && typeof p.then === 'function') {
            p.catch((err: any) => {
                // 良性中断（如用户快速切换电台）：不视为流错误
                if (isBenignPlayRejection(err)) {
                    console.warn('[Radio] play() 被中断（切换/暂停），已忽略:', err && err.message);
                    return;
                }
                console.warn('[Radio] 播放被拒绝:', err);
                reportLog('warn', ['[Radio] 播放被拒绝:', err]);
                handleStreamError();
            });
        }
        // 10s 超时：未进入 playing 状态视为失败
        playTimeoutId = setTimeout(() => {
            if (!isPlaying) {
                console.warn('[Radio] 播放超时（10s）:', station.url);
                reportLog('warn', ['[Radio] 播放超时（10s）:', station.url]);
                handleStreamError();
            }
        }, 10000);
    } catch (e) {
        console.error('[Radio] 播放异常:', e);
        reportLog('error', ['[Radio] 播放异常:', e]);
        handleStreamError();
    }
}

function togglePlay(): void {
    if (!audio) return;
    if (!currentStation) {
        // 未加载任何电台时，从第一个开始
        if (stations.length > 0) playStation(0);
        return;
    }
    if (isPlaying) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    } else {
        // 恢复播放：若 src 丢失则重新设置
        if (!audio.src) audio.src = currentStation.url;
        clearPlayTimeout();
        clearAutoNextTimeout();
        // 重置错误守卫：上一次播放失败的 streamErrorHandled=true 不应阻止本次恢复的错误处理
        streamErrorHandled = false;
        const p = audio.play();
        if (p && typeof p.then === 'function') {
            p.catch((err: any) => {
                // 良性中断（如用户快速切换电台/暂停）：不视为流错误
                if (isBenignPlayRejection(err)) {
                    console.warn('[Radio] 恢复 play() 被中断，已忽略:', err && err.message);
                    return;
                }
                console.warn('[Radio] 恢复播放被拒绝:', err);
                reportLog('warn', ['[Radio] 恢复播放被拒绝:', err]);
                handleStreamError();
            });
        }
        // 重新挂起 10s 超时
        playTimeoutId = setTimeout(() => {
            if (!isPlaying) {
                console.warn('[Radio] 恢复播放超时（10s）');
                reportLog('warn', ['[Radio] 恢复播放超时（10s）']);
                handleStreamError();
            }
        }, 10000);
        updateStatus('切换中...');
    }
}

function nextStation(): void {
    if (stations.length === 0) return;
    let idx = currentIndex + 1;
    if (idx >= stations.length) idx = 0;
    playStation(idx);
}

function prevStation(): void {
    if (stations.length === 0) return;
    let idx = currentIndex - 1;
    if (idx < 0) idx = stations.length - 1;
    playStation(idx);
}

function toggleFavoriteStation(station: any): void {
    if (!station || !station.url) return;
    const idx = findStationIndexByUrl(favorites, station.url);
    const wasFav = idx >= 0;
    if (wasFav) {
        favorites.splice(idx, 1);
    } else {
        favorites.push({
            name: station.name,
            url: station.url,
            favicon: station.favicon,
            country: station.country,
            tags: station.tags,
            bitrate: station.bitrate,
            codec: station.codec,
            homepage: station.homepage
        });
    }
    saveFavoritesDebounced();
    // 若当前在收藏 tab，刷新列表保持同步
    if (currentTab === 'fav') {
        // 取消收藏的是当前播放电台：停止播放（fav tab 中取消收藏 = 从收藏列表移除）
        if (wasFav && currentStation && currentStation.url === station.url) {
            if (audio) audio.pause();
            clearPlayTimeout();
            clearAutoNextTimeout();
            stopNetSpeedMonitor();
            setStatusBarPlaying(false);
            currentStation = null;
            currentIndex = -1;
            isPlaying = false;
            updatePlayButton();
            updateStreamInfo(null);
            updateStationDisplay();
        }
        stations = favorites.slice();
        // 重新定位当前电台索引（保持高亮）
        if (currentStation) {
            const newIdx = findStationIndexByUrl(stations, currentStation.url);
            currentIndex = newIdx;   // -1 表示不在列表中
        }
        renderStations(getDisplayStations());
        updateStatus(stations.length > 0 ? ('收藏 ' + stations.length + ' 个电台') : '暂无收藏电台');
    } else if (showFavoritesOnly) {
        // 收藏夹筛选开启时，取消收藏的电台应从视图消失
        renderStations(getDisplayStations());
        const favCount = stations.filter(s => isFavorite(s)).length;
        updateStatus(favCount > 0 ? ('收藏夹 · ' + favCount + ' 个电台') : '当前列表无收藏电台');
    } else {
        // 仅更新当前项的按钮 DOM，避免整列表重渲染
        updateFavButtonStates();
    }
}

// 批量更新列表中所有收藏按钮的状态（不重渲染整个列表）
function updateFavButtonStates(): void {
    if (!els.stationsContainer) return;
    const favBtns = els.stationsContainer.querySelectorAll('[data-action="fav"]');
    favBtns.forEach((btn: any) => {
        const item = btn.closest('.radio-item');
        if (!item) return;
        const url = item.dataset.url;
        const idx = findStationIndexByUrl(stations, url);
        if (idx < 0) return;
        const fav = isFavorite(stations[idx]);
        btn.textContent = fav ? '★' : '☆';
        btn.classList.toggle('favorited', fav);
        btn.title = fav ? '取消收藏' : '添加收藏';
    });
}

// 删除电台：从当前显示列表移除
// hot tab：同步移除 topStations 缓存；fav tab：等同于取消收藏（同步移除 favorites 并持久化）
function deleteStation(index: number): void {
    if (index < 0 || index >= stations.length) return;
    const removed = stations[index];
    const wasCurrent = currentStation && removed.url === currentStation.url;
    stations.splice(index, 1);
    // hot tab 同步清理 topStations 缓存（避免切回 hot tab 时被删除项重新出现）
    if (currentTab === 'hot' && topStations.length > 0) {
        const cacheIdx = findStationIndexByUrl(topStations, removed.url);
        if (cacheIdx >= 0) topStations.splice(cacheIdx, 1);
    }
    // fav tab 同步清理 favorites 持久化数据（fav tab 的 stations 即 favorites 切片，
    // 删除即视为取消收藏，否则切回 fav tab 时被删除项会重新出现）
    if (currentTab === 'fav') {
        const favIdx = findStationIndexByUrl(favorites, removed.url);
        if (favIdx >= 0) {
            favorites.splice(favIdx, 1);
            saveFavoritesDebounced();
        }
    }
    // 修正 currentIndex 与 currentStation
    if (wasCurrent) {
        // 删除的是当前播放电台：停止播放而非自动播放下一首（避免误播）
        if (audio) audio.pause();
        clearPlayTimeout();
        clearAutoNextTimeout();
        stopNetSpeedMonitor();
        setStatusBarPlaying(false);
        currentStation = null;
        currentIndex = -1;
        isPlaying = false;
        updatePlayButton();
        updateFavButton();
        updateStreamInfo(null);
        updateStationDisplay();
        // 清掉 lastStationUrl，避免下次启动时定位到已删除电台
        if (config.lastStationUrl === removed.url) {
            delete config.lastStationUrl;
            saveConfigDebounced();
        }
        updateStatus(stations.length > 0 ? '已停止 · 列表剩余 ' + stations.length + ' 个' : '列表已空');
    } else if (index < currentIndex) {
        // 删除项位于当前播放项之前：currentIndex 前移
        currentIndex--;
    }
    renderStations(getDisplayStations());
}

// 收藏夹筛选：点击顶部 ☆ 按钮切换"仅显示收藏"模式
function toggleFavFilter(): void {
    showFavoritesOnly = !showFavoritesOnly;
    updateFavButton();
    renderStations(getDisplayStations());
    if (showFavoritesOnly) {
        const favCount = stations.filter(s => isFavorite(s)).length;
        updateStatus(favCount > 0 ? ('收藏夹 · ' + favCount + ' 个电台') : '当前列表无收藏电台');
    } else {
        updateStatus(stations.length > 0 ? ('全部电台 · ' + stations.length + ' 个') : '暂无电台');
    }
}

// 获取当前应显示的电台列表（应用收藏夹筛选）
function getDisplayStations(): any[] {
    if (showFavoritesOnly) {
        return stations.filter(s => isFavorite(s));
    }
    return stations;
}

// ============ 错误处理 ============
function handleStreamError(): void {
    // 守卫：同一电台的错误只处理一次（audio.error 事件、play() Promise 拒绝、
    // 10s 超时可能两两触发，重复处理会导致 consecutiveErrors 翻倍并误跳电台）
    if (streamErrorHandled) return;
    streamErrorHandled = true;

    clearPlayTimeout();
    stopNetSpeedMonitor();      // 错误发生时停止速度采样
    setStatusBarPlaying(false); // 状态栏填充动画停止
    if (!isOnline()) {
        isPlaying = false;
        updatePlayButton();
        updateStatus('网络未连接');
        return;
    }
    consecutiveErrors++;
    // 连续错误数达到电台列表长度 → 全部失败
    if (stations.length > 0 && consecutiveErrors >= stations.length) {
        updateStatus('所有电台无法连接');
        isPlaying = false;
        updatePlayButton();
        consecutiveErrors = 0;
        return;
    }
    // 2s 后自动切换到下一个电台（仅当列表 >1 时）
    clearAutoNextTimeout();
    if (stations.length > 1) {
        updateStatus('切换中...');
        autoNextTimeoutId = setTimeout(() => {
            nextStation();
        }, 2000);
    } else {
        updateStatus('电台无法连接');
        isPlaying = false;
        updatePlayButton();
    }
}

function handleError(msg: string): void {
    // API 调用失败：显示错误但保留已渲染的列表（若有）
    updateStatus(msg);
    console.warn('[Radio]', msg);
    reportLog('warn', ['[Radio]', msg]);
}

function clearPlayTimeout(): void {
    if (playTimeoutId) {
        clearTimeout(playTimeoutId);
        playTimeoutId = null;
    }
}

function clearAutoNextTimeout(): void {
    if (autoNextTimeoutId) {
        clearTimeout(autoNextTimeoutId);
        autoNextTimeoutId = null;
    }
}

// ============ 渲染电台列表 ============
function renderStations(list: any[]): void {
    if (!els.stationsContainer) return;
    // 清空时用 removeChild 比 innerHTML='' 更稳妥（避免个别引擎的副作用）
    while (els.stationsContainer.firstChild) {
        els.stationsContainer.removeChild(els.stationsContainer.firstChild);
    }
    if (!list || list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'radio-empty';
        if (showFavoritesOnly && currentTab !== 'fav') {
            empty.textContent = '当前列表无收藏电台';
        } else {
            empty.textContent = currentTab === 'fav' ? '暂无收藏电台' : '暂无电台';
        }
        els.stationsContainer.appendChild(empty);
        return;
    }
    const frag = document.createDocumentFragment();
    const currentUrl = currentStation ? currentStation.url : '';
    for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const item = document.createElement('div');
        item.className = 'radio-item' + (s.url === currentUrl ? ' playing' : '');
        // 使用 data-url 作为稳定标识（避免筛选/排序后索引错位）
        item.dataset.url = s.url || '';
        item.dataset.index = String(i);   // 仅用于无障碍/调试，业务逻辑不依赖

        const icon = document.createElement('img');
        icon.className = 'radio-item-icon';
        icon.src = s.favicon || defaultStationSvg();
        icon.alt = '';
        icon.loading = 'lazy';
        icon.onerror = () => { icon.src = defaultStationSvg(); };

        const info = document.createElement('div');
        info.className = 'radio-item-info';
        const name = document.createElement('div');
        name.className = 'radio-item-name';
        name.textContent = s.name || '未知电台';
        const meta = document.createElement('div');
        meta.className = 'radio-item-meta';
        const bits: string[] = [];
        if (s.country) bits.push(s.country);
        if (s.bitrate) bits.push(s.bitrate + 'kbps');
        meta.textContent = bits.join(' · ');
        info.appendChild(name);
        info.appendChild(meta);

        // 收藏按钮（☆/★）
        const favBtn = document.createElement('button');
        favBtn.className = 'radio-item-fav';
        favBtn.dataset.action = 'fav';
        const fav = isFavorite(s);
        favBtn.textContent = fav ? '★' : '☆';
        if (fav) favBtn.classList.add('favorited');
        favBtn.title = fav ? '取消收藏' : '添加收藏';
        favBtn.setAttribute('aria-label', fav ? '取消收藏' : '添加收藏');

        // 删除按钮（✕）
        const delBtn = document.createElement('button');
        delBtn.className = 'radio-item-delete';
        delBtn.dataset.action = 'delete';
        delBtn.textContent = '✕';
        delBtn.title = '从列表删除';
        delBtn.setAttribute('aria-label', '从列表删除');

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(favBtn);
        item.appendChild(delBtn);
        frag.appendChild(item);
    }
    els.stationsContainer.appendChild(frag);
}

// ============ Tab 切换 ============
function switchTab(tabName: any): void {
    if (['hot', 'fav', 'search'].indexOf(tabName) < 0) return;
    currentTab = tabName;
    config.lastTab = tabName;
    saveConfigDebounced();
    // 切换 tab 意味着电台列表更换，重置连续错误计数（避免旧列表的错误影响新列表的"全部失败"判定）
    consecutiveErrors = 0;
    clearAutoNextTimeout();   // 取消旧列表遗留的自动切换计时器
    // 更新按钮高亮
    if (els.tabBtns) {
        const btns = els.tabBtns.querySelectorAll('[data-tab]');
        btns.forEach((b: any) => {
            if (b.dataset.tab === tabName) b.classList.add('active');
            else b.classList.remove('active');
        });
    }
    // 搜索框仅 search tab 显示
    if (els.searchInput) {
        els.searchInput.style.display = (tabName === 'search') ? '' : 'none';
    }
    if (els.searchBtn) {
        els.searchBtn.style.display = (tabName === 'search') ? '' : 'none';
    }
    // 加载对应数据
    if (tabName === 'hot') {
        loadStations();
    } else if (tabName === 'fav') {
        loadFavoritesList();
    } else {
        // search tab：复用上次结果，无则显示空提示
        if (searchQuery) {
            searchStations(searchQuery);
        } else {
            stations = [];
            renderStations(getDisplayStations());
            updateStatus('输入关键词搜索电台');
        }
    }
}

// ============ 搜索 ============
async function searchStations(query: any): Promise<void> {
    const q = (query || '').trim();
    searchQuery = q;
    if (!q) {
        stations = [];
        renderStations(getDisplayStations());
        updateStatus('请输入搜索关键词');
        return;
    }
    if (!isOnline()) {
        updateStatus('网络未连接');
        return;
    }
    updateStatus('搜索中...');
    try {
        const result = await window.api.radioSearch({ keyword: q, limit: 100 });
        if (result.success && Array.isArray(result.stations)) {
            stations = result.stations;
            consecutiveErrors = 0;   // 搜索结果返回，重置错误计数
            renderStations(getDisplayStations());
            updateStatus('找到 ' + stations.length + ' 个电台');
        } else {
            // 失败时保留之前的列表
            updateStatus('搜索失败');
        }
    } catch (e) {
        console.error('[Radio] 搜索失败:', e);
        reportLog('error', ['[Radio] 搜索失败:', e]);
        handleError('搜索失败');
    }
}

// ============ UI 更新 ============
function updatePlayButton(): void {
    if (!els.playBtn) return;
    els.playBtn.textContent = isPlaying ? '⏸' : '▶';
    els.playBtn.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
}

function updateFavButton(): void {
    if (!els.favBtn) return;
    // 顶部 ☆ 按钮现为收藏夹筛选开关：显示筛选状态而非当前电台收藏状态
    els.favBtn.textContent = showFavoritesOnly ? '★' : '☆';
    els.favBtn.classList.toggle('active', showFavoritesOnly);
    els.favBtn.setAttribute('aria-pressed', String(showFavoritesOnly));
    els.favBtn.title = showFavoritesOnly ? '显示全部电台' : '只显示已收藏电台';
}

function updateStatus(msg: string): void {
    // radioStatusText：动态状态文本（电台名/国家、缓冲中、错误等）
    if (els.statusText) els.statusText.textContent = msg;
}

function updateStationDisplay(): void {
    // radioStationCurrent：状态栏中当前电台名（持久显示）
    if (!els.stationCurrent) return;
    if (currentStation) {
        els.stationCurrent.textContent = currentStation.name || '未知电台';
    } else {
        els.stationCurrent.textContent = '—';
    }
}

function updateStreamInfo(station: any): void {
    if (!els.streamInfo) return;
    if (!station) {
        els.streamInfo.textContent = '';
        return;
    }
    const bits: string[] = [];
    if (station.bitrate) bits.push(station.bitrate + 'kbps');
    if (station.codec) bits.push(station.codec);
    els.streamInfo.textContent = bits.join(' · ');
}

// ============ 网络速度监测 ============
function updateNetSpeed(kbps: any): void {
    // kbps: 估算的 KB/s 值（已折算）。格式：< 1 显示 "0 KB/s"，>=1024 显示 "X.X MB/s"
    if (!els.netSpeed) return;
    const v = Math.max(0, Number(kbps) || 0);
    let text;
    if (v < 1) {
        text = '0 KB/s';
    } else if (v >= 1024) {
        text = (v / 1024).toFixed(1) + ' MB/s';
    } else {
        text = Math.round(v) + ' KB/s';
    }
    els.netSpeed.textContent = text;
}

function startNetSpeedMonitor(): void {
    // 启动每秒采样 buffered.end 增量，结合电台码率估算下载速度
    stopNetSpeedMonitor();   // 防止重复启动
    // 重置采样基线：避免沿用上一电台（或暂停期间）的 buffered/time 戳，
    // 导致恢复播放后第一次采样计算出虚假的瞬时高速
    lastBufferedEnd = 0;
    lastSampleTime = 0;
    netSpeedInterval = setInterval(() => {
        try {
            if (!audio || !audio.buffered || audio.buffered.length === 0) return;
            const currentBufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const now = Date.now();
            const dt = (now - lastSampleTime) / 1000;   // 秒
            if (dt > 0 && lastSampleTime > 0) {
                const bufferedDelta = currentBufferedEnd - lastBufferedEnd;   // 秒音频
                // 估算 KB/s：bufferedDelta(秒) * (bitrate kbps / 8) = KB；再除以 dt
                const bitrate = (currentStation && currentStation.bitrate) || 128;
                const kbps = (bufferedDelta * bitrate) / 8 / dt;   // KB/s
                const displaySpeed = Math.max(0, Math.round(kbps));
                updateNetSpeed(displaySpeed);
            }
            lastBufferedEnd = currentBufferedEnd;
            lastSampleTime = now;
        } catch (e) { console.warn('获取缓冲进度失败:', (e as any).message); }
    }, 1000);
}

function stopNetSpeedMonitor(): void {
    if (netSpeedInterval) {
        clearInterval(netSpeedInterval);
        netSpeedInterval = null;
    }
    updateNetSpeed(0);   // 停止采样时显示 0 KB/s
}

// ============ 状态栏填充动画 ============
function setStatusBarPlaying(playing: boolean): void {
    if (!els.statusBar) return;
    if (playing) {
        els.statusBar.classList.add('playing');
    } else {
        els.statusBar.classList.remove('playing');
    }
}

// ============ 控制栏刷新按钮：清空缓存重新拉取（优先中文/香港电台）============
async function refreshAllStations(): Promise<void> {
    if (isCtrlRefreshing) return;
    isCtrlRefreshing = true;
    if (els.refreshCtrlBtn) {
        els.refreshCtrlBtn.disabled = true;
        els.refreshCtrlBtn.classList.remove('spinning');
        void els.refreshCtrlBtn.offsetWidth;   // 强制 reflow 重启动画
        els.refreshCtrlBtn.classList.add('spinning');
    }
    try {
        if (!isOnline()) {
            updateStatus('网络未连接');
            return;
        }
        // 重新加载配置（用户可能在设置页切换了数据源）
        try {
            const result = await window.api.radioLoadConfig();
            if (result.success && result.config) {
                const prevApiBaseUrl = config.apiBaseUrl;
                config = Object.assign({}, config, result.config);
                // 数据源变更时清空缓存，确保加载新数据源的电台
                if (prevApiBaseUrl !== config.apiBaseUrl) {
                    topStations = [];
                }
            }
        } catch (e) {
            console.warn('[Radio] 刷新时加载配置失败:', e);
        }
        // 非 hot tab：仅同步 UI 状态（避免 switchTab 触发 loadStations 与下方 await 形成竞态）
        if (currentTab !== 'hot') {
            currentTab = 'hot';
            config.lastTab = 'hot';
            saveConfigDebounced();
            consecutiveErrors = 0;
            clearAutoNextTimeout();
            // 更新 tab 按钮高亮
            if (els.tabBtns) {
                const btns = els.tabBtns.querySelectorAll('[data-tab]');
                btns.forEach((b: any) => b.classList.toggle('active', b.dataset.tab === 'hot'));
            }
            // 隐藏搜索框
            if (els.searchInput) els.searchInput.style.display = 'none';
            if (els.searchBtn) els.searchBtn.style.display = 'none';
        }
        // 清空热门缓存，强制重新拉取
        topStations = [];
        updateStatus(config.apiBaseUrl === 'cnhk-music' ? '刷新中（中文/香港音乐电台）...' : '刷新中（优先中文/香港电台）...');
        await loadStations();
    } catch (e) {
        console.error('[Radio] 控制栏刷新失败:', e);
        reportLog('error', ['[Radio] 控制栏刷新失败:', e]);
        handleError('刷新失败');
    } finally {
        if (els.refreshCtrlBtn) {
            els.refreshCtrlBtn.classList.remove('spinning');
            els.refreshCtrlBtn.disabled = false;
        }
        isCtrlRefreshing = false;
    }
}

// ============ 刷新按钮：循环数据源 ============
// 注意：此按钮用于在 RadioBrowser 数据源下循环切换 5 种子来源
// 若当前是 cnhk-music 数据源，则直接调用 loadCnHkMusicStations 刷新（不循环切换）
async function refreshStationsBySource(): Promise<void> {
    // 重入守卫：避免短时间内重复点击触发并发刷新
    if (isRefreshing) return;
    isRefreshing = true;
    if (els.refreshBtn) els.refreshBtn.disabled = true;

    try {
        // 非 hot tab：仅同步 UI 状态（避免 switchTab 触发 loadStations 与下方 await 形成竞态）
        if (currentTab !== 'hot') {
            currentTab = 'hot';
            config.lastTab = 'hot';
            saveConfigDebounced();
            consecutiveErrors = 0;
            clearAutoNextTimeout();
            if (els.tabBtns) {
                const btns = els.tabBtns.querySelectorAll('[data-tab]');
                btns.forEach((b: any) => b.classList.toggle('active', b.dataset.tab === 'hot'));
            }
            if (els.searchInput) els.searchInput.style.display = 'none';
            if (els.searchBtn) els.searchBtn.style.display = 'none';
        }
        if (!isOnline()) {
            updateStatus('网络未连接');
            return;
        }
        // 旋转图标动画（infinite，由 finally 负责移除）
        if (els.refreshBtn) {
            els.refreshBtn.classList.remove('spinning');
            // 强制 reflow 以重启动画
            void els.refreshBtn.offsetWidth;
            els.refreshBtn.classList.add('spinning');
        }
        // cnhk-music 数据源：清空缓存重新加载精选 + RadioBrowser 筛选
        if (config.apiBaseUrl === 'cnhk-music') {
            topStations = [];
            cachedDataSource = '';
            updateStatus('刷新中文/香港音乐电台...');
            await loadCnHkMusicStations();
            return;
        }
        // RadioBrowser 数据源：递增索引（mod 5），循环切换 5 种子来源
        refreshSourceIndex = (refreshSourceIndex + 1) % REFRESH_SOURCES.length;
        const source = REFRESH_SOURCES[refreshSourceIndex];
        const sourceLabels: any = {
            'topvote': '热门投票',
            'topclick': '热门收听',
            'recent': '最近播放',
            'bycountry-china': '中国大陆',
            'bycountry-hongkong': '香港'
        };
        updateStatus('刷新电台列表（' + (sourceLabels[source] || source) + '）...');
        const result = await window.api.radioGetStationsBySource({ source: source, limit: 100 });
        if (result.success && Array.isArray(result.stations)) {
            stations = result.stations;
            // 刷新后重新定位当前电台索引（保持高亮，避免列表顺序变化导致索引错位）
            if (currentStation) {
                const newIdx = findStationIndexByUrl(stations, currentStation.url);
                currentIndex = newIdx;   // -1 表示当前电台不在新列表中
            } else {
                currentIndex = -1;
            }
            topStations = stations.slice();   // 同步缓存，避免切回 hot tab 重新加载旧列表
            cachedDataSource = config.apiBaseUrl || 'default';
            consecutiveErrors = 0;   // 新列表加载成功，重置错误计数
            renderStations(getDisplayStations());
            updateStatus('已刷新 · ' + (sourceLabels[source] || source) + ' · ' + stations.length + ' 个电台');
        } else {
            handleError('刷新失败');
        }
    } catch (e) {
        console.error('[Radio] 刷新电台列表失败:', e);
        reportLog('error', ['[Radio] 刷新电台列表失败:', e]);
        handleError('刷新失败');
    } finally {
        // 无论成功/失败，都移除旋转动画并恢复按钮状态
        if (els.refreshBtn) {
            els.refreshBtn.classList.remove('spinning');
            els.refreshBtn.disabled = false;
        }
        isRefreshing = false;
    }
}

// ============ 导出模块 ============
// 暴露给外部调用的方法（供 renderer.ts 在 tab 切换时调用）

/**
 * 电台 tab 激活时调用（P6 懒加载：首次进入 radio tab 时才执行 init()，
 * 避免启动时即创建 Audio / 拉取电台列表）
 */
export function initRadioTab(): void {
    if (!inited) {
        inited = true;
        init().catch(e => { console.error('[Radio] init 失败:', e); inited = false; });
    }
}

/**
 * 电台 tab 离开时调用（后台播放是核心特性，无需暂停）
 */
export function onRadioTabDeactivated(): void {
    // 离开电台 tab 时无需暂停（后台播放是核心特性）
}
