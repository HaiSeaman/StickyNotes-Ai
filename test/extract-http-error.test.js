const test = require('node:test');
const assert = require('node:assert/strict');
const { extractHttpError } = require('../main/httpUtils');

/**
 * 构造一个最小化的 Response 对象用于测试。
 * Node 18+ 内置的 Response body 只能消费一次，与浏览器一致。
 */
function makeResponse(status, statusText, body, headers = {}) {
    const init = { status, statusText, headers };
    if (body === null || body === undefined) {
        return new Response(null, init);
    }
    return new Response(body, init);
}

test('extractHttpError parses standard OpenAI-style {error.message}', async () => {
    const body = JSON.stringify({ error: { message: 'rate limit exceeded' } });
    const resp = makeResponse(429, 'Too Many Requests', body, {
        'content-type': 'application/json'
    });
    const msg = await extractHttpError(resp);
    assert.equal(msg, 'HTTP 429: rate limit exceeded');
});

test('extractHttpError extracts message field when error wrapper missing', async () => {
    // 部分服务返回 { "message": "..." } 而非 { "error": { "message": "..." } }
    const body = JSON.stringify({ message: 'service unavailable' });
    const resp = makeResponse(503, 'Service Unavailable', body, {
        'content-type': 'application/json'
    });
    const msg = await extractHttpError(resp);
    assert.equal(msg, 'HTTP 503: service unavailable');
});

test('extractHttpError falls back to raw text when body is non-JSON', async () => {
    // 修复前：先 resp.json() 抛错 → catch 中 resp.text() 又读不到 body（已被消费）→ 只剩 statusText
    // 修复后：先 resp.text() 拿到原文，再尝试 JSON.parse，失败则用原文
    const body = '<html><body>Bad Gateway</body></html>';
    const resp = makeResponse(502, 'Bad Gateway', body, {
        'content-type': 'text/html'
    });
    const msg = await extractHttpError(resp);
    assert.equal(msg, 'HTTP 502: <html><body>Bad Gateway</body></html>');
});

test('extractHttpError uses statusText when body is empty', async () => {
    const resp = makeResponse(500, 'Internal Server Error', '');
    const msg = await extractHttpError(resp);
    assert.equal(msg, 'HTTP 500: Internal Server Error');
});
