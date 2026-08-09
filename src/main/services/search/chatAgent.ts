import { parseSSEStream } from '../../lib/sse.js';
import { extractHttpError } from '../../lib/httpUtils.js';
import { searchManager } from './searchManager.js';
import { SearchResult, WebSearchConfig } from './types.js';
import { WEB_SEARCH_TOOL_DEFINITION, GROUNDING_SYSTEM_PROMPT_ADDON } from './toolSchema.js';

export interface ChatAgentOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    prompt?: string;
    enableThinking?: boolean;
    webSearchEnabled?: boolean;
    webSearchConfig?: WebSearchConfig;
    signal?: AbortSignal;
    onChunk: (event: {
        type: 'content' | 'reasoning' | 'searching' | 'sources';
        text?: string;
        query?: string;
        sources?: SearchResult[];
        usedProvider?: string;
        fallback?: boolean;
    }) => void;
}

export interface ChatAgentResult {
    content: string;
    reasoning: string;
    model: string;
    sources: SearchResult[];
    usage: { input: number; output: number; total: number };
    elapsedMs: number;
    aborted: boolean;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: any;
    name?: string;
    tool_call_id?: string;
    tool_calls?: any[];
}

/**
 * 格式化搜索结果为注入大模型的 Grounding 上下文
 */
export function formatSearchResultsForPrompt(results: SearchResult[]): string {
    if (!results || results.length === 0) {
        return '未检索到相关的网络信息。请基于你已有的知识进行回答，并告知用户未找到最新实时信息。';
    }

    const lines: string[] = [
        '以下是已检索到的实时网络参考资料：',
        '---'
    ];

    results.forEach((item) => {
        lines.push(`[${item.index}] 标题: ${item.title}`);
        lines.push(`    来源: ${item.siteName || '网络'}`);
        lines.push(`    网址: ${item.url}`);
        lines.push(`    摘要内容: ${item.snippet}`);
        lines.push('');
    });

    lines.push('---');
    lines.push('回答要求：');
    lines.push('1. 请严格基于上述参考资料组织客观、准确的回答；');
    lines.push('2. 在关键事实陈述后，使用 [1]、[2] 等格式标注信息来源序号；');
    lines.push('3. 严禁在回答中输出"已为您搜索"、"来源引文"或直接列出一大堆网址链接（前端卡片会自动优雅展示参考来源，无需在正文中重复打印）。');

    return lines.join('\n');
}

/**
 * 执行支持 Web Search & Grounding 的 Agentic 对话状态机
 */
