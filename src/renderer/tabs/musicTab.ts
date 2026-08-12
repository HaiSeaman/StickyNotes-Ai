/* ==================== musicTab.ts ====================
 * V7.4 音乐播放器渲染逻辑（P1+P2 完整实现）
 * 架构：howler.js 作为播放内核，musicfile:// 协议加载本地音频与封面，
 *       IPC 与主进程交互（文件选择/元数据解析/播放列表持久化）。
 * 播放模式：顺序 / 随机 / 单曲循环（三态循环切换）
 * 搜索：200ms 防抖；持久化：1.5s 防抖
 * ====================================================== */

import { debounce, inferThumbPath, nextIndexInPool, prevIndexInPool } from '../lib/rendererUtils.js';
import { Howl } from 'howler';

// ============ 状态 ============
let playlist: any[] = [];           // [{filePath,title,artist,album,duration,coverPath,size,addedAt}]
let favoritesMap: Record<string, any> = {}; // { [filePath]: { filePath, title, artist, album, coverPath, duration } }
let savedFolders: string[] = [];     // 已添加的文件夹路径列表
let currentIndex: number = -1;       // 当前播放索引（-1 表示无）
let isPlaying: boolean = false;
let playMode: 'sequential' | 'shuffle' | 'single' = 'sequential';
let volume: number = 80;             // 0-100
let howl: any = null;             // Howl 实例
let searchQuery: string = '';
let shuffleHistory: number[] = [];     // 随机模式下的历史索引栈（用于"上一首"回溯）
let dragSrcIdx: number = -1;         // 拖拽排序：源索引（模块级，避免每次 render 重建闭包）
let progressTimerId: ReturnType<typeof setInterval> | null = null;  // 进度刷新定时器（4fps，替代 60fps rAF，降低 CPU）
let loadErrorCount: number = 0;      // 连续加载失败计数（防止全部损坏时 next 无限循环）
let isSeeking: boolean = false;       // 用户正在拖动进度条（拖动期间暂停写入进度，避免回跳）
let inited: boolean = false;          // P6 懒初始化标志：首次进入音乐 tab 时才执行 init()
let favoritesActive: boolean = false;           // 收藏夹播放模式开关：true 时显示与播放均限收藏曲目
let favoriteIndices: number[] = [];             // 收藏索引池：playlist 中所有 favorite === true 的索引
let pendingReturnToFavorites: boolean = false;  // 待切标志：当前在播非收藏歌，下次切歌落回收藏池
let tipTimerId: ReturnType<typeof setTimeout> | null = null; // 提示条自动隐藏定时器
let lastVolumeBeforeMute: number = 80; // 静音前的音量记忆（用于恢复）

// ============ DOM 引用（在 init 中填充）============
let els: any = {};

// ============ 日志上报（P6：仅 error/warn 转发到主进程）============
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
                source: 'music',
                entries: [{ level: String(level).toUpperCase(), msg: msg.slice(0, 2000), ts: Date.now() }]
            }).catch(() => {});  // 日志上报失败静默忽略，避免 unhandled rejection
        }
    } catch (e) { console.warn('日志上报失败:', (e as any).message); }
}

// 播放列表持久化防抖（1.5s，沿用项目约定）
const savePlaylistDebounced = debounce(() => {
    if (window.api && window.api.musicSavePlaylist) {
        window.api.musicSavePlaylist(playlist).catch((e: any) => console.warn('[Music] 保存播放列表失败:', e));
    }
}, 1500);
// 收藏持久化防抖（1.5s）
const saveFavoritesDebounced = debounce(() => {
    if (window.api && window.api.musicSaveFavorites) {
        window.api.musicSaveFavorites(favoritesMap).catch((e: any) => console.warn('[Music] 保存收藏夹失败:', e));
    }
}, 1500);
// 文件夹列表持久化防抖（1.5s）
const saveFoldersDebounced = debounce(() => {
    if (window.api && window.api.musicSaveFolders) {
        window.api.musicSaveFolders(savedFolders).catch((e: any) => console.warn('[Music] 保存文件夹列表失败:', e));
    }
}, 1500);
// 搜索防抖（200ms，沿用项目约定）
const onSearchInputDebounced = debounce((q: any) => {
    searchQuery = q.trim().toLowerCase();
    renderPlaylist();
}, 200);

