/* ==================== security.ts ====================
 * 安全工具函数：IPC payload 大小校验、SSRF 防护（含 DNS 解析）、HTML 转义、API baseUrl 协议校验。
 * =============================================== */
import dns from 'dns';
import net from 'net';

// IPC 单条 payload 大小上限：50MB
export const MAX_IPC_PAYLOAD_SIZE = 50 * 1024 * 1024;

/**
 * 校验 IPC payload 大小，防止恶意渲染进程发送超大字符串/数组导致 OOM。
 */
export function assertPayloadSize(value: any, maxLen?: number, label?: string): void {
    const limit = maxLen ?? MAX_IPC_PAYLOAD_SIZE;
    let size = 0;
    try {
        if (typeof value === 'string') {
            size = Buffer.byteLength(value, 'utf-8');
        } else if (Buffer.isBuffer(value)) {
            size = value.length;
        } else if (value && typeof value === 'object') {
            size = Buffer.byteLength(JSON.stringify(value), 'utf-8');
        } else {
            size = 0;
        }
    } catch (err: any) {
        throw new Error((label || '数据') + '结构异常或包含不可序列化对象，已拒绝: ' + (err?.message || err));
    }
    if (size > limit) {
        throw new Error((label || '数据') + '超过大小上限（' + (limit / 1024 / 1024).toFixed(0) + 'MB），已拒绝');
    }
}

/**
 * 将可能的十进制/十六进制 IPv4 字符串归一化为标准点分十进制。
 * 例如 '2130706433' -> '127.0.0.1'，'0x7f000001' -> '127.0.0.1'。
 * 无法识别则原样返回。
 */
function normalizeIPv4(host: string): string {
    // 纯十进制整数形式（如 2130706433）
    if (/^\d+$/.test(host)) {
        const num = Number(host);
        if (num >= 0 && num <= 0xFFFFFFFF && Number.isInteger(num)) {
            return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join('.');
        }
    }
    // 十六进制或八进制点分形式较少见，交给 dns.lookup 处理；此处仅处理纯整数
    return host;
}

/**
 * 校验 IP 地址字符串是否为内网/环回/链路本地/广播/运营商级 NAT 地址。
 * 仅对 IP 字符串有效，hostname 请用 isPrivateOrLoopbackHost。
 */
function isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    let h = ip.toLowerCase().trim();
    // 去除 IPv6 方括号
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
    // IPv4-mapped/compatible IPv6：点分与十六进制压缩形式都归一化为点分 IPv4。
    // 例：::ffff:127.0.0.1 / ::ffff:7f00:1 → 127.0.0.1；::7f00:1 → 127.0.0.1
    if (h.startsWith('::ffff:') || h.startsWith('::')) {
        const rest = h.startsWith('::ffff:') ? h.slice(7) : h.slice(2);
        if (rest.includes('.')) {
            h = rest;
        } else {
            const groups = rest.split(':');
            if (groups.length <= 2 && groups.length >= 1 && groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) {
                const hex = groups.map(g => g.padStart(4, '0')).join('').padStart(8, '0');
                if (hex.length === 8) {
                    const n = parseInt(hex, 16);
                    h = (n >>> 24) + '.' + ((n >> 16) & 255) + '.' + ((n >> 8) & 255) + '.' + (n & 255);
                }
            }
        }
    }

    // IPv4 归一化（处理十进制整数等绕过形式）
    if (/^\d+$/.test(h) && !h.includes(':')) {
        h = normalizeIPv4(h);
    }

    // IPv4 点分十进制校验
    const v4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4Match) {
        const a = +v4Match[1], b = +v4Match[2], c = +v4Match[3], d = +v4Match[4];
        if (a > 255 || b > 255 || c > 255 || d > 255) return false;
        // 环回 127.0.0.0/8
        if (a === 127) return true;
        // 0.0.0.0/8
        if (a === 0) return true;
        // 10.0.0.0/8
        if (a === 10) return true;
        // 169.254.0.0/16 链路本地
        if (a === 169 && b === 254) return true;
        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;
        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;
        // 100.64.0.0/10 运营商级 NAT
        if (a === 100 && b >= 64 && b <= 127) return true;
        // 255.255.255.255 广播
        if (a === 255 && b === 255 && c === 255 && d === 255) return true;
        return false;
    }

    // IPv6 校验
    if (h.includes(':')) {
        if (h === '::' || h === '::1') return true;
        // 链路本地 fe80::/10（fe80:: 到 febf::）
        if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
        // 唯一本地地址 fc00::/7（fc:: 和 fd::）
        if (/^f[cd][0-9a-f]{0,2}:/.test(h)) return true;
        // IPv4-mapped 已在上面处理
    }
    return false;
}