export async function executeAgenticChat(
    messages: ChatMessage[],
    options: ChatAgentOptions
): Promise<ChatAgentResult> {
    const startTime = Date.now();
    const {
        baseUrl,
        apiKey,
        model,
        temperature = 1,
        prompt,
        enableThinking = false,
        webSearchEnabled = false,
        webSearchConfig,
        signal,
        onChunk,
    } = options;

    let fullContent = '';
    let fullReasoning = '';
    let resolvedModel = model;
    let usage = { input: 0, output: 0, total: 0 };
    let sources: SearchResult[] = [];
    let aborted = false;

    // 组装会话历史
    const conversation: ChatMessage[] = [];

    // 系统提示词组装
    let fullSystemPrompt = prompt || '';
    if (webSearchEnabled) {
        fullSystemPrompt = fullSystemPrompt
            ? `${fullSystemPrompt}\n\n${GROUNDING_SYSTEM_PROMPT_ADDON}`
            : GROUNDING_SYSTEM_PROMPT_ADDON;
    }
    if (fullSystemPrompt.trim()) {
        conversation.push({ role: 'system', content: fullSystemPrompt.trim() });
    }

    // 加入用户与助手消息
    messages.forEach((m) => {
        if (m.role !== 'system') {
            conversation.push(m);
        }
    });

    // 如果未开启联网，直接执行普通单轮流式请求
    if (!webSearchEnabled) {
        return await streamDirectChat(conversation, options, startTime);
    }

    // 开启联网模式：准备带 tools 的第一轮请求
    const safeBaseUrl = baseUrl || ""; const url = safeBaseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const firstReqBody: any = {
        model,
        messages: conversation,
        temperature,
        stream: true,
        tools: [WEB_SEARCH_TOOL_DEFINITION],
        tool_choice: 'auto',
    };

    if (enableThinking) {
        firstReqBody.enable_thinking = true;
    } else {
        firstReqBody.enable_thinking = false;
    }

    // 捕获模型第一轮响应（可能包含 tool_calls，也可能直接是最终回答）
    let detectedToolId = '';
    let detectedToolName = '';
    let detectedToolArgs = '';
    let hasToolCall = false;
    let firstRoundDirectContent = '';
    let firstRoundDirectReasoning = '';

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
            },
            body: JSON.stringify(firstReqBody),
            signal,
        });

        if (!resp.ok) {
            // 降级判断：如果模型报错不支持 tools（如 HTTP 400 且包含 tools/function 不支持错误）
            const errText = await extractHttpError(resp);
            if (
                resp.status === 400 &&
                (errText.includes('tools') ||
                    errText.includes('tool_choice') ||
                    errText.includes('function') ||
                    errText.includes('not supported') ||
                    errText.includes('Unrecognized request argument'))
            ) {
                console.warn('[ChatAgent] 模型不支持 tools 参数，自动降级为 Prompt 注入联网模式:', errText);
                return await fallbackPromptInjectionChat(messages, options, startTime);
            }
            throw new Error(errText);
        }

        // 解析第一轮 SSE 流
        await parseSSEStream(
            resp,
            (chunk: any) => {
                if (chunk.model) resolvedModel = chunk.model;
                if (chunk.usage) {
                    usage = {
                        input: chunk.usage.prompt_tokens || chunk.usage.input_tokens || 0,
                        output: chunk.usage.completion_tokens || chunk.usage.output_tokens || 0,
                        total: chunk.usage.total_tokens || 0,
                    };
                }

                const choice = chunk.choices && chunk.choices[0];
                if (!choice) return;

                const delta = choice.delta || {};

                // 检查是否有 tool_calls 增量
                if (delta.tool_calls && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
                    hasToolCall = true;
                    const tc = delta.tool_calls[0];
                    if (tc.id) detectedToolId = tc.id;
                    if (tc.function?.name) detectedToolName = tc.function.name;
                    if (tc.function?.arguments) detectedToolArgs += tc.function.arguments;
                }

                // 普通内容流
                if (delta.content) {
                    firstRoundDirectContent += delta.content;
                    if (!hasToolCall) {
                        onChunk({ type: 'content', text: delta.content });
                    }
                }

                // 思考内容流
                const reasoningDelta =
                    delta.reasoning_content || delta.thinking || delta.reasoning || '';
                if (reasoningDelta) {
                    firstRoundDirectReasoning += reasoningDelta;
                    if (!hasToolCall) {
                        onChunk({ type: 'reasoning', text: reasoningDelta });
                    }
                }
            },
            signal
        );
    } catch (err: any) {
        if (signal?.aborted) {
            return {
                content: firstRoundDirectContent,
                reasoning: firstRoundDirectReasoning,
                model: resolvedModel,
                sources: [],
                usage,
                elapsedMs: Date.now() - startTime,
                aborted: true,
            };
        }
        throw err;
    }

    // 如果模型没有发起任何 tool_calls，说明大模型判断该问题无需搜索（如闲聊、写诗、翻译等）
    if (!hasToolCall) {
        return {
            content: firstRoundDirectContent,
            reasoning: firstRoundDirectReasoning,
            model: resolvedModel,
            sources: [],
            usage,
            elapsedMs: Date.now() - startTime,
            aborted: false,
        };
    }

    const toolCallId = detectedToolId || `call_${Date.now()}`;
    const toolCallName = detectedToolName || 'web_search';
    const toolCallArgs = detectedToolArgs;

    // === 进入 Agentic 第二阶段：执行网络搜索与 Tool 结果注入 ===
    let searchQuery = '';
    try {
        const parsedArgs = JSON.parse(toolCallArgs || '{}');
        searchQuery = parsedArgs.query || parsedArgs.keyword || parsedArgs.q || '';
    } catch {
        searchQuery = toolCallArgs.trim();
    }

    // 兜底提取：如果模型解析出的 query 为空，则提取用户最新一条消息
    if (!searchQuery) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                searchQuery = typeof messages[i].content === 'string' ? messages[i].content : '';
                break;
            }
        }
    }

    // 1. 向前端推送「正在搜索」状态
    onChunk({
        type: 'searching',
        query: searchQuery,
    });

    // 2. 调度 searchManager 执行真实检索
    const searchConfigToUse = webSearchConfig || { provider: 'builtin' };
    const searchResp = await searchManager.search(searchQuery, searchConfigToUse);
    sources = searchResp.results;

    // 3. 向前端推送「搜索完成与参考来源卡片」状态
    onChunk({
        type: 'sources',
        sources: sources,
        usedProvider: searchResp.usedProvider,
        fallback: searchResp.fallback,
    });

    // 4. 构建注入给大模型的完整上下文（包含 assistant tool_calls 与 tool 角色消息）
    const assistantToolMessage: ChatMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
            {
                id: toolCallId,
                type: 'function',
                function: {
                    name: toolCallName,
                    arguments: toolCallArgs || JSON.stringify({ query: searchQuery }),
                },
            },
        ],
    };

    const toolResponseMessage: ChatMessage = {
        role: 'tool',
        tool_call_id: toolCallId,
        name: toolCallName,
        content: formatSearchResultsForPrompt(sources),
    };

    const secondRoundMessages: ChatMessage[] = [
        ...conversation,
        assistantToolMessage,
        toolResponseMessage,
    ];

    // 5. 发起第二轮流式请求，让大模型结合搜索结果生成最终回答
    const secondReqBody: any = {
        model,
        messages: secondRoundMessages,
        temperature,
        stream: true,
    };

    if (enableThinking) {
        secondReqBody.enable_thinking = true;
    } else {
        secondReqBody.enable_thinking = false;
    }

    try {
        const secondResp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
            },
            body: JSON.stringify(secondReqBody),
            signal,
        });

        if (!secondResp.ok) {
            throw new Error(await extractHttpError(secondResp));
        }

        await parseSSEStream(
            secondResp,
            (chunk: any) => {
                if (chunk.model) resolvedModel = chunk.model;
                if (chunk.usage) {
                    usage = {
                        input: usage.input + (chunk.usage.prompt_tokens || chunk.usage.input_tokens || 0),
                        output: usage.output + (chunk.usage.completion_tokens || chunk.usage.output_tokens || 0),
                        total: usage.total + (chunk.usage.total_tokens || 0),
                    };
                }

                const choice = chunk.choices && chunk.choices[0];
                if (!choice) return;

                const delta = choice.delta || {};
                if (delta.content) {
                    fullContent += delta.content;
                    onChunk({ type: 'content', text: delta.content });
                }

                const reasoningDelta =
                    delta.reasoning_content || delta.thinking || delta.reasoning || '';
                if (reasoningDelta) {
                    fullReasoning += reasoningDelta;
                    onChunk({ type: 'reasoning', text: reasoningDelta });
                }
            },
            signal
        );
    } catch (err: any) {
        if (signal?.aborted) {
            aborted = true;
        } else {
            throw err;
        }
    }

    // 关键修复：如果第二轮带 tool_calls 的请求大模型未输出正文内容（产生空回复），自动平滑降级为 Prompt 注入模式重新生成正文
    if (!fullContent.trim() && !aborted) {
        console.log("[ChatAgent] 第二轮 Tool 回复正文为空，自动启动 Prompt 注入兜底重试...");
        return await fallbackPromptInjectionChat(conversation, options, startTime);
    }

    return {
        content: fullContent,
        reasoning: fullReasoning,
        model: resolvedModel,
        sources,
        usage,
        elapsedMs: Date.now() - startTime,
        aborted,
    };
}

