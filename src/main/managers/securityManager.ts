import crypto from 'crypto';

export class SecurityManager {
  private static readonly MAX_IPC_PAYLOAD_SIZE = 50 * 1024 * 1024; // 50MB

  public assertPayloadSize(value: any, maxLen?: number, label?: string): void {
    const limit = maxLen || SecurityManager.MAX_IPC_PAYLOAD_SIZE;
    let size = 0;
    try {
      if (typeof value === 'string') {
        size = value.length;
      } else if (Buffer.isBuffer(value)) {
        size = value.length;
      } else if (value && typeof value === 'object') {
        size = JSON.stringify(value).length;
      }
    } catch (_) {
      size = 0;
    }

    if (size > limit) {
      throw new Error(`${label || '数据'}超过大小上限（${(limit / 1024 / 1024).toFixed(0)}MB），已拒绝`);
    }
  }

  public isPrivateOrLoopbackHost(host: string): boolean {
    if (!host) return true;
    let cleanHost = host.toLowerCase().trim();
    if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
      cleanHost = cleanHost.slice(1, -1);
    }
    if (cleanHost.startsWith('::ffff:')) {
      cleanHost = cleanHost.replace('::ffff:', '');
    }
    if (cleanHost === 'localhost' || cleanHost === '0.0.0.0' || cleanHost === '0' || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) {
      return true;
    }
    if (cleanHost === '::' || cleanHost === '::1' || cleanHost.startsWith('fe80:') || cleanHost.startsWith('fc') || cleanHost.startsWith('fd')) {
      return true;
    }
    if (/^0\./.test(cleanHost) || /^127\./.test(cleanHost) || /^10\./.test(cleanHost) || /^169\.254\./.test(cleanHost) || /^192\.168\./.test(cleanHost)) {
      return true;
    }
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(cleanHost)) {
      return true;
    }
    return false;
  }

  public isSafeExternalUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const u = new URL(urlStr);
      if (u.protocol !== 'https:') return false;
      return !this.isPrivateOrLoopbackHost(u.hostname);
    } catch (_) {
      return false;
    }
  }

  public isSafePublicStreamUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const u = new URL(urlStr);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      return !this.isPrivateOrLoopbackHost(u.hostname);
    } catch (_) {
      return false;
    }
  }

  public validateAiBaseUrl(baseUrl: string, label?: string): void {
    if (!baseUrl || typeof baseUrl !== 'string') return;
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`${label || 'API 地址'}仅支持 http/https 协议，拒绝 ${u.protocol}`);
      }
    } catch (e: any) {
      throw new Error(`${label || 'API 地址'}格式无效：${e.message || ''}`);
    }
  }

  public hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  public verifyPin(pin: string, hash: string): boolean {
    return this.hashPin(pin) === hash;
  }
}

export const securityManager = new SecurityManager();
