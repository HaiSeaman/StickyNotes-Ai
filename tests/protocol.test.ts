/**
 * protocol.ts buildRangeStreamResponse 测试
 * 覆盖：空文件、单段 Range、416 范围错误、无 Range 全量 200
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildRangeStreamResponse } from '../src/main/lib/protocol';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proto-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeFile(name: string, content: string): string {
  const fp = path.join(tmpDir, name);
  fs.writeFileSync(fp, content, 'utf8');
  return fp;
}

describe('buildRangeStreamResponse', () => {
  it('无 Range 时返回 200 + Content-Length 全文', async () => {
    const fp = makeFile('a.txt', 'hello world');
    const resp = buildRangeStreamResponse(fp, 11, 'text/plain', null);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Length')).toBe('11');
    expect(resp.headers.get('Accept-Ranges')).toBe('bytes');
    expect(resp.headers.get('Content-Type')).toBe('text/plain');
    await expect(resp.text()).resolves.toBe('hello world');
  });

  it('Range: bytes=0-4 返回 206 且仅包含前 5 字节', async () => {
    const fp = makeFile('a.txt', 'hello world');
    const resp = buildRangeStreamResponse(fp, 11, 'text/plain', 'bytes=0-4');
    expect(resp.status).toBe(206);
    expect(resp.headers.get('Content-Range')).toBe('bytes 0-4/11');
    expect(resp.headers.get('Content-Length')).toBe('5');
    await expect(resp.text()).resolves.toBe('hello');
  });

  it('Range 起点越界返回 416', async () => {
    const fp = makeFile('a.txt', 'hello world');
    const resp = buildRangeStreamResponse(fp, 11, 'text/plain', 'bytes=20-30');
    expect(resp.status).toBe(416);
    expect(resp.headers.get('Content-Range')).toBe('bytes */11');
  });

  it('空文件返回 200 + Length 0（避免 createReadStream ERR_OUT_OF_RANGE）', async () => {
    const fp = makeFile('empty.txt', '');
    const resp = buildRangeStreamResponse(fp, 0, 'text/plain', 'bytes=0-4');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Length')).toBe('0');
    await expect(resp.text()).resolves.toBe('');
  });
});
