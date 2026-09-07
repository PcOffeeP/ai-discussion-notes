// notes/notes.js — Notes 页：列表 / 搜索 / 卡片操作 / 设置。
// 数据访问只有主路径四行：aidn.all() / aidn.search() / aidn.remove() / advanced.*
(function () {
  const AIDN = window.AIDN;
  const aidn = AIDN.createClient({ repo: AIDN.createRuntimeNoteClient() });

  const listEl = document.getElementById("notes-list");
  const emptyEl = document.getElementById("empty-state");
  const noResultsEl = document.getElementById("no-results");
  const searchEl = document.getElementById("search");
  const noteCountEl = document.getElementById("note-count");
  const captureToggle = document.getElementById("capture-toggle");

  let allNotes = [];
  let query = "";
  const rawViewIds = new Set(); // 处于 Markdown 源码视图的卡片

  // Markdown 渲染（vendored markdown-it + DOMPurify）
  const md = window.markdownit ? window.markdownit({ linkify: true }) : null;
  function renderMarkdown(source) {
    const text = source || "";
    if (!md) {
      const p = document.createElement("p");
      p.textContent = text;
      return p;
    }
    const clean = window.DOMPurify ? DOMPurify.sanitize(md.render(text)) : md.render(text);
    const wrapper = document.createElement("div");
    wrapper.className = "note-md";
    wrapper.innerHTML = clean;
    wrapper.querySelectorAll("a[href]").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener";
    });
    return wrapper;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return (
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  }

  function buildContentEl(note) {
    if (rawViewIds.has(note.id)) {
      const pre = document.createElement("pre");
      pre.className = "note-content note-raw";
      pre.textContent = note.contentMarkdown || note.contentText || "";
      return pre;
    }
    const el = renderMarkdown(note.contentMarkdown || note.contentText);
    el.classList.add("note-content");
    return el;
  }

  async function refresh() {
    allNotes = query ? await aidn.search(query) : await aidn.all();
    render();
  }

  function render() {
    listEl.innerHTML = "";
    emptyEl.classList.toggle("hidden", allNotes.length !== 0);
    noResultsEl.classList.toggle(
      "hidden",
      !(query && allNotes.length === 0)
    );

    for (const note of allNotes) {
      const li = document.createElement("li");
      li.className = "note-card";

      const content = buildContentEl(note);

      const meta = document.createElement("div");
      meta.className = "note-meta";
      const parts = [note.source || "unknown"];
      if (note.conversationTitle) parts.push(note.conversationTitle);
      parts.push(formatDate(note.createdAt));
      meta.textContent = parts.join(" · ");

      const actions = document.createElement("div");
      actions.className = "note-actions";

      const rawBtn = document.createElement("button");
      rawBtn.textContent = rawViewIds.has(note.id) ? "Preview" : "Markdown";
      rawBtn.title = "Toggle Markdown source / rendered view";
      rawBtn.addEventListener("click", () => {
        if (rawViewIds.has(note.id)) rawViewIds.delete(note.id);
        else rawViewIds.add(note.id);
        li.replaceChild(buildContentEl(note), li.querySelector(".note-content"));
        rawBtn.textContent = rawViewIds.has(note.id) ? "Preview" : "Markdown";
      });

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(note.contentMarkdown || note.contentText || "");
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
        } catch (_) { /* clipboard unavailable */ }
      });

      const openBtn = document.createElement("button");
      openBtn.textContent = "Open Source";
      openBtn.disabled = !note.conversationUrl;
      openBtn.addEventListener("click", () => {
        if (note.conversationUrl) window.open(note.conversationUrl, "_blank", "noopener");
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        await aidn.remove(note.id);
        rawViewIds.delete(note.id);
        await refresh();
      });

      actions.append(rawBtn, copyBtn, openBtn, delBtn);
      li.append(actions, content, meta);
      listEl.appendChild(li);
    }
  }

  // ---- search ----
  let searchTimer = null;
  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      query = searchEl.value.trim();
      await refresh();
    }, 120);
  });

  // ---- settings ----
  const overlay = document.getElementById("settings-overlay");
  const panel = document.getElementById("settings-panel");
  const openSettings = () => { overlay.classList.remove("hidden"); panel.classList.remove("hidden"); };
  const closeSettings = () => { overlay.classList.add("hidden"); panel.classList.add("hidden"); };
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  overlay.addEventListener("click", closeSettings);

  captureToggle.addEventListener("change", async () => {
    await aidn.advanced.settings?.patch({ captureButtonEnabled: captureToggle.checked });
  });

  document.getElementById("export-btn").addEventListener("click", async () => {
    const notes = await aidn.advanced.exportAll();
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-discussion-notes-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("clear-btn").addEventListener("click", async () => {
    if (!confirm("Delete all saved notes? This cannot be undone.")) return;
    await aidn.advanced.clearAll();
    await refresh();
    updateCount();
  });

  async function updateCount() {
    const notes = await aidn.advanced.exportAll();
    noteCountEl.textContent = String(notes.length);
  }

  // ---- init ----
  (async function init() {
    const settings = await aidn.advanced.settings?.get();
    captureToggle.checked = settings ? settings.captureButtonEnabled !== false : true;
    await refresh();
    updateCount();
  })();
})();
