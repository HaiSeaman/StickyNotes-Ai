import http from 'http';
import https from 'https';
import { SyncConfig } from '../../types/index.js';

export interface WebdavRequestContext {
  baseUrl: string;
  auth: string;
  allowSelfSigned: boolean;
  urlObj: URL;
  lib: typeof http | typeof https;
  agent: http.Agent | https.Agent;
}

export interface WebdavRequestOptions {
  headers?: Record<string, string>;
  body?: Buffer | string | null;
  timeoutMs?: number;
  maxSize?: number;
}

export interface WebdavRequestResult {
  statusCode?: number;
  statusMessage?: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface WebdavBackupItem {
  name: string;
  href: string;
  size: number;
  lastModified: string;
}

export function trimTrailingSlash(urlStr: string): string {
  return (urlStr || '').replace(/\/+$/, '');
}

export function buildWebdavRequestContext(config: SyncConfig): WebdavRequestContext {
  const baseUrl = trimTrailingSlash(config.url || '');
  const auth = Buffer.from(`${config.user || ''}:${config.pass || ''}`).toString('base64');
  const allowSelfSigned = !!config.allowSelfSigned;

  let urlObj: URL;
  try {
    urlObj = new URL(baseUrl);
  } catch (e: any) {
    throw new Error(`WebDAV 地址格式错误：${e.message}`);
  }

  const lib = urlObj.protocol === 'https:' ? https : http;
  if (urlObj.protocol === 'http:') {
    console.warn('[安全警告] WebDAV 使用 http:// 明文协议，Basic Auth 凭据将以明文传输，建议改用 https://');
  }
  const agent = new (lib as any).Agent({ rejectUnauthorized: !allowSelfSigned });

  return { baseUrl, auth, allowSelfSigned, urlObj, lib, agent };
}

export function webdavRequest(
  config: SyncConfig,
  method: string,
  reqPath: string,
  options: WebdavRequestOptions = {}
): Promise<WebdavRequestResult> {
  const headers = options.headers || {};
  const body = options.body || null;
  const timeoutMs = options.timeoutMs || 30000;
  const maxSize = options.maxSize || 0;

  return new Promise((resolve, reject) => {
    const ctx = buildWebdavRequestContext(config);
    const opts = {
      method,
      hostname: ctx.urlObj.hostname,
      port: ctx.urlObj.port || (ctx.urlObj.protocol === 'https:' ? 443 : 80),
      path: reqPath,
      headers,
      timeout: timeoutMs,
      agent: ctx.agent,
      rejectUnauthorized: !ctx.allowSelfSigned
    };

    const req = ctx.lib.request(opts, (res) => {
      if (maxSize > 0) {
        const contentLength = parseInt((res.headers['content-length'] as string) || '0', 10);
        if (contentLength > maxSize) {
          try { ctx.agent.destroy(); } catch (_) {}
          try { req.destroy(); } catch (_) {}
          reject(new Error(`备份文件过大（${(contentLength / 1024 / 1024).toFixed(1)}MB），超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限`));
          return;
        }
      }
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let aborted = false;

      res.on('data', (c: Buffer) => {
        if (aborted) return;
        totalSize += c.length;
        if (maxSize > 0 && totalSize > maxSize) {
          aborted = true;
          try { ctx.agent.destroy(); } catch (_) {}
          try { req.destroy(); } catch (_) {}
          reject(new Error(`下载过程中超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限，已中断`));
          return;
        }
        chunks.push(c);
      });

      res.on('end', () => {
        if (aborted) return;
        try { ctx.agent.destroy(); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });

    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.on('error', (err) => {
      try { ctx.agent.destroy(); } catch (_) {}
      reject(err);
    });

    if (body) req.write(body);
    req.end();
  });
}

export function parseWebdavPropfindXml(bodyStr: string): WebdavBackupItem[] {
  const items: WebdavBackupItem[] = [];
  const responseRegex = /<([^:>]+:)?response[\s>][\s\S]*?<\/([^:>]+:)?response>/gi;
  let match: RegExpExecArray | null;

  while ((match = responseRegex.exec(bodyStr)) !== null) {
    const respBlock = match[0];
    const hrefMatch = /<([^:>]+:)?href[^>]*>([^<]+)<\/([^:>]+:)?href>/i.exec(respBlock);
    if (!hrefMatch) continue;

    const href = hrefMatch[2];
    const decodedHref = decodeURIComponent(href);
    if (!decodedHref.endsWith('.zip')) continue;

    const name = decodedHref.split('/').pop();
    if (!name) continue;

    const sizeMatch = /<([^:>]+:)?getcontentlength[^>]*>([^<]+)<\/([^:>]+:)?getcontentlength>/i.exec(respBlock);
    const modMatch = /<([^:>]+:)?getlastmodified[^>]*>([^<]+)<\/([^:>]+:)?getlastmodified>/i.exec(respBlock);

    items.push({
      name,
      href,
      size: sizeMatch ? parseInt(sizeMatch[2], 10) || 0 : 0,
      lastModified: modMatch ? modMatch[2] : ''
    });
  }
  return items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
}