// ============ 工具函数 ============
function formatTime(sec: any): string {
    if (!sec || !isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
}
function buildAudioUrl(filePath: any): string {
    return 'musicfile://audio/' + encodeURIComponent(filePath);
}
function buildCoverUrl(coverPath: any): string {
    if (!coverPath) return '';
    return 'musicfile://cover/' + encodeURIComponent(coverPath);
}
function defaultCoverSvg(): string {
    // 默认占位封面（内联 SVG data URL，避免额外请求）
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#9ca8af" stroke-width="1.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    );
}
function trackMatchesSearch(track: any): boolean {
    if (!searchQuery) return true;
    const haystack = (track.title + ' ' + track.artist + ' ' + track.album).toLowerCase();
    return haystack.includes(searchQuery);
}

// ============ 初始化 ============
async function init(): Promise<void> {
    els = {
        // 工具栏
        addFilesBtn: document.getElementById('musicAddFilesBtn'),
        addFolderBtn: document.getElementById('musicAddFolderBtn'),
        refreshFoldersBtn: document.getElementById('musicRefreshFoldersBtn'),
        clearBtn: document.getElementById('musicClearBtn'),
        searchInput: document.getElementById('musicSearchInput'),
        // 播放列表
        listContainer: document.getElementById('musicList'),
        emptyHint: document.getElementById('musicEmpty'),
        // 控制条
        coverImg: document.getElementById('musicCover'),
        trackTitle: document.getElementById('musicTrackTitle'),
        trackArtist: document.getElementById('musicTrackArtist'),
        trackFavBtn: document.getElementById('musicTrackFavBtn'),
        trackFavIconOutline: document.querySelector('#musicTrackFavBtn .icon-fav-outline'),
        trackFavIconSolid: document.querySelector('#musicTrackFavBtn .icon-fav-solid'),
        progress: document.getElementById('musicProgress'),
        progressFill: document.getElementById('musicProgressFill'),
        progressThumb: document.getElementById('musicProgressThumb'),
        currentTime: document.getElementById('musicCurrentTime'),
        totalTime: document.getElementById('musicTotalTime'),
        prevBtn: document.getElementById('musicPrevBtn'),
        playBtn: document.getElementById('musicPlayBtn'),
        playIconPlay: document.querySelector('#musicPlayBtn .icon-play'),
        playIconPause: document.querySelector('#musicPlayBtn .icon-pause'),
        nextBtn: document.getElementById('musicNextBtn'),
        modeBtn: document.getElementById('musicModeBtn'),
        favFilterBtn: document.getElementById('musicFavFilterBtn'),
        tip: document.getElementById('musicTip'),
        volumeSlider: document.getElementById('musicVolume'),
        volumeFill: document.getElementById('musicVolumeFill'),
        volIconBtn: document.getElementById('musicVolIconBtn'),
        volIconHigh: document.querySelector('#musicVolIconBtn .icon-vol-high'),
        volIconMute: document.querySelector('#musicVolIconBtn .icon-vol-mute'),
    };

    // 加载持久化播放列表、收藏夹与已添加文件夹
    try {
        const [plRes, favRes, foldRes] = await Promise.all([
            window.api.musicLoadPlaylist(),
            window.api.musicLoadFavorites(),
            window.api.musicLoadFolders()
        ]);
        if (favRes && favRes.success && favRes.favorites) {
            favoritesMap = favRes.favorites;
        }
        if (foldRes && foldRes.success && Array.isArray(foldRes.folders)) {
            savedFolders = foldRes.folders;
        }
        if (plRes && plRes.success && Array.isArray(plRes.playlist)) {
            playlist = plRes.playlist;
            // 确保播放列表中曲目的 favorite 状态与 favoritesMap 保持同步
            for (const t of playlist) {
                if (t.filePath && favoritesMap[t.filePath]) {
                    t.favorite = true;
                }
            }
            rebuildFavoriteIndices();
        }
    } catch (e) {
        console.warn('[Music] 加载数据失败:', e);
        reportLog('warn', ['[Music] 加载数据失败:', e]);
    }

    // 恢复收藏夹播放模式（轻量 localStorage，参考 music_volume）
    const savedActive = localStorage.getItem('music_favorites_active');
    favoritesActive = savedActive === '1';
    if (favoritesActive) {
        if (els.favFilterBtn) {
            els.favFilterBtn.classList.add('active');
            els.favFilterBtn.setAttribute('aria-pressed', 'true');
            els.favFilterBtn.title = '取消收藏模式';
        }
    }

    bindEvents();
    renderPlaylist();
    // 拖拽排序监听器仅在 init 中注册一次（避免每次 renderPlaylist 重复累积监听器）
    setupDragSort(els.listContainer);
    updateModeButton();
    // 恢复音量（从 localStorage 轻量存储，避免每次启动读 config）
    const savedVol = localStorage.getItem('music_volume');
    if (savedVol !== null) {
        const parsedVol = parseInt(savedVol, 10);
        volume = Number.isNaN(parsedVol) ? 80 : Math.max(0, Math.min(100, parsedVol));
    }
    if (els.volumeSlider) els.volumeSlider.value = volume;
    applyVolume();
    updateVolumeUI();  // 初始化音量填充宽度与静音图标状态
    // 后台补齐已有封面缩略图（幂等；补齐完成后重渲染列表以使用缩略图）
    if (window.api && window.api.musicEnsureThumbs) {
        window.api.musicEnsureThumbs().then((r: any) => {
            if (r && r.success && r.generated > 0) {
                renderPlaylist();
            }
        }).catch(() => {});
    }
    // 封面加载失败时清除 src，露出底层占位符（音乐符号）
    if (els.coverImg) {
        els.coverImg.onerror = () => {
            els.coverImg.removeAttribute('src');
        };
    }
}

function bindEvents(): void {
    if (els.addFilesBtn) {
        els.addFilesBtn.addEventListener('click', addFiles);
    }
    if (els.addFolderBtn) {
        els.addFolderBtn.addEventListener('click', addFolder);
    }
    if (els.refreshFoldersBtn) {
        els.refreshFoldersBtn.addEventListener('click', () => rescanSavedFolders(false));
    }
    if (els.clearBtn) {
        els.clearBtn.addEventListener('click', clearPlaylist);
    }
    if (els.searchInput) {
        els.searchInput.addEventListener('input', (e: any) => onSearchInputDebounced(e.target.value));
    }
    if (els.prevBtn) {
        els.prevBtn.addEventListener('click', prev);
    }
    if (els.playBtn) {
        els.playBtn.addEventListener('click', togglePlay);
    }
    if (els.nextBtn) {
        els.nextBtn.addEventListener('click', next);
    }
    if (els.modeBtn) {
        els.modeBtn.addEventListener('click', togglePlayMode);
    }
    if (els.favFilterBtn) {
        els.favFilterBtn.addEventListener('click', toggleFavoritesMode);
    }
    if (els.trackFavBtn) {
        els.trackFavBtn.addEventListener('click', toggleNowPlayingFavorite);
    }
    if (els.volumeSlider) {
        els.volumeSlider.addEventListener('input', (e: any) => {
            volume = parseInt(e.target.value, 10) || 0;
            localStorage.setItem('music_volume', String(volume));
            applyVolume();
            updateVolumeUI();
        });
    }
    // 静音切换：点击音量图标切换静音/恢复
    if (els.volIconBtn) {
        els.volIconBtn.addEventListener('click', () => {
            if (volume > 0) {
                // 记忆当前音量，切换到静音
                lastVolumeBeforeMute = volume;
                volume = 0;
            } else {
                // 恢复到上次音量（或默认 80）
                volume = lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 80;
            }
            if (els.volumeSlider) els.volumeSlider.value = volume;
            localStorage.setItem('music_volume', String(volume));
            applyVolume();
            updateVolumeUI();
        });
    }
    if (els.progress) {
        // 拖动进度条：input 事件实时更新时间显示与填充，change 事件执行 seek
        els.progress.addEventListener('input', (e: any) => {
            isSeeking = true;
            const v = parseFloat(e.target.value);
            // 实时更新填充与滑块位置（拖动反馈）
            if (els.progressFill) els.progressFill.style.width = v + '%';
            if (els.progressThumb) els.progressThumb.style.left = v + '%';
            if (!howl) return;
            const dur = howl.duration() || 0;
            if (els.currentTime) els.currentTime.textContent = formatTime(v * dur / 100);
        });
        els.progress.addEventListener('change', (e: any) => {
            const v = parseFloat(e.target.value);
            if (howl) {
                const dur = howl.duration() || 0;
                if (dur > 0) howl.seek((v * dur) / 100);
            }
            isSeeking = false;  // 无论是否 seek 都必须重置，避免 isSeeking 泄漏
        });
    }
}

// ============ 添加文件 / 文件夹 ============
async function addFiles(): Promise<void> {
    try {
        const result = await window.api.musicPickFiles();
        if (!result.success || !result.files.length) return;
        const newTracks: any[] = [];
        for (const f of result.files) {
            // 去重：避免重复添加同一文件
            if (playlist.some(t => t.filePath === f.filePath)) continue;
            const meta = await fetchMetadata(f.filePath);
            newTracks.push({
                filePath: f.filePath,
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                duration: meta.duration,
                coverPath: meta.coverPath,
                size: f.size,
                addedAt: Date.now(),
                favorite: !!favoritesMap[f.filePath]
            });
        }
        playlist = playlist.concat(newTracks);
        rebuildFavoriteIndices();
        renderPlaylist();
        savePlaylistDebounced();
    } catch (e) {
        console.error('[Music] 添加文件失败:', e);
        reportLog('error', ['[Music] 添加文件失败:', e]);
    }
}

async function addFolder(): Promise<void> {
    try {
        const pick = await window.api.musicPickFolder();
        if (!pick.success || !pick.folderPath) return;
        if (!savedFolders.includes(pick.folderPath)) {
            savedFolders.push(pick.folderPath);
            saveFoldersDebounced();
        }
        const scan = await window.api.musicScanFolder(pick.folderPath, true);
        if (!scan.success || !scan.files.length) return;
        const newTracks: any[] = [];
        for (const f of scan.files) {
            if (playlist.some(t => t.filePath === f.filePath)) continue;
            const meta = await fetchMetadata(f.filePath);
            newTracks.push({
                filePath: f.filePath,
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                duration: meta.duration,
                coverPath: meta.coverPath,
                size: f.size,
                addedAt: Date.now(),
                favorite: !!favoritesMap[f.filePath]
            });
        }
        playlist = playlist.concat(newTracks);
        rebuildFavoriteIndices();
        renderPlaylist();
        savePlaylistDebounced();
        if (scan.truncated) {
            console.warn('[Music] 文件夹扫描已达 2000 文件上限，部分文件未加入');
        }
    } catch (e) {
        console.error('[Music] 添加文件夹失败:', e);
        reportLog('error', ['[Music] 添加文件夹失败:', e]);
    }
}

async function rescanSavedFolders(quiet: boolean = false): Promise<void> {
    if (!savedFolders || savedFolders.length === 0) {
        if (!quiet) alert('未包含任何已添加的文件夹');
        return;
    }
    let addedCount = 0;
    for (const folderPath of savedFolders) {
        try {
            const scan = await window.api.musicScanFolder(folderPath, true);
            if (!scan || !scan.success || !scan.files || !scan.files.length) continue;
            const newTracks: any[] = [];
            for (const f of scan.files) {
                if (playlist.some(t => t.filePath === f.filePath)) continue;
                const meta = await fetchMetadata(f.filePath);
                newTracks.push({
                    filePath: f.filePath,
                    title: meta.title,
                    artist: meta.artist,
                    album: meta.album,
                    duration: meta.duration,
                    coverPath: meta.coverPath,
                    size: f.size,
                    addedAt: Date.now(),
                    favorite: !!favoritesMap[f.filePath]
                });
            }
            if (newTracks.length > 0) {
                addedCount += newTracks.length;
                playlist = playlist.concat(newTracks);
            }
        } catch (e) {
            console.warn('[Music] 扫描文件夹失败:', folderPath, e);
        }
    }
    if (addedCount > 0) {
        rebuildFavoriteIndices();
        renderPlaylist();
        savePlaylistDebounced();
    }
    if (!quiet) {
        alert(addedCount > 0 ? `刷新完成，新增 ${addedCount} 首曲目` : '已经是最新状态，未发现新曲目');
    }
}

async function fetchMetadata(filePath: any): Promise<any> {
    try {
        const result = await window.api.musicReadMetadata(filePath);
        if (result && result.success && result.metadata) {
            return result.metadata;
        }
    } catch (e) {
        console.warn('[Music] 元数据解析失败:', filePath, e);
        reportLog('warn', ['[Music] 元数据解析失败:', filePath, e]);
    }
    // 失败时回退：用文件名作为标题
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const name = filePath.slice(lastSlash + 1);
    return {
        title: name.replace(/\.[^.]+$/, ''),
        artist: '',
        album: '',
        duration: 0,
        coverPath: ''
    };
}

function clearPlaylist(): void {
    destroyCurrentHowl();
    playlist = [];
    currentIndex = -1;
    isPlaying = false;
    shuffleHistory = [];
    renderPlaylist();
    updatePlayButton();
    updateNowPlaying();
    savePlaylistDebounced();
}

function destroyCurrentHowl(): void {
    if (howl) {
        try {
            howl.off(); // 移除所有事件监听回调
            howl.stop();
            howl.unload(); // 释放 WebAudio/Audio 内存节点
        } catch (e) {
            console.warn('[Music] 销毁 Howler 实例异常:', e);
        }
        howl = null;
    }
    if (progressTimerId) {
        clearInterval(progressTimerId);
        progressTimerId = null;
    }
}

// ============ 播放控制 ============
function playTrack(index: number, manual?: boolean): void {
    if (index < 0 || index >= playlist.length) return;
    // 彻底卸载旧的 Howl 实例（释放音频资源）+ 取消 rAF 循环
    destroyCurrentHowl();
    currentIndex = index;
    const track = playlist[index];
    if (!track) return;

    // 随机模式历史管理：
    // - 手动点击曲目时重置历史栈（避免 prev() 的"栈顶===当前"不变量被破坏）
    // - 自动 next/prev 时正常压栈
    if (playMode === 'shuffle') {
        if (manual) {
            shuffleHistory = [index];
        } else {
            // 自动 next/prev：始终将当前索引移到栈顶，保持"栈顶===当前"不变量
            const existingPos = shuffleHistory.indexOf(index);
            if (existingPos > -1) shuffleHistory.splice(existingPos, 1);
            shuffleHistory.push(index);
            if (shuffleHistory.length > 100) shuffleHistory.shift();
        }
    }

    // 手动点击列表曲目：收藏模式下点击项必为收藏歌，直接进入收藏范围（清除待切）
    if (manual && favoritesActive && favoriteIndices.includes(index)) {
        pendingReturnToFavorites = false;
    }

    const howlOpts: any = {
        src: [buildAudioUrl(track.filePath)],
        html5: true,          // 流式加载，避免大文件一次性载入内存
        volume: volume / 100
    };
    const ext = getExt(track.filePath);
    if (ext) howlOpts.format = [ext];
    howl = new Howl(howlOpts);

    howl.on('load', () => {
        loadErrorCount = 0;
        if (els.totalTime) els.totalTime.textContent = formatTime(howl.duration());
        if (els.progress) els.progress.value = 0;
    });
    howl.on('play', () => {
        isPlaying = true;
        updatePlayButton();
        // 取消上一个定时器（避免 end→play 切换时累积多个循环）
        if (progressTimerId) clearInterval(progressTimerId);
        progressTimerId = setInterval(updateProgress, 250);  // OPT-3: 4fps 替代 60fps rAF
    });
    howl.on('pause', () => {
        isPlaying = false;
        updatePlayButton();
        // 暂停时取消定时器，避免无意义刷新
        if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
    });
    howl.on('end', () => {
        // 单曲循环：重新播放当前曲
        if (playMode === 'single') {
            howl.seek(0);
            howl.play();
        } else {
            const currentHowl = howl;
            setTimeout(() => {
                // 仅在当前 howl 实例依然是原对象时才继续 autoNext，避免手动切歌竞争
                if (howl === currentHowl) {
                    next(true);
                }
            }, 0);  // 延迟到下一 tick，避免在 end 事件中同步卸载当前 Howl
        }
    });
    howl.on('loaderror', () => {
        console.error('[Music] 音频加载失败:', track.filePath);
        reportLog('error', ['[Music] 音频加载失败:', track.filePath]);
        loadErrorCount++;
        if (loadErrorCount >= playlist.length) {
            // 所有曲目均加载失败：停止并复位，避免无限循环
            console.warn('[Music] 播放列表内全部曲目加载失败，已停止播放');
            reportLog('warn', ['[Music] 播放列表内全部曲目加载失败，已停止播放']);
            isPlaying = false;
            updatePlayButton();
            if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
            howl.unload();
            howl = null;
            return;
        }
        // 加载失败时跳到下一首（避免卡死）
        next(true);
    });
    howl.on('playerror', (id: any, err: any) => {
        console.error('[Music] 播放错误:', err);
        reportLog('error', ['[Music] 播放错误:', err]);
        isPlaying = false;
        updatePlayButton();
        if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
    });

    howl.play();
    updateNowPlaying();
    updatePlayingHighlight();  // OPT-6: 仅移动高亮，不重建列表 DOM
}

function getExt(filePath: any): string {
    const dot = filePath.lastIndexOf('.');
    if (dot < 0) return '';  // 无扩展名，让 Howler 从 URL 推断
    return filePath.slice(dot + 1).toLowerCase();
}

function togglePlay(): void {
    if (!howl) {
        // 未加载任何曲目时，从第一首开始
        if (playlist.length > 0) playTrack(0);
        return;
    }
    if (isPlaying) {
        howl.pause();
    } else {
        howl.play();
    }
}

function next(autoNext?: boolean): void {
    if (playlist.length === 0) return;
    const pool = getPlayablePool();
    if (pool.length === 0) {
        // 收藏池为空（运行中全部取消收藏）：停止并复位，避免越界
        isPlaying = false;
        updatePlayButton();
        if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
        return;
    }
    // 待切状态：当前在播非收藏歌，切歌时落回收藏池（顺序→池内第一首；随机→池内随机）
    if (pendingReturnToFavorites) {
        pendingReturnToFavorites = false;
        const idx = playMode === 'shuffle'
            ? nextIndexInPool(pool, currentIndex, 'shuffle')
            : nextIndexInPool(pool, currentIndex, 'sequential');
        playTrack(idx);
        return;
    }
    if (playMode === 'shuffle') {
        // 随机：选一个不同于当前的索引（单曲自动切歌时停止，避免空转）
        if (pool.length === 1) {
            if (autoNext) {
                isPlaying = false;
                updatePlayButton();
                if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
                return;
            }
            playTrack(pool[0]);
            return;
        }
        playTrack(nextIndexInPool(pool, currentIndex, 'shuffle'));
        return;
    }
    // 顺序 / 单曲循环的"下一首"行为：池内线性前进，池尾循环到池首
    playTrack(nextIndexInPool(pool, currentIndex, 'sequential'));
}

function prev(): void {
    if (playlist.length === 0) return;
    // 随机模式：从历史栈弹出（栈内索引在置待切时已清理为非收藏，回退天然在池内）
    if (playMode === 'shuffle' && shuffleHistory.length > 1) {
        shuffleHistory.pop();  // 弹出当前
        const prevIdx = shuffleHistory[shuffleHistory.length - 1];
        if (prevIdx !== undefined) {
            pendingReturnToFavorites = false;
            playTrack(prevIdx);
            return;
        }
    }
    const pool = getPlayablePool();
    if (pool.length === 0) return;
    let idx: number;
    if (playMode === 'shuffle') {
        // 栈空或仅含当前：池内随机一首
        idx = nextIndexInPool(pool, currentIndex, 'shuffle');
    } else {
        // 顺序：池内回退；current 不在池内（待切）→ 池内第一首
        idx = prevIndexInPool(pool, currentIndex);
    }
    pendingReturnToFavorites = false;
    playTrack(idx);
}

function togglePlayMode(): void {
    if (playMode === 'sequential') playMode = 'shuffle';
    else if (playMode === 'shuffle') playMode = 'single';
    else playMode = 'sequential';
    shuffleHistory = [];  // 切换模式时清空历史
    updateModeButton();
}

function updateModeButton(): void {
    if (!els.modeBtn) return;
    // 三种播放模式使用不同 SVG 图标（替代原 emoji）
    const icons: any = {
        sequential: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
        shuffle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
        single: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>'
    };
    const labels: any = {
        sequential: '顺序播放',
        shuffle: '随机播放',
        single: '单曲循环'
    };
    const label = labels[playMode] || labels.sequential;
    els.modeBtn.innerHTML = icons[playMode] || icons.sequential;
    els.modeBtn.title = label;
    els.modeBtn.setAttribute('aria-label', label);
    els.modeBtn.dataset.mode = playMode;
}

// ============ 收藏夹播放模式 ============
function rebuildFavoriteIndices(): void {
    favoriteIndices = playlist
        .map((t, i) => ({ t, i }))
        .filter(x => x.t.favorite === true)
        .map(x => x.i);
}

function getPlayablePool(): number[] {
    // 收藏模式且池非空 → 收藏索引池；否则完整索引（调用方只读，勿修改返回值）
    return favoritesActive && favoriteIndices.length > 0
        ? favoriteIndices
        : playlist.map((_, i) => i);
}

function showTip(msg: string): void {
    const tip = els.tip;
    if (!tip) return;
    tip.textContent = msg;
    tip.style.display = 'block';
    if (tipTimerId) clearTimeout(tipTimerId);
    tipTimerId = setTimeout(() => { tip.style.display = 'none'; }, 2500);
}

// ============ 收藏夹过滤 ============
function toggleFavoritesMode(): void {
    if (!favoritesActive) {
        // 尝试激活
        if (favoriteIndices.length === 0) {
            showTip('暂无收藏音乐，请先收藏一些歌曲');
            return; // 空收藏夹：拒绝激活，播放与列表保持不变
        }
        favoritesActive = true;
        localStorage.setItem('music_favorites_active', '1');
        // 当前曲非收藏 → 待切（播完再切）；同步清理历史栈中非收藏索引，
        // 保证随机模式"上一首"回退只落在收藏池内
        if (currentIndex >= 0 && !favoriteIndices.includes(currentIndex)) {
            pendingReturnToFavorites = true;
            shuffleHistory = shuffleHistory.filter(i => favoriteIndices.includes(i));
            if (shuffleHistory.length <= 1) shuffleHistory = [];
        }
    } else {
        favoritesActive = false;
        pendingReturnToFavorites = false;
        localStorage.removeItem('music_favorites_active');
    }
    if (els.favFilterBtn) {
        els.favFilterBtn.classList.toggle('active', favoritesActive);
        els.favFilterBtn.setAttribute('aria-pressed', String(favoritesActive));
        els.favFilterBtn.title = favoritesActive ? '取消收藏模式' : '激活收藏夹播放';
    }
    renderPlaylist();
}

// ============ 单曲删除 ============
function deleteTrack(index: number): void {
    if (index < 0 || index >= playlist.length) return;
    const wasCurrent = currentIndex === index;
    const wasBeforeCurrent = index < currentIndex;
    // 删除前如果正在播放该曲，先卸载 Howl 并取消定时器，避免切换期间残留
    if (wasCurrent) {
        if (howl) { howl.unload(); howl = null; }
        if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
    }
    playlist.splice(index, 1);
    // 修正随机历史记录中的索引，防止切上一首时越界或播错
    shuffleHistory = shuffleHistory
        .filter(i => i !== index)
        .map(i => (i > index ? i - 1 : i));
    if (wasCurrent) {
        // 删除的就是当前曲：若后面还有曲（已前移到 index），直接播它；否则停止
        if (index < playlist.length) {
            playTrack(index);
            // 修复：playTrack 内部只调用 updateNowPlaying/updatePlayingHighlight，
            // 从不重建列表 DOM。此处必须显式 renderPlaylist()，
            // 否则列表仍保留被删曲目的行、后续 data-index 全部错位，
            // 收藏/删除会命中错误曲目。不再跳过渲染。
            renderPlaylist();
        } else {
            currentIndex = -1;
            isPlaying = false;
            updatePlayButton();
            updateNowPlaying();
        }
    } else if (wasBeforeCurrent) {
        // 删除的在前，当前索引前移一位
        currentIndex--;
    }
    savePlaylistDebounced();
    rebuildFavoriteIndices();
    renderPlaylist();
}

// ============ 控制条收藏按钮控制与同步 ============
function updateNowPlayingFavButton(track: any): void {
    if (!els.trackFavBtn) return;
    if (!track) {
        els.trackFavBtn.disabled = true;
        els.trackFavBtn.classList.remove('favorited');
        els.trackFavBtn.title = '未在播放';
        els.trackFavBtn.setAttribute('aria-label', '未在播放');
        els.trackFavBtn.setAttribute('aria-pressed', 'false');
        if (els.trackFavIconOutline && els.trackFavIconSolid) {
            els.trackFavIconOutline.style.display = '';
            els.trackFavIconSolid.style.display = 'none';
        }
        return;
    }
    els.trackFavBtn.disabled = false;
    const isFav = !!track.favorite;
    els.trackFavBtn.classList.toggle('favorited', isFav);
    els.trackFavBtn.title = isFav ? '取消收藏' : '收藏';
    els.trackFavBtn.setAttribute('aria-label', isFav ? '取消收藏' : '收藏');
    els.trackFavBtn.setAttribute('aria-pressed', String(isFav));
    if (els.trackFavIconOutline && els.trackFavIconSolid) {
        els.trackFavIconOutline.style.display = isFav ? 'none' : '';
        els.trackFavIconSolid.style.display = isFav ? '' : 'none';
    }
}

function toggleNowPlayingFavorite(): void {
    if (currentIndex < 0 || currentIndex >= playlist.length) return;
    toggleFavorite(currentIndex);
}

// ============ 单曲收藏切换 ============
function toggleFavorite(index: number): void {
    if (index < 0 || index >= playlist.length) return;
    const track = playlist[index];
    track.favorite = !track.favorite;
    
    if (track.favorite) {
        favoritesMap[track.filePath] = {
            filePath: track.filePath,
            title: track.title,
            artist: track.artist,
            album: track.album,
            coverPath: track.coverPath,
            duration: track.duration
        };
    } else {
        delete favoritesMap[track.filePath];
    }
    
    savePlaylistDebounced();
    saveFavoritesDebounced();
    rebuildFavoriteIndices();
    // 收藏模式中取消收藏当前曲：置待切（播完再切）+ 清理历史栈非收藏索引
    if (favoritesActive && !track.favorite && index === currentIndex) {
        pendingReturnToFavorites = true;
        shuffleHistory = shuffleHistory.filter(i => favoriteIndices.includes(i));
        if (shuffleHistory.length <= 1) shuffleHistory = [];
    }
    // 若修改的是当前播放的曲目，同步更新控制条收藏按钮
    if (index === currentIndex) {
        updateNowPlayingFavButton(track);
    }
    // 收藏过滤开启且取消收藏时：需重新渲染将该曲移出列表
    if (favoritesActive && !track.favorite) {
        renderPlaylist();
        return;
    }
    // 其余情况：仅更新该项 DOM，避免整列表重渲染打断交互
    const itemEl = els.listContainer && els.listContainer.querySelector(
        '.music-item[data-index="' + index + '"]'
    );
    if (itemEl) {
        const favBtn = itemEl.querySelector('.music-item-fav');
        if (favBtn) {
            favBtn.textContent = track.favorite ? '★' : '☆';
            favBtn.classList.toggle('favorited', !!track.favorite);
            favBtn.title = track.favorite ? '取消收藏' : '收藏';
            favBtn.setAttribute('aria-label', track.favorite ? '取消收藏' : '收藏');
            favBtn.setAttribute('aria-pressed', String(!!track.favorite));
        }
    }
}

function applyVolume(): void {
    if (howl) howl.volume(volume / 100);
}

// 同步音量 UI：填充宽度 + 静音/非静音图标切换
function updateVolumeUI(): void {
    if (els.volumeFill) {
        els.volumeFill.style.width = volume + '%';
    }
    if (els.volIconHigh && els.volIconMute) {
        // 音量为 0 时显示静音图标，否则显示音量图标
        const muted = volume === 0;
        els.volIconHigh.style.display = muted ? 'none' : '';
        els.volIconMute.style.display = muted ? '' : 'none';
    }
    if (els.volIconBtn) {
        els.volIconBtn.title = volume === 0 ? '取消静音' : '静音';
        els.volIconBtn.setAttribute('aria-label', volume === 0 ? '取消静音' : '静音');
    }
}

function updateProgress(): void {
    // OPT-3: 由 setInterval 每 250ms 触发，无需自调度
    if (isSeeking) return;
    if (!howl || !isPlaying) {
        if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null; }
        return;
    }
    const dur = howl.duration() || 0;
    const pos = howl.seek() || 0;
    if (els.progress && dur > 0) {
        const pct = (pos / dur) * 100;
        els.progress.value = pct;
        // 同步更新自定义进度条填充与滑块位置
        if (els.progressFill) els.progressFill.style.width = pct + '%';
        if (els.progressThumb) els.progressThumb.style.left = pct + '%';
    }
    if (els.currentTime) {
        els.currentTime.textContent = formatTime(pos);
    }
}

