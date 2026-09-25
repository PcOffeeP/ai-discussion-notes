// core/recall/response-parser.js — RFC-003 号外 JSON 与认知画像解析及强类型校验。
// UMD 风格，无任何外部依赖，前后端通用。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  AIDN.recall = AIDN.recall || {};

  /**
   * 剥离外层 Markdown 代码块（如 ```json ... ```），提取纯净 JSON 字符串
   */
  function extractJsonString(raw) {
    if (typeof raw !== "string") {
      throw new Error("响应内容必须为字符串");
    }
    let text = raw.trim();

    // 匹配 ```json ... ``` 或 ``` ... ```
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    } else {
      // 容错：若模型输出了多余的前导/后置解释文本，定位最外层的 { ... }
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        text = text.slice(start, end + 1);
      }
    }
    return text;
  }

  /**
   * 解析并校验《AI 讨论纪事报》号外自测数据
   * @param {string|Object} raw
   * @returns {Object} 规范化后的 IssuePayload
   */
  function parseRecallResponse(raw) {
    let data;
    if (typeof raw === "string") {
      const jsonStr = extractJsonString(raw);
      try {
        data = JSON.parse(jsonStr);
      } catch (err) {
        throw new Error("解析号外 JSON 失败: " + err.message);
      }
    } else if (raw && typeof raw === "object") {
      data = raw;
    } else {
      throw new Error("无效的号外输入数据");
    }

    if (!data || typeof data !== "object") {
      throw new Error("号外数据根节点必须为对象");
    }

    const issueId = String(data.issueId || `issue_${Date.now().toString(36)}`).trim();
    const seriesName = String(data.seriesName || "AI 讨论文汇").trim();
    const leadSource = String(data.leadSource || "AI 对话").trim();

    // 校验 q1 (深度推演)
    const rawQ1 = data.q1 || {};
    if (!rawQ1.title) {
      throw new Error("缺少 q1.title (头版头条推演标题)");
    }
    const q1 = {
      title: String(rawQ1.title || "").trim(),
      sub: String(rawQ1.sub || "").trim(),
      clue: String(rawQ1.clue || "").trim(),
      anchor: String(rawQ1.anchor || "").trim(),
      targetNoteId: String(rawQ1.targetNoteId || "").trim(),
    };

    // 校验 q2 (概念辨析)
    const rawQ2 = data.q2 || {};
    const q2 = {
      title: String(rawQ2.title || "概念辨析").trim(),
      body: String(rawQ2.body || "").trim(),
    };

    // 校验 q3 (微言速测)
    const rawQ3 = data.q3 || {};
    const q3 = {
      title: String(rawQ3.title || "微言速测").trim(),
      body: String(rawQ3.body || "").trim(),
    };

    return {
      issueId,
      seriesName,
      leadSource,
      q1,
      q2,
      q3,
    };
  }

  /**
   * 解析并校验认知画像数据
   * @param {string|Object} raw
   * @returns {Object} 规范化后的 CognitiveProfile
   */
  function parseProfileResponse(raw) {
    let data;
    if (typeof raw === "string") {
      const jsonStr = extractJsonString(raw);
      try {
        data = JSON.parse(jsonStr);
      } catch (err) {
        throw new Error("解析认知画像 JSON 失败: " + err.message);
      }
    } else if (raw && typeof raw === "object") {
      data = raw;
    } else {
      throw new Error("无效的认知画像输入数据");
    }

    const updatedAt = String(data.updatedAt || new Date().toISOString());
    const activeTopics = Array.isArray(data.activeTopics)
      ? data.activeTopics.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    const recentShift = String(data.recentShift || "持续学习与知识沉淀中").trim();
    const dormantTopics = Array.isArray(data.dormantTopics)
      ? data.dormantTopics.map((s) => String(s || "").trim()).filter(Boolean)
      : [];

    return {
      updatedAt,
      activeTopics,
      recentShift,
      dormantTopics,
    };
  }

  AIDN.recall.responseParser = {
    extractJsonString,
    parseRecallResponse,
    parseProfileResponse,
  };
})(typeof self !== "undefined" ? self : globalThis);
