/* ==================== httpUtils.ts ====================
 * HTTP 错误响应信息提取。
 * 修复要点：Fetch Response body 只能消费一次。先 resp.text() 拿原始文本，再 JSON.parse。
 * =============================================== */

// 统一从 HTTP 错误响应中提取可读信息（ai:generate / ai:chat 共用）
export async function extractHttpError(resp: Response): Promise<string> {
    let errMsg = 'HTTP ' + resp.status;
    const text = await resp.text().catch(() => '');
    let detail = '';
    if (text) {
        try {
            const j = JSON.parse(text);
            detail = (j && j.error && j.error.message) || (j && j.message) || (j && j.msg) || text;
        } catch (_) {
            detail = text;
        }
    }
    // L6 修复：截断超长错误详情（如几 MB 的 HTML 错误页），避免 errMsg 过大影响日志和 IPC 传输
    const MAX_DETAIL_LEN = 500;
    if (detail.length > MAX_DETAIL_LEN) {
        detail = detail.slice(0, MAX_DETAIL_LEN) + '…(truncated, original ' + detail.length + ' chars)';
    }
    errMsg += ': ' + (detail || resp.statusText);
    return errMsg;
}
