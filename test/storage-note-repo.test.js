// storage-note-repo 的 update 契约：「补丁对象合并」，而非「函数变换」。
// 背景：补丁需跨 chrome.runtime 消息边界（runtime-client → runtime-server），
// 函数无法序列化；旧实现 update(id, fn) 把消息里的 patch 对象当函数调用，
// 导致想法便利贴 ⌘/Ctrl+Enter 保存每次都抛 TypeError、数据落不了库。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load.js");

const AIDN = load(
  "core/note.js",
  "core/normalize.js",
  "core/html-to-markdown.js",
  "core/pipeline.js",
  "client/aidn.js",
  "adapters/chrome/kv.js",
  "adapters/chrome/storage-note-repo.js"
);

function makeNote(id, over) {
  return AIDN.note.createNote({
    text: `内容 ${id}`,
    source: "ChatGPT",
    sourceType: "chat",
    ...over,
  });
}

test("update(id, patch)：补丁字段合并进原 note，其余字段保留", async () => {
  const kv = AIDN.createMemoryKV();
  const repo = AIDN.createStorageNoteRepo(kv);
  const saved = await repo.save(makeNote("n1", { conversationTitle: "原对话" }));

  const updated = await repo.update(saved.id, { thoughts: [{ id: "t1", text: "hi", createdAt: new Date().toISOString() }] });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.conversationTitle, "原对话"); // 未补丁字段不动
  assert.equal(updated.thoughts.length, 1);
  const back = await repo.list();
  assert.equal(back[0].thoughts.length, 1);
});

test("update：未知 id 返回 null 且不写入", async () => {
  const kv = AIDN.createMemoryKV();
  const repo = AIDN.createStorageNoteRepo(kv);
  await repo.save(makeNote("n1"));
  const result = await repo.update("不存在", { thoughts: [] });
  assert.equal(result, null);
  assert.equal((await repo.list())[0].thoughts.length, 0);
});

test("update：addThought/removeThought 的完整读写回路", async () => {
  const kv = AIDN.createMemoryKV();
  const repo = AIDN.createStorageNoteRepo(kv);
  const client = AIDN.createClient({ repo });
  const saved = await client.advanced.saveRaw({
    text: "一段讨论",
    source: "Kimi",
    sourceType: "chat",
  });

  const t = await client.addThought(saved.id, "第一个想法");
  assert.ok(t && t.text === "第一个想法");
  let notes = await client.all();
  assert.equal(notes[0].thoughts.length, 1);

  assert.ok(await client.removeThought(saved.id, t.id));
  notes = await client.all();
  assert.equal(notes[0].thoughts.length, 0);
});

test("并行保存与更新跨同一个 KV 的仓库实例保持完整", async () => {
  const kv = AIDN.createMemoryKV();
  const a = AIDN.createStorageNoteRepo(kv);
  const b = AIDN.createStorageNoteRepo(kv);
  await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).save(AIDN.note.createNote({ id: `n${i}`, contentText: "原文" }))));
  assert.equal((await a.list()).length, 30);
  await Promise.all([a.update("n1", { conversationTitle: "标题" }), b.update("n1", { contentText: "修改" }), a.delete("n2")]);
  const notes = await b.list();
  assert.equal(notes.length, 29);
  assert.equal(notes.find(n => n.id === "n1").conversationTitle, "标题");
  assert.equal(notes.find(n => n.id === "n1").contentText, "修改");
  notes[0].contentText = "不能泄露引用";
  assert.notEqual((await b.list())[0].contentText, "不能泄露引用");
});

test("事务写失败不改变原库，队列恢复后可继续提交", async () => {
  const memory = AIDN.createMemoryKV();
  let fail = false;
  const kv = { get: memory.get, set: async items => { if (fail) throw new Error("quota"); await memory.set(items); } };
  const repo = AIDN.createStorageNoteRepo(kv);
  await repo.save(AIDN.note.createNote({ id: "original" }));
  fail = true;
  await assert.rejects(repo.transact(() => ({ notes: [] })), /quota/);
  assert.equal((await repo.list()).length, 1);
  fail = false;
  await repo.save(AIDN.note.createNote({ id: "next" }));
  assert.equal((await repo.list()).length, 2);
});

test("并行追加批注的整个操作原子化；追加与删除不覆盖其他批注", async () => {
  const repo = AIDN.createStorageNoteRepo(AIDN.createMemoryKV());
  await repo.save(AIDN.note.createNote({ id: "thoughts" }));
  const client = AIDN.createClient({ repo });
  const added = await Promise.all([client.addThought("thoughts", "first"), client.addThought("thoughts", "second")]);
  assert.deepEqual((await repo.list())[0].thoughts.map(t => t.text), ["first", "second"]);
  await Promise.all([client.removeThought("thoughts", added[0].id), client.addThought("thoughts", "third")]);
  assert.deepEqual((await repo.list())[0].thoughts.map(t => t.text), ["second", "third"]);
  assert.equal(await client.addThought("missing", "lost"), null);
});
