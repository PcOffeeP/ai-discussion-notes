// adapters/chrome/cloud-sync-note-repo.js — RFC-003 云端增量同步适配器。
// 包装底层本地 NoteRepo，实现 Local-First 存储契约与断网/联网增量数据双向同步。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  function createCloudSyncNoteRepo({ localRepo, kv, fetchFn }) {
    if (!localRepo) {
      throw new Error("createCloudSyncNoteRepo 需要 localRepo (底层本地持久化适配器)");
    }
    const fetchCall = fetchFn || (typeof fetch !== "undefined" ? fetch.bind(global) : null);
    const SYNC_META_KEY = "aidn_sync_metadata";

    async function getSyncMeta() {
      if (!kv) return { lastSyncAt: null };
      const data = await kv.get(SYNC_META_KEY);
      return data[SYNC_META_KEY] || { lastSyncAt: null };
    }

    async function setSyncMeta(meta) {
      if (!kv) return;
      await kv.set({ [SYNC_META_KEY]: meta });
    }

    // ---- NoteRepo 核心契约 (完全委托 localRepo，保持 Local-First 秒级响应) ----
    const repo = {
      async save(note) {
        // 新建笔记打上 dirty 待同步标记
        const enriched = Object.assign({}, note, {
          metadata: Object.assign({}, note.metadata, { dirty: true }),
        });
        return localRepo.save(enriched);
      },

      async list() {
        return localRepo.list();
      },

      async update(id, patch) {
        // 更新时打上 dirty 待同步标记
        const enrichedPatch = Object.assign({}, patch, {
          metadata: Object.assign({}, patch.metadata, { dirty: true }),
        });
        return localRepo.update(id, enrichedPatch);
      },

      async delete(id) {
        return localRepo.delete(id);
      },

      async clear() {
        return localRepo.clear();
      },

      // ---- 增量同步协议 (Delta Sync) ----
      async sync({ syncEndpoint, userToken, settings, fetchOverride } = {}) {
        const url = (syncEndpoint || "").trim();
        const token = (userToken || "").trim();
        const doFetch = fetchOverride || fetchCall;

        const all = await localRepo.list();
        const syncMeta = await getSyncMeta();

        // 提取本地未同步或被修改的增量 (dirty 或无 syncedAt)
        const localDeltas = all.filter(
          (n) => n.metadata?.dirty === true || !n.metadata?.syncedAt
        );

        if (!url || !doFetch) {
          // 离线/单机模式：本地打上模拟已同步标记
          const now = new Date().toISOString();
          let changed = 0;
          for (const n of localDeltas) {
            n.metadata = Object.assign({}, n.metadata, { dirty: false, syncedAt: now });
            await localRepo.update(n.id, { metadata: n.metadata });
            changed++;
          }
          await setSyncMeta({ lastSyncAt: now });
          return {
            ok: true,
            syncedCount: changed,
            serverUpdatesCount: 0,
            timestamp: now,
            offline: true,
          };
        }

        const payload = {
          token,
          lastSyncAt: syncMeta.lastSyncAt,
          deltas: localDeltas,
          settings: settings || null,
        };

        const resp = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`云端同步失败 [HTTP ${resp.status}]: ${errText.slice(0, 100)}`);
        }

        const resData = await resp.json();
        const serverTime = resData.serverTime || new Date().toISOString();
        const serverNotes = Array.isArray(resData.notes) ? resData.notes : [];

        // 1. 本地增量标记为已同步
        for (const n of localDeltas) {
          const mergedMeta = Object.assign({}, n.metadata, {
            dirty: false,
            syncedAt: serverTime,
          });
          await localRepo.update(n.id, { metadata: mergedMeta });
        }

        // 2. 将远端更新合并进本地 (LWW 策略)
        let serverUpdatesCount = 0;
        const currentLocal = await localRepo.list();
        const localMap = new Map(currentLocal.map((n) => [n.id, n]));

        for (const sNote of serverNotes) {
          if (!sNote || !sNote.id) continue;
          const localNote = localMap.get(sNote.id);
          if (!localNote) {
            // 远端新增，存入本地
            const incoming = Object.assign({}, sNote, {
              metadata: Object.assign({}, sNote.metadata, { dirty: false, syncedAt: serverTime }),
            });
            await localRepo.save(incoming);
            serverUpdatesCount++;
          } else {
            // 远端修改，比较更新时间戳
            const localTime = localNote.createdAt;
            const remoteTime = sNote.createdAt;
            if (remoteTime >= localTime) {
              const updated = Object.assign({}, localNote, sNote, {
                metadata: Object.assign({}, localNote.metadata, sNote.metadata, {
                  dirty: false,
                  syncedAt: serverTime,
                }),
              });
              await localRepo.update(sNote.id, updated);
              serverUpdatesCount++;
            }
          }
        }

        await setSyncMeta({ lastSyncAt: serverTime });

        return {
          ok: true,
          syncedCount: localDeltas.length,
          serverUpdatesCount,
          timestamp: serverTime,
          settings: resData.settings || null,
        };
      },
    };

    return repo;
  }

  AIDN.createCloudSyncNoteRepo = createCloudSyncNoteRepo;
})(typeof self !== "undefined" ? self : globalThis);
