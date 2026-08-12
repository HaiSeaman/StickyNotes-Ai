/**
 * json-io.ts 单元测试
 * 覆盖原子写入、损坏文件恢复、写合并逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadJSON, saveJSON, loadJSONAsync, saveJSONSync } from '../src/main/lib/json-io';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonio-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadJSON', () => {
  it('文件不存在时返回 fallback', () => {
    const result = loadJSON(path.join(tmpDir, 'nonexistent.json'), { default: true });
    expect(result).toEqual({ default: true });
  });

  it('正常读取 JSON 文件', () => {
    const filePath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify({ name: 'test', value: 42 }));
    const result = loadJSON(filePath, null);
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('损坏的 JSON 文件应备份并返回 fallback', () => {
    const filePath = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(filePath, '{ invalid json }}}');
    const result = loadJSON(filePath, { recovered: true });
    expect(result).toEqual({ recovered: true });
    // 检查备份文件是否创建
    const files = fs.readdirSync(tmpDir);
    expect(files.some(f => f.startsWith('corrupt.json.corrupt-'))).toBe(true);
  });
});

describe('loadJSONAsync', () => {
  it('文件不存在时返回 fallback', async () => {
    const result = await loadJSONAsync(path.join(tmpDir, 'nonexistent.json'), []);
    expect(result).toEqual([]);
  });

  it('正常异步读取 JSON 文件', async () => {
    const filePath = path.join(tmpDir, 'async.json');
    fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]));
    const result = await loadJSONAsync(filePath, []);
    expect(result).toEqual([1, 2, 3]);
  });

  it('损坏文件异步读取应返回 fallback', async () => {
    const filePath = path.join(tmpDir, 'corrupt-async.json');
    fs.writeFileSync(filePath, 'not json at all');
    const result = await loadJSONAsync(filePath, { ok: false });
    expect(result).toEqual({ ok: false });
  });
});

describe('saveJSON', () => {
  it('成功保存 JSON 文件', async () => {
    const filePath = path.join(tmpDir, 'save.json');
    const result = await saveJSON(filePath, { data: 'hello' });
    expect(result).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ data: 'hello' });
  });

  it('高频写入应折叠为最终数据（写合并）', async () => {
    const filePath = path.join(tmpDir, 'merge.json');
    // 快速连续写入多个值
    const promises: Promise<boolean>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(saveJSON(filePath, { counter: i }));
    }
    await Promise.all(promises);
    // 等待所有写操作完成
    await new Promise(r => setTimeout(r, 200));
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    expect(data.counter).toBe(9); // 最后一次写入的值
  });
});

describe('saveJSONSync', () => {
  it('同步保存 JSON 文件', () => {
    const filePath = path.join(tmpDir, 'sync-save.json');
    const result = saveJSONSync(filePath, { sync: true });
    expect(result).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ sync: true });
  });
});
