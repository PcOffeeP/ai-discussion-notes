// Shared Note model factory.
// Note shape (per design doc §9):
// { id, content, source, sourceType, conversationTitle, conversationUrl, createdAt }
(function (global) {
  function createNote({ content, source, sourceType, conversationTitle, conversationUrl }) {
    return {
      id: "note_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      content: content || "",
      source: source || "unknown",
      sourceType: sourceType || "chat",
      conversationTitle: conversationTitle || "",
      conversationUrl: conversationUrl || "",
      createdAt: new Date().toISOString(),
    };
  }
  global.AIDN = global.AIDN || {};
  global.AIDN.createNote = createNote;
})(typeof self !== "undefined" ? self : window);