function updatePlayButton(): void {
    if (!els.playBtn) return;
    // 切换 SVG 图标显示（替代原 textContent '⏸'/'▶'）
    if (els.playIconPlay && els.playIconPause) {
        els.playIconPlay.style.display = isPlaying ? 'none' : '';
        els.playIconPause.style.display = isPlaying ? '' : 'none';
    }
    els.playBtn.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
    els.playBtn.title = isPlaying ? '暂停' : '播放';
}

function updateNowPlaying(): void {
    const track = playlist[currentIndex];
    if (!track) {
        // 无曲目：清除封面 src，露出底层占位符
        if (els.coverImg) els.coverImg.removeAttribute('src');
        if (els.trackTitle) els.trackTitle.textContent = '未播放';
        if (els.trackArtist) els.trackArtist.textContent = '—';
        if (els.totalTime) els.totalTime.textContent = '0:00';
        if (els.currentTime) els.currentTime.textContent = '0:00';
        if (els.progress) els.progress.value = 0;
        // 清除进度条填充与滑块位置
        if (els.progressFill) els.progressFill.style.width = '0%';
        if (els.progressThumb) els.progressThumb.style.left = '0%';
        updateNowPlayingFavButton(null);
        return;
    }
    if (els.coverImg) {
        const coverUrl = buildCoverUrl(track.coverPath);
        if (coverUrl) {
            els.coverImg.src = coverUrl;
        } else {
            // 无封面路径：清除 src 露出占位符
            els.coverImg.removeAttribute('src');
        }
    }
    if (els.trackTitle) els.trackTitle.textContent = track.title || '未知标题';
    if (els.trackArtist) els.trackArtist.textContent = track.artist || '未知艺术家';
    updateNowPlayingFavButton(track);
}

