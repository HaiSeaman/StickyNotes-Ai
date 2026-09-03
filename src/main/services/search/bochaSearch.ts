import { ISearchProvider, SearchResult, WebSearchConfig } from './types';
import { extractHostname, faviconFor, withFetchSignal, truncateErrorDetail, toFriendlyError, testConnectionGeneric } from './common';

/**
 * 博查 AI 搜索适配器 (Bocha Web Search API)
 * 国内大模型专线 AI 搜索引擎，结构化返回纯净高质量摘要
 */
export class BochaSearchProvider implements ISearchProvider {
  readonly id = 'bocha';
  readonly name = '博查 AI 搜索 (国内极速)';

  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!config.apiKey) {
      throw new Error('未配置博查 API Key');
    }

    const endpoint = config.apiUrl?.trim() || 'https://api.bochaai.com/v1/web-search';
    const maxResults = config.maxResults || 5;
    const timeoutMs = config.timeoutMs || 8000;
    const { signal: reqSignal, cleanup } = withFetchSignal(signal, timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: reqSignal,
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
        // 安全加固：截断错误体，防止反向代理回显的 API key/凭据随错误信息进日志与 IPC
        const errDetail = truncateErrorDetail(errorText, response.statusText);
        throw new Error(`博查 API 响应错误 (HTTP ${response.status}): ${errDetail}`);
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
          favicon: item.siteIcon || faviconFor(hostname),
          publishedDate: item.dateLastCrawled || item.datePublished
        });
        if (results.length >= maxResults) break;
      }

      return results;
    } catch (err: any) {
      throw toFriendlyError(err, '博查', timeoutMs);
    } finally {
      cleanup();
    }
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    return testConnectionGeneric('博查', (q, cfg, sig) => this.search(q, cfg, sig), config);
  }
}