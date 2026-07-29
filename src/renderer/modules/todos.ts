import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';
import { showToast } from '../common/domUtils.js';

export async function loadTodos(): Promise<void> {
  try {
    const todoGroups = await apiInvoke('todos:load');
    stateManager.setState({ todoGroups });
  } catch (err) {
    console.error('[TodosModule] Failed to load todos:', err);
    showToast('加载待办数据失败');
  }
}

export async function saveTodos(todoGroups: any[]): Promise<void> {
  try {
    await apiInvoke('todos:save', todoGroups);
    stateManager.setState({ todoGroups });
  } catch (err) {
    console.error('[TodosModule] Failed to save todos:', err);
    showToast('保存待办数据失败');
  }
}
