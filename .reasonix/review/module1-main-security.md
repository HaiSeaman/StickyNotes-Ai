# 模块1审查：主进程核心+安全

审查范围：`src/main/main.ts`（2181 行）、`src/main/lib/` 下 protocol.ts / security.ts / paths.ts / json-io.ts / logger.ts / downloadUtils.ts / shared-utils.ts / sse.ts / state.ts / popoutTemplate.ts，以及交叉引用的 `syncService.ts`（webdavRequest / parseWebdavPropfindXml）。
审查方法：逐文件阅读 + 针对关键安全假设做了 3 组本地运行验证（Node http.request path 绝对 URL 是否覆盖 hostname、CRLF 头注入、空文件 createReadStream end=-1）。

## 关键问题（必须修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|---|---|---|---|---|
| K1 | src/main/lib/downloadUtils.ts / src/main/main.ts | 29 / 1483 | **重定向 SSRF**：`streamDownloadToFile` 对初始 URL 做了 `isSafeExternalUrlAsync` 校验后 `fetch(videoUrl, fetchOptions)` 未指定 `redirect`，undici fetch 默认 `redirect:'follow'`，重定向目标（Location 头）未做任何校验。恶意/被入侵的下载源或百炼 API 可 302 到 `http://127.0.0.1`、`http://169.254.169.254` 等内网地址，客户端会跟随并访问内网服务（SSRF）。`fetchImageAsDataUrl`（main.ts:1483）存在完全相同的模式。 | 关键 | 两者都改为 `redirect: 'manual'`，手动循环处理 3xx，对每个 Location 重新执行 `isSafeExternalUrlAsync`/`isSafePublicStreamUrlAsync` 校验后再跟随；无校验通过则拒绝。 |

## 重要问题（应修复）

| # | 文件 | 行 | 问题 | 严重度 | 修复建议 |
|---|---|---|---|---|---|
| W1 | src/main/main.ts | 1810-1868 | **radioHttpGet 域名型内网 SSRF**：只做词法 `isPrivateOrLoopbackHost` 校验（能拦 IP 字面量、`.local`/`.internal`），不做 DNS 解析校验。电台 URL 来自 radio-browser 公共数据库（第三方可提交），攻击者可提交指向内网的普通域名（DNS 解析到 192.168.x.x），用户点击播放后客户端即向内网发起 HTTP 请求。 | 重要 | 发起请求前先 `dns.promises.lookup(host, {all:true})`，任一解析结果落在内网则拒绝（复用 `isSafePublicStreamUrlAsync` 的解析逻辑）；HTTP 版同理。 |
| W2 | src/main/main.ts | 1115-1142（配合 syncService.ts 257-293） | **WebDAV delete/download 的 href 无路径前缀校验**：`deleteWebdavBackup`/`downloadWebdavBackup` 的 href 直接来自服务器 PROPFIND 返回（`parseWebdavPropfindXml`），未校验为相对路径且位于配置路径前缀内，`../` 或任意路径可导致对同服务器其他位置的删除/读取（与 S3 的 pathPrefix 校验不一致，main.ts:972-975）。注：已实测 Node `http.request` 的 `path` 传绝对 URL **不会**覆盖 hostname（请求仍发往配置的 WebDAV 服务器），故不构成跨主机 SSRF，但路径越界与无前缀校验是实打实的。 | 重要 | 对 href 做校验：必须以 `/` 开头、不含 `..` 段、并位于 `joinWebdavPath(baseUrl, pathPrefix)` 前缀内，否则拒绝。 |
| W3 | src/main/lib/sse.ts | 19-33 | **SSE buffer 无大小上限**：`buffer += decoder.decode(...)` 对无换行的超长行无长度上限。SSE 流来自用户配置的 AI API（不可信输入），恶意/故障源可让主进程内存无界增长（OOM）。 | 重要 | 每行累计超限（如 1MB）即截断/丢弃并断开该流。 |
| W4 | src/main/main.ts | 1465-1480, 1568-1584 | **saveImageToDisk/saveVideoToDisk 目录写入无函数内校验**：`cfg.imageSavePath` 直接作为写入目录，函数自身不做任何校验。目前仅靠 IPC 层 `ai:save-config` 的 M3 校验（ipc/index.ts:1483-1510，只挡 SystemRoot/Program Files/ProgramData 固定前缀）缓解，属于安全边界依赖调用方；未来 cfg 来源变化即任意目录写入。 | 重要 | 在函数内做纵深防御：校验绝对路径 + 拒绝系统目录前缀 + 默认回退 userData，与 IPC 层校验保持一致。 |
| W5 | src/main/lib/protocol.ts | 93-94（main.ts 2082-2083 同） | **空文件请求返回 500**：`fileSize === 0` 时 `end = fileSize - 1 = -1`，`fs.createReadStream(filePath, {start:0, end:-1})` **同步抛 ERR_OUT_OF_RANGE**（已实测验证），协议 handler 捕获后返回 500。空文件应返回 200 + `Content-Length: 0`。 | 重要 | 空文件提前短路返回 200 空响应；或 `end = Math.max(0, fileSize-1)` 并处理零长度。 |

## 次要问题/建议

