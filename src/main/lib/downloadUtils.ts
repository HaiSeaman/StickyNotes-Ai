/* ==================== downloadUtils.ts ====================
 * 流式下载 URL 内容到本地文件。
 * H4 修复：URL 安全校验 + backpressure 处理 + 最大体积限制 + 失败清理半成品文件。
 * =============================================== */
import fs from 'fs';
import { isSafeExternalUrlAsync } from './security.js';

interface DownloadOptions {
    timeout?: number;
    maxBytes?: number;
}

// H4 修复：默认最大下载体积 500MB，防止恶意服务器无限流式发送数据撑满磁盘
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

// 安全重定向 fetch：入口与每次 3xx 跳转的 Location 都重新执行 URL 安全校验
// （防 SSRF：undici fetch 默认 redirect:'follow' 只校验初始 URL，重定向目标可指向内网）
export async function safeFetch(
    url: string,
    options: any = {},
    validate?: (u: string) => Promise<boolean>,
    maxRedirects: number = 5
): Promise<Response> {
    const isSafe = validate || isSafeExternalUrlAsync;
    if (!(await isSafe(url))) {
        throw new Error('下载地址不安全（需 https 外网地址），已拒绝');
    }
    let current = url;
    for (let i = 0; i <= maxRedirects; i++) {
        const resp = await fetch(current, { ...options, redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location');
            if (!loc) throw new Error('重定向缺少 Location 头');
            const next = new URL(loc, current).toString();
            if (!(await isSafe(next))) {
                throw new Error('重定向目标地址不安全（需 https 外网地址），已拒绝');
            }
            current = next;
            continue;
        }
        return resp;
    }
    throw new Error('重定向次数过多（超过 ' + maxRedirects + ' 次），已中止');
}

export async function streamDownloadToFile(videoUrl: string, filePath: string, options?: DownloadOptions): Promise<void> {
    options = options || {};
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    // H4 修复：入口校验 URL，防 SSRF（file:///、内网地址等）；safeFetch 内部对重定向逐跳再校验
    if (!(await isSafeExternalUrlAsync(videoUrl))) {
        throw new Error('下载地址不安全（需 https 外网地址），已拒绝');
    }

    const fetchOptions: any = {};
    if (options.timeout && options.timeout > 0) {
        fetchOptions.signal = AbortSignal.timeout(options.timeout);
    }
    const resp = await safeFetch(videoUrl, fetchOptions);
    if (!resp.ok) {
        throw new Error('下载失败 HTTP ' + resp.status + ': ' + resp.statusText);
    }

    let fileStream: fs.WriteStream | null = null;
    let hasError = false;
    try {
        if (!resp.body) {
            const buf = Buffer.from(await resp.arrayBuffer());
            // H4 修复：校验响应体大小
            if (maxBytes > 0 && buf.length > maxBytes) {
                throw new Error(`下载内容过大（${(buf.length / 1024 / 1024).toFixed(1)}MB），超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 上限`);
            }
            fs.writeFileSync(filePath, buf);
            return;
        }
        fileStream = fs.createWriteStream(filePath);
        const done = new Promise<void>((resolve, reject) => {
            fileStream!.on('finish', resolve);
            fileStream!.on('error', reject);
        });
        const reader = resp.body.getReader();
        let totalBytes = 0;
        try {
            while (true) {
                const { done: readDone, value } = await reader.read();
                if (readDone) break;
                const chunk = Buffer.from(value);
                totalBytes += chunk.length;
                // H4 修复：累计写入超限即中止
                if (maxBytes > 0 && totalBytes > maxBytes) {
                    throw new Error(`下载过程中超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB 上限，已中断`);
                }
                // H4 修复：处理 backpressure，write 返回 false 时等待 drain 事件
                if (!fileStream.write(chunk)) {
                    await new Promise<void>(r => fileStream!.once('drain', r));
                }
            }
        } finally {
            fileStream.end();
            try { reader.cancel(); } catch (_) {}
            await done;
        }
    } catch (err) {
        hasError = true;
        throw err;
    } finally {
        // H4 修复：失败时清理半成品文件，防磁盘积累
        if (hasError) {
            try { await fs.promises.unlink(filePath); } catch (_) { /* 文件可能不存在 */ }
        }
    }
}
