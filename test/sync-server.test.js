// test/sync-server.test.js — 验证个人免绑定云同步网关与 cloudSyncNoteRepo 的端到端协同
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
function temporaryFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidn-sync-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "notes.json");
}

const { createSyncServer } = require("../server/sync-server.js");
require("../core/note.js");
require("../adapters/chrome/kv.js");
require("../adapters/chrome/storage-note-repo.js");
require("../adapters/chrome/cloud-sync-note-repo.js");

const AIDN = globalThis.AIDN;

test("sync-server: 未提供或错误的 Secret Token 返回 401", async (t) => {
  const tmpFile = temporaryFile(t);
  const serverInstance = createSyncServer({
    host: "127.0.0.1",
    secretToken: "my-custom-secret",
    storageFile: tmpFile,
  });
  const port = await serverInstance.listen(0);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltas: [] }),
    });
    assert.equal(res.status, 401);

    const resWrong = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ deltas: [] }),
    });
    assert.equal(resWrong.status, 401);
  } finally {
    await serverInstance.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test("sync-server: 双端通过同一 Token 完整实现增量上传、合并与跨端拉取", async (t) => {
  const tmpFile = temporaryFile(t);
  const secretToken = "my-private-passphrase-999";
  const serverInstance = createSyncServer({
    secretToken,
    host: "127.0.0.1",
    storageFile: tmpFile,
  });
  const port = await serverInstance.listen(0);
  const syncEndpoint = `http://127.0.0.1:${port}/api/sync`;

  try {
    // 模拟电脑端 Client A
    const kvA = AIDN.createMemoryKV();
    const localRepoA = AIDN.createStorageNoteRepo(kvA);
    const cloudRepoA = AIDN.createCloudSyncNoteRepo({
      localRepo: localRepoA,
      kv: kvA,
    });

    // 模拟手机端 Client B
    const kvB = AIDN.createMemoryKV();
    const localRepoB = AIDN.createStorageNoteRepo(kvB);
    const cloudRepoB = AIDN.createCloudSyncNoteRepo({
      localRepo: localRepoB,
      kv: kvB,
    });

    // 1. 电脑端录入一条笔记
    const noteA = AIDN.note.createNote({
      id: "note-from-desktop",
      source: "ChatGPT",
      conversationTitle: "DDD 架构防腐实战",
      contentMarkdown: "核心业务不可依赖持久化基础设施。",
    });
    await cloudRepoA.save(noteA);

    // 2. 电脑端触发同步上报
    const syncResA = await cloudRepoA.sync({
      syncEndpoint,
      userToken: secretToken,
    });
    assert.equal(syncResA.ok, true);
    assert.equal(syncResA.syncedCount, 1);

    // 服务端此时应有该笔记
    assert.equal(serverInstance.getNotes().length, 1);

    // 3. 手机端触发同步（第一次拉取）
    const syncResB1 = await cloudRepoB.sync({
      syncEndpoint,
      userToken: secretToken,
    });
    assert.equal(syncResB1.ok, true);
    assert.equal(syncResB1.serverUpdatesCount, 1);

    // 手机端本地已同步入库
    const notesInB = await cloudRepoB.list();
    assert.equal(notesInB.length, 1);
    assert.equal(notesInB[0].id, "note-from-desktop");
    assert.equal(notesInB[0].conversationTitle, "DDD 架构防腐实战");

    // 4. 手机端在地铁上随手做批注并保存
    const thought = AIDN.note.createThought("手机端新批注：防腐层必须使用接口隔离");
    await cloudRepoB.update("note-from-desktop", {
      thoughts: [thought],
    });

    // 手机端将批注同步上云
    const syncResB2 = await cloudRepoB.sync({
      syncEndpoint,
      userToken: secretToken,
    });
    assert.equal(syncResB2.ok, true);
    assert.equal(syncResB2.syncedCount, 1);

    // 5. 电脑端再次同步，拉取到手机端的批注回流
    const syncResA2 = await cloudRepoA.sync({
      syncEndpoint,
      userToken: secretToken,
    });
    assert.equal(syncResA2.ok, true);
    assert.equal(syncResA2.serverUpdatesCount, 1);

    const notesInAAfter = await cloudRepoA.list();
    assert.equal(notesInAAfter[0].thoughts.length, 1);
    assert.equal(notesInAAfter[0].thoughts[0].text, "手机端新批注：防腐层必须使用接口隔离");
  } finally {
    await serverInstance.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test("sync-server: 电脑端配置的 DeepSeek API Key 随同步自动推送到云端并在手机端拉取", async (t) => {
  const tmpFile = temporaryFile(t);
  const secretToken = "my-secret-settings-sync";
  const serverInstance = createSyncServer({
    secretToken,
    host: "127.0.0.1",
    storageFile: tmpFile,
  });
  const port = await serverInstance.listen(0);
  const syncEndpoint = `http://127.0.0.1:${port}/api/sync`;

  try {
    const kvDesktop = AIDN.createMemoryKV();
    const repoDesktop = AIDN.createCloudSyncNoteRepo({
      localRepo: AIDN.createStorageNoteRepo(kvDesktop),
      kv: kvDesktop,
    });

    const kvMobile = AIDN.createMemoryKV();
    const repoMobile = AIDN.createCloudSyncNoteRepo({
      localRepo: AIDN.createStorageNoteRepo(kvMobile),
      kv: kvMobile,
    });

    // 1. 电脑端同步，同时附带 DeepSeek 配置
    const desktopSyncRes = await repoDesktop.sync({
      syncEndpoint,
      userToken: secretToken,
      settings: {
        deepseekApiKey: "sk-test-secret-123456",
        deepseekBaseUrl: "https://api.deepseek.com/v1",
        deepseekModel: "deepseek-chat",
        updatedAt: new Date().toISOString(),
      },
    });
    assert.equal(desktopSyncRes.ok, true);

    // 服务端应已持有该配置
    assert.equal(serverInstance.getSettings().deepseekApiKey, "sk-test-secret-123456");

    // 2. 手机端初次同步（未传 key），应自动接收到服务端下发的 key
    const mobileSyncRes = await repoMobile.sync({
      syncEndpoint,
      userToken: secretToken,
      settings: null,
    });
    assert.equal(mobileSyncRes.ok, true);
    assert.ok(mobileSyncRes.settings);
    assert.equal(mobileSyncRes.settings.deepseekApiKey, "sk-test-secret-123456");
    assert.equal(mobileSyncRes.settings.deepseekBaseUrl, "https://api.deepseek.com/v1");
  } finally {
    await serverInstance.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test("无默认凭据；坏文件拒绝启动而不覆盖", t => {
  assert.throws(() => createSyncServer({ secretToken: "" }), /SYNC_SECRET_TOKEN/);
  assert.throws(() => createSyncServer({ secretToken: "aidn-default-secret" }), /默认/);
  const file = temporaryFile(t);
  fs.writeFileSync(file, "broken");
  assert.throws(() => createSyncServer({ secretToken: "test", storageFile: file }));
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
  for (const raw of ["null", "17", "{}", '{"notes":[null]}']) {
    fs.writeFileSync(file, raw);
    assert.throws(() => createSyncServer({ secretToken: "test", storageFile: file }), /格式损坏/);
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  }
});

test("落盘失败不确认、不修改内存或旧文件；重启恢复原库", async t => {
  const file = temporaryFile(t); let fail = false;
  const app = createSyncServer({ secretToken: "test", host: "127.0.0.1", storageFile: file,
    fs: { ...fs, renameSync: (...args) => { if (fail) throw new Error("disk full"); return fs.renameSync(...args); } } });
  const port = await app.listen(0);
  const send = body => fetch(`http://127.0.0.1:${port}/api/sync`, { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify(body) });
  try {
    const note = AIDN.note.createNote({ id: "one", contentText: "first" });
    assert.equal((await send({ deltas: [note] })).status, 200);
    const before = fs.readFileSync(file, "utf8");
    fail = true;
    assert.equal((await send({ deltas: [{ ...note, contentText: "lost", updatedAt: new Date(Date.now() + 1).toISOString() }] })).status, 503);
    assert.equal(app.getNotes()[0].contentText, "first");
    assert.equal(fs.readFileSync(file, "utf8"), before);
    for (const payload of [null, [], { settings: { deepseekApiKey: 123 } }, { deltas: [{ id: "bad" }] }]) assert.equal((await send(payload)).status, 400);
  } finally { await app.close(); }
  assert.equal(createSyncServer({ secretToken: "test", storageFile: file }).getNotes()[0].contentText, "first");
});

test("过大请求、畸形 Host 和非对象负载不破坏服务；空凭据启动无泄漏", async t => {
  const { spawnSync } = require("node:child_process");
  const startup = spawnSync(process.execPath, [path.join(__dirname, "../server/sync-server.js")], {
    env: { ...process.env, SYNC_SECRET_TOKEN: "" }, encoding: "utf8",
  });
  assert.equal(startup.status, 1);
  assert.doesNotMatch(startup.stdout + startup.stderr, /aidn-default-secret/);
  const app = createSyncServer({ secretToken: "test", host: "127.0.0.1", storageFile: temporaryFile(t), maxBodyBytes: 128 });
  const port = await app.listen(0);
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    const large = await fetch(endpoint + "/api/sync", { method: "POST", headers: { Authorization: "Bearer test" }, body: "x".repeat(256) });
    assert.equal(large.status, 413);
    const health = await fetch(endpoint + "/health", { headers: { Host: "bad:host:value" } });
    assert.equal(health.status, 200);
    const invalid = await fetch(endpoint + "/api/sync", { method: "POST", headers: { Authorization: "Bearer test" }, body: "null" });
    assert.equal(invalid.status, 400);
    assert.equal((await fetch(endpoint + "/health")).status, 200);
  } finally { await app.close(); }
});

test("同版本配置跨端收敛；清空后旧版本不能还原 Key", async t => {
  const app = createSyncServer({ secretToken: "test", host: "127.0.0.1", storageFile: temporaryFile(t) });
  const port = await app.listen(0);
  const send = async settings => (await fetch(`http://127.0.0.1:${port}/api/sync`, { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ settings, deltas: [] }) })).json();
  try {
    const a = { deepseekApiKey: "test-a", updatedAt: "2026-09-28T00:00:00Z" };
    const b = { deepseekApiKey: "test-b", updatedAt: "2026-09-28T00:00:00.000Z" };
    await send(a);
    const res = await send(b);
    assert.equal(res.settings.deepseekApiKey, "test-b");
    assert.equal(AIDN.settings.mergeRemote(a, res.settings).deepseekApiKey, "test-b");
    assert.equal((await send(a)).settings.deepseekApiKey, "test-b");
    const clear = { deepseekApiKey: "", updatedAt: "2026-09-28T00:00:01Z" };
    assert.equal((await send(clear)).settings.deepseekApiKey, "");
    assert.equal((await send(b)).settings.deepseekApiKey, "");
  } finally { await app.close(); }
});
