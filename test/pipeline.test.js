// 管道编排与存储契约测试：全程无 chrome 依赖。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load(
  "core/note.js",
  "core/pipeline.js",
  "adapters/chrome/kv.js",
  "adapters/chrome/storage-note-repo.js"
);

function makeRepo() {
  return AIDN.createStorageNoteRepo(AIDN.createMemoryKV());
}

test("pipeline: html 输入经 serialize 后入库，三表示齐全", async () => {
  const repo = makeRepo();
  const pipeline = AIDN.createPipeline({
    repo,
    serialize: (html) => `#serialized(${html})`, // stub 序列化器
  });
  const note = await pipeline({
    html: "<p>hi</p>",
    source: "ChatGPT",
    sourceType: "chat",
    conversationUrl: "https://chatgpt.com/c/1",
  });
  assert.equal(note.contentMarkdown, "#serialized(<p>hi</p>)");
  assert.equal(note.contentHtml, "<p>hi</p>"); // 原始 HTML 兜底保留
  assert.equal(note.source, "ChatGPT");
  const all = await repo.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, note.id);
});

test("pipeline: 无 html 的纯文本输入（桌面 Agent / 右键菜单路径）", async () => {
  const repo = makeRepo();
  const pipeline = AIDN.createPipeline({ repo, serialize: () => "unused" });
  const note = await pipeline({ text: "diff snippet", source: "Cursor", sourceType: "agent" });
  assert.equal(note.contentMarkdown, "diff snippet");
  assert.equal(note.contentHtml, "");
  assert.equal(note.sourceType, "agent");
});

test("pipeline: 序列化失败降级为纯文本，html 不丢", async () => {
  const repo = makeRepo();
  const pipeline = AIDN.createPipeline({
    repo,
    serialize: () => { throw new Error("boom"); },
  });
  const note = await pipeline({ html: "<table>...</table>", text: "fallback", source: "ChatGPT" });
  assert.equal(note.contentMarkdown, "fallback");
  assert.equal(note.contentHtml, "<table>...</table>");
});

test("pipeline: 空输入返回 null，不入库", async () => {
  const repo = makeRepo();
  const pipeline = AIDN.createPipeline({ repo });
  assert.equal(await pipeline({}), null);
  assert.equal(await pipeline(null), null);
  assert.equal((await repo.list()).length, 0);
});

test("repo 契约：save/list/delete/clear + v1 惰性迁移回写", async () => {
  const kv = AIDN.createMemoryKV({
    notes: [{ id: "old1", content: "v1 旧数据", source: "ChatGPT", createdAt: "2026-09-06T00:00:00Z" }],
  });
  const repo = AIDN.createStorageNoteRepo(kv);

  // list 触发迁移
  const notes = await repo.list();
  assert.equal(notes[0].schemaVersion, AIDN.note.SCHEMA_VERSION);
  assert.equal(notes[0].contentMarkdown, "v1 旧数据");
  // 已回写
  assert.equal(kv._dump().notes[0].schemaVersion, AIDN.note.SCHEMA_VERSION);

  const n = AIDN.note.createNote({ contentText: "new" });
  await repo.save(n);
  assert.equal((await repo.list()).length, 2);

  await repo.delete(n.id);
  assert.equal((await repo.list()).length, 1);

  assert.equal(await repo.clear(), 1);
  assert.equal((await repo.list()).length, 0);
});
