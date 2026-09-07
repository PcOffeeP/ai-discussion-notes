// core/pipeline.js — 捕获管道（纯模块）。
// RawCapture: { html?, text?, source, sourceType, conversationTitle?,
//               conversationUrl?, metadata? } —— 与 DOM 无关，桌面 Agent 同样适用。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  /**
   * createPipeline({ repo, serialize? })
   *   repo: NoteRepo 端口（生产 chrome storage 适配器 / 测试内存适配器）
   *   serialize: (html) -> markdown，缺省用 AIDN.htmlToMarkdown
   * 返回 async capture(raw) -> Note
   */
  function createPipeline({ repo, serialize } = {}) {
    if (!repo) throw new Error("createPipeline 需要 repo (NoteRepo)");
    const doSerialize =
      serialize ||
      ((html) => AIDN.htmlToMarkdown(html));

    return async function capture(raw) {
      if (!raw || (!raw.html && !raw.text)) return null;
      let markdown = "";
      if (raw.html) {
        try {
          markdown = doSerialize(raw.html);
        } catch (_) {
          markdown = ""; // 序列化失败降级为纯文本，原文 HTML 仍保留在 contentHtml
        }
      }
      const note = AIDN.note.createNote({
        contentMarkdown: markdown || raw.text || "",
        contentText: raw.text, // 缺省时 createNote 自动从 markdown 推导
        contentHtml: raw.html || "",
        source: raw.source,
        sourceType: raw.sourceType,
        conversationTitle: raw.conversationTitle,
        conversationUrl: raw.conversationUrl,
        metadata: raw.metadata,
      });
      return repo.save(note);
    };
  }

  AIDN.createPipeline = createPipeline;
})(typeof self !== "undefined" ? self : globalThis);
