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
 * 博查 AI 搜索适配器 (Bocha Web Search API)
 * 国内大模型专线 AI 搜索引擎，结构化返回纯净高质量摘要
 */
export class BochaSearchProvider implements ISearchProvider {
  readonly id = 'bocha';
  readonly name = '博查 AI 搜索 (国内极速)';

  async search(query: string, config: WebSearchConfig): Promise<SearchResult[]> {
    if (!config.apiKey) {
      throw new Error('未配置博查 API Key');
    }

    const endpoint = config.apiUrl?.trim() || 'https://api.bochaai.com/v1/web-search';
    const maxResults = config.maxResults || 5;
    const timeoutMs = config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${config.apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          freshness: 'noLimit',
          summary: true,
          count: maxResults
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`博查 API 响应错误 (HTTP ${response.status}): ${errorText || response.statusText}`);
      }

      const data = await response.json();
      const rawWebPages = data?.data?.webPages?.value || data?.webPages?.value || [];
      
      const results: SearchResult[] = [];
      let index = 1;

      for (const item of rawWebPages) {
        if (!item.url || !item.name) continue;
        const hostname = extractHostname(item.url);
        results.push({
          index: index++,
          title: item.name,
          url: item.url,
          snippet: item.summary || item.snippet || '',
          siteName: item.siteName || hostname,
          favicon: item.siteIcon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
          publishedDate: item.dateLastCrawled || item.datePublished
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`博查搜索超时 (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
      const results = await this.search('测试', { ...config, maxResults: 1 });
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: `博查连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条数据)`,
        latencyMs
      };
    } catch (err: any) {
      return {
        success: false,
        message: `博查连接失败: ${err.message || '未知错误'}`
      };
    }
  }
}
