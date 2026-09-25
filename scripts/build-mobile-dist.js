// scripts/build-mobile-dist.js — 为 Capacitor 组装移动端原生运行资产目录并自动注入版本元数据
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

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

// 1. 读取版本号与计算版本代码
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
const version = pkg.version || "0.4.1";

let commitHash = "unknown";
try {
  commitHash = execSync("git rev-parse --short HEAD", { cwd: rootDir, encoding: "utf-8" }).trim();
} catch (_) {}

// 根据语义化版本计算标准整数 versionCode (例如 0.4.1 -> 0*10000 + 4*100 + 1 = 401)
const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
const versionCode = major * 10000 + minor * 100 + patch;
const buildTime = new Date().toISOString();

const buildInfo = {
  version,
  versionCode,
  commit: commitHash,
  buildTime,
};

console.log(`[build-mobile] 构建版本: v${version} (versionCode: ${versionCode}, commit: ${commitHash})`);

// 2. 清空并创建 dist-mobile
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 3. mobile.html -> dist-mobile/index.html (注入版本信息)
let mobileHtml = fs.readFileSync(path.join(rootDir, "mobile.html"), "utf-8");
const scriptInjection = `<script>window.__APP_BUILD_INFO__ = ${JSON.stringify(buildInfo)};</script>`;
mobileHtml = mobileHtml.replace("</head>", `  ${scriptInjection}\n</head>`);
fs.writeFileSync(path.join(distDir, "index.html"), mobileHtml, "utf-8");

// 4. 生成统一的 version.json
fs.writeFileSync(path.join(distDir, "version.json"), JSON.stringify(buildInfo, null, 2), "utf-8");
fs.writeFileSync(path.join(rootDir, "version.json"), JSON.stringify(buildInfo, null, 2), "utf-8");

// 5. 同步更新 android/app/build.gradle 中的 versionCode 和 versionName
const gradlePath = path.join(rootDir, "android/app/build.gradle");
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, "utf-8");
  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradleContent = gradleContent.replace(/versionName\s+["'][^"']+["']/, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, gradleContent, "utf-8");
  console.log(`[build-mobile] 已同步更新 android/app/build.gradle -> versionCode: ${versionCode}, versionName: "${version}"`);
}

// 6. 复制其余静态资源
fs.mkdirSync(path.join(distDir, "notes"), { recursive: true });
fs.copyFileSync(path.join(rootDir, "notes", "notes.css"), path.join(distDir, "notes", "notes.css"));

copyDirRecursive(path.join(rootDir, "core"), path.join(distDir, "core"));
copyDirRecursive(path.join(rootDir, "adapters"), path.join(distDir, "adapters"));
copyDirRecursive(path.join(rootDir, "vendor"), path.join(distDir, "vendor"));
copyDirRecursive(path.join(rootDir, "icons"), path.join(distDir, "icons"));

console.log("[build-mobile] 移动端原生资产准备就绪: dist-mobile/");
