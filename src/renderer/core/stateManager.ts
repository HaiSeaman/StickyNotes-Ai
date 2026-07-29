import { Note, TodoGroup, ActivityData, UserSettings, RadioConfig, AiConfig } from '../../types/index.js';

export interface AppState {
  notes: Note[];
  todoGroups: TodoGroup[];
  activity?: ActivityData;
  settings?: UserSettings;
  radioConfig?: RadioConfig;
  aiConfig?: AiConfig;
}

export class StateManager {
  private state: AppState = {
    notes: [],
    todoGroups: [],
    radioConfig: {
      favorites: [],
      customStations: []
    },
    aiConfig: {
      provider: 'openai',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      baseUrl: 'https://api.openai.com/v1'
    }
  };

  public getState(): AppState {
    return this.state;
  }

  public setState(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
  }
}

export const stateManager = new StateManager();
