// test/sync-server.test.js — 验证个人免绑定云同步网关与 cloudSyncNoteRepo 的端到端协同
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSyncServer } = require("../server/sync-server.js");
require("../core/note.js");
require("../adapters/chrome/kv.js");
require("../adapters/chrome/storage-note-repo.js");
require("../adapters/chrome/cloud-sync-note-repo.js");

const AIDN = globalThis.AIDN;

test("sync-server: 未提供或错误的 Secret Token 返回 401", async () => {
  const tmpFile = path.resolve(__dirname, `../data/test-sync-${Date.now()}.json`);
  const serverInstance = createSyncServer({
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

test("sync-server: 双端通过同一 Token 完整实现增量上传、合并与跨端拉取", async () => {
  const tmpFile = path.resolve(__dirname, `../data/test-sync-${Date.now()}.json`);
  const secretToken = "my-private-passphrase-999";
  const serverInstance = createSyncServer({
    secretToken,
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
