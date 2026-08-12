# 音乐播放器「收藏夹播放模式」实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 升级音乐播放器现有"仅显示收藏"按钮为收藏夹播放模式——激活后显示与播放都限制在收藏曲目内，顺序/随机/单曲循环均在收藏池内工作。

**架构：** 在 `musicTab.ts` 维护 `favoriteIndices` 收藏索引池 + `pendingReturnToFavorites` 待切标志；播放范围统一走 `getPlayablePool()`；"播完再切"通过待切标志实现。池内导航抽为纯函数放入 `rendererUtils.ts` 并配 vitest 测试。

**技术栈：** TypeScript、Electron 渲染进程、howler.js、vitest。

**规格：** `docs/superpowers/specs/2026-08-12-music-favorites-play-mode-design.md`（已批准）

---

## 文件结构

- `src/renderer/lib/rendererUtils.ts`（修改）——新增池内导航纯函数 `nextIndexInPool` / `prevIndexInPool`
- `tests/rendererUtils.test.ts`（修改）——新增上述纯函数测试
- `src/renderer/tabs/musicTab.ts`（修改）——收藏夹播放模式全部状态与逻辑
- `index.html`（修改）——播放列表区新增 `#musicTip` 提示条元素（424 行 `#musicList` 之前）
- `styles.css`（修改）——新增 `.music-tip` 样式（`.music-list-wrap` 已有 `position:relative`，可直接绝对定位）

---

### 任务 1：池内导航纯函数（TDD）

**文件：**
- 修改：`src/renderer/lib/rendererUtils.ts`
- 测试：`tests/rendererUtils.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `tests/rendererUtils.test.ts` 末尾追加（import 行改为同时引入两个新函数）：

```ts
// tests/rendererUtils.test.ts
import { describe, it, expect } from 'vitest';
import { inferThumbPath, nextIndexInPool, prevIndexInPool } from '../src/renderer/lib/rendererUtils.js';

describe('nextIndexInPool', () => {
    it('顺序模式：池内线性前进', () => {
        expect(nextIndexInPool([2, 5, 7], 5, 'sequential')).toBe(7);
    });
    it('顺序模式：池尾回池首', () => {
        expect(nextIndexInPool([2, 5, 7], 7, 'sequential')).toBe(2);
    });
    it('顺序模式：current 不在池内（待切状态）→ 池内第一首', () => {
        expect(nextIndexInPool([2, 5, 7], 3, 'sequential')).toBe(2);
    });
    it('池为空返回 -1', () => {
        expect(nextIndexInPool([], 0, 'sequential')).toBe(-1);
    });
    it('池长 1：返回池内唯一项', () => {
        expect(nextIndexInPool([4], 4, 'sequential')).toBe(4);
    });
    it('随机模式：返回池内且不等于 current', () => {
        const rng = () => 0.9; // 固定 rng，保证确定性
        const result = nextIndexInPool([2, 5, 7, 9], 5, 'shuffle', rng);
        expect([2, 5, 7, 9]).toContain(result);
        expect(result).not.toBe(5);
    });
    it('随机模式：current 不在池内 → 任意池内项', () => {
        const rng = () => 0.0;
        const result = nextIndexInPool([2, 5, 7], 3, 'shuffle', rng);
        expect([2, 5, 7]).toContain(result);
    });
});

