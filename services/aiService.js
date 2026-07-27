/**
 * AI 服务逻辑解耦封装
 */
const { safeFetch, assertPayloadSize } = require('../security');
const { trimTrailingSlash } = require('../shared-utils');

let activeChatControllers = new Map();

function registerAiHandlers({
    ipcMain,
    loadSettings,
    persistSettings,
    validateAiBaseUrl,
    isMaskedCred,
    encryptSecret,
    decryptSecret,
    maskCred,
    extractHttpError,
    withDecryptedKey,
    MAX_IPC_PAYLOAD_SIZE,
    getMainWindow,
    saveCustomImageSize,
    loadCustomImageSize,
    saveImageGenConfig,
    loadImageGenConfig,
    generateImage,
    generateVideo,
    abortVideoGen
}) {
    // 保存 AI 配置
    ipcMain.handle('ai:save-config', async (_event, config) => {
        const s = loadSettings();
        if (!s.aiConfig) s.aiConfig = {};
        validateAiBaseUrl(config.baseUrl, 'AI API 地址');
        const oldEncryptedKey = s.aiConfig.encryptedKey;
        s.aiConfig.baseUrl = config.baseUrl || '';
        s.aiConfig.encryptedKey = isMaskedCred(config.apiKey) ? oldEncryptedKey : await encryptSecret(config.apiKey, 'API Key');
        s.aiConfig.model = config.model || '';
        s.aiConfig.temperature = config.temperature ?? 1;
        s.aiConfig.prompt = config.prompt || '';
        return persistSettings();
    });

    // 加载 AI 配置
    ipcMain.handle('ai:load-config', async () => {
        const s = loadSettings();
        const cfg = s.aiConfig || {};
        let apiKey = '';
        try { apiKey = maskCred(await decryptSecret(cfg.encryptedKey, 'API Key')); } catch (e) {
            console.error('加载 API Key 失败:', e.message);
        }
        return {
            baseUrl: cfg.baseUrl || '',
            apiKey: apiKey,
            model: cfg.model || '',
            temperature: cfg.temperature ?? 1,
            prompt: cfg.prompt || '',
        };
    });

    // 获取模型列表
    ipcMain.handle('ai:fetch-models', async (_event, baseUrl, apiKey) => {
        validateAiBaseUrl(baseUrl, 'API 地址');
        const s = loadSettings();
        const savedBaseUrl = s.aiConfig && s.aiConfig.baseUrl;
        if (savedBaseUrl && trimTrailingSlash(savedBaseUrl) !== trimTrailingSlash(baseUrl)) {
            throw new Error('传入的 API 地址与已保存配置不一致，请先保存设置');
        }
        let actualKey = apiKey;
        if (isMaskedCred(apiKey)) {
            const cfg = s.aiConfig || {};
            try { actualKey = await decryptSecret(cfg.encryptedKey, 'API Key'); }
            catch (e) { throw new Error('无法读取已保存的 API Key，请重新输入。'); }
        }
        try {
            const url = trimTrailingSlash(baseUrl) + '/models';
            const response = await safeFetch(url, {
                headers: { 'Authorization': `Bearer ${actualKey}` },
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(await extractHttpError(response));
            }
            const data = await response.json();
            const models = (data.data || []).map(m => m.id).sort();
            return models;
        } finally {
            actualKey = null;
        }
    });

    // AI 中止
    ipcMain.handle('ai:abort-chat', (event) => {
        const senderId = event.sender.id;
        if (activeChatControllers.has(senderId)) {
            activeChatControllers.get(senderId).abort();
            activeChatControllers.delete(senderId);
            return { success: true };
        }
        return { success: false, message: '无正在进行的对话' };
    });
}

module.exports = {
    registerAiHandlers,
    activeChatControllers
};
