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
  const mastheadVolEl = document.getElementById("masthead-vol");
  const deepseekStatusEl = document.getElementById("deepseek-status");
  const openRecallBtn = document.getElementById("open-recall-btn");

  const radarTopicsEl = document.getElementById("radar-topics");
  const radarShiftEl = document.getElementById("radar-shift");
  const radarTimeEl = document.getElementById("radar-time");
  const refreshRadarBtn = document.getElementById("refresh-radar-btn");

  const deepseekKeyInput = document.getElementById("deepseek-key-input");
  const deepseekUrlInput = document.getElementById("deepseek-url-input");
  const deepseekModelInput = document.getElementById("deepseek-model-input");
  const syncEndpointInput = document.getElementById("sync-endpoint-input");
  const syncTokenInput = document.getElementById("sync-token-input");
  const syncNowBtn = document.getElementById("sync-now-btn");
  const syncStatusMsg = document.getElementById("sync-status-msg");
  const testDeepSeekBtn = document.getElementById("test-deepseek-btn");
  const deepseekTestMsg = document.getElementById("deepseek-test-msg");

  const recallOverlay = document.getElementById("recall-overlay");
  const recallModal = document.getElementById("recall-modal");
  const recallCloseBtn = document.getElementById("recall-close-btn");
  const recallShuffleBtn = document.getElementById("recall-shuffle-btn");

  const recallLeadSource = document.getElementById("recall-lead-source");
  const recallQ1Title = document.getElementById("recall-q1-title");
  const recallQ1Sub = document.getElementById("recall-q1-sub");
  const recallClueBtn = document.getElementById("recall-clue-btn");
  const recallClueBox = document.getElementById("recall-clue-box");
  const recallClueText = document.getElementById("recall-clue-text");
  const recallUnfoldBtn = document.getElementById("recall-unfold-btn");
  const recallOriginalBox = document.getElementById("recall-original-box");
  const recallOriginalText = document.getElementById("recall-original-text");
  const recallAnchorText = document.getElementById("recall-anchor-text");

  const recallQ2Title = document.getElementById("recall-q2-title");
  const recallQ2Toggle = document.getElementById("recall-q2-toggle");
  const recallQ2Body = document.getElementById("recall-q2-body");
  const recallQ2Text = document.getElementById("recall-q2-text");

  const recallQ3Title = document.getElementById("recall-q3-title");
  const recallQ3Toggle = document.getElementById("recall-q3-toggle");
  const recallQ3Body = document.getElementById("recall-q3-body");
  const recallQ3Text = document.getElementById("recall-q3-text");

  const recallThoughtInput = document.getElementById("recall-thought-input");
  const recallThoughtSubmit = document.getElementById("recall-thought-submit");
  const recallThoughtHint = document.getElementById("recall-thought-hint");

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

  // ---- 想法便利贴（卡片右侧，按钮展开） ----
  const stickyOpenIds = new Set(); // 会话内记住展开状态
  function buildSticky(note, onChange) {
    const aside = document.createElement("aside");
    aside.className = "note-sticky";

    const head = document.createElement("div");
    head.className = "note-sticky-head";
    const entries = document.createElement("div");
    entries.className = "note-thoughts";

    function renderHead() {
      const n = (note.thoughts || []).length;
      head.textContent = n > 0 ? `我的想法 · ${n}` : "我的想法";
    }

    function renderEntries() {
      entries.innerHTML = "";
      for (const t of note.thoughts || []) {
        const item = document.createElement("div");
        item.className = "note-thought";

        const text = document.createElement("div");
        text.className = "note-thought-text";
        text.textContent = t.text;

        const foot = document.createElement("div");
        foot.className = "note-thought-foot";
        const time = document.createElement("time");
        time.textContent = relativeTime(t.createdAt);
        time.title = absoluteTime(t.createdAt);
        const del = document.createElement("button");
        del.className = "note-thought-del";
        del.textContent = "×";
        del.title = "删除这条想法";
        del.addEventListener("click", async () => {
          await aidn.removeThought(note.id, t.id);
          note.thoughts = (note.thoughts || []).filter((x) => x.id !== t.id);
          renderHead();
          renderEntries();
          if (onChange) onChange();
        });
        foot.append(time, del);

        item.append(text, foot);
        entries.appendChild(item);
      }
    }

    const input = document.createElement("textarea");
    input.className = "note-thought-input";
    input.placeholder = "你有什么想法…";
    input.rows = 2;
    input.setAttribute("aria-label", "添加想法");

    function autogrow() {
      input.style.height = "auto";
      input.style.height = input.scrollHeight + "px";
    }
    input.addEventListener("input", autogrow);

    async function save() {
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      try {
        const t = await aidn.addThought(note.id, text);
        if (t) {
          note.thoughts = [...(note.thoughts || []), t];
          input.value = "";
          autogrow();
          renderHead();
          renderEntries();
          if (onChange) onChange();
          head.classList.add("flash");
          setTimeout(() => head.classList.remove("flash"), 900);
        }
      } finally {
        input.disabled = false;
        input.focus();
      }
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    });
    input.addEventListener("blur", () => { if (input.value.trim()) save(); });

    const hint = document.createElement("div");
    hint.className = "note-sticky-hint";
    hint.textContent = "⌘/Ctrl + Enter 保存";

    renderHead();
    renderEntries();
    aside.append(head, entries, input, hint);
    return aside;
  }

  function buildCard(note) {
    const li = document.createElement("article");
    li.className = "note-card";

    // 左侧主列：内容 / 展开 / 时间；右侧：想法便利贴
    const main = document.createElement("div");
    main.className = "note-main";

    const content = buildContentEl(note);
    main.appendChild(content);

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
    main.appendChild(expandBtn);

    const meta = document.createElement("div");
    meta.className = "note-meta";
    const timeEl = document.createElement("time");
    timeEl.textContent = relativeTime(note.createdAt);
    timeEl.title = absoluteTime(note.createdAt);
    meta.appendChild(timeEl);

    const actions = document.createElement("div");
    actions.className = "note-actions";

    // 想法按钮：展开/收起右侧便利贴；已有想法时常驻显示并带计数
    const thoughtBtn = document.createElement("button");
    thoughtBtn.className = "note-thought-btn";
    function syncThoughtBtn() {
      const n = (note.thoughts || []).length;
      thoughtBtn.textContent = n > 0 ? `✎ 想法 · ${n}` : "✎ 想法";
      li.classList.toggle("has-thoughts", n > 0);
    }
    thoughtBtn.addEventListener("click", () => {
      const open = li.classList.toggle("sticky-open");
      thoughtBtn.setAttribute("aria-expanded", String(open));
      if (open) stickyOpenIds.add(note.id);
      else stickyOpenIds.delete(note.id);
      if (open) {
        const input = li.querySelector(".note-thought-input");
        if (input) input.focus();
      }
    });
    syncThoughtBtn();

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
      const oldContent = li.querySelector(".note-content");
      oldContent.parentNode.replaceChild(buildContentEl(note), oldContent);
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

    const recallItem = document.createElement("button");
    recallItem.setAttribute("role", "menuitem");
    recallItem.textContent = "印制号外自测";
    recallItem.addEventListener("click", () => {
      closeMenu();
      openRecallModal(note.id);
    });

    menu.append(rawBtn, delBtn, recallItem);

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
    actions.append(thoughtBtn, copyBtn, menuWrap);
    main.appendChild(meta);
    if (stickyOpenIds.has(note.id)) {
      li.classList.add("sticky-open");
      thoughtBtn.setAttribute("aria-expanded", "true");
    }
    li.append(actions, main, buildSticky(note, syncThoughtBtn));
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
    if (mastheadVolEl) mastheadVolEl.textContent = `总第 ${allNotes.length} 篇`;
    renderSidebar();
    syncSidebarActive();
    renderMain();
    updateCognitiveRadar();
  }

  // ---- 认知雷达提炼 (RFC-004) ----
  let radarBusy = false;
  async function updateCognitiveRadar() {
    if (!radarTopicsEl || radarBusy) return;
    radarBusy = true;
    try {
      const profile = await aidn.recall.getProfile(allNotes.slice(0, 8));
      if (profile && Array.isArray(profile.activeTopics) && profile.activeTopics.length > 0) {
        radarTopicsEl.innerHTML = "";
        profile.activeTopics.forEach((t) => {
          const span = document.createElement("span");
          span.className = "radar-tag";
          span.textContent = t;
          radarTopicsEl.appendChild(span);
        });
      }
      if (profile && profile.recentShift && radarShiftEl) {
        radarShiftEl.textContent = profile.recentShift;
      }
      if (radarTimeEl) {
        radarTimeEl.textContent = "画像提炼就绪";
      }
    } catch (_) {
      // 容错降级
    } finally {
      radarBusy = false;
    }
  }
  if (refreshRadarBtn) {
    refreshRadarBtn.addEventListener("click", () => updateCognitiveRadar());
  }

  // ---- 其他上下文（content script / 右键菜单 / SW fallback）写入笔记后，
  // service worker 会广播 notes.changed；这里防抖重取，打开中的页面无需手动刷新。
  let refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 150);
  }
  if (window.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.__aidn !== true || msg.action !== "notes.changed") return false;
      const kind = msg.payload && msg.payload.kind;
      if (kind === "save" || kind === "clear") scheduleRefresh();
      return false;
    });
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

  // ---- 键盘：Esc 清空搜索 / 关闭 Modal / 关闭 Settings ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (recallModal && !recallModal.classList.contains("hidden")) { closeRecallModal(); return; }
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

  // 点击顶部 DeepSeek 状态标签直接唤起设置抽屉并聚焦 API 输入框
  if (deepseekStatusEl) {
    deepseekStatusEl.addEventListener("click", () => {
      openSettings();
      if (deepseekKeyInput) deepseekKeyInput.focus();
    });
  }

  function syncDeepSeekStatus(settings, overrideState) {
    if (!deepseekStatusEl) return;
    const textEl = deepseekStatusEl.querySelector(".status-text");

    if (overrideState === "error") {
      deepseekStatusEl.className = "deepseek-status error";
      if (textEl) textEl.textContent = "DEEPSEEK: 连接异常";
      deepseekStatusEl.title = "DeepSeek API 验证失败，点击打开设置检查 Key 与网络";
      return;
    }

    const hasKey = Boolean(settings?.deepseekApiKey && settings.deepseekApiKey.trim());
    if (hasKey) {
      deepseekStatusEl.className = "deepseek-status connected";
      if (textEl) textEl.textContent = "DEEPSEEK: 已配置";
      deepseekStatusEl.title = `DeepSeek API 已配置 (模型: ${settings.deepseekModel || "deepseek-chat"})，点击修改设置`;
    } else {
      deepseekStatusEl.className = "deepseek-status unconfigured";
      if (textEl) textEl.textContent = "DEEPSEEK: 未配置";
      deepseekStatusEl.title = "未配置 API Key（当前使用启发式出题），点击打开设置进行配置";
    }
  }

  async function saveDeepSeekSettings() {
    const patch = {
      deepseekApiKey: deepseekKeyInput?.value.trim() || "",
      deepseekBaseUrl: deepseekUrlInput?.value.trim() || "https://api.deepseek.com/v1",
      deepseekModel: deepseekModelInput?.value.trim() || "deepseek-chat",
      syncEndpoint: syncEndpointInput?.value.trim() || "",
      userToken: syncTokenInput?.value.trim() || "",
    };
    const s = await aidn.advanced.settings?.patch(patch);
    syncDeepSeekStatus(s);
    return s;
  }

  if (deepseekKeyInput) deepseekKeyInput.addEventListener("change", saveDeepSeekSettings);
  if (deepseekUrlInput) deepseekUrlInput.addEventListener("change", saveDeepSeekSettings);
  if (deepseekModelInput) deepseekModelInput.addEventListener("change", saveDeepSeekSettings);
  if (syncEndpointInput) syncEndpointInput.addEventListener("change", saveDeepSeekSettings);
  if (syncTokenInput) syncTokenInput.addEventListener("change", saveDeepSeekSettings);

  if (testDeepSeekBtn) {
    testDeepSeekBtn.addEventListener("click", async () => {
      const key = deepseekKeyInput?.value.trim();
      const baseUrl = deepseekUrlInput?.value.trim() || "https://api.deepseek.com/v1";
      const model = deepseekModelInput?.value.trim() || "deepseek-chat";

      if (!key) {
        if (deepseekTestMsg) deepseekTestMsg.textContent = "请先填写 API Key";
        if (deepseekKeyInput) deepseekKeyInput.focus();
        syncDeepSeekStatus({ deepseekApiKey: "" });
        return;
      }

      if (deepseekTestMsg) deepseekTestMsg.textContent = "验证中…";
      try {
        testDeepSeekBtn.disabled = true;
        await saveDeepSeekSettings();
        await aidn.advanced.testDeepSeek({ apiKey: key, baseUrl, model });
        if (deepseekTestMsg) deepseekTestMsg.textContent = "连接成功 ✓";
        syncDeepSeekStatus({ deepseekApiKey: key, deepseekModel: model });
      } catch (err) {
        if (deepseekTestMsg) deepseekTestMsg.textContent = "验证失败: " + (err.message || err);
        syncDeepSeekStatus({ deepseekApiKey: key }, "error");
      } finally {
        testDeepSeekBtn.disabled = false;
      }
    });
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      if (syncStatusMsg) syncStatusMsg.textContent = "同步中…";
      try {
        const endpoint = syncEndpointInput?.value.trim() || "";
        const token = syncTokenInput?.value.trim() || "";
        const key = deepseekKeyInput?.value.trim() || "";
        const baseUrl = deepseekUrlInput?.value.trim() || "";
        const model = deepseekModelInput?.value.trim() || "";
        await saveDeepSeekSettings();

        const currentSettings = {
          deepseekApiKey: key,
          deepseekBaseUrl: baseUrl,
          deepseekModel: model,
          updatedAt: new Date().toISOString(),
        };

        const res = await aidn.sync.syncNow({
          syncEndpoint: endpoint,
          userToken: token,
          settings: currentSettings,
        });

        if (res && res.ok) {
          if (syncStatusMsg) syncStatusMsg.textContent = res.offline ? "已完成本地标记" : `同步完成 (+${res.serverUpdatesCount})`;
          await refresh();
        } else {
          if (syncStatusMsg) syncStatusMsg.textContent = "同步完成";
        }
      } catch (err) {
        if (syncStatusMsg) syncStatusMsg.textContent = "失败: " + err.message;
      }
    });
  }

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

  // ---- 《AI 讨论纪事报》头版号外自测交互状态机 (RFC-004 Section 2 & 5) ----
  let currentRecallIssue = null;
  let currentTargetNote = null;

  function renderRecallIssue(issue, targetNote) {
    currentRecallIssue = issue;
    currentTargetNote = targetNote;

    if (recallLeadSource) recallLeadSource.textContent = issue.leadSource || "AI 对话";
    if (recallQ1Title) recallQ1Title.textContent = issue.q1?.title || "";
    if (recallQ1Sub) recallQ1Sub.textContent = issue.q1?.sub || "";
    if (recallClueText) recallClueText.textContent = issue.q1?.clue || "关注设计边界与因果推导。";
    if (recallAnchorText) recallAnchorText.textContent = issue.q1?.anchor || "核心业务规则不可动摇。";

    // 原文对照 (首字下沉排版)
    if (recallOriginalText) {
      recallOriginalText.innerHTML = "";
      if (targetNote) {
        const rendered = renderMarkdown(targetNote.contentMarkdown || targetNote.contentText);
        recallOriginalText.appendChild(rendered);
      } else {
        const p = document.createElement("p");
        p.textContent = "未找到对应原笔记内容";
        recallOriginalText.appendChild(p);
      }
    }

    if (recallQ2Title) recallQ2Title.textContent = issue.q2?.title || "概念辨析";
    if (recallQ2Text) recallQ2Text.textContent = issue.q2?.body || "";

    if (recallQ3Title) recallQ3Title.textContent = issue.q3?.title || "微言速测";
    if (recallQ3Text) recallQ3Text.textContent = issue.q3?.body || "";

    // 状态机重置：Folded / ClueHidden (RFC-004 Section 5)
    if (recallClueBox) recallClueBox.classList.add("hidden");
    if (recallClueBtn) recallClueBtn.textContent = "研读思考线索 ✦";

    if (recallOriginalBox) recallOriginalBox.classList.add("hidden");
    if (recallUnfoldBtn) recallUnfoldBtn.textContent = "翻阅号外原文对照 ↓";

    if (recallQ2Body) recallQ2Body.classList.add("hidden");
    if (recallQ2Toggle) recallQ2Toggle.textContent = "查看概念解析 ↓";

    if (recallQ3Body) recallQ3Body.classList.add("hidden");
    if (recallQ3Toggle) recallQ3Toggle.textContent = "揭晓快测答案 ↓";

    if (recallThoughtInput) recallThoughtInput.value = "";
    if (recallThoughtHint) recallThoughtHint.textContent = "";
  }

  async function loadRecallIssue(preferredNoteId) {
    if (allNotes.length === 0) {
      alert("请先保存至少一条笔记，方可印制号外自测！");
      closeRecallModal();
      return;
    }
    let targetNote = null;
    if (preferredNoteId) {
      targetNote = allNotes.find((n) => n.id === preferredNoteId);
    }
    if (!targetNote) {
      const randIdx = Math.floor(Math.random() * allNotes.length);
      targetNote = allNotes[randIdx];
    }

    const groupKey = AIDN.group.groupKeyOf(targetNote);
    const convNotes = allNotes.filter((n) => AIDN.group.groupKeyOf(n) === groupKey);

    const issue = await aidn.recall.generateIssue({
      seriesName: targetNote.conversationTitle,
      source: targetNote.source,
      notes: convNotes.length > 0 ? convNotes : [targetNote],
      targetNoteId: targetNote.id,
    });

    renderRecallIssue(issue, targetNote);
  }

  function openRecallModal(noteId) {
    if (!recallModal || !recallOverlay) return;
    recallOverlay.classList.remove("hidden");
    recallModal.classList.remove("hidden");
    loadRecallIssue(noteId);
  }

  function closeRecallModal() {
    if (!recallModal || !recallOverlay) return;
    recallOverlay.classList.add("hidden");
    recallModal.classList.add("hidden");
  }

  if (openRecallBtn) openRecallBtn.addEventListener("click", () => openRecallModal());
  if (recallCloseBtn) recallCloseBtn.addEventListener("click", closeRecallModal);
  if (recallOverlay) recallOverlay.addEventListener("click", closeRecallModal);

  if (recallShuffleBtn) {
    recallShuffleBtn.addEventListener("click", () => {
      loadRecallIssue();
    });
  }

  // 状态机行为：展开线索 (Clue)
  if (recallClueBtn) {
    recallClueBtn.addEventListener("click", () => {
      const isHidden = recallClueBox.classList.toggle("hidden");
      recallClueBtn.textContent = isHidden ? "研读思考线索 ✦" : "隐去思考线索";
    });
  }

  // 状态机行为：撕折展开号外原文 (Unfolded)
  if (recallUnfoldBtn) {
    recallUnfoldBtn.addEventListener("click", () => {
      const isHidden = recallOriginalBox.classList.toggle("hidden");
      recallUnfoldBtn.textContent = isHidden ? "翻阅号外原文对照 ↓" : "收拢号外原文 ↑";
    });
  }

  // 状态机行为：展开概念辨析 (q2)
  if (recallQ2Toggle) {
    recallQ2Toggle.addEventListener("click", () => {
      const isHidden = recallQ2Body.classList.toggle("hidden");
      recallQ2Toggle.textContent = isHidden ? "查看概念解析 ↓" : "收起概念解析";
    });
  }

  // 状态机行为：揭晓微言速测 (q3)
  if (recallQ3Toggle) {
    recallQ3Toggle.addEventListener("click", () => {
      const isHidden = recallQ3Body.classList.toggle("hidden");
      recallQ3Toggle.textContent = isHidden ? "揭晓快测答案 ↓" : "收起快测答案";
    });
  }

  // 状态机行为：反思批注沉淀写回
  if (recallThoughtSubmit) {
    recallThoughtSubmit.addEventListener("click", async () => {
      const text = recallThoughtInput?.value.trim();
      const targetId = currentRecallIssue?.q1?.targetNoteId || currentTargetNote?.id;
      if (!text || !targetId) return;
      try {
        recallThoughtSubmit.disabled = true;
        await aidn.addThought(targetId, text);
        recallThoughtInput.value = "";
        if (recallThoughtHint) {
          recallThoughtHint.textContent = "随笔批注已沉淀并回流至笔记！";
          setTimeout(() => { if (recallThoughtHint) recallThoughtHint.textContent = ""; }, 2500);
        }
        await refresh();
      } finally {
        recallThoughtSubmit.disabled = false;
      }
    });
  }

  // ---- init ----
  (async function init() {
    restoreFilterFromHash();
    const settings = await aidn.advanced.settings?.get();
    if (settings) {
      captureToggle.checked = settings.captureButtonEnabled !== false;
      if (deepseekKeyInput) deepseekKeyInput.value = settings.deepseekApiKey || "";
      if (deepseekUrlInput) deepseekUrlInput.value = settings.deepseekBaseUrl || "https://api.deepseek.com/v1";
      if (deepseekModelInput) deepseekModelInput.value = settings.deepseekModel || "deepseek-chat";
      if (syncEndpointInput) syncEndpointInput.value = settings.syncEndpoint || "";
      if (syncTokenInput) syncTokenInput.value = settings.userToken || "";
      syncDeepSeekStatus(settings);
    }
    await refresh();
  })();
})();
