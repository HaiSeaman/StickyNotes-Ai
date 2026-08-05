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
