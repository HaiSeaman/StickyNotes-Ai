/* ==================== 全局类型声明 ====================
 * 声明渲染层的全局变量类型：window.api、第三方库（marked/DOMPurify/Howl）等。
 * 注意：RendererUtils/AppConstants 已改为 ES module import，不再走全局变量。
 * =============================================== */

// preload.ts 通过 contextBridge.exposeInMainWorld('api', ...) 暴露的 API
// 使用宽松类型（any），后续可逐步收紧
interface Window {
    api: any;
    marked: any;
    DOMPurify: any;
    Howl: any;
    Howler: any;
    setupOverlayLogging: (opts: any) => void;
    popout: any;
}
