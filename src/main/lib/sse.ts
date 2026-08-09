/**
 * SSE 流解析通用工具
 */
export async function parseSSEStream(
    resp: Response | any,
    onChunk: (chunk: any) => void,
    signal?: AbortSignal
): Promise<void> {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
        while (true) {
            if (signal?.aborted) {
                break;
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sepIdx: number;
            while ((sepIdx = buffer.indexOf('\n')) >= 0) {
                const rawLine = buffer.slice(0, sepIdx);
                buffer = buffer.slice(sepIdx + 1);
                const line = rawLine.trim();
                if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]' || !data) continue;
                try {
                    onChunk(JSON.parse(data));
                } catch {
                    /* 静默跳过格式错误的 chunk */
                }
            }
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* 忽略 releaseLock 异常 */
        }
    }
}
