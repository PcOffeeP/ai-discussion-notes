// notes 页面 UI 冒烟测试（jsdom）：
// 从真实 notes/notes.html 派生 harness（注入 chrome.runtime stub + 造数），
// 验证 UI 精修后的交互契约：侧栏限 10 条 / 显示全部、⋯ 更多菜单、
// 搜索结果计数、空态、折叠、Markdown 切换、source 筛选。
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const HARNESS_PATH = path.join(__dirname, ".ui-harness.html");
const HARNESS_URL = "file://" + HARNESS_PATH;

// ---- 从真实页面派生 harness：保证测试 markup 与交付页面同步 ----
function buildHarnessHtml() {
  let html = fs.readFileSync(path.join(ROOT, "notes/notes.html"), "utf8");
  // test/ 比 notes/ 深一级：修正资源相对路径
  html = html
    .replace('href="notes.css"', 'href="../notes/notes.css"')
    .replace('src="notes.js"', 'src="../notes/notes.js"');
  const stub = `<script>
  (function () {
    const SOURCES = ["ChatGPT", "Claude", "Gemini"];
    const notes = [];
    const NOW = Date.now();
    let seq = 0;
    for (let c = 1; c <= 13; c++) {
      const source = SOURCES[c % SOURCES.length];
      const n = 1 + (c % 3);
      for (let i = 0; i < n; i++) {
        seq++;
        const long = c === 1 && i === 0;
        notes.push({
          id: "note_h_" + seq,
          schemaVersion: 2,
          contentMarkdown: long
            ? "# 递归的本质\\n\\n递归的核心是**信任**。" + "长文本段落。 ".repeat(60)
            : \`第 \${c} 个对话里的第 \${i + 1} 条笔记，内容包含关键词 **递归**。\`,
          contentText: "",
          contentHtml: "",
          source,
          sourceType: "chat",
          conversationTitle: \`关于递归与迭代的讨论 \${String(c).padStart(2, "0")}\`,
          conversationUrl: "https://chatgpt.com/c/harness-" + c,
          metadata: {},
          createdAt: new Date(NOW - c * 3600e3 - i * 60e3).toISOString(),
        });
      }
    }
    const store = new Map(notes.map((n) => [n.id, n]));
    const listeners = [];
    window.__aidnStore = store; // 供「外部写入 + 广播」用例造数
    window.__aidnEmitChanged = (payload) => {
      for (const fn of listeners) fn({ __aidn: true, action: "notes.changed", payload });
    };
    window.chrome = {
      runtime: {
        lastError: null,
        onMessage: { addListener: (fn) => listeners.push(fn) },
        sendMessage(msg, cb) {
          setTimeout(() => {
            if (msg.action === "notes.list") cb({ ok: true, data: [...store.values()] });
            else if (msg.action === "notes.delete") { store.delete(msg.payload.id); cb({ ok: true, data: true }); }
            else if (msg.action === "notes.update") {
              const n = store.get(msg.payload.id);
              if (n) store.set(n.id, Object.assign({}, n, msg.payload.patch));
              cb({ ok: true, data: n ? store.get(n.id) : null });
            }
            else if (msg.action === "notes.clear") { store.clear(); cb({ ok: true, data: true }); }
            else if (msg.action === "settings.get") cb({ ok: true, data: { captureButtonEnabled: true } });
            else if (msg.action === "settings.patch") cb({ ok: true, data: msg.payload });
            else if (msg.action === "recall.issue") {
              const notes = msg.payload.notes || [...store.values()];
              const targetNote = notes[0] || {};
              cb({
                ok: true,
                data: {
                  issueId: "issue_harness_01",
                  seriesName: targetNote.conversationTitle || "测试专栏",
                  leadSource: (targetNote.source || "AI") + " · 刚刚",
                  q1: {
                    title: "论递归与迭代的本质区别与设计权衡？",
                    sub: "算法与认知模型",
                    clue: "关注调用栈与状态机的状态存储位置",
                    anchor: "递归的核心是信任基底状态与因果归纳",
                    targetNoteId: targetNote.id || "note_h_1",
                  },
                  q2: {
                    title: "尾递归优化与普通递归有何区别？",
                    body: "尾递归无需额外保留外层调用帧",
                  },
                  q3: {
                    title: "深层递归导致爆栈，应如何改造？",
                    body: "改用显示栈循环迭代或蹦床函数",
                  },
                },
              });
            }
            else if (msg.action === "recall.profile") {
              cb({
                ok: true,
                data: {
                  updatedAt: new Date().toISOString(),
                  activeTopics: ["递归算法", "系统架构"],
                  recentShift: "深入探索状态机与函数式递归",
                  dormantTopics: ["CSS"],
                },
              });
            }
            else if (msg.action === "sync.now") {
              cb({ ok: true, data: { ok: true, syncedCount: 0, serverUpdatesCount: 0, offline: true } });
            }
            else cb({ ok: false, error: "unknown action" });
          }, 10);
        },
      },
    };
  })();
  </` + `script>`;
  // 注入到第一个 src 脚本之前，确保 AIDN 命名空间与 chrome stub 时序正确
  return html.replace('<script src="../core/note.js">', stub + '\n  <script src="../core/note.js">');
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function boot() {
  fs.writeFileSync(HARNESS_PATH, buildHarnessHtml());
  const dom = await JSDOM.fromFile(HARNESS_PATH, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom 对 file:// 禁用 localStorage；scrollHeight 恒为 0 会跳过长笔记折叠
      const mem = new Map();
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: (k) => (mem.has(k) ? mem.get(k) : null),
          setItem: (k, v) => mem.set(k, String(v)),
          removeItem: (k) => mem.delete(k),
          clear: () => mem.clear(),
        },
      });
      Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() { return 9999; },
      });
    },
  });
  const { window } = dom;
  const t0 = Date.now();
  while (window.document.querySelectorAll(".note-card").length === 0) {
    if (Date.now() - t0 > 5000) throw new Error("页面初始化超时");
    await delay(50);
  }
  return dom;
}

