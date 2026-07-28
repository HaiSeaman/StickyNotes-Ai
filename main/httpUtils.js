/**
 * HTTP 错误响应信息提取（从 main.js 提取以便单元测试）。
 *
 * 修复要点：
 * - Fetch Response body 只能消费一次。原实现先 resp.json() 再 resp.text()，
 *   非 JSON 响应时 catch 中的 resp.text() 拿不到内容，错误信息只剩 statusText。
 * - 修复：先 resp.text() 拿原始文本，再 JSON.parse；JSON 解析失败时用原文。
 * - 兼容多种错误结构：error.message / message / msg。
 */

// 统一从 HTTP 错误响应中提取可读信息（ai:generate / ai:chat 共用）
async function extractHttpError(resp) {
    let errMsg = 'HTTP ' + resp.status;
    // body 只能消费一次：先取 text，再尝试 JSON.parse
    const text = await resp.text().catch(() => '');
    let detail = '';
    if (text) {
        try {
            const j = JSON.parse(text);
            // 兼容 OpenAI {error.message}、通用 {message}、{msg} 三种结构
            detail = (j && j.error && j.error.message) || (j && j.message) || (j && j.msg) || text;
        } catch (_) {
            detail = text;  // 非 JSON，直接用原文
        }
    }
    errMsg += ': ' + (detail || resp.statusText);
    return errMsg;
}

module.exports = { extractHttpError };
