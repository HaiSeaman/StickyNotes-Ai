import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';

export async function loadActivityData(): Promise<void> {
  try {
    const activity = await apiInvoke('activity:load');
    stateManager.setState({ activity });
  } catch (err) {
    console.error('[CalendarModule] Failed to load activity data:', err);
  }
}
