# 模块2审查：IPC 层

审查对象：`src/main/ipc/index.ts`（2415 行，全部 IPC handler），并对照核查了 `src/main/main.ts`（musicfile/chatimg 协议、scheduleAutoSync、note-history、图片辅助函数）、`src/main/lib/security.ts`、`src/main/lib/json-io.ts`、`src/main/lib/logger.ts`、`src/main/services/search/chatAgent.ts`。

## 关键问题（必须修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 1 | src/main/ipc/index.ts | 1966-1970, 1992-1996（消费方 src/main/main.ts:2049-2055） | **音频白名单可被渲染进程任意扩充 → 任意文件读取**。`music:save-playlist` / `music:save-favorites` 对渲染进程传入的 `item.filePath` 仅校验 `path.isAbsolute`，随后 `approveAudioPath()`（行 108-113）只要求 `realpath` 成功即把该路径加入 `approvedAudioPaths` 集合，**不校验扩展名、大小、是否位于已批准目录**。而 `musicfile://audio/` 协议 handler（main.ts:2051）只检查 `approvedAudioPaths.has(realPath)` + 扩展名在 `MUSIC_MIME_MAP` 中 + 大小 ≤ 50MB，即放行流式读取。被攻陷的渲染进程（或本地恶意脚本）可把任意"存在且扩展名为音频格式（mp3/wav/m4a…）"的磁盘文件（如 `C:\Users\x\Documents\secret.mp3`）注册进白名单，再通过 `musicfile://audio/` 读取其内容。M4 的目录限制被完全绕过（`approveAudioPath` 是白名单唯一的、且不设边界的注册口）。 | 高 | `approveAudioPath` 注册前校验：扩展名 ∈ `MUSIC_AUDIO_EXTENSIONS` 且文件大小 ≤ 50MB（对齐协议 maxSize）；或 `save-playlist/save-favorites` 仅放行位于已批准扫描目录 / `getMusicDir()` 下的文件；同步收紧 `music:save-playlist` 的 `filePath` 校验（必须音频扩展名）。 |
| 2 | src/main/ipc/index.ts | 589, 592-663 | **备份恢复解压无大小/条目限制（Zip bomb + OOM）**。`sync:restore-backup` 将整个备份 ZIP 下载为内存 buffer（行 589），随后 `zip.getEntries()` + `entry.getData()` 把每个条目全部解压进内存（行 644），且**无总解压字节数、条目数上限**。恶意/损坏的备份（来自被攻陷的同步服务器或本地被替换的备份文件）可含高压缩比巨型条目 → 内存暴涨、磁盘被写满；且 `fs.writeFileSync`（行 637/661）同步写盘，恢复几十个文件时主进程被阻塞、UI 冻结。 | 高 | 下载前校验响应 Content-Length ≤ 上限（如 100MB）；解压时累计 `entry.getData()` 实际字节数，超过总上限（如 500MB）或条目数（如 5000）即中止；顶层恢复写盘改为异步、分批，避免一次性同步阻塞主进程。 |
| 3 | src/main/ipc/index.ts | 497（消费方 src/main/main.ts:1233-1238） | **`autoSyncInterval` 无范围校验 → 自动同步风暴**。`autoSyncInterval: data.autoSyncInterval \|\| 30` 未做数值范围校验：传负数（如 -5，truthy）时 `intervalMs` 为负，Node `setInterval` 按 ~1ms 触发；传超大值（> 2^31-1 ms，如 1e9 分钟）时触发 TimeoutOverflowWarning 并按 1ms 处理。两种情况都导致 `performSync` 被无限高频触发，持续产生网络请求与 CPU 占用。 | 中 | 校验为 `Number` 且 clamp 到合理区间（如 5-1440 分钟），非法值回退默认 30。 |
| 4 | src/main/ipc/index.ts | 1684（函数实现在 src/main/main.ts `fetchImageAsDataUrl`） | **AI 返回图片下载无大小限制 → OOM**。`ai:generate-image` 的 `item.url` 分支虽先经 `isSafeExternalUrlAsync` 校验 URL 安全，但 `fetchImageAsDataUrl` 内 `Buffer.from(await imgResp.arrayBuffer())` **不检查 Content-Length、不设上限**，把整个响应读入内存后再转 base64 写盘。AI 服务端异常/被攻陷时返回超大响应（数百 MB~GB）可导致主进程内存耗尽。 | 中 | 下载前校验 `resp.headers.get('content-length')` 与 `resp.body` 流式累积大小，超过 `MAX_IMAGE_SIZE` 上限（20MB）即 abort 并报错。 |
| 5 | src/main/ipc/index.ts | 745-765 | **`lock:set-pin` 无来源校验且可无验证覆盖旧 PIN**。与 `lock:clear-pin`（行 814，已加 `requireMainWindowSender` + 要求验证旧 PIN）不同，`lock:set-pin` 无任何来源/鉴权约束，被攻陷的 popout 窗口或渲染脚本可**直接覆盖已有 PIN**，之后用户无法用原 PIN 解锁应用（锁定攻击）。 | 中 | 加 `requireMainWindowSender(_event)`；当 `s.lockHash` 已存在时，要求先验证当前 PIN 才能重设（首次设置除外）。 |

