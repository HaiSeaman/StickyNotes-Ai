# 音乐播放器「收藏夹播放模式」设计规格

日期：2026-08-12
状态：已批准（用户审查通过前视为草稿）

## 1. 背景与目标

音乐播放器（`src/renderer/tabs/musicTab.ts`）现有"仅显示收藏"按钮（`musicFavFilterBtn`）只过滤**列表显示**，不影响**播放**：开启后点击"下一首"，仍会在完整播放列表（含非收藏曲目）中切换。

**目标**：升级该按钮为"收藏夹播放模式"——激活后，**显示与播放都限制在收藏曲目范围内**。顺序播放只在收藏内顺序循环，随机播放只在收藏内随机。

**非目标**：
- 不改动电台播放器（`radioTab.ts`）
- 不新增独立按钮（复用现有按钮）
- 不改动收藏持久化格式（`music-favorites.json` 由主进程 IPC 管理）

## 2. 现状梳理

- `playlist: any[]`——完整播放列表，含全部曲目
- `favoritesMap: Record<string, any>`——按 `filePath` 的收藏映射，经 `window.api.musicLoadFavorites() / musicSaveFavorites()` 持久化
- `showFavoritesOnly: boolean`——仅过滤 `renderPlaylist()` 的显示，不影响播放
- `playMode: 'sequential' | 'shuffle' | 'single'`——播放模式三态切换
- `next() / prev() / playTrack()`——全部基于完整 `playlist` 索引操作
- `shuffleHistory`——随机模式历史栈（用于"上一首"回溯）

## 3. 需求确认（澄清结论）

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 入口 | 升级现有"仅显示收藏"按钮，激活后显示+播放都限收藏 |
| 2 | 激活瞬间（当前歌非收藏） | 当前歌**播完再切**进收藏范围 |
| 3 | 运行中取消收藏当前曲 | 同样**播完再切** |
| 4 | 空收藏夹 | 拦截激活并提示"暂无收藏音乐" |
| 5 | 状态持久化 | localStorage 记住收藏模式（参考现有 `music_volume`） |
| 6 | 范围 | 仅音乐播放器（musicTab），电台不动 |
| 7 | 单曲循环边界 | 保持循环不自动切，等用户手动点"下一首" |

## 4. 方案选型

- **方案 A（选定）：收藏索引池 + 待切标志**。维护 `favoriteIndices` 缓存 + `pendingReturnToFavorites` 标志，播放范围统一走 `getPlayablePool()`。索引语义清晰、显示与播放共用过滤源、维护集中。
- 方案 B：激活时重建 `playlist` 为收藏子集——与"播完再切"冲突（当前非收藏歌会被移出列表），持久化污染原列表，否决。
- 方案 C：播放时每次动态过滤计算——逻辑分散在每个索引使用点（点击、拖拽、删除、搜索），易漏改，否决。

## 5. 详细设计

### 5.1 状态与数据结构

```ts
let favoritesActive: boolean = false;        // 收藏模式开关（替换 showFavoritesOnly）
let favoriteIndices: number[] = [];          // 收藏索引池：playlist 中所有收藏曲目的索引
let pendingReturnToFavorites: boolean = false; // 待切标志：当前在播非收藏歌，下次切歌落回收藏池
```

- `favoritesActive` 持久化到 `localStorage['music_favorites_active']`（`init()` 时恢复）。
- `pendingReturnToFavorites` 为进程内状态，不持久化。
- `favoriteIndices` 在以下时机**全量重建**（从 `playlist` 中 `favorite === true` 的项推导）：
  - 初始化加载后
  - `toggleFavorite()` 收藏/取消收藏后
  - `deleteTrack()` 删除后（沿用现有 `shuffleHistory` 修正逻辑，池全量重建即可）
  - 拖拽排序落位后
  - 刷新文件夹/添加文件（重新构建 `playlist`）后

### 5.2 按钮行为（`toggleFavFilter` 升级为 `toggleFavoritesMode`）

- 点击激活时：若 `favoriteIndices.length === 0` → 拒绝激活，保持关闭，提示"暂无收藏音乐"。
- 激活成功：`favoritesActive = true` 并持久化；若当前曲（`playlist[currentIndex]`）非收藏 → 置 `pendingReturnToFavorites = true`（单曲循环模式下同样置位，等手动 next）。
- 取消激活：`favoritesActive = false`、清 `pendingReturnToFavorites`，恢复完整列表显示与完整范围播放；当前歌继续播放不中断。
- 按钮 `.active` 高亮、`title`/`aria-label` 文案同步更新（激活："取消收藏模式"；未激活："激活收藏夹播放"）。

