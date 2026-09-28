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
