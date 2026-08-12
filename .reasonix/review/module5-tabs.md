# 模块5审查：tabs+preload+types

审查范围：musicTab.ts / radioTab.ts / calendarTab.ts / preload.ts / popout-preload.ts / entities.ts / ipc.ts / index.ts / global.d.ts
审查方式：全部逐行阅读 + 关键结论对照主进程 handler 验证（src/main/ipc/index.ts、src/main/main.ts、src/main/lib/state.ts）。

## 关键问题（必须修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 1 | src/renderer/tabs/radioTab.ts | 872-902（赋值在 889） | **搜索请求竞态**：`searchStations` 无请求序号守卫，两次快速搜索（或搜索+刷新）并发时，慢的旧请求晚返回会覆盖新结果（`stations = result.stations`）。200ms 防抖只能减缓不能消除。 | 高 | 引入自增请求 id 或 AbortController：发起搜索前 `searchReqId++`，回调内 `if (reqId !== myId) return;` 丢弃过期响应；`radioSearch` IPC 也建议支持取消。 |
| 2 | src/renderer/tabs/calendarTab.ts | 640-680 | **saveTodo/deleteNote 持久化失败不回滚内存**：`globalNotes.push/splice` 后 `await saveNotesFn()` 失败（catch 仅 console.error + alert），内存数组已改动但磁盘未落，UI 随后 `renderMonthView`/`selectDate` 渲染的是未持久化数据。与同文件 `addAlarm`/`removeAlarm`（501-593）的精确回滚模式不一致。 | 高 | 仿照 addAlarm：先快照被删对象/索引，catch 中按原位置回滚 `globalNotes` 后再提示；或先 await 保存成功再改内存。 |

## 重要问题（应修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 1 | src/renderer/tabs/musicTab.ts | 285-299 / 320-336 / 354-381 | **批量添加/扫描性能**：循环内 `await fetchMetadata()` 逐文件串行 IPC（2000 文件 = 2000 次往返，文件夹重扫会卡顿数十秒）；去重 `playlist.some(t => t.filePath === f.filePath)` 为 O(n²)（2000 文件约 400 万次比较）。 | 中 | 用 Set 缓存现有 filePath 做 O(1) 去重；元数据解析分批并发（如每批 20 个 `Promise.all`），或让主进程 scan 时一并返回元数据避免逐条 IPC。 |
| 2 | src/renderer/tabs/radioTab.ts 784 / src/main/main.ts 1881-1896 | **favicon 外部 URL 未校验协议**：主进程 `radioNormalizeStation` 只对 `url`（音频流）做 `^https?://` 白名单，`favicon` 仅截断长度后原样下发，渲染层 `icon.src = s.favicon` 直接使用。恶意电台可返回 `file://` 或 `http://127.0.0.1:port/...` 的 favicon，造成本地文件存在性探测（onerror 旁路）与内网 SSRF 探测。 | 中 | 主进程归一化时对 favicon 同样校验 http/https（不匹配置空），渲染层再兜底校验一次并回退 `defaultStationSvg()`。 |
| 3 | src/types/ipc.ts 138-144 / 18-133；src/renderer/types/global.d.ts 6-9 | **IPC 类型契约与实现严重脱节**：`IpcEventMap` 仅声明 4 个通道，而 preload.ts 实际监听的 `sync:restore-done`、`sync:auto-result`、`app-saving-before-quit`、`pin-changed`、`fixed-changed`、`chat:chunk`、`popout-note:update/closed`、`popout-todo:update/closed` 及 popout-preload 监听的 `popout-note:push`、`popout-todo:push`、`popout-pin-changed` 全部缺失；`IpcChannelMap` 也缺 `music:load/save-favorites`、`music:load/save-folders`、`music:ensure-thumbs`、`radio:load/save-config`、`radio:get-servers`、`radio:get-cnhk-music-stations`、`radio:get-stations-by-source`、`radio:search`、`radio:load/save-favorites`、`radio:clear-cache` 等 13 个已暴露通道。而 global.d.ts 又把 `window.api` 声明为 `[key:string]: any`，等于完全绕过了上述契约。 | 中 | 补齐 IpcEventMap/IpcChannelMap 全部实际通道；global.d.ts 的 `api` 改为基于 `IpcChannelMap`/`IpcEventMap` 派生（`{ [K in keyof IpcChannelMap]: (...args: Parameters<IpcChannelMap[K]>) => Promise<ReturnType<IpcChannelMap[K]>> }`），让重构走类型检查。 |
| 4 | src/renderer/tabs/radioTab.ts | 328+339（loadStations）；392+403（loadCnHkMusicStations） | **同一流程重复全量重建列表 DOM**：定位 lastStationUrl 前后各调用一次 `renderStations(getDisplayStations())`（首次可能为空列表 → 先清空容器再填充），无谓的整表重建与 favicon 图片重新请求。 | 中 | 移除第一次 `renderStations`（329 行前），仅在定位完成后渲染一次；或改为先渲染再仅更新高亮 class。 |
| 5 | src/renderer/tabs/calendarTab.ts | 299-310 / 801-803 | **onTabDeactivated 未实际释放 resize 资源**：M9 注释声称"保存监听器引用以便 destroy() 中正确移除"，但 `onTabDeactivated` 只清 `hmResizeTimer`，`hmResizeObserver` 未 `disconnect()`、`hmResizeHandler` 未 `removeEventListener`，与注释不符（虽为单例应用影响有限）。 | 中 | 在 onTabDeactivated 中调用 `hmResizeObserver?.disconnect(); hmResizeObserver = null;` 及 `window.removeEventListener('resize', hmResizeHandler)`，并把 `bindHeatmapResize` 的 `if (hmResizeObserver) return` 守卫改为同时校验 handler 状态。 |