/**
 * 不支持 tools 的小模型/旧模型：Prompt 前置注入联网模式
 */
async function fallbackPromptInjectionChat(
    messages: ChatMessage[],
    options: ChatAgentOptions,
    startTime: number
): Promise<ChatAgentResult> {
    const { onChunk, webSearchConfig, signal } = options;

    // 提取最新用户问题
    let userQuery = '';
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            userQuery = typeof messages[i].content === 'string' ? messages[i].content : '';
            break;
        }
    }

    // 1. 通知前端正在搜索
    onChunk({ type: 'searching', query: userQuery });

    // 2. 执行搜索
    const searchConfigToUse = webSearchConfig || { provider: 'builtin' };
    const searchResp = await searchManager.search(userQuery, searchConfigToUse);
    const sources = searchResp.results;

    // 3. 通知前端搜索结果与卡片
    onChunk({
        type: 'sources',
        sources,
        usedProvider: searchResp.usedProvider,
        fallback: searchResp.fallback,
    });

    // 4. 将搜索内容以系统提示词注入
    const groundingPrompt = formatSearchResultsForPrompt(sources);
    const injectedMessages: ChatMessage[] = [];

    messages.forEach((m) => {
        if (m.role === 'system') {
            injectedMessages.push({
                role: 'system',
                content: `${m.content}\n\n${groundingPrompt}`,
            });
        } else {
            injectedMessages.push(m);
        }
    });

    if (!injectedMessages.some((m) => m.role === 'system')) {
        injectedMessages.unshift({
            role: 'system',
            content: groundingPrompt,
        });
    }

    return await streamDirectChat(injectedMessages, options, startTime, sources);
}

