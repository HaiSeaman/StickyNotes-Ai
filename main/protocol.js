const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getTtsCacheDir } = require('../paths');

const TTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 天
const TTS_CACHE_MAX_SIZE = 100 * 1024 * 1024;            // 100MB

/**
 * 公共本地文件服务：为 chatimg/ttsfile 协议提供统一的文件读取逻辑。
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

/**
 * 静默清理 TTS 缓存
 */
async function cleanTtsCache() {
    const dir = getTtsCacheDir();
    let deleted = 0;
    try {
        const entries = await fs.promises.readdir(dir);
        const now = Date.now();
        const stats = await Promise.all(entries.map(async (name) => {
            try {
                const filePath = path.join(dir, name);
                const st = await fs.promises.stat(filePath);
                return { name, filePath, mtime: st.mtimeMs, size: st.size, isFile: st.isFile() };
            } catch (_) {
                return null;
            }
        }));
        const files = stats.filter(s => s && s.isFile);
        for (const f of files) {
            if (now - f.mtime > TTS_CACHE_MAX_AGE_MS) {
                try { await fs.promises.unlink(f.filePath); deleted++; } catch (_) {}
            }
        }
        const remaining = files.filter(f => now - f.mtime <= TTS_CACHE_MAX_AGE_MS);
        let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);
        remaining.sort((a, b) => a.mtime - b.mtime);
        for (const f of remaining) {
            if (totalSize <= TTS_CACHE_MAX_SIZE) break;
            try { await fs.promises.unlink(f.filePath); totalSize -= f.size; deleted++; } catch (_) {}
        }
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('清理 TTS 缓存失败:', e.message);
    }
    return { deleted };
}

/**
 * 将音频 Buffer 异步落盘到 tts_cache/，返回 ttsfile:// URL。
 */
async function saveAudioToTtsCache(audioBuffer, ext) {
    const dir = getTtsCacheDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const fileName = 'tts_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + (ext || 'mp3');
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, audioBuffer);
    return 'ttsfile://tts_cache/' + encodeURIComponent(fileName);
}

module.exports = {
    serveLocalFile,
    cleanTtsCache,
    saveAudioToTtsCache
};