test("notes 页面 UI 冒烟", async (t) => {
  const dom = await boot();
  const { window } = dom;
  const { document } = window;
  t.after(() => { window.close(); fs.rmSync(HARNESS_PATH, { force: true }); });

  const convItems = () => document.querySelectorAll("#side-conversations .side-item");

  await t.test("侧栏 Conversations 默认限 10 条并提供「显示全部」", () => {
    assert.equal(convItems().length, 10);
    const more = document.querySelector("#side-conversations .side-more");
    assert.ok(more && more.textContent.includes("显示全部"));
    more.click();
    assert.equal(convItems().length, 13);
    assert.equal(document.querySelector("#side-conversations .side-more").textContent, "收起");
    document.querySelector("#side-conversations .side-more").click();
    assert.equal(convItems().length, 10);
  });

  await t.test("Note Card meta 只保留时间，不再重复 Source", () => {
    const meta = document.querySelector(".note-card .note-meta");
    assert.ok(!/ChatGPT|Claude|Gemini/.test(meta.textContent));
    assert.ok(meta.querySelector("time"));
  });

  await t.test("操作区为「复制 + ⋯」，菜单含 Markdown / 删除，无 Open Source", () => {
    const card = document.querySelector(".note-card");
    const actions = card.querySelector(".note-actions");
    assert.ok(actions.textContent.includes("复制"));
    assert.ok(actions.querySelector(".note-more"));
    assert.ok(!actions.textContent.includes("Open Source"));

    const menu = card.querySelector(".note-menu");
    assert.ok(menu.classList.contains("hidden"));
    actions.querySelector(".note-more").click();
    assert.ok(!menu.classList.contains("hidden"));
    const items = [...menu.querySelectorAll("button")].map((b) => b.textContent);
    assert.ok(items.includes("Markdown"));
    assert.ok(items.includes("删除"));

    // Markdown 切换 → 源码视图，菜单自动关闭
    menu.querySelectorAll("button")[0].click();
    assert.ok(menu.classList.contains("hidden"));
    assert.ok(card.querySelector(".note-raw"));

    // 点击卡片外关闭菜单
    actions.querySelector(".note-more").click();
    document.body.click();
    assert.ok(card.querySelector(".note-menu").classList.contains("hidden"));
  });

  await t.test("搜索显示「找到 N 条笔记」，无结果显示中文空态", async () => {
    const search = document.getElementById("search");
    search.value = "递归";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    const t0 = Date.now();
    while (document.getElementById("result-count").classList.contains("hidden")) {
      if (Date.now() - t0 > 3000) throw new Error("结果计数未出现");
      await delay(50);
    }
    assert.match(document.getElementById("result-count").textContent, /^找到 \d+ 条笔记$/);

    search.value = "不存在的关键词zzz";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    const t1 = Date.now();
    while (document.getElementById("no-results").classList.contains("hidden")) {
      if (Date.now() - t1 > 3000) throw new Error("无结果空态未出现");
      await delay(50);
    }
    assert.ok(document.getElementById("no-results").textContent.includes("没有找到匹配的笔记"));
    assert.ok(document.getElementById("result-count").classList.contains("hidden"));

    // 清空搜索恢复全量，供后续子测试使用
    search.value = "";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    const t2 = Date.now();
    while (document.querySelectorAll(".note-card").length === 0) {
      if (Date.now() - t2 > 3000) throw new Error("清空搜索后未恢复");
      await delay(50);
    }
  });

  await t.test("分组头保留来源信息、「打开来源」入口与折叠交互", () => {
    const gh = document.querySelector(".group-header");
    assert.match(gh.querySelector(".group-meta").textContent, /· \d+ 条 ·/);
    assert.equal(gh.querySelector(".group-open").textContent, "打开来源");

    const group = document.querySelector(".group");
    group.querySelector(".group-header").click();
    assert.ok(group.classList.contains("collapsed"));
    group.querySelector(".group-header").click();
    assert.ok(!group.classList.contains("collapsed"));
  });

  await t.test("长笔记默认折叠，可展开收起", () => {
    const longCard = document.querySelector(".note-card.truncated");
    assert.ok(longCard, "长笔记应带 truncated 态");
    const expandBtn = longCard.querySelector(".note-expand");
    expandBtn.click();
    assert.equal(expandBtn.textContent, "收起");
  });

  await t.test("source 筛选仍然生效", async () => {
    const srcItem = document.querySelector("#side-sources .side-item");
    const srcName = srcItem.querySelector(".side-label").textContent;
    srcItem.click();
    await delay(100);
    for (const g of document.querySelectorAll(".group")) {
      assert.ok(g.querySelector(".group-meta").textContent.startsWith(srcName));
    }
    document.getElementById("side-all").click();
    await delay(100);
  });

  await t.test("来源列表显示平台图标：已知平台 SVG，未知平台首字母兜底", () => {
    const items = [...document.querySelectorAll("#side-sources .side-item")];
    const iconOf = (name) =>
      items.find((i) => i.querySelector(".side-label").textContent === name)?.querySelector(".side-icon");
    // ChatGPT = 已知平台 → 本地 SVG
    const gptIcon = iconOf("ChatGPT");
    assert.ok(gptIcon, "ChatGPT 应有图标");
    assert.ok(gptIcon.querySelector('img[src="icons/chatgpt.svg"]'));
    // Claude / Gemini = 未知平台 → 首字母圆点，不请求不存在的资源
    for (const name of ["Claude", "Gemini"]) {
      const icon = iconOf(name);
      assert.ok(icon, `${name} 应有兜底图标`);
      assert.ok(icon.classList.contains("side-icon-letter"));
      assert.equal(icon.textContent, name.charAt(0));
      assert.ok(!icon.querySelector("img"));
    }
  });

  await t.test("对话列表与分组头同款式来源图标", () => {
    // 对话行：图标 + 纯数量（来源文字已收敛进图标）
    const convItem = document.querySelector("#side-conversations .side-item");
    assert.ok(convItem.querySelector(".side-icon"));
    assert.match(convItem.querySelector(".side-count").textContent, /^\d+$/);
    assert.ok(!convItem.querySelector(".side-label").textContent.includes("·"));
    // 分组头：caret + 图标 + 标题 + 元信息
    const gh = document.querySelector(".group-header");
    const ghIcon = gh.querySelector(".group-icon");
    assert.ok(ghIcon, "分组头应有来源图标");
    assert.ok(ghIcon.querySelector("img, .side-icon-letter") !== null || ghIcon.textContent.trim().length === 1);
    assert.match(gh.querySelector(".group-meta").textContent, /· \d+ 条 ·/);
  });

  await t.test("收到 notes.changed(kind=save) 广播后自动刷新，无需手动 F5", async () => {
    const before = document.querySelectorAll(".note-card").length;
    const countBefore = document.getElementById("note-count").textContent;
    window.__aidnStore.set("note_live_1", {
      id: "note_live_1",
      schemaVersion: 2,
      contentMarkdown: "实时新增：来自 content script 的笔记",
      contentText: "",
      contentHtml: "",
      source: "ChatGPT",
      sourceType: "chat",
      conversationTitle: "实时性验证对话",
      conversationUrl: "https://chatgpt.com/c/live-1",
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    window.__aidnEmitChanged({ kind: "save" });
    const t0 = Date.now();
    while (document.querySelectorAll(".note-card").length !== before + 1) {
      if (Date.now() - t0 > 3000) throw new Error("收到 save 广播后页面未自动刷新");
      await delay(50);
    }
    assert.equal(document.getElementById("note-count").textContent, String(Number(countBefore) + 1));
    assert.ok([...document.querySelectorAll(".note-card")].some((c) => c.textContent.includes("实时新增")));

    // update 类广播（页面自身写想法等）不应触发整体重绘
    const stable = document.querySelectorAll(".note-card").length;
    window.__aidnEmitChanged({ kind: "update" });
    await delay(300);
    assert.equal(document.querySelectorAll(".note-card").length, stable);
  });

  await t.test("想法便利贴 ⌘/Ctrl+Enter 保存后即时上屏并落库", async () => {
    const card = document.querySelector(".note-card");
    card.querySelector(".note-thought-btn").click(); // 展开便利贴
    const input = card.querySelector(".note-thought-input");
    assert.ok(input, "便利贴输入框应存在");

    input.value = "命令行净化的一个想法";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Enter", metaKey: true, bubbles: true, cancelable: true,
    }));

    const t0 = Date.now();
    while (![...card.querySelectorAll(".note-thought-text")].some(
      (el) => el.textContent === "命令行净化的一个想法"
    )) {
      if (Date.now() - t0 > 3000) throw new Error("⌘+Enter 保存后想法未上屏");
      await delay(50);
    }
    assert.ok(card.querySelector(".note-thought-btn").textContent.includes("想法 · 1"));
    // 数据确实写入 store（notes.update 走通，而非仅本地渲染）
    const saved = [...window.__aidnStore.values()].find((n) =>
      (n.thoughts || []).some((x) => x.text === "命令行净化的一个想法"));
    assert.ok(saved, "想法应已写入存储");
  });

  await t.test("百年大报报头、认知雷达与 DeepSeek 状态展示 (RFC-004)", async () => {
    // 报头总篇数与版面
    const volEl = document.getElementById("masthead-vol");
    assert.ok(volEl && volEl.textContent.includes("总第"));
    assert.ok(document.querySelector(".broadsheet-masthead .masthead-title"));

    // DeepSeek 状态标签：未配置时明确显示「DEEPSEEK: 未配置」
    const statusEl = document.getElementById("deepseek-status");
    assert.ok(statusEl && statusEl.textContent.includes("DEEPSEEK: 未配置"));
    assert.ok(statusEl.classList.contains("unconfigured"));

    // 点击 DeepSeek 状态标签直接唤起设置抽屉
    statusEl.click();
    assert.ok(!document.getElementById("settings-panel").classList.contains("hidden"));
    document.getElementById("settings-close").click();
    assert.ok(document.getElementById("settings-panel").classList.contains("hidden"));

    // 认知雷达
    const radar = document.getElementById("cognitive-radar");
    assert.ok(radar);
    await delay(100);
    const tags = document.querySelectorAll("#radar-topics .radar-tag");
    assert.ok(tags.length > 0, "认知雷达应有主题标签");
  });

  await t.test("头版号外自测弹窗与防剧透状态机交互 (RFC-004)", async () => {
    const openBtn = document.getElementById("open-recall-btn");
    const modal = document.getElementById("recall-modal");
    const overlay = document.getElementById("recall-overlay");
    const closeBtn = document.getElementById("recall-close-btn");

    assert.ok(modal.classList.contains("hidden"));
    openBtn.click();
    assert.ok(!modal.classList.contains("hidden"));
    assert.ok(!overlay.classList.contains("hidden"));

    await delay(100);

    // 1. 验证默认状态：思考线索折叠隐藏 (ClueHidden)
    const clueBtn = document.getElementById("recall-clue-btn");
    const clueBox = document.getElementById("recall-clue-box");
    assert.ok(clueBox.classList.contains("hidden"));
    assert.ok(clueBtn.textContent.includes("研读思考线索"));

    // 点击展开线索 (ClueVisible)
    clueBtn.click();
    assert.ok(!clueBox.classList.contains("hidden"));
    assert.ok(clueBtn.textContent.includes("隐去思考线索"));
    assert.ok(document.getElementById("recall-clue-text").textContent.length > 0);

    // 2. 验证原文对照折叠 (Folded)
    const unfoldBtn = document.getElementById("recall-unfold-btn");
    const originalBox = document.getElementById("recall-original-box");
    assert.ok(originalBox.classList.contains("hidden"));

    // 点击撕折展开原文 (Unfolded)
    unfoldBtn.click();
    assert.ok(!originalBox.classList.contains("hidden"));
    assert.ok(unfoldBtn.textContent.includes("收拢号外原文"));
    assert.ok(document.getElementById("recall-anchor-text").textContent.length > 0);

    // 3. 栏目二 (q2) 概念辨析展开
    const q2Toggle = document.getElementById("recall-q2-toggle");
    const q2Body = document.getElementById("recall-q2-body");
    assert.ok(q2Body.classList.contains("hidden"));
    q2Toggle.click();
    assert.ok(!q2Body.classList.contains("hidden"));

    // 4. 栏目三 (q3) 微言快答揭晓
    const q3Toggle = document.getElementById("recall-q3-toggle");
    const q3Body = document.getElementById("recall-q3-body");
    assert.ok(q3Body.classList.contains("hidden"));
    q3Toggle.click();
    assert.ok(!q3Body.classList.contains("hidden"));

    // 5. 随手反思批注 (Thought Box)
    const thoughtInput = document.getElementById("recall-thought-input");
    const thoughtSubmit = document.getElementById("recall-thought-submit");
    thoughtInput.value = "号外自测唤醒的新反思";
    thoughtSubmit.click();
    await delay(50);
    assert.equal(thoughtInput.value, "");
    assert.ok(document.getElementById("recall-thought-hint").textContent.includes("已沉淀"));

    // 6. 换一批 (Shuffle) 重置状态机
    const shuffleBtn = document.getElementById("recall-shuffle-btn");
    shuffleBtn.click();
    await delay(50);
    assert.ok(clueBox.classList.contains("hidden"), "换版后线索应重置为折叠");
    assert.ok(originalBox.classList.contains("hidden"), "换版后原文应重置为折叠");

    // 7. 关闭号外
    closeBtn.click();
    assert.ok(modal.classList.contains("hidden"));
    assert.ok(overlay.classList.contains("hidden"));
  });
});
