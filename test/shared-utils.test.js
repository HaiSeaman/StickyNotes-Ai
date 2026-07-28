const test = require('node:test');
const assert = require('node:assert/strict');
const { genId, previewText, toISODate, isToday, swallow, trimTrailingSlash } = require('../shared-utils');

/* ==================== genId ==================== */
test('genId 返回数值类型', () => {
    const id = genId();
    assert.equal(typeof id, 'number');
    assert.ok(Number.isFinite(id), '应当是有限数');
});

test('genId 连续调用大概率生成不同值', () => {
    // genId = Date.now()*1000 + random(0..999)，同步循环内 Date.now 相同，
    // 碰撞概率存在但极低。测试 100 次至少 95 个不同（容忍极小碰撞）。
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(genId());
    assert.ok(ids.size >= 95, '100 次调用至少 95 个不同，实际 ' + ids.size);
});

/* ==================== previewText ==================== */
test('previewText 空文本返回默认提示', () => {
    assert.equal(previewText(''), '空白便签');
    assert.equal(previewText(null), '空白便签');
    assert.equal(previewText(undefined), '空白便签');
});

test('previewText 取首行', () => {
    assert.equal(previewText('第一行\n第二行'), '第一行');
});

test('previewText 超长截断并加省略号', () => {
    // 30 个字符超过默认 maxLen(24)，应当截断为 24 + '...'
    const long = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十';
    const result = previewText(long);
    assert.ok(result.endsWith('...'), '应当以省略号结尾，实际: ' + result);
    assert.ok(result.length === 27, '应当是 24 + 3 = 27 字符，实际: ' + result.length);
});

test('previewText 支持自定义长度', () => {
    assert.equal(previewText('abcdef', 3), 'abc...');
    assert.equal(previewText('abc', 5), 'abc');
});

/* ==================== toISODate ==================== */
test('toISODate 接受 Date 对象', () => {
    const d = new Date(2026, 6, 29, 15, 30);  // 月份从 0 开始，6=7月
    assert.equal(toISODate(d), '2026-07-29');
});

test('toISODate 接受字符串', () => {
    assert.equal(toISODate('2026-07-29T10:00:00'), '2026-07-29');
});

test('toISODate 格式补零', () => {
    const d = new Date(2026, 0, 5);  // 1月5日
    assert.equal(toISODate(d), '2026-01-05');
});

/* ==================== isToday ==================== */
test('isToday 今天的日期返回 true', () => {
    assert.equal(isToday(toISODate(new Date())), true);
});

test('isToday 非今天返回 false', () => {
    assert.equal(isToday('2000-01-01'), false);
});

/* ==================== swallow ==================== */
test('swallow 正常函数返回结果', () => {
    assert.equal(swallow(() => 42), 42);
});

test('swallow 抛错时吞掉并返回 undefined', () => {
    assert.equal(swallow(() => { throw new Error('boom'); }), undefined);
});

test('swallow 带 label 时打 warn 日志', () => {
    const warnings = [];
    const origWarn = console.warn;
    // swallow 实际调用 console.warn('[label]', msg) 两个参数
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        swallow(() => { throw new Error('boom'); }, '测试标签');
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0].includes('测试标签'));
        assert.ok(warnings[0].includes('boom'));
    } finally {
        console.warn = origWarn;
    }
});

/* ==================== trimTrailingSlash ==================== */
test('trimTrailingSlash 无斜杠原样返回', () => {
    assert.equal(trimTrailingSlash('https://api.example.com'), 'https://api.example.com');
});

test('trimTrailingSlash 单个斜杠', () => {
    assert.equal(trimTrailingSlash('https://api.example.com/'), 'https://api.example.com');
});

test('trimTrailingSlash 多个斜杠', () => {
    assert.equal(trimTrailingSlash('https://api.example.com///'), 'https://api.example.com');
});

test('trimTrailingSlash 空值或 null 安全', () => {
    assert.equal(trimTrailingSlash(''), '');
    assert.equal(trimTrailingSlash(null), '');
    assert.equal(trimTrailingSlash(undefined), '');
});

test('trimTrailingSlash 去除首尾空格', () => {
    assert.equal(trimTrailingSlash('  https://api.example.com/  '), 'https://api.example.com');
});
