// notes/notes.js — Notes 页（RFC-002）：对话分组 / sidebar 过滤 / 卡片折叠 / 相对时间。
// 数据访问只有主路径：aidn.all() / aidn.search() / aidn.remove() / advanced.*
(function () {
  const AIDN = window.AIDN;
  const aidn = AIDN.createClient({ repo: AIDN.createRuntimeNoteClient() });

  const groupsEl = document.getElementById("groups");
  const emptyEl = document.getElementById("empty-state");
  const noResultsEl = document.getElementById("no-results");
  const resultCountEl = document.getElementById("result-count");
  const searchEl = document.getElementById("search");
  const noteCountEl = document.getElementById("note-count");
  const captureToggle = document.getElementById("capture-toggle");
  const sideAll = document.getElementById("side-all");
  const countAll = document.getElementById("count-all");
  const sideSources = document.getElementById("side-sources");
  const sideConversations = document.getElementById("side-conversations");

  // ---- 状态 ----
  let allNotes = [];           // 全量（搜索前的基底）
  let query = "";
  let filter = { type: "all", value: null }; // sidebar 过滤：all | source | conversation
  let convExpanded = false;                 // sidebar Conversations 是否显示全部
  const CONV_PREVIEW = 10;                  // 默认只显示最近约 10 条对话
  const rawViewIds = new Set();
  const COLLAPSED_KEY = "aidn-collapsed-groups";
  const collapsedGroups = new Set(readJson(localStorage.getItem(COLLAPSED_KEY), []));

  function readJson(s, fallback) {
    try { return JSON.parse(s) || fallback; } catch (_) { return fallback; }
  }
  function persistCollapsed() {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedGroups]));
  }

  // ---- Markdown 渲染 ----
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

  // ---- 相对时间（重读场景："多久前"比"几月几号"更有意义） ----
  function relativeTime(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day === 1) return "昨天";
    if (day < 30) return `${day} 天前`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function absoluteTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString();
  }

  // ---- 过滤与分组派生 ----
  function applyFilter(notes) {
    let out = notes;
    if (filter.type === "source") out = out.filter((n) => (n.source || "unknown") === filter.value);
    if (filter.type === "conversation") out = out.filter((n) => AIDN.group.groupKeyOf(n) === filter.value);
    if (query) out = AIDN.note.search(out, query);
    return out;
  }

  // ---- Sidebar 渲染（计数始终基于全量 + 当前搜索词） ----
  function renderSidebar() {
    const base = query ? AIDN.note.search(allNotes, query) : allNotes;
    countAll.textContent = String(base.length);

    sideSources.innerHTML = "";
    for (const { source, count } of AIDN.group.countBySource(base)) {
      sideSources.appendChild(sideItem(
        source, count,
        filter.type === "source" && filter.value === source,
        () => setFilter({ type: "source", value: source }, `source=${encodeURIComponent(source)}`),
        sourceIconEl(source)
      ));
    }

    sideConversations.innerHTML = "";
    const convs = AIDN.group.groupByConversation(base);
    // 若当前选中的对话不在前 10 条内，自动展开，避免选中项不可见
    const activeOutside =
      filter.type === "conversation" &&
      convs.findIndex((g) => g.key === filter.value) >= CONV_PREVIEW;
    const expanded = convExpanded || activeOutside;
    for (const g of expanded ? convs : convs.slice(0, CONV_PREVIEW)) {
      const label = g.title || "未命名对话";
      const item = sideItem(
        label, String(g.count),
        filter.type === "conversation" && filter.value === g.key,
        () => setFilter({ type: "conversation", value: g.key }, `conv=${encodeURIComponent(g.key)}`),
        sourceIconEl(g.source)
      );
      // 来源由图标标识：悬浮时以 tooltip 形式保留文字信息
      item.title = `${label} — ${g.source}`;
      sideConversations.appendChild(item);
    }
    if (convs.length > CONV_PREVIEW) {
      const more = document.createElement("button");
      more.className = "side-more";
      more.textContent = expanded ? "收起" : `显示全部（${convs.length}）`;
      more.addEventListener("click", () => { convExpanded = !expanded; renderSidebar(); });
      sideConversations.appendChild(more);
    }
  }

  // ---- 平台图标（notes/icons/<platform>.svg；未知名平台用首字母圆点兜底） ----
  const KNOWN_ICON_SOURCES = new Set(["chatgpt", "kimi", "deepseek"]);
  function sourceIconEl(source) {
    const key = (source || "").toLowerCase();
    const icon = document.createElement("span");
    icon.className = "side-icon";
    icon.setAttribute("aria-hidden", "true");
    if (KNOWN_ICON_SOURCES.has(key)) {
      const img = document.createElement("img");
      img.src = `icons/${key}.svg`;
      img.alt = "";
      icon.appendChild(img);
    } else {
      icon.classList.add("side-icon-letter");
      icon.textContent = (source || "?").trim().charAt(0).toUpperCase() || "?";
    }
    return icon;
  }

  function sideItem(label, count, active, onClick, iconEl) {
    const btn = document.createElement("button");
    btn.className = "side-item" + (active ? " active" : "");
    if (iconEl) btn.appendChild(iconEl);
    const l = document.createElement("span");
    l.className = "side-label";
    l.textContent = label;
    l.title = label;
    const c = document.createElement("span");
    c.className = "side-count";
    c.textContent = String(count);
    btn.append(l, c);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function setFilter(next, hash) {
    // 再次点击已激活项 = 取消过滤
    if (filter.type === next.type && filter.value === next.value) {
      filter = { type: "all", value: null };
      location.hash = "";
    } else {
      filter = next;
      location.hash = hash;
    }
    syncSidebarActive();
    renderMain();
  }

  function syncSidebarActive() {
    sideAll.classList.toggle("active", filter.type === "all");
    renderSidebar();
  }

  sideAll.addEventListener("click", () => setFilter({ type: "all", value: null }, ""));

  function restoreFilterFromHash() {
    const h = location.hash.slice(1);
    const params = new URLSearchParams(h);
    if (params.get("source")) filter = { type: "source", value: params.get("source") };
    else if (params.get("conv")) filter = { type: "conversation", value: params.get("conv") };
  }

  // ---- 卡片 ----
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

  function buildCard(note) {
    const li = document.createElement("article");
    li.className = "note-card";

    const content = buildContentEl(note);
    li.appendChild(content);

    // 长笔记折叠：渲染后测量，超过阈值加截断态
    requestAnimationFrame(() => {
      if (content.scrollHeight > 300 && !rawViewIds.has(note.id)) {
        li.classList.add("truncated");
      }
    });
    const expandBtn = document.createElement("button");
    expandBtn.className = "note-expand";
    expandBtn.textContent = "展开全文";
    expandBtn.addEventListener("click", () => {
      const truncated = li.classList.toggle("truncated");
      expandBtn.textContent = truncated ? "展开全文" : "收起";
    });
    li.appendChild(expandBtn);

    const meta = document.createElement("div");
    meta.className = "note-meta";
    const timeEl = document.createElement("time");
    timeEl.textContent = relativeTime(note.createdAt);
    timeEl.title = absoluteTime(note.createdAt);
    meta.appendChild(timeEl);

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "note-copy";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(note.contentMarkdown || note.contentText || "");
        copyBtn.textContent = "已复制";
        setTimeout(() => (copyBtn.textContent = "复制"), 1200);
      } catch (_) { /* clipboard unavailable */ }
    });

    // 更多操作：Markdown/预览切换 + 删除（入口收敛到 ⋯ 菜单）
    const menuWrap = document.createElement("div");
    menuWrap.className = "note-menu-wrap";
    const moreBtn = document.createElement("button");
    moreBtn.className = "note-more";
    moreBtn.textContent = "⋯";
    moreBtn.title = "更多操作";
    moreBtn.setAttribute("aria-label", "更多操作");
    moreBtn.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "note-menu hidden";
    menu.setAttribute("role", "menu");

    const rawBtn = document.createElement("button");
    rawBtn.setAttribute("role", "menuitem");
    rawBtn.textContent = rawViewIds.has(note.id) ? "预览" : "Markdown";
    rawBtn.addEventListener("click", () => {
      if (rawViewIds.has(note.id)) rawViewIds.delete(note.id);
      else rawViewIds.add(note.id);
      li.classList.remove("truncated");
      li.replaceChild(buildContentEl(note), li.querySelector(".note-content"));
      rawBtn.textContent = rawViewIds.has(note.id) ? "预览" : "Markdown";
      closeMenu();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.setAttribute("role", "menuitem");
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", async () => {
      await aidn.remove(note.id);
      rawViewIds.delete(note.id);
      await refresh();
    });

    menu.append(rawBtn, delBtn);

    function closeMenu() {
      menu.classList.add("hidden");
      moreBtn.setAttribute("aria-expanded", "false");
    }
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hidden");
      moreBtn.setAttribute("aria-expanded", String(!open));
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    // 点击卡片外任意处关闭菜单
    document.addEventListener("click", (e) => {
      if (!menuWrap.contains(e.target)) closeMenu();
    });

    menuWrap.append(moreBtn, menu);
    actions.append(copyBtn, menuWrap);
    li.append(actions, meta);
    return li;
  }

  // ---- 主列渲染（按对话分组） ----
  function renderMain() {
    const visible = applyFilter(allNotes);
    groupsEl.innerHTML = "";

    emptyEl.classList.toggle("hidden", allNotes.length !== 0);
    noResultsEl.classList.toggle("hidden", !(allNotes.length > 0 && visible.length === 0));

    // 搜索时显示结果数量
    if (query && visible.length > 0) {
      resultCountEl.textContent = `找到 ${visible.length} 条笔记`;
      resultCountEl.classList.remove("hidden");
    } else {
      resultCountEl.classList.add("hidden");
    }

    for (const g of AIDN.group.groupByConversation(visible)) {
      const section = document.createElement("section");
      section.className = "group" + (collapsedGroups.has(g.key) ? " collapsed" : "");

      const header = document.createElement("div");
      header.className = "group-header";

      const caret = document.createElement("span");
      caret.className = "group-caret";
      caret.textContent = "▾";

      const icon = sourceIconEl(g.source);
      icon.classList.add("group-icon");

      const title = document.createElement("span");
      title.className = "group-title";
      title.textContent = g.title || "未命名对话";
      title.title = title.textContent;

      const meta = document.createElement("span");
      meta.className = "group-meta";
      meta.textContent = `${g.source} · ${g.count} 条 · ${relativeTime(g.latestAt)}`;

      const openBtn = document.createElement("button");
      openBtn.className = "group-open";
      openBtn.textContent = "打开来源";
      openBtn.disabled = !g.conversationUrl;
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (g.conversationUrl) window.open(g.conversationUrl, "_blank", "noopener");
      });

      header.append(caret, icon, title, meta, openBtn);
      header.addEventListener("click", () => {
        if (collapsedGroups.has(g.key)) collapsedGroups.delete(g.key);
        else collapsedGroups.add(g.key);
        persistCollapsed();
        section.classList.toggle("collapsed");
      });

      const body = document.createElement("div");
      body.className = "group-body";
      for (const note of g.notes) body.appendChild(buildCard(note));

      section.append(header, body);
      groupsEl.appendChild(section);
    }
  }

  async function refresh() {
    allNotes = await aidn.all(); // 已按 createdAt 倒序
    noteCountEl.textContent = String(allNotes.length);
    renderSidebar();
    syncSidebarActive();
    renderMain();
  }

  // ---- 搜索（关键词检索，防抖） ----
  let searchTimer = null;
  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = searchEl.value.trim();
      renderSidebar();
      renderMain();
    }, 120);
  });

  // ---- 键盘：Esc 清空搜索 / 关闭 Settings ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!panel.classList.contains("hidden")) { closeSettings(); return; }
    if (searchEl.value) { searchEl.value = ""; query = ""; renderSidebar(); renderMain(); }
  });

  // ---- Settings ----
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
    if (!confirm("确定删除所有已保存的笔记吗？此操作不可撤销。")) return;
    await aidn.advanced.clearAll();
    await refresh();
  });

  // ---- init ----
  (async function init() {
    restoreFilterFromHash();
    const settings = await aidn.advanced.settings?.get();
    captureToggle.checked = settings ? settings.captureButtonEnabled !== false : true;
    await refresh();
  })();
})();
