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
