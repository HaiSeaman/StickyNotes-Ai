import { loadNotes } from './modules/notes.js';
import { loadTodos } from './modules/todos.js';
import { loadSettings } from './modules/settings.js';
import { loadAiConfig } from './modules/ai.js';
import { loadRadioConfig } from './modules/media.js';
import { loadActivityData } from './modules/calendar.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Renderer] Initializing TypeScript renderer application...');
  await Promise.all([
    loadNotes(),
    loadTodos(),
    loadSettings(),
    loadAiConfig(),
    loadRadioConfig(),
    loadActivityData()
  ]);
  console.log('[Renderer] Application initialized successfully');
});