describe('prevIndexInPool', () => {
    it('顺序模式：池内回退', () => {
        expect(prevIndexInPool([2, 5, 7], 5)).toBe(2);
    });
    it('顺序模式：池首回池尾', () => {
        expect(prevIndexInPool([2, 5, 7], 2)).toBe(7);
    });
    it('顺序模式：current 不在池内 → 池内第一首', () => {
        expect(prevIndexInPool([2, 5, 7], 3)).toBe(2);
    });
    it('池为空返回 -1', () => {
        expect(prevIndexInPool([], 0)).toBe(-1);
    });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/rendererUtils.test.ts`
预期：FAIL，报错 `nextIndexInPool is not a function` / `prevIndexInPool is not a function`

- [ ] **步骤 3：实现纯函数**

在 `src/renderer/lib/rendererUtils.ts` 末尾追加：

```ts
/**
 * 在索引池内选择"下一首"的索引。
 * - sequential：线性前进，池尾回池首；current 不在池内（待切状态）→ 池内第一首
 * - shuffle：随机选一个不等于 current 的池内项；current 不在池内 → 随机任意池内项
 * - 池为空返回 -1（调用方负责停止播放）
 * - rng 仅用于测试注入确定性随机源
 */
export function nextIndexInPool(
    pool: number[],
    current: number,
    mode: 'sequential' | 'shuffle',
    rng?: () => number
): number {
    if (pool.length === 0) return -1;
    const rand = rng || Math.random;
    const pos = pool.indexOf(current);
    if (mode === 'shuffle') {
        if (pool.length === 1) return pool[0];
        if (pos === -1) return pool[Math.floor(rand() * pool.length)];
        let idx = pos;
        while (idx === pos) idx = Math.floor(rand() * pool.length);
        return pool[idx];
    }
    // sequential
    if (pos === -1) return pool[0];
    return pool[(pos + 1) % pool.length];
}

/**
 * 在索引池内选择"上一首"的索引。
 * 线性回退，池首回池尾；current 不在池内 → 池内第一首；池为空返回 -1。
 */
export function prevIndexInPool(pool: number[], current: number): number {
    if (pool.length === 0) return -1;
    const pos = pool.indexOf(current);
    if (pos === -1) return pool[0];
    return pool[(pos - 1 + pool.length) % pool.length];
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/rendererUtils.test.ts`
预期：PASS（全部用例通过）

- [ ] **步骤 5：Commit**

```bash
git add tests/rendererUtils.test.ts src/renderer/lib/rendererUtils.ts
git commit -m "feat: add pool navigation helpers for favorites play mode"
```

---

### 任务 2：musicTab 状态与基础辅助函数

**文件：**
- 修改：`src/renderer/tabs/musicTab.ts`

- [ ] **步骤 1：替换状态声明**

将第 28 行：

```ts
let showFavoritesOnly: boolean = false; // 收藏夹过滤开关：true 时仅显示 track.favorite === true 的曲目
```

替换为：

```ts
let favoritesActive: boolean = false;           // 收藏夹播放模式开关：true 时显示与播放均限收藏曲目
let favoriteIndices: number[] = [];             // 收藏索引池：playlist 中所有 favorite === true 的索引
let pendingReturnToFavorites: boolean = false;  // 待切标志：当前在播非收藏歌，下次切歌落回收藏池
let tipTimerId: ReturnType<typeof setTimeout> | null = null; // 提示条自动隐藏定时器
```

- [ ] **步骤 2：新增辅助函数**

在 `toggleFavFilter` 函数（628 行附近）之前插入：

```ts
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
```

- [ ] **步骤 3：typecheck 确认无引用错误**

运行：`npm run typecheck`
预期：PASS（此时 `els.tip` 尚无定义——见任务 3 与任务 4 步骤 1，`showTip` 内已有 `if (!tip) return;` 防御，但 TS 严格模式下 `els.tip` 为 `any` 类型不报错；若报错则在任务 4 步骤 1 一并处理）

- [ ] **步骤 4：Commit**

```bash
git add src/renderer/tabs/musicTab.ts
git commit -m "feat: add favorites play mode state and helpers"
```

---

### 任务 3：提示条 UI（index.html + styles.css）

**文件：**
- 修改：`index.html`（424 行 `#musicList` 之前）
- 修改：`styles.css`

- [ ] **步骤 1：index.html 插入提示条元素**

在 423-426 行 `.music-list-wrap` 内、`<div class="music-list" id="musicList">` 之前插入：

```html
<div class="music-tip" id="musicTip" role="status" style="display:none"></div>
```

- [ ] **步骤 2：styles.css 新增提示条样式**

在 `.music-list-wrap` 样式（1814 行）附近追加：

```css
.music-tip{
    position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:10;
    max-width:90%;padding:6px 14px;border-radius:6px;
    background:rgba(0,0,0,0.75);color:#fff;font-size:12px;line-height:1.5;
    pointer-events:none;white-space:nowrap;
}
```

- [ ] **步骤 3：Commit**

```bash
git add index.html styles.css
git commit -m "feat: add music tip toast element for favorites mode"
```

---

### 任务 4：按钮升级与初始化

**文件：**
- 修改：`src/renderer/tabs/musicTab.ts`

- [ ] **步骤 1：els 增加 tip 引用 + init 恢复收藏模式**

在 `els` 对象（132 行 `favFilterBtn` 之后）增加：

```ts
        tip: document.getElementById('musicTip'),
```

在 `init()` 中 `bindEvents()` 调用之前（167 行附近）插入恢复逻辑：

```ts
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
```

并在 `init()` 中 `playlist` 加载成功后的同步循环（155-161 行）之后调用一次全量重建：

```ts
        rebuildFavoriteIndices();
```

（放在 `if (plRes && ...)` 块内、favorite 同步循环之后）

- [ ] **步骤 2：替换 toggleFavFilter 为 toggleFavoritesMode**

将原函数（629-637 行）：

```ts
function toggleFavFilter(): void {
    showFavoritesOnly = !showFavoritesOnly;
    if (els.favFilterBtn) {
        els.favFilterBtn.classList.toggle('active', showFavoritesOnly);
        els.favFilterBtn.setAttribute('aria-pressed', String(showFavoritesOnly));
        els.favFilterBtn.title = showFavoritesOnly ? '显示全部曲目' : '仅显示收藏';
    }
    renderPlaylist();
}
```

替换为：

```ts
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
```

- [ ] **步骤 3：bindEvents 更新绑定**

将 226 行：

```ts
        els.favFilterBtn.addEventListener('click', toggleFavFilter);
```

替换为：

```ts
        els.favFilterBtn.addEventListener('click', toggleFavoritesMode);
```

- [ ] **步骤 4：typecheck + Commit**

运行：`npm run typecheck`
预期：PASS

```bash
git add src/renderer/tabs/musicTab.ts
git commit -m "feat: upgrade fav filter button to favorites play mode toggle"
```

---

### 任务 5：播放范围改造（next / prev / playTrack）

**文件：**
- 修改：`src/renderer/tabs/musicTab.ts`

- [ ] **步骤 1：改造 next()**

将原函数（558-582 行）整体替换为：

```ts
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
```

- [ ] **步骤 2：改造 prev()**

将原函数（584-598 行）整体替换为：

```ts
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
```

- [ ] **步骤 3：playTrack 手动点击清待切**

在 `playTrack` 函数内、随机历史管理块（451-464 行）之后、`const howlOpts`（466 行）之前插入：

```ts
    // 手动点击列表曲目：收藏模式下点击项必为收藏歌，直接进入收藏范围（清除待切）
    if (manual && favoritesActive && favoriteIndices.includes(index)) {
        pendingReturnToFavorites = false;
    }
```

- [ ] **步骤 4：typecheck + Commit**

运行：`npm run typecheck`
预期：PASS

```bash
git add src/renderer/tabs/musicTab.ts
git commit -m "feat: scope next/prev/playTrack to favorites pool"
```

---

### 任务 6：数据变更联动与渲染过滤

**文件：**
- 修改：`src/renderer/tabs/musicTab.ts`

- [ ] **步骤 1：toggleFavorite 重建池 + 取消收藏当前曲置待切**

将 `toggleFavorite` 函数（710-753 行）中，`saveFavoritesDebounced()` 调用（729 行）之后插入：

```ts
    rebuildFavoriteIndices();
    // 收藏模式中取消收藏当前曲：置待切（播完再切）+ 清理历史栈非收藏索引
    if (favoritesActive && !track.favorite && index === currentIndex) {
        pendingReturnToFavorites = true;
        shuffleHistory = shuffleHistory.filter(i => favoriteIndices.includes(i));
        if (shuffleHistory.length <= 1) shuffleHistory = [];
    }
```

并将 735 行条件：

```ts
    if (showFavoritesOnly && !track.favorite) {
```

替换为：

```ts
    if (favoritesActive && !track.favorite) {
```

- [ ] **步骤 2：删除/拖拽/添加/刷新后重建池**

三处插入 `rebuildFavoriteIndices();`：

1. `deleteTrack` 函数末尾（674 行 `savePlaylistDebounced();` 之后、`renderPlaylist();` 之前）：
```ts
    savePlaylistDebounced();
    rebuildFavoriteIndices();
    renderPlaylist();
```

2. `setupDragSort` 的 `drop` 处理（1034 行 `renderPlaylist();` 之前）：
```ts
        rebuildFavoriteIndices();
        renderPlaylist();
        savePlaylistDebounced();
```

3. 三个 playlist 增量追加点之后（`addFiles` 302 行、`addFolder` 337 行、`rescanSavedFolders` 384 行），统一改为在 `renderPlaylist()` 前插入重建（三处均为）：
```ts
        rebuildFavoriteIndices();
        renderPlaylist();
```

- [ ] **步骤 3：renderPlaylist 过滤与拖拽禁用条件替换**

将 871 行过滤条件：

```ts
        .filter(x => !showFavoritesOnly || x.t.favorite === true);
```

替换为：

```ts
        .filter(x => !favoritesActive || x.t.favorite === true);
```

将 897 行拖拽禁用条件：

```ts
        if (searchQuery || showFavoritesOnly) {
```

替换为：

```ts
        if (searchQuery || favoritesActive) {
```

- [ ] **步骤 4：typecheck + Commit**

运行：`npm run typecheck`
预期：PASS

```bash
git add src/renderer/tabs/musicTab.ts
git commit -m "feat: keep favorites pool in sync with playlist mutations"
```

---

### 任务 7：全量验证

- [ ] **步骤 1：运行全部测试**

运行：`npm test`
预期：全部 PASS（含新增 nextIndexInPool/prevIndexInPool 用例）

- [ ] **步骤 2：运行类型检查**

运行：`npm run typecheck`
预期：PASS

- [ ] **步骤 3：手工验证清单**（Electron 环境 `npm start`）

1. 播放列表含收藏与非收藏曲目，激活收藏模式 → 列表仅显示收藏，当前非收藏歌继续播完，下一首落收藏池
2. 顺序模式：激活后 next/prev 均在收藏池内循环，不出现非收藏曲目
3. 随机模式：激活后 next 只在收藏池内随机；prev 回退不出现激活前播过的非收藏歌
4. 单曲循环：激活后当前非收藏歌保持循环，手动 next 后进入收藏池
5. 收藏模式中取消当前曲收藏 → 播完再切，列表即时移除该曲
6. 空收藏夹点击激活 → 提示条显示"暂无收藏音乐，请先收藏一些歌曲"，2.5s 消失，播放不中断
7. 重启应用 → 收藏模式自动恢复（localStorage）
8. 取消激活 → 恢复完整列表与完整范围播放，当前歌不中断

- [ ] **步骤 4：收尾 Commit**（若手工验证发现需微调，与修复一并提交）

```bash
git status
git add -A
git commit -m "chore: final polish for favorites play mode"
```

---

## 自检记录（编写时已核对）

1. **规格覆盖度**：规格 5.1（状态/重建时机）→ 任务 2+6；5.2（按钮）→ 任务 4；5.3（播放范围）→ 任务 5；5.4（边界）→ 任务 5 步骤 1/2 + 任务 6 步骤 1；5.5（渲染）→ 任务 6 步骤 3；5.6（持久化）→ 任务 4 步骤 1；5.7（提示条）→ 任务 3 + 任务 4 步骤 1；§6（测试）→ 任务 1 + 任务 7。
2. **占位符扫描**：无"待定/TODO/适当处理"类表述，所有代码步骤含完整代码块。
3. **类型一致性**：`favoriteIndices`/`pendingReturnToFavorites`/`favoritesActive`/`getPlayablePool()`/`rebuildFavoriteIndices()`/`showTip()`/`els.tip` 在所有任务中命名一致；纯函数签名 `nextIndexInPool(pool, current, mode, rng?)`/`prevIndexInPool(pool, current)` 在任务 1 定义、任务 5 使用一致。
