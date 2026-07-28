const test = require('node:test');
const assert = require('node:assert/strict');
const { CREATION_PROMPTS, DEFAULT_MODELS } = require('../constants/appConstants');

/* ==================== CREATION_PROMPTS ==================== */
test('CREATION_PROMPTS 是非空数组', () => {
    assert.ok(Array.isArray(CREATION_PROMPTS));
    assert.ok(CREATION_PROMPTS.length > 0, '应当至少有一个预设');
});

test('CREATION_PROMPTS 每项有 id/name/prompt 字段', () => {
    for (const p of CREATION_PROMPTS) {
        assert.equal(typeof p.id, 'string', 'id 应当是字符串');
        assert.equal(typeof p.name, 'string', 'name 应当是字符串');
        assert.equal(typeof p.prompt, 'string', 'prompt 应当是字符串');
        assert.ok(p.id.length > 0, 'id 不应为空');
        assert.ok(p.name.length > 0, 'name 不应为空');
    }
});

test('CREATION_PROMPTS 的 id 唯一', () => {
    const ids = CREATION_PROMPTS.map(p => p.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'id 不应有重复');
});

test('CREATION_PROMPTS 包含 custom 自定义角色', () => {
    const custom = CREATION_PROMPTS.find(p => p.id === 'custom');
    assert.ok(custom, '应当包含 custom 自定义角色');
    assert.equal(custom.prompt, '', 'custom 的 prompt 应为空');
});

/* ==================== DEFAULT_MODELS ==================== */
test('DEFAULT_MODELS 是非空数组', () => {
    assert.ok(Array.isArray(DEFAULT_MODELS));
    assert.ok(DEFAULT_MODELS.length > 0, '应当至少有一个模型');
});

test('DEFAULT_MODELS 每项有 id/name 字段', () => {
    for (const m of DEFAULT_MODELS) {
        assert.equal(typeof m.id, 'string', 'id 应当是字符串');
        assert.equal(typeof m.name, 'string', 'name 应当是字符串');
        assert.ok(m.id.length > 0, 'id 不应为空');
        assert.ok(m.name.length > 0, 'name 不应为空');
    }
});

test('DEFAULT_MODELS 的 id 唯一', () => {
    const ids = DEFAULT_MODELS.map(m => m.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'id 不应有重复');
});
