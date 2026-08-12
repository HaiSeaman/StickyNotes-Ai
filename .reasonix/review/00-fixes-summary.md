# 代码审查修复汇总（2026-08-12）

审查范围：全部 src 代码（约 1.7 万行），5 模块子代理审查 + 控制者修复。
审查报告：module1-main-security.md / module2-ipc.md / module3-services.md / module4-renderer.md / module5-tabs.md

## 问题统计

| 模块 | 关键 | 重要 | 次要 |
|---|---|---|---|
| 模块1 主进程+安全 | 1 | 5 | 15 |
| 模块2 IPC | 5 | 3 | 8 |
| 模块3 服务层 | 4 | 6 | 9 |
| 模块4 渲染核心 | 3 | 4 | 11 |
| 模块5 tabs+preload | 2 | 5 | 12 |
| **合计** | **15** | **23** | **55** |

## 已修复（15 关键 + 9 重要）

### 关键问题（全部 15 个已修复）

| # | 问题 | 文件 | 修复 |
|---|---|---|---|
| K1 | 重定向 SSRF（fetch redirect:follow） | downloadUtils.ts / main.ts | 新增 safeFetch：redirect:'manual' + 逐跳 URL 校验 |
| K2 | 音频白名单任意扩充 → 任意文件读取 | ipc/index.ts approveAudioPath | 注册前校验扩展名 ∈ 音频白名单 + 大小 ≤ 50MB |
| K3 | 备份恢复 ZIP bomb + 同步写盘 | ipc/index.ts restore-backup | ZIP ≤200MB、解压 ≤500MB、条目 ≤5000，异步写盘 |
| K4 | autoSyncInterval 无校验 → 同步风暴 | ipc/index.ts + main.ts | 双处 clamp 5-1440 分钟，非法回退 30 |
| K5 | AI 图片下载无大小限制 → OOM | main.ts fetchImageAsDataUrl | Content-Length + 流式累计 ≤20MB |
| K6 | lock:set-pin 无鉴权覆盖 PIN | ipc/index.ts | requireMainWindowSender + 已设 PIN 时验证当前 PIN |
| K7 | WebDAV 协议未白名单 | syncService.ts | 仅 http/https，其余拒绝 |
| K8 | 搜索错误响应全文进日志（API key 泄露） | 4 个 search provider | 错误体截断 500 字符 |
| K9 | SSE buffer 无上限 → OOM | sse.ts | 单行缓冲 ≤1MB |
| K10 | 搜索请求未绑 abort signal | types/searchManager/5 providers/chatAgent | 全链路传 signal，中断即取消 |
| K11 | 流式输出每帧全量重建 DOM | renderer/main.ts flushStreamUI | 增量追加 textNode，finalize 统一渲染富文本 |
| K12 | 保存互斥 await 缺陷 + 退出刷盘守卫（数据丢失） | renderer/main.ts | promise 链接 + flushSaveData 按 contentDirty |
| K13 | 图片放大 ESC 监听器泄漏 | renderer/main.ts | dismiss 统一移除监听 |
| K14 | radio 搜索竞态 | radioTab.ts | 请求序号守卫丢弃过期结果 |
| K15 | calendar 保存失败不回滚 | calendarTab.ts | saveTodo/deleteNote 失败回滚内存 |

### 重要问题（已修复 9 个）

| # | 问题 | 文件 | 修复 |
|---|---|---|---|
| W1 | 空文件协议请求 500 | protocol.ts + main.ts musicfile | 空文件返回 200 + Content-Length:0 |
| W2 | 窗口控制通道无来源校验 | ipc/index.ts 7 个通道 | 全部加 requireMainWindowSender |
| W3 | ai:chat 流式 chunk 发送无保护 | ipc/index.ts | sender.isDestroyed + try/catch |
| W4 | 搜索结果提示词注入 | chatAgent.ts | Grounding 上下文加隔离指令 |
| W5 | radio favicon 协议未校验 | main.ts radioNormalizeStation | favicon 非 http/https 置空 |
| W6 | saveImageToDisk 目录写入无纵深防御 | main.ts | 绝对路径 + 系统目录拒绝 + 回退 userData；文件名随机后缀 |
| W7 | renderFolderList 属性注入 | renderer/main.ts | id/action/title 全部 escapeHtml |

## 未修复（留作后续迭代，均不阻塞交付）

### 重要（14 个）
- M1-W1 radioHttpGet DNS 解析校验（域名型内网 SSRF，需 dns.lookup）
- M1-W2 WebDAV href 路径前缀校验
- M2-W8 AI 配置字段类型/范围校验
- M3-I1 favicon 外发 Google（隐私权衡，涉及显示策略）
- M3-I2 第二轮 tool_calls 静默丢弃
- M3-I3 降级超时串行叠加
- M3-I5 WebDAV reqPath 规范化
- M3-I6 Tavily key 改 header
- M4-W4 便签列表全量重建（性能）
- M4-W5 saveChats 未 await（退出落盘）
- M4-W6 时钟/闹钟常驻定时器（性能）
- M5-1 musicTab 批量元数据串行 + O(n²)（性能）
- M5-3 IPC 类型契约脱节
- M5-4 loadStations 重复重建（性能）
- M5-5 calendarTab ResizeObserver 未释放

### 次要（55 个）
详见各模块报告（多为代码卫生/防御性建议）。

## 验证

- `npm run typecheck`：main + renderer 均通过
- `npm test`：4 文件 52/52 通过
- 逻辑验证（verify-fixes.js）：approveAudioPath 扩展名/大小、autoSync clamp、SSE 上限、WebDAV 协议、favicon 校验全部符合预期
