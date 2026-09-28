const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/load");
const AIDN = load("core/settings.js", "adapters/chrome/kv.js", "adapters/chrome/runtime-server.js");
test("配置仅真实变动增加版本，最新远端可轮换或清空 Key", () => {
  const one = AIDN.settings.change({}, { deepseekApiKey: "test-one" });
  assert.ok(one.updatedAt);
  assert.equal(AIDN.settings.change(one, one).updatedAt, one.updatedAt);
  const two = AIDN.settings.change(one, { deepseekApiKey: "test-two", deepseekModel: "new-model" });
  assert.ok(Date.parse(two.updatedAt) > Date.parse(one.updatedAt));
  assert.deepEqual(AIDN.settings.mergeRemote(one, two), two);
  const clear = AIDN.settings.change(two, { deepseekApiKey: "" });
  assert.equal(AIDN.settings.mergeRemote(two, clear).deepseekApiKey, "");
  assert.equal(AIDN.settings.mergeRemote(clear, two).deepseekApiKey, "");
});
test("同步期间本机保存的配置不被过时应答覆盖；同步修改触发刷新", async () => {
  const kv = AIDN.createMemoryKV(); let listener; let broadcasts = [];
  let release, started;
  const waiting = new Promise(r => started = r);
  const repo = { sync: () => { started(); return new Promise(r => release = r); } };
  const server = AIDN.createRuntimeNoteServer({ repo, kv, runtime: {
    onMessage: { addListener: fn => listener = fn }, sendMessage: msg => { broadcasts.push(msg); },
  } });
  const first = await server.patchSettings({ deepseekApiKey: "first" });
  const pending = new Promise(resolve => listener({ __aidn: true, action: "sync.now" }, {}, resolve));
  await waiting;
  const latest = await server.patchSettings({ deepseekApiKey: "latest" });
  release({ settings: { ...first }, serverUpdatesCount: 1 });
  assert.equal((await pending).ok, true);
  assert.equal((await server.getSettings()).deepseekApiKey, latest.deepseekApiKey);
  assert.ok(broadcasts.some(m => m.payload.kind === "sync"));
});

test("同时间异值共享配置按稳定字段顺序收敛，不反复覆盖", () => {
  const a = AIDN.settings.normalize({ deepseekApiKey: "test-a", updatedAt: "2026-09-28T00:00:00Z" });
  const b = AIDN.settings.normalize({ deepseekApiKey: "test-b", updatedAt: "2026-09-28T00:00:00.000Z" });
  assert.equal(AIDN.settings.mergeRemote(a, b).deepseekApiKey, "test-b");
  assert.equal(AIDN.settings.mergeRemote(b, a).deepseekApiKey, "test-b");
});

test("两端运行时消息入口并发追加批注保留双方并标记待同步", async () => {
  load("core/note.js", "adapters/chrome/storage-note-repo.js", "adapters/chrome/cloud-sync-note-repo.js", "adapters/chrome/runtime-client.js", "core/pipeline.js", "client/aidn.js");
  const kv = AIDN.createMemoryKV();
  const cloud = AIDN.createCloudSyncNoteRepo({ localRepo: AIDN.createStorageNoteRepo(kv), kv });
  await cloud.save(AIDN.note.createNote({ id: "same" }));
  let handler;
  const rt = { onMessage: { addListener: fn => handler = fn }, sendMessage: (msg, cb) => {
    if (cb) handler(msg, {}, cb);
  } };
  AIDN.createRuntimeNoteServer({ repo: cloud, kv, runtime: rt });
  const a = AIDN.createClient({ repo: AIDN.createRuntimeNoteClient(rt) });
  const b = AIDN.createClient({ repo: AIDN.createRuntimeNoteClient(rt) });
  await Promise.all([a.addThought("same", "one"), b.addThought("same", "two")]);
  const n = (await cloud.list())[0];
  assert.deepEqual(n.thoughts.map(t => t.text), ["one", "two"]);
  assert.equal(n.metadata.dirty, true);
  assert.ok(n.updatedAt);
});
