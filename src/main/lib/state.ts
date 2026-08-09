/* ==================== state.ts ====================
 * 主进程跨模块共享的可变状态（main.ts ↔ ipc/index.ts 共用）。
 * 抽离为独立模块，避免 main.ts ↔ ipc/index.ts 之间承载可变状态的循环依赖。
 * M4 修复：添加状态变更日志和访问控制
 * =============================================== */
import { BrowserWindow } from 'electron';

// 跨模块共享的可变状态（index.ts 需要读写）
export const sharedState = {
    isPinned: false,
    isFixed: false,
    chatAbortController: null as AbortController | null,
    videoAbortController: null as AbortController | null,
    videoGenerating: false,
    lockFailCount: 0,
    lockCooldownUntil: 0,
    lockStateLoaded: false,
    isAppLocked: false,
};

// C3 修复：已批准的音频文件路径（realpath 规范形式）。
// 由 music:pick-files / music:scan-folder / music:read-metadata 写入，
// musicfile://audio/ 协议仅允许读取已批准路径，防渲染进程被攻陷后任意读取本地文件。
export const approvedAudioPaths = new Set<string>();

// M4 修复：已批准的扫描根目录（realpath 规范形式）。
// 由 music:pick-folder 写入，music:scan-folder / music:read-metadata 校验，
// 防渲染进程被攻陷后枚举/读取系统任意目录。
export const approvedScanFolders = new Set<string>();

// popout 窗口存储
export const popoutWindows = new Map<string, BrowserWindow>();
export const todoPopoutWindows = new Map<string, BrowserWindow>();
