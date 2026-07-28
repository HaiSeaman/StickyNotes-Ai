const path = require('path');
const fs = require('fs');

/**
 * 公共本地文件服务：为 chatimg 协议提供统一的文件读取逻辑。
 * 包含路径穿越防护、stat 校验、大小限制、MIME 映射、异步读取。
 *
 * @param {string} requestUrl - 协议请求的 URL（如 chatimg://chat-images/xxx.png）
 * @param {string} dir - 文件所在目录的绝对路径
 * @param {Object} mimeMap - 扩展名到 MIME 类型的映射
 * @param {Object} [options]
 * @param {string} [options.defaultMime='application/octet-stream'] - 未知扩展名的默认 MIME
 * @param {number} [options.maxSize=0] - 文件大小上限（字节，0 表示不限制）
 * @param {boolean} [options.requireRealpath=false] - 是否做 realpath 符号链接二次校验
 * @returns {Promise<Response>} Electron 协议 Response 对象
 */
async function serveLocalFile(requestUrl, dir, mimeMap, options) {
    options = options || {};
    const defaultMime = options.defaultMime || 'application/octet-stream';
    const maxSize = options.maxSize || 0;
    const requireRealpath = options.requireRealpath !== undefined ? options.requireRealpath : true;

    const url = new URL(requestUrl);
    const fileName = decodeURIComponent(url.pathname.slice(1));
    const filePath = path.normalize(path.join(dir, fileName));
    // 路径穿越防护
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
    }
    let fileStat;
    try {
        fileStat = await fs.promises.stat(filePath);
    } catch (_) {
        return new Response('Not Found', { status: 404 });
    }
    if (!fileStat.isFile()) {
        return new Response('Not Found', { status: 404 });
    }
    if (maxSize > 0 && fileStat.size > maxSize) {
        return new Response('Payload Too Large', { status: 413 });
    }
    if (requireRealpath) {
        try {
            const realPath = await fs.promises.realpath(filePath);
            const realDir = await fs.promises.realpath(dir);
            if (realPath !== realDir && !realPath.startsWith(realDir + path.sep)) {
                return new Response('Forbidden', { status: 403 });
            }
        } catch (_) {
            return new Response('Not Found', { status: 404 });
        }
    }
    const ext = path.extname(fileName).toLowerCase();
    const contentType = mimeMap[ext] || defaultMime;
    const buffer = await fs.promises.readFile(filePath);
    return new Response(buffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'max-age=3600' } });
}

module.exports = {
    serveLocalFile
};
