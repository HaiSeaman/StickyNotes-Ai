export const WEB_SEARCH_TOOL_DEFINITION = {
    type: 'function',
    function: {
        name: 'web_search',
        description: '当用户的提问涉及实时信息、近期热点、新闻时事、最新官方文档、不确定的具体事实、天气/汇率等动态数据时，调用此工具从互联网搜索最新网页资料。',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: '精炼的搜索关键词或短语，提取核心实体与意图，例如: "DeepSeek V3 模型架构特点"、"2026年最新前端框架趋势"'
                }
            },
            required: ['query']
        }
    }
} as const;

export const GROUNDING_SYSTEM_PROMPT_ADDON = `
# 联网检索与事实引用规范 (Web Search & Grounding Guidelines)
当你获取到了互联网搜索结果（以 tool 消息或搜索资料形式提供）时，请遵循以下规范进行回答：
1. **基于事实回答**：优先基于检索到的参考资料提炼回答，保证信息的准确性、时效性和客观性；
2. **正文内联角标引用**：对于引用了搜索资料的事实陈述、关键数据或核心论点，必须在相应语句或段落末尾直接标注引用序号角标，格式为 [1]、[2] 等，对应检索结果中的序号；
3. **保持流畅自然**：角标应紧随标点符号或引用句，不要生硬堆砌；若多个来源同时支持同一观点，可合并标注如 [1][2]；
4. **诚实与时效性**：若搜索结果中未能完全解答用户的问题，请如实说明已有的最新发现并指明局限。
`.trim();
