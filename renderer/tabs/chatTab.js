/**
 * renderer/tabs/chatTab.js
 * AI 聊天 Tab 交互与渲染模块
 * 包含聊天消息渲染、Stream 状态管理、清空消息等高内聚逻辑。
 * 支持 window.ChatTabModule。
 */

(function () {
    'use strict';

    // 公共工具函数从 renderer/utils.js 引入（消除与 renderer.js 的重复定义）
    const { pad2, formatChatTime } = window.RendererUtils;

    /**
     * 根据输入文本自动生成会话标题
     * @param {string} text - 消息文本
     * @param {number} maxLen - 最大字数限制
     * @returns {string}
     */
    function genChatTitle(text, maxLen = 20) {
        const t = (text || '').trim().replace(/\s+/g, ' ');
        return t.length > maxLen ? t.slice(0, maxLen) + '…' : (t || '新对话');
    }

    /**
     * 解析消息附件图片的显示 src
     * 优先 dataUrl（旧版兼容）；否则用 chatimg 协议从本地磁盘加载
     * @param {{dataUrl?: string, path?: string}} img
     * @returns {string}
     */
    function resolveImageSrc(img) {
        if (!img) return '';
        if (img.dataUrl) return img.dataUrl;
        if (img.path) return 'chatimg://chat-images/' + encodeURIComponent(img.path);
        return '';
    }

    /**
     * 判断容器 Scroll 是否接近底部
     * @param {HTMLElement} el
     * @param {number} threshold
     * @returns {boolean}
     */
    function isScrolledNearBottom(el, threshold = 40) {
        if (!el) return true;
        return (el.scrollHeight - el.scrollTop - el.clientHeight) <= threshold;
    }

    /**
     * 滚动聊天消息容器到底部
     * @param {HTMLElement} containerEl
     */
    function scrollToBottomOfChat(containerEl) {
        if (!containerEl) return;
        containerEl.scrollTop = containerEl.scrollHeight;
    }

    /**
     * 构建 AI 调用统计信息 DOM（模型 | 耗时 | Token | 一键复制按钮）
     * @param {{model?: string, elapsedSec?: string|number, tokens?: number}} stats
     * @param {string} contentForCopy - 用于复制的原始 AI 回复内容
     * @returns {HTMLDivElement}
     */
    function buildStatsDom(stats, contentForCopy) {
        const el = document.createElement('div');
        el.className = 'chat-msg-stats';
        const tokenStr = (stats && stats.tokens && stats.tokens > 0) ? stats.tokens : '—';
        const elapsed = (stats && stats.elapsedSec !== undefined) ? stats.elapsedSec : '—';
        el.textContent = '当前模型: ' + ((stats && stats.model) || '—') + ' | 耗时: ' + elapsed + 's | 消耗Token: ' + tokenStr;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'chat-copy-btn';
        copyBtn.title = '复制当前 AI 回复';
        copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;pointer-events:none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="chat-copy-text">复制</span>';
        copyBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const text = (contentForCopy !== undefined && contentForCopy !== null) ? String(contentForCopy) : '';
            if (!text) return;
            try {
                if (window.api && typeof window.api.copyTextToClipboard === 'function') {
                    await window.api.copyTextToClipboard(text);
                } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(text);
                }
                const textEl = copyBtn.querySelector('.chat-copy-text');
                const origText = textEl ? textEl.textContent : '';
                if (textEl) textEl.textContent = '已复制';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    if (textEl) textEl.textContent = origText || '复制';
                    copyBtn.classList.remove('copied');
                }, 1200);
            } catch (_) {}
        });
        el.appendChild(copyBtn);
        return el;
    }

    /**
     * 创建单条消息 DOM 节点（包含思考折叠区、图片列表、气泡、统计信息、时间等）
     * @param {Object} msg - 消息数据对象
     * @returns {HTMLDivElement}
     */
    function createMessageDom(msg) {
        const wrap = document.createElement('div');
        wrap.className = 'chat-msg ' + (msg.role === 'user' ? 'user' : 'assistant');

        // 思考过程折叠区（仅 assistant 且有 reasoning）
        if (msg.role === 'assistant' && msg.reasoning) {
            const thinking = document.createElement('div');
            thinking.className = 'chat-thinking';
            const header = document.createElement('div');
            header.className = 'chat-thinking-header';
            header.innerHTML = '<span class="chat-thinking-arrow">▶</span><span>💭 思考过程</span>';
            const body = document.createElement('div');
            body.className = 'chat-thinking-body';
            body.textContent = msg.reasoning;
            header.addEventListener('click', () => thinking.classList.toggle('expanded'));
            thinking.appendChild(header);
            thinking.appendChild(body);
            wrap.appendChild(thinking);
        }

        // 用户消息的附件图片预览
        if (msg.role === 'user' && Array.isArray(msg.images) && msg.images.length > 0) {
            const imgWrap = document.createElement('div');
            imgWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;max-width:82%';
            msg.images.forEach(img => {
                const src = resolveImageSrc(img);
                if (!src) return;
                const im = document.createElement('img');
                im.src = src;
                im.style.cssText = 'max-width:120px;max-height:120px;border-radius:6px;object-fit:cover;cursor:pointer;border:1px solid var(--border)';
                im.title = '点击放大';
                im.addEventListener('click', () => {
                    const w = window.open();
                    if (!w) return;
                    const imgEl = w.document.createElement('img');
                    imgEl.src = src;
                    imgEl.style.cssText = 'max-width:100%;max-height:100%';
                    w.document.body.style.margin = '0';
                    w.document.body.appendChild(imgEl);
                });
                imgWrap.appendChild(im);
            });
            wrap.appendChild(imgWrap);
        }

        // 消息气泡
        const bubble = document.createElement('div');
        bubble.className = 'chat-msg-bubble';
        if (msg.error) bubble.classList.add('error');
        bubble.textContent = msg.content;

        // AI 回复气泡内追加统计信息（模型/耗时/Token + 一键复制按钮）
        if (msg.role === 'assistant' && !msg.error && msg.stats && msg.stats.model) {
            bubble.appendChild(buildStatsDom(msg.stats, msg.content));
        }
        wrap.appendChild(bubble);

        // meta 时间信息
        if (msg.ts) {
            const meta = document.createElement('div');
            meta.className = 'chat-msg-meta';
            meta.textContent = formatChatTime(msg.ts);
            wrap.appendChild(meta);
        }

        return wrap;
    }

    /**
     * 全量渲染消息列表
     * @param {HTMLElement} containerEl - 消息容器 DOM
     * @param {Object} chat - 当前会话数据
     * @param {{titleEl?: HTMLElement}} [options]
     */
    function renderMessages(containerEl, chat, options = {}) {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        if (options.titleEl) {
            options.titleEl.textContent = chat ? (chat.title || '新对话') : '新对话';
        }

        if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.innerHTML = '<div class="chat-empty-icon">💬</div>开始一段新对话吧';
            containerEl.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        chat.messages.forEach(msg => frag.appendChild(createMessageDom(msg)));
        containerEl.appendChild(frag);

        scrollToBottomOfChat(containerEl);

        // 异步图片加载后重新调整滚动位置
        const imgs = containerEl.querySelectorAll('img');
        if (imgs.length > 0) {
            imgs.forEach(im => {
                if (!im.complete) {
                    im.addEventListener('load', () => scrollToBottomOfChat(containerEl), { once: true });
                    im.addEventListener('error', () => scrollToBottomOfChat(containerEl), { once: true });
                }
            });
        }
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottomOfChat(containerEl)));
    }

    /**
     * 增量追加单条消息 DOM
     * @param {HTMLElement} containerEl
     * @param {Object} msg
     */
    function appendMessageDom(containerEl, msg) {
        if (!containerEl) return;
        const empty = containerEl.querySelector('.chat-empty');
        if (empty) empty.remove();
        containerEl.appendChild(createMessageDom(msg));
        containerEl.scrollTop = containerEl.scrollHeight;
    }

    /**
     * 清空消息展示区域
     * @param {HTMLElement} containerEl - 消息容器 DOM
     * @param {{titleEl?: HTMLElement, emptyText?: string}} [options]
     */
    function clearMessages(containerEl, options = {}) {
        if (!containerEl) return;
        containerEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        const text = options.emptyText || '开始一段新对话吧';
        empty.innerHTML = '<div class="chat-empty-icon">💬</div>' + text;
        containerEl.appendChild(empty);

        if (options.titleEl) {
            options.titleEl.textContent = '新对话';
        }
    }

    /**
     * 创建 Stream 流式占位气泡
     * @param {HTMLElement} containerEl
     * @param {boolean} thinkingEnabled
     * @returns {{streamWrap: HTMLDivElement, streamBubble: HTMLDivElement, thinkingEl: HTMLDivElement|null, thinkingBodyEl: HTMLDivElement|null}}
     */
    function createStreamPlaceholder(containerEl, thinkingEnabled) {
        const streamWrap = document.createElement('div');
        streamWrap.className = 'chat-msg assistant';

        let thinkingEl = null;
        let thinkingBodyEl = null;

        if (thinkingEnabled) {
            thinkingEl = document.createElement('div');
            thinkingEl.className = 'chat-thinking expanded';
            const header = document.createElement('div');
            header.className = 'chat-thinking-header';
            header.innerHTML = '<span class="chat-thinking-arrow">▶</span><span>💭 思考过程</span>';
            header.addEventListener('click', () => thinkingEl.classList.toggle('expanded'));

            thinkingBodyEl = document.createElement('div');
            thinkingBodyEl.className = 'chat-thinking-body';
            thinkingBodyEl.textContent = '正在思考...';

            thinkingEl.appendChild(header);
            thinkingEl.appendChild(thinkingBodyEl);
            streamWrap.appendChild(thinkingEl);
        }

        const streamBubble = document.createElement('div');
        streamBubble.className = 'chat-msg-bubble';
        streamBubble.textContent = '正在回复......';
        streamWrap.appendChild(streamBubble);

        if (containerEl) {
            containerEl.appendChild(streamWrap);
            containerEl.scrollTop = containerEl.scrollHeight;
        }

        return { streamWrap, streamBubble, thinkingEl, thinkingBodyEl };
    }

    /**
     * 流式回复结束，就地将占位气泡转正
     * @param {HTMLElement} streamWrap
     * @param {HTMLElement} streamBubble
     * @param {string} finalContent
     * @param {boolean} isError
     * @param {string} finalReasoning
     * @param {Object|null} stats
     * @param {HTMLElement} [containerEl]
     */
    function finalizeStreamDom(streamWrap, streamBubble, finalContent, isError, finalReasoning, stats, containerEl) {
        if (!streamWrap || !streamBubble) return;
        if (isError) streamBubble.classList.add('error');
        streamBubble.textContent = finalContent;

        if (!isError && stats && stats.model) {
            streamBubble.appendChild(buildStatsDom(stats, finalContent));
        }

        const thinking = streamWrap.querySelector('.chat-thinking');
        if (thinking) {
            if (isError || !finalReasoning) {
                thinking.remove();
            } else {
                const body = thinking.querySelector('.chat-thinking-body');
                if (body) body.textContent = finalReasoning;
            }
        }

        if (!streamWrap.querySelector('.chat-msg-meta')) {
            const meta = document.createElement('div');
            meta.className = 'chat-msg-meta';
            meta.textContent = formatChatTime(Date.now());
            streamWrap.appendChild(meta);
        }

        if (containerEl) {
            containerEl.scrollTop = containerEl.scrollHeight;
        }
    }

    /**
     * 切换发送按钮状态（发送 vs 暂停）
     * @param {HTMLElement} btnEl
     * @param {boolean} isStreaming
     */
    function setSendButtonState(btnEl, isStreaming) {
        if (!btnEl) return;
        if (isStreaming) {
            btnEl.classList.add('streaming');
            btnEl.title = '暂停 AI 回答';
            btnEl.textContent = '⏸';
            btnEl.disabled = false;
        } else {
            btnEl.classList.remove('streaming');
            btnEl.title = '发送';
            btnEl.textContent = '➤';
            btnEl.disabled = false;
        }
    }

    /**
     * 将会话消息转换为发送给 API 的数据结构
     * @param {Object} chat
     * @returns {Array}
     */
    function buildChatSendMessages(chat) {
        if (!chat || !Array.isArray(chat.messages)) return [];
        return chat.messages.map(m => {
            const out = { role: m.role, content: m.content };
            if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
                out.images = m.images.map(i => {
                    if (i.path) return { path: i.path };
                    if (i.dataUrl) return { dataUrl: i.dataUrl };
                    return null;
                }).filter(Boolean);
            }
            return out;
        });
    }

    /**
     * Stream 状态管理类，集中管理流式生成过程与 DOM 刷新
     */
    class StreamManager {
        constructor() {
            this.isStreaming = false;
            this.rafId = null;
            this.removeChunkListener = null;
        }

        /**
         * 启动 AI 回复流式接收与状态更新
         * @param {Object} params
         * @param {HTMLElement} params.containerEl - 消息容器
         * @param {HTMLElement} [params.sendBtn] - 发送按钮
         * @param {HTMLElement} [params.chatInput] - 输入框
         * @param {HTMLElement} [params.chatRegenBtn] - 重新生成按钮
         * @param {Object} params.chat - 会话对象
         * @param {boolean} params.thinkingEnabled - 是否开启思考模式
         * @param {Function} [params.getCurrentChatId] - 获取当前激活的 chatId
         * @param {Function} [params.onSaveChats] - 保存会话回调
         */
        async startStream({
            containerEl,
            sendBtn,
            chatInput,
            chatRegenBtn,
            chat,
            thinkingEnabled,
            getCurrentChatId,
            onSaveChats
        }) {
            if (this.isStreaming) return;
            this.isStreaming = true;

            const streamChatId = chat.id;
            if (chatRegenBtn) chatRegenBtn.disabled = true;
            if (chatInput) chatInput.disabled = true;
            setSendButtonState(sendBtn, true);

            const { streamWrap, streamBubble, thinkingEl, thinkingBodyEl } = createStreamPlaceholder(containerEl, thinkingEnabled);

            let streamedContent = '';
            let streamedReasoning = '';
            let firstContentReceived = false;
            let contentDirty = false;
            let reasoningDirty = false;

            const flushUI = () => {
                this.rafId = null;
                const userNearBottom = isScrolledNearBottom(containerEl);
                if (reasoningDirty && thinkingBodyEl) {
                    thinkingBodyEl.textContent = streamedReasoning;
                    reasoningDirty = false;
                }
                if (contentDirty && streamBubble) {
                    streamBubble.textContent = streamedContent + '▌';
                    contentDirty = false;
                }
                if (userNearBottom && containerEl) {
                    containerEl.scrollTop = containerEl.scrollHeight;
                }
            };

            const scheduleUI = () => {
                if (!this.rafId) {
                    this.rafId = requestAnimationFrame(flushUI);
                }
            };

            if (window.api && typeof window.api.onChatChunk === 'function') {
                this.removeChunkListener = window.api.onChatChunk((chunk) => {
                    if (chunk.type === 'reasoning' && thinkingBodyEl) {
                        if (!streamedReasoning && chunk.text) {
                            thinkingBodyEl.textContent = '';
                        }
                        streamedReasoning += chunk.text;
                        reasoningDirty = true;
                        scheduleUI();
                    } else if (chunk.type === 'content') {
                        if (!firstContentReceived) {
                            firstContentReceived = true;
                            streamBubble.textContent = '';
                            if (thinkingEl) thinkingEl.classList.remove('expanded');
                        }
                        streamedContent += chunk.text;
                        contentDirty = true;
                        scheduleUI();
                    }
                });
            }

            try {
                const sendMessages = buildChatSendMessages(chat);
                const result = await window.api.chat({ messages: sendMessages, thinking: thinkingEnabled });
                const finalContent = result.content || streamedContent || (result.aborted ? '（已中断）' : '（空回复）');
                const finalReasoning = result.reasoning || streamedReasoning || '';
                const stats = (result && result.model) ? {
                    model: result.model,
                    elapsedSec: ((result.elapsedMs || 0) / 1000).toFixed(1),
                    tokens: (result.usage && result.usage.total) || 0
                } : null;

                const assistantMsg = {
                    role: 'assistant',
                    content: finalContent,
                    reasoning: finalReasoning,
                    ts: Date.now(),
                    aborted: !!result.aborted,
                    stats: stats
                };

                chat.messages.push(assistantMsg);
                chat.updatedAt = Date.now();
                if (typeof onSaveChats === 'function') onSaveChats();

                const activeId = typeof getCurrentChatId === 'function' ? getCurrentChatId() : streamChatId;
                if (activeId === streamChatId) {
                    finalizeStreamDom(streamWrap, streamBubble, finalContent, false, finalReasoning, stats, containerEl);
                } else {
                    if (streamWrap.parentNode) streamWrap.parentNode.removeChild(streamWrap);
                }
            } catch (err) {
                const errMsg = { role: 'assistant', content: '请求失败：' + err.message, ts: Date.now(), error: true };
                chat.messages.push(errMsg);
                chat.updatedAt = Date.now();
                if (typeof onSaveChats === 'function') onSaveChats();

                const activeId = typeof getCurrentChatId === 'function' ? getCurrentChatId() : streamChatId;
                if (activeId === streamChatId) {
                    finalizeStreamDom(streamWrap, streamBubble, '请求失败：' + err.message, true, '', null, containerEl);
                } else if (streamWrap.parentNode) {
                    streamWrap.parentNode.removeChild(streamWrap);
                }
            } finally {
                if (typeof this.removeChunkListener === 'function') {
                    this.removeChunkListener();
                    this.removeChunkListener = null;
                }
                if (this.rafId) {
                    cancelAnimationFrame(this.rafId);
                    this.rafId = null;
                }
                this.isStreaming = false;
                setSendButtonState(sendBtn, false);
                if (chatRegenBtn) chatRegenBtn.disabled = false;
                if (chatInput) {
                    chatInput.disabled = false;
                    chatInput.focus();
                }
            }
        }

        /**
         * 中断当前的 Stream 请求
         */
        abort() {
            if (window.api && typeof window.api.abortChat === 'function') {
                try {
                    window.api.abortChat();
                } catch (_) {}
            }
        }
    }

    // 暴露 window.ChatTabModule 命名空间
    window.ChatTabModule = {
        formatChatTime,
        genChatTitle,
        resolveImageSrc,
        createMessageDom,
        buildStatsDom,
        renderMessages,
        appendMessageDom,
        clearMessages,
        scrollToBottomOfChat,
        createStreamPlaceholder,
        finalizeStreamDom,
        setSendButtonState,
        buildChatSendMessages,
        StreamManager
    };
})();
