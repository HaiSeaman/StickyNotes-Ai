/* ==================== json-io.ts ====================
 * JSON 文件读写模块：原子写入 + 损坏文件自动备份 + Windows EPERM 重试。
 * =============================================== */
import fs from 'fs';
import crypto from 'crypto';

interface FileLock {
    isWriting: boolean;
    pendingData: any;
    currentPromise: Promise<boolean>;
}

const fileLocks = new Map<string, FileLock>();

/**
 * 同步读取 JSON 文件。文件不存在返回 fallback，损坏自动备份后返回 fallback。
 */
export function loadJSON<T>(filePath: string, fallback: T): T {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err: any) {
        if (err.code === 'ENOENT') return fallback;
        console.error('读 JSON 失败:', err.message);
        try {
            const backupPath = filePath + '.corrupt-' + Date.now();
            fs.copyFileSync(filePath, backupPath);
            console.error('已备份损坏文件到:', backupPath);
        } catch (_) { /* 忽略备份失败 */ }
        return fallback;
    }
}

/**
 * 异步读取 JSON 文件（非阻塞，IPC handler 应优先使用此版本）。
 */
export async function loadJSONAsync<T>(filePath: string, fallback: T): Promise<T> {
    let raw: string;
    try {
        raw = await fs.promises.readFile(filePath, 'utf-8');
    } catch (err: any) {
        if (err.code === 'ENOENT') return fallback;
        console.error('读 JSON 失败:', err.message);
        return fallback;
    }
    try {
        return JSON.parse(raw);
    } catch (parseErr: any) {
        console.error('解析 JSON 失败:', parseErr.message);
        try {
            const backupPath = filePath + '.corrupt-' + Date.now();
            await fs.promises.copyFile(filePath, backupPath);
            console.error('已备份损坏文件到:', backupPath);
        } catch (_) { /* 忽略备份失败 */ }
        return fallback;
    }
}

/**
 * 异步保存 JSON 文件（支持写合并，高频写入时自动折叠只落盘最新数据 + 原子写入 + Windows EPERM 重试）。
 */
export async function saveJSON(filePath: string, data: any): Promise<boolean> {
    let task = fileLocks.get(filePath);
    if (!task) {
        task = {
            isWriting: false,
            pendingData: null,
            currentPromise: Promise.resolve(false) as Promise<boolean>
        };
        fileLocks.set(filePath, task);
    }

    task.pendingData = data;

    if (task.isWriting) {
        return task.currentPromise;
    }

    task.isWriting = true;
    task.currentPromise = (async () => {
        let lastResult = false;
        while (task!.pendingData !== null) {
            const dataToSave = task!.pendingData;
            task!.pendingData = null;
            lastResult = await doSaveJSON(filePath, dataToSave);
        }
        task!.isWriting = false;
        // L4 修复：写入完成且无待写数据时清理 Map 条目，避免 fileLocks 无限增长导致内存泄漏
        if (task!.pendingData === null && !task!.isWriting) {
            fileLocks.delete(filePath);
        }
        return lastResult;
    })();

    return task.currentPromise;
}

async function doSaveJSON(filePath: string, data: any): Promise<boolean> {
    let tmp: string | null = null;
    try {
        const uniqueId = process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        tmp = filePath + '.' + uniqueId + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await fs.promises.rename(tmp, filePath);
                return true;
            } catch (e: any) {
                lastErr = e;
                if (e.code !== 'EPERM' && e.code !== 'EACCES' && e.code !== 'EBUSY') {
                    break;
                }
                const wait = 50 * (attempt + 1);
                await new Promise<void>(r => setTimeout(r, wait));
            }
        }
        // 降级：copy 到新临时文件后 rename（保持原子性，绝不直接 copy 覆盖目标文件）
        let tmp2: string | null = null;
        try {
            tmp2 = filePath + '.replace-' + uniqueId + '.tmp';
            fs.copyFileSync(tmp, tmp2);
            try {
                await fs.promises.rename(tmp2, filePath);
                return true;
            } catch (e3: any) {
                try { fs.unlinkSync(tmp2); } catch (_) {}
                // rename 仍失败：保留原文件不动，返回失败而非非原子覆盖（防数据损坏）
                console.error('写 JSON 失败（rename 降级也失败），保留原文件:', e3.message, '原始错误:', lastErr && lastErr.message);
                return false;
            }
        } catch (e2: any) {
            console.error('写 JSON 失败（rename 重试与降级均失败）:', e2.message, '原始错误:', lastErr && lastErr.message);
            return false;
        } finally {
            if (tmp2 && fs.existsSync(tmp2)) {
                try { fs.unlinkSync(tmp2); } catch (_) {}
            }
        }
    } catch (err: any) {
        console.error('写 JSON 失败:', err.message);
        return false;
    } finally {
        if (tmp && fs.existsSync(tmp)) {
            try { fs.unlinkSync(tmp); } catch (_) {}
        }
    }
}

/**
 * 同步保存 JSON（无重试无忙等）：仅用于退出前 flushActivity 刷盘。
 */
export function saveJSONSync(filePath: string, data: any): boolean {
    let tmp: string | null = null;
    try {
        const uniqueId = process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        tmp = filePath + '.' + uniqueId + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        try {
            fs.renameSync(tmp, filePath);
            return true;
        } catch (e) {
            let tmp2: string | null = null;
            try {
                tmp2 = filePath + '.replace-' + uniqueId + '.tmp';
                fs.copyFileSync(tmp, tmp2);
                try {
                    fs.renameSync(tmp2, filePath);
                    return true;
                } catch (e3: any) {
                    try { fs.unlinkSync(tmp2); } catch (_) {}
                    // rename 仍失败：保留原文件不动，返回失败而非非原子覆盖（防数据损坏）
                    console.error('saveJSONSync 失败（rename 降级也失败），保留原文件:', e3.message);
                    return false;
                }
            } catch (e2: any) {
                console.error('saveJSONSync 失败:', e2.message);
                return false;
            } finally {
                if (tmp2 && fs.existsSync(tmp2)) {
                    try { fs.unlinkSync(tmp2); } catch (_) {}
                }
            }
        }
    } catch (err: any) { console.error('saveJSONSync 写入失败:', err.message); return false; }
    finally {
        if (tmp && fs.existsSync(tmp)) {
            try { fs.unlinkSync(tmp); } catch (_) {}
        }
    }
}
