import { apiInvoke } from '../core/apiClient.js';
import { stateManager } from '../core/stateManager.js';
import { showToast } from '../common/domUtils.js';

export async function loadNotes(): Promise<void> {
  try {
    const notes = await apiInvoke('notes:load');
    stateManager.setState({ notes });
  } catch (err) {
    console.error('[NotesModule] Failed to load notes:', err);
    showToast('加载便签失败');
  }
}

export async function saveNote(note: any): Promise<void> {
  try {
    const currentNotes = stateManager.getState().notes;
    const index = currentNotes.findIndex((n) => n.id === note.id);
    let newNotes = [...currentNotes];
    if (index >= 0) {
      newNotes[index] = note;
    } else {
      newNotes.push(note);
    }
    await apiInvoke('notes:save', newNotes);
    stateManager.setState({ notes: newNotes });
  } catch (err) {
    console.error('[NotesModule] Failed to save note:', err);
    showToast('保存便签失败');
  }
}

export async function deleteNote(noteId: string): Promise<void> {
  try {
    const currentNotes = stateManager.getState().notes;
    const newNotes = currentNotes.filter((n) => n.id !== noteId);
    await apiInvoke('notes:save', newNotes);
    stateManager.setState({ notes: newNotes });
  } catch (err) {
    console.error('[NotesModule] Failed to delete note:', err);
    showToast('删除便签失败');
  }
}
