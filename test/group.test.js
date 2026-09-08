// core/group.js 边界测试：分组派生、排序、来源计数。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load("core/note.js", "core/group.js");
const { createNote } = AIDN.note;
const { groupByConversation, countBySource, groupKeyOf } = AIDN.group;

const mk = (over) =>
  createNote({ contentText: "x", source: "ChatGPT", ...over });

test("同一对话的笔记聚为一组，组内按收藏时间正序", () => {
  const notes = [
    mk({ conversationTitle: "Python 学习", createdAt: "2026-09-07T03:00:00Z" }),
    mk({ conversationTitle: "材料梳理", createdAt: "2026-09-08T01:00:00Z" }),
    mk({ conversationTitle: "Python 学习", createdAt: "2026-09-07T01:00:00Z" }),
  ];
  const groups = groupByConversation(notes);
  assert.equal(groups.length, 2);
  // 组间按最新笔记倒序：材料梳理(9-08) 在前
  assert.equal(groups[0].title, "材料梳理");
  assert.equal(groups[1].title, "Python 学习");
  // 组内正序：01:00 在 03:00 前
  assert.equal(groups[1].notes[0].createdAt, "2026-09-07T01:00:00Z");
  assert.equal(groups[1].count, 2);
});

test("标题缺失时退回 URL 分组，再退回 ungrouped", () => {
  const a = mk({ conversationTitle: "", conversationUrl: "https://chatgpt.com/c/1" });
  const b = mk({ conversationTitle: "", conversationUrl: "https://chatgpt.com/c/1" });
  const c = mk({ conversationTitle: "", conversationUrl: "" });
  const groups = groupByConversation([a, b, c]);
  assert.equal(groups.length, 2);
  assert.ok(groupKeyOf(c).endsWith("ungrouped"));
});

test("countBySource 按数量倒序", () => {
  const notes = [mk({}), mk({}), mk({ source: "Kimi" })];
  const counts = countBySource(notes);
  assert.deepEqual(counts, [
    { source: "ChatGPT", count: 2 },
    { source: "Kimi", count: 1 },
  ]);
});

test("空输入返回空数组", () => {
  assert.deepEqual(groupByConversation([]), []);
  assert.deepEqual(countBySource(null), []);
});