/**
 * 普通流式对话执行辅助函数
 */
async function streamDirectChat(
    conversation: ChatMessage[],
    options: ChatAgentOptions,
    startTime: number,
    presetSources: SearchResult[] = []
): Promise<ChatAgentResult> {
    const { baseUrl, apiKey, model, temperature = 1, enableThinking = false, signal, onChunk } = options;
    const safeBaseUrl = baseUrl || ""; const url = safeBaseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const reqBody: any = {
        model,
        messages: conversation,
        temperature,
        stream: true,
    };

    if (enableThinking) {
        reqBody.enable_thinking = true;
    } else {
        reqBody.enable_thinking = false;
    }

    let fullContent = '';
    let fullReasoning = '';
    let resolvedModel = model;
    let usage = { input: 0, output: 0, total: 0 };
    let aborted = false;

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                Accept: 'text/event-stream',
            },
            body: JSON.stringify(reqBody),
            signal,
        });

        if (!resp.ok) {
            throw new Error(await extractHttpError(resp));
        }

        await parseSSEStream(
            resp,
            (chunk: any) => {
                if (chunk.model) resolvedModel = chunk.model;
                if (chunk.usage) {
                    usage = {
                        input: chunk.usage.prompt_tokens || chunk.usage.input_tokens || 0,
                        output: chunk.usage.completion_tokens || chunk.usage.output_tokens || 0,
                        total: chunk.usage.total_tokens || 0,
                    };
                }

                const choice = chunk.choices && chunk.choices[0];
                if (!choice) return;

                const delta = choice.delta || {};
                if (delta.content) {
                    fullContent += delta.content;
                    onChunk({ type: 'content', text: delta.content });
                }

                const reasoningDelta =
                    delta.reasoning_content || delta.thinking || delta.reasoning || '';
                if (reasoningDelta) {
                    fullReasoning += reasoningDelta;
                    onChunk({ type: 'reasoning', text: reasoningDelta });
                }
            },
            signal
        );
    } catch (err: any) {
        if (signal?.aborted) {
            aborted = true;
        } else {
            throw err;
        }
    }

    return {
        content: fullContent,
        reasoning: fullReasoning,
        model: resolvedModel,
        sources: presetSources,
        usage,
        elapsedMs: Date.now() - startTime,
        aborted,
    };
}
