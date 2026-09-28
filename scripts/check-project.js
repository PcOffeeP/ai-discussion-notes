// 只读发布契约检查：版本、应用身份与可选移动资产引用。
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const manifest = JSON.parse(read("manifest.json"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.ok([major, minor, patch].every(n => Number.isInteger(n) && n >= 0 && n <= 99), "versionCode 支持各位 0..99，超出范围需确认编码方案");
const code = major * 10000 + minor * 100 + patch;
assert.equal(lock.version, pkg.version, "锁文件根版本");
assert.equal(lock.packages[""].version, pkg.version, "锁文件项目版本");
assert.equal(manifest.version, pkg.version, "扩展版本");
const info = JSON.parse(read("version.json"));
assert.equal(info.version, pkg.version, "移动版本");
assert.equal(info.versionCode, code, "移动版本编码");
const gradle = read("android/app/build.gradle");
assert.match(gradle, new RegExp(`versionName "${pkg.version.replaceAll(".", "\\.")}"`));
assert.match(gradle, new RegExp(`versionCode ${code}\\b`));
const appId = JSON.parse(read("capacitor.config.json")).appId;
assert.match(gradle, new RegExp(`applicationId "${appId.replaceAll(".", "\\.")}"`));
assert.match(read("android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java"), new RegExp(`assertEquals\\("${appId.replaceAll(".", "\\.")}"`));
if (process.argv.includes("--assets")) {
  const index = read("dist-mobile/index.html");
  const buildInfo = JSON.parse(index.match(/window\.__APP_BUILD_INFO__ = (\{[^<]+\});/)[1]);
  assert.equal(buildInfo.version, pkg.version);
  for (const [, src] of index.matchAll(/<script src="([^"]+)"/g)) {
    assert.equal(read("dist-mobile/" + src), read(src), `移动资产 ${src} 必须与源码一致`);
    assert.equal(read("android/app/src/main/assets/public/" + src), read(src), `Android 资产 ${src} 必须与源码一致`);
  }
}
console.log(`Project contract OK: v${pkg.version}, code ${code}, ${appId}`);
