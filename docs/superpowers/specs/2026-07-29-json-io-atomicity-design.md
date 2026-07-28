# json-io.js 原子性修复设计

## 背景

`json-io.js` 的 `doSaveJSON` 和 `saveJSONSync` 在 `rename` 失败时降级到 `copy + unlink`。
`copyFileSync` 是**非原子**操作：如果 copy 中途进程崩溃或断电，目标文件会变成截断的损坏文件。

虽然该路径只在 Windows 文件被占用等场景触发（低频），但一旦中招会导致用户数据丢失。

## 目标

让降级路径也具备原子性：目标文件要么是旧的完整内容，要么是新的完整内容，不会出现截断。

## 方案

降级路径从 "直接 copy 到目标" 改为 "copy 到新临时文件后 rename 到目标"。
`rename` 在同一文件系统内是原子操作，能保证目标文件内容完整性。

### 修改前（doSaveJSON 降级路径）

```js
// 降级：copy + unlink
try {
    fs.copyFileSync(tmp, filePath);          // 非原子！
    try { fs.unlinkSync(tmp); } catch (_) {}
    return true;
} catch (e2) {
    ...
}
```

### 修改后（doSaveJSON 降级路径）

```js
// 降级：copy 到新临时文件后 rename（原子替换）
try {
    const tmp2 = filePath + '.replace-' + uniqueId + '.tmp';
    fs.copyFileSync(tmp, tmp2);
    try {
        fs.renameSync(tmp2, filePath);       // 原子替换
        return true;
    } catch (e3) {
        // rename 仍失败（极少见），fallback 到直接 copy
        try { fs.unlinkSync(tmp2); } catch (_) {}
        fs.copyFileSync(tmp, filePath);
        return true;
    }
} catch (e2) {
    ...
} finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
}
```

`saveJSONSync` 的降级路径同样修改。

## 测试

1. 现有 18 个 json-io 单测全部通过
2. 新增 2 个单测：
   - "降级路径不残留 tmp2 临时文件"
   - "降级路径成功后数据正确"
3. Playwright 完整功能测试通过

## 不做的事

- 不收紧 CSP（业务需要连多个 AI 服务商，收紧会影响功能）
- 不改 SSRF / musicfile / WebDAV 同步（调查发现已有完善防护）
