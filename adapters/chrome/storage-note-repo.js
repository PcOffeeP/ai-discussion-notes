// adapters/chrome/storage-note-repo.js — NoteRepo 生产适配器。
// 拥有 storage key 与 v1→v2 迁移（list 时惰性迁移并回写）。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const NOTES_KEY = "notes";

  function createStorageNoteRepo(kv) {
    if (!kv) throw new Error("createStorageNoteRepo 需要 kv (KV port)");

    async function readAll() {
      const data = await kv.get(NOTES_KEY);
      const raw = data[NOTES_KEY] || [];
      let dirty = false;
      const notes = raw.map((n) => {
        const m = AIDN.note.migrate(n);
        if (m !== n) dirty = true;
        return m;
      }).filter(Boolean);
      if (dirty) await kv.set({ [NOTES_KEY]: notes }); // 惰性迁移回写
      return notes;
    }

    return {
      async save(note) {
        const all = await readAll();
        all.push(note);
        await kv.set({ [NOTES_KEY]: all });
        return note;
      },
      list: readAll,
      // update(id, patch)：patch 为部分字段对象，合并进原 note。
      // 契约必须是「补丁对象」而非函数：补丁要跨 chrome.runtime 消息边界，函数无法序列化。
      async update(id, patch) {
        const all = await readAll();
        const i = all.findIndex((n) => n.id === id);
        if (i === -1) return null;
        all[i] = Object.assign({}, all[i], patch);
        await kv.set({ [NOTES_KEY]: all });
        return all[i];
      },
      async delete(id) {
        const all = await readAll();
        await kv.set({ [NOTES_KEY]: all.filter((n) => n.id !== id) });
      },
      async clear() {
        const all = await readAll();
        await kv.set({ [NOTES_KEY]: [] });
        return all.length;
      },
    };
  }

  AIDN.createStorageNoteRepo = createStorageNoteRepo;
})(typeof self !== "undefined" ? self : globalThis);
