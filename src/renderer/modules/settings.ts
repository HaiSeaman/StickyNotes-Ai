import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';
import { showToast } from '../common/domUtils.js';

export async function loadSettings(): Promise<void> {
  try {
    const settings = await apiInvoke('settings:load');
    stateManager.setState({ settings });
  } catch (err) {
    console.error('[SettingsModule] Failed to load settings:', err);
  }
}

export async function saveSettings(settings: any): Promise<void> {
  try {
    await apiInvoke('settings:save', settings);
    stateManager.setState({ settings });
    showToast('偏好设置已保存');
  } catch (err) {
    console.error('[SettingsModule] Failed to save settings:', err);
    showToast('保存偏好设置失败');
  }
}
