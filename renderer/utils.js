/**
 * renderer/utils.js
 * 渲染层公共工具函数模块
 * 消除 renderer.js 与 renderer/tabs/chatTab.js 之间的重复定义。
 * 通过 window.RendererUtils 暴露，供各 Tab 模块和 renderer.js 复用。
 */
(function () {
    'use strict';

    /**
     * 数字补零：1 -> "01", 12 -> "12"
     * @param {number} n
     * @returns {string}
     */
    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    /**
     * 聊天时间格式化
     * @param {number} ts - 时间戳（毫秒）
     * @param {boolean} withDate - 是否包含日期（YYYY-MM-DD）
     * @returns {string} HH:MM 或 YYYY-MM-DD HH:MM
     */
    function formatChatTime(ts, withDate = false) {
        if (!ts) return '';
        const d = new Date(ts);
        const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        return withDate ? (d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm) : hm;
    }

    /**
     * 防抖：连续触发时只执行最后一次，用于搜索框输入、滑块拖动等高频事件
     * 避免每次按键/每次像素移动都全量重建 DOM 或发起 IPC，降低 CPU 与渲染开销
     * @param {Function} fn - 要防抖的函数
     * @param {number} wait - 等待毫秒数，默认 200
     * @returns {Function} 防抖后的函数（带 flush 方法，用于强制执行最后一次回调）
     */
    function debounce(fn, wait) {
        let timer = null;
        let lastArgs = [];
        let lastThis = null;
        const debounced = function (...args) {
            lastArgs = args;
            lastThis = this;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { timer = null; fn.apply(lastThis, lastArgs); }, wait || 200);
        };
        // 暴露 flush 方法，窗口关闭时强制执行最后一次回调，防数据丢失
        // flush 缓存最后入参并回放，避免 flush() 无参时传 undefined 给主进程
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
     * HTML 转义：防止用户输入被解析为 HTML（XSS 防护基础）
     * @param {string} s - 待转义的字符串
     * @returns {string} 转义后的字符串
     */
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 动态加载脚本（懒加载）：首次用到时才插入 <script> 标签，加速首屏启动
     * 同一 src 只加载一次，重复调用返回缓存的 Promise
     * @param {string} src - 脚本路径（相对路径，如 'howler.min.js'）
     * @returns {Promise<void>} 加载完成后 resolve，失败 reject
     */
    const scriptCache = new Map();
    function loadScript(src) {
        if (scriptCache.has(src)) return scriptCache.get(src);
        const promise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => {
                scriptCache.delete(src);
                reject(new Error('脚本加载失败: ' + src));
            };
            document.head.appendChild(s);
        });
        scriptCache.set(src, promise);
        return promise;
    }

    window.RendererUtils = { pad2, formatChatTime, debounce, escapeHtml, loadScript };
})();
