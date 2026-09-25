// scripts/build-mobile-dist.js — 为 Capacitor 组装移动端原生运行资产目录
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist-mobile");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("[build-mobile] 清空并创建 dist-mobile 资产目录…");
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 1. mobile.html -> dist-mobile/index.html
const mobileHtml = fs.readFileSync(path.join(rootDir, "mobile.html"), "utf-8");
fs.writeFileSync(path.join(distDir, "index.html"), mobileHtml, "utf-8");

// 2. notes/notes.css -> dist-mobile/notes/notes.css
fs.mkdirSync(path.join(distDir, "notes"), { recursive: true });
fs.copyFileSync(path.join(rootDir, "notes", "notes.css"), path.join(distDir, "notes", "notes.css"));

// 3. 复制核心逻辑与适配层
copyDirRecursive(path.join(rootDir, "core"), path.join(distDir, "core"));
copyDirRecursive(path.join(rootDir, "adapters"), path.join(distDir, "adapters"));
copyDirRecursive(path.join(rootDir, "vendor"), path.join(distDir, "vendor"));
copyDirRecursive(path.join(rootDir, "icons"), path.join(distDir, "icons"));

console.log("[build-mobile] 移动端原生资产准备就绪: dist-mobile/");
