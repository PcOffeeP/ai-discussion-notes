// Notes page logic: list, search, note actions, settings.
(function () {
  const listEl = document.getElementById("notes-list");
  const emptyEl = document.getElementById("empty-state");
  const noResultsEl = document.getElementById("no-results");
  const searchEl = document.getElementById("search");
  const noteCountEl = document.getElementById("note-count");
  const captureToggle = document.getElementById("capture-toggle");

  let allNotes = [];
  let query = "";
  const rawViewIds = new Set(); // note ids currently showing Markdown source

  // Markdown renderer (vendored markdown-it + DOMPurify for safe HTML).
  const md = window.markdownit
    ? window.markdownit({ linkify: true, breaks: false })
    : null;
  function renderMarkdown(source) {
    const text = source || "";
    if (!md) {
      const p = document.createElement("p");
      p.textContent = text;
      return p;
    }
    const rawHtml = md.render(text);
    const clean = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
    const wrapper = document.createElement("div");
    wrapper.className = "note-md";
    wrapper.innerHTML = clean;
    // open links in a new tab, never navigate the notes page
    wrapper.querySelectorAll("a[href]").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener";
    });
    return wrapper;
  }

  // ---- messaging helper ----
  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        resolve(chrome.runtime.lastError ? { ok: false } : resp);
      });
    });
  }

  // ---- rendering ----
  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function noteMatches(note, q) {
    const needle = q.toLowerCase();
    return (
      (note.content || "").toLowerCase().includes(needle) ||
      (note.conversationTitle || "").toLowerCase().includes(needle)
    );
  }

  function buildContentEl(note) {
    if (rawViewIds.has(note.id)) {
      const pre = document.createElement("pre");
      pre.className = "note-content note-raw";
      pre.textContent = note.content || "";
      return pre;
    }
    const el = renderMarkdown(note.content);
    el.classList.add("note-content");
    return el;
  }

  function render() {
    const visible = allNotes
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) // newest first
      .filter((n) => !query || noteMatches(n, query));

    listEl.innerHTML = "";
    emptyEl.classList.toggle("hidden", allNotes.length !== 0);
    noResultsEl.classList.toggle("hidden", !(allNotes.length > 0 && visible.length === 0));
    noteCountEl.textContent = String(allNotes.length);

    for (const note of visible) {
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
      const showRaw = rawViewIds.has(note.id);
      rawBtn.textContent = showRaw ? "Preview" : "Markdown";
      rawBtn.title = "Toggle Markdown source / rendered view";
      rawBtn.addEventListener("click", () => {
        if (rawViewIds.has(note.id)) rawViewIds.delete(note.id);
        else rawViewIds.add(note.id);
        // swap only this card's content element, keep the rest of the DOM
        const next = buildContentEl(note);
        li.replaceChild(next, li.querySelector(".note-content"));
        rawBtn.textContent = rawViewIds.has(note.id) ? "Preview" : "Markdown";
      });

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(note.content);
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
        await send({ type: "AIDN_DELETE_NOTE", id: note.id });
        allNotes = allNotes.filter((n) => n.id !== note.id);
        render();
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
    searchTimer = setTimeout(() => {
      query = searchEl.value.trim();
      render();
    }, 120);
  });

  // ---- settings ----
  const overlay = document.getElementById("settings-overlay");
  const panel = document.getElementById("settings-panel");

  function openSettings() {
    overlay.classList.remove("hidden");
    panel.classList.remove("hidden");
  }
  function closeSettings() {
    overlay.classList.add("hidden");
    panel.classList.add("hidden");
  }

  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  overlay.addEventListener("click", closeSettings);

  captureToggle.addEventListener("change", async () => {
    await send({ type: "AIDN_SET_SETTINGS", settings: { captureButtonEnabled: captureToggle.checked } });
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(allNotes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-discussion-notes-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("clear-btn").addEventListener("click", async () => {
    if (!confirm("Delete all saved notes? This cannot be undone.")) return;
    await send({ type: "AIDN_CLEAR_NOTES" });
    allNotes = [];
    render();
  });

  // ---- init ----
  (async function init() {
    const [notesResp, settingsResp] = await Promise.all([
      send({ type: "AIDN_LIST_NOTES" }),
      send({ type: "AIDN_GET_SETTINGS" }),
    ]);
    allNotes = notesResp.ok ? notesResp.notes || [] : [];
    captureToggle.checked = settingsResp.ok
      ? settingsResp.settings.captureButtonEnabled !== false
      : true;
    render();
  })();
})();
