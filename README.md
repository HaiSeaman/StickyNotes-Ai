# 📌 StickyNotes-Ai (现代化桌面便签与 AI 效率助理)

<p align="center">
  <img src="build/icon.ico" width="128" height="128" alt="StickyNotes-Ai Icon">
</p>

<p align="center">
  <b>基于 Electron + TypeScript + Vite 构建的高颜值、功能丰富、毛玻璃视觉体验的现代化桌面便签与 AI 个人生产力中心</b>
</p>

<p align="center">
  <a href="#-核心特性"><img src="https://img.shields.io/badge/Platform-Windows-0078D6.svg?logo=windows" alt="Platform"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/Electron-42.7.1-47848F.svg?logo=electron" alt="Electron"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript" alt="TypeScript"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/Vite-8.1-646CFF.svg?logo=vite" alt="Vite"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
</p>

---

## 📖 简介

**StickyNotes-Ai** 是一款专为 Windows 平台打造的下一代桌面便签与效率工作台。它融合了媲美 Windows 11 的 Fluent / Acrylic 毛玻璃半透明视觉设计，支持多便签管理、独立置顶拆分、沉浸式音视频播放、S3 多端云同步，并在最新的 **v2.6 版本中全面升级了 Agentic 智能联网检索与深度推理系统**，为用户带来优雅、流畅、强大的桌面个人知识与创作助理体验。音乐播放器在最新版本中新增**收藏夹播放模式**，一键激活后随机/顺序播放仅限收藏曲目。

---

## 🚀 版本更新亮点

### 🎧 音乐播放器「收藏夹播放模式」(New)

将原有"仅显示收藏"按钮升级为完整的**收藏夹播放模式**——激活后**显示与播放都限制在收藏曲目范围内**：

- **一键激活**：点击工具栏收藏夹按钮，列表即刻只显示已收藏曲目；顺序播放只在收藏内循环，随机播放只在收藏内随机，单曲循环保持当前曲循环。
- **平滑过渡（播完再切）**：激活瞬间若正在播放的歌曲并非收藏曲目，会**播完当前歌后**再自然切入收藏池，播放不中断、不跳歌。
- **随机历史保护**：激活或取消收藏当前曲时同步清理随机播放历史栈，"上一首"回退绝不会回到非收藏曲目。
- **空收藏夹拦截**：收藏夹为空时点击激活会被拦截并弹出轻量提示，播放与列表保持原状。
- **状态记忆**：收藏模式激活状态持久化到本地，重启应用后自动恢复（与音量记忆同机制）。
- **删除联动**：收藏模式下删除当前收藏曲后，自动接管接续曲目并保持"只播收藏"约束，不会误播非收藏歌曲。

### 🌐 全自动深度联网搜索与信息检索增强 (Web Search & Grounding · v2.6 新增)
- **开箱即用免配置**：内置国内直连免 Key 搜索引擎，点亮聊天框「🔍 联网」开关即可自动获得具备最新事实依据的回答。
- **多引擎无缝切换**：
  - 🇨🇳 **博查 AI (Bocha)**：专为中文大模型优化，超低延迟与精准正文提炼。
  - 🌍 **Tavily AI**：全球领先的 Agentic 搜索引擎，结构化精准提取核心网页事实。
  - 🏢 **微软 Azure Bing**：企业级高可用商业 Web 搜索。
  - ⚙️ **自定义 SearXNG / 第三方 API**：支持自建 SearXNG 与任意标准 JSON 搜索服务对接。
- **自动容灾降级 (Failover Fallback)**：当高级搜索 API 出现欠费、超时（默认 8s）或网络异常时，系统自动平滑回退至内置免 Key 引擎，保障问答不中断。
- **极致清爽的折叠式引用展示**：
  - **关闭搜索时**：纯净极简，不输出任何搜索关键词与冗余引文。
  - **开启搜索时**：
    - 📚 **参考来源列表默认折叠**：展示在回答底部，附带网站 Favicon 图标与安全外链跳转，点击即可展开查看详情。
    - 🔍 **搜索关键词与引文智能折叠**：自动将模型输出的大段搜索过程及引文 URL 转换为可展开/收起的优雅容器，正文保持精炼清爽，并标注 `[1]`、`[2]` 来源角标。

---

## ✨ 软件全特性概览

### 📝 1. 现代化便签管理
- **毛玻璃与主题系统**：经典黄、清新绿、天空蓝、浪漫粉、暗夜黑等多种主题自由切换，透明度与背景模糊精细可调。
- **独立置顶与窗口拆分 (Popout Window)**：支持将任意便签一键拆分为独立置顶小窗口，方便对照阅读、悬浮记事与多任务协同。
- **Markdown & 富文本编辑**：集成 DOMPurify 安全过滤，支持 Markdown 语法渲染、清单复选框与格式化排版。

### 🤖 2. 多模型 AI 智能生产力中心
- **多模型生态接入**：支持 OpenAI、阿里云百炼 (通义千问)、DeepSeek、Gemini 及所有兼容 OpenAI 标准协议的私有化大模型。
- **思考模式 (Deep Thinking)**：深度推理流式实时折叠展示，清晰呈现 AI 推理与思索链。
- **文生图与图生图 (AI Vision & Image Gen)**：支持阿里云百炼 Wanx (万象) 及 DALL-E 生图引擎，支持图生图与拖拽图片智能分析。
- **安全凭证存储**：API Key 等敏感数据通过 Electron `safeStorage` 本地安全加密存储，日志全程脱敏。

