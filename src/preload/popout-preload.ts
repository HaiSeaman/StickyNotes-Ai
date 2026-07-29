import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannelMap } from '../types/ipc.js';

export const popoutAPI = {
  invoke<K extends keyof IpcChannelMap>(
    channel: K,
    ...args: Parameters<IpcChannelMap[K]>
  ): Promise<ReturnType<IpcChannelMap[K]>> {
    return ipcRenderer.invoke(channel, ...args);
  }
};

contextBridge.exposeInMainWorld('popoutAPI', popoutAPI);
