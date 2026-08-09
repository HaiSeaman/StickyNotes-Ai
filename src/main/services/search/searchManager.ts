import { BingSearchProvider } from './bingSearch';
import { BochaSearchProvider } from './bochaSearch';
import { BuiltinSearchProvider } from './builtinSearch';
import { CustomSearchProvider } from './customSearch';
import { TavilySearchProvider } from './tavilySearch';
import { ISearchProvider, SearchProviderType, SearchResult, WebSearchConfig } from './types';

export * from './types';

/**
 * 统一搜索管理器 (Search Manager)
 * 负责 Provider 注册管理、搜索任务分发、自动容灾降级 (Failover Fallback)
 */
export class SearchManager {
  private providers: Map<SearchProviderType, ISearchProvider> = new Map();
  private builtinProvider: BuiltinSearchProvider;

  constructor() {
    this.builtinProvider = new BuiltinSearchProvider();

    // 注册所有支持的 Provider
    this.registerProvider(this.builtinProvider);
    this.registerProvider(new BochaSearchProvider());
    this.registerProvider(new TavilySearchProvider());
    this.registerProvider(new BingSearchProvider());
    this.registerProvider(new CustomSearchProvider());
  }

  /**
   * 注册搜索引擎适配器
   */
  public registerProvider(provider: ISearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * 获取指定适配器
   */
  public getProvider(id: SearchProviderType): ISearchProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * 执行搜索并自动容灾降级
   * @param query 搜索关键词
   * @param config 搜索配置
   */
  public async search(query: string, config: WebSearchConfig): Promise<{ results: SearchResult[]; usedProvider: string; fallback: boolean }> {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      return { results: [], usedProvider: 'none', fallback: false };
    }

    const providerId = config.provider || 'builtin';
    const primaryProvider = this.providers.get(providerId);

    // 如果指定了除 builtin 外的第三方 Provider，尝试主 Provider
    if (primaryProvider && providerId !== 'builtin') {
      try {
        console.log(`[SearchManager] 尝试使用主搜索源 [${primaryProvider.name}] 检索: "${trimmedQuery}"`);
        const results = await primaryProvider.search(trimmedQuery, config);
        if (results && results.length > 0) {
          return { results, usedProvider: primaryProvider.name, fallback: false };
        }
        console.warn(`[SearchManager] 主搜索源 [${primaryProvider.name}] 返回空结果，准备降级至内置免配置源`);
      } catch (err: any) {
        console.warn(`[SearchManager] 主搜索源 [${primaryProvider.name}] 请求异常: ${err.message}，自动触发容灾降级`);
      }
    }

    // 容灾降级：使用内置直连免配置搜索源
    console.log(`[SearchManager] 使用内置免配置搜索源检索: "${trimmedQuery}"`);
    try {
      const fallbackResults = await this.builtinProvider.search(trimmedQuery, config);
      return {
        results: fallbackResults,
        usedProvider: this.builtinProvider.name,
        fallback: providerId !== 'builtin'
      };
    } catch (builtinErr: any) {
      console.error(`[SearchManager] 内置搜索源执行失败:`, builtinErr);
      throw new Error(`网络搜索失败: ${builtinErr.message}`);
    }
  }

  /**
   * 连通性测试
   */
  public async testConnection(config: WebSearchConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const providerId = config.provider || 'builtin';
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { success: false, message: `未知的搜索引擎提供商: ${providerId}` };
    }
    return provider.testConnection(config);
  }
}

/** 全局单例 */
export const searchManager = new SearchManager();
