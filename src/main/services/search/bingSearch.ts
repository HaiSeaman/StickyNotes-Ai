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
 * 微软 Bing Web Search API 适配器 (Azure Cognitive Services)
 */
export class BingSearchProvider implements ISearchProvider {
  readonly id = 'bing';
  readonly name = 'Bing Web Search API (Azure)';

  async search(query: string, config: WebSearchConfig): Promise<SearchResult[]> {
    if (!config.apiKey) {
      throw new Error('未配置 Bing API Key (Azure Subscription Key)');
    }

    const endpoint = config.apiUrl?.trim() || 'https://api.bing.microsoft.com/v7.0/search';
    const maxResults = config.maxResults || 5;
    const timeoutMs = config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(maxResults));
      url.searchParams.set('textDecorations', 'false');
      url.searchParams.set('textFormat', 'Raw');

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Ocp-Apim-Subscription-Key': config.apiKey.trim(),
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Bing API 响应错误 (HTTP ${response.status}): ${errorText || response.statusText}`);
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
          favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
          publishedDate: item.dateLastCrawled || item.datePublished
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Bing 搜索超时 (${timeoutMs}ms)`);
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
        message: `Bing API 连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条数据)`,
        latencyMs
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Bing API 连接失败: ${err.message || '未知错误'}`
      };
    }
  }
}
