import { ISearchProvider, SearchResult, WebSearchConfig } from './types';
import { extractHostname, faviconFor, withFetchSignal, truncateErrorDetail, toFriendlyError, testConnectionGeneric } from './common';

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
    const { signal: reqSignal, cleanup } = withFetchSignal(signal, timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: reqSignal,
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
        const errDetail = truncateErrorDetail(errorText, response.statusText);
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
          favicon: faviconFor(hostname),
          publishedDate: item.published_date
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      throw toFriendlyError(err, 'Tavily', timeoutMs);
    } finally {
      cleanup();
    }
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    return testConnectionGeneric('Tavily', (q, cfg, sig) => this.search(q, cfg, sig), config);
  }
}
