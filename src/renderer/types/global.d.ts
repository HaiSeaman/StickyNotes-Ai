/* ==================== 全局类型声明 ====================
 * 声明渲染层的全局变量类型：window.api、第三方库（marked/DOMPurify/Howl）等。
 * 方法名已显式声明，返回值保持 any 以兼容实际 IPC handler 的多变返回类型。
 * =============================================== */

interface Window {
    api: {
        [key: string]: (...args: any[]) => Promise<any> | any;
    };
    marked: any;
    DOMPurify: any;
    Howl: any;
    Howler: any;
    setupOverlayLogging: (opts: any) => void;
    popout: any;
}
