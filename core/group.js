// core/group.js — 对话分组派生（纯函数，零 DOM/chrome 依赖，Node 可测）。
// 组织原则（RFC-002 §3）：主分组 = source + conversationTitle，自动派生，
// 零用户整理负担。组间按最新笔记倒序，组内按收藏时间正序（还原思考顺序）。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  // 组的稳定标识：来源 + 标题；标题缺失时退回 URL，再退回"未分组"
  function groupKeyOf(note) {
    const title = (note.conversationTitle || "").trim();
    const url = (note.conversationUrl || "").trim();
    return `${note.source || "unknown"}::${title || url || "ungrouped"}`;
  }

  /**
   * groupByConversation(notes) -> Group[]
   * Group: { key, source, title, conversationUrl, notes: Note[], latestAt, count }
   *   notes 组内按 createdAt 正序；组按 latestAt 倒序。
   */
  function groupByConversation(notes) {
    const byKey = new Map();
    for (const note of notes || []) {
      const key = groupKeyOf(note);
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          source: note.source || "unknown",
          title: (note.conversationTitle || "").trim(),
          conversationUrl: note.conversationUrl || "",
          notes: [],
          latestAt: "",
          count: 0,
        };
        byKey.set(key, g);
      }
      g.notes.push(note);
      if (!g.conversationUrl && note.conversationUrl) g.conversationUrl = note.conversationUrl;
      if (note.createdAt > g.latestAt) g.latestAt = note.createdAt;
      g.count = g.notes.length;
    }
    const groups = [...byKey.values()];
    for (const g of groups) {
      g.notes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    groups.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
    return groups;
  }

  // 来源计数（sidebar Sources 一节）：[{source, count}] 按数量倒序
  function countBySource(notes) {
    const counts = new Map();
    for (const n of notes || []) {
      const s = n.source || "unknown";
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }

  AIDN.group = { groupByConversation, countBySource, groupKeyOf };
})(typeof self !== "undefined" ? self : globalThis);
