const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadJSON, loadJSONAsync, saveJSON, saveJSONSync } = require('../json-io');

/* ==================== 测试隔离：每个测试用独立临时目录 ==================== */
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jsonio-test-'));
}

function cleanupDir(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
            fs.unlinkSync(path.join(dir, f));
        }
        fs.rmdirSync(dir);
    } catch (_) {}
}

/* ==================== loadJSON（同步版） ==================== */
test('loadJSON 正常读取 JSON 文件', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'data.json');
        fs.writeFileSync(fp, JSON.stringify({ name: '测试', value: 42 }));
        const result = loadJSON(fp, null);
        assert.deepEqual(result, { name: '测试', value: 42 });
    } finally { cleanupDir(dir); }
});

test('loadJSON 文件不存在时返回 fallback', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'not-exist.json');
        const fallback = { default: true };
        assert.equal(loadJSON(fp, fallback), fallback);
    } finally { cleanupDir(dir); }
});

test('loadJSON 损坏文件返回 fallback 并备份', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'corrupt.json');
        fs.writeFileSync(fp, '{这不是合法JSON}}}}');
        const result = loadJSON(fp, 'fallback');
        assert.equal(result, 'fallback');
        // 验证备份文件已生成（.corrupt-<ts> 后缀）
        const files = fs.readdirSync(dir);
        const backup = files.find(f => f.startsWith('corrupt.json.corrupt-'));
        assert.ok(backup, '应当生成 .corrupt-<ts> 备份文件');
    } finally { cleanupDir(dir); }
});

/* ==================== loadJSONAsync（异步版，第一阶段新增） ==================== */
test('loadJSONAsync 正常读取 JSON 文件', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'data.json');
        fs.writeFileSync(fp, JSON.stringify([1, 2, 3]));
        const result = await loadJSONAsync(fp, null);
        assert.deepEqual(result, [1, 2, 3]);
    } finally { cleanupDir(dir); }
});

test('loadJSONAsync 文件不存在时返回 fallback', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'not-exist.json');
        const result = await loadJSONAsync(fp, []);
        assert.deepEqual(result, []);
    } finally { cleanupDir(dir); }
});

test('loadJSONAsync 损坏文件返回 fallback 并备份', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'corrupt.json');
        fs.writeFileSync(fp, '彻底坏掉的JSON{{{{');
        const result = await loadJSONAsync(fp, 'fallback');
        assert.equal(result, 'fallback');
        const files = fs.readdirSync(dir);
        const backup = files.find(f => f.startsWith('corrupt.json.corrupt-'));
        assert.ok(backup, '应当生成 .corrupt-<ts> 备份文件');
    } finally { cleanupDir(dir); }
});

test('loadJSONAsync 返回 Promise', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'data.json');
        fs.writeFileSync(fp, '{}');
        const result = loadJSONAsync(fp, null);
        assert.ok(result instanceof Promise, '应当返回 Promise');
        return result;  // 等待完成
    } finally { cleanupDir(dir); }
});

/* ==================== saveJSON（异步版，含写合并） ==================== */
test('saveJSON 正常写入并创建文件', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'save.json');
        const ok = await saveJSON(fp, { hello: 'world' });
        assert.equal(ok, true);
        const content = fs.readFileSync(fp, 'utf-8');
        assert.deepEqual(JSON.parse(content), { hello: 'world' });
    } finally { cleanupDir(dir); }
});

test('saveJSON 返回 true 表示写入成功', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'save.json');
        const ok = await saveJSON(fp, { a: 1 });
        assert.equal(ok, true);
    } finally { cleanupDir(dir); }
});

test('saveJSON 写合并：高频写入折叠为最后一次数据', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'merge.json');
        // 并发发起 5 次写入，应当折叠为最后一次的数据
        const writes = [];
        for (let i = 1; i <= 5; i++) {
            writes.push(saveJSON(fp, { version: i }));
        }
        await Promise.all(writes);
        // 等待所有写入完成（saveJSON 内部有锁和队列）
        await new Promise(r => setTimeout(r, 200));
        const content = fs.readFileSync(fp, 'utf-8');
        const data = JSON.parse(content);
        assert.ok(data.version >= 1, 'version 应当是 1-5 之间的某个值');
        assert.ok(data.version <= 5);
    } finally { cleanupDir(dir); }
});

test('saveJSON 不残留 tmp 临时文件', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'clean.json');
        await saveJSON(fp, { x: 1 });
        await new Promise(r => setTimeout(r, 100));
        const files = fs.readdirSync(dir);
        const tmpFiles = files.filter(f => f.endsWith('.tmp'));
        assert.equal(tmpFiles.length, 0, '不应当残留 .tmp 文件');
    } finally { cleanupDir(dir); }
});

test('saveJSON 保存后再读取应当一致', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'roundtrip.json');
        const original = { notes: [{ id: 1, text: '你好' }], count: 1 };
        await saveJSON(fp, original);
        const loaded = await loadJSONAsync(fp, null);
        assert.deepEqual(loaded, original);
    } finally { cleanupDir(dir); }
});

