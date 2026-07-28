const fs = require('fs');

/**
 * 流式下载 URL 内容到本地文件（不依赖 Electron，便于单元测试）。
 * 关键修复：fileStream 必须在创建后立即监听 'error' 事件，否则磁盘写入失败时
 * Promise 只等 'finish' 永不 resolve，导致调用方永久挂起、锁无法释放。
 *
 * @param {string} videoUrl - 下载地址
 * @param {string} filePath - 本地保存路径
 * @param {Object} [options]
 * @param {number} [options.timeout] - 下载超时毫秒数（0 或不传表示不限制）
 */
async function streamDownloadToFile(videoUrl, filePath, options) {
    options = options || {};
    const fetchOptions = {};
    if (options.timeout && options.timeout > 0) {
        fetchOptions.signal = AbortSignal.timeout(options.timeout);
    }
    const resp = await fetch(videoUrl, fetchOptions);
    if (!resp.ok) {
        throw new Error('下载失败 HTTP ' + resp.status + ': ' + resp.statusText);
    }
    if (!resp.body) {
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(filePath, buf);
        return;
    }
    const fileStream = fs.createWriteStream(filePath);
    // 立即注册 'error' listener，避免 createWriteStream 后到 finally 之间触发 error 时无监听器
    const done = new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
    });
    const reader = resp.body.getReader();
    try {
        while (true) {
            const { done: readDone, value } = await reader.read();
            if (readDone) break;
            fileStream.write(Buffer.from(value));
        }
    } finally {
        fileStream.end();
        // 出错路径下显式取消 reader，避免底层 fetch 连接残留
        try { reader.cancel(); } catch (_) {}
        await done;
    }
}

module.exports = { streamDownloadToFile };
