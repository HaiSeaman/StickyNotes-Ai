# 模块4审查：渲染进程核心

审查范围：`src/renderer/main.ts`（5796 行）、`src/renderer/lib/rendererUtils.ts`、`src/renderer/lib/shared-utils.ts`
审查维度：安全 / 正确性 / 性能 / 可维护性

---

## 关键问题（必须修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 1 | src/renderer/main.ts | 2710-2725（核心 2719） | **流式输出每帧全量重建气泡 DOM**。`flushStreamUI` 在每个 rAF 帧调用 `renderContentWithCitations(streamBubble, streamedContent + '▌', ...)`，而该函数第一行即 `container.textContent = ''`（2172），随后用正则 `split` 全文并重建全部文本节点/折叠块/引用角标。一次长回复产生数百个 chunk，每秒 60 帧、每帧重建整个内容树，DOM 节点创建与 GC 压力随回复长度线性膨胀，长回复时明显卡顿（与"大量 appendChild"审查点直接对应）。 | 高 | 流式阶段不要清空重建：维护一个"已渲染前缀长度"，仅对新增文本增量 appendChild（先折叠块渲染，之后普通文本只追加一个 textNode）；仅当折叠块边界/引用角标跨越新内容时才重建。或者降低刷新频率（如每 100-150ms 且仅内容量增长超阈值时）。 | 
| 2 | src/renderer/main.ts | 450-471（saveTodosToDisk 同构 476-498）；**连带缺陷 406-412** | **保存互斥的 await 语义缺陷 + 退出刷盘守卫缺陷，存在数据丢失窗口**。①互斥逻辑：当有保存 in-flight 时，新调用方 `savePending=true` 并直接 `return saveInFlight`（返回的是"旧数据那次"保存的 promise），真正包含本次数据的递归保存（467-470）在旧保存完成后才启动，新调用方等不到它。②`flushSaveData`（406-412）只在 `if (saveTimer && contentDirty)` 时才保存便签——而 `deleteNote`（697）/`archiveNote`（719）/`switchNote`（740）/`createNote`（764）都会 `clearTimeout(saveTimer)` 但**不清 contentDirty**，此时守卫恒为 false，退出前不落盘。叠加场景：输入内容 V2（contentDirty=true，saveTimer 排队）→ 500ms 内执行 deleteNote（清 saveTimer，其 `await saveNotesToDisk()` 等到的是在途旧保存，V2 的递归保存尚未启动）→ 立即关窗 → beforeunload 不保存，V2 丢失。 | 高 | ①将"排队"改为"链接 promise"：`savePending` 时令 `saveInFlight = saveInFlight.then(executeSave)` 并返回新 promise，让调用方 await 到包含自身数据的那次落盘；②`flushSaveData` 改为 `if (contentDirty)` 即保存（saveTimer 为 null 不代表无未落盘数据），或直接无条件保存 `notes` 数组。 |
| 3 | src/renderer/main.ts | 5067-5069 | **图片放大弹窗的 ESC 监听器泄漏**。`document.addEventListener('keydown', escHandler)` 只在按 ESC 时移除；若用户点击遮罩/关闭按钮关闭弹窗（`dismiss` 即 `overlay.remove()`，5065），`escHandler` 永远留在 `document` 上。每次打开图片放大都新增一个常驻 keydown 监听，长时间使用后监听器累积。 | 中 | 在 `dismiss` 函数内同时 `document.removeEventListener('keydown', escHandler)`，或用 AbortController 统一清理。 |

---

