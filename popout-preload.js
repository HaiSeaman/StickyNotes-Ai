/* ==================== 小窗口专用 preload ====================
 * 设计目标：在 contextIsolation:true + sandbox:true 的安全隔离模式下，
 * 把便签/待办小窗口所需的最小 IPC 能力通过 contextBridge 暴露给渲染层，
 * 避免渲染层直接 require('electron') 拿到完整 Node.js 能力（防 RCE）。
 *
 * 安全约束：sandbox:true 下 preload 无法 require 相对路径模块（Electron 42 限制），
 * 因此本文件必须自包含，不依赖 shared-preload.js 等外部模块。
 *
 * 暴露 API：
 *   popout.sendInput(data)    —— 把当前输入内容回传主进程（防抖由渲染层做）
 *   popout.sendTodoInput(data) —— 待办事项回传主进程
 *   popout.togglePin(payload) —— 切换置顶状态（'note' 或 'todo'）
 *   popout.onPush(cb)         —— 监听主进程推送的内容更新
 *   popout.onTodoPush(cb)     —— 监听待办推送
 *   popout.onPinChanged(cb)   —— 监听主进程推送的置顶状态变化
 *   popout.close()            —— 关闭当前小窗口
 *   popout.reportLogs(batch)  —— 批量上报日志到主进程（供 overlay-logger.js 使用）
 * ===================================================================== */
const { contextBridge, ipcRenderer } = require('electron');

// 安全包装回调：渲染层回调抛错时不影响 IPC 消息派发
function safeCb(cb) {
    return (_e, data) => {
        try { cb(data); } catch (e) {
            console.warn('[preload cb] 渲染层回调异常:', e && e.message || e);
        }
    };
}

contextBridge.exposeInMainWorld('popout', {
    // 回传输入内容给主进程（主进程再转发给主窗口）
    sendInput: (data) => ipcRenderer.send('popout-note:input', data),
    sendTodoInput: (data) => ipcRenderer.send('popout-todo:input', data),
    // 切换置顶
    togglePin: (payload) => ipcRenderer.invoke('popout:toggle-pin', payload),
    // 关闭窗口
    close: () => ipcRenderer.send('popout:close-current'),
    // 主进程推送内容更新（主窗口内容变了 → 推给小窗口）
    onPush: (cb) => {
        const handler = safeCb(cb);
        ipcRenderer.on('popout-note:push', handler);
        return () => ipcRenderer.removeListener('popout-note:push', handler);
    },
    // 待办推送
    onTodoPush: (cb) => {
        const handler = safeCb(cb);
        ipcRenderer.on('popout-todo:push', handler);
        return () => ipcRenderer.removeListener('popout-todo:push', handler);
    },
    // 置顶状态变化（外部 API 调用时同步 UI）
    onPinChanged: (cb) => {
        const handler = safeCb(cb);
        ipcRenderer.on('popout-pin-changed', handler);
        return () => ipcRenderer.removeListener('popout-pin-changed', handler);
    },
    // 批量上报日志（供 overlay-logger.js 的 setupOverlayLogging 使用）
    reportLogs: (batch) => ipcRenderer.invoke('log:report', batch),
});
