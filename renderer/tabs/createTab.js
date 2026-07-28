/* ==================== createTab.js ====================
 * AI 创作 Tab 渲染与逻辑控制模块
 * 功能支持：
 *   1. AI 内容生成（文本生成、图片生成、视频生成与提示词 AI 优化）
 * 暴露全局接口：window.CreateTabModule
 * ====================================================== */

(function () {
    'use strict';

    // 模块状态
    let state = {
        mode: 'image', // 'image' | 'video' | 'text'
        lastGeneratedContent: '',
        lastGeneratedType: '', // 'image' | 'video' | 'text'
        isGenerating: false,
        inited: false
    };

    // DOM 元素引用集合
    let els = {};

    /**
     * 安全工具：获取或创建 DOM 元素
     */
    function $(id) {
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    /**
     * 辅助 Toast 提示或状态文本更新
     */
    function showToast(message, isError = false) {
        console.log(`[CreateTab] ${isError ? 'ERROR' : 'INFO'}: ${message}`);
        if (els.placeholder) {
            els.placeholder.textContent = message;
            els.placeholder.style.display = 'block';
            els.placeholder.style.color = isError ? '#e53e3e' : '';
        }
    }

    /**
     * 初始化 DOM 元素
     */
    function initDOMReferences() {
        els = {
            tabCreate: $('tab-create'),
            createDisplay: $('createDisplay'),
            createPlaceholder: $('createPlaceholder'),
            createImage: $('createImage'),
            createVideo: $('createVideo'),
            createPrompt: $('createPrompt'),
            uploadPreview: $('uploadPreview'),
            uploadPreviewImg: $('uploadPreviewImg'),
            uploadFilename: $('uploadFilename'),
            uploadClose: $('uploadClose'),
            createModelSelect: $('createModelSelect'),
            createModeImageBtn: $('createModeImageBtn'),
            createModeVideoBtn: $('createModeVideoBtn'),
            createVideoDuration: $('createVideoDuration'),
            createVideoRatio: $('createVideoRatio'),
            createSize: $('createSize'),
            createOptimizeBtn: $('createOptimizeBtn'),
            createUploadBtn: $('createUploadBtn'),
            createFileInput: $('createFileInput'),
            createCopyBtn: $('createCopyBtn'),
            createGenBtn: $('createGenBtn')
        };
    }

    /**
     * 模式切换（图片生成 / 视频生成）
     */
    function setMode(mode) {
        state.mode = mode;
        if (mode === 'video') {
            if (els.createModeImageBtn) els.createModeImageBtn.classList.remove('active');
            if (els.createModeVideoBtn) els.createModeVideoBtn.classList.add('active');
            if (els.createPrompt) els.createPrompt.placeholder = '输入视频描述提示词 (Prompt)...';
            if (els.createVideoDuration) els.createVideoDuration.style.display = '';
            if (els.createVideoRatio) els.createVideoRatio.style.display = '';
            if (els.createSize) els.createSize.style.display = 'none';
        } else if (mode === 'image') {
            if (els.createModeVideoBtn) els.createModeVideoBtn.classList.remove('active');
            if (els.createModeImageBtn) els.createModeImageBtn.classList.add('active');
            if (els.createPrompt) els.createPrompt.placeholder = '输入图片描述提示词 (Prompt)...';
            if (els.createVideoDuration) els.createVideoDuration.style.display = 'none';
            if (els.createVideoRatio) els.createVideoRatio.style.display = 'none';
            if (els.createSize) els.createSize.style.display = '';
        }
    }

    /**
     * AI 内容生成（支持图片、视频与文本）
     */
    async function generateContent() {
        if (!els.createPrompt) return;
        const rawPrompt = els.createPrompt.value.trim();
        if (!rawPrompt) {
            showToast('请先输入提示词', true);
            els.createPrompt.focus();
            return;
        }

        let finalPrompt = rawPrompt;

        state.isGenerating = true;
        if (els.createGenBtn) {
            els.createGenBtn.disabled = true;
            els.createGenBtn.textContent = '生成中...';
        }

        showToast(state.mode === 'video' ? '🎬 视频生成中，预计需要 1-5 分钟，请耐心等待...' : '🔄 AI 内容生成中...');

        if (els.createImage) els.createImage.style.display = 'none';
        if (els.createVideo) els.createVideo.style.display = 'none';
        if (els.createCopyBtn) els.createCopyBtn.style.display = 'none';

        try {
            const imgData = (els.uploadPreview && els.uploadPreview.style.display !== 'none' && els.uploadPreviewImg && els.uploadPreviewImg.src && els.uploadPreviewImg.src.indexOf('data:') === 0) ? els.uploadPreviewImg.src : null;

            if (state.mode === 'video') {
                const duration = parseInt(els.createVideoDuration ? els.createVideoDuration.value : '5', 10) || 5;
                const ratio = (els.createVideoRatio ? els.createVideoRatio.value.trim() : '') || '16:9';
                const modelType = els.createModelSelect ? els.createModelSelect.value : 't2v';

                if (window.api && window.api.generateVideo) {
                    const videoPath = await window.api.generateVideo({
                        prompt: finalPrompt,
                        imageData: imgData,
                        duration: duration,
                        ratio: ratio,
                        modelType: modelType
                    });
                    
                    if (typeof videoPath === 'string' && videoPath) {
                        const srcUrl = videoPath.startsWith('http') || videoPath.startsWith('file://') ? videoPath : 'file:///' + videoPath.replace(/\\/g, '/');
                        if (els.createVideo) {
                            els.createVideo.src = srcUrl;
                            els.createVideo.style.display = 'block';
                        }
                        state.lastGeneratedContent = srcUrl;
                        state.lastGeneratedType = 'video';
                        if (els.createPlaceholder) els.createPlaceholder.style.display = 'none';
                    }
                } else {
                    throw new Error('当前环境暂不支持视频生成 IPC API');
                }
            } else if (state.mode === 'image') {
                const sz = (els.createSize ? els.createSize.value.trim() : '') || 'auto';
                if (window.api && window.api.generateImage) {
                    const imgUrl = await window.api.generateImage({
                        prompt: finalPrompt,
                        imageData: imgData,
                        size: sz
                    });
                    if (els.createImage) {
                        els.createImage.src = imgUrl;
                        els.createImage.style.display = 'block';
                    }
                    state.lastGeneratedContent = imgUrl;
                    state.lastGeneratedType = 'image';
                    if (els.createPlaceholder) els.createPlaceholder.style.display = 'none';
                    if (els.createCopyBtn) els.createCopyBtn.style.display = 'inline-flex';
                } else {
                    throw new Error('当前环境暂不支持图片生成 IPC API');
                }
            } else {
                // 文本生成模式
                if (window.api && window.api.generateContent) {
                    const textResult = await window.api.generateContent(finalPrompt);
                    state.lastGeneratedContent = textResult;
                    state.lastGeneratedType = 'text';
                    showToast(textResult);
                } else {
                    throw new Error('当前环境暂不支持文本生成 IPC API');
                }
            }
        } catch (err) {
            showToast('生成失败: ' + (err.message || err), true);
        } finally {
            state.isGenerating = false;
            if (els.createGenBtn) {
                els.createGenBtn.disabled = false;
                els.createGenBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle" aria-hidden="true"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>生成`;
            }
        }
    }

    /**
     * 提示词 AI 优化
     */
    async function optimizePrompt() {
        if (!els.createPrompt) return;
        const prompt = els.createPrompt.value.trim();
        if (!prompt) {
            els.createPrompt.focus();
            return;
        }

        if (els.createOptimizeBtn) {
            els.createOptimizeBtn.disabled = true;
            els.createOptimizeBtn.textContent = '优化中...';
        }

        try {
            if (window.api && window.api.generateContent) {
                const optText = await window.api.generateContent(
                    '请优化以下AI生成提示词，使其更详细、更具表现力、画面感更丰富，只返回优化后的提示词内容，不要包含额外解释：\n\n' + prompt
                );
                els.createPrompt.value = optText || prompt;
                els.createPrompt.focus();
            } else {
                showToast('无法调用提示词优化接口', true);
            }
        } catch (err) {
            showToast('优化提示词失败: ' + err.message, true);
        } finally {
            if (els.createOptimizeBtn) {
                els.createOptimizeBtn.disabled = false;
                els.createOptimizeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle" aria-hidden="true"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0 1.3-1.3L12 3z"/></svg>优化`;
            }
        }
    }

    /**
     * 绑定事件监听
     */
    function bindEvents() {
        // 优化提示词按钮
        if (els.createOptimizeBtn) {
            els.createOptimizeBtn.addEventListener('click', optimizePrompt);
        }

        // 开始生成按钮
        if (els.createGenBtn) {
            els.createGenBtn.addEventListener('click', generateContent);
        }
    }

    /**
     * 模块初始化入口
     */
    function init() {
        if (state.inited) return;
        initDOMReferences();
        bindEvents();
        state.inited = true;
        console.log('[CreateTabModule] 初始化完成');
    }

    // DOMReady 自动挂载与初始化
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    /* ==================== 暴露 window.CreateTabModule 全局对象 ==================== */
    const CreateTabModule = {
        init,
        setMode,
        generateContent,
        optimizePrompt,
        getState: () => ({ ...state }),
        onTabActivated: () => {
            initDOMReferences();
        },
        onTabDeactivated: () => {}
    };

    if (typeof window !== 'undefined') {
        window.CreateTabModule = CreateTabModule;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CreateTabModule;
    }
})();