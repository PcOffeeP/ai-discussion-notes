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
