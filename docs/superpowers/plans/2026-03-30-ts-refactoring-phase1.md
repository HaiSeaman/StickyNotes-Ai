# TypeScript 架构重构 - 阶段 1 实现计划 (构建工具链与 TS 环境搭建)

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 搭建 TypeScript 编译与 Vite + tsup 构建工具链，完成 tsconfig 隔离配置与 package.json 构建命令整合，并验证构建管道输出。

**架构：** 使用 `tsup` 负责主进程与预加载脚本（Node/Electron环境）的极速 TypeScript 编译打包到 `dist/`，使用 `Vite` 负责渲染进程（Browser/DOM环境）的打包编译到 `dist-renderer/`。保持现有的应用入口兼容。

**技术栈：** TypeScript, tsup, Vite, Electron, Node.js

---

### 任务 1：安装 TypeScript 及相关编译依赖与类型定义

**文件：**
- 修改：`package.json`

- [ ] **步骤 1：检查 package.json 并执行 npm i 命令安装开发依赖**

运行命令：
```bash
npm install -D typescript tsup vite @types/node @types/dompurify @types/howler @types/marked @types/adm-zip
```

- [ ] **步骤 2：运行 package.json 检查确认 devDependencies 更新**

运行命令/查看 `package.json` 确认新增开发依赖项。

- [ ] **步骤 3：Commit**

```bash
git add package.json package-lock.json
git commit -m "build: install typescript, tsup, vite and type definitions"
```

---

### 任务 2：创建 TypeScript 配置文件 (`tsconfig.json`, `tsconfig.main.json`, `tsconfig.renderer.json`)

**文件：**
- 创建：`tsconfig.json`
- 创建：`tsconfig.main.json`
- 创建：`tsconfig.renderer.json`

- [ ] **步骤 1：创建全局根 tsconfig.json**

创建 `tsconfig.json` 包含基础配置：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false
  },
  "exclude": ["node_modules", "dist", "dist-renderer"]
}
```

- [ ] **步骤 2：创建主进程与 Preload 专属 tsconfig.main.json**

创建 `tsconfig.main.json`：
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "target": "ES2022",
    "outDir": "./dist"
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/types/**/*"]
}
```

- [ ] **步骤 3：创建渲染进程专属 tsconfig.renderer.json**

创建 `tsconfig.renderer.json`：
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "jsx": "preserve",
    "outDir": "./dist-renderer"
  },
  "include": ["src/renderer/**/*", "src/types/**/*"]
}
```

- [ ] **步骤 4：Commit**

```bash
git add tsconfig.json tsconfig.main.json tsconfig.renderer.json
git commit -m "config: add tsconfig suite for main and renderer processes"
```

---

### 任务 3：创建 Vite 配置与入口 HTML 兼容层

**文件：**
- 创建：`vite.config.ts`

- [ ] **步骤 1：创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '.'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

- [ ] **步骤 2：Commit**

```bash
git add vite.config.ts
git commit -m "config: add vite.config.ts for renderer build"
```

---

### 任务 4：创建测试用 TS 探针源码与更新 package.json 构建脚本

**文件：**
- 创建：`src/main/index.ts`
- 创建：`src/renderer/main.ts`
- 修改：`package.json`

- [ ] **步骤 1：创建 src/main/index.ts 验证主进程 TS 编译**

```typescript
console.log('[Main TS Probe] Main process TS entry initialized.');
export const mainProbe = true;
```

- [ ] **步骤 2：创建 src/renderer/main.ts 验证渲染进程 TS 编译**

```typescript
console.log('[Renderer TS Probe] Renderer process TS entry initialized.');
export const rendererProbe = true;
```

- [ ] **步骤 3：在 package.json 的 scripts 中配置编译与打包命令**

在 `package.json` 的 `"scripts"` 中添加：
```json
"build:main": "tsup src/main/index.ts --out-dir dist/main --format cjs --clean",
"build:renderer": "vite build",
"build:ts": "npm run build:main && npm run build:renderer",
"type-check": "tsc --noEmit"
```

- [ ] **步骤 4：运行 npm run build:ts 验证构建管道**

运行：`npm run build:ts`
预期：`dist/main/index.js` 生成成功，且 `dist-renderer/` 输出正常。

- [ ] **步骤 5：Commit**

```bash
git add src/main/index.ts src/renderer/main.ts package.json
git commit -m "feat(build): add ts build scripts and entry probes"
```

---

### 任务 5：阶段 1 编译审计与功能修复验证

**文件：**
- 所有新建及修改的文件

- [ ] **步骤 1：运行 tsc 类型审计**

运行：`npm run type-check`
预期：零报错 (0 errors)。

- [ ] **步骤 2：验证现有 JS 应用运行是否受影响**

运行：`npm start` 或 `npm test`
预期：应用能正常启动，测试正常跑通。

- [ ] **步骤 3：Commit 阶段 1 成果**

```bash
git add .
git commit -m "chore(phase1): complete phase 1 build pipeline and type-check audit"
```
