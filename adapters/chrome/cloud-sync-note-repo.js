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
      if (!kv) return { lastSyncAt: null, lastCloudEndpoint: null, lastCloudSyncAt: null };
      const data = await kv.get(SYNC_META_KEY);
      return data[SYNC_META_KEY] || { lastSyncAt: null, lastCloudEndpoint: null, lastCloudSyncAt: null };
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
        // 更新时打上 dirty 待同步标记与 updatedAt
        const enrichedPatch = Object.assign({}, patch, {
          updatedAt: patch.updatedAt || new Date().toISOString(),
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
      async sync({ syncEndpoint, userToken, settings, forceFull, fetchOverride } = {}) {
        let url = (syncEndpoint || "").trim();
        const token = (userToken || "").trim();
        const doFetch = fetchOverride || fetchCall;

        if (url && !url.endsWith("/api/sync") && !url.includes("/api/")) {
          // 自动补齐子路径，兼容用户直接填入服务基础域名 (如 https://xxx.onrender.com)
          url = url.replace(/\/+$/, "") + "/api/sync";
        }

        const all = await localRepo.list();
        const syncMeta = await getSyncMeta();
        const isCloudSync = Boolean(url && doFetch);

        const isSample = (n) => Boolean(n?.metadata?.isSample || (n?.id && String(n.id).startsWith("note_sample_")));

        let localDeltas = [];
        let lastSyncAtForPayload = null;

        if (isCloudSync) {
          const isNewEndpoint = !syncMeta.lastCloudEndpoint || syncMeta.lastCloudEndpoint !== url || Boolean(forceFull);
          if (isNewEndpoint) {
            // 首次连接到此云端地址，或者是切换了新的服务器地址，或强制全量同步：
            // 将所有本地真实笔记作为全量基线上传，并且向服务端请求全量数据（lastSyncAt 为 null）
            localDeltas = all.filter((n) => !isSample(n));
            lastSyncAtForPayload = null;
          } else {
            // 同一云端地址的后续增量同步：
            // 提取本地 dirty 标记为 true 或尚无 syncedAt 的增量
            localDeltas = all.filter(
              (n) => !isSample(n) && (n.metadata?.dirty === true || !n.metadata?.syncedAt)
            );
            lastSyncAtForPayload = syncMeta.lastCloudSyncAt || syncMeta.lastSyncAt || null;
          }
        } else {
          // 离线/单机模式：
          localDeltas = all.filter(
            (n) => n.metadata?.dirty === true || !n.metadata?.syncedAt
          );
        }

        if (!isCloudSync) {
          // 离线/单机模式：本地打上模拟已同步标记
          const now = new Date().toISOString();
          let changed = 0;
          for (const n of localDeltas) {
            n.metadata = Object.assign({}, n.metadata, { dirty: false, syncedAt: now });
            await localRepo.update(n.id, { metadata: n.metadata });
            changed++;
          }
          await setSyncMeta(Object.assign({}, syncMeta, { lastSyncAt: now }));
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
          lastSyncAt: lastSyncAtForPayload,
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

        // 2. 将远端更新合并进本地 (LWW 策略，优先比对 updatedAt)
        let serverUpdatesCount = 0;
        const currentLocal = await localRepo.list();
        const localMap = new Map(currentLocal.map((n) => [n.id, n]));

        for (const sNote of serverNotes) {
          if (!sNote || !sNote.id) continue;
          if (isSample(sNote)) continue;

          const localNote = localMap.get(sNote.id);
          if (!localNote) {
            // 远端新增，存入本地
            const incoming = Object.assign({}, sNote, {
              metadata: Object.assign({}, sNote.metadata, { dirty: false, syncedAt: serverTime }),
            });
            await localRepo.save(incoming);
            serverUpdatesCount++;
          } else {
            // 远端修改，比较更新时间戳 (优先比对 updatedAt，其次比对 createdAt)
            const localTime = localNote.updatedAt || localNote.createdAt || "";
            const remoteTime = sNote.updatedAt || sNote.createdAt || "";
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

        await setSyncMeta({
          lastSyncAt: serverTime,
          lastCloudSyncAt: serverTime,
          lastCloudEndpoint: url,
        });

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
