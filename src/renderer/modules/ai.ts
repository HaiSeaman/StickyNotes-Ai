import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';
import { showToast } from '../common/domUtils.js';

export async function loadAiConfig(): Promise<void> {
  try {
    const aiConfig = await apiInvoke('ai:load-config');
    stateManager.setState({ aiConfig });
  } catch (err) {
    console.error('[AiModule] Failed to load AI config:', err);
  }
}

export async function saveAiConfig(aiConfig: any): Promise<void> {
  try {
    await apiInvoke('ai:save-config', aiConfig);
    stateManager.setState({ aiConfig });
    showToast('AI 配置已更新');
  } catch (err) {
    console.error('[AiModule] Failed to save AI config:', err);
    showToast('保存 AI 配置失败');
  }
}

export async function sendAiChat(userContent: string): Promise<string> {
  try {
    const res = await apiInvoke('ai:chat', { messages: [{ role: 'user', content: userContent }] });
    return String(res);
  } catch (err) {
    console.error('[AiModule] AI Chat failed:', err);
    throw err;
  }
}
