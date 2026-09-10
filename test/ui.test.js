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
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage(msg, cb) {
          setTimeout(() => {
            if (msg.action === "notes.list") cb({ ok: true, data: [...store.values()] });
            else if (msg.action === "notes.delete") { store.delete(msg.payload.id); cb({ ok: true, data: true }); }
            else if (msg.action === "notes.clear") { store.clear(); cb({ ok: true, data: true }); }
            else if (msg.action === "settings.get") cb({ ok: true, data: { captureButtonEnabled: true } });
            else if (msg.action === "settings.patch") cb({ ok: true, data: msg.payload });
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
});
