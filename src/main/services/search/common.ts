/**
 * 搜索 provider 公共工具
 * 收敛此前在 bing/bocha/tavily/custom/builtin 五个 provider 中逐文件复制的：
 * extractHostname、超时+外部 signal 封装、API 错误截断、testConnection 骨架。
 */
import { SearchResult, WebSearchConfig } from './types';

/** 提取 URL 的主域名（移除 www. 前缀），无法解析返回 'web' */
export function extractHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'web';
  }
}

/** 生成站点 favicon 图标地址（Google favicon 服务） */
export function faviconFor(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}

/**
 * 统一请求超时 + 外部中止信号封装。
 * 内部用 AbortController 定时中止；外部 signal（用户中断）一并转发。
 * 返回的 cleanup() 负责清定时器（需在请求 finally 中调用，防泄漏）。
 */
export function withFetchSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

/** 截断错误体，防止反向代理回显的 API key/凭据随错误信息进日志与 IPC */
export function truncateErrorDetail(errorText: string, statusText: string): string {
  return (errorText || statusText).slice(0, 500);
}

/** 将 AbortError 转换为友好超时提示，其余异常原样透传 */
export function toFriendlyError(err: any, providerLabel: string, timeoutMs: number): Error {
  if (err && err.name === 'AbortError') {
    return new Error(`${providerLabel}搜索超时 (${timeoutMs}ms)`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * 统一"测试连接"实现：调用一次搜索（1 条），返回耗时与结果。
 * @param providerLabel 短显示名（用于提示文案，如 'Bing API'）
 * @param search provider 的 search 方法
 */
export async function testConnectionGeneric(
  providerLabel: string,
  search: (query: string, config: WebSearchConfig, signal?: AbortSignal) => Promise<SearchResult[]>,
  config: WebSearchConfig
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now();
  try {
    const results = await search('test', { ...config, maxResults: 1 });
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      message: `${providerLabel} 连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条数据)`,
      latencyMs,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `${providerLabel} 连接失败: ${err.message || '未知错误'}`,
    };
  }
}