## 次要问题/建议

| # | 文件 | 行 | 问题 | 建议 |
|---|------|-----|------|------|
| 1 | src/renderer/tabs/musicTab.ts | 914-921 | `cover.onerror` 末级回退 `cover.src = defaultCoverSvg()`：若 data URL 极端情况下加载失败会再次触发 onerror 形成循环（每次渲染新建闭包，循环不可见）。 | onerror 中加标志位（如 `cover.dataset.fallbackDone`）只允许回退一次。 |
| 2 | src/renderer/tabs/calendarTab.ts | 733-740 | `initCalendar` 的 DOM 缺失检查不完整：`elAlarmTime`、`elDayAlarmList`、`elNoteList`、`elDetailDate` 等未校验，HTML 结构变化时 `saveAlarm`/`saveTodo`/`renderDayDetail` 会抛 TypeError。 | 将全部引用元素纳入 missing 检查或统一守卫。 |
| 3 | src/renderer/tabs/radioTab.ts | 496-506 | `togglePlay` 暂停分支未更新状态文本（`updateStatus`），暂停后状态栏仍停留在上次文案（如"切换中..."）；暂停后 src 被移除，`currentStation` 保留但无提示。 | 暂停时 `updateStatus('已暂停')` 并同步清除 `config.lastStationUrl` 相关 UI。 |
| 4 | src/preload/preload.ts | 134 | `reportLogsSync` 使用 `ipcRenderer.sendSync` 会阻塞渲染进程，主进程 handler 若有磁盘/日志写入慢操作会卡住界面。 | 确认 `log:report-sync` handler 只做轻量内存操作；否则改用 `invoke` 或异步 `send`。 |
| 5 | src/renderer/tabs/musicTab.ts | 866-991 | `renderPlaylist` 每次全量重建列表（含封面 `<img>` 重新加载）；搜索输入 200ms 防抖下逐字触发仍会频繁整表重建。 | 列表项 keyed 复用（virtualized 或 patch 差异），或至少对封面 img 加 `src` 复用判断。 |
| 6 | src/renderer/tabs/radioTab.ts | 755-828 | `renderStations` 全量重建（含 favicon 网络请求）；切 tab/刷新/收藏筛选高频触发。 | 对 favicon 做内存级 URL 缓存或 keyed 复用，避免重复网络请求。 |
| 7 | src/renderer/tabs/calendarTab.ts | 321-390 | `renderMonthView` 每次切月/增删闹钟/便签全量重建 42 个单元格并重新绑定 click。 | 42 节点开销不大，可接受；如需优化可复用 cell 节点仅更新 class/内容。 |
| 8 | src/renderer/types/global.d.ts | 10-16 | `window.api/popout/Howl/Howler/marked/DOMPurify` 全部 `any`，类型安全缺失（musicTab 已直接 import Howl 类型，但全局声明仍为 any 会造成误用）。 | 为 popout 补充 `typeof popout` 派生类型；Howl 改用 `howler` 包自带类型。 |
| 9 | src/types/entities.ts | 129-139 | `RadioStation.favicon`/`homepage` 无任何 URL 约束（配合重要问题 2）。 | 类型上注明"须为 http(s) 或空"，主进程归一化强制。 |
| 10 | src/renderer/tabs/calendarTab.ts | 676-677 | `deleteNote` catch 中 `'删除便签失败：' + e.message`：`e` 为非 Error 时 `e.message` 为 undefined，提示语异常，且失败后仍渲染已删状态（同关键问题 2）。 | 用 `(e && e.message) || e` 兜底，并先回滚再提示。 |
| 11 | src/preload/preload.ts | 7-12 | `makeInvoke`/`makeSend` 对参数零校验，全凭主进程兜底；通道名编译期固定无注入面，属可接受但建议对入参做最小类型断言，防渲染层误传大对象撑爆 IPC（主进程已有 `assertPayloadSize` 兜底）。 | 对已知敏感通道（saveCalendar、musicSavePlaylist、radioSaveConfig）在 preload 层做浅层类型/大小检查。 |
| 12 | src/renderer/tabs/musicTab.ts | 53-69 | 三个 `saveXxxDebounced`（播放列表/收藏/文件夹）无 `.flush()` 调用点：用户改完立刻关窗（before-quit 流程外的异常退出）可能丢最近 1.5s 改动。 | 在 `onMusicTabDeactivated` 或 renderer.ts 的 `before-quit` 回调中统一 `flush()`。 |

