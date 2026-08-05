/* ==================== shared-utils.ts ====================
 * 跨模块共享的通用工具函数（主进程版本）。
 * 仅保留主进程实际消费的函数；渲染层版本见 src/renderer/lib/shared-utils.ts。
 * =============================================== */

/** 去除字符串末尾的斜杠 */
export function trimTrailingSlash(s: string | null | undefined): string {
    return (s || '').trim().replace(/\/+$/, '');
}
