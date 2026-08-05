# 📌 StickyNotes-Ai (TS) | 智能桌面便签

<p align="center">
  <img src="build/icon.ico" width="128" height="128" alt="StickyNotes-Ai Icon">
</p>

<p align="center">
  <b>基于 Electron + TypeScript 构建的高颜值、功能丰富、毛玻璃视觉体验的现代化桌面便签与效率工具</b>
</p>

<p align="center">
  <a href="#-核心特性"><img src="https://img.shields.io/badge/Platform-Windows-0078D6.svg?logo=windows" alt="Platform"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/Electron-42.7.1-47848F.svg?logo=electron" alt="Electron"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/TypeScript-7.0-3178C6.svg?logo=typescript" alt="TypeScript"></a>
  <a href="#-技术栈"><img src="https://img.shields.io/badge/Vite-8.1-646CFF.svg?logo=vite" alt="Vite"></a>
  <a href="#-开源协议"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
</p>

---

## 📖 简介

**StickyNotes-Ai** 是一款专为 Windows 平台打造的下一代桌面效率与便签应用。它不仅提供了媲美原生 Windows 11 的 Fluent / Acrylic 毛玻璃视觉设计，还深度整合了多功能卡片切分、AI 辅助工具、本地音视频沉浸播放、跨端 S3 同步与备份等功能，帮助用户在桌面上完成高效记录、思考与灵感收集。

---

## ✨ 核心特性

### 📝 1. 现代化便签管理
- **毛玻璃与主题色彩**：支持多款精美主题（经典黄、清新绿、天空蓝、浪漫粉、暗夜黑等），搭配精细调节的毛玻璃透明度与背景模糊。
- **独立置顶与独立窗口拆分**：支持将任意便签独立拆分为独立置顶小窗口（Popout Window），方便对照阅读与实时记事。
- **富文本与 Markdown 支持**：集成 DOMPurify 安全过滤，支持实时 Markdown 渲染、快捷清单复选框与格式化排版。

### 🎵 2. 沉浸式本地音视频播放器 (V2.5 最新升级)
- **多格式本地音视频播放**：基于 Howler.js 与 HTML5 Video 构建，支持 MP3、FLAC、WAV、MP4 等主流媒体格式。
- **自动定位当前曲目 (Auto-Scroll)**：在列表播放、上一首/下一首、随机播放或自动切歌时，播放列表平滑自动定位并对齐当前播放的音乐。
- **歌名快速收藏**：控制条歌名右侧配备动态收藏按键（★/☆），支持控制条与播放列表的双向实时状态同步与一键收藏过滤。
- **音频可视化与全屏**：内置动态 Canvas 音频频谱波形动画，视频播放支持全屏及画中画体验。

### 🤖 3. AI 智能辅助工具
- **大模型接口对接**：集成 AI 问答与文本处理面板，支持实时智能润色、要点总结、语法纠错及灵感生成。可以接入OPENAI接口和阿里云百炼接口使用文生图，图生图。

### ☁️ 4. S3 云端同步与数据备份
- **S3 / 兼容存储同步**：支持对接 AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等 S3 兼容对象存储。
- **数据导入导出**：支持本地 JSON 备份包一键导出与还原，确保用户数据安全与迁移无忧。

---

## 🛠️ 技术栈

| 模块 | 技术选型 | 说明 |
| --- | --- | --- |
| **运行时** | Electron 42.7.1 | 跨平台桌面客户端运行时 |
| **开发语言** | TypeScript 7.0 | 全局强类型安全与良好代码提示 |
| **渲染前端** | HTML5 / CSS3 / ES Modules | 原生高性能渲染，无重型前端框架包袱 |
| **构建工具** | Vite 8.1 / tsup 8.5 | 极速 Vite 渲染进程打包与 tsup 主进程构建 |
| **音频引擎** | Howler.js 2.2 | 稳定强大的跨平台音频播放支持 |
| **打包工具** | @electron/packager 20.0 | Windows 自动化独立程序与安装包构建 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** `>= 20.0.0`
- **npm** `>= 10.0.0`
- **操作系统** Windows 10 / Windows 11 (推荐 x64)

### 1. 克隆项目

```bash
git clone https://github.com/YourUsername/StickyNotes-Ai.git
cd StickyNotes-Ai
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
npm start
```
该命令会自动编译 TypeScript 主进程、构建 Vite 渲染进程并启动 Electron 应用。

---

## 📦 打包构建

您可以将项目一键打包为标准的 Windows 独立运行程序（`便签.exe`）：

```bash
npm run pack
```

打包完成后，产物将生成在根目录下的：
```
dist-app/便签-win32-x64/便签.exe
```

---

## 📂 项目结构概览

```text
StickyNotes-Ai/
├── build/                   # 图标与构建资源 (icon.ico)
├── dist/                    # 主进程及 Preload 编译产物 (tsup 输出)
├── dist-renderer/           # 渲染进程前端编译产物 (Vite 输出)
├── dist-app/                # 打包后的 Win32 EXE 最终应用目录
├── src/
│   ├── main/                # Electron 主进程代码
│   │   ├── main.ts          # 应用入口与窗口管理
│   │   └── services/        # S3 同步、IPC 通信等底层服务
│   ├── preload/             # Preload 桥接脚本
│   └── renderer/            # 前端 UI 与业务功能逻辑
│       ├── tabs/            # 选项卡功能模块 (musicTab.ts, noteTab.ts 等)
│       └── utils/           # 前端工具函数
├── index.html               # 主界面 HTML 布局
├── styles.css               # 全局 UI 与毛玻璃样式
├── V2.5_开发计划.md          # V2.5 版本迭代与规范文档
├── package.json             # 项目依赖与打包脚本配置
├── tsconfig.json            # TypeScript 配置
└── README.md                # 项目文档
```

---

## 📝 更新日志

### 🚀 V2.5 (当前版本)
- **新增**：播放列表在切歌/播放时自动平滑滚动定位到当前播放音乐位置。
- **新增**：控制条歌名右侧增加一键收藏按键（★/☆），并实现与播放列表的双向状态同步。
- **优化**：优化了音频播放 `end` 事件触发下的自动切歌防竞争逻辑。
- **构建**：完成独立 Win32 应用程序构建与验证。

---

## 📄 开源协议

本项目采用 [MIT License](./LICENSE) 协议开源。
