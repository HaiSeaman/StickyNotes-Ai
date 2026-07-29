import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';
import { showToast } from '../common/domUtils.js';

export async function loadRadioConfig(): Promise<void> {
  try {
    const radioConfig = await apiInvoke('radio:load-config');
    stateManager.setState({ radioConfig });
  } catch (err) {
    console.error('[MediaModule] Failed to load radio config:', err);
  }
}

export async function playRadioStation(url: string): Promise<void> {
  try {
    showToast('正在播放电台...');
  } catch (err) {
    console.error('[MediaModule] Failed to play radio:', err);
    showToast('播放电台失败');
  }
}
