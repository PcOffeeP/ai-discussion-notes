// 加载真实 mobile.html 与全部第一方脚本；仅替换浏览器外部接口。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const note = (id, text) => ({ id, schemaVersion: 3, contentText: text, contentMarkdown: text, createdAt: "2026-09-28T00:00:00Z", metadata: {}, thoughts: [] });
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail("页面状态等待超时");
}
async function boot(t, { key = "", quota = false, confirm = true } = {}) {
  const html = fs.readFileSync(path.join(root, "mobile.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/mobile.html" });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.localStorage.setItem("aidn_mobile_notes", JSON.stringify([note("personal", "植物的气孔控制蒸腾。温度影响水分流失。") ]));
  w.localStorage.setItem("aidn_m_deepseek_key", key);
  w.fetch = async () => { throw new Error("disconnected"); };
  w.AbortController = AbortController;
  w.scrollTo = () => {};
  let confirmations = 0;
  w.confirm = () => { confirmations++; return confirm; };
  const originalSet = w.Storage.prototype.setItem;
  if (quota) w.Storage.prototype.setItem = function (k, v) {
    if (k === "aidn_mobile_notes") throw new Error("quota");
    return originalSet.call(this, k, v);
  };
  for (const script of w.document.querySelectorAll("script")) {
    const src = script.getAttribute("src");
    w.eval(src ? fs.readFileSync(path.join(root, src), "utf8") : script.textContent);
  }
  await until(() => w.document.getElementById("recall-q1-title").textContent.includes("回忆"));
  return { w, confirmations: () => confirmations };
}
function importFile(w, list) {
  const input = w.document.getElementById("json-file-input");
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => JSON.stringify(list), size: 1024 }] });
  input.dispatchEvent(new w.Event("change"));
}
test("手机真实入口：配置 Key 且断网仍呈现当前笔记离线提示", async t => {
  const { w } = await boot(t, { key: "test-only" });
  assert.match(w.document.getElementById("recall-q1-sub").textContent, /未经模型推理/);
  assert.match(w.document.getElementById("recall-anchor-text").textContent, /气孔/);
  assert.doesNotMatch(w.document.getElementById("recall-q3-text").textContent, /领域|数据库/);
});
test("手机导入真实入口保留原库并完整校验；示例重载必须确认", async t => {
  const { w, confirmations } = await boot(t, { confirm: false });
  importFile(w, [note("new", "新笔记")]);
  await until(() => w.document.getElementById("import-status").textContent.includes("新增"));
  assert.deepEqual(JSON.parse(w.localStorage.getItem("aidn_mobile_notes")).map(n => n.id).sort(), ["new", "personal"]);
  importFile(w, [note("other", "valid"), { id: "invalid" }]);
  await until(() => w.document.getElementById("import-status").textContent.includes("导入失败"));
  assert.equal(JSON.parse(w.localStorage.getItem("aidn_mobile_notes")).length, 2);
  w.document.getElementById("m-reset-sample-btn").click();
  assert.equal(confirmations(), 1);
  assert.equal(JSON.parse(w.localStorage.getItem("aidn_mobile_notes")).length, 2);
});
test("手机导入提交配额失败保留旧笔记；确认重载只影响示例", async t => {
  const first = await boot(t, { quota: true });
  importFile(first.w, [note("new", "new")]);
  await until(() => first.w.document.getElementById("import-status").textContent.includes("quota"));
  assert.deepEqual(JSON.parse(first.w.localStorage.getItem("aidn_mobile_notes")).map(n => n.id), ["personal"]);
  const second = await boot(t);
  second.w.document.getElementById("m-reset-sample-btn").click();
  await until(() => second.w.document.getElementById("import-status").textContent.includes("已重载"));
  assert.equal(second.confirmations(), 1);
  assert.equal(JSON.parse(second.w.localStorage.getItem("aidn_mobile_notes")).length, 4);
});
