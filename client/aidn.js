// client/aidn.js — 主路径外衣：调用方唯一可见的 API。
// 纪律：主路径（save/all/search/remove）必须实现为 advanced 能力的薄封装，
// 保证二级路径被默认流量持续检验。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  /**
   * createClient({ repo, source? })
   *   repo:   NoteRepo（SW 内为真实 repo；content/notes page 为 runtime client）
   *   source: CaptureSource（仅 content script 提供，用于 save() 采集选区）
   */
  function createClient({ repo, source } = {}) {
    if (!repo) throw new Error("createClient 需要 repo (NoteRepo 或其远程门面)");
    const pipeline = AIDN.createPipeline({ repo });

    const client = {
      // ---- 主路径 ----
      async save() {
        if (!source) throw new Error("当前上下文没有 CaptureSource，请用 advanced.saveRaw");
        const raw = source.captureSelection();
        if (!raw) return null;
        return pipeline(raw);
      },
      async all() {
        const notes = await repo.list();
        return notes.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      },
      async search(query) {
        return AIDN.note.search(await client.all(), query);
      },
      async remove(id) {
        await repo.delete(id);
        return true;
      },
      // ---- 想法（便利贴） ----
      async addThought(id, text) {
        const thought = AIDN.note.createThought(text);
        if (!thought.text) return null;
        const note = (await repo.list()).find((n) => n.id === id);
        const thoughts = [...(note && Array.isArray(note.thoughts) ? note.thoughts : []), thought];
        await repo.update(id, { thoughts });
        return thought;
      },
      async removeThought(id, thoughtId) {
        const note = (await repo.list()).find((n) => n.id === id);
        if (!note) return false;
        const thoughts = (Array.isArray(note.thoughts) ? note.thoughts : [])
          .filter((t) => t.id !== thoughtId);
        await repo.update(id, { thoughts });
        return true;
      },

      // ---- 二级 API ----
      advanced: {
        // 非 DOM 来源（桌面 Agent / 右键菜单纯文本）走这里
        saveRaw: (raw) => pipeline(raw),
        registerSiteProfile: (p) => AIDN.registerSiteProfile(p),
        registerSerializer: (s) => AIDN.registerSerializer(s),
        async exportAll() {
          return client.all();
        },
        async clearAll() {
          return repo.clear();
        },
        settings: repo.getSettings
          ? {
              get: () => repo.getSettings(),
              patch: (p) => repo.patchSettings(p),
            }
          : null,
      },
    };
    return client;
  }

  AIDN.createClient = createClient;
})(typeof self !== "undefined" ? self : globalThis);
