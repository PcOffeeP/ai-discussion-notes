// test/helpers/dom.js — 用 jsdom 为 DOM 依赖的核心模块提供测试环境。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "..");

/**
 * withDom(html, fn) — 建立 jsdom 环境，加载指定核心文件后执行 fn({ document, window, AIDN })。
 * 核心模块里引用的全局 Node（Node.TEXT_NODE 等）在此注入。
 */
function withDom(html, files, fn) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const prevNode = globalThis.Node;
  globalThis.Node = dom.window.Node;
  try {
    for (const rel of files) {
      const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
      vm.runInThisContext(code, { filename: rel });
    }
    return fn({ document: dom.window.document, window: dom.window, AIDN: globalThis.AIDN });
  } finally {
    if (prevNode === undefined) delete globalThis.Node;
    else globalThis.Node = prevNode;
  }
}

module.exports = { withDom };
