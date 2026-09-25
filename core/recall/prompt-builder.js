// core/recall/prompt-builder.js — RFC-003 Prompt 工程与双层 User Prompt 组装器。
// UMD 风格，无任何外部依赖，前后端通用。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  AIDN.recall = AIDN.recall || {};

  const RECALL_SYSTEM_PROMPT = `# 角色
你是用户的长期认知伙伴与苏格拉底式复习助教。
你的目标是根据用户过去在与 AI 对话中记录的笔记上下文，在《AI 讨论纪事报》头版为用户印制一份充满信息浓度与思辨张力的多问题自测号外。

# 核心出题法则
1. 【头版头条 · 深度推演 (q1)】：
   - 针对目标笔记的核心因果逻辑、架构设计权衡或本质机制进行启发式提问（问“为什么”而非死记硬背）；
   - 必须提供一条模糊的【思考线索 (clue)】，辅助回忆但不剧透答案；
   - 提取原笔记核心知识机制，撰写一句精悍的【记忆锚点 (anchor)】。
2. 【报眼要闻 · 概念辨析 (q2)】：
   - 针对同会话中出现的关联概念或容易混淆的边界进行辨析提问（如 A 与 B 的本质区别）；
   - 给出精简解析。
3. 【微言速测 · 一问快答 (q3)】：
   - 针对一个具体的极端场景或边界条件，提出一问一答的快闪自测题。

# 严格输出规范 (JSON 格式)
必须以合法的 JSON 格式返回，禁止任何额外的 Markdown 代码块包裹：
{
  "issueId": "string, 唯一版号如 issue_hex_01",
  "seriesName": "string, 所属专栏如 Python 六层架构专栏",
  "leadSource": "string, 来源与时间如 ChatGPT · 昨天 16:10",
  "q1": {
    "title": "string, 头版头条深度推演大标题",
    "sub": "string, 引言副标题",
    "clue": "string, 思考线索",
    "anchor": "string, DeepSeek 记忆锚点",
    "targetNoteId": "string, 核心笔记 ID"
  },
  "q2": {
    "title": "string, 概念辨析自测题",
    "body": "string, 辨析要点解析"
  },
  "q3": {
    "title": "string, 微言速测快问",
    "body": "string, 快答答案"
  }
}`;

  const PROFILE_SYSTEM_PROMPT = `# 角色
你是用户的认知成长追踪助手。根据用户最近记录的 AI 对话笔记标题与摘录，提炼出轻量级的动态认知画像。

# 严格输出规范 (JSON 格式)
必须以合法的 JSON 格式返回，禁止任何额外的 Markdown 代码块包裹：
{
  "updatedAt": "string, ISO 8601 时间戳",
  "activeTopics": ["string", "string"],
  "recentShift": "string, 近期兴趣与认知重心变迁简述",
  "dormantTopics": ["string", "string"]
}`;

  /**
   * 组装号外复习 User Prompt
   * @param {Object} options
   * @param {Object} [options.profile] 认知画像 { activeTopics, recentShift }
   * @param {string} [options.seriesName] 专栏名/对话标题
   * @param {string} [options.source] 来源平台 (如 ChatGPT / Kimi / DeepSeek)
   * @param {Array<Object>} options.notes 该会话内的笔记列表
   * @param {string} [options.targetNoteId] 本次核心推演的重点笔记 ID
   */
  function buildRecallUserPrompt(options) {
    const opts = options || {};
    const profile = opts.profile || {};
    const notes = Array.isArray(opts.notes) ? opts.notes : [];
    const targetId = opts.targetNoteId || (notes[0] && notes[0].id) || "";
    const series = opts.seriesName || (notes[0] && notes[0].conversationTitle) || "未命名专栏";
    const src = opts.source || (notes[0] && notes[0].source) || "未知来源";

    const parts = [];

    // 1. 宏观认知画像
    const active = Array.isArray(profile.activeTopics) && profile.activeTopics.length > 0
      ? profile.activeTopics.join("、")
      : "暂无特定标签";
    const shift = profile.recentShift || "保持持续探索与知识沉淀";

    parts.push(`【宏观认知画像】
- 用户近期活跃主题：${active}
- 近期兴趣跃迁：${shift}`);

    // 2. 本次抽样聚焦的目标会话脉络
    const noteLines = [];
    const thoughtLines = [];

    notes.forEach((n, idx) => {
      const isTarget = n.id === targetId;
      const snippet = (n.contentMarkdown || n.contentText || "")
        .replace(/\n+/g, " ")
        .slice(0, 300);
      const tag = isTarget ? `笔记 ${idx + 1} (核心聚焦, ID: ${n.id})` : `笔记 ${idx + 1} (ID: ${n.id})`;
      noteLines.push(`- ${tag}: [${snippet}]`);

      if (Array.isArray(n.thoughts)) {
        n.thoughts.forEach((t) => {
          if (t && t.text) thoughtLines.push(`- 用户历史批注: "${t.text.trim()}"`);
        });
      }
    });

    parts.push(`【本次抽样聚焦的目标会话脉络】
- 专栏名称：${series} (来源: ${src})
${noteLines.join("\n")}${thoughtLines.length > 0 ? "\n" + thoughtLines.join("\n") : ""}`);

    // 3. 出题要求
    parts.push(`【出题要求】
请围绕上述会话脉络与核心笔记 (targetNoteId: "${targetId}")，按照 System Prompt 的结构化规范，印制一份包含【深度推演 q1】、【概念辨析 q2】、【微言速测 q3】的完整号外 JSON。
必须将 q1.targetNoteId 设为 "${targetId}"。`);

    return parts.join("\n\n");
  }

  /**
   * 组装动态认知画像 User Prompt
   * @param {Array<Object>} recentNotes 最近 5~10 篇笔记
   */
  function buildProfileUserPrompt(recentNotes) {
    const notes = Array.isArray(recentNotes) ? recentNotes : [];
    const lines = notes.map((n, i) => {
      const title = n.conversationTitle || "未命名对话";
      const snippet = (n.contentMarkdown || n.contentText || "")
        .replace(/\n+/g, " ")
        .slice(0, 150);
      return `${i + 1}. [会话: ${title} | 来源: ${n.source || "未知"}] ${snippet}`;
    });

    return `以下是用户近期记录的笔记摘要与标题：
${lines.join("\n")}

请据此观察用户的知识结构与兴趣演进，生成用户的动态认知画像 JSON。`;
  }

  AIDN.recall.promptBuilder = {
    RECALL_SYSTEM_PROMPT,
    PROFILE_SYSTEM_PROMPT,
    buildRecallUserPrompt,
    buildProfileUserPrompt,
  };
})(typeof self !== "undefined" ? self : globalThis);