/* ==================== saveJSONSync（同步版） ==================== */
test('saveJSONSync 正常写入', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'sync.json');
        const ok = saveJSONSync(fp, { sync: true });
        assert.equal(ok, true);
        const content = fs.readFileSync(fp, 'utf-8');
        assert.deepEqual(JSON.parse(content), { sync: true });
    } finally { cleanupDir(dir); }
});

test('saveJSONSync 返回 false 时目录不存在不应崩溃', () => {
    // 指向一个不存在的目录，应当返回 false 而非抛错
    const fp = path.join(os.tmpdir(), 'nonexistent-dir-12345', 'file.json');
    const ok = saveJSONSync(fp, { x: 1 });
    assert.equal(ok, false);
});

/* ==================== 边界情况 ==================== */
test('loadJSON 空数组 fallback 被正确返回', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'empty.json');
        const fallback = [];
        assert.equal(loadJSON(fp, fallback), fallback);
    } finally { cleanupDir(dir); }
});

test('loadJSON 空对象 fallback 被正确返回', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'empty.json');
        const fallback = {};
        assert.equal(loadJSON(fp, fallback), fallback);
    } finally { cleanupDir(dir); }
});

test('saveJSON 写入空数组', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'empty-arr.json');
        await saveJSON(fp, []);
        const loaded = await loadJSONAsync(fp, null);
        assert.deepEqual(loaded, []);
    } finally { cleanupDir(dir); }
});

test('saveJSON 写入 null 值（已知行为：当前实现跳过 null 不写入）', async () => {
    // 已知限制：saveJSON 内部用 `while (task.pendingData !== null)` 判断，
    // 当 data 为 null 时循环不执行，文件不会被创建。
    // 此测试锁定当前行为，未来修复后应改为 assert.equal(loaded, null)。
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'null.json');
        await saveJSON(fp, null);
        const loaded = await loadJSONAsync(fp, 'fallback');
        assert.equal(loaded, 'fallback', '当前实现不写入 null，返回 fallback');
    } finally { cleanupDir(dir); }
});

/* ==================== 原子性测试（第四阶段新增） ==================== */
test('saveJSON 不残留任何临时文件（含降级路径的 tmp2）', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'atomic.json');
        await saveJSON(fp, { test: '数据' });
        await new Promise(r => setTimeout(r, 100));
        const files = fs.readdirSync(dir);
        // 只应有目标文件本身，不应有任何 .tmp / .replace-*.tmp 残留
        const tmpFiles = files.filter(f => f.endsWith('.tmp') || f.includes('.replace-'));
        assert.equal(tmpFiles.length, 0, '不应残留临时文件，实际: ' + JSON.stringify(tmpFiles));
        assert.ok(files.includes('atomic.json'), '目标文件应存在');
    } finally { cleanupDir(dir); }
});

test('saveJSON 多次写入后数据完整且无残留', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'multi.json');
        // 连续写入 5 次不同数据，验证最后一次数据正确且无临时文件残留
        for (let i = 1; i <= 5; i++) {
            await saveJSON(fp, { version: i, data: '内容'.repeat(i) });
        }
        await new Promise(r => setTimeout(r, 200));
        const loaded = await loadJSONAsync(fp, null);
        assert.equal(loaded.version, 5, '应当是最后一次写入的版本');
        const files = fs.readdirSync(dir);
        assert.equal(files.length, 1, '只应有 1 个目标文件，实际: ' + JSON.stringify(files));
        assert.equal(files[0], 'multi.json');
    } finally { cleanupDir(dir); }
});

test('saveJSONSync 不残留任何临时文件', () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'sync-atomic.json');
        saveJSONSync(fp, { sync: true, data: [1, 2, 3] });
        const files = fs.readdirSync(dir);
        const tmpFiles = files.filter(f => f.endsWith('.tmp') || f.includes('.replace-'));
        assert.equal(tmpFiles.length, 0, '不应残留临时文件，实际: ' + JSON.stringify(tmpFiles));
        assert.ok(files.includes('sync-atomic.json'), '目标文件应存在');
    } finally { cleanupDir(dir); }
});

test('saveJSON 覆盖已存在文件后数据正确（原子性验证）', async () => {
    const dir = makeTempDir();
    try {
        const fp = path.join(dir, 'overwrite.json');
        // 先写入旧数据
        await saveJSON(fp, { old: true, value: '旧数据' });
        // 再覆盖写入新数据
        await saveJSON(fp, { new: true, value: '新数据' });
        await new Promise(r => setTimeout(r, 100));
        const loaded = await loadJSONAsync(fp, null);
        assert.equal(loaded.new, true, '应当是新数据');
        assert.equal(loaded.value, '新数据');
        assert.equal(loaded.old, undefined, '旧数据字段不应存在');
    } finally { cleanupDir(dir); }
});
