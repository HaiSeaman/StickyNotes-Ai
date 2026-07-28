/**
 * 便签与存储相关 IPC 管道
 */
const { ipcMain } = require('electron');

function registerNotesIpc(jsonIo, paths) {
    ipcMain.handle('notes:read', async () => {
        try {
            return await jsonIo.readJSON(paths.notesPath) || [];
        } catch (e) {
            console.error('读取便签失败:', e);
            return [];
        }
    });

    ipcMain.handle('notes:write', async (_event, notes) => {
        try {
            return await jsonIo.saveJSON(paths.notesPath, notes);
        } catch (e) {
            console.error('保存便签失败:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('todos:read', async () => {
        try {
            return await jsonIo.readJSON(paths.todosPath) || [];
        } catch (e) {
            console.error('读取待办失败:', e);
            return [];
        }
    });

    ipcMain.handle('todos:write', async (_event, todos) => {
        try {
            return await jsonIo.saveJSON(paths.todosPath, todos);
        } catch (e) {
            console.error('保存待办失败:', e);
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerNotesIpc };
