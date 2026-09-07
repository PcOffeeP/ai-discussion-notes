// test/helpers/load.js — 在 Node 中加载 UMD 风格的核心/适配器文件。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");

function load(...relPaths) {
  for (const rel of relPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    vm.runInThisContext(code, { filename: rel });
  }
  return globalThis.AIDN;
}

module.exports = { load };
