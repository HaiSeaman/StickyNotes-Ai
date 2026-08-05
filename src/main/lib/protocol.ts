/* ==================== protocol.ts ====================
 * 公共本地文件服务：为 chatimg 协议提供统一的文件读取逻辑。
 * 包含路径穿越防护、stat 校验、大小限制、MIME 映射、流式读取 + Range 请求支持。
 * =============================================== */
import path from 'path';
import fs from 'fs';

// H3 修复：默认大小上限 50MB，防止恶意/意外的大文件导致 OOM
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

interface ServeOptions {
    defaultMime?: string;
    maxSize?: number;
    requireRealpath?: boolean;
}

export async function serveLocalFile(
    requestUrl: string,
    dir: string,
    mimeMap: Record<string, string>,
    options?: ServeOptions,
    request?: any  // OPT-2 修复：传入 request 对象以读取 Range 头
): Promise<Response> {
    options = options || {};
    const defaultMime = options.defaultMime || 'application/octet-stream';
    // H3 修复：使用 ?? 替代 ||，并设默认值 50MB（0 表示无限制需显式传入）
    const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    const requireRealpath = options.requireRealpath !== undefined ? options.requireRealpath : true;

    let url: URL;
    try {
        url = new URL(requestUrl);
    } catch (_) {
        return new Response('Bad Request', { status: 400 });
    }
    let fileName: string;
    try {
        fileName = decodeURIComponent(url.pathname.slice(1));
    } catch (_) {
        // decodeURIComponent 对无效百分号编码（如 %zz）会抛 URIError
        return new Response('Bad Request', { status: 400 });
    }
    const filePath = path.normalize(path.join(dir, fileName));
    // 路径穿越防护
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
    }
    let fileStat: fs.Stats;
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

    // OPT-2 修复：流式 Response + Range 请求支持，替代 readFile 整文件读入内存
    const fileSize = fileStat.size;
    const rangeHeader = request?.headers?.get('range');
    let start = 0, end = fileSize - 1, isPartial = false;
    if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
            start = match[1] ? parseInt(match[1], 10) : 0;
            end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            if (start > end || start >= fileSize) {
                return new Response('Range Not Satisfiable', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${fileSize}` }
                });
            }
            end = Math.min(end, fileSize - 1);
            isPartial = true;
        }
    }
    const contentLength = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'max-age=3600'
    };
    if (isPartial) {
        headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    }
    return new Response(stream as any, {
        status: isPartial ? 206 : 200,
        headers
    });
}