## 重要问题（应修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 4 | src/renderer/main.ts | 983（函数体 589-628） | **输入自动保存时全量重建便签列表**。`handleContentInput` 的 500ms saveTimer 回调每次都 `renderNoteList()`，后者清空 `noteList` 并逐个 `div.innerHTML=...` 重建所有便签卡片（含搜索过滤）。输入时每 500ms 一次 O(n) 重建，几百条便签时列表闪烁且浪费。 | 中 | 保存回调只更新当前便签的标题/时间节点（按 `data-id` 定位），或引入脏标记只重建受影响条目；搜索时仍可全量重建。 |
| 5 | src/renderer/main.ts | 2804（同类 2602） | **`saveChats()` 未 await**。流式回复结束、追加 assistant 消息后直接 `saveChats()`（fire-and-forget IPC），若随后立即退出/崩溃，最后一条消息可能未落盘。`beforeunload`（421-436）也只刷便签/待办，不刷聊天。 | 中 | 在 `beforeunload`/`onAppSavingBeforeQuit` 中补一次聊天保存；或对 `saveChats()` 同样做串行化并 await 关键路径。 |
| 6 | src/renderer/main.ts | 5760-5761 | **两个每秒常驻定时器在 tab 不可用时仍运行**。`clockTimerId`（updateClock，每秒更新 3 个 DOM 节点）与 `alarmTimerId`（checkAlarms）在应用整个生命周期每 1 秒触发，即使闹钟页从未打开。倒计时未运行、无闹钟时也是空转。 | 低 | 时钟仅当 `clock` tab 激活时运行（tab 切换时启动/停止）；闹钟检查可降频到 30s 一次并做秒对齐判断，仅在存在 enabled 闹钟时保持 1s 精度。 |
| 7 | src/renderer/main.ts | 271 | **`renderFolderList` 的属性值未转义**。`data-id="' + it.id + '"`、`data-action="' + restoreAction + '"`、`title="' + restoreTitle + '"` 直接拼接进 innerHTML。虽然 `id` 由 `genId()` 生成、action 是常量，但 items 数据来自磁盘 JSON 文件，被篡改后存在属性注入风险（如 `id=' onmouseover=...`）。 | 低 | 用 `String(it.id).replace(/"/g,'&quot;')` 或改用 `el.dataset.id = it.id` + `createElement` 构建节点。 |

---

## 次要问题/建议

| # | 文件 | 行 | 问题 | 建议 |
|---|------|-----|------|------|
| 8 | src/renderer/main.ts | 5428-5439 | 闹钟数据（label/note 等）明文存 localStorage，无校验 `parsed` 元素的字段类型（若为对象数组但字段缺失，`a.sound` 等不会崩溃，但脏数据可传播到 UI）。 | 保存前 `alarms` 做一次字段清洗/长度限制；如涉及隐私可移入主进程 JSON 文件。 |
| 9 | src/renderer/main.ts | 2230 | 引用角标点击的 `window.open(sourceItem.url, '_blank', 'noopener,noreferrer')` 兜底分支未校验 URL 协议（`sourceItem.url` 来自 AI 搜索结果，可能为任意字符串）。 | 兜底前校验 `/^https?:\/\//i`，否则丢弃；优先依赖 `openExternalUrl`（主进程侧已有校验）。 |
| 10 | src/renderer/main.ts | 通篇 | 类型安全弱：`notes/todos/aiChats` 等核心数据全部 `any[]`，PALETTE、ICONS、大量 DOM 引用用 `any`，静态检查几乎失效。 | 引入 `entities.ts`/`ipc.ts` 中已定义的接口；关键数据模型至少定义 `Note/Todo/Chat/Message` 类型。 |
| 11 | src/renderer/main.ts | 5769-5770 | 为兼容 calendarTab 把 `window.notes` / `window.alarms` 全局暴露（Object.defineProperty getter），隐式全局耦合，无法被 tree-shaking/类型检查覆盖。 | 改为显式依赖注入：calendarTab 通过参数接收数据或提供 `setData()` 接口。 |
| 12 | src/renderer/main.ts | 2870、1694 | 使用原生 `confirm()` 确认删除会话/清空日志，样式与应用不一致且阻塞。 | 换成应用内确认弹层或 toast 撤销机制。 |
| 13 | src/renderer/main.ts | —（功能缺失） | 聊天输入框/便签输入不支持**粘贴图片**或**拖拽图片**（全文件仅 PIN 输入框有 paste 处理，3336；聊天图片只能走 file input 选择）。 | 在 `chatInput`/`noteInput` 加 paste/drop 监听，图片转为文件经现有 `addChatAttachments` 链路处理。 |
| 14 | src/renderer/lib/rendererUtils.ts | 26-44 | `debounce` 只有 `flush` 无 `cancel`；`bindFolderSearch` 等场景关闭面板后 pending 的 debounce 仍会触发一次重渲染。 | 增加 `cancel()` 方法，模态关闭时调用。 |
| 15 | src/renderer/main.ts | 875 与 189-191 | 归档按钮内联 SVG（875 行）与 `ICONS` 常量（189-191）重复定义，后者未复用。 | 统一从 `ICONS` 取用。 |
| 16 | src/renderer/main.ts | 3176 | `positionPanel` 直接 `document.querySelector('.titlebar').getBoundingClientRect()`，元素缺失时抛错（当前 HTML 存在，仅为防御性建议）。 | 加空值守卫。 |
| 17 | src/renderer/main.ts | 320、2265、3010-3013 等 | 大量一次性 `setTimeout`（按钮反馈恢复、flashBtn）未跟踪清理；节点销毁后回调仍执行（对已移除元素无副作用，但属无害残留）。 | 可用 AbortController/组件生命周期统一管理；优先级低。 |
| 18 | src/renderer/main.ts | 2398 | `removeChat` 中"删除全部会话后自动新建空会话"的兜底对象用 `id: Date.now()`（而非 `newChat` 2364-2365 修复采用的 `genId()`），同一毫秒内删除多个会话会产生重复 id，与 2364 的注释修复意图相悖。 | 改为 `genId()`。 |

