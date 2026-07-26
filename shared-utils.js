/**
 * shared-utils.js — 跨模块共享的通用工具函数
 * 在 index.html 中通过 <script> 标签加载，先于 calendar.js 和 renderer.js
 * 函数声明会自动成为全局变量，供其他脚本直接调用
 */

/**
 * 生成唯一ID
 * @returns {number} 基于时间戳的唯一ID
 */
function genId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/**
 * 提取文本的首行作为预览，超长则截断
 * @param {string} text - 原始文本
 * @param {number} maxLen - 最大长度，默认24
 * @returns {string} 预览文本
 */
function previewText(text, maxLen) {
    if (maxLen === undefined) maxLen = 24;
    if (!text) return '空白便签';
    var firstLine = text.split('\n')[0];
    return firstLine.length > maxLen ? firstLine.slice(0, maxLen) + '...' : firstLine;
}

/**
 * Date 转 ISO 日期字符串 (YYYY-MM-DD)，防时区偏移
 * @param {Date|string} d - 日期对象或可解析的日期值
 * @returns {string} YYYY-MM-DD 格式字符串
 */
function toISODate(d) {
    var date = (d instanceof Date) ? d : new Date(d);
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

/**
 * 判断给定 ISO 日期字符串是否为今天
 * @param {string} iso - YYYY-MM-DD 格式字符串
 * @returns {boolean}
 */
function isToday(iso) {
    return iso === toISODate(new Date());
}

/**
 * 安全执行函数，吞掉异常（仅 console.warn），用于不重要的清理/兜底操作
 * @param {function} fn - 要执行的函数
 * @param {string} [label] - 错误标签，用于日志识别
 */
function swallow(fn, label) {
    try { return fn(); } catch (e) { if (label) console.warn('[' + label + ']', e.message || e); }
}
