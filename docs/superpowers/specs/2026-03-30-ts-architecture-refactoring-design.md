# 渐进式 TypeScript 架构重构与巨型文件拆分设计方案

## 1. 概述与设计目标
本方案旨在将 `StickyNotes-Ai` 现有的单文件 JavaScript 架构（`main.js` 约 221KB，`renderer.js` 约 228KB）重构为高内聚、低耦合的 **TypeScript 模块化架构**。

### 核心目标：
1. **彻底拆分巨型文件**：将 `main.js` 与 `renderer.js` 按功能业务拆分为独立的 TS 模块，单个文件行数控制在 300 行以内。
2. **端到端类型安全 (Type-Safe IPC)**：建立主进程与渲染进程通信的强类型接口定义，消除硬编码字符串与隐式 `any`。
3. **零破坏渐进式迁移**：配置 Vite + tsup / tsc 编译流水线，支持新旧代码平滑过渡，确保开发过程应用时刻可运行。

---

## 2. 整体架构设计与目录结构

采用标准的 `src/` 分层架构，明确主进程、渲染进程、预加载脚本与共享类型库的边界：

```text
StickyNotes-Ai/
├── src/
│   ├── types/                     # 全局强类型定义 (IPC/数据模型)
│   │   ├── notes.ts               # 便签与历史版本模型
│   │   ├── todo.ts                # 待办事项模型
│   │   ├── ai.ts                  # AI 聊天/生图/生视频模型与配置
│   │   ├── sync.ts                # WebDAV / S3 同步配置类型
│   │   ├── settings.ts            # 系统与用户设置类型
│   │   └── ipc.ts                 # 端到端 IPC Channel 类型映射
│   │
│   ├── main/                      # 主进程 TypeScript 模块
│   │   ├── index.ts               # 主进程入口（App 生命周期注册）
│   │   ├── core/                  # 主进程核心能力
│   │   │   ├── windowManager.ts   # 窗口创建、置顶、Popout 管理
│   │   │   ├── storageManager.ts  # 数据存储、防抖保存与文件锁
│   │   │   ├── securityManager.ts # PIN 码哈希、加密解密、AutoLaunch
│   │   │   └── logger.ts          # 后端日志搜集与维护
│   │   ├── services/              # 业务服务层
│   │   │   ├── aiService.ts       # LLM SSE 流式、生图、生视频
│   │   │   ├── syncService.ts     # S3 / WebDAV 同步与加密解密
│   │   │   ├── musicService.ts    # 本地音乐扫描、ID3 解析
│   │   │   ├── radioService.ts    # RadioBrowser 网络电台 API
│   │   │   └── historyService.ts  # 便签快照历史版本管理
│   │   └── ipc/                   # IPC 通信句柄注册中心
│   │       ├── registerNoteIPC.ts
│   │       ├── registerTodoIPC.ts
│   │       ├── registerAiIPC.ts
│   │       ├── registerSyncIPC.ts
│   │       └── registerSystemIPC.ts
│   │
│   ├── preload/                   # 预加载脚本
│   │   ├── index.ts               # 主窗口 Preload (ContextBridge API 绑定)
│   │   └── popout.ts              # 独立弹窗 Preload
│   │
│   └── renderer/                  # 渲染进程 TypeScript 模块
│       ├── main.ts                # 渲染层入口
│       ├── core/                  # 渲染层核心框架
│       │   ├── stateManager.ts    # 全局响应式状态与数据缓存
│       │   ├── eventBus.ts        # 组件间解耦事件总线
│       │   └── ipcBridge.ts       # 强类型 IPC 调用封装
│       ├── common/                # UI 辅助与公共组件
│       │   ├── dom.ts             # DOM 选择器与节点工具
│       │   ├── toast.ts           # 消息通知轻提示
│       │   ├── modal.ts           # 弹窗遮罩控制器
│       │   └── utils.ts           # Debounce/Throttle/Format
│       └── modules/               # 业务模块组件
│           ├── notes/             # 便签列表、编辑器、历史Modal
│           ├── todos/             # 待办事项列表、拖拽、归档
│           ├── ai/                # AI 对话 UI、流式打字机、图文展示
│           ├── music/             # 播放器控制、歌词解析、电台搜索
│           ├── calendar/          # 日历热力图、每日打卡
│           └── settings/          # 系统/同步/密码锁设置弹窗
│
├── build/                         # 图标与打包资源
├── dist/                          # TS 编译输出目录（主进程与预加载）
├── dist-renderer/                 # Vite 编译输出目录（渲染进程）
├── tsconfig.json                  # TypeScript 基础配置
├── tsconfig.main.json             # 主进程编译配置
├── tsconfig.renderer.json         # 渲染进程编译配置
└── vite.config.ts                 # 渲染进程构建配置
```

---

## 3. 详细分步重构实施计划

重构过程划分为 5 个阶段，按顺序递进执行：

### 阶段 1：构建工具链与 TypeScript 环境搭建
* **步骤 1.1**：安装开发依赖：`typescript`, `@types/node`, `@types/electron`, `vite`, `tsup`。
* **步骤 1.2**：创建 `tsconfig.json` 基础配置（开启 `strict: true`, `moduleResolution: "node"`）。
* **步骤 1.3**：配置 Vite 构建 `src/renderer/`，配置 tsup 构建 `src/main/` 与 `src/preload/`。
* **步骤 1.4**：更新 `package.json` 中的 `scripts`（添加 `build:main`、`build:renderer`、`dev`）。

