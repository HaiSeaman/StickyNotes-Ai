# -*- coding: utf-8 -*-
"""批量给搜索 provider 的 search 方法加外部 AbortSignal 支持（精确字符串替换）"""
import io, sys

FILES = [
    'src/main/services/search/builtinSearch.ts',
    'src/main/services/search/bochaSearch.ts',
    'src/main/services/search/tavilySearch.ts',
    'src/main/services/search/bingSearch.ts',
    'src/main/services/search/customSearch.ts',
]

SIG_OLD = '  async search(query: string, config: WebSearchConfig): Promise<SearchResult[]> {'
SIG_NEW = '  async search(query: string, config: WebSearchConfig, signal?: AbortSignal): Promise<SearchResult[]> {'

CTRL_OLD = """    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);"""
CTRL_NEW = """    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // 支持外部中止信号（用户中断搜索时一并取消请求）
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }"""

for f in FILES:
    with io.open(f, encoding='utf-8') as fh:
        src = fh.read()
    n_sig = src.count(SIG_OLD)
    n_ctrl = src.count(CTRL_OLD)
    src = src.replace(SIG_OLD, SIG_NEW).replace(CTRL_OLD, CTRL_NEW)
    with io.open(f, 'w', encoding='utf-8', newline='') as fh:
        fh.write(src)
    print(f'{f}: signature x{n_sig}, controller x{n_ctrl}')
