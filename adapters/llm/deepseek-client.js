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

    const snippet = (targetNote.contentMarkdown || targetNote.contentText || "核心知识沉淀")
      .replace(/\n+/g, " ")
      .trim();
    const firstSentence = snippet.split(/[。！？\n]/)[0] || snippet.slice(0, 40);

    return {
      issueId: `issue_${Date.now().toString(36)}`,
      seriesName: series,
      leadSource: `${source} · 深度沉淀`,
      q1: {
        title: `论「${series}」中核心机制的设计权衡与本质推演`,
        sub: `基于 ${source} 讨论脉络的启发式自测`,
        clue: `回溯上下文中的因果推演：关键不变式与外部依赖是如何解耦的？`,
        anchor: firstSentence.length > 5 ? firstSentence : "核心业务规则如磐石，数据库与外设皆流沙",
        targetNoteId: targetId,
      },
      q2: {
        title: `概念辨析：核心业务模型与外部传输模型（DTO/Mapper）的本质边界为何？`,
        body: `外部传输结构随接口契约与存储形式演化，而领域核心模型只反映真实业务规则，二者必须通过防腐/映射层严格隔离。`,
      },
      q3: {
        title: `微言速测：当底层存储字段更名时，核心领域层代码是否应该做同步修改？`,
        body: `绝不应该。应由持久化适配器（Repository Adapter）负责双向转换与映射，隔离外部变动。`,
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
      activeTopics: titles.length > 0 ? titles : ["现代软件工程", "大模型交互洞见"],
      recentShift: "从碎片化问题探索逐步沉淀为系统化认知结构",
      dormantTopics: ["通用检索", "语法速查"],
    };
  }

  /**
   * 创建 DeepSeek 客户端
   */
  function createDeepSeekClient(config = {}) {
    const defaultBaseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const defaultModel = config.model || DEFAULT_MODEL;
    const defaultApiKey = config.apiKey || "";
    const fetchFn = config.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(global) : null);

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
        throw new Error(`DeepSeek API 请求失败 [HTTP ${resp.status}]: ${errText.slice(0, 200)}`);
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
        throw new Error(`连接失败 [HTTP ${resp.status}]: ${errText.slice(0, 150)}`);
      }

      return { ok: true };
    }

    return {
      generateRecallIssue,
      generateCognitiveProfile,
      testConnection,
      buildHeuristicFallbackIssue,
      buildHeuristicFallbackProfile,
    };
  }

  AIDN.llm.createDeepSeekClient = createDeepSeekClient;
})(typeof self !== "undefined" ? self : globalThis);
