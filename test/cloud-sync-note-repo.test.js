// test/cloud-sync-note-repo.test.js — 云端增量同步适配器测试。
const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./helpers/load");

const AIDN = load(
  "core/note.js",
  "adapters/chrome/kv.js",
  "adapters/chrome/storage-note-repo.js",
  "adapters/chrome/cloud-sync-note-repo.js"
);

function makeRepos() {
  const kv = AIDN.createMemoryKV();
  const localRepo = AIDN.createStorageNoteRepo(kv);
  const syncRepo = AIDN.createCloudSyncNoteRepo({ localRepo, kv });
  return { kv, localRepo, syncRepo };
}

test("cloudSyncNoteRepo: 保存与更新自动打上 dirty: true", async () => {
  const { syncRepo } = makeRepos();
  const note = AIDN.note.createNote({ contentText: "测试" });
  await syncRepo.save(note);

  const list = await syncRepo.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].metadata.dirty, true);

  await syncRepo.update(note.id, { contentText: "更新" });
  const updatedList = await syncRepo.list();
  assert.equal(updatedList[0].contentText, "更新");
  assert.equal(updatedList[0].metadata.dirty, true);
});

test("cloudSyncNoteRepo: 离线同步将 dirty 增量清空并加上 syncedAt", async () => {
  const { syncRepo } = makeRepos();
  const note = AIDN.note.createNote({ contentText: "离线测试" });
  await syncRepo.save(note);

  const res = await syncRepo.sync(); // 无 URL 为单机离线模式
  assert.equal(res.ok, true);
  assert.equal(res.syncedCount, 1);
  assert.equal(res.offline, true);

  const list = await syncRepo.list();
  assert.equal(list[0].metadata.dirty, false);
  assert.ok(list[0].metadata.syncedAt);
});

test("cloudSyncNoteRepo: 云端增量双向同步与 LWW 合并", async () => {
  const { syncRepo, localRepo } = makeRepos();

  // 本地新增一条笔记
  const localNote = AIDN.note.createNote({
    id: "n_loc_1",
    contentText: "本地笔记",
    createdAt: "2026-09-25T10:00:00Z",
  });
  await syncRepo.save(localNote);

  let sentPayload = null;
  const mockServerTime = "2026-09-25T12:00:00Z";
  const mockFetch = async (url, options) => {
    sentPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        serverTime: mockServerTime,
        notes: [
          {
            id: "n_rem_1",
            schemaVersion: 3,
            contentMarkdown: "远端新笔记",
            contentText: "远端新笔记",
            source: "DeepSeek",
            sourceType: "chat",
            createdAt: "2026-09-25T11:00:00Z",
            metadata: {},
            thoughts: [],
          },
        ],
      }),
    };
  };

  const syncRes = await syncRepo.sync({
    syncEndpoint: "https://api.example.com/sync",
    userToken: "test_token",
    fetchOverride: mockFetch,
  });

  assert.equal(syncRes.ok, true);
  assert.equal(sentPayload.token, "test_token");
  assert.equal(sentPayload.deltas.length, 1);
  assert.equal(sentPayload.deltas[0].id, "n_loc_1");

  // 检查合并后数据：本地笔记 dirty 为 false，远端笔记被存入
  const allNotes = await localRepo.list();
  assert.equal(allNotes.length, 2);

  const lNote = allNotes.find((n) => n.id === "n_loc_1");
  assert.equal(lNote.metadata.dirty, false);
  assert.equal(lNote.metadata.syncedAt, mockServerTime);

  const rNote = allNotes.find((n) => n.id === "n_rem_1");
  assert.equal(rNote.contentText, "远端新笔记");
  assert.equal(rNote.metadata.syncedAt, mockServerTime);
});
