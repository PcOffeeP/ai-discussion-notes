// html-to-markdown + normalize + pipeline 的 DOM 级回归测试（jsdom）。
// 覆盖两个真实事故：
//   1) Kimi 列表 → 必须输出 "- " 无序列表（2026-09-08 退化为纯文本）
//   2) ChatGPT 表格部分选中 → normalize 必须补全 <table> 外壳
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { withDom } = require("./helpers/dom");
const { load } = require("./helpers/load");

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

// 每次测试用独立 jsdom 环境加载 DOM 依赖的核心模块
const CORE = ["core/note.js", "core/html-to-markdown.js", "core/normalize.js", "core/pipeline.js"];

test("Kimi 列表：ul/li 结构序列化为无序列表", () => {
  withDom(fixture("kimi-list.html"), CORE, ({ document, AIDN }) => {
    const md = AIDN.htmlToMarkdown(document.body.innerHTML, document);
    const listLines = md.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(listLines.length, 3, `应输出 3 个列表项，实际：\n${md}`);
    assert.ok(md.includes("- **空间 vs 暴露**"));
    assert.ok(md.includes("- **简洁 vs 可发现**"));
    assert.ok(md.includes("- **稳定 vs 灵活**"));
  });
});

test("表格完整结构序列化为 pipe table", () => {
  withDom(fixture("partial-table.html"), CORE, ({ document, AIDN }) => {
    const md = AIDN.htmlToMarkdown(document.body.innerHTML, document);
    assert.ok(md.includes("| Failure 是否能客观判断 | 推荐 |"), `缺少表头：\n${md}`);
    assert.ok(md.includes("| --- | --- |"));
    assert.ok(md.includes("| 完全确定 | Code-based Eval |"));
  });
});

test("normalize：表格部分选中时向上补全 table 外壳", () => {
  withDom(fixture("partial-table.html"), CORE, ({ document, AIDN }) => {
    // 模拟用户只选中「完全确定 | Code-based Eval」一行里的文本
    const td1 = document.querySelectorAll("tbody td")[0].firstChild;
    const td2 = document.querySelectorAll("tbody td")[1].firstChild;
    const range = document.createRange();
    range.setStart(td1, 0);
    range.setEnd(td2, td2.textContent.length);

    const html = AIDN.normalize.normalizeRange(range, document);
    assert.ok(html.includes("<table"), `应补全 table 外壳，实际：${html.slice(0, 200)}`);
    // 补全后经过序列化必须是 pipe table，而不是纯文本
    const md = AIDN.htmlToMarkdown(html, document);
    assert.ok(md.includes("| --- | --- |"), `归一化后序列化失败：\n${md}`);
  });
});

test("normalize：选区完整覆盖列表时不重复拼接", () => {
  withDom(fixture("kimi-list.html"), CORE, ({ document, AIDN }) => {
    const ul = document.querySelector("ul");
    const range = document.createRange();
    range.selectNode(ul);
    const html = AIDN.normalize.normalizeRange(range, document);
    const md = AIDN.htmlToMarkdown(html, document);
    const listLines = md.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(listLines.length, 3, `完整选中不应产生重复项：\n${md}`);
  });
});

test("normalize：跨块选区（段落外 → 列表中间）不产生重复内容", () => {
  // 回归：2026-09-09 实测——旧算法把残片与完整 ul 拼接，列表内容出现两次
  withDom(fixture("kimi-list.html"), CORE, ({ document, AIDN }) => {
    const p = document.querySelector("p").firstChild;
    const secondLi = document.querySelectorAll("li")[1];
    const range = document.createRange();
    range.setStart(p, 2);
    range.setEnd(secondLi.firstChild.firstChild, 3); // 停在第二个 li 的 strong 文本中间

    const html = AIDN.normalize.normalizeRange(range, document);
    const md = AIDN.htmlToMarkdown(html, document);
    const listLines = md.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(listLines.length, 3, `列表项不应重复：\n${md}`);
    assert.equal(md.split("空间 vs 暴露").length - 1, 1, "内容只应出现一次");
    assert.ok(md.startsWith("设计 sidebar 时有三组核心权衡"));
  });
});

test("normalize：单段落内部分选中按块取整为整段", () => {
  withDom(fixture("kimi-list.html"), CORE, ({ document, AIDN }) => {
    const text = document.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 8);
    const html = AIDN.normalize.normalizeRange(range, document);
    const md = AIDN.htmlToMarkdown(html, document);
    assert.equal(md, "设计 sidebar 时有三组核心权衡：");
  });
});

test("端到端：列表 HTML 经管道入库后 contentMarkdown 保留列表", async () => {
  await withDom(fixture("kimi-list.html"), [...CORE, "adapters/chrome/kv.js", "adapters/chrome/storage-note-repo.js"],
    async ({ document, AIDN }) => {
      const repo = AIDN.createStorageNoteRepo(AIDN.createMemoryKV());
      const pipeline = AIDN.createPipeline({
        repo,
        serialize: (html) => AIDN.htmlToMarkdown(html, document),
      });
      const note = await pipeline({
        html: document.querySelector("ul").outerHTML,
        text: "空间 vs 暴露 简洁 vs 可发现 稳定 vs 灵活",
        source: "Kimi",
        sourceType: "chat",
      });
      assert.ok(note.contentMarkdown.includes("- **空间 vs 暴露**"), note.contentMarkdown);
      assert.ok(note.contentHtml.includes("<ul"));
    }
  );
});
