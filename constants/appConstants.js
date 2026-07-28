/**
 * 常量模块：包含创作角色预设、模型列表与默认系统配置
 */
const CREATION_PROMPTS = [
    { id: 'custom', name: '✏️ 自定义角色', prompt: '' },
    { id: 'assistant', name: '💡 全能助手', prompt: '你是一个高效、专业的全能个人助手。请简明遏要、条理清晰地回答用户的问题。' },
    { id: 'writer', name: '✍️ 文案大师', prompt: '你是一位精通文字创作、文案策划和排版美化的资深编辑。请用极具感染力和优雅文采的语言创作。' },
    { id: 'coder', name: '💻 编程专家', prompt: '你是一位高级软件工程师。请提供简洁、高效、规范的代码架构与解决方案，重点指出逻辑与潜在 BUG。' },
    { id: 'summarizer', name: '📝 提炼专家', prompt: '你是一位精速读与信息提炼的高手。请用 Markdown 列表与核心要点总结用户输入的内容。' }
];

const DEFAULT_MODELS = [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (快速响应)' },
    { id: 'gpt-4o', name: 'GPT-4o (全能旗舰)' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (强力逻辑)' },
    { id: 'deepseek-chat', name: 'DeepSeek-V3 (推荐智能)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (深度推理)' }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CREATION_PROMPTS, DEFAULT_MODELS };
} else {
    window.AppConstants = { CREATION_PROMPTS, DEFAULT_MODELS };
}