### 5.3 播放范围（核心）

新增辅助函数：

```ts
function getPlayablePool(): number[] {
    // 收藏模式且池非空 → 收藏索引池；否则完整索引
    return favoritesActive && favoriteIndices.length > 0
        ? favoriteIndices
        : playlist.map((_, i) => i);
}
```

`next(autoNext?)` 改造：
- 若 `pendingReturnToFavorites`：
  - 顺序模式 → 播池内第一首
  - 随机模式 → 播池内随机一首
  - 清 `pendingReturnToFavorites`
- 否则：在池内定位 `currentIndex` 的位置，前进一格（顺序）；随机模式池内随机选 ≠ 当前。
- 池为空（运行中全部取消收藏）→ 走现有"停止并复位"逻辑（复用 `loadErrorCount` 全失败的处理方式：停止、复位播放状态、保持收藏模式、列表显示"暂无收藏音乐"）。

`prev()` 改造：
- 随机模式：优先历史栈回退（历史栈只含播放过的曲目，天然在池内；激活后若当前歌非收藏，回退逻辑保持现状）。
- 顺序模式：在池内后退一格，池首回池尾；若 `currentIndex` 不在池内（待切状态）→ 落池内第一首并清 pending。

`playTrack(index)` 改造：
- 手动点击列表曲目（收藏模式下列表已过滤，点击项必为收藏歌）：若 pending 置位且该索引在池内 → 清 pending，正常播放。
- `howl.on('end')` 触发 `next(true)` 时自然走 pending 逻辑，无需额外改动。
- 单曲循环（`playMode === 'single'`）：逻辑不变，一直循环当前歌；pending 保持挂起，用户手动 next 才落池。

### 5.4 边界处理

| 场景 | 处理 |
|------|------|
| 端到端：end 时收藏池为空 | 停止播放并复位状态，收藏模式保持，列表显示"暂无收藏音乐" |
| 收藏模式中取消收藏当前曲 | 置 pending，播完再切；该曲同时从显示列表消失 |
| 删除/拖拽/刷新文件夹 | 沿用现有索引修正逻辑，之后全量重建 `favoriteIndices` |
| 搜索 | 在收藏池内过滤（`renderPlaylist()` 中与 `trackMatchesSearch` 用 `&&` 组合，天然成立） |
| 收藏模式中全部取消收藏 | 池空，当前歌（非收藏）继续播完；end 时按"end 时池空"处理 |
| 激活时单曲循环且当前歌非收藏 | 保持循环不自动切，pending 挂起，手动 next 落池 |

### 5.5 渲染

- `renderPlaylist()` 过滤条件从 `showFavoritesOnly` 替换为 `favoritesActive`（语义升级，同一变量）。
- 空列表提示文案沿用现有逻辑：`playlist.length === 0` → "点击「+文件」或「+文件夹」添加音乐"；`favoritesActive` 且池空 → "暂无收藏音乐"。

### 5.6 持久化

- `favoritesActive` → `localStorage['music_favorites_active']`，`init()` 时恢复，按钮初始态同步。
- `favoriteIndices`、`pendingReturnToFavorites` 不持久化（可由播放列表 + 收藏映射重建）。

## 6. 测试

- 将"池内导航"抽为纯函数（如 `nextIndexInPool(pool, current, mode)` / `prevIndexInPool(pool, current)`）放入 `src/renderer/lib/rendererUtils.ts`，添加 vitest 单元测试（与现有 `tests/rendererUtils.test.ts` 风格一致）。
- 覆盖：顺序前进/回退、池首回池尾、随机 ≠ 当前、待切落池内第一首。
- 其余行为以 `npm run typecheck` + 手工验证（激活/取消/空收藏/取消收藏当前曲/单曲循环等场景）。

## 7. 影响面

- `src/renderer/tabs/musicTab.ts`（主要改动）
- `src/renderer/lib/rendererUtils.ts`（新增纯函数）
- `tests/rendererUtils.test.ts`（新增用例）
- 无主进程改动；无 IPC 契约改动；无 UI 布局改动（复用现有按钮）。