## 重要问题（应修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|------|-----|------|--------|----------|
| 6 | src/main/ipc/index.ts | 680-741, 687 | **窗口控制通道全部无来源校验**。`window:close`（`app.quit()`）、`window:minimize`（隐藏主窗口）、`window:maximize`、`window:resize`、`alarm:show-window`、`toggle-pin`/`toggle-fixed` 均未校验 `event.sender`。被攻陷的 popout 窗口可退出整个应用、隐藏/缩放主窗口，破坏用户体验。M5 修复（`requireMainWindowSender`）仅覆盖了 sync 删除/恢复、清除 PIN 三个通道。 | 中 | 对 `window:*`、`alarm:*`、`toggle-*` 等控制类通道统一加 `requireMainWindowSender`（popout 自身控制走 `popout:*` 已有通道）。 |
| 7 | src/main/ipc/index.ts | 1393-1395 | **流式 chunk 推送无发送保护，且 `ai:chat` 无 tryWrap**。`onChunk: (evt) => sender.send('chat:chunk', evt)` 未 try/catch：若发起对话的 webContents 已销毁（如 popout 发起后关闭、主窗口关闭），`send` 抛错会中断整个流式对话（chatAgent.ts:217 的 `onChunk` 调用同样无保护），且异常不会记录到统一日志（`ai:chat` 是裸 handler）。 | 中 | onChunk 内 try/catch 忽略发送失败；`ai:chat` 包一层 tryWrap 或等价的错误日志处理。 |
| 8 | src/main/ipc/index.ts | 1047, 1044-1048 | **AI 配置字段无类型/范围校验**。`temperature: config.temperature ?? 1` 未校验数值类型与范围（可传字符串/NaN/超大值），`model`/`prompt` 无长度限制（仅靠 50MB payload 兜底）。脏数据会原样写入 settings 并发送给模型 API。 | 中 | temperature 校验为有限数值并 clamp 0-2；model/prompt 限长（如 256/32KB）并确认类型为 string。 |

## 次要问题/建议

| # | 文件 | 行 | 问题 | 建议 |
|---|------|-----|------|------|
| 9 | src/main/ipc/index.ts | 1236 | `chat:save-image` 用 `fs.writeFileSync` 同步写最大 ~20MB 图片，可能卡顿主进程 | 改 `await fs.promises.writeFile` |
| 10 | src/main/ipc/index.ts | 2095-2098 | `radio:get-servers` 将远端返回的 `it.name` 直接拼入 `'https://' + name + '.api.radio-browser.info'`，name 未做域名/字符校验（来源为 RadioBrowser API，风险低） | 对 name 校验 `^[a-z0-9-]{1,63}$` 后再拼接 |
| 11 | src/main/ipc/index.ts | 2122-2139 / 2188-2224 | `radio:get-topstations` 与 `radio:get-cnhk-music-stations` 共享同一缓存文件，前者 `saveJSON` 写入的对象不含 `cnhkMusic`/`fetchedAtCnHk` 字段，并发/交替写入会覆盖掉对方字段，导致缓存反复失效、重复拉取 | 两通道写入时基于最新 `cached` 做字段合并（后者已做 `Object.assign`，前者未做），或拆分为两个缓存文件 |
| 12 | src/main/ipc/index.ts | 729-741 | `window:resize` 只做下限 `Math.max(600/400, …)` 无上限，渲染进程可传超大值 | 增加上限（如 ≤ 屏幕工作区尺寸） |
| 13 | src/main/ipc/index.ts | 1434-1441 | `chat:abort` 无来源校验，popout 窗口可中止主窗口正在进行的对话 | 加 `requireMainWindowSender` |
| 14 | src/main/ipc/index.ts | 479-495 | `sync:save-config` 的 S3 endpoint / WebDAV url 未做内网地址校验（保存后可向内网地址发送含凭据的请求）；当前仅协议层 `validateAiBaseUrl` 不适用此处 | 权衡支持内网 NAS 场景的前提下，对非本机回环地址加提示或提供显式确认 |
| 15 | src/main/ipc/index.ts | 952-964 | `note-history:snapshot` 的 `content` 无大小限制，超大便签内容会写盘 | 对 content 设上限（如 5MB）或与 `assertPayloadSize` 对齐 |
| 16 | src/main/ipc/index.ts | 1666 | OpenAI 图片生成失败时 `resp.text()` 读入整个错误响应体无大小限制 | 限制读取长度（如前 4KB） |