## 做得好的地方

- **preload 纵深防御**：contextBridge 暴露面大但主进程对每个危险入口都有校验——`shell:open-external` 协议白名单（http/https，main/ipc/index.ts:690-702）、`musicfile://` 批准路径集合（main/lib/state.ts:22-27，防任意本地文件读取）、`chat:delete-image(s)` 路径目录校验（main/ipc/index.ts:1248-1251、1267-1268）、radio 音频 URL `^https?://` 归一化（main/main.ts:1881-1896）。没有发现可被直接利用的高危 IPC 入口。
- **preload 回调安全**：`safeCb` 统一包裹渲染层回调异常；`makeListener` 返回取消函数，避免监听器无法注销。
- **musicTab 资源管理**：`destroyCurrentHowl` 完整执行 `off()+stop()+unload()` 并清理进度定时器；end 事件用 `setTimeout`+实例守卫避免手动切歌竞态；`loaderror` 全失败计数防无限自动切歌；进度刷新 4fps 替代 60fps rAF。
- **musicTab 拖拽排序**：监听器仅在 init 注册一次（模块级 `dragSrcIdx`），避免每次 render 重复累积；过滤视图下禁用拖拽防止局部列表排序污染全局播放列表。
- **radioTab 错误处理**：`streamErrorHandled` 守卫防止 error 事件/play() 拒绝/10s 超时三重触发导致错误计数翻倍；`isBenignPlayRejection` 正确区分切换/暂停引起的 AbortError；列表用 `data-url` 而非 `data-index` 标识，规避收藏筛选后索引错位。
- **calendarTab 数据一致性**：闹钟用唯一 id 删除（M10）而非数组下标；`addAlarm`/`removeAlarm` 精确回滚 + await saveData；`dataReady` 门控导航按钮防 loadData 竞态；热力图按版本号增量更新，数据未变时零 DOM 重建。
- **XSS 防护**：三个 tab 均用 `createElement/textContent` 渲染外部/用户数据，未发现 innerHTML 拼接注入点；radio 电台名/国家/标签、音乐标题/艺术家均以 textContent 输出。

## 总体结论

- 无高危安全漏洞（preload 暴露面大但有主进程白名单兜底），核心问题集中在 radioTab 搜索竞态、calendarTab 保存失败不回滚与 IPC 类型契约失效三处，另有音乐批量扫描性能、favicon URL 未校验等应修复项。

问题统计：关键 2 / 重要 5 / 次要 12
