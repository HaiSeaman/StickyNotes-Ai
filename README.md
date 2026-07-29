# AI-StickyNotes 便签

> 一款基于 Electron 的毛玻璃风格桌面便签应用，集成了 AI 对话、AI 创作、音乐播放器、FM 网络电台、日历、闹钟等模块，定位为「个人知识工作台」。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-42.5.1-47848F.svg?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0078D6.svg?logo=windows&logoColor=white)](https://github.com)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
- [功能模块详解](#功能模块详解)
- [AI 能力](#ai-能力)
- [安全机制](#安全机制)
- [数据存储与同步](#数据存储与同步)
- [打包构建](#打包构建)
- [项目结构](#项目结构)
- [开发指南](#开发指南)
- [许可证](#许可证)

---

## 项目简介

AI-StickyNotes 是一个功能丰富的 Windows 桌面便签应用，远超传统便签工具的范畴。它将便签、待办、日历、闹钟等基础效率工具与 AI 对话、AI 创作（文生图/图生图/文生视频/图生视频）、本地音乐播放器、FM 网络电台等高级能力深度融合到一个毛玻璃风格（Glassmorphism）的统一界面中。

应用采用 Electron 主进程 + 渲染进程 + 预加载脚本的三层架构，所有涉网与涉密操作集中在主进程管控，渲染进程在 `contextIsolation` + `sandbox` 隔离模式下运行，结合 safeStorage 凭据加密、SSRF 防护、CSP 内容安全策略、PIN 软件锁等多层安全机制，确保用户数据与 API 凭据的安全。

### 核心亮点

- **6 大功能 tab 一体化**：便签、闹钟、日历、聊天、创作、音乐
- **AI 能力全覆盖**：流式多轮对话、文生图/图生图、文生视频/图生视频
- **多媒体娱乐**：howler.js 内核的本地音乐播放器 + RadioBrowser API 的 FM 网络电台
- **企业级安全**：safeStorage 凭据加密、双层 SSRF 防护、CSP 策略、PIN 软件锁（scrypt + safeStorage 二次加密）、路径遍历防护、防 Zip Slip、防计时攻击
- **数据可靠性**：JSON 原子写入、便签历史版本快照、S3/WebDAV 双后端同步备份
- **毛玻璃美学**：支持亮色/暗色双主题、窗口透明度调节、多色背景、字体大小调节

---

## 功能特性

### 效率工具

| 模块 | 核心能力 |
|------|---------|
| **便签** | Markdown 编辑与预览、历史版本快照（后悔药）、一键转长图、扯出独立小窗口、归档文件夹、回收站、全文搜索 |
| **待办** | 待办列表、独立小窗口、与日历联动 |
| **闹钟** | 倒计时（SVG 进度环）、定时闹钟、7 种提示音、响铃唤起主窗口、闹钟列表管理 |
| **日历** | 月视图、365 天 GitHub 风格热力图、当日闹钟/待办管理 |

### AI 能力

| 模块 | 核心能力 |
|------|---------|
| **AI 对话** | OpenAI 兼容协议、流式 SSE 输出、思考模式（Qwen3/DeepSeek-R1）、多模态（图片输入）、会话归档、导出 Markdown |
| **AI 创作** | 文生图/图生图（OpenAI DALL-E + 阿里云百炼 qwen-image）、文生视频/图生视频（百炼 wan2.7）、多尺寸/多比例 |

### 多媒体娱乐

| 模块 | 核心能力 |
|------|---------|
| **音乐播放器** | howler.js 内核、本地音乐管理、拖拽排序、播放列表持久化、专辑封面（SHA-256 去重）、顺序/随机/单曲循环 |
| **FM 网络电台** | RadioBrowser API、5 种数据源（热门/点击/最新/中国/香港）、收藏夹、搜索、网络速度采样 |

### 系统集成

- 窗口透明度调节（20%-100%）
- 窗口置顶 / 固定窗口位置
- 4 位 PIN 软件锁（输错 5 次冷却 30 秒）
- 开机自启
- 系统托盘
- 数据同步（S3 / WebDAV，自动定时备份）

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **运行时** | Electron 42.5.1、Node.js >= 18 |
| **前端** | 原生 JavaScript、HTML5、CSS3（CSS 变量 + Flex/Grid） |
| **音频** | howler.js 2.2.4（音乐播放）、原生 HTML5 Audio（FM 流媒体） |
| **Markdown** | marked 12.0.2（渲染）、DOMPurify 3.2.0（XSS 净化） |
| **音乐元数据** | music-metadata 7.14.0（ID3/Vorbis 标签解析） |
| **云存储** | @aws-sdk/client-s3 3.1088.0（S3 兼容同步） |
| **压缩** | adm-zip 0.6.0（备份打包/解压） |
| **打包工具** | @electron/packager 20.0.3 |
| **平台** | Windows x64 |

---

## 架构设计

应用采用 Electron 标准的三层架构，严格遵循「主进程管控、渲染进程隔离」原则：

```
┌─────────────────────────────────────────────────────────────┐
│                     主进程 (main.js)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  IPC 处理器  │  │  协议注册    │  │  窗口/托盘管理       │ │
│  │  (~95 个)   │  │  (chatimg/  │  │  (主窗口 + popout   │ │
│  │             │  │   musicfile)│  │   小窗口)           │ │
│  │             │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  安全层：safeStorage 加密 / SSRF 校验 / PIN 锁 /       │  │
│  │           路径遍历防护 / 权限处理器全拒绝              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ contextBridge (contextIsolation + sandbox)
┌─────────────────────────┴───────────────────────────────────┐
│              预加载脚本 (preload.js)                          │
│        暴露 window.api（按模块分组的 IPC 调用封装）            │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                   渲染进程 (renderer.js)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ 便签/待办 │ │ 闹钟/日历 │ │ 聊天/创作 │ │ 音乐/FM        │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
│  独立模块：calendar.js / music-tab.js / radio-tab.js        │
└─────────────────────────────────────────────────────────────┘
```

### 模块化文件分工

| 文件 | 职责 |
|------|------|
| `main.js` | 主进程入口，IPC 处理器、协议注册、窗口管理、安全策略 |
| `renderer.js` | 渲染进程主逻辑（便签、闹钟、聊天、创作等） |
| `index.html` | 主窗口 UI 结构（6 个 tab + 模态框） |
| `preload.js` | 主窗口预加载，暴露 `window.api` |
| `popout-preload.js` | 独立小窗口预加载，最小化暴露 `window.popout`（仅 8 个方法） |
| `paths.js` | 数据文件路径集中管理 |
| `security.js` | 通用安全工具（SSRF 校验、payload 大小限制、HTML 转义） |
| `json-io.js` | JSON 原子读写 + EPERM 重试 + 损坏自动备份 |
| `logger.js` | 日志系统（内存缓冲 + 文件轮转 + 控制台劫持） |
| `calendar.js` | 日历模块（月视图 + 热力图 + 闹钟/待办管理） |
| `music-tab.js` | 音乐播放器渲染逻辑（howler.js 内核） |
| `radio-tab.js` | FM 收音机渲染逻辑（原生 Audio） |
| `shared-utils.js` | 渲染层共享工具函数 |
| `overlay-logger.js` | 子窗口日志批量上报模块 |

### IPC 通信设计

主进程注册了约 **95 个 IPC 处理器**，按功能模块分组：

- 便签 CRUD 与归档（`notes:*`）
- 聊天与归档（`chat:*`）
- 日历与活跃度（`calendar:*` / `activity:*`）
- 设置（`settings:*`）
- 数据同步（`sync:*`）
- 窗口控制（`window:*` / `toggle-pin` / `toggle-fixed`）
- 软件锁（`lock:*`）
- AI 配置与聊天（`ai:save-config` / `ai:load-config` / `ai:chat` / `ai:generate`）
- AI 图片/视频生成（`ai:generate-image` / `ai:generate-video`）
- 音乐播放器（`music:*`）
- FM 收音机（`radio:*`）
- 便签历史快照（`note-history:*`）
- 应用日志（`log:*` / `logs:*`）
- 便签/待办小窗口（`note:popout` / `todo:popout` / `popout-*`）

所有 IPC 入口统一使用 `tryWrap` 异步错误包装，涉网/涉密入口额外使用 `assertPayloadSize` 防止 OOM。

---

## 快速开始

### 环境要求

- Windows 10/11 (x64)
- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
git clone <your-repo-url>
cd AI-StickyNotes
npm install
```

### 启动应用

提供两种启动方式：

**方式一：双击启动脚本（推荐）**

直接双击项目根目录下的 `启动.bat`，脚本会自动检测 Electron 是否安装并以独立进程启动应用，启动后 cmd 窗口自动关闭。

**方式二：命令行启动**

```bash
npm start
```

或：

```bash
npx electron .
```

### 调试模式

双击 `启动_debug.bat` 可启用 DevTools 调试模式。

---

## 功能模块详解

### 1. 便签（Notes）

- Markdown 编辑器与实时预览切换
- 历史版本快照（后悔药）：支持锁定重要版本
- 一键转长图：将便签内容导出为图片
- 扯出小窗口：将便签拆分为独立悬浮窗口（支持置顶）
- 归档文件夹与回收站：两级数据保护
- 全文搜索（200ms 防抖）
- 右键菜单删除

### 2. 闹钟（Clock）

- 实时时钟显示
- 倒计时：时/分/秒输入 + SVG 圆形进度环
- 定时闹钟：支持文字说明 + 7 种提示音（叮咚/苹果/安卓/诺基亚/清脆/鸟鸣/电子）
- 闹钟列表管理
- 响铃时自动唤起主窗口（`backgroundThrottling: false` 保证后台定时器不被节流）
- 闹钟检测使用 90 秒时间窗口，避免精确秒匹配遗漏

### 3. 日历（Calendar）

- 月视图网格：支持月份导航
- 365 天 GitHub 风格热力图：展示每日活跃度
- 当日闹钟管理：支持事务回滚
- 当日待办便签管理
- 日历数据与闹钟模块联动

### 4. 聊天（Chat）

- 多会话管理：侧边栏 + 新建会话
- 流式 SSE 输出：实时显示 AI 回复
- 思考模式：兼容 Qwen3 / DeepSeek-R1（支持 `reasoning_content` / `thinking` / `reasoning` 多字段）
- 多模态：支持上传图片（OpenAI Vision 格式）
- 会话归档与回收站
- 导出当前会话为 Markdown
- 重新生成最后一条 AI 回复
- 中断流式请求（`chat:abort`）

### 5. 创作（Create）

- 模式切换：图片生成 / 文生视频 / 图生视频
- 图片尺寸选择：支持 AI 自动选择 + OpenAI 与百炼两套尺寸
- 视频参数：时长 3-15 秒、宽高比 16:9 / 9:16 / 1:1 / 4:3 / 3:4
- 提示词优化按钮
- 上传参考图（图生图 / 图生视频）
- 复制生成结果

### 6. 音乐（Music）

**左侧 - 本地音乐播放器**：

- 添加文件 / 添加文件夹 / 清空 / 搜索（200ms 防抖）
- 播放列表：拖拽排序、收藏过滤
- 专业播放控制条：封面 + 曲目信息 + 进度条 + 上一首/播放/下一首/播放模式 + 音量
- 播放模式：顺序 / 随机 / 单曲循环
- 专辑封面：SHA-256 去重存储
- 元数据解析：使用 Web Worker 防止 UI 阻塞
- 播放列表持久化（1.5s 防抖）
- 文件夹扫描限制：2000 文件 / 10 层深度
- 后台播放支持

**右侧 - FM 网络电台**：

- 数据源：RadioBrowser API 镜像
- 5 种数据源循环：topvote / topclick / recent / bycountry-china / bycountry-hongkong
- 三 tab 视图：热门 / 收藏 / 搜索
- 网络速度采样
- 连续错误自动切换下一台
- 收藏夹管理
- 搜索（200ms 防抖）
- 电台配置加密存储

---

## AI 能力

### AI 聊天（OpenAI 兼容协议）

应用采用 OpenAI 兼容协议，支持任何符合 OpenAI Chat Completions API 标准的 provider：

- 端点：`POST {baseUrl}/chat/completions`
- 流式输出：`stream: true`，解析 SSE 流
- 思考模式：兼容阿里云 DashScope / Qwen3 / DeepSeek-R1
- 多模态：支持图片输入（OpenAI Vision 格式 `image_url`）
- 超时：3 分钟，支持中止

**兼容的 provider 示例**：

- OpenAI 官方
- 阿里云百炼（DashScope compatible-mode）
- DeepSeek
- Ollama 本地部署
- LiteLLM / Agnes 等代理

### AI 图片生成

支持 **2 种 provider**，通过设置切换：

| Provider | 默认模型 | 默认尺寸 | 端点 |
|----------|---------|---------|------|
| **OpenAI 标准** | `dall-e-3` | `1024x1024` | `/images/generations`、`/images/edits` |
| **阿里云百炼** | `qwen-image-2.0-pro` | `2048*2048` | `multimodal-generation` |

- 文生图 + 图生图双模式
- 兼容 `b64_json` 与 `url` 两种响应格式
- 图片 URL 下载强制 SSRF 校验
- 自动保存到统一保存路径

### AI 视频生成

基于阿里云百炼 **wan2.7 系列**，采用异步任务模式：

| 模式 | 默认模型 | 说明 |
|------|---------|------|
| **文生视频（T2V）** | `wan2.7-t2v-2026-04-25` | `input.prompt` + `parameters.ratio` |
| **图生视频（I2V）** | `wan2.7-i2v-2026-04-25` | 自动上传本地图片到百炼临时存储 |

- 视频时长：3-15 秒（默认 5 秒）
- 宽高比：16:9 / 9:16 / 1:1 / 4:3 / 3:4
- 防重入：防止任务堆叠
- 流式下载到磁盘：避免大视频 OOM
- 配置三级 fallback：视频专用 → 图片共用百炼 → 聊天通用

### 保存路径统一管理

图片、视频两种 AI 生成内容**共用同一保存路径**（`imageSavePath`），用户在设置中修改图片保存路径后，两个模块的保存路径自动同步更新。

---

## 安全机制

应用实施了多层安全防护，覆盖凭据存储、网络请求、内容渲染、文件访问、权限控制等各个方面。

### 凭据加密存储（safeStorage）

所有敏感凭据使用 Electron `safeStorage` 加密后落盘，**绝不存明文**：

- `encryptSecret()`：safeStorage 加密 + base64 编码落盘
- `decryptSecret()`：解密已存储凭据
- `maskCred()`：掩码化回传渲染进程（如 `sk-****1234`）
- `isMaskedCred()`：检测掩码占位，保存时保留旧加密值

加密的凭据包括：

- AI API Key（聊天 / 图片 / 视频三套独立 Key）
- S3 `accessKey` / `secretKey`
- WebDAV `pass`
- PIN 哈希 + salt（二次 safeStorage 加密）

**旧版明文凭据自动迁移**：启动时检测明文凭据，自动加密写回并删除明文字段。

### SSRF 防护（双层校验）

| 函数 | 协议 | 用途 |
|------|------|------|
| `isSafeExternalUrl()` | 仅 `https:` | 严格版，用于百炼返回的图片 URL 下载校验 |
| `isSafePublicStreamUrl()` | 允许 `http:` | 宽松版，用于网络电台流（Icecast/Shoutcast 多为 HTTP） |
| `validateAiBaseUrl()` | `http:` / `https:` | 用于所有 AI/sync baseUrl 校验入口 |

统一拒绝：环回地址、链路本地（含云元数据 169.254.169.254）、私网段（10.x / 172.16-31.x / 192.168.x）、IPv6 私网（fc/fd）。

### CSP 内容安全策略

**主窗口 CSP**：

```
default-src 'self';
connect-src 'self' https:;
style-src 'self' 'unsafe-inline';
script-src 'self';
img-src 'self' data: chatimg: musicfile: https:;
media-src 'self' data: musicfile: https: http:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

- `script-src 'self'`：仅允许本地脚本，杜绝内联脚本注入
- `object-src 'none'`：禁止 Flash/Java 等插件
- `frame-ancestors 'none'`：禁止被嵌入 iframe（防点击劫持）
- 自定义协议：`chatimg:` / `musicfile:` 用于本地资源加载

### PIN 软件锁

4 位 PIN 软件锁采用多层防护：

1. **PIN 不明文存储**：使用 `crypto.scrypt` 生成 64 字节哈希
2. **随机 16 字节 salt**：防彩虹表
3. **二次 safeStorage 加密**：哈希 + salt 经 safeStorage 加密后存储，防文件被复制后离线破解
4. **safeStorage 不可用时拒绝落盘**：4 位 PIN 只有 1 万种组合，明文哈希几秒就能爆破
5. **输错 5 次强制冷却 30 秒**
6. **冷却状态持久化**：防止杀进程重置计数
7. **`timingSafeEqual` 防计时攻击**
8. **校验异步化**：避免 `scryptSync` 阻塞事件循环

### 路径遍历防护

通用本地文件服务 `serveLocalFile()` 提供：

- 路径必须在目标目录内（`startsWith` 校验）
- `requireRealpath` 选项：`fs.realpath` 二次校验符号链接，防 symlink 逃逸
- 文件大小校验：超过 `maxSize` 返回 413

应用到 `chatimg://` / `musicfile://` 两个自定义协议。

### 防 Zip Slip 攻击

备份恢复时：

- 仅取 `basename` 落地到 userData，避免恶意 ZIP 通过 `../` 写入任意路径
- 只解压 `.json` 文件
- **禁止恢复 `settings.json`**：防止恶意备份覆盖 PIN 哈希 / 同步凭据 / API Key

### IPC payload 大小限制

- 默认上限：50MB（`MAX_IPC_PAYLOAD_SIZE`）
- 聊天图片：20MB（base64 膨胀 1.4 倍校验）
- 剪贴板文本：1MB
- 音乐音频：50MB / 封面 5MB
- 日志上报：单条 8192 字符 / 500 条上限
- 备份 ZIP：200MB

### 权限处理器

启动时设置 session 权限处理器，**默认拒绝所有敏感权限请求**（摄像头、麦克风、通知、地理位置、剪贴板、媒体等）——桌面便签应用无需任何浏览器权限。

### 窗口与导航防护

- `setWindowOpenHandler`：外部链接用 `shell.openExternal` 打开，窗口内 `deny`
- `will-navigate`：仅允许 `file://` 协议，且目标必须在 `__dirname` 内
- `will-attach-webview`：强制 `nodeIntegration: false` / `contextIsolation: true` / `sandbox: true`

### 窗口创建选项

```javascript
{
  contextIsolation: true,       // 上下文隔离
  nodeIntegration: false,       // 禁用 Node.js 集成
  sandbox: true,                // 沙箱模式
  backgroundThrottling: false   // 允许后台运行（保证闹钟定时器不被节流）
}
```

### XSS 防护

- 所有用户生成内容使用 DOMPurify 净化
- HTML 转义使用 `escapeHtmlFull()`
- 小窗口 HTML 通过 CSP 防护

---

## 数据存储与同步

### 数据文件路径

所有数据文件位于 `app.getPath('userData')` 下：

| 路径 | 用途 |
|------|------|
| `notes.json` | 便签主数据 |
| `notes_archived.json` | 归档便签 |
| `notes_trashed.json` | 回收站便签 |
| `chats_archived.json` | 聊天归档 |
| `chats_trashed.json` | 聊天回收站 |
| `settings.json` | 应用设置（含加密凭据） |
| `calendar.json` | 日历↔闹钟映射 |
| `activity.json` | 活跃度数据（热力图） |
| `chat-images/` | 聊天图片本地存储 |
| `music/` | 音乐数据根目录 |
| `music/playlist.json` | 播放列表持久化 |
| `music/covers/` | 专辑封面缓存（SHA-256 命名） |
| `radio/` | FM 数据根目录 |
| `radio/cache.json` | 热门电台 7 天缓存 |
| `radio/favorites.json` | 收藏电台列表 |
| `note_history/` | 便签历史版本快照 |
| `logs/` | 日志文件（按日期 `app-YYYY-MM-DD.log`，5MB 滚动，7 天保留） |

### JSON 原子写入

`json-io.js` 提供：

- `writeFile + rename` 原子写入，防止写入中断导致文件损坏
- Windows EPERM/EACCES/EBUSY 重试 3 次（50/150/250ms）
- 最终降级为 `copy + unlink` 跨卷兼容
- 解析失败时自动备份为 `.corrupt-<ts>` 文件

### 数据同步

支持 **2 种后端**，采用 Provider 注册表模式（可扩展）：

| 后端 | 必填字段 | 说明 |
|------|---------|------|
| **S3 标准接口** | `endpoint` / `region` / `bucket` / `accessKey` / `secretKey` | 兼容 AWS S3、MinIO、Cloudflare R2、阿里云 OSS 等 |
| **WebDAV** | `url` / `user` / `pass` | 支持自签名证书选项（个人 NAS 场景） |

**同步模式**：单向上传备份（不下载），支持自动同步（间隔 15/30/60/360/1440 分钟）。

**备份内容**：

- 仅备份 `userData` 下 `.json` 文件
- 排除 `.tmp` 临时文件与 `.corrupt-` 损坏备份
- 添加 `_backup_meta.json` 元信息（版本号 + 时间戳 + 文件数 + appVersion，不含本机路径）
- 备份大小上限：200MB

### 便签历史版本快照

- 自动快照：编辑时自动保存历史版本
- 锁定重要版本：防止被覆盖
- 历史列表查看
- 一键清除历史

### 日志系统

- 内存缓冲：最多 1000 条
- 文件轮转：按日期 `app-YYYY-MM-DD.log`，5MB 自动滚动到 `app-YYYY-MM-DD-N.log`
- 保留期：7 天自动清理
- 控制台劫持：自动捕获 console.log/warn/error
- 进程异常处理：捕获 uncaughtException / unhandledRejection
- 多窗口聚合：主进程 + 渲染进程 + popout 窗口日志统一汇总，带来源标签
- 批量上报：渲染进程攒满 20 条或每 2 秒上报一次，最小化 IPC 开销

---

## 打包构建

### 打包命令

```bash
npm run pack
```

使用 `@electron/packager` 打包，关键配置：

- **平台**：`--platform=win32 --arch=x64`（仅 Windows x64）
- **输出**：`--out=dist --overwrite`
- **图标**：`--icon=build/icon.ico`
- **`--asar`**：启用 asar 打包（源代码与资源打包到 `app.asar`，防直接查看源码 + 加速文件读取）
- **`--prune`**：打包前剔除 devDependencies，只保留运行时依赖
- **`--ignore`**：剔除开发临时文件、调试脚本、文档、git 元数据等

打包产物位于 `dist/` 目录，可直接分发。

### 运行时依赖

打包后保留的运行时依赖：

| 依赖 | 用途 |
|------|------|
| `@aws-sdk/client-s3` | S3 同步后端 |
| `adm-zip` | ZIP 备份打包/解压 |
| `dompurify` | HTML 净化（XSS 防护） |
| `howler` | 音乐播放器内核 |
| `marked` | Markdown 渲染 |
| `music-metadata` | 音频元数据解析 |

---

## 项目结构

```
AI-StickyNotes/
├── main.js                  # 主进程入口（IPC、协议、窗口、安全）
├── renderer.js              # 渲染进程主逻辑
├── index.html               # 主窗口 UI（8 个 tab + 模态框）
├── preload.js               # 主窗口预加载（暴露 window.api）
├── popout-preload.js        # 小窗口预加载（暴露 window.popout）
├── paths.js                 # 数据文件路径集中管理
├── security.js              # 通用安全工具（SSRF、payload 限制、转义）
├── json-io.js               # JSON 原子读写 + EPERM 重试
├── logger.js                # 日志系统（内存缓冲 + 文件轮转）
├── calendar.js              # 日历模块（月视图 + 热力图）
├── music-tab.js             # 音乐播放器渲染逻辑
├── radio-tab.js             # FM 收音机渲染逻辑
├── shared-utils.js          # 渲染层共享工具函数
├── overlay-logger.js        # 子窗口日志批量上报
├── styles.css               # 全局样式（亮色/暗色主题）
├── package.json             # 项目配置与依赖
├── 启动.bat                  # 启动脚本（自动检测 + 独立进程启动）
├── 启动_debug.bat            # 调试启动脚本（启用 DevTools）
├── build/
│   └── icon.ico             # 应用图标
├── LICENSE                  # MIT 许可证
└── README.md                # 项目说明（本文件）
```

---

## 开发指南

### 启动调试模式

双击 `启动_debug.bat` 或执行：

```bash
npx electron . --debug
```

### 日志查看

应用日志位于 `userData/logs/` 目录：

- 文件名格式：`app-YYYY-MM-DD.log`
- 单文件上限：5MB（超出自动滚动到 `app-YYYY-MM-DD-N.log`）
- 保留期：7 天自动清理

也可在应用内通过日志查看器查看（通过 `logs:get` / `logs:refresh` / `logs:copy-all` / `logs:clear` API）。

### 添加新的 IPC 处理器

1. 在 `main.js` 中使用 `ipcMain.handle('namespace:action', tryWrap(async (event, params) => { ... }))` 注册
2. 涉网/涉密入口添加 `assertPayloadSize(params, MAX_IPC_PAYLOAD_SIZE, 'label')`
3. 在 `preload.js` 中通过 `makeInvoke('namespace:action')` 暴露到 `window.api`
4. 在 `renderer.js` 中通过 `window.api.namespaceAction()` 调用

### 添加新的同步后端

在 `main.js` 的 Provider 注册表中添加一项（参考 S3 / WebDAV 实现），实现 `test` / `upload` / `listBackups` / `deleteBackup` / `restoreBackup` 方法即可，`performSync` 等通用逻辑无需改动。

### 主题定制

样式系统基于 CSS 变量，定义在 `styles.css` 的 `:root` 与 `.window.dark-theme` 中：

- 亮色主题：柔和青色/薄荷绿主色（`--accent: #7fb3b3`）
- 暗色主题：iOS Dark + GitHub Dark 混合方案（`--bg-deep: #1C1C1E`、`--accent: #0A84FF`）

修改 CSS 变量即可全局调整配色。

---

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

Copyright (c) 2026 SeamanHAI

---

## 致谢

本项目的实现得益于以下优秀的开源项目与服务：

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [howler.js](https://howlerjs.com/) - 现代 Web 音频库
- [marked](https://marked.js.org/) - Markdown 解析器
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 净化器
- [music-metadata](https://github.com/Borewit/music-metadata) - 音频元数据解析
- [RadioBrowser](https://api.radio-browser.info/) - 免费社区 FM 电台数据库
- [阿里云百炼](https://dashscope.aliyuncs.com/) - AI 图片/视频服务
- [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3) - S3 兼容存储 SDK
