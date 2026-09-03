/**
 * search/common.ts 公共工具测试
 * 覆盖：extractHostname / faviconFor / withFetchSignal / toFriendlyError / testConnectionGeneric
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractHostname, faviconFor, withFetchSignal, toFriendlyError, testConnectionGeneric } from '../src/main/services/search/common';

describe('extractHostname', () => {
  it('提取域名并去除 www. 前缀', () => {
    expect(extractHostname('https://www.example.com/path')).toBe('example.com');
    expect(extractHostname('https://sub.example.org/x')).toBe('sub.example.org');
  });

  it('无法解析时返回 web', () => {
    expect(extractHostname('not-a-url')).toBe('web');
    expect(extractHostname('')).toBe('web');
  });
});

describe('faviconFor', () => {
  it('生成 Google favicon 地址', () => {
    expect(faviconFor('example.com')).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32');
  });
});

describe('withFetchSignal', () => {
  it('超时后触发内部 signal abort', async () => {
    const { signal, cleanup } = withFetchSignal(undefined, 50);
    expect(signal.aborted).toBe(false);
    await new Promise(r => setTimeout(r, 80));
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('外部 signal 已中止时内部 signal 同步中止', () => {
    const outer = new AbortController();
    outer.abort();
    const { signal, cleanup } = withFetchSignal(outer.signal, 1000);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('外部 signal 后中止会转发到内部', () => {
    const outer = new AbortController();
    const { signal, cleanup } = withFetchSignal(outer.signal, 1000);
    expect(signal.aborted).toBe(false);
    outer.abort();
    expect(signal.aborted).toBe(true);
    cleanup();
  });
});

describe('toFriendlyError', () => {
  it('AbortError 转换为超时提示', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(toFriendlyError(err, 'Bing', 8000).message).toBe('Bing搜索超时 (8000ms)');
  });

  it('普通错误原样透传', () => {
    const err = new Error('boom');
    expect(toFriendlyError(err, 'Bing', 8000)).toBe(err);
  });
});

describe('testConnectionGeneric', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('搜索成功时返回 success + 耗时与条数', async () => {
    const search = vi.fn(async () => [{ index: 1, title: 't', url: 'https://a.com', snippet: 's' }]);
    const result = await testConnectionGeneric('Test API', search, { provider: 'builtin' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Test API 连接成功');
    expect(result.message).toContain('1 条');
    expect(typeof result.latencyMs).toBe('number');
    expect(search).toHaveBeenCalledTimes(1);
    const [query, cfg] = search.mock.calls[0];
    expect(query).toBe('test');
    expect(cfg).toMatchObject({ maxResults: 1 });
  });

  it('搜索失败时返回 failure 与错误信息', async () => {
    const search = vi.fn(async () => { throw new Error('network down'); });
    const result = await testConnectionGeneric('Test API', search, { provider: 'builtin' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('network down');
  });
});
