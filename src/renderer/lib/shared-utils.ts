/* ==================== shared-utils.ts ====================
 * 跨模块共享的通用工具函数（渲染层版本）。
 * 原 shared-utils.js 通过 <script> 加载使函数成为全局变量，
 * 现改为 ES module export，各文件用 import 引入。
 * =============================================== */

// L1 修复：单调递增计数器，消除同毫秒内 genId 碰撞
let _genIdCounter = 0;

/** 生成唯一ID（基于时间戳 + 单调递增计数器 + 随机数） */
export function genId(): number {
    const now = Date.now();
    _genIdCounter = (_genIdCounter + 1) % 1000;
    return now * 1000 + _genIdCounter;
}

/** 提取文本的首行作为预览，超长则截断 */
export function previewText(text: string, maxLen?: number): string {
    const len = maxLen === undefined ? 24 : maxLen;
    if (!text) return '空白便签';
    const firstLine = text.split('\n')[0];
    return firstLine.length > len ? firstLine.slice(0, len) + '...' : firstLine;
}

/** Date 转 ISO 日期字符串 (YYYY-MM-DD)，防时区偏移
 * L2 修复：对 'YYYY-MM-DD' 字符串按本地日期解析，避免被解析为 UTC 导致 UTC-X 时区得到前一天 */
export function toISODate(d: Date | string): string {
    let date: Date;
    if (d instanceof Date) {
        date = d;
    } else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        // 纯日期字符串按本地日期解析，避免 UTC 偏移
        const parts = d.split('-');
        date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
        date = new Date(d);
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/** 判断给定 ISO 日期字符串是否为今天 */
export function isToday(iso: string): boolean {
    return iso === toISODate(new Date());
}

/** HTML 转义：防止用户输入被解析为 HTML（XSS 防护基础，包含 & < > " '） */
export function escapeHtml(s: any): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
