/* ==================== json-io.js ====================
 * JSON 文件读写模块：原子写入 + 损坏文件自动备份 + Windows EPERM 重试。
 * 从 main.js 提取，所有持久化数据（便签/聊天/设置/日历/活跃度）统一经此模块落盘。
 * console 调用会被 logger.js 劫持旁路记录，无需额外处理。
 * =============================================== */
const fs = require('fs');
const crypto = require('crypto');

const fileLocks = new Map();

/**
 * 同步读取 JSON 文件。
 * - 文件不存在（ENOENT）：返回 fallback，不报错
 * - 解析失败（损坏）：自动备份为 .corrupt-<ts> 文件后返回 fallback
 *
 * 仅用于启动时同步初始化（如 settingsCache、activityCache）。
 * IPC handler 等异步场景应使用 loadJSONAsync，避免阻塞主进程事件循环。
 * @param {string} filePath - JSON 文件绝对路径
 * @param {*} fallback - 文件不存在或解析失败时的返回值
 * @returns {*} 解析后的对象或 fallback
 */
function loadJSON(filePath, fallback) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        // 文件存在但解析失败（损坏）：自动备份，方便用户事后找回数据
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
 * 行为与 loadJSON 完全一致：ENOENT 返回 fallback，损坏文件自动备份。
 * @param {string} filePath - JSON 文件绝对路径
 * @param {*} fallback - 文件不存在或解析失败时的返回值
 * @returns {Promise<*>} 解析后的对象或 fallback
 */
async function loadJSONAsync(filePath, fallback) {
    let raw;
    try {
        raw = await fs.promises.readFile(filePath, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        console.error('读 JSON 失败:', err.message);
        return fallback;
    }
    try {
        return JSON.parse(raw);
    } catch (parseErr) {
        // 文件存在但解析失败（损坏）：异步备份后返回 fallback
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
async function saveJSON(filePath, data) {
    let task = fileLocks.get(filePath);
    if (!task) {
        task = {
            isWriting: false,
            pendingData: null,
            currentPromise: Promise.resolve()
        };
        fileLocks.set(filePath, task);
    }

    // 记录最新待写入数据
    task.pendingData = data;

    if (task.isWriting) {
        return task.currentPromise;
    }

    task.isWriting = true;
    task.currentPromise = (async () => {
        let lastResult = false;
        while (task.pendingData !== null) {
            const dataToSave = task.pendingData;
            task.pendingData = null; // 消费待写入数据
            lastResult = await doSaveJSON(filePath, dataToSave);
        }
        task.isWriting = false;
        return lastResult;
    })();

    return task.currentPromise;
}

async function doSaveJSON(filePath, data) {
    let tmp = null;
    try {
        const uniqueId = process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        tmp = filePath + '.' + uniqueId + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                fs.renameSync(tmp, filePath);
                return true;
            } catch (e) {
                lastErr = e;
                if (e.code !== 'EPERM' && e.code !== 'EACCES' && e.code !== 'EBUSY') {
                    break;
                }
                const wait = 50 * (attempt + 1);
                await new Promise(r => setTimeout(r, wait));
            }
        }
        // 降级：copy + unlink
        try {
            fs.copyFileSync(tmp, filePath);
            try { fs.unlinkSync(tmp); } catch (_) {}
            return true;
        } catch (e2) {
            console.error('写 JSON 失败（rename 重试与降级均失败）:', e2.message, '原始错误:', lastErr && lastErr.message);
            return false;
        }
    } catch (err) {
        console.error('写 JSON 失败:', err.message);
        return false;
    } finally {
        if (tmp && fs.existsSync(tmp)) {
            try { fs.unlinkSync(tmp); } catch (_) {}
        }
    }
}

/**
 * 同步保存 JSON（无重试无忙等）：仅用于退出前 flushActivity 刷盘，快速完成不阻塞事件循环。
 * @param {string} filePath - 目标 JSON 文件绝对路径
 * @param {*} data - 待序列化的对象
 * @returns {boolean} 是否写入成功
 */
function saveJSONSync(filePath, data) {
    try {
        const uniqueId = process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const tmp = filePath + '.' + uniqueId + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        try {
            fs.renameSync(tmp, filePath);
            return true;
        } catch (e) {
            // rename 失败（占用/跨卷），降级 copy+unlink，不重试（退出场景需快速完成）
            try {
                fs.copyFileSync(tmp, filePath);
                try { fs.unlinkSync(tmp); } catch (_) {}
                return true;
            } catch (e2) {
                console.error('saveJSONSync 失败:', e2.message);
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
                return false;
            }
        }
    } catch (err) { console.error('saveJSONSync 写入失败:', err.message); return false; }
}

module.exports = { loadJSON, loadJSONAsync, saveJSON, saveJSONSync };
