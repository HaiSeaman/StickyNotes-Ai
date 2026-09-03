/**
 * security.ts 单元测试
 * 覆盖 SSRF 防护核心逻辑：IP 归一化、私网判定、URL 安全校验（Async/DNS 版）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * mock 整个 dns 模块：Async 版 SSRF 校验依赖 dns.promises.lookup。
 * vi.hoisted 保证 mock 工厂执行时 lookupMock 已初始化（工厂先于 import 求值）。
 */
const lookupMock = vi.hoisted(() => vi.fn(() => Promise.resolve([{ address: '1.2.3.4', family: 4 }])));
vi.mock('dns', () => ({
  __esModule: true,
  default: { promises: { lookup: lookupMock } },
  promises: { lookup: lookupMock },
}));

import {
  isPrivateOrLoopbackHost,
  isSafeExternalUrlAsync,
  validateAiBaseUrl,
  escapeHtmlFull,
  isSafePublicStreamUrlAsync,
} from '../src/main/lib/security';

/** 让 DNS 解析返回指定 IP 列表 */
function mockLookup(addresses: string[]) {
  lookupMock.mockResolvedValue(
    addresses.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }))
  );
}

describe('isPrivateOrLoopbackHost', () => {
  it('应识别 localhost 为内网', () => {
    expect(isPrivateOrLoopbackHost('localhost')).toBe(true);
  });

  it('应识别 0.0.0.0 为内网', () => {
    expect(isPrivateOrLoopbackHost('0.0.0.0')).toBe(true);
  });

  it('应识别 IPv4 环回地址 127.0.0.1', () => {
    expect(isPrivateOrLoopbackHost('127.0.0.1')).toBe(true);
  });

  it('应识别 127.x.x.x 整个 /8 环回段', () => {
    expect(isPrivateOrLoopbackHost('127.255.255.255')).toBe(true);
    expect(isPrivateOrLoopbackHost('127.0.0.2')).toBe(true);
  });

  it('应识别 RFC1918 私网地址', () => {
    expect(isPrivateOrLoopbackHost('10.0.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('172.16.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('172.31.255.255')).toBe(true);
  });

  it('应识别 172.32.x.x 为公网（不在 172.16/12 范围内）', () => {
    expect(isPrivateOrLoopbackHost('172.32.0.1')).toBe(false);
  });

  it('应识别 CGNAT 地址 100.64.0.0/10', () => {
    expect(isPrivateOrLoopbackHost('100.64.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHost('100.127.255.255')).toBe(true);
  });

  it('应识别链路本地地址 169.254.x.x', () => {
    expect(isPrivateOrLoopbackHost('169.254.1.1')).toBe(true);
  });

  it('应识别 IPv6 环回地址 ::1', () => {
    expect(isPrivateOrLoopbackHost('::1')).toBe(true);
    expect(isPrivateOrLoopbackHost('[::1]')).toBe(true);
  });

  it('应识别 IPv6 链路本地 fe80::', () => {
    expect(isPrivateOrLoopbackHost('fe80::1')).toBe(true);
  });

  it('应识别 IPv6 唯一本地地址 fc00::/7', () => {
    expect(isPrivateOrLoopbackHost('fc00::1')).toBe(true);
    expect(isPrivateOrLoopbackHost('fd00::1')).toBe(true);
  });

  it('应识别十进制整数 IP 绕过形式', () => {
    // 2130706433 = 127.0.0.1
    expect(isPrivateOrLoopbackHost('2130706433')).toBe(true);
  });

  it('应识别 .local 和 .internal 域名', () => {
    expect(isPrivateOrLoopbackHost('myhost.local')).toBe(true);
    expect(isPrivateOrLoopbackHost('myhost.internal')).toBe(true);
  });

  it('应将公网域名判定为非内网', () => {
    expect(isPrivateOrLoopbackHost('example.com')).toBe(false);
    expect(isPrivateOrLoopbackHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrLoopbackHost('1.1.1.1')).toBe(false);
  });

  it('不应将数字开头的合法公网域名误判为内网', () => {
    expect(isPrivateOrLoopbackHost('10.example.com')).toBe(false);
    expect(isPrivateOrLoopbackHost('127.fm')).toBe(false);
  });

  it('空 host 应判定为内网（保守拒绝）', () => {
    expect(isPrivateOrLoopbackHost('')).toBe(true);
    expect(isPrivateOrLoopbackHost(undefined as any)).toBe(true);
  });
});

describe('isSafeExternalUrlAsync', () => {
  beforeEach(() => {
    mockLookup(['1.2.3.4']); // 默认公网 IP
  });

  it('应接受公网 HTTPS URL（DNS 解析为公网 IP）', async () => {
    mockLookup(['8.8.8.8']);
    await expect(isSafeExternalUrlAsync('https://example.com/api')).resolves.toBe(true);
  });

  it('应拒绝 HTTP 协议（要求 HTTPS）', async () => {
    await expect(isSafeExternalUrlAsync('http://example.com')).resolves.toBe(false);
  });

  it('应拒绝 file 协议', async () => {
    await expect(isSafeExternalUrlAsync('file:///etc/passwd')).resolves.toBe(false);
  });

  it('应拒绝内网 HTTPS URL', async () => {
    await expect(isSafeExternalUrlAsync('https://127.0.0.1/api')).resolves.toBe(false);
    await expect(isSafeExternalUrlAsync('https://192.168.1.1/api')).resolves.toBe(false);
    await expect(isSafeExternalUrlAsync('https://localhost/api')).resolves.toBe(false);
  });

  it('应拒绝 DNS 解析结果为内网地址（防 DNS rebinding）', async () => {
    mockLookup(['10.0.0.1']);
    await expect(isSafeExternalUrlAsync('https://example.com/api')).resolves.toBe(false);
  });

  it('应拒绝 DNS 解析失败（保守拒绝）', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(isSafeExternalUrlAsync('https://example.com/api')).resolves.toBe(false);
  });

  it('应拒绝无效 URL', async () => {
    await expect(isSafeExternalUrlAsync('')).resolves.toBe(false);
    await expect(isSafeExternalUrlAsync('not-a-url')).resolves.toBe(false);
    await expect(isSafeExternalUrlAsync(null as any)).resolves.toBe(false);
  });

  it('应拒绝 javascript 协议', async () => {
    await expect(isSafeExternalUrlAsync('javascript:alert(1)')).resolves.toBe(false);
  });
});

describe('isSafePublicStreamUrlAsync', () => {
  beforeEach(() => {
    mockLookup(['1.2.3.4']);
  });

  it('应接受公网 HTTP URL（电台流需要 HTTP）', async () => {
    mockLookup(['8.8.8.8']);
    await expect(isSafePublicStreamUrlAsync('http://stream.example.com/live')).resolves.toBe(true);
  });

  it('应接受公网 HTTPS URL', async () => {
    mockLookup(['8.8.8.8']);
    await expect(isSafePublicStreamUrlAsync('https://stream.example.com/live')).resolves.toBe(true);
  });

  it('应拒绝内网 HTTP URL', async () => {
    await expect(isSafePublicStreamUrlAsync('http://127.0.0.1/stream')).resolves.toBe(false);
    await expect(isSafePublicStreamUrlAsync('http://10.0.0.1/stream')).resolves.toBe(false);
  });

  it('应拒绝非 HTTP/HTTPS 协议', async () => {
    await expect(isSafePublicStreamUrlAsync('ftp://example.com')).resolves.toBe(false);
    await expect(isSafePublicStreamUrlAsync('file:///etc/passwd')).resolves.toBe(false);
  });
});

describe('validateAiBaseUrl', () => {
  it('应接受 HTTPS URL', () => {
    expect(() => validateAiBaseUrl('https://api.openai.com')).not.toThrow();
  });

  it('应接受 HTTP URL（本地部署如 Ollama）', () => {
    expect(() => validateAiBaseUrl('http://localhost:11434')).not.toThrow();
  });

  it('应拒绝 file 协议', () => {
    expect(() => validateAiBaseUrl('file:///etc/passwd')).toThrow();
  });

  it('应拒绝 javascript 协议', () => {
    expect(() => validateAiBaseUrl('javascript:alert(1)')).toThrow();
  });

  it('应拒绝 data 协议', () => {
    expect(() => validateAiBaseUrl('data:text/html,<script>alert(1)</script>')).toThrow();
  });

  it('空字符串不抛异常（静默返回）', () => {
    expect(() => validateAiBaseUrl('')).not.toThrow();
  });
});

describe('escapeHtmlFull', () => {
  it('应转义所有危险字符', () => {
    expect(escapeHtmlFull('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('应转义引号和反引号', () => {
    expect(escapeHtmlFull('"\'`')).toBe('&quot;&#39;&#96;');
  });

  it('应转义 & 符号', () => {
    expect(escapeHtmlFull('a & b')).toBe('a &amp; b');
  });

  it('null/undefined 应返回空字符串', () => {
    expect(escapeHtmlFull(null)).toBe('');
    expect(escapeHtmlFull(undefined)).toBe('');
  });

  it('非字符串应转为字符串后转义', () => {
    expect(escapeHtmlFull(123)).toBe('123');
  });
});