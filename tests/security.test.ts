/**
 * security.ts 单元测试
 * 覆盖 SSRF 防护核心逻辑：IP 归一化、私网判定、URL 安全校验
 */
import { describe, it, expect } from 'vitest';
import {
  isPrivateOrLoopbackHost,
  isSafeExternalUrl,
  validateAiBaseUrl,
  escapeHtmlFull,
  isSafePublicStreamUrl,
} from '../src/main/lib/security';

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

describe('isSafeExternalUrl', () => {
  it('应接受公网 HTTPS URL', () => {
    expect(isSafeExternalUrl('https://example.com/api')).toBe(true);
  });

  it('应拒绝 HTTP 协议（要求 HTTPS）', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(false);
  });

  it('应拒绝 file 协议', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('应拒绝内网 HTTPS URL', () => {
    expect(isSafeExternalUrl('https://127.0.0.1/api')).toBe(false);
    expect(isSafeExternalUrl('https://192.168.1.1/api')).toBe(false);
    expect(isSafeExternalUrl('https://localhost/api')).toBe(false);
  });

  it('应拒绝无效 URL', () => {
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('not-a-url')).toBe(false);
    expect(isSafeExternalUrl(null as any)).toBe(false);
  });

  it('应拒绝 javascript 协议', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('isSafePublicStreamUrl', () => {
  it('应接受公网 HTTP URL（电台流需要 HTTP）', () => {
    expect(isSafePublicStreamUrl('http://stream.example.com/live')).toBe(true);
  });

  it('应接受公网 HTTPS URL', () => {
    expect(isSafePublicStreamUrl('https://stream.example.com/live')).toBe(true);
  });

  it('应拒绝内网 HTTP URL', () => {
    expect(isSafePublicStreamUrl('http://127.0.0.1/stream')).toBe(false);
    expect(isSafePublicStreamUrl('http://10.0.0.1/stream')).toBe(false);
  });

  it('应拒绝非 HTTP/HTTPS 协议', () => {
    expect(isSafePublicStreamUrl('ftp://example.com')).toBe(false);
    expect(isSafePublicStreamUrl('file:///etc/passwd')).toBe(false);
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
