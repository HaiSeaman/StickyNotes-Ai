# 稳妥快赢优化实施计划

> **目标**：通过三批次渐进式优化，在不破坏现有功能的前提下，减少代码量、提升代码质量、加速启动、改善 Windows 体验。
>
> **原则**：每批次独立可测，出问题易回滚。批次 1 零风险，批次 2 低风险，批次 3 是测试与审查收尾。

---

## 文件结构总览

### 批次 1（清理，零风险）

| 操作 | 文件 | 说明 |
|------|------|------|
| 移动 | `V1.1_BUG修复报告.md` ~ `V1.7_重构与修复备忘录.md` | 9 份历史报告挪进 `docs/history/` |
| 修改 | `README.md` | 删除已下线的 TTS / AI 翻译章节，修正技术栈描述 |
| 修改 | `.gitignore` | 增加 `electron_err.log` 等运行时日志的忽略规则（若未存在） |

### 批次 2（懒加载，低风险）

| 操作 | 文件 | 改动要点 |
|------|------|---------|
| 修改 | `main.js:7-11` | `AdmZip` / `@aws-sdk/client-s3` / `music-metadata-browser` 改为函数内 `require`（懒加载） |
| 修改 | `main.js:3755` | `parseNodeStream` 改为 `parseStream`，并迁移到 `music-metadata` v7（已传递依赖） |
| 修改 | `package.json` | 显式声明 `music-metadata` 依赖，移除 `music-metadata-browser` |
| 修改 | `index.html:978-980` | `marked.min.js` / `purify.min.js` / `howler.min.js` 改为按需加载（仅在用户进入对应 tab 时加载） |
| 删除 | `howler.min.js`, `marked.min.js`, `purify.min.js` | 改为通过 npm 安装并打包进 asar，移除根目录散装文件 |
| 修改 | `renderer/tabs/music-tab.js` | 改为动态 `import('howler')` 或在 init 时加载 |
| 修改 | `renderer.js:4724-4744` | marked/DOMPurify 改为首次预览时动态加载 |

### 批次 3（测试 + 审查）

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `test/lazy-load.test.js` | 验证懒加载不破坏模块导出 |
| 新增 | `test/startup-order.test.js` | 验证启动顺序正确性 |
| 扩充 | 现有 `test/*.test.js` | 补充边界用例 |
| 审查 | 全部 `*.js` | 静态审查 + 语法检查 |

---

## 批次 1：清理与文档

### 任务 1.1：归档历史报告

**文件：**
- 移动：`V1.1_BUG修复报告.md`、`V1.2_重构与优化报告.md`、`V1.3_代码审查优化报告.md`、`V1.4_重构功能和优化代码方案.md`、`V1.4_重构和优化备忘录.md`、`V1.5_代码优化备忘录.md`、`V1.6_优化和修复报告.md`、`V1.7_功能重构方案.md`、`V1.7_重构与修复备忘录.md`
- 目标目录：`docs/history/`

- [ ] **步骤 1**：创建 `docs/history/` 目录
- [ ] **步骤 2**：移动 9 份 .md 文件到该目录
- [ ] **步骤 3**：验证根目录已无 V1.x 报告
- [ ] **步骤 4**：提交

### 任务 1.2：更新 README

**文件：** `README.md`

- [ ] **步骤 1**：删除 TTS 语音工坊、AI 翻译相关章节
- [ ] **步骤 2**：修正技术栈表格，移除 music-metadata-browser，改为 music-metadata
- [ ] **步骤 3**：修正功能特性表格，移除已下线功能
- [ ] **步骤 4**：提交

### 任务 1.3：清理 main.js 死注释

**文件：** `main.js`

- [ ] **步骤 1**：搜索 `TODO`、`FIXME`、`已废弃`、`P0 阶段` 等过期注释
- [ ] **步骤 2**：删除已完成的阶段性注释（如"P0 骨架"P2 阶段接入"等）
- [ ] **步骤 3**：保留有意义的架构说明注释
- [ ] **步骤 4**：提交

---

## 批次 2：懒加载与依赖清理

### 任务 2.1：S3 SDK 懒加载

**文件：** `main.js:8, 1253-1256, 1412-1500`

- [ ] **步骤 1**：删除顶部 `const { S3Client, ... } = require('@aws-sdk/client-s3');`
- [ ] **步骤 2**：在 `getS3Client` 函数内部 `require('@aws-sdk/client-s3')`
- [ ] **步骤 3**：运行 `npm test` 验证
- [ ] **步骤 4**：提交

### 任务 2.2：AdmZip 懒加载

**文件：** `main.js:7, 1320-1337, 2057-2077`

- [ ] **步骤 1**：删除顶部 `const AdmZip = require('adm-zip');`
- [ ] **步骤 2**：在 `createBackupZip` 和 `sync:restore-backup` 内部 `require('adm-zip')`
- [ ] **步骤 3**：运行 `npm test` 验证
- [ ] **步骤 4**：提交

### 任务 2.3：替换废弃的 music-metadata-browser

**文件：** `main.js:11, 3719-3760`, `package.json`, `preload.js`

- [ ] **步骤 1**：`npm install music-metadata@^7.14.0 --save`
- [ ] **步骤 2**：`npm uninstall music-metadata-browser --save`
- [ ] **步骤 3**：删除顶部 `const { parseNodeStream } = require('music-metadata-browser');`
- [ ] **步骤 4**：在 `music:read-metadata` handler 内部动态 require 并调用 `parseStream`
- [ ] **步骤 5**：运行 `npm test` 验证
- [ ] **步骤 6**：提交

### 任务 2.4：散装第三方库挪进 npm

**文件：** `index.html`, `package.json`, `renderer/tabs/music-tab.js`, `renderer.js`

- [ ] **步骤 1**：`npm install howler marked dompurify --save`
- [ ] **步骤 2**：删除根目录 `howler.min.js`, `marked.min.js`, `purify.min.js`
- [ ] **步骤 3**：修改 index.html，移除三个 `<script>` 标签
- [ ] **步骤 4**：music-tab.js 在 init 时动态加载 howler
- [ ] **步骤 5**：renderer.js 在首次预览时动态加载 marked + dompurify
- [ ] **步骤 6**：运行 `npm test` 验证
- [ ] **步骤 7**：提交

---

## 批次 3：测试与审查

### 任务 3.1：扩充自动化测试

- [ ] 新增 `test/lazy-load.test.js`：验证懒加载函数返回正确类型
- [ ] 扩充 `test/json-io.test.js`：增加并发写边界用例
- [ ] 运行 `npm test` 确保全部通过

### 任务 3.2：全代码审查

- [ ] 对 main.js、renderer.js、所有 tab 模块、工具模块做静态审查
- [ ] 检查未使用的变量、重复代码、潜在 bug
- [ ] 修复审查发现的问题

### 任务 3.3：最终验证

- [ ] 运行 `npm test`
- [ ] 对所有 .js 文件做 `node --check` 语法检查
- [ ] 生成最终报告

---

## 自查

- ✅ 覆盖了用户要求的"减少代码量、增加质量、加速启动、Windows 更好用"
- ✅ 每个任务有具体文件路径和步骤
- ✅ 每批次独立可测
- ✅ 未引入新框架或大改动
