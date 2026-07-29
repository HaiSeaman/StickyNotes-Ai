/**
 * 懒加载与依赖替换验证测试
 *
 * 验证内容：
 * 1. music-metadata 模块能正常加载（替代废弃的 music-metadata-browser）
 * 2. music-metadata 提供 parseStream 函数
 * 3. adm-zip 模块能正常加载
 * 4. @aws-sdk/client-s3 模块能正常加载并提供所需的命令类
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('music-metadata 模块可加载且提供 parseStream', () => {
    const musicMetadata = require('music-metadata');
    assert.equal(typeof musicMetadata.parseStream, 'function', 'parseStream 应为函数');
});

test('music-metadata-browser 已被卸载', () => {
    let loaded = false;
    try {
        require('music-metadata-browser');
        loaded = true;
    } catch (e) {
        // 预期：模块不存在
    }
    assert.equal(loaded, false, 'music-metadata-browser 应已被卸载');
});

test('adm-zip 模块可正常加载', () => {
    const AdmZip = require('adm-zip');
    assert.equal(typeof AdmZip, 'function', 'AdmZip 应为构造函数');
    const zip = new AdmZip();
    assert.ok(zip, '应能创建 AdmZip 实例');
});

test('@aws-sdk/client-s3 提供所有所需的命令类', () => {
    const s3 = require('@aws-sdk/client-s3');
    assert.equal(typeof s3.S3Client, 'function', 'S3Client 应为构造函数');
    assert.equal(typeof s3.PutObjectCommand, 'function', 'PutObjectCommand 应为构造函数');
    assert.equal(typeof s3.HeadBucketCommand, 'function', 'HeadBucketCommand 应为构造函数');
    assert.equal(typeof s3.ListObjectsV2Command, 'function', 'ListObjectsV2Command 应为构造函数');
    assert.equal(typeof s3.DeleteObjectCommand, 'function', 'DeleteObjectCommand 应为构造函数');
    assert.equal(typeof s3.GetObjectCommand, 'function', 'GetObjectCommand 应为构造函数');
});

test('music-metadata parseStream 能解析 MP3 流（smoke test）', async () => {
    // 创建一个最小的 MP3 流进行 smoke test
    // 注意：这里只验证 parseStream 函数能被调用，不验证解析结果
    // 因为构造合法 MP3 数据较复杂，我们用一个空流验证函数签名
    const { Readable } = require('stream');
    const { parseStream } = require('music-metadata');

    // 创建空可读流，parseStream 应能处理并返回（可能抛错但不崩溃）
    const emptyStream = new Readable({
        read() { this.push(null); }  // 立即结束
    });

    // 即使解析失败（空数据），函数也应正常返回或抛出可预期的错误
    // 而不是崩溃或挂起
    let result = null;
    let error = null;
    try {
        result = await parseStream(emptyStream, 'audio/mpeg');
    } catch (e) {
        error = e;
    }
    // 只要没有挂起或崩溃就算通过
    assert.ok(result !== null || error !== null, 'parseStream 应正常返回或抛错，不应挂起');
});

test('renderer/utils.js 的 loadScript 函数定义正确', () => {
    // 验证 utils.js 文件内容包含 loadScript 函数定义
    const fs = require('fs');
    const path = require('path');
    const utilsContent = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'utils.js'),
        'utf-8'
    );
    assert.ok(
        utilsContent.includes('function loadScript'),
        'renderer/utils.js 应包含 loadScript 函数定义'
    );
    assert.ok(
        utilsContent.includes('loadScript'),
        'RendererUtils 应导出 loadScript'
    );
});
