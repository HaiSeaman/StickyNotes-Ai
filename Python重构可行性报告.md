# AI-StickyNotes 代码库 Python 重构可行性分析与开发方案

> 评估对象：[AI-StickyNotes](./README.md)（Electron 42.5.1 桌面便签应用，原生 JS）
> 评估维度：源码结构 / 重构难度 / UI 设计 / 框架选型 / 分阶段执行计划
> 报告日期：2026-07-27

---

## 目录

1. [源码审计](#1-源码审计)
2. [UI 设计评估](#2-ui-设计评估)
3. [Python 框架选型对比](#3-python-框架选型对比)
4. [重构难度矩阵](#4-重构难度矩阵)
5. [推荐方案：PySide6 + QtWebEngine 混合架构](#5-推荐方案pyside6--qtwebengine-混合架构)
6. [分阶段开发计划](#6-分阶段开发计划)
7. [风险与对策](#7-风险与对策)
8. [验收与回滚](#8-验收与回滚)

---

## 1. 源码审计

### 1.1 代码规模统计

| 文件 | 行数 | 职责 | 重构复杂度 |
|------|------|------|-----------|
| `main.js` | 5,553 | Electron 主进程入口、~101 个 IPC 处理器、协议注册、窗口/托盘管理、安全策略 | ★★★★★ |
| `renderer.js` | 5,935 | 渲染进程主逻辑（便签/闹钟/聊天/创作/翻译） | ★★★★ |
| `styles.css` | 2,392 | 毛玻璃主题、亮/暗双主题、CSS 变量系统 | ★★ |
| `index.html` | 1,095 | 主窗口 UI 结构（8 个 tab + 多个模态框） | ★★ |
| `radio-tab.js` | 1,173 | FM 收音机渲染逻辑 | ★★★ |
| `purify.min.js` | 1,340 | DOMPurify 第三方库（本地） | — |
| `music-tab.js` | 844 | 音乐播放器渲染逻辑（howler.js 内核） | ★★★ |
| `calendar.js` | 781 | 日历模块（月视图 + 365 天热力图） | ★★★ |
| `logger.js` | 238 | 日志系统（内存缓冲 + 文件轮转 + 控制台劫持） | ★★ |
| `preload.js` | 217 | 主窗口预加载（暴露 `window.api`） | ★ |
| `security.js` | 125 | 通用安全工具（SSRF、payload 限制、转义） | ★★ |
| `paths.js` | 120 | 数据文件路径集中管理 | ★ |
| `json-io.js` | 104 | JSON 原子读写 + EPERM 重试 | ★★ |
| `overlay-logger.js` | 69 | 子窗口日志批量上报 | ★ |
| `popout-preload.js` | 58 | 小窗口预加载 | ★ |
| `shared-utils.js` | 57 | 渲染层共享工具 | ★ |
| **合计** | **~20,110** | | |

### 1.2 架构特征（强 Electron 耦合）

```
┌─────────────────────────────────────────────────────┐
│  主进程 main.js (Node.js)                            │
│  ├─ 101 个 ipcMain.handle 处理器                     │ ← Python 需重写为 RPC/REST
│  ├─ safeStorage 凭据加密                              │ ← Python 需 keyring/cryptography
│  ├─ 3 个自定义协议 (chatimg/ttsfile/musicfile)         │ ← Python 需 Qt QWebEngineUrlScheme
│  ├─ session.setPermissionRequestHandler              │ ← Python 需 QtWebEngineProfile
│  ├─ Tray + Menu + BrowserWindow                      │ ← Python 需 QSystemTrayIcon
│  ├─ CSP via responseHeaders                          │ ← Qt WebEngine 自动支持
│  ├─ backgroundThrottling:false (保证闹钟)             │ ← Python 用独立 QTimer 线程
│  └─ @aws-sdk/client-s3 / adm-zip / music-metadata    │ ← Python 用 boto3 / zipfile / mutagen
└─────────────────────────────────────────────────────┘
                       │ contextBridge
┌─────────────────────────────────────────────────────┐
│  渲染进程 renderer.js (浏览器 JS)                     │
│  └─ window.api.* → ipcRenderer.invoke                │ ← Python 需 QWebChannel 桥接
└─────────────────────────────────────────────────────┘
```

### 1.3 关键依赖迁移对照表

| 原依赖（Node/JS） | 用途 | Python 对应 | 迁移难度 |
|-------------------|------|------------|---------|
| `electron` 主进程 API | 桌面壳 | `PySide6` (QApplication + QMainWindow) | 中 |
| `electron` safeStorage | 凭据加密 | `keyring` + `cryptography.fernet` | 中 |
| `electron` BrowserWindow | 窗口 | `QMainWindow` + `QWebEngineView` | 中 |
| `electron` Tray / Menu | 托盘 | `QSystemTrayIcon` / `QMenu` | 低 |
| `electron` ipcMain (101 处) | RPC | `QWebChannel` 或本地 FastAPI | **高** |
| `electron` protocol | 自定义协议 | `QWebEngineUrlScheme` + `QWebEngineUrlSchemeHandler` | 中 |
| `electron` session | CSP/权限 | `QWebEngineProfile` | 中 |
| `@aws-sdk/client-s3` | S3 同步 | `boto3` | 低 |
| `adm-zip` | 备份打包 | 内置 `zipfile` + `pathlib` | 低 |
| `music-metadata-browser` | 音频元数据 | `mutagen` | 低 |
| `marked` | Markdown 渲染 | `markdown` 或 `mistune`（**前端保留 marked 即可**） | 低 |
| `dompurify` | XSS 净化 | `bleach`（**前端保留 DOMPurify 即可**） | 低 |
| `howler.js` | 音乐播放内核 | 前端保留 / 或 `QMediaPlayer` | 低 |
| `crypto.scryptSync` | PIN 哈希 | `hashlib.scrypt` | 低 |
| `https`/`http` | 网络请求 | `httpx`（异步流式 SSE 友好） | 低 |
| Node `fs.promises` | 文件 IO | `pathlib` + `aiofiles` | 低 |

---

## 2. UI 设计评估

### 2.1 设计风格

应用采用 **Glassmorphism（毛玻璃风格）**，整体观感精致：

- **半透明 + 背景模糊**：`backdrop-filter: blur()` 实现毛玻璃质感
- **CSS 变量主题系统**：`--accent`、`--bg-deep`、`--text-2` 等集中管理
- **双主题**：亮色（柔和青色 `#7fb3b3`）/ 暗色（iOS Dark + GitHub Dark 混合 `#1C1C1E` / `#0A84FF`）
- **窗口透明度可调**：20%-100% 实时滑动调节
- **多色背景板**：用户可切换背景色

### 2.2 UI 工程亮点

| 维度 | 评价 | 说明 |
|------|------|------|
| **视觉一致性** | ★★★★ | CSS 变量统一管控配色，亮/暗双主题切换无缝 |
| **可访问性** | ★★★★ | 全量 ARIA 标签（`role`/`aria-label`/`aria-live`），SVG 图标均 `aria-hidden` |
| **响应式布局** | ★★★ | Flex + Grid 双轨，但桌面应用场景不强调移动适配 |
| **图标系统** | ★★★★ | 内联 SVG（24×24 viewBox），无字体图标依赖，可主题着色 |
| **模块化** | ★★★ | HTML 单文件 1095 行，CSS 2392 行单文件，略偏大但分层清晰 |
| **动效** | ★★★ | 进度环动画、tab 切换过渡、热力图渲染 |

### 2.3 UI 主要问题

1. **单文件 HTML/CSS 较大**：`index.html` 1095 行 + `styles.css` 2392 行，未拆分组件
2. **未引入现代前端框架**：纯原生 JS 操作 DOM，状态管理散落在 `renderer.js` 5935 行中
3. **缺少构建工具**：无 Webpack/Vite，第三方库以 `.min.js` 文件硬塞入项目

### 2.4 UI 重构建议

**保留现有 HTML/CSS/JS 前端资产**，仅在 Python 重构中通过 `QWebEngineView` 嵌入。理由：

- 已投入 9000+ 行前端代码（HTML+CSS+renderer.js+子模块），重写为 Qt 原生控件代价极大
- 毛玻璃效果在 Qt 原生控件上需要重写 `paintEvent`，且 Windows 平台需调 DWM API
- `QWebEngine` 基于 Chromium，CSS3 `backdrop-filter`、Flex/Grid、SVG 全部原生支持
- 仅需把 `window.api.*` 调用桥接到 Python（通过 `QWebChannel`）

---

## 3. Python 框架选型对比

| 框架 | UI 渲染 | 桌面集成 | 毛玻璃支持 | 学习曲线 | 重构工作量 | 综合评分 |
|------|---------|---------|-----------|---------|-----------|---------|
| **PySide6 + QtWebEngine** | Qt 原生 + Chromium 嵌入 | ★★★★★ | ★★★★★（CSS 原生） | 中 | **低**（前端可复用） | **★★★★★** |
| **PyWebView** | 系统 WebView2 | ★★★ | ★★★ | 低 | 中 | ★★★★ |
| **Flet** | Flutter | ★★★★ | ★★★ | 低 | 高（UI 全重写） | ★★★ |
| **CustomTkinter** | Tk 原生 | ★★★ | ★ | 低 | 高（UI 全重写） | ★★ |
| **NiceGUI** | 浏览器 | ★★ | ★★★★★ | 低 | 中 | ★★★ |
| **PySide6 纯原生** | Qt Widgets/QML | ★★★★★ | ★★★（需自绘） | 高 | 极高（UI 全重写） | ★★ |

### 3.1 推荐选型：**PySide6 6.7+ with QtWebEngine**

理由：
1. **Chromium 内核**：HTML/CSS/JS 100% 兼容，毛玻璃、Flex、SVG、`backdrop-filter` 全部原生支持
2. **桌面集成完备**：托盘、全局快捷键、系统托盘、窗口透明、置顶、开机自启均有原生 API
3. **凭据加密**：可调 Windows DPAPI（`ctypes` + `CryptProtectData`）替代 safeStorage
4. **协议注册**：`QWebEngineUrlScheme.registerScheme` 等价于 Electron `protocol.registerSchemesAsPrivileged`
5. **生命周期成熟**：Qt 是工业级 GUI 框架，长期维护有保障
6. **打包友好**：`PyInstaller --onefile` 或 `Nuitka` 可生成单 exe，体积比 Electron 小（~50MB vs ~150MB）

---

## 4. 重构难度矩阵

### 4.1 模块级难度评估

| 模块 | 代码量 | 难度 | 风险点 |
|------|--------|------|--------|
| 便签 CRUD + 归档 + 回收站 | 中 | ★★ | 文件原子写入需用 `os.replace` 实现 |
| Markdown 编辑/预览 | 低 | ★ | 前端保留 marked + DOMPurify 即可 |
| 闹钟（倒计时 + 定时） | 中 | ★★ | `backgroundThrottling` 替换为 `QTimer` + 独立线程 |
| 日历 + 热力图 | 中 | ★★ | 前端逻辑保留，IPC 桥接即可 |
| AI 聊天（SSE 流式） | 高 | ★★★★ | `httpx.AsyncClient` 流式响应，需通过 `QWebChannel` 推送 chunk 到前端 |
| AI 图片/视频生成 | 高 | ★★★★ | 阿里云百炼异步任务模式，需轮询 + 流式下载 |
| TTS 语音合成 | 中 | ★★★ | 音频文件协议加载、缓存清理 |
| 音乐播放器 | 高 | ★★★★ | howler.js 前端保留；元数据解析换 `mutagen` |
| FM 网络电台 | 高 | ★★★★ | Icecast 流式播放、网络速度采样 |
| 数据同步（S3 + WebDAV） | 高 | ★★★ | `boto3` + `webdavclient3` |
| 软件锁（PIN） | 中 | ★★★ | scrypt + DPAPI 双层加密 |
| 安全层（SSRF/CSP/路径校验） | 中 | ★★★ | 需逐一用 Python 重写，逻辑等价 |
| 日志系统 | 中 | ★★ | `logging.handlers.RotatingFileHandler` + 内存缓冲 |
| 子窗口（popout） | 中 | ★★★ | `QWebEngineView` 多实例管理 |
| 打包分发 | 低 | ★★ | PyInstaller/Nuitka + Windows installer |

### 4.2 总体难度评估

**整体难度：★★★★（高）**

主要难点：
1. **101 个 IPC 处理器迁移**：纯体力活，但量大
2. **流式 SSE 推送到前端**：需建立 `QWebChannel` 双向通道
3. **自定义协议 + 路径校验**：Qt WebEngine API 与 Electron 差异较大
4. **音乐元数据 + 封面提取**：`mutagen` API 与 `music-metadata-browser` 完全不同
5. **Windows 平台特性**：开机自启、托盘、透明窗口、DWM 调用

---

## 5. 推荐方案：PySide6 + QtWebEngine 混合架构

### 5.1 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                Python 主进程（PySide6 app）                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  QApplication │  │ QSystemTray  │  │  QWebEngineProfile│  │
│  │  + 主窗口      │  │  + 全局快捷键  │  │  (CSP/权限/Cookie)│  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  BackendService（业务逻辑层，单例 QObject）              │ │
│  │  ├─ notes_service.py（便签 CRUD + 归档 + 历史）         │ │
│  │  ├─ ai_chat_service.py（OpenAI 兼容流式聊天）           │ │
│  │  ├─ ai_create_service.py（图片/视频生成）               │ │
│  │  ├─ tts_service.py（语音合成 + 缓存）                   │ │
│  │  ├─ translate_service.py（文本 + OCR 翻译）             │ │
│  │  ├─ music_service.py（mutagen 元数据 + 封面）           │ │
│  │  ├─ radio_service.py（RadioBrowser API）                │ │
│  │  ├─ calendar_service.py（日历 + 活跃度）                │ │
│  │  ├─ alarm_service.py（QTimer 闹钟调度）                 │ │
│  │  ├─ sync_service.py（boto3 + webdavclient3）           │ │
│  │  ├─ lock_service.py（PIN scrypt + DPAPI）               │ │
│  │  ├─ security.py（SSRF + payload + escape）              │ │
│  │  ├─ json_io.py（atomic write + EPERM retry）           │ │
│  │  ├─ paths.py（pathlib 路径管理）                        │ │
│  │  └─ logger.py（RotatingFileHandler + 内存缓冲）         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  QWebChannel 桥（替代 contextBridge）                    │ │
│  │  ├─ BridgeObject.notesCreate(...)                       │ │
│  │  ├─ BridgeObject.aiChatStream(...) → pyqtSignal 推送    │ │
│  │  └─ ... 共 101 个方法                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  QWebEngineUrlScheme 注册（替代 Electron protocol）      │ │
│  │  ├─ chatimg://   → 本地图片                             │ │
│  │  ├─ ttsfile://   → TTS 音频                             │ │
│  │  └─ musicfile:// → 音乐文件                             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│             QWebEngineView（渲染现有 HTML/CSS/JS）            │
│                                                              │
│  index.html + styles.css + renderer.js + calendar.js + ...  │
│  （前端几乎零改动，仅替换 window.api → qwebchannel.js 桥）     │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 项目结构（目标）

```
ai-stickynotes-py/
├── main.py                       # PySide6 入口
├── requirements.txt
├── pyproject.toml
├── resources/
│   ├── frontend/                 # 复用前端资产
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── renderer.js
│   │   ├── calendar.js
│   │   ├── music-tab.js
│   │   ├── radio-tab.js
│   │   ├── shared-utils.js
│   │   ├── marked.min.js
│   │   ├── purify.min.js
│   │   ├── howler.min.js
│   │   └── qwebchannel.js        # Qt 自带桥接 JS
│   ├── icons/
│   │   └── icon.ico
│   └── sounds/                   # 7 种闹钟提示音
├── app/
│   ├── __init__.py
│   ├── main_window.py            # QMainWindow + QWebEngineView
│   ├── tray.py                   # QSystemTrayIcon
│   ├── bridge.py                 # QWebChannel 桥接对象（101 个方法）
│   ├── schemes.py                # 自定义协议处理器
│   ├── services/
│   │   ├── __init__.py
│   │   ├── notes.py
│   │   ├── ai_chat.py
│   │   ├── ai_create.py
│   │   ├── tts.py
│   │   ├── translate.py
│   │   ├── music.py
│   │   ├── radio.py
│   │   ├── calendar.py
│   │   ├── alarm.py
│   │   ├── sync.py
│   │   ├── lock.py
│   │   └── settings.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── security.py           # SSRF + payload + escape
│   │   ├── json_io.py            # 原子写入
│   │   ├── paths.py
│   │   ├── logger.py
│   │   ├── credentials.py        # DPAPI + keyring
│   │   └── config.py
│   └── popout/
│       ├── __init__.py
│       └── popout_window.py      # 独立小窗口
├── build/
│   └── build.spec                # PyInstaller 配置
└── tests/
    ├── test_security.py
    ├── test_json_io.py
    ├── test_lock.py
    └── ...
```

---

## 6. 分阶段开发计划

> 总周期：约 **12 周**（按 1 名熟悉 Python+Qt 的工程师估算；2 人并行约 8 周）
> 阶段间设置验收闸门，前阶段未通过不进入下一阶段

### 阶段 0：筹备与基线（1 周）

| 任务 | 产出 | 验收标准 |
|------|------|---------|
| 0.1 搭建 Python 3.11+ 项目骨架 | `pyproject.toml`、`requirements.txt` | `pip install -e .` 成功 |
| 0.2 安装 PySide6 6.7+ 与 QtWebEngine | 依赖锁定 | `python -c "import PySide6.QtWebEngineWidgets"` 通过 |
| 0.3 准备前端资产迁移 | `resources/frontend/` | 文件清单与原项目对齐 |
| 0.4 编写原项目功能基线测试用例 | `tests/baseline/` | 覆盖 8 个 tab 的核心流程 |
| 0.5 CI 配置（GitHub Actions） | `.github/workflows/ci.yml` | lint + test 自动化 |

**依赖清单**：

```
PySide6>=6.7.0
PySide6-Addons>=6.7.0          # 含 QtWebEngine
boto3>=1.34
httpx>=0.27                     # 异步 HTTP + SSE
mutagen>=1.47                   # 音频元数据
webdavclient3>=3.14             # WebDAV 同步
keyring>=24                     # 凭据存储
cryptography>=42                # Fernet 对称加密
pywin32>=306 ; platform_system=='Windows'  # DPAPI / 开机自启
markdown-it-py>=3               # 后端 Markdown 兜底
bleach>=6                       # 后端 HTML 净化兜底
pyinstaller>=6                  # 打包
pytest>=8
pytest-asyncio>=0.23
pytest-qt>=4.4
```

---

### 阶段 1：核心骨架（2 周）

**目标**：跑起一个嵌入现有 HTML 的桌面窗口，能正常显示便签 UI。

| 任务 | 关键 API | 验收 |
|------|---------|------|
| 1.1 实现 `main_window.py` | `QMainWindow` + `QWebEngineView` + `setUrl` | 窗口能显示 index.html |
| 1.2 实现透明窗口 + 置顶 + 固定 | `setAttribute(Qt.WA_TranslucentBackground)` + `WindowStaysOnTopHint` | 透明度滑块生效 |
| 1.3 注册 `chatimg://` 协议 | `QWebEngineUrlScheme.registerScheme` + `QWebEngineUrlSchemeHandler` | 图片能加载 |
| 1.4 实现 `QWebChannel` 桥骨架 | `QWebChannel` + `registerObject` | 前端 `qt.webChannelTransport` 可用 |
| 1.5 实现 `paths.py` | `pathlib.Path` + `QStandardPaths.AppDataLocation` | 路径与原项目对齐 |
| 1.6 实现 `json_io.py` | `os.replace` 原子写 + `tempfile.NamedTemporaryFile` | 写入中断不损坏文件 |
| 1.7 实现 `logger.py` | `logging.handlers.RotatingFileHandler` + 内存 deque | 日志按 5MB 滚动 |
| 1.8 实现 `security.py` | `ipaddress` + `urllib.parse` | SSRF 校验逻辑等价 |
| 1.9 实现托盘 + 最小化到托盘 | `QSystemTrayIcon` + `QMenu` | 关闭按钮 → 最小化到托盘 |
| 1.10 前端改造：替换 `window.api` 调用 | `qwebchannel.js` 包装 | 前端逻辑零改动 |

**关键代码骨架**：

```python
# app/main_window.py
import sys
from pathlib import Path
from PySide6.QtCore import QUrl, QObject, Slot
from PySide6.QtGui import Qt, QIcon
from PySide6.QtWidgets import QMainWindow, QApplication, QSystemTrayIcon, QMenu
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineProfile, QWebEngineUrlScheme

from app.bridge import BridgeObject
from app.schemes import ChatImgSchemeHandler, TtsFileSchemeHandler, MusicFileSchemeHandler
from app.core.paths import FRONEND_DIR


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("便签")
        self.setWindowIcon(QIcon(str(Path("resources/icons/icon.ico"))))
        self.resize(1200, 800)

        # 注册自定义协议（必须在 QApplication 创建前调用一次）
        # 见 schemes.py 中 register_schemes() 在 main.py 启动时调用

        # WebEngine 视图
        self.view = QWebEngineView()
        self.channel = QWebChannel()
        self.bridge = BridgeObject(self)
        self.channel.registerObject("bridge", self.bridge)
        self.view.page().setWebChannel(self.channel)

        # CSP 等同配置
        profile = self.view.page().profile()
        profile.setHttpUserAgent("AI-StickyNotes-Py/1.0")

        self.setCentralWidget(self.view)
        self.view.setUrl(QUrl.fromLocalFile(FRONEND_DIR / "index.html"))

        # 透明窗口
        self.setAttribute(Qt.WA_TranslucentBackground, True)
```

```python
# app/bridge.py（QWebChannel 桥接对象，101 个 Slot 方法）
from PySide6.QtCore import QObject, Slot, Signal


class BridgeObject(QObject):
    # 流式聊天信号：把后端 chunk 推到前端
    chatChunk = Signal(str, str)  # (chatId, delta)
    chatDone = Signal(str)        # chatId
    chatError = Signal(str, str)  # (chatId, errMsg)

    # 闹钟触发信号
    alarmTriggered = Signal(str)  # alarmId

    def __init__(self, parent=None):
        super().__init__(parent)
        from app.services.notes import NotesService
        from app.services.ai_chat import AiChatService
        # ... 实例化所有 service
        self._notes = NotesService()
        self._ai_chat = AiChatService()
        # ...

    # ===== 便签 CRUD =====
    @Slot(dict, result=dict)
    def notesCreate(self, payload):
        return self._notes.create(payload)

    @Slot(str, result=dict)
    def notesList(self, filter):
        return self._notes.list(filter)

    # ... 101 个 Slot 方法

    # ===== AI 流式聊天（异步推送） =====
    @Slot(dict)
    def aiChatStream(self, payload):
        from PySide6.QtCore import QThread
        # 用 QThread 或 asyncio.run_coroutine_threadsafe 跑流式请求
        # 边收边 emit chatChunk 信号 → 前端订阅
        ...
```

```javascript
// resources/frontend/qwebchannel-bridge.js
// 替换原 window.api，对外接口与原项目 1:1 对齐
(function () {
    let bridge = null;
    new QWebChannel(qt.webChannelTransport, function (channel) {
        bridge = channel.objects.bridge;

        // 流式聊天信号订阅
        bridge.chatChunk.connect(function (chatId, delta) {
            window.dispatchEvent(new CustomEvent('ai-chat-chunk', { detail: { chatId, delta } }));
        });
        bridge.chatDone.connect(function (chatId) {
            window.dispatchEvent(new CustomEvent('ai-chat-done', { detail: { chatId } }));
        });
    });

    // window.api.notesCreate(...) → bridge.notesCreate(...)
    window.api = new Proxy({}, {
        get: function (_, name) {
            return function (...args) {
                // 兼容原 IPC 命名空间（notes:create → notesCreate）
                const methodName = name.replace(/:(\w)/g, (_, c) => c.toUpperCase());
                return new Promise(function (resolve, reject) {
                    const call = function () {
                        if (!bridge) { setTimeout(call, 50); return; }
                        try {
                            const result = bridge[methodName](args[0] || {});
                            // Qt 异步返回值用 QPromise，这里简化
                            resolve(result);
                        } catch (e) { reject(e); }
                    };
                    call();
                });
            };
        }
    });
})();
```

---

### 阶段 2：业务服务迁移（4 周）

按优先级分两批迁移 101 个 IPC 处理器，每批结束后跑回归测试。

#### 阶段 2.1 基础数据模块（2 周）

| 服务 | 对应原 IPC | 关键实现 |
|------|-----------|---------|
| `notes.py` | `notes:*` / `note-history:*` | CRUD + 归档 + 回收站 + 历史快照 |
| `calendar.py` | `calendar:*` / `activity:*` | 日历↔闹钟映射 + 活跃度统计 |
| `alarm.py` | `alarm:*` | `QTimer` 调度 + 后台运行保证 |
| `settings.py` | `settings:*` | JSON 配置 + 缓存 |
| `lock.py` | `lock:*` | scrypt + DPAPI 双层加密 |
| `credentials.py` | safeStorage 等价 | Windows DPAPI via `ctypes` |

**DPAPI 凭据加密示例**：

```python
# app/core/credentials.py
import ctypes
import base64
from ctypes import wintypes
from pathlib import Path

class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_char))]

def dpapi_encrypt(plaintext: bytes) -> str:
    """等价于 Electron safeStorage.encryptString."""
    in_blob = DATA_BLOB(len(plaintext), ctypes.cast(
        ctypes.create_string_buffer(plaintext, len(plaintext)),
        ctypes.POINTER(ctypes.c_char)))
    out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("CryptProtectData failed")
    try:
        encrypted = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        return base64.b64encode(encrypted).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)

def dpapi_decrypt(b64_ciphertext: str) -> bytes:
    """等价于 Electron safeStorage.decryptString."""
    ciphertext = base64.b64decode(b64_ciphertext)
    in_blob = DATA_BLOB(len(ciphertext), ctypes.cast(
        ctypes.create_string_buffer(ciphertext, len(ciphertext)),
        ctypes.POINTER(ctypes.c_char)))
    out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)
```

**PIN 锁实现**：

```python
# app/services/lock.py
import hashlib
import secrets
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from app.core.credentials import dpapi_encrypt, dpapi_decrypt

class LockService:
    def __init__(self, settings_path: Path):
        self._settings_path = settings_path

    def set_pin(self, pin: str) -> None:
        salt = secrets.token_bytes(16)
        # 与 Node crypto.scryptSync 参数对齐：N=16384, r=8, p=1, keylen=64
        kdf = Scrypt(salt=salt, length=64, n=16384, r=8, p=1)
        hash_ = kdf.derive(pin.encode('utf-8'))
        # 二次 DPAPI 加密（等价于 safeStorage）
        encrypted = dpapi_encrypt(salt + hash_)
        self._save_pin(encrypted)

    def verify_pin(self, pin: str) -> bool:
        encrypted = self._load_pin()
        if not encrypted:
            return False
        try:
            data = dpapi_decrypt(encrypted)
            salt, hash_ = data[:16], data[16:]
            kdf = Scrypt(salt=salt, length=64, n=16384, r=8, p=1)
            kdf.verify(pin.encode('utf-8'), hash_)
            return True
        except Exception:
            return False
```

#### 阶段 2.2 AI 与多媒体模块（2 周）

| 服务 | 对应原 IPC | 关键实现 |
|------|-----------|---------|
| `ai_chat.py` | `ai:chat` / `ai:save-config` / `ai:load-config` | `httpx.AsyncClient` 流式 SSE，通过 `pyqtSignal` 推送 |
| `ai_create.py` | `ai:generate-image` / `ai:generate-video` | 百炼异步任务轮询 + 流式下载到磁盘 |
| `tts.py` | `tts:*` | CosyVoice/Qwen-Audio 合成 + 7 天/100MB 缓存 |
| `translate.py` | `ai:translate` | 文本翻译 + 图片 OCR |
| `music.py` | `music:*` | `mutagen` 元数据 + SHA-256 封面去重 |
| `radio.py` | `radio:*` | RadioBrowser API + 5 数据源循环 |

**流式 SSE 推送到前端的关键模式**：

```python
# app/services/ai_chat.py
import asyncio
import httpx
from PySide6.QtCore import QObject, Signal, QThread

class AiChatWorker(QObject):
    chunk = Signal(str, str)   # (chatId, delta)
    done = Signal(str)         # chatId
    error = Signal(str, str)   # (chatId, errMsg)

    def __init__(self, chat_id, payload, config):
        super().__init__()
        self._chat_id = chat_id
        self._payload = payload
        self._config = config
        self._cancelled = False

    def run(self):
        try:
            asyncio.run(self._stream())
        except Exception as e:
            self.error.emit(self._chat_id, str(e))

    async def _stream(self):
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream(
                "POST",
                f"{self._config['baseUrl']}/chat/completions",
                json={**self._payload, "stream": True},
                headers={"Authorization": f"Bearer {self._config['apiKey']}"},
            ) as resp:
                async for line in resp.aiter_lines():
                    if self._cancelled:
                        break
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        # 解析 delta 并 emit
                        self.chunk.emit(self._chat_id, self._parse_delta(data))
        self.done.emit(self._chat_id)

    def cancel(self):
        self._cancelled = True


class AiChatService:
    def __init__(self):
        self._workers = {}  # chat_id -> (QThread, AiChatWorker)

    def stream_chat(self, chat_id, payload, config, on_chunk, on_done, on_error):
        thread = QThread()
        worker = AiChatWorker(chat_id, payload, config)
        worker.moveToThread(thread)
        worker.chunk.connect(on_chunk)
        worker.done.connect(on_done)
        worker.error.connect(on_error)
        thread.started.connect(worker.run)
        thread.start()
        self._workers[chat_id] = (thread, worker)

    def abort(self, chat_id):
        if chat_id in self._workers:
            self._workers[chat_id][1].cancel()
```

---

### 阶段 3：数据同步与安全（2 周）

| 任务 | 关键实现 | 验收 |
|------|---------|------|
| 3.1 S3 同步 | `boto3.client('s3', endpoint_url=...)` + `put_object`/`list_objects_v2` | 与原项目备份格式兼容 |
| 3.2 WebDAV 同步 | `webdav3.client.Client` + 自签名证书选项 | 与原项目备份格式兼容 |
| 3.3 备份打包 | `zipfile` + 防 Zip Slip（仅取 basename） | 恶意 ZIP 无法逃逸目录 |
| 3.4 备份恢复 | 解压 + 路径校验 + 禁止恢复 settings.json | 安全测试通过 |
| 3.5 自动同步 | `QTimer` 定时器（15/30/60/360/1440 min） | 间隔切换生效 |
| 3.6 SSRF 校验 | `ipaddress.ip_address` + 私网段判断 | 与 `isSafeExternalUrl` 逻辑等价 |
| 3.7 路径遍历防护 | `Path.resolve()` + `is_relative_to()` | symlink 逃逸测试通过 |

---

### 阶段 4：桌面集成完善（2 周）

| 任务 | 关键实现 |
|------|---------|
| 4.1 子窗口（popout） | 多 `QWebEngineView` 实例 + 独立 `QWebChannel` |
| 4.2 系统托盘菜单 | `QSystemTrayIcon` + `QMenu`（显示/退出） |
| 4.3 开机自启 | Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| 4.4 全局快捷键 | `QShortcut` 或 `pynput` |
| 4.5 闹钟后台保证 | `QTimer` + 独立 `QThread`（不受 UI 卡顿影响） |
| 4.6 软件锁锁屏 | 全屏 `QFrame` 覆盖 + 4 位 PIN 输入框 |
| 4.7 窗口透明度 | `setWindowOpacity(0.2~1.0)` |
| 4.8 日志查看器 | 复用前端模态框 + 后端 `logs:get` 桥接 |

---

### 阶段 5：测试与性能（1 周）

| 任务 | 验收 |
|------|------|
| 5.1 单元测试（security/json_io/lock/sync） | 覆盖率 ≥ 80% |
| 5.2 集成测试（pytest-qt 跑 UI 流程） | 8 个 tab 主流程通过 |
| 5.3 性能基准对比 | 启动时间、内存占用、流式聊天延迟 ≤ 原项目 ±10% |
| 5.4 安全测试 | OWASP 桌面应用清单通过 |
| 5.5 兼容性测试 | Windows 10/11 x64 通过 |

---

### 阶段 6：打包与发布（1 周）

| 任务 | 命令 / 工具 |
|------|------------|
| 6.1 PyInstaller 打包 | `pyinstaller build/build.spec --onefile --windowed --icon=resources/icons/icon.ico` |
| 6.2 资源打包 | `--add-data "resources/frontend;resources/frontend"` |
| 6.3 Qt 插件打包 | `--add-data` 包含 platforms、imageformats、mediaservice 等 |
| 6.4 体积优化 | `--exclude-module` 剔除未用 Qt 模块 |
| 6.5 安装包 | Inno Setup 生成 `AI-StickyNotes-Setup.exe` |
| 6.6 签名 | 可选，使用代码签名证书 |
| 6.7 自动更新 | 可选，集成 `pyupdater` 或自实现 |

**预期产物体积**：~60-80 MB（vs Electron 150+ MB）

---

## 7. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| QtWebEngine 体积大（~50MB） | 高 | 中 | 用 `aiohttp` + `pywebview` 替代方案预留 |
| 101 个 IPC 桥接遗漏或语义偏差 | 中 | 高 | 自动生成桥接代码：从 `main.js` 解析 `ipcMain.handle` 列表生成 `bridge.py` 骨架 |
| 流式 SSE 推送卡顿 | 中 | 高 | 用 `QThread` 而非 `asyncio.run_in_executor`，避免 GIL 争用 |
| DPAPI 在非 Windows 不可用 | 低 | 中 | 抽象 `CredentialsBackend` 接口，Linux/macOS fallback 到 `keyring` |
| `mutagen` 与 `music-metadata-browser` 字段差异 | 中 | 中 | 编写元数据字段映射表 + 回归测试 |
| QtWebEngine CSP 配置差异 | 中 | 中 | 用 `setUrlRequestInterceptor` 强制注入 CSP 头 |
| Windows 透明窗口 + 拖动闪烁 | 中 | 低 | `setAttribute(Qt.WA_NoSystemBackground)` + `DwmExtendFrameIntoClientArea` |
| PyInstaller 隐藏导入遗漏 | 高 | 中 | `--hidden-import` 显式声明 QtWebEngine 子模块 + 启动烟雾测试 |
| 前端 `window.api` 异步语义不一致 | 中 | 高 | 桥接层统一返回 `Promise`，保持与原项目 1:1 兼容 |
| 闹钟在系统休眠后失效 | 中 | 中 | 用 `QTimer.setSingleShot(True)` + 启动时扫描错过的闹钟 |

---

## 8. 验收与回滚

### 8.1 验收标准（DOD）

- ✅ 8 个功能 tab 全部可用，与原项目功能对齐
- ✅ 101 个 IPC 处理器全部迁移并测试
- ✅ 安全机制等价（SSRF/CSP/PIN/路径校验/备份防 Zip Slip）
- ✅ 数据文件 100% 兼容原项目（可直接迁移用户数据）
- ✅ 启动时间 ≤ 3s（参考原项目）
- ✅ 内存占用 ≤ 300MB（vs Electron ~400MB）
- ✅ 安装包体积 ≤ 80MB
- ✅ Windows 10/11 x64 通过

### 8.2 回滚策略

| 阶段 | 回滚动作 |
|------|---------|
| 阶段 1-2 失败 | 保留原 Electron 项目作为发布版本，Python 版作为预研分支 |
| 阶段 3-4 失败 | 部分模块混合：前端继续用 Electron 壳，仅同步/锁模块切到 Python 服务 |
| 阶段 5-6 失败 | 双版本并行发布 3 个月，收集用户反馈后再决定下线原版 |

### 8.3 双版本过渡期数据兼容

- Python 版完全沿用 `userData/` 下的 JSON 文件结构
- 凭据迁移：启动时检测 `safeStorage` 加密的 base64 字段，尝试 DPAPI 解密（同用户同机器可解），失败则提示用户重新输入
- 备份格式：保持 `_backup_meta.json` 字段不变，跨版本可互恢复

---

## 附录 A：是否值得重构？决策矩阵

| 评估维度 | 原项目（Electron） | Python 重构后 | 结论 |
|---------|------------------|--------------|------|
| 安装包体积 | ~150 MB | ~70 MB | Python 胜 |
| 启动内存 | ~400 MB | ~250 MB | Python 胜 |
| 启动速度 | ~2.5s | ~2.0s | 持平 |
| 开发效率（JS 生态） | 高（npm 生态成熟） | 中（Qt 学习曲线） | Electron 胜 |
| 跨平台 | macOS/Linux 简单 | 需重新打包 | Electron 胜 |
| 安全更新 | Electron 频繁升级 | Qt 稳定 | Python 胜 |
| 现有代码投资 | 已 20K 行 | 全部迁移 | Electron 胜 |

**最终建议**：

> 如果项目当前没有明确的痛点（如体积、内存、跨平台、维护成本），**不建议立即重构**。
> 
> 如果有以下场景之一，建议启动重构：
> 1. 用户反馈安装包/内存过大，需要轻量化
> 2. 需要扩展到 macOS/Linux 桌面
> 3. 团队 Python 资源远比 JS 资源充足
> 4. 需要深度集成系统级能力（如 GPU 加速、原生通知中心）—— Qt 比 Electron 更适合
> 5. 长期维护成本敏感 —— Electron 版本升级频繁，Chromium 漏洞修复跟进成本高

---

## 附录 B：参考资源

- [PySide6 官方文档](https://doc.qt.io/qtforpython-6/)
- [QtWebEngine 部署指南](https://doc.qt.io/qt-6/webengine-deploying.html)
- [QWebChannel 教程](https://doc.qt.io/qt-6/qtwebchannel-index.html)
- [PyInstaller + PySide6 打包](https://pyinstaller.org/en/stable/)
- [Windows DPAPI 文档](https://learn.microsoft.com/en-us/windows/win32/seccrypto/windows-data-protection)
- [boto3 S3 文档](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html)
- [mutagen 文档](https://mutagen.readthedocs.io/)

---

**报告版本**：v1.0
**编写日期**：2026-07-27
**评估人**：技术评估小组
