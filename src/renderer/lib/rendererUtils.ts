/* ==================== rendererUtils.ts ====================
 * 渲染层公共工具函数模块。
 * 原 utils.js 通过 window.RendererUtils 暴露，现改为 ES module export。
 * =============================================== */

/** 数字补零：1 -> "01", 12 -> "12" */
export function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** 聊天时间格式化 */
export function formatChatTime(ts: number, withDate: boolean = false): string {
    if (!ts) return '';
    const d = new Date(ts);
    const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return withDate ? (d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm) : hm;
}

/** 防抖函数类型 */
export interface DebouncedFunction {
    (...args: any[]): void;
    flush: () => void;
}

/** 防抖：连续触发时只执行最后一次 */
export function debounce(fn: (...args: any[]) => void, wait?: number): DebouncedFunction {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: any[] = [];
    let lastThis: any = null;
    const debounced = function (this: any, ...args: any[]) {
        lastArgs = args;
        lastThis = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn.apply(lastThis, lastArgs); }, wait || 200);
    } as DebouncedFunction;
    debounced.flush = function () {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            fn.apply(lastThis, lastArgs);
        }
    };
    return debounced;
}

/**
 * 从封面原图路径推断缩略图路径（covers/<name>.<ext> → covers/thumb/<name>.jpg）。
 * 浏览器渲染层无 node path 模块，用字符串处理（兼容 \ 与 / 分隔符）。
 * 推断失败（路径不含 covers 标记）返回 null，由调用方回退原图。
 */
export function inferThumbPath(coverPath: string): string | null {
    if (!coverPath || typeof coverPath !== 'string') return null;
    const lower = coverPath.toLowerCase();
    // 兼容 \ 与 / 两种分隔符的 covers 标记
    const backIdx = lower.lastIndexOf('\\covers\\');
    const fwdIdx = lower.lastIndexOf('/covers/');
    const idx = Math.max(backIdx, fwdIdx);
    if (idx < 0) return null;
    const sep = coverPath[idx + 7]; // covers 后的原分隔符（\ 或 /），缩略图目录沿用
    const head = coverPath.slice(0, idx + 8); // 含 ...covers\
    const base = coverPath.slice(idx + 8).replace(/\.[^.]+$/, '');
    return head + 'thumb' + sep + base + '.jpg';
}
