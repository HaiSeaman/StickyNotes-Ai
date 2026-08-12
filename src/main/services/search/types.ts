/**
 * Web Search & Grounding 类型定义与接口规范
 */

export type SearchProviderType = 'builtin' | 'bocha' | 'tavily' | 'bing' | 'custom';

/**
 * 网页搜索单条结果
 */
export interface SearchResult {
  /** 结果序号（从 1 开始） */
  index: number;
  /** 网页标题 */
  title: string;
  /** 网页原始 URL */
  url: string;
  /** 网页提炼摘要 / 关键片段 */
  snippet: string;
  /** 来源站点主域名 (例如: zhihu.com, github.com) */
  siteName?: string;
  /** 来源站点 Favicon 图标链接 (可选) */
  favicon?: string;
  /** 额外元数据 (发布时间/评分等) */
  publishedDate?: string;
}

/**
 * 联网搜索配置
 */
export interface WebSearchConfig {
  /** 搜索引擎提供商，默认 'builtin' */
  provider: SearchProviderType;
  /** API Endpoint 基础地址（自定义或非官方端点时使用） */
  apiUrl?: string;
  /** API Key（内置免配置时可为空） */
  apiKey?: string;
  /** 检索返回的最大结果数 (推荐 3~8 条，默认 5) */
  maxResults?: number;
  /** 请求超时时间 (毫秒，默认 8000ms) */
  timeoutMs?: number;
  /** 自定义请求头 (JSON 字符串或键值对象) */
  customHeaders?: Record<string, string>;
}

/**
 * 搜索提供商通用接口
 */
export interface ISearchProvider {
  /** 提供商唯一标识 */
  readonly id: SearchProviderType;
  /** 提供商显示名称 */
  readonly name: string;
  /** 执行搜索（signal 可选：支持用户中断时中止请求） */
  search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]>;
  /** 连通性与 Key 有效性测试 */
  testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }>;
}

/**
 * 搜索流式事件类型 (用于 IPC 推送)
 */
export interface SearchStatusChunk {
  type: 'searching' | 'sources' | 'search_error';
  query?: string;
  sources?: SearchResult[];
  error?: string;
}
