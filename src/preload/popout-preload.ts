import { contextBridge, ipcRenderer } from 'electron';

function safeCb(cb: (data: any) => void) {
  return (_e: any, data: any) => {
    try {
      cb(data);
    } catch (e: any) {
      console.warn('[preload cb] 渲染层回调异常:', (e && e.message) || e);
    }
  };
}

export const popout = {
  sendInput: (data: any) => ipcRenderer.send('popout-note:input', data),
  sendTodoInput: (data: any) => ipcRenderer.send('popout-todo:input', data),
  togglePin: (payload: any) => ipcRenderer.invoke('popout:toggle-pin', payload),
  close: () => ipcRenderer.send('popout:close-current'),
  onPush: (cb: (data: any) => void) => {
    const handler = safeCb(cb);
    ipcRenderer.on('popout-note:push', handler);
    return () => ipcRenderer.removeListener('popout-note:push', handler);
  },
  onTodoPush: (cb: (data: any) => void) => {
    const handler = safeCb(cb);
    ipcRenderer.on('popout-todo:push', handler);
    return () => ipcRenderer.removeListener('popout-todo:push', handler);
  },
  onPinChanged: (cb: (data: any) => void) => {
    const handler = safeCb(cb);
    ipcRenderer.on('popout-pin-changed', handler);
    return () => ipcRenderer.removeListener('popout-pin-changed', handler);
  },
  reportLogs: (batch: any) => ipcRenderer.invoke('log:report', batch)
};

contextBridge.exposeInMainWorld('popout', popout);
