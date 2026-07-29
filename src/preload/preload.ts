import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannelMap } from '../types/ipc.js';

export const electronAPI = {
  invoke<K extends keyof IpcChannelMap>(
    channel: K,
    ...args: Parameters<IpcChannelMap[K]>
  ): Promise<ReturnType<IpcChannelMap[K]>> {
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel: string, listener: (...args: any[]) => void) {
    const subscription = (_event: any, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
