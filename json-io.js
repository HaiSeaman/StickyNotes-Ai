/* ==================== json-io.js ====================
 * JSON 文件读写模块：原子写入 + 损坏文件自动备份 + Windows EPERM 重试。
 * 从 main.js 提取，所有持久化数据（便签/聊天/设置/日历/活跃度）统一经此模块落盘。
 * console 调用会被 logger.js 劫持旁路记录，无需额外处理。
 * =============================================== */
const fs = require('fs');

/**
 * 同步读取 JSON 文件。
 * - 文件不存在（ENOENT）：返回 fallback，不报错
 * - 解析失败（损坏）：自动备份为 .corrupt-<ts> 文件后返回 fallback
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
 * 异步保存 JSON 文件（原子写入 + Windows EPERM 重试 + 跨卷降级）。
 * - writeFile 与重试等待均走事件循环，不阻塞主进程（IPC/闹钟/定时器正常响应）
 * - 原子写入：先写 .tmp 临时文件再 rename，避免写到一半崩溃导致数据损坏
 * - Windows 上 rename 可能因杀软扫描/OneDrive 同步/文件索引占用而抛 EPERM
 *   重试 3 次（间隔 50ms / 150ms / 250ms 递增），仍失败则降级为 copy+unlink（跨分区兼容）
 * @param {string} filePath - 目标 JSON 文件绝对路径
 * @param {*} data - 待序列化的对象
 * @returns {Promise<boolean>} 是否写入成功
 */
async function saveJSON(filePath, data) {
    try {
        const tmp = filePath + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                fs.renameSync(tmp, filePath);  // rename 是元数据操作，本身不阻塞
                return true;
            } catch (e) {
                lastErr = e;
                if (e.code !== 'EPERM' && e.code !== 'EACCES' && e.code !== 'EBUSY') {
                    // 非权限/占用类错误，不重试
                    break;
                }
                // 异步等待后重试（50ms / 150ms / 250ms），不阻塞事件循环
                const wait = 50 * (attempt + 1);
                await new Promise(r => setTimeout(r, wait));
            }
        }
        // 降级：copy + unlink（rename 在跨卷/占用时失败时的兜底）
        try {
            fs.copyFileSync(tmp, filePath);
            try { fs.unlinkSync(tmp); } catch (_) {}
            return true;
        } catch (e2) {
            console.error('写 JSON 失败（rename 重试与降级均失败）:', e2.message, '原始错误:', lastErr && lastErr.message);
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
            return false;
        }
    } catch (err) { console.error('写 JSON 失败:', err.message); return false; }
}

/**
 * 同步保存 JSON（无重试无忙等）：仅用于退出前 flushActivity 刷盘，快速完成不阻塞事件循环。
 * @param {string} filePath - 目标 JSON 文件绝对路径
 * @param {*} data - 待序列化的对象
 * @returns {boolean} 是否写入成功
 */
function saveJSONSync(filePath, data) {
    try {
        const tmp = filePath + '.tmp';
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

module.exports = { loadJSON, saveJSON, saveJSONSync };