/**
 * 校验 host 是否为内网/环回/链路本地地址（词法层面，不做 DNS 解析）。
 * 注意：无法防 DNS rebinding，对安全敏感场景请使用 isSafeExternalUrlAsync。
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
    if (!host) return true;
    let cleanHost = host.toLowerCase().trim();
    if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
        cleanHost = cleanHost.slice(1, -1);
    }
    if (cleanHost === 'localhost' || cleanHost === '0.0.0.0' || cleanHost === '0' || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) {
        return true;
    }
    // 十进制整数 IP 归一化后再判断
    if (/^\d+$/.test(cleanHost)) {
        cleanHost = normalizeIPv4(cleanHost);
    }
    // 仅对 IP 字面量做私网判定（isPrivateIp 内部处理 IPv4-mapped 点分/十六进制、
    // RFC1918、环回、链路本地、CGNAT、广播等）。域名不做前缀匹配，
    // 避免误伤数字开头的合法公网域名（如 10.example.com、127.fm）。
    if (net.isIP(cleanHost) === 4 || net.isIP(cleanHost) === 6) {
        return isPrivateIp(cleanHost);
    }
    // 纯 IPv6 文本（net.isIP 判不出时兜底常见内网前缀）
    if (cleanHost.includes(':')) {
        if (cleanHost === '::' || cleanHost === '::1') return true;
        // 链路本地 fe80::/10
        if (/^fe[89ab][0-9a-f]:/.test(cleanHost)) return true;
        // 唯一本地地址 fc00::/7
        if (/^f[cd][0-9a-f]{0,2}:/.test(cleanHost)) return true;
    }
    return false;
}

/**
 * SSRF 防护（异步、含 DNS 解析）：校验 URL 是否为允许的外网 HTTPS 地址。
 * 解析 hostname 的所有 A/AAAA 记录，任一为内网/环回地址即拒绝。
 * 可防 DNS rebinding 的基本形式（解析阶段校验）。
 * 说明：同步词法版（isSafeExternalUrl）已在死代码清理中移除——
 * 全项目生产代码仅使用本 Async 版（词法判断已内联在 isPrivateOrLoopbackHost）。
 */
export async function isSafeExternalUrlAsync(urlStr: string): Promise<boolean> {
    if (!urlStr || typeof urlStr !== 'string') return false;
    let u: URL;
    try { u = new URL(urlStr); } catch (_) { return false; }
    if (u.protocol !== 'https:') return false;
    // 词法层面先拦截
    if (isPrivateOrLoopbackHost(u.hostname)) return false;
    // DNS 解析校验：所有解析结果都不能是内网地址
    try {
        const addresses = await dns.promises.lookup(u.hostname, { all: true });
        if (addresses.length === 0) return false;
        for (const addr of addresses) {
            if (isPrivateIp(addr.address)) return false;
        }
    } catch (_) {
        // DNS 解析失败：保守拒绝
        return false;
    }
    return true;
}

/**
 * AI baseUrl 协议校验：拒绝 file:/data:/javascript: 等危险协议。
 */
export function validateAiBaseUrl(baseUrl: string, label?: string): void {
    if (!baseUrl || typeof baseUrl !== 'string') return;
    let u: URL;
    try { u = new URL(baseUrl); } catch (e: any) {
        throw new Error((label || 'API 地址') + '格式无效：' + (e.message || ''));
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error((label || 'API 地址') + '仅支持 http/https 协议，拒绝 ' + u.protocol);
    }
}

/**
 * SSRF 防护（异步、宽松版、含 DNS 解析）：允许 http: 协议（用于网络电台流）。
 * 解析 hostname 的所有 A/AAAA 记录，任一为内网/环回地址即拒绝。
 * 说明：同步宽松版（isSafePublicStreamUrl）已在死代码清理中移除——全项目仅用本 Async 版。
 */
export async function isSafePublicStreamUrlAsync(urlStr: string): Promise<boolean> {
    if (!urlStr || typeof urlStr !== 'string') return false;
    let u: URL;
    try { u = new URL(urlStr); } catch (_) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isPrivateOrLoopbackHost(u.hostname)) return false;
    try {
        const addresses = await dns.promises.lookup(u.hostname, { all: true });
        if (addresses.length === 0) return false;
        for (const addr of addresses) {
            if (isPrivateIp(addr.address)) return false;
        }
    } catch (_) {
        return false;
    }
    return true;
}

/**
 * 完整 HTML 转义（含引号和反引号），用于属性上下文防 XSS。
 * L3 修复：补充反引号转义，防模板字符串上下文注入。
 */
export function escapeHtmlFull(str: any): string {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}
