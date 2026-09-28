// 本地优先云同步。上传快照与应答分离；应答不清除期间发生的新修改。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const isSample = n => Boolean(n.metadata?.isSample || n.id?.startsWith("note_sample_"));
  const stamp = n => Date.parse(n.updatedAt || n.createdAt) || 0;
  function createCloudSyncNoteRepo({ localRepo, kv, fetchFn }) {
    if (!localRepo?.transact) throw new Error("云同步需要支持事务的本地仓库");
    const fetchCall = fetchFn || (typeof fetch !== "undefined" ? fetch.bind(global) : null);
    const META = "aidn_sync_metadata";
    let queue = Promise.resolve();
    const repo = {
      save(note) {
        return localRepo.save({ ...note, metadata: { ...note.metadata, dirty: true } });
      },
      list: () => localRepo.list(),
      update(id, patch) {
        return localRepo.transact(all => {
          const i = all.findIndex(n => n.id === id && !n.deletedAt);
          if (i < 0) return { notes: all, result: null };
          const updatedAt = new Date(Math.max(Date.now(), stamp(all[i]) + 1, Date.parse(patch.updatedAt) || 0)).toISOString();
          all[i] = { ...all[i], ...patch, updatedAt, metadata: { ...all[i].metadata, ...patch.metadata, dirty: true } };
          return { notes: all, result: all[i] };
        });
      },
      delete: id => localRepo.delete(id),
      clear: () => localRepo.clear(),
      sync(options = {}) {
        const next = queue.then(() => sync(options));
        queue = next.catch(() => {});
        return next;
      },
    };
    async function sync({ syncEndpoint, userToken, settings, forceFull, fetchOverride } = {}) {
      let url = (syncEndpoint || "").trim();
      if (url && !url.endsWith("/api/sync") && !url.includes("/api/")) url = url.replace(/\/+$/, "") + "/api/sync";
      const doFetch = fetchOverride || fetchCall;
      if (!url || !doFetch) return { ok: true, offline: true, syncedCount: 0, serverUpdatesCount: 0 };
      const meta = kv ? (await kv.get(META))[META] || {} : {};
      let full = Boolean(forceFull || meta.lastCloudEndpoint !== url);
      // 两次以内：服务端存储被重建时，不确认第一次上传，重新提交全量本地基线。
      for (let attempt = 0; attempt < 2; attempt++) {
        const all = await localRepo.list({ includeDeleted: true });
        const deltas = all.filter(n => !isSample(n) && (full || n.metadata?.dirty || !n.metadata?.syncedAt));
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller && setTimeout(() => controller.abort(), 30000);
        let data;
        try {
          const resp = await doFetch(url, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${(userToken || "").trim()}` },
            signal: controller?.signal,
            body: JSON.stringify({ token: (userToken || "").trim(), protocolVersion: 2, storageId: full ? null : meta.storageId,
              lastSyncAt: full ? null : meta.lastCloudSyncAt || null, deltas, settings: settings || null }),
          });
          if (resp.status === 409 && !full) { full = true; continue; }
          if (!resp.ok) throw new Error(resp.status === 426 ? "请升级所有设备的客户端后再同步" : `云端同步失败 [HTTP ${resp.status}]`);
          data = await resp.json();
        } finally { if (timer) clearTimeout(timer); }
        if (!data || !Array.isArray(data.notes) || !Number.isFinite(Date.parse(data.serverTime))) throw new Error("云端返回无效同步数据");
        const serverTime = data.serverTime;
        const snapshots = new Map(deltas.map(n => [n.id, n]));
        const serverUpdatesCount = await localRepo.transact(current => {
          const map = new Map(current.map(n => [n.id, n]));
          // 比对完整快照，避免同毫秒更新或部分补丁丢失。
          for (const [id, sent] of snapshots) {
            const now = map.get(id);
            if (now && JSON.stringify(now) === JSON.stringify(sent)) map.set(id, { ...now, metadata: { ...now.metadata, dirty: false, syncedAt: serverTime } });
          }
          let changed = 0;
          for (const incoming of data.notes) {
            if (!incoming || typeof incoming.id !== "string" || isSample(incoming)) continue;
            if (!Number.isFinite(Date.parse(incoming.updatedAt || incoming.createdAt))) throw new Error("云端笔记时间无效");
            const local = map.get(incoming.id);
            if (!local || stamp(incoming) > stamp(local) || stamp(incoming) === stamp(local) && !local.metadata?.dirty && (!local.deletedAt || incoming.deletedAt)) {
              map.set(incoming.id, { ...incoming, metadata: { ...incoming.metadata, dirty: false, syncedAt: incoming.metadata?.syncedAt || serverTime } });
              changed++;
            }
          }
          return { notes: Array.from(map.values()), result: changed };
        });
        if (kv) await kv.set({ [META]: { lastCloudEndpoint: url, lastCloudSyncAt: serverTime, storageId: data.storageId || null } });
        return { ok: true, syncedCount: deltas.length, serverUpdatesCount, timestamp: serverTime, settings: data.settings || null };
      }
      throw new Error("云端存储连续重建，请稍后重试");
    }
    return repo;
  }
  AIDN.createCloudSyncNoteRepo = createCloudSyncNoteRepo;
})(typeof self !== "undefined" ? self : globalThis);
