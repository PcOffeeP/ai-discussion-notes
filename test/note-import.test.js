const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/load");
const AIDN = load("core/note.js", "core/note-import.js", "adapters/chrome/kv.js", "adapters/chrome/storage-note-repo.js");
const make = (id, text, time = "2026-09-28T00:00:00Z") => AIDN.note.createNote({ id, contentText: text, createdAt: time });
test("导入完整校验，保留无关笔记，按数值时间合并，等时异文保留副本", async () => {
  const original = make("same", "first");
  const current = [original, make("keep", "untouched")];
  const incoming = AIDN.noteImport.validate([make("same", "second", "2026-09-28T00:00:00.000Z"), make("new", "new")]);
  const result = AIDN.noteImport.merge(current, incoming);
  assert.equal(result.result.conflicts, 1);
  assert.equal(result.notes.length, 4);
  assert.equal(result.notes.find(n => n.id === "same").contentText, "first");
  assert.equal(result.notes.find(n => n.metadata.importedConflictOf === "same").contentText, "second");
  const next = AIDN.noteImport.merge(current, [make("same", "latest", "2026-09-28T00:00:01Z")]);
  assert.equal(next.notes.length, 2);
  assert.equal(next.notes.find(n => n.id === "same").contentText, "latest");
  for (const invalid of [[null], [original, { id: "bad" }], [original, original], [{ ...original, thoughts: [null] }], [{ ...original, sourceType: 12 }], [{ ...original, createdAt: [2026] }]]) assert.throws(() => AIDN.noteImport.validate(invalid));
});
test("导入配额失败是一次提交，原库完整保留", async () => {
  const memory = AIDN.createMemoryKV({ notes: [make("original", "keep")] });
  const repo = AIDN.createStorageNoteRepo({ get: memory.get, set: async () => { throw new Error("quota"); } });
  await assert.rejects(repo.transact(all => AIDN.noteImport.merge(all, [make("new", "added")])), /quota/);
  assert.deepEqual((await repo.list()).map(n => n.id), ["original"]);
});

test("无版本纯文本旧档导入不丢正文、批注和更新时间", () => {
  const old = { id: "old", contentText: "唯一正文", createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z", thoughts: [{ id: "t", text: "批注", createdAt: "2026-09-28T00:00:00Z" }] };
  const [migrated] = AIDN.noteImport.validate([old]);
  assert.equal(migrated.contentMarkdown, old.contentText);
  assert.equal(migrated.contentText, old.contentText);
  assert.equal(migrated.updatedAt, old.updatedAt);
  assert.equal(migrated.thoughts[0].text, "批注");
});
