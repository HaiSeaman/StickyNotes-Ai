const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { streamDownloadToFile } = require('../main/downloadUtils');

/**
 * 启动一个本地 HTTP 服务器返回指定 payload
 */
function startServer(payload) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(payload);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('streamDownloadToFile rejects when disk write fails instead of hanging', async () => {
    // 模拟原 bug：fileStream 触发 'error' 而非 'finish'，原代码 Promise 永不 resolve
    const payload = Buffer.alloc(1024, 0);
    const server = await startServer(payload);
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/video.mp4`;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-test-'));
    // filePath 指向不存在的子目录，createWriteStream 会立即触发 'error' (ENOENT)
    const invalidFilePath = path.join(tmpDir, 'nonexistent-subdir', 'video.mp4');

    try {
        // 超时保护：如果函数挂起（原 bug 行为），5 秒后测试失败
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('streamDownloadToFile hung - did not resolve within 5s')), 5000);
        });

        const downloadPromise = streamDownloadToFile(url, invalidFilePath);

        // 期望：函数应该 reject（而不是 hang）
        await assert.rejects(
            Promise.race([downloadPromise, timeoutPromise]),
            (err) => {
                // 错误应该与文件写入相关（ENOENT 等）
                return err instanceof Error && /ENOENT|EACCES|EISDIR|write|hang/i.test(err.message);
            }
        );
    } finally {
        server.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
});

test('streamDownloadToFile writes file successfully when no errors', async () => {
    // 验证正常路径仍然工作，确保修复未破坏正常功能
    const payload = Buffer.from('hello world video content');
    const server = await startServer(payload);
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/video.mp4`;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-test-'));
    const filePath = path.join(tmpDir, 'video.mp4');

    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('download did not complete within 5s')), 5000);
        });

        await Promise.race([streamDownloadToFile(url, filePath), timeoutPromise]);

        assert.ok(fs.existsSync(filePath), '文件应该已创建');
        const content = fs.readFileSync(filePath);
        assert.equal(content.toString(), payload.toString(), '文件内容应与下载内容一致');
    } finally {
        server.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
});

test('streamDownloadToFile respects timeout option when server is slow', async () => {
    // 服务器延迟 500ms 响应，timeout 设为 100ms，应该在 ~100ms 后失败而非等 500ms
    const server = http.createServer((req, res) => {
        setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(Buffer.alloc(1024, 0));
        }, 500);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/video.mp4`;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-test-'));
    const filePath = path.join(tmpDir, 'video.mp4');

    try {
        const start = Date.now();
        await assert.rejects(
            streamDownloadToFile(url, filePath, { timeout: 100 }),
            (err) => /timeout|abort/i.test(err.message) || err.name === 'TimeoutError' || err.name === 'AbortError'
        );
        const elapsed = Date.now() - start;
        // 应该在 timeout 后较快失败（< 400ms），而不是等服务器 500ms 响应
        assert.ok(elapsed < 400, `应该在 timeout 后较快失败，实际 ${elapsed}ms`);
    } finally {
        server.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
});
