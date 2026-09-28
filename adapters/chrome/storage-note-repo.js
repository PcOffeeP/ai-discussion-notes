// 本地 NoteRepo：所有读改写共享同一个 KV 队列；一次 set 是提交边界。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const queues = new WeakMap();
  function createStorageNoteRepo(kv) {
    if (!kv) throw new Error("createStorageNoteRepo 需要 kv");
    function serialize(work) {
      const next = (queues.get(kv) || Promise.resolve()).then(work);
      queues.set(kv, next.catch(() => {}));
      return next;
    }
    async function readAll() {
      const data = await kv.get("notes");
      const raw = data.notes || [];
      if (!Array.isArray(raw)) throw new Error("笔记存储格式损坏，请先备份");
      const notes = raw.map(AIDN.note.migrate).filter(Boolean);
      if (notes.some((n, i) => n !== raw[i])) await kv.set({ notes });
      return notes;
    }
    // 仅限进程内适配器使用；函数不跨 runtime 消息边界。
    function transact(transform) {
      return serialize(async () => {
        const change = await transform(await readAll());
        if (!change || !Array.isArray(change.notes)) throw new Error("无效存储事务");
        await kv.set({ notes: change.notes });
        return change.result;
      });
    }
    return {
      transact,
      save(note) {
        return transact((all) => ({ notes: all.filter((n) => n.id !== note.id).concat(note), result: note }));
      },
      list(options = {}) {
        return serialize(async () => (await readAll()).filter((n) => options.includeDeleted || !n.deletedAt));
      },
      update(id, patch) {
        return transact((all) => {
          const i = all.findIndex((n) => n.id === id && !n.deletedAt);
          if (i === -1) return { notes: all, result: null };
          all[i] = Object.assign({}, all[i], patch);
          return { notes: all, result: all[i] };
        });
      },
      delete(id) { return transact((all) => ({ notes: all.filter((n) => n.id !== id) })); },
      clear() { return transact((all) => ({ notes: [], result: all.filter((n) => !n.deletedAt).length })); },
    };
  }
  AIDN.createStorageNoteRepo = createStorageNoteRepo;
})(typeof self !== "undefined" ? self : globalThis);