### 阶段 2：数据模型与 IPC 类型定义 (Type-Safe Layer)
* **步骤 2.1**：在 `src/types/notes.ts` 中抽象 `Note`、`NoteHistorySnapshot` 数据结构。
* **步骤 2.2**：在 `src/types/todo.ts` 中抽象 `TodoItem`、`TodoGroup` 数据结构。
* **步骤 2.3**：在 `src/types/ai.ts` 中定义 `AiConfig`、`ChatMessage`、`MediaGenParams` 类型。
* **步骤 2.4**：在 `src/types/ipc.ts` 中定义 `IpcApiChannels` 映射接口，确保所有 `ipcRenderer.invoke` 通道拥有确切的参数与返回值类型。

### 阶段 3：拆分主进程 `main.js` -> `src/main/*.ts`
* **步骤 3.1**：抽出 `src/main/core/storageManager.ts`（文件异步保存、带防抖锁）。
* **步骤 3.2**：抽出 `src/main/core/windowManager.ts`（主窗口创建、Popout 独立便签/待办窗口生成与通信）。
* **步骤 3.3**：抽出 `src/main/services/syncService.ts`（支持 TS 强类型的 S3 与 WebDAV 备份管理）。
* **步骤 3.4**：抽出 `src/main/services/aiService.ts`（重构 SSE 响应解析、DashScope/OpenAI 多模态任务）。
* **步骤 3.5**：抽出 `src/main/services/musicService.ts` 与 `radioService.ts`。
* **步骤 3.6**：按功能分类重构 IPC 句柄注册层 (`src/main/ipc/*.ts`)，由 `src/main/index.ts` 统一挂载。

### 阶段 4：拆分渲染进程 `renderer.js` -> `src/renderer/*.ts`
* **步骤 4.1**：封装 `src/renderer/core/ipcBridge.ts`，为 UI 提供类型安全的 API 调用门面。
* **步骤 4.2**：创建 `src/renderer/core/stateManager.ts`，统一管理当前便签列表、待办事项、AI 聊天上下文等。
* **步骤 4.3**：拆分便签模块 `src/renderer/modules/notes/`（便签卡片渲染、无边框移动、独立窗口 Popout 关联）。
* **步骤 4.4**：拆分待办事项模块 `src/renderer/modules/todos/`（列表增删改查、排序、完成状态同步）。
* **步骤 4.5**：拆分 AI 对话与多模态生成 UI `src/renderer/modules/ai/`。
* **步骤 4.6**：拆分音乐播放器与电台 UI `src/renderer/modules/music/`。
* **步骤 4.7**：拆分设置弹窗、同步面板与密码锁 `src/renderer/modules/settings/`。

### 阶段 5：完整测试、验证与构建打包收尾
* **步骤 5.1**：运行 TypeScript 编译器全量静态检查（`tsc --noEmit`），修复类型隐患。
* **步骤 5.2**：启动应用完整功能链条测试（便签 CRUD、Popout 弹窗、S3/WebDAV 同步、AI 聊天流式响应、网络电台播放）。
* **步骤 5.3**：更新打包脚本，验证 `@electron/packager` 生成的目标程序运行无异常。

---

## 4. 关键类型与代码示例规约

### 4.1 端到端强类型 IPC 映射 (Strict Type-Safe IPC)

```typescript
// src/types/ipc.ts
import { Note, NoteHistorySnapshot } from './notes';
import { SyncConfig, BackupFileInfo } from './sync';

export interface IpcChannelMap {
  // Notes
  'notes:load': { args: []; return: Promise<Note[]> };
  'notes:save': { args: [notes: Note[]]; return: Promise<{ success: boolean }> };
  'note-history:snapshot': { args: [payload: { noteId: string; content: string }]; return: Promise<void> };
  'note-history:list': { args: [noteId: string]; return: Promise<NoteHistorySnapshot[]> };
  
  // Sync
  'sync:test': { args: [providerKey: string, config: SyncConfig]; return: Promise<{ success: boolean; message: string }> };
  'sync:list-backups': { args: [providerKey: string]; return: Promise<BackupFileInfo[]> };
}
```

---

## 5. 错误处理与容错保障
1. **主进程优雅降级**：所有 IPC 句柄统一采用 `tryWrap` 高阶函数包裹，将后端异常捕获并转化为规范的 `{ success: false, error: string }` 结构输出给渲染层。
2. **数据存储安全**：数据保存仍保持原子写盘（临时文件写入 -> 重命名），避免在类型重构阶段因进程崩溃导致用户 JSON 数据丢失。

---

## 6. 验证标准 (Verification Standards)
- [ ] **编译检查**：`npx tsc --noEmit` 没有任何编译错误与 `any` 报警。
- [ ] **构建产物**：Vite 与 tsup 能够流畅编译出 `dist/` 与 `dist-renderer/`，打包大小不显著增加。
- [ ] **功能验收**：
  1. 主窗口加载便签与待办事项正常；
  2. 便签独立 Window Popout 与置顶正常；
  3. AI 流式对话与图片/视频生成正常；
  4. S3/WebDAV 云端备份与恢复成功；
  5. 密码锁与应用开机自启功能正常。