| # | 文件 | 行 | 问题 | 建议 |
|---|---|---|---|---|
| M1 | src/main/lib/protocol.ts | 79 | 多段 Range（`bytes=0-1,3-5`）被正则只取第一段后仍返回 206 | 检测逗号多段则返回 416 或退化为完整 200 |
| M2 | src/main/lib/downloadUtils.ts | 64-72 | backpressure 等待 drain 期间若流 error，finally 中 `await done` 抛流错误，覆盖原始错误 | finally 内 `await done.catch(()=>{})`，保留原始错误 |
| M3 | src/main/lib/downloadUtils.ts | 38-43 | `resp.body` 为空时 `fs.writeFileSync` 同步写大 Buffer（500MB 上限），阻塞主进程 | 改用 `fs.promises.writeFile` |
| M4 | src/main/lib/sse.ts | 36-40 | abort/break 后仅 `releaseLock` 不 `cancel()`，底层流继续读取，资源未及时释放 | 非正常结束时 `reader.cancel()` |
| M5 | src/main/main.ts | 2028 | musicfile handler 中 `decodeURIComponent` 无 try-catch，非法百分号编码返回 500 而非 400（与 protocol.ts 的防御不一致） | 包 try-catch 返回 400 |
| M6 | src/main/lib/logger.ts | 152 | `appendLog`/`flushLogFile` 用 `appendFileSync` 同步写盘，高频日志阻塞主进程 | 改为异步队列 + 定时批量写 |
| M7 | src/main/lib/json-io.ts | 143, 187 | rename 降级路径用 `copyFileSync` 同步复制大 JSON，阻塞主进程 | 异步化或限制降级仅用于小文件 |
| M8 | src/main/lib/json-io.ts | 26, 51 | 损坏文件备份名 `filePath + '.corrupt-' + Date.now()`，同毫秒多次损坏互相覆盖 | 追加随机后缀 |
| M9 | src/main/main.ts | 1238-1239 | `autoSyncInterval` 无下限，配置 0/负值 → `setInterval` 高频触发（虽有 isSyncing 防并发，但反复 createBackupZip 浪费 IO） | clamp 到最小 1 分钟 |
| M10 | src/main/lib/security.ts | 129 | `isPrivateOrLoopbackHost` 未覆盖 `.localhost`、`.lan`、`.localdomain` 等内网域名后缀（注释已声明仅词法，DNS rebinding 靠异步版） | 补充常见内网后缀，减小同步版漏检面 |
| M11 | src/main/lib/protocol.ts | 99 | `Cache-Control: max-age=3600` 静态缓存，同名图片更新后 1 小时内渲染层拿旧内容 | 图片协议可缩短缓存或加 ETag |
| M12 | src/main/main.ts | 2097-2099 | chatimg/musicfile 每次请求失败都 `console.error`，恶意/异常请求可刷爆日志 | 限频或仅 WARN |
| M13 | src/main/main.ts | 1443-1463 | `readChatImageAsDataUrl` 只做前缀检查无 realpath 校验（与 serveLocalFile 不一致），chat-images 目录内若被放入符号链接可读到目录外文件 | 复用 serveLocalFile 或补充 realpath 检查 |
| M14 | src/main/services/syncService.ts | 115-119 | `allowSelfSigned` 分支的 checkServerIdentity 中 `certNames.length === 0` 时不校验（空 CN/SAN 证书放行） | 无任何名称时也返回错误 |
| M15 | src/main/main.ts | 1469 | `ai_image_<Date.now()>.<ext>` 同毫秒多图互相覆盖 | 文件名加计数器/随机后缀 |

## 做得好的地方

- **protocol.ts 路径穿越防护是双保险**：join+normalize 后前缀比较 + realpath 规范化后再比较，能覆盖符号链接、Windows 8.3 短文件名等绕过；扩展名与大小限制齐全；流式 + Range 支持避免整文件入内存。
- **security.ts 的 SSRF 词法实现非常细致**：IPv4 十进制整数（2130706433）、IPv4-mapped（::ffff:7f00:1）、RFC1918/CGNAT/link-local/broadcast/ULA 全覆盖，且注释明确声明词法版与 DNS 解析版的边界。
- **凭据处理可靠**：safeStorage 加密 + U+200B 掩码前缀方案规避了「短凭据掩码被当新凭据」的经典坑；performSync 用 Buffer 覆盖尽力清理敏感字段。
- **json-io.ts 写盘健壮**：tmp+rename 原子写、Windows EPERM/EACCES/EBUSY 重试、写合并折叠高频保存、失败保留原文件不破坏数据；锁逻辑在单线程下无竞态。
- **logger.ts 用环形缓冲（O(1) 淘汰）**替代数组 shift，日志轮转 + 7 天清理 + 退出刷盘齐全。
- **downloadUtils.ts**：超限中断、失败清理半成品文件、backpressure 处理到位（重定向问题是其唯一明显缺口）。
- **窗口安全加固**：will-navigate 白名单、windowOpenHandler deny、webview 强制 sandbox+preload、CSP 限制 popout 页网络能力、软件锁时禁用 DevTools 快捷键。
- **生命周期**：单实例锁、before-quit 延迟退出保护写盘、will-quit 清理定时器/中止视频请求，退出路径考虑周全。

## 总体结论

主进程整体安全基线较高（路径穿越、凭据、原子写、日志均实现扎实），最需要优先处理的是下载链路的重定向 SSRF（K1）与 radio 的域名型内网访问（W1），其余为边界校验与健壮性问题。

---

**审查统计**：关键 1 项、重要 5 项、次要 15 项。
