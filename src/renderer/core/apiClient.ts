import { IpcChannelMap } from '../../types/ipc.js';

declare global {
  interface Window {
    electronAPI?: {
      invoke<K extends keyof IpcChannelMap>(
        channel: K,
        ...args: Parameters<IpcChannelMap[K]>
      ): Promise<ReturnType<IpcChannelMap[K]>>;
      on(channel: string, listener: (...args: any[]) => void): () => void;
    };
  }
}

export async function apiInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: Parameters<IpcChannelMap[K]>
): Promise<ReturnType<IpcChannelMap[K]>> {
  if (window.electronAPI?.invoke) {
    return window.electronAPI.invoke(channel, ...args);
  }
  throw new Error(`[ApiClient] electronAPI is not available for channel: ${String(channel)}`);
}
