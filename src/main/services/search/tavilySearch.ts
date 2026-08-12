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
 * Tavily AI Search 适配器 (专为 LLM 设计的高质量搜索引擎)
 */
export class TavilySearchProvider implements ISearchProvider {
  readonly id = 'tavily';
  readonly name = 'Tavily AI Search (全球专线)';

  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!config.apiKey) {
      throw new Error('未配置 Tavily API Key');
    }

    const endpoint = config.apiUrl?.trim() || 'https://api.tavily.com/search';
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
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: config.apiKey.trim(),
          query,
          search_depth: 'basic',
          include_answer: false,
          max_results: maxResults
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // 安全加固：截断错误体，防止反向代理回显的 API key/凭据随错误信息进日志与 IPC
        const errDetail = (errorText || response.statusText).slice(0, 500);
        throw new Error(`Tavily API 响应错误 (HTTP ${response.status}): ${errDetail}`);
      }

      const data = await response.json();
      const rawResults = data?.results || [];

      const results: SearchResult[] = [];
      let index = 1;

      for (const item of rawResults) {
        if (!item.url || !item.title) continue;
        const hostname = extractHostname(item.url);
        results.push({
          index: index++,
          title: item.title,
          url: item.url,
          snippet: item.content || item.raw_content || '',
          siteName: hostname,
          favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
          publishedDate: item.published_date
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Tavily 搜索超时 (${timeoutMs}ms)`);
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
        message: `Tavily 连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条数据)`,
        latencyMs
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Tavily 连接失败: ${err.message || '未知错误'}`
      };
    }
  }
}
