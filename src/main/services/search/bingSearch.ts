import { ISearchProvider, SearchResult, WebSearchConfig } from './types';
import { extractHostname, faviconFor, withFetchSignal, truncateErrorDetail, toFriendlyError, testConnectionGeneric } from './common';

/**
 * 微软 Bing Web Search API 适配器 (Azure Cognitive Services)
 */
export class BingSearchProvider implements ISearchProvider {
  readonly id = 'bing';
  readonly name = 'Bing Web Search API (Azure)';

  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!config.apiKey) {
      throw new Error('未配置 Bing API Key (Azure Subscription Key)');
    }

    const endpoint = config.apiUrl?.trim() || 'https://api.bing.microsoft.com/v7.0/search';
    const maxResults = config.maxResults || 5;
    const timeoutMs = config.timeoutMs || 8000;
    const { signal: reqSignal, cleanup } = withFetchSignal(signal, timeoutMs);

    try {
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(maxResults));
      url.searchParams.set('textDecorations', 'false');
      url.searchParams.set('textFormat', 'Raw');

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: reqSignal,
        headers: {
          'Ocp-Apim-Subscription-Key': config.apiKey.trim(),
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // 安全加固：截断错误体，防止反向代理回显的 API key/凭据随错误信息进日志与 IPC
        const errDetail = truncateErrorDetail(errorText, response.statusText);
        throw new Error(`Bing API 响应错误 (HTTP ${response.status}): ${errDetail}`);
      }

      const data = await response.json();
      const rawWebPages = data?.webPages?.value || [];

      const results: SearchResult[] = [];
      let index = 1;

      for (const item of rawWebPages) {
        if (!item.url || !item.name) continue;
        const hostname = extractHostname(item.url);
        results.push({
          index: index++,
          title: item.name,
          url: item.url,
          snippet: item.snippet || '',
          siteName: item.siteName || hostname,
          favicon: faviconFor(hostname),
          publishedDate: item.dateLastCrawled || item.datePublished
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      throw toFriendlyError(err, 'Bing', timeoutMs);
    } finally {
      cleanup();
    }
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    return testConnectionGeneric('Bing API', (q, cfg, sig) => this.search(q, cfg, sig), config);
  }
}