### 🎵 3. 沉浸式本地音视频媒体中心
- **主流格式支持**：基于 Howler.js 与 HTML5 打造，支持 MP3、FLAC、WAV、MP4 等格式播放。
- **智能定位当前曲目 (Auto-Scroll)**：切歌、播放或随机轮播时，列表自动平滑滚动对齐当前曲目。
- **收藏体系与收藏夹播放模式**：
  - 播放条集成动态收藏按键（★/☆），与曲目列表双向联动，收藏状态实时同步并持久化。
  - **一键激活收藏夹播放模式**：显示与播放都限制在收藏曲目内——顺序播放仅在收藏内循环，随机播放仅在收藏内随机，单曲循环保持当前曲。
  - **平滑"播完再切"**：激活或取消收藏正在播放的歌曲时，当前曲播完后再进入收藏池，不中断、不跳歌；随机历史栈同步清理，杜绝"上一首"回退到非收藏曲。
  - **空收藏夹拦截提示**：无收藏时点击激活将被拦截并弹出轻量提示，播放与列表不受影响；激活状态跨重启记忆。
- **频谱波形与画中画**：内置 Canvas 实时音频跳动频谱动画；视频模式支持全屏与独立画中画播放。

### ☁️ 4. 多端云同步与数据备份
- **S3 / 兼容对象存储**：支持 AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等 S3 兼容对象存储实时同步。
- **一键导入导出**：支持本地全量 JSON 数据备份与还原，保证数据持久安全、无缝迁移。

---

## 🛠️ 技术架构

```text
StickyNotes-Ai/
├── src/
│   ├── main/                          # Electron 主进程核心逻辑
│   │   ├── main.ts                    # 应用生命周期、单例锁与窗口管理
│   │   ├── ipc/                       # 安全 IPC 通信调度中心 (AI对话/搜索/便签/设置)
│   │   ├── lib/                       # 安全校验、safeStorage 加解密、状态持久化
│   │   └── services/
│   │       ├── search/                # v2.6 搜索引擎适配与 Agentic 调度引擎
│   │       │   ├── builtinSearch.ts   # 内置直连免 Key 搜索引擎
│   │       │   ├── bochaSearch.ts     # 博查 AI 搜索适配器
│   │       │   ├── tavilySearch.ts    # Tavily API 搜索适配器
│   │       │   ├── bingSearch.ts      # 微软 Bing 搜索适配器
│   │       │   ├── customSearch.ts    # 自定义 SearXNG 适配器
│   │       │   ├── searchManager.ts   # 统一搜索调度与容灾降级管理器
│   │       │   └── chatAgent.ts       # Agentic Loop 工具调用与提示词编排
│   │       └── syncService.ts         # S3 多端同步服务
│   ├── preload/                       # 安全 Preload 脚本 (上下文隔离与 API 暴露)
│   └── renderer/                      # 前端 UI 与交互界面 (原生 TS + CSS3 + Vite)
│       ├── main.ts                    # 渲染进程主入口与事件总线
│       └── tabs/                      # 功能标签页模块 (便签/待办/音乐/AI助手)
├── index.html                         # 主界面骨架与毛玻璃视图容器
├── styles.css                         # Fluent Design 毛玻璃与全套动效样式
└── tsup.config.ts / vite.config.ts    # 极速主进程与渲染进程双构建系统
```

---

## 🚀 快速上手

### 1. 环境准备
- **Node.js** `>= 20.0.0`
- **npm** `>= 10.0.0`
- **操作系统** Windows 10 / Windows 11 (x64)

### 2. 安装与启动

```bash
# 克隆仓库
git clone https://github.com/YourUsername/StickyNotes-Ai.git
cd "StickyNotes-Ai - TS"

# 安装依赖
npm install

# 启动开发环境 (自动编译 TS 并运行 Electron)
npm start
```

### 3. 类型检查与测试

```bash
# 类型检查（主进程 + 渲染进程）
npm run typecheck

# 运行自动化单元测试（vitest）
npm test
```

---

## 📦 独立 EXE 打包

项目配置了完整的自动化编译与打包流程，执行以下命令即可一键构建独立的 Windows 桌面运行程序：

```bash
npm run pack
```

打包成功后，可在产物目录中直接运行：
```text
dist-app/便签-win32-x64/便签.exe
```

> **绿色免安装**：整个 `便签-win32-x64` 文件夹即为完整可运行程序，复制到任意位置（U 盘、移动硬盘等）双击 `便签.exe` 即可运行，无需安装。若网络不可用导致打包时下载 Electron 失败，可先手动放置对应版本的 `electron-vX.Y.Z-win32-x64.zip` 到 `%LOCALAPPDATA%\electron\Cache\` 目录，打包将自动命中本地缓存完成离线构建。

---

## 🔒 安全性说明

- **上下文隔离 (Context Isolation)**：启用 `contextIsolation: true` 与 `nodeIntegration: false`，通过白名单暴露安全的 IPC 接口。
- **协议与外链校验**：所有外部网页跳转（包括搜索来源打开）均受 `^https?://` 协议白名单约束，防范伪协议与恶意注入。
- **敏感信息安全存储**：API Key 等凭据通过系统级 `safeStorage`（DPAPI 加密）加密，避免明文泄露。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。
