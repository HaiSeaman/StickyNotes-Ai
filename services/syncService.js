/**
 * WebDAV / S3 同步服务逻辑解耦封装
 */
const http = require('http');
const https = require('https');
const { trimTrailingSlash } = require('../shared-utils');

/**
 * 构造 WebDAV 请求的公共上下文
 */
function buildWebdavRequestContext(config) {
    const baseUrl = trimTrailingSlash(config.url);
    const auth = Buffer.from(config.user + ':' + config.pass).toString('base64');
    const allowSelfSigned = !!(config.allowSelfSigned);

    let urlObj;
    try {
        urlObj = new URL(baseUrl);
    } catch (e) {
        throw new Error('WebDAV 地址格式错误：' + e.message);
    }

    const lib = urlObj.protocol === 'https:' ? https : http;
    if (urlObj.protocol === 'http:') {
        console.warn('[安全警告] WebDAV 使用 http:// 明文协议，Basic Auth 凭据将以明文传输，建议改用 https://');
    }
    const agent = new lib.Agent({ rejectUnauthorized: !allowSelfSigned });

    return { baseUrl, auth, allowSelfSigned, urlObj, lib, agent };
}

/**
 * WebDAV 公共请求函数
 */
function webdavRequest(config, method, reqPath, options) {
    options = options || {};
    const headers = options.headers || {};
    const body = options.body || null;
    const timeoutMs = options.timeoutMs || 30000;
    const maxSize = options.maxSize || 0;
    return new Promise((resolve, reject) => {
        const ctx = buildWebdavRequestContext(config);
        const opts = {
            method: method,
            hostname: ctx.urlObj.hostname,
            port: ctx.urlObj.port || (ctx.urlObj.protocol === 'https:' ? 443 : 80),
            path: reqPath,
            headers: headers,
            timeout: timeoutMs,
            agent: ctx.agent,
            rejectUnauthorized: !ctx.allowSelfSigned
        };
        const req = ctx.lib.request(opts, (res) => {
            if (maxSize > 0) {
                const contentLength = parseInt(res.headers['content-length'] || '0', 10);
                if (contentLength > maxSize) {
                    try { ctx.agent.destroy(); } catch (_) {}
                    try { req.destroy(); } catch (_) {}
                    reject(new Error(`备份文件过大（${(contentLength / 1024 / 1024).toFixed(1)}MB），超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限`));
                    return;
                }
            }
            const chunks = [];
            let totalSize = 0;
            let aborted = false;
            res.on('data', (c) => {
                if (aborted) return;
                totalSize += c.length;
                if (maxSize > 0 && totalSize > maxSize) {
                    aborted = true;
                    try { ctx.agent.destroy(); } catch (_) {}
                    try { req.destroy(); } catch (_) {}
                    reject(new Error(`下载过程中超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限，已中断`));
                    return;
                }
                chunks.push(c);
            });
            res.on('end', () => {
                if (aborted) return;
                try { ctx.agent.destroy(); } catch (_) {}
                resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, body: Buffer.concat(chunks) });
            });
        });
        req.on('timeout', () => { req.destroy(new Error('请求超时')); });
        req.on('error', (err) => {
            try { ctx.agent.destroy(); } catch (_) {}
            reject(err);
        });
        if (body) req.write(body);
        req.end();
    });
}

function parseWebdavPropfindXml(bodyStr) {
    const items = [];
    const responseRegex = /<([^:>]+:)?response[\s>][\s\S]*?<\/([^:>]+:)?response>/gi;
    let match;
    while ((match = responseRegex.exec(bodyStr)) !== null) {
        const respBlock = match[0];
        const hrefMatch = /<([^:>]+:)?href[^>]*>([^<]+)<\/([^:>]+:)?href>/i.exec(respBlock);
        if (!hrefMatch) continue;

        const href = hrefMatch[2];
        const decodedHref = decodeURIComponent(href);
        if (!decodedHref.endsWith('.zip')) continue;

        const name = decodedHref.split('/').pop();
        if (!name) continue;

        const sizeMatch = /<([^:>]+:)?getcontentlength[^>]*>([^<]+)<\/([^:>]+:)?getcontentlength>/i.exec(respBlock);
        const modMatch = /<([^:>]+:)?getlastmodified[^>]*>([^<]+)<\/([^:>]+:)?getlastmodified>/i.exec(respBlock);

        items.push({
            name,
            href,
            size: sizeMatch ? parseInt(sizeMatch[2], 10) || 0 : 0,
            lastModified: modMatch ? modMatch[2] : ''
        });
    }
    return items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
}

module.exports = {
    buildWebdavRequestContext,
    webdavRequest,
    parseWebdavPropfindXml
};
