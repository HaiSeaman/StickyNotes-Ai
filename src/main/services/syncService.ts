import http from 'http';
import https from 'https';
import tls from 'tls';
import { SyncConfig } from '../../types/index.js';
import { trimTrailingSlash } from '../lib/shared-utils.js';

export interface WebdavRequestContext {
  baseUrl: string;
  auth: string;
  allowSelfSigned: boolean;
  trustedFingerprint?: string;
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

/**
 * 归一化证书指纹：移除冒号并转 lowercase。
 */
function normalizeFingerprint(fp: string): string {
  return fp.replace(/:/g, '').toLowerCase();
}

/**
 * P0 修复：验证证书指纹。
 * 在 secureConnect 事件中手动校验，避免 rejectUnauthorized:false 导致 checkServerIdentity 被跳过。
 */
function verifyCertificateFingerprint(socket: tls.TLSSocket, trustedFingerprint: string): void {
  const cert = socket.getPeerCertificate();
  const fp = cert.fingerprint256 || cert.fingerprint;
  if (!fp) {
    throw new Error('无法获取服务器证书指纹');
  }
  const actual = normalizeFingerprint(fp);
  const expected = normalizeFingerprint(trustedFingerprint);
  if (actual !== expected) {
    throw new Error(`证书指纹不匹配（期望: ${trustedFingerprint}，实际: ${fp}）`);
  }
}

export function buildWebdavRequestContext(config: SyncConfig): WebdavRequestContext {
  const baseUrl = trimTrailingSlash(config.url || '');
  // 修复：user 与 pass 均为空时不生成 Basic Auth（避免注入 Authorization: Basic Og==
  // 导致匿名 WebDAV 请求被服务器误判为带空凭据的认证失败）
  const hasCreds = !!(config.user || config.pass);
  const auth = hasCreds ? Buffer.from(`${config.user || ''}:${config.pass || ''}`).toString('base64') : '';
  const allowSelfSigned = !!config.allowSelfSigned;
  const trustedFingerprint = config.trustedCertFingerprint;

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

  let agent: http.Agent | https.Agent;
  if (urlObj.protocol === 'https:') {
    if (trustedFingerprint) {
      // P0 修复：使用证书指纹 pinning
      // rejectUnauthorized:false 让 Node.js 接受自签名证书（不调用 checkServerIdentity）
      // 我们在 secureConnect 事件中手动验证指纹
      agent = new (lib as any).Agent({
        rejectUnauthorized: false,
      });
      console.log('[WebDAV] 已启用证书指纹验证');
    } else if (allowSelfSigned) {
      // 兼容：allowSelfSigned=true 但未配置指纹时，保持旧的宽松验证行为，
      // 避免存量用户升级后自签名 WebDAV 同步直接中断；
      // 输出持久警告提醒配置 trustedCertFingerprint 更安全。
      agent = new (lib as any).Agent({ rejectUnauthorized: false });
      console.warn('[安全警告] WebDAV 已禁用 TLS 证书验证（allowSelfSigned=true 且未配置 trustedCertFingerprint），连接容易遭受中间人攻击。建议在配置中填写 trustedCertFingerprint 启用证书指纹验证。');
    } else {
      // 默认严格验证：无指纹且未显式允许自签名时，拒绝不可信证书
      agent = new (lib as any).Agent({ rejectUnauthorized: true });
    }
  } else {
    agent = new (lib as any).Agent();
  }

  return { baseUrl, auth, allowSelfSigned, trustedFingerprint, urlObj, lib, agent };
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
    // 将 auth 注入 headers（P1 修复 C2：调用者不再需要手动计算 auth）。
    // 说明：JS 字符串不可变，凭据最终会以 'Basic ' + base64 字符串形式驻留于
    // headers/请求对象中，只能等 GC 回收，无法原地清零（此前 authBuffer.fill(0)
    // 清的是从未参与发送的副本，属无效操作，已移除）。
    const finalHeaders = { ...headers };
    if (ctx.auth && !finalHeaders['Authorization']) {
      finalHeaders['Authorization'] = 'Basic ' + ctx.auth;
    }

    // M8 修复：请求完成后解除凭据引用与 agent（尽力而为）
    let cleaned = false;
    const cleanupCtx = () => {
      if (cleaned) return;
      cleaned = true;
      ctx.auth = '';
      try { ctx.agent.destroy(); } catch (_) {}
    };

    const opts: any = {
      method,
      hostname: ctx.urlObj.hostname,
      port: ctx.urlObj.port || (ctx.urlObj.protocol === 'https:' ? 443 : 80),
      path: reqPath,
      headers: finalHeaders,
      timeout: timeoutMs,
      agent: ctx.agent,
    };

    // P0 修复：有指纹时使用 secureConnect 手动验证，否则由 agent 的 rejectUnauthorized 控制
    if (ctx.trustedFingerprint && ctx.urlObj.protocol === 'https:') {
      opts.checkServerIdentity = () => undefined; // 跳过内置检查
    }

    const req = ctx.lib.request(opts, (res) => {
      if (maxSize > 0) {
        const contentLength = parseInt((res.headers['content-length'] as string) || '0', 10);
        if (contentLength > maxSize) {
          cleanupCtx();
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
          cleanupCtx();
          try { req.destroy(); } catch (_) {}
          reject(new Error(`下载过程中超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 上限，已中断`));
          return;
        }
        chunks.push(c);
      });

      res.on('end', () => {
        if (aborted) return;
        cleanupCtx();
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });

      // H5 修复：监听响应流错误，防 Promise 悬挂
      res.on('error', (err: Error) => {
        if (aborted) return;
        aborted = true;
        cleanupCtx();
        try { req.destroy(); } catch (_) {}
        reject(err);
      });
    });

    // P0 修复：在 TLS 握手完成后验证证书指纹
    req.on('socket', (socket: any) => {
      socket.on('secureConnect', () => {
        if (ctx.trustedFingerprint && socket.getPeerCertificate) {
          try {
            verifyCertificateFingerprint(socket, ctx.trustedFingerprint);
          } catch (err: any) {
            cleanupCtx();
            req.destroy(err);
            reject(err);
          }
        }
      });
    });

    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.on('error', (err) => {
      cleanupCtx();
      reject(err);
    });

    if (body) req.write(body);
    req.end();
  });
}

/**
 * P1 修复：更健壮的 XML propfind 解析。
 * 注意：完整 XML 解析需要 fast-xml-parser 依赖，当前使用改进的正则+校验。
 */
export function parseWebdavPropfindXml(bodyStr: string): WebdavBackupItem[] {
  const items: WebdavBackupItem[] = [];
  // H6 修复：限制输入大小，防止正则 DoS
  const MAX_XML_SIZE = 5 * 1024 * 1024; // 5MB
  if (!bodyStr || bodyStr.length > MAX_XML_SIZE) return items;

  const responseRegex = /<([^:>]+:)?response[\s>][\s\S]*?<\/([^:>]+:)?response>/gi;
  let match: RegExpExecArray | null;
  let matchCount = 0;
  const MAX_MATCHES = 10000; // 防止正则灾难性回溯

  while ((match = responseRegex.exec(bodyStr)) !== null) {
    if (++matchCount > MAX_MATCHES) break;
    const respBlock = match[0];
    const hrefMatch = /<([^:>]+:)?href[^>]*>([^<]+)<\/([^:>]+:)?href>/i.exec(respBlock);
    if (!hrefMatch) continue;

    const href = hrefMatch[2];
    let decodedHref: string;
    try { decodedHref = decodeURIComponent(href); } catch (_) { decodedHref = href; }
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
