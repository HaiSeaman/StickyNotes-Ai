import { ISearchProvider, SearchResult, WebSearchConfig } from './types';

/**
 * 提取 URL 的主域名
 */
function extractHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'web';
  }
}

/**
 * 自定义 / SearXNG 搜索适配器 (标准 JSON 格式搜索引擎)
 */
export class CustomSearchProvider implements ISearchProvider {
  readonly id = 'custom';
  readonly name = '自定义 SearXNG / API';

  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!config.apiUrl) {
      throw new Error('未配置自定义搜索 API 地址');
    }

    const maxResults = config.maxResults || 5;
    const timeoutMs = config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // 支持外部中止信号（用户中断搜索时一并取消请求）
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const urlStr = config.apiUrl.trim();
      const parsedUrl = new URL(urlStr);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('自定义搜索 API 必须是 http:// 或 https:// 协议');
      }
      parsedUrl.searchParams.set('q', query);
      parsedUrl.searchParams.set('format', 'json');

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        ...(config.customHeaders || {})
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      }

      const response = await fetch(parsedUrl.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // 安全加固：截断错误体，防止反向代理回显的 API key/凭据随错误信息进日志与 IPC
        const errDetail = (errorText || response.statusText).slice(0, 500);
        throw new Error(`自定义搜索 API 响应错误 (HTTP ${response.status}): ${errDetail}`);
      }

      const data = await response.json();
      const rawResults = data?.results || data?.data || [];

      const results: SearchResult[] = [];
      let index = 1;

      for (const item of rawResults) {
        const itemUrl = item.url || item.link;
        const itemTitle = item.title || item.name;
        if (!itemUrl || !itemTitle) continue;

        const hostname = extractHostname(itemUrl);
        results.push({
          index: index++,
          title: itemTitle,
          url: itemUrl,
          snippet: item.content || item.snippet || item.summary || '',
          siteName: item.siteName || hostname,
          favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
          publishedDate: item.publishedDate || item.date
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`自定义搜索超时 (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
      const results = await this.search('test', { ...config, maxResults: 1 });
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: `自定义 API 连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条数据)`,
        latencyMs
      };
    } catch (err: any) {
      return {
        success: false,
        message: `自定义 API 连接失败: ${err.message || '未知错误'}`
      };
    }
  }
}
