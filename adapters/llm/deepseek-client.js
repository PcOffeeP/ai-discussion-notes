// adapters/llm/deepseek-client.js — RFC-003 DeepSeek 认知编排与 OpenAI 兼容 API 客户端。
// UMD 风格，支持浏览器环境 (fetch) 与 Node 测试 (注入 fetchFn)。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  AIDN.llm = AIDN.llm || {};

  const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
  const DEFAULT_MODEL = "deepseek-chat";

  /**
   * 当未配置 API Key 或请求异常时，基于当前笔记上下文生成启发式号外（保证无 key 也可完整体验与测试）
   */
  function buildHeuristicFallbackIssue(options) {
    const opts = options || {};
    const notes = Array.isArray(opts.notes) ? opts.notes : [];
    const targetId = opts.targetNoteId || (notes[0] && notes[0].id) || "note_heuristic";
    const targetNote = notes.find((n) => n.id === targetId) || notes[0] || {};
    const series = opts.seriesName || targetNote.conversationTitle || "AI 讨论文汇";
    const source = opts.source || targetNote.source || "AI 对话";

    const snippet = AIDN.note.markdownToText(targetNote.contentMarkdown || targetNote.contentText || "");
    const parts = snippet.split(/[。！？!?\n]+/).map(v => v.trim()).filter(Boolean);
    const first = parts[0] || "这篇笔记暂无正文，请先补充内容";
    const detail = parts[1] || first;
    const thoughts = (targetNote.thoughts || []).map(t => t.text).filter(Boolean);
    const thought = thoughts[thoughts.length - 1];
    return {
      issueId: `issue_${Date.now().toString(36)}`, seriesName: series,
      generationMode: "offline", leadSource: `${source} · 离线复习提示`,
      q1: {
        title: `回忆「${series}」：原文首先表达了什么？`,
        sub: "基于当前原文与批注的确定性提示，未经模型推理",
        clue: `从原文开头回想：${first.slice(0, 24)}…`,
        anchor: first, targetNoteId: targetId,
      },
      q2: { title: "不看原文，复述这段笔记中的一项细节", body: `原文对照：${detail}` },
      q3: {
        title: thought ? "你最近为这篇笔记留下了什么批注？" : "用自己的话总结这篇笔记，并添加一条批注",
        body: thought ? `批注对照：${thought}` : `原文对照：${first}（这是回忆提示，没有标准推理答案）`,
      },
    };
  }

  /**
   * 启发式生成轻量认知画像
   */
  function buildHeuristicFallbackProfile(recentNotes) {
    const notes = Array.isArray(recentNotes) ? recentNotes : [];
    const titles = notes
      .map((n) => n.conversationTitle)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4);

    return {
      updatedAt: new Date().toISOString(),
      activeTopics: titles,
      recentShift: "离线摘要：仅列出近期笔记标题，未分析认知变化",
      generationMode: "offline",
      dormantTopics: [],
    };
  }

  /**
   * 创建 DeepSeek 客户端
   */
  function createDeepSeekClient(config = {}) {
    const defaultBaseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const defaultModel = config.model || DEFAULT_MODEL;
    const defaultApiKey = config.apiKey || "";
    const rawFetch = config.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(global) : null);
    const fetchFn = rawFetch && (async (url, options) => {
      const controller = new AbortController();
      let timer;
      try {
        return await Promise.race([
          rawFetch(url, { ...options, signal: controller.signal }),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("请求超时")); }, config.timeoutMs || 20000); }),
        ]);
      } finally { clearTimeout(timer); }
    });

    /**
     * 生成头版号外自测
     */
    async function generateRecallIssue(params = {}) {
      const apiKey = (params.apiKey !== undefined ? params.apiKey : defaultApiKey).trim();
      const baseUrl = (params.baseUrl || defaultBaseUrl).replace(/\/+$/, "");
      const model = params.model || defaultModel;

      // 若没有提供 API Key，降级使用启发式本地装配
      if (!apiKey || !fetchFn) {
        return buildHeuristicFallbackIssue(params);
      }

      const promptBuilder = AIDN.recall?.promptBuilder;
      const responseParser = AIDN.recall?.responseParser;
      if (!promptBuilder || !responseParser) {
        throw new Error("缺少 core/recall 依赖");
      }

      const systemPrompt = promptBuilder.RECALL_SYSTEM_PROMPT;
      const userPrompt = promptBuilder.buildRecallUserPrompt(params);

      const endpoint = `${baseUrl}/chat/completions`;
      const resp = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`DeepSeek API 请求失败 [HTTP ${resp.status}]`);
      }

      const result = await resp.json();
      const content = result?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("DeepSeek API 返回了空内容");
      }

      return responseParser.parseRecallResponse(content);
    }

    /**
     * 提取用户动态认知画像
     */
    async function generateCognitiveProfile(params = {}) {
      const recentNotes = params.recentNotes || [];
      const apiKey = (params.apiKey !== undefined ? params.apiKey : defaultApiKey).trim();
      const baseUrl = (params.baseUrl || defaultBaseUrl).replace(/\/+$/, "");
      const model = params.model || defaultModel;

      if (!apiKey || !fetchFn || recentNotes.length === 0) {
        return buildHeuristicFallbackProfile(recentNotes);
      }

      const promptBuilder = AIDN.recall?.promptBuilder;
      const responseParser = AIDN.recall?.responseParser;
      if (!promptBuilder || !responseParser) {
        throw new Error("缺少 core/recall 依赖");
      }

      const systemPrompt = promptBuilder.PROFILE_SYSTEM_PROMPT;
      const userPrompt = promptBuilder.buildProfileUserPrompt(recentNotes);

      const endpoint = `${baseUrl}/chat/completions`;
      const resp = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });

      if (!resp.ok) {
        return buildHeuristicFallbackProfile(recentNotes);
      }

      const result = await resp.json();
      const content = result?.choices?.[0]?.message?.content;
      if (!content) {
        return buildHeuristicFallbackProfile(recentNotes);
      }

      try {
        return responseParser.parseProfileResponse(content);
      } catch (_) {
        return buildHeuristicFallbackProfile(recentNotes);
      }
    }

    /**
     * 测试 API 连接与鉴权有效性
     */
    async function testConnection(params = {}) {
      const apiKey = (params.apiKey !== undefined ? params.apiKey : defaultApiKey).trim();
      const baseUrl = (params.baseUrl || defaultBaseUrl).replace(/\/+$/, "");
      const model = params.model || defaultModel;

      if (!apiKey) {
        throw new Error("请先填写 DeepSeek API Key");
      }
      if (!fetchFn) {
        throw new Error("当前环境未支持网络请求");
      }

      const endpoint = `${baseUrl}/chat/completions`;
      const resp = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`连接失败 [HTTP ${resp.status}]`);
      }

      return { ok: true };
    }

    return {
      async generateRecallIssue(params = {}) {
        try { return await generateRecallIssue(params); }
        catch (_) { return { ...buildHeuristicFallbackIssue(params), fallbackReason: "模型请求失败，已切换离线提示" }; }
      },
      async generateCognitiveProfile(params = {}) {
        try { return await generateCognitiveProfile(params); }
        catch (_) { return buildHeuristicFallbackProfile(params.recentNotes); }
      },
      testConnection,
      buildHeuristicFallbackIssue,
      buildHeuristicFallbackProfile,
    };
  }

  AIDN.llm.createDeepSeekClient = createDeepSeekClient;
})(typeof self !== "undefined" ? self : globalThis);