// ============ 渲染播放列表 ============
// 自动定位当前播放曲目DOM位置
function scrollToActiveTrack(): void {
    if (!els.listContainer || currentIndex < 0) return;
    const curEl = els.listContainer.querySelector(
        '.music-item[data-index="' + currentIndex + '"]'
    );
    if (curEl) {
        curEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 切换当前播放高亮，并自动定位
function updatePlayingHighlight(): void {
    if (!els.listContainer) return;
    // 移除旧高亮（可能有 0 个或 1 个）
    const prevPlaying = els.listContainer.querySelectorAll('.music-item.playing');
    prevPlaying.forEach((el: Element) => el.classList.remove('playing'));
    // 高亮新当前曲（若被搜索/收藏过滤隐藏则无匹配，保持无高亮即可）
    if (currentIndex >= 0) {
        const cur = els.listContainer.querySelector(
            '.music-item[data-index="' + currentIndex + '"]'
        );
        if (cur) cur.classList.add('playing');
    }
    scrollToActiveTrack();
}

function renderPlaylist(): void {
    if (!els.listContainer) return;
    const filtered = playlist
        .map((t, i) => ({ t, i }))
        .filter(x => trackMatchesSearch(x.t))
        .filter(x => !favoritesActive || x.t.favorite === true);
    if (filtered.length === 0) {
        els.listContainer.innerHTML = '';
        if (els.emptyHint) {
            els.emptyHint.style.display = '';
            let msg;
            if (playlist.length === 0) {
                msg = '点击「+文件」或「+文件夹」添加音乐';
            } else if (favoritesActive) {
                msg = '暂无收藏音乐';
            } else {
                msg = '没有匹配的曲目';
            }
            els.emptyHint.textContent = msg;
        }
        return;
    }
    if (els.emptyHint) els.emptyHint.style.display = 'none';

    // 构建 DOM（避免 innerHTML 注入风险，逐项创建）
    const frag = document.createDocumentFragment();
    filtered.forEach(({ t, i }: any) => {
        const item = document.createElement('div');
        item.className = 'music-item' + (i === currentIndex ? ' playing' : '');
        item.dataset.index = String(i);
        // 过滤状态（搜索中或收藏模式）下禁用拖拽排序，防止局部列表排序乱序全局播放列表
        if (searchQuery || favoritesActive) {
            item.draggable = false;
        } else {
            item.draggable = true;
        }  // 启用拖拽排序

        const cover = document.createElement('img');
        cover.className = 'music-item-cover';
        cover.alt = '';
        cover.loading = 'lazy';
        cover.decoding = 'async';
        // 列表项优先缩略图（96×96），控制条大封面仍用原图
        const thumbPath = t.thumbPath || inferThumbPath(t.coverPath);
        const coverUrl = thumbPath ? buildCoverUrl(thumbPath) : '';
        const origUrl = t.coverPath ? buildCoverUrl(t.coverPath) : '';
        cover.dataset.origUrl = origUrl || '';
        cover.src = coverUrl || origUrl || defaultCoverSvg();
        cover.onerror = () => {
            // 两级回退：缩略图失败 → 原图；原图失败 → 默认 SVG
            if (cover.dataset.origUrl && cover.src !== cover.dataset.origUrl) {
                cover.src = cover.dataset.origUrl;
            } else {
                cover.src = defaultCoverSvg();
            }
        };

        const info = document.createElement('div');
        info.className = 'music-item-info';
        const title = document.createElement('div');
        title.className = 'music-item-title';
        title.textContent = t.title || '未知标题';
        const meta = document.createElement('div');
        meta.className = 'music-item-meta';
        meta.textContent = (t.artist || '未知艺术家') + (t.duration ? ' · ' + formatTime(t.duration) : '');
        info.appendChild(title);
        info.appendChild(meta);

        const dur = document.createElement('div');
        dur.className = 'music-item-dur';
        dur.textContent = formatTime(t.duration);

        // 收藏按钮：☆ 未收藏 / ★ 已收藏（已收藏时始终可见）
        const fav = document.createElement('button');
        fav.type = 'button';
        fav.className = 'music-item-fav' + (t.favorite ? ' favorited' : '');
        fav.textContent = t.favorite ? '★' : '☆';
        fav.title = t.favorite ? '取消收藏' : '收藏';
        fav.setAttribute('aria-label', t.favorite ? '取消收藏' : '收藏');
        fav.setAttribute('aria-pressed', String(!!t.favorite));
        fav.dataset.action = 'fav';

        // 删除按钮：✕，悬停时显示
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'music-item-delete';
        del.textContent = '✕';
        del.title = '删除';
        del.setAttribute('aria-label', '删除');
        del.dataset.action = 'delete';

        item.appendChild(cover);
        item.appendChild(info);
        item.appendChild(dur);
        item.appendChild(fav);
        item.appendChild(del);
        frag.appendChild(item);
    });
    els.listContainer.innerHTML = '';
    els.listContainer.appendChild(frag);

    // 绑定点击播放（事件委托）；删除/收藏按钮通过 data-action 拦截，阻止冒泡到 item
    els.listContainer.onclick = (e: any) => {
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
            e.stopPropagation();
            const item = actionEl.closest('.music-item');
            if (!item) return;
            const idx = parseInt(item.dataset.index, 10);
            if (isNaN(idx)) return;
            if (actionEl.dataset.action === 'delete') {
                deleteTrack(idx);
            } else if (actionEl.dataset.action === 'fav') {
                toggleFavorite(idx);
            }
            return;
        }
        const item = e.target.closest('.music-item');
        if (!item) return;
        const idx = parseInt(item.dataset.index, 10);
        if (!isNaN(idx)) playTrack(idx, true);  // manual=true：手动点击，重置 shuffle 历史
    };

    // 拖拽排序（P2.3）—— 监听器仅在 init 中注册一次，避免重复累积
    // （setupDragSort 已在 init 中调用，此处不再重复注册）
}

// ============ 拖拽排序（HTML5 Drag API）============
// 监听器在 init 中仅注册一次；dragSrcIdx 为模块级变量，避免闭包累积
function setupDragSort(container: any): void {
    container.addEventListener('dragstart', (e: any) => {
        const item = e.target.closest('.music-item');
        if (!item) return;
        dragSrcIdx = parseInt(item.dataset.index, 10);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // 必须设置 data 才能在某些浏览器触发 dragover
        try { e.dataTransfer.setData('text/plain', String(dragSrcIdx)); } catch (e2) { console.warn('设置拖拽数据失败:', (e2 as any).message); }
    });
    container.addEventListener('dragend', (e: any) => {
        const item = e.target.closest('.music-item');
        if (item) item.classList.remove('dragging');
        dragSrcIdx = -1;
    });
    container.addEventListener('dragover', (e: any) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    container.addEventListener('drop', (e: any) => {
        e.preventDefault();
        if (dragSrcIdx < 0) return;
        const target = e.target.closest('.music-item');
        if (!target) return;
        const dropIdx = parseInt(target.dataset.index, 10);
        if (isNaN(dropIdx) || dropIdx === dragSrcIdx) return;
        // 交换 playlist 中的位置
        const moved = playlist[dragSrcIdx];
        playlist.splice(dragSrcIdx, 1);
        playlist.splice(dropIdx, 0, moved);
        // 修正 currentIndex（如果当前播放的曲目被移动）
        if (currentIndex === dragSrcIdx) {
            currentIndex = dropIdx;
        } else if (dragSrcIdx < currentIndex && dropIdx >= currentIndex) {
            currentIndex--;
        } else if (dragSrcIdx > currentIndex && dropIdx <= currentIndex) {
            currentIndex++;
        }
        dragSrcIdx = -1;  // 重置，防止 drop 后再次触发
        rebuildFavoriteIndices();
        renderPlaylist();
        savePlaylistDebounced();
    });
}

// ============ 导出模块 ============
// 暴露给外部调用的方法（供 renderer.ts 在 tab 切换时调用）

/**
 * 音乐 tab 激活时调用（P6 懒初始化：首次进入音乐 tab 时才执行 init()，
 * 避免启动期 IPC 与 DOM 渲染拖慢首屏）
 */
export function initMusicTab(): void {
    if (!inited) {
        inited = true;
        init().catch(e => { console.error('[Music] init 失败:', e); inited = false; });
    } else {
        if (savedFolders && savedFolders.length > 0) {
            rescanSavedFolders(true).catch(e => console.warn('[Music] Tab 激活增量扫描失败:', e));
        }
    }
}

/**
 * 音乐 tab 离开时调用（后台播放是核心特性，无需暂停）
 */
export function onMusicTabDeactivated(): void {
    // 离开音乐 tab 时无需暂停（后台播放是核心特性）
}
