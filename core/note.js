// core/note.js — Note schema 唯一拥有者（纯模块，零 chrome.* 依赖）。
// UMD 风格挂到 AIDN 命名空间：content script 无法 ESM import，且不引入构建工具。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const SCHEMA_VERSION = 2;

  function genId() {
    return "note_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // 粗略的 Markdown → 纯文本，仅用于搜索索引，不追求展示质量。
  function markdownToText(md) {
    return String(md || "")
      .replace(/```(\w*)\n?([\s\S]*?)```/g, "$2")          // 代码块保留内容
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")            // 图片 → alt
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")             // 链接 → 文本
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")                  // 标题记号
      .replace(/^\s{0,3}>\s?/gm, "")                       // 引用记号
      .replace(/^\s*[-*+]\s+/gm, "")                       // 无序列表记号
      .replace(/^\s*\d+\.\s+/gm, "")                       // 有序列表记号
      .replace(/\|/g, " ")                                 // 表格竖线
      .replace(/[*_~`]/g, "")                              // 行内记号
      .replace(/\s+\n/g, "\n")
      .trim();
  }

  /**
   * 创建 v2 Note。三种表示可独立提供，缺省时互相推导：
   * contentMarkdown ← contentText；contentText ← markdownToText(contentMarkdown)。
   */
  function createNote(dto) {
    dto = dto || {};
    const markdown = dto.contentMarkdown || dto.contentText || "";
    const note = {
      id: dto.id || genId(),
      schemaVersion: SCHEMA_VERSION,
      contentMarkdown: markdown,
      contentText: dto.contentText || markdownToText(markdown),
      contentHtml: dto.contentHtml || "",
      source: dto.source || "unknown",
      sourceType: dto.sourceType || "chat",
      conversationTitle: dto.conversationTitle || "",
      conversationUrl: dto.conversationUrl || "",
      metadata: dto.metadata || {},
      createdAt: dto.createdAt || new Date().toISOString(),
    };
    return note;
  }

  // v1（单 content 字符串）→ v2，无损迁移；已是 v2 则原样返回。
  function migrate(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.schemaVersion === SCHEMA_VERSION) return raw;
    return createNote({
      id: raw.id,
      contentMarkdown: raw.content || raw.contentMarkdown || "",
      contentHtml: raw.contentHtml || "",
      source: raw.source,
      sourceType: raw.sourceType,
      conversationTitle: raw.conversationTitle,
      conversationUrl: raw.conversationUrl,
      metadata: raw.metadata,
      createdAt: raw.createdAt,
    });
  }

  // 简单全文搜索：contentText + contentMarkdown + conversationTitle
  function search(notes, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      (n.contentText || "").toLowerCase().includes(q) ||
      (n.contentMarkdown || "").toLowerCase().includes(q) ||
      (n.conversationTitle || "").toLowerCase().includes(q)
    );
  }

  AIDN.note = { SCHEMA_VERSION, createNote, migrate, search, markdownToText };
})(typeof self !== "undefined" ? self : globalThis);
