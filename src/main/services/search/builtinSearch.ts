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
 * 清洗和去噪文本（去除 HTML 标签、多余换行与特殊转义字符）
 */
function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&#183;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 国内直连免 Key 搜索提供商 (基于 Bing CN / 聚合直连抓取)
 */
export class BuiltinSearchProvider implements ISearchProvider {
  readonly id = 'builtin';
  readonly name = '内置免配置 (国内直连)';

  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {
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
      // 访问 Bing 国内中文端点，无需 API Key
      const searchUrl = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setmkt=zh-CN&setlang=zh-Hans`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`内置搜索请求失败: HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseBingHtml(html, maxResults);

      if (results.length === 0) {
        // 如果 HTML 结构匹配为空，尝试备用纯文本摘要提取
        return this.fallbackParse(html, maxResults);
      }

      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`内置搜索超时 (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 解析 Bing 搜索结果页 HTML
   */
  private parseBingHtml(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    
    // 正则匹配 Bing 的核心搜索结果卡片 <li class="b_algo">...</li>
    const itemRegex = /<li\s+class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match: RegExpExecArray | null;
    let index = 1;

    while ((match = itemRegex.exec(html)) !== null && results.length < maxResults) {
      const block = match[1];

      // 提取标题与 URL: <h2 ...><a href="...">...</a></h2>
      const titleLinkMatch = block.match(/<h2[^>]*>\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
      if (!titleLinkMatch) continue;

      const rawUrl = titleLinkMatch[1];
      const rawTitle = titleLinkMatch[2];

      // 过滤非有效外链
      if (!rawUrl.startsWith('http')) continue;

      // 提取摘要: <div class="b_caption">...<p ...>...</p>
      let snippet = '';
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (snippetMatch) {
        snippet = cleanText(snippetMatch[1]);
      } else {
        const captionMatch = block.match(/<div\s+class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
        if (captionMatch) {
          snippet = cleanText(captionMatch[1]);
        }
      }

      const title = cleanText(rawTitle);
      if (!title) continue;

      const hostname = extractHostname(rawUrl);

      results.push({
        index: index++,
        title,
        url: rawUrl,
        snippet: snippet || title,
        siteName: hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
      });
    }

    return results;
  }

  /**
   * 兜底解析（当 Bing 页面局部微调时提取有效 <a> 与周围段落）
   */
  private fallbackParse(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const linkRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    let index = 1;
    const seenUrls = new Set<string>();

    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      const title = cleanText(match[2]);

      // 过滤 bing 自身域和过短无效链接
      if (url.includes('bing.com') || url.includes('microsoft.com') || title.length < 5) {
        continue;
      }

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const hostname = extractHostname(url);

      results.push({
        index: index++,
        title,
        url,
        snippet: title,
        siteName: hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
      });
    }

    return results;
  }

  async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
      const results = await this.search('测试网络连接', { ...config, maxResults: 1 });
      const latencyMs = Date.now() - startTime;
      if (results.length > 0) {
        return { success: true, message: `连接成功 (耗时: ${latencyMs}ms，检索到 ${results.length} 条结果)`, latencyMs };
      }
      return { success: true, message: `连接成功 (耗时: ${latencyMs}ms)`, latencyMs };
    } catch (err: any) {
      return { success: false, message: `连接失败: ${err.message || '未知错误'}` };
    }
  }
}
