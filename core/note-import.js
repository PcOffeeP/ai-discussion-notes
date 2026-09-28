// 导入纯规则：先校验所有记录，再由仓库一次提交。等时异文保留冲突副本。
(function (global) {
  const AIDN = global.AIDN = global.AIDN || {};
  const time = n => Date.parse(n.updatedAt || n.createdAt) || 0;
  function validate(raw) {
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("文件内没有有效笔记数组");
    const ids = new Set();
    return raw.map((n, i) => {
      if (!n || typeof n !== "object" || Array.isArray(n) || typeof n.id !== "string" || !n.id.trim() || ids.has(n.id) ||
          typeof n.createdAt !== "string" || !Number.isFinite(Date.parse(n.createdAt)) || (n.updatedAt !== undefined && (typeof n.updatedAt !== "string" || !Number.isFinite(Date.parse(n.updatedAt)))) ||
          n.deletedAt || (n.schemaVersion !== undefined && ![1, 2, 3].includes(n.schemaVersion)) ||
          !["content", "contentText", "contentMarkdown"].some(k => typeof n[k] === "string") ||
          ["content", "contentText", "contentMarkdown", "contentHtml", "source", "sourceType", "conversationTitle", "conversationUrl"].some(k => n[k] !== undefined && typeof n[k] !== "string") ||
          (n.metadata !== undefined && (!n.metadata || typeof n.metadata !== "object" || Array.isArray(n.metadata))) ||
          (n.thoughts !== undefined && (!Array.isArray(n.thoughts) || n.thoughts.some(t => !t || typeof t.text !== "string" || typeof t.id !== "string" || typeof t.createdAt !== "string" || !Number.isFinite(Date.parse(t.createdAt)))))) {
        throw new Error(`第 ${i + 1} 条笔记格式无效或 ID 重复；原库未改动`);
      }
      ids.add(n.id);
      return AIDN.note.migrate(n);
    });
  }
  function content(n) {
    return JSON.stringify([n.contentMarkdown || "", n.contentText || "", n.contentHtml || "", n.source || "", n.conversationTitle || "", n.conversationUrl || "", n.thoughts || []]);
  }
  function merge(current, incoming) {
    const map = new Map(current.map(n => [n.id, n]));
    const result = { added: 0, updated: 0, skipped: 0, conflicts: 0 };
    for (const note of incoming) {
      const previous = map.get(note.id);
      let next = note;
      if (previous) {
        if (time(note) < time(previous) || time(note) === time(previous) && content(note) === content(previous)) { result.skipped++; continue; }
        if (time(note) === time(previous)) {
          result.conflicts++;
          next = { ...note, id: AIDN.note.createNote().id, metadata: { ...note.metadata, importedConflictOf: note.id } };
        } else result.updated++;
      } else result.added++;
      map.set(next.id, { ...next, metadata: { ...next.metadata, dirty: true } });
    }
    return { notes: Array.from(map.values()), result };
  }
  AIDN.noteImport = { validate, merge };
})(typeof self !== "undefined" ? self : globalThis);
