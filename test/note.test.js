// core/note.js 边界测试：schema 创建、v1→v2 迁移、搜索。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load("core/note.js");
const { createNote, migrate, search, SCHEMA_VERSION } = AIDN.note;

test("createNote 生成 v2 三表示，字段有默认值", () => {
  const n = createNote({ contentMarkdown: "## 标题\n\n**加粗** 文本" });
  assert.equal(n.schemaVersion, SCHEMA_VERSION);
  assert.ok(n.id.startsWith("note_"));
  assert.equal(n.contentMarkdown, "## 标题\n\n**加粗** 文本");
  assert.ok(n.contentText.includes("加粗"));
  assert.ok(!n.contentText.includes("**"));
  assert.equal(n.source, "unknown");
  assert.equal(n.sourceType, "chat");
  assert.ok(n.createdAt);
});

test("createNote 从纯文本推导 markdown", () => {
  const n = createNote({ contentText: "plain" });
  assert.equal(n.contentMarkdown, "plain");
  assert.equal(n.contentText, "plain");
});

test("migrate: v1 content 字段无损升级为 v2", () => {
  const v1 = {
    id: "note_001",
    content: "| A | B |\n| --- | --- |\n| 1 | 2 |",
    source: "ChatGPT",
    sourceType: "chat",
    conversationTitle: "学习 Agent Eval",
    conversationUrl: "https://chatgpt.com/c/xxxx",
    createdAt: "2026-09-06T15:20:00Z",
  };
  const n = migrate(v1);
  assert.equal(n.schemaVersion, SCHEMA_VERSION);
  assert.equal(n.id, "note_001");
  assert.equal(n.contentMarkdown, v1.content);
  assert.equal(n.conversationUrl, v1.conversationUrl);
  assert.equal(n.createdAt, v1.createdAt);
});

test("migrate: 已是 v2 则原样返回；非法输入返回 null", () => {
  const v2 = createNote({ contentText: "x" });
  assert.equal(migrate(v2), v2);
  assert.equal(migrate(null), null);
  assert.equal(migrate("junk"), null);
});

test("search 命中 contentText 与 conversationTitle，空查询原样返回", () => {
  const notes = [
    createNote({ contentMarkdown: "真正有效的学习是建立连接", conversationTitle: "学习方法" }),
    createNote({ contentText: "system design notes", conversationTitle: "学习 Agent Eval" }),
  ];
  assert.equal(search(notes, "学习").length, 2); // 一条命中内容，一条命中标题
  assert.equal(search(notes, "design").length, 1);
  assert.equal(search(notes, "").length, 2);
  assert.equal(search(notes, "不存在").length, 0);
});
