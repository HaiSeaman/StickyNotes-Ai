/**
 * 通用系统相关 IPC 管道
 */
const { ipcMain, dialog } = require('electron');

/**
 * 注册通用系统 IPC 通道
 * @param {Object|Function} optionsOrGetMainWindow - 依赖对象或获取主窗口函数
 * @param {Function} [loadSettings] - 加载设置函数
 * @param {Function} [persistSettings] - 保存设置函数
 */
function registerSystemIpc(optionsOrGetMainWindow, loadSettings, persistSettings) {
    let getMainWindow;
    let loadFn = loadSettings;
    let persistFn = persistSettings;

    if (typeof optionsOrGetMainWindow === 'function') {
        getMainWindow = optionsOrGetMainWindow;
    } else if (optionsOrGetMainWindow && typeof optionsOrGetMainWindow === 'object') {
        getMainWindow = typeof optionsOrGetMainWindow.getMainWindow === 'function'
            ? optionsOrGetMainWindow.getMainWindow
            : () => optionsOrGetMainWindow.mainWindow;
        loadFn = optionsOrGetMainWindow.loadSettings || loadFn;
        persistFn = optionsOrGetMainWindow.persistSettings || persistFn;
    } else {
        getMainWindow = () => null;
    }

    const load = typeof loadFn === 'function' ? loadFn : () => ({});
    const persist = typeof persistFn === 'function' ? persistFn : () => {};

    // 选择文件夹
    ipcMain.handle('select-folder', async () => {
        const win = getMainWindow ? getMainWindow() : null;
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });
}

module.exports = { registerSystemIpc };