---

## 做得好的地方

- **Markdown 渲染链路安全**（5078-5096）：`marked.parse` 后必经 `DOMPurify.sanitize`，白名单标签 + `ALLOW_DATA_ATTR:false` + `ALLOWED_URI_REGEXP`（仅 https/chatimg/data:image）双重防线，且带 try/catch 兜底，未发现绕过路径。
- **聊天富文本渲染零 innerHTML 注入**（2171-2240）：`renderContentWithCitations` 全程使用 `createTextNode`/`textContent`/`createElement`，引用角标、折叠块、统计信息全部 DOM API 构建，模型输出不被当 HTML 解析。
- **通用渲染函数防 XSS 意识统一**：`renderFolderList`（240-281）、`renderAlarmList`（5504-5514）、`renderNoteList`（607-611）对用户文本均先 `escapeHtml`；`buildStatsDom` 用 `textContent` 渲染模型名（2247 注释明确注明防 XSS）。
- **日志批量上报 + 崩溃兜底**（329-398）：20 条/2 秒节流上报，`beforeunload`/`error`/`unhandledrejection` 时 `sendSync` 同步 flush，日志链路健壮。
- **竞态防护意识强**：`switchNoteToken` 防快速切换闪烁（737-755）、`createNoteInProgress` 重入锁（758）、流式结束时校验会话是否仍存在再写数据（2799-2801）、`suppressPushToPopout` 防 IPC 回环（968）。
- **退出数据保全完整**（421-443）：beforeunload 补发 popout 推送、刷便签/待办、清理时钟/闹钟定时器，并监听主进程 `onAppSavingBeforeQuit`。
- **性能优化已做的部分**：流式 DOM 更新有 rAF 节流（2727-2731）、聊天消息增量 `appendMessageDom` 避免全量重建（2318-2323）、`renderAlarmListInfoOnly` 只更新文本不重建 DOM（5627）、DocumentFragment 批量插入（595、845、5480）。
- **健壮性细节**：视频生成返回路径做绝对路径正则校验（3126）、闹钟补触发窗口防休眠错过整秒 + 跨天重置 triggered（5567-5624）、`toISODate` 防时区偏移、聊天图片 dataUrl 一次性迁移落盘（2456-2493）解决 localStorage 膨胀。

---

## 总体结论

渲染进程整体工程质量高：XSS 防线（Markdown 净化、innerHTML 克制使用）扎实、竞态与退出保全考虑周全；主要风险集中在 AI 流式输出的逐帧全量 DOM 重建与便签列表的全量重绘两个性能热点，以及保存互斥 await 语义下的窄窗口数据丢失，建议优先修复。

**问题统计：关键 3 / 重要 4 / 次要 11**

报告路径：`D:\AI\Github\AI-StickyNotes\StickyNotes-Ai - TS\.reasonix\review\module4-renderer.md`
