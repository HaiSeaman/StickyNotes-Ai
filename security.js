/* ==================== security.js ====================
 * 安全工具函数：IPC payload 大小校验、SSRF 防护、HTML 转义、API baseUrl 协议校验。
 * 从 main.js 提取，集中实现通用安全逻辑供各 IPC handler 复用。
 * console 调用会被 logger.js 劫持旁路记录，无需额外处理。
 * =============================================== */

// IPC 单条 payload 大小上限：50MB（防止恶意渲染进程发送超大 payload 导致主进程 OOM/DoS）
const MAX_IPC_PAYLOAD_SIZE = 50 * 1024 * 1024;

/**
 * 校验 IPC payload 大小，防止恶意渲染进程发送超大字符串/数组导致 OOM。
 * @param {*} value - 待校验的值（string / Buffer / object / 其他）
 * @param {number} [maxLen] - 大小上限（字节），不传则使用 MAX_IPC_PAYLOAD_SIZE
 * @param {string} [label] - 错误消息中的标签（如 'ai:chat 入参'）
 * @throws {Error} 超过上限时抛错，由调用方（通常是 tryWrap）捕获并返回 {success:false}
 */
function assertPayloadSize(value, maxLen, label) {
    const limit = maxLen || MAX_IPC_PAYLOAD_SIZE;
    let size = 0;
    try {
        if (typeof value === 'string') {
            size = value.length;
        } else if (Buffer.isBuffer(value)) {
            size = value.length;
        } else if (value && typeof value === 'object') {
            // 粗略估算：JSON 序列化后长度。对超大对象会消耗 CPU，但有上限保护
            size = JSON.stringify(value).length;
        } else {
            size = 0;
        }
    } catch (_) { size = 0; }
    if (size > limit) {
        throw new Error((label || '数据') + '超过大小上限（' + (limit / 1024 / 1024).toFixed(0) + 'MB），已拒绝');
    }
}

/**
 * 校验 host 是否为内网/环回/链路本地地址
 */
function isPrivateOrLoopbackHost(host) {
    if (!host) return true;
    let cleanHost = host.toLowerCase().trim();
    if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
        cleanHost = cleanHost.slice(1, -1);
    }
    // IPv6 映射的 IPv4 地址，例如 ::ffff:127.0.0.1
    if (cleanHost.startsWith('::ffff:')) {
        cleanHost = cleanHost.replace('::ffff:', '');
    }
    // 拒绝环回与常见未指定地址
    if (cleanHost === 'localhost' || cleanHost === '0.0.0.0' || cleanHost === '0' || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) {
        return true;
    }
    // IPv6 环回、链路本地、私网段
    if (cleanHost === '::' || cleanHost === '::1' || cleanHost.startsWith('fe80:') || cleanHost.startsWith('fc') || cleanHost.startsWith('fd')) {
        return true;
    }
    // IPv4 环回与私网段
    if (/^0\./.test(cleanHost) || /^127\./.test(cleanHost) || /^10\./.test(cleanHost) || /^169\.254\./.test(cleanHost) || /^192\.168\./.test(cleanHost)) {
        return true;
    }
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(cleanHost)) {
        return true;
    }
    return false;
}

/**
 * SSRF 防护：校验 URL 是否为允许的外网 HTTPS 地址。
 * - 拒绝 file:/data:/http:（仅允许 https:）
 * - 拒绝私网/环回/链路本地/元数据地址
 * @param {string} urlStr - 待校验的 URL
 * @returns {boolean} true 表示安全，false 表示危险
 */
function isSafeExternalUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    let u;
    try { u = new URL(urlStr); } catch (_) { return false; }
    // 仅允许 https 协议，杜绝 file://、http:// 内网访问
    if (u.protocol !== 'https:') return false;
    return !isPrivateOrLoopbackHost(u.hostname);
}

/**
 * AI baseUrl 协议校验：拒绝 file:/data:/javascript: 等危险协议，防 SSRF 与密钥泄露。
 * 注：允许 http: 是为兼容用户本地部署（如 Ollama），isSafeExternalUrl 仅用于更严格的场景。
 * @param {string} baseUrl - 待校验的 baseUrl
 * @param {string} [label] - 错误消息中的标签（如 'AI API 地址'）
 * @throws {Error} 协议非法或 URL 格式无效时抛错
 */
function validateAiBaseUrl(baseUrl, label) {
    if (!baseUrl || typeof baseUrl !== 'string') return;  // 空值由调用方后续校验
    let u;
    try { u = new URL(baseUrl); } catch (e) {
        throw new Error((label || 'API 地址') + '格式无效：' + (e.message || ''));
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error((label || 'API 地址') + '仅支持 http/https 协议，拒绝 ' + u.protocol);
    }
}

/**
 * SSRF 防护（宽松版）：校验 URL 是否为允许的外网 http/https 地址。
 * 与 isSafeExternalUrl 的区别：允许 http: 协议（用于网络电台流，绝大多数 Icecast/Shoutcast 流为 HTTP）。
 * 仍然拒绝 file:/data:/javascript: 等危险协议，以及私网/环回/链路本地/元数据地址。
 * @param {string} urlStr - 待校验的 URL
 * @returns {boolean} true 表示安全，false 表示危险
 */
function isSafePublicStreamUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    let u;
    try { u = new URL(urlStr); } catch (_) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !isPrivateOrLoopbackHost(u.hostname);
}

/**
 * 完整 HTML 转义（含引号），用于属性上下文防 XSS。
 * @param {string} str - 待转义的字符串
 * @returns {string} 转义后的字符串（& < > " ' 全部转为实体）
 */
function escapeHtmlFull(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    MAX_IPC_PAYLOAD_SIZE,
    assertPayloadSize,
    isSafeExternalUrl,
    isSafePublicStreamUrl,
    validateAiBaseUrl,
    escapeHtmlFull,
};
