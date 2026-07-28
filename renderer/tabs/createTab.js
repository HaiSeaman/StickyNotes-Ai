/* ==================== createTab.js ====================
 * AI 创作 Tab 渲染与逻辑控制模块
 * 功能支持：
 *   1. AI 内容生成（文本生成、图片生成、视频生成与提示词 AI 优化）
 *   2. 角色模版切换（全能助手、文案大师、编程专家、提炼专家、小红书博主、周报生成器、翻译官等）
 *   3. 一键保存生成内容/提示词为桌面便签 (Save as Sticky Note)
 * 暴露全局接口：window.CreateTabModule
 * ====================================================== */

(function () {
    'use strict';

    // 默认预设角色模版列表
    const DEFAULT_ROLES = [
        { id: 'custom', name: '✏️ 自定义角色', icon: '✏️', prompt: '' },
        { id: 'assistant', name: '💡 全能助手', icon: '💡', prompt: '你是一个高效、专业的全能个人助手。请简明遏要、条理清晰地回答用户的问题。' },
        { id: 'writer', name: '✍️ 文案大师', icon: '✍️', prompt: '你是一位精通文字创作、文案策划和排版美化的资深编辑。请用极具感染力和优雅文采的语言创作。' },
        { id: 'coder', name: '💻 编程专家', icon: '💻', prompt: '你是一位高级软件工程师。请提供简洁、高效、规范的代码架构与解决方案，重点指出逻辑与潜在 BUG。' },
        { id: 'summarizer', name: '📝 提炼专家', icon: '📝', prompt: '你是一位精通速读与信息提炼的高手。请用 Markdown 列表与核心要点总结用户输入的内容。' },
        { id: 'xiaohongshu', name: '📱 小红书博主', icon: '📱', prompt: '你是一位爆款小红书博主。请用活泼吸引人的语气、恰当的 Emoji 符号和热门标签创作具有极强种草效果的文案。' },
        { id: 'weekly', name: '📅 周报生成器', icon: '📅', prompt: '你是一位职场周报与工作总结专家。请将输入的工作要点整理为结构严谨、重点突出的周报（包含：本周进展、下周计划、风险与支持）。' },
        { id: 'translator', name: '🔤 英语翻译官', icon: '🔤', prompt: '你是一位精通多语言的同声传译与高级翻译官。请提供信达雅的翻译结果，并附带重点词汇说明。' },
        { id: 'designer', name: '🎨 创意设计顾问', icon: '🎨', prompt: '你是一位视觉设计与艺术指导大师。请针对用户提出的需求，给出画面构图、色彩搭配、视觉风格描述及 AI 绘画 Prompt。' }
    ];

    // 模块状态
    let state = {
        mode: 'image', // 'image' | 'video' | 'text'
        currentRoleId: 'custom',
        roles: [...DEFAULT_ROLES],
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
     * 生成唯一便签 ID
     */
    function genNoteId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
     * 初始化 DOM 元素与角色下拉选择框
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

        // 挂载/尝试查找或创建角色模版切换下拉框
        ensureRoleSelectElement();
        // 挂载/尝试查找或创建一键保存便签按钮
        ensureSaveAsNoteButton();
    }

    /**
     * 确保页面上有角色模版选择框
     */
    function ensureRoleSelectElement() {
        let roleSelect = $('createRoleSelect');
        if (!roleSelect && els.createPrompt) {
            // 如果不存在，在操作栏插入下拉框
            const createActions = document.querySelector('#tab-create .create-actions');
            if (createActions) {
                roleSelect = document.createElement('select');
                roleSelect.id = 'createRoleSelect';
                roleSelect.className = 'create-model-select create-role-select';
                roleSelect.title = '选择角色模版';
                roleSelect.setAttribute('aria-label', '选择角色模版');
                // 插入到操作栏的最前面
                createActions.insertBefore(roleSelect, createActions.firstChild);
            }
        }

        if (roleSelect) {
            els.createRoleSelect = roleSelect;
            renderRoleOptions();
        }
    }

    /**
     * 渲染角色下拉框选项
     */
    function renderRoleOptions() {
        if (!els.createRoleSelect) return;
        els.createRoleSelect.innerHTML = '';
        state.roles.forEach(role => {
            const opt = document.createElement('option');
            opt.value = role.id;
            opt.textContent = `${role.name}`;
            if (role.id === state.currentRoleId) opt.selected = true;
            els.createRoleSelect.appendChild(opt);
        });
    }

    /**
     * 确保页面上有“保存为便签”按钮
     */
    function ensureSaveAsNoteButton() {
        let saveNoteBtn = $('createSaveNoteBtn');
        if (!saveNoteBtn) {
            const createActions = document.querySelector('#tab-create .create-actions');
            if (createActions) {
                saveNoteBtn = document.createElement('button');
                saveNoteBtn.id = 'createSaveNoteBtn';
                saveNoteBtn.className = 'create-copy-btn create-savenote-btn';
                saveNoteBtn.title = '将生成内容/提示词保存为便签';
                saveNoteBtn.setAttribute('aria-label', '保存为便签');
                saveNoteBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>存为便签`;
                
                // 插入到生成/复制按钮旁
                if (els.createCopyBtn && els.createCopyBtn.parentNode) {
                    els.createCopyBtn.parentNode.insertBefore(saveNoteBtn, els.createCopyBtn.nextSibling);
                } else if (els.createGenBtn && els.createGenBtn.parentNode) {
                    els.createGenBtn.parentNode.insertBefore(saveNoteBtn, els.createGenBtn);
                } else {
                    createActions.appendChild(saveNoteBtn);
                }
            }
        }
        if (saveNoteBtn) {
            els.createSaveNoteBtn = saveNoteBtn;
        }
    }

    /**
     * 角色模版切换逻辑
     * @param {string} roleId
     */
    function switchRole(roleId) {
        const role = state.roles.find(r => r.id === roleId);
        if (!role) return;

        state.currentRoleId = roleId;
        if (els.createRoleSelect) {
            els.createRoleSelect.value = roleId;
        }

        // 如果该角色有预设 prompt 且当前输入框为空或包含旧提示词，自动填入提示词框架
        if (els.createPrompt) {
            if (role.prompt) {
                const currentVal = els.createPrompt.value.trim();
                if (!currentVal || state.roles.some(r => r.prompt === currentVal)) {
                    els.createPrompt.value = role.prompt;
                } else {
                    // 如果已有自定义文本，追加前置角色的系统定位说明
                    els.createPrompt.placeholder = `【${role.name}】${role.prompt}`;
                }
            }
        }
    }

    /**
     * 模式切换（图片生成 / 视频生成 / 文本对话）
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
            showToast('请先输入提示词或选中角色范例', true);
            els.createPrompt.focus();
            return;
        }

        const role = state.roles.find(r => r.id === state.currentRoleId);
        let finalPrompt = rawPrompt;
        // 如果使用了特定角色模版且不是自定义角色，拼合角色定位
        if (role && role.prompt && !rawPrompt.includes(role.prompt)) {
            finalPrompt = `[角色设定: ${role.name}]\n${role.prompt}\n\n[用户需求]: ${rawPrompt}`;
        }

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
                // 文本生成模式 / 角色文本生成
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
                els.createOptimizeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle" aria-hidden="true"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>优化`;
            }
        }
    }

    /**
     * 一键保存生成内容/提示词为桌面便签
     * @param {string} [customContent] - 自定义内容，如果为空则自动从当前创作状态获取
     */
    async function saveAsNote(customContent) {
        let noteText = '';
        if (customContent && typeof customContent === 'string') {
            noteText = customContent.trim();
        } else {
            // 自动判断并构造便签内容
            const role = state.roles.find(r => r.id === state.currentRoleId);
            const promptVal = els.createPrompt ? els.createPrompt.value.trim() : '';

            let header = role && role.id !== 'custom' ? `📌 [AI 创作 - ${role.name}]\n` : '📌 [AI 创作记录]\n';

            if (state.lastGeneratedContent) {
                if (state.lastGeneratedType === 'image') {
                    noteText = `${header}提示词：${promptVal}\n\n![AI生成图片](${state.lastGeneratedContent})`;
                } else if (state.lastGeneratedType === 'video') {
                    noteText = `${header}提示词：${promptVal}\n\n🎬 视频链接: ${state.lastGeneratedContent}`;
                } else {
                    noteText = `${header}${state.lastGeneratedContent}`;
                }
            } else if (promptVal) {
                noteText = `${header}提示词灵感：\n${promptVal}`;
            } else {
                showToast('便签内容为空，请先输入提示词或生成 AI 内容', true);
                return false;
            }
        }

        try {
            const newNote = {
                id: genNoteId(),
                content: noteText,
                todos: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // 优先挂载到全局 notes 数组
            if (typeof window !== 'undefined') {
                if (Array.isArray(window.notes)) {
                    window.notes.unshift(newNote);
                } else {
                    window.notes = [newNote];
                }

                // 触发保存到磁盘与 UI 刷新
                if (typeof window.saveNotesToDisk === 'function') {
                    await window.saveNotesToDisk();
                } else if (window.api && window.api.saveNotes) {
                    await window.api.saveNotes(window.notes);
                }

                // 如果渲染进程有便签列表渲染方法
                if (typeof window.renderNotesList === 'function') {
                    window.renderNotesList();
                }
            }

            // 更新按钮文本或 Toast 效果
            if (els.createSaveNoteBtn) {
                const origText = els.createSaveNoteBtn.innerHTML;
                els.createSaveNoteBtn.textContent = '✓ 已保存为便签';
                setTimeout(() => {
                    els.createSaveNoteBtn.innerHTML = origText;
                }, 1800);
            }

            showToast('已成功创建新便签！');
            return true;
        } catch (err) {
            console.error('[CreateTab] 保存便签失败:', err);
            showToast('保存便签失败: ' + err.message, true);
            return false;
        }
    }

    /**
     * 绑定事件监听
     */
    function bindEvents() {
        // 角色下拉框切换
        if (els.createRoleSelect) {
            els.createRoleSelect.addEventListener('change', (e) => {
                switchRole(e.target.value);
            });
        }

        // 保存为便签按钮点击
        if (els.createSaveNoteBtn) {
            els.createSaveNoteBtn.addEventListener('click', () => saveAsNote());
        }

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
        switchRole,
        generateContent,
        optimizePrompt,
        saveAsNote,
        getRoles: () => [...state.roles],
        addRole: (role) => {
            if (role && role.id && role.name) {
                state.roles.push(role);
                renderRoleOptions();
            }
        },
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
