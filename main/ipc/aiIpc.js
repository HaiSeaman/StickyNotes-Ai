/**
 * AI 服务相关 IPC 管道
 */
const { ipcMain } = require('electron');

function registerAiIpc(aiService, windowManager) {
    ipcMain.handle('ai:chat', async (_event, params) => {
        try {
            return await aiService.chat(params);
        } catch (e) {
            return { error: e.message || 'AI 请求失败' };
        }
    });

    ipcMain.handle('ai:chatStream', async (event, params) => {
        try {
            const senderWindow = event.sender;
            return await aiService.chatStream(params, (chunk) => {
                if (!senderWindow.isDestroyed()) {
                    senderWindow.send('ai:chatChunk', chunk);
                }
            });
        } catch (e) {
            return { error: e.message || '流式请求异常' };
        }
    });

    ipcMain.handle('ai:create', async (_event, params) => {
        try {
            return await aiService.createContent(params);
        } catch (e) {
            return { error: e.message || '创作失败' };
        }
    });

    ipcMain.handle('ai:save-config', async (_event, config) => {
        try {
            return await aiService.saveConfig(config);
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('ai:load-config', async () => {
        try {
            return await aiService.loadConfig();
        } catch (e) {
            return { error: e.message };
        }
    });
}

module.exports = { registerAiIpc };