## 做得好的地方

- **统一错误处理**：`tryWrap`（行 251-261）覆盖绝大多数 handle，捕获后写入日志并返回 `{success:false, message}`，未发现明显敏感信息泄露到渲染端。
- **Payload 大小限制**：`assertPayloadSize`（50MB）广泛应用于所有保存类通道（`wrapSaveHandler`）、`ai:chat`、`ai:generate`、`ai:generate-image/video`、`music:*` 保存、`radio:*` 保存等。
- **敏感通道来源校验**：`sync:delete-backup`/`sync:restore-backup`/`lock:clear-pin` 均要求主窗口 sender，且 `lock:clear-pin` 需验证当前 PIN。
- **路径穿越防护到位**：`noteId` 纯数字白名单校验（main.ts:1353）；聊天图片删除/读取统一 `path.normalize(path.join(dir, name))` + `startsWith(dir + sep)` 双重校验；ZIP 恢复拦截 `..` 段、绝对路径、盘符、`settings.json`，子目录仅白名单 `note_history`/`chat-images` 且文件名有正则校验。
- **SSRF 防护**：`isSafePublicStreamUrlAsync`/`isSafeExternalUrlAsync` 含 DNS 全记录解析校验（security.ts），`radio:save-config` 对自定义电台 URL 逐一异步校验；`shell:open-external` 限制 http/https 协议。
- **数据注入防护**：`incrementActivity` 对日期键正则 + `hasOwnProperty` 显式判断防原型污染；`settings:save` 字段白名单 + `bgColor` hex 格式校验、音量 0-300、字号 10-36 范围校验。
- **凭据处理**：`maskCred`/`isMaskedCred` 掩码回传，保存时不回写明文，`sync:save-config` 对掩码值保留旧密文。
- **资源管理**：`music:read-metadata` 的读取流在 `finally` 中 `rs.destroy()`；`AbortSignal.timeout` 覆盖全部 fetch；`ai:chat` 的 AbortController 采用同步"检查+赋值"消除 TOCTOU，`finally` 中清理 `chatAbortController`。
- **健壮性**：json-io 原子写入（tmp+rename）+ Windows EPERM 重试 + 损坏文件自动备份；`fetchModelsRateLimiter` 限速防滥用；`music:scan-folder` 有 MAX_FILES/深度限制。
- **正确性细节**：`ai:generate-image` 图生图按魔数嗅探真实 MIME/扩展名，避免 JPEG 被硬编码为 png；`chat:delete-images-batch` 对 `ENOENT` 不计为错误。

## 总体结论

IPC 层整体安全意识强、防护体系完整（路径穿越/SSRF/原型污染/凭据掩码均有覆盖且实现质量高），但音频文件白名单注册口缺少扩展名与目录边界校验（可被渲染进程扩充后借 `musicfile://` 协议读任意音频扩展名文件）、备份恢复解压无大小上限（Zip bomb/OOM），以及自动同步间隔、图片下载、PIN 重设等处的输入/来源校验缺失，是本次审查发现的真实风险点。
