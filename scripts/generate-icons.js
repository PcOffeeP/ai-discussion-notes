const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'icons');
const androidResDir = path.join(rootDir, 'android/app/src/main/res');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// 1. 确保 rsvg-convert 存在
try {
  execSync('which rsvg-convert');
} catch (e) {
  console.error('Error: rsvg-convert not found. Please install via homebrew (brew install librsvg).');
  process.exit(1);
}

console.log('--- 1. 导出 Chrome MV3 桌面端图标 ---');
run(`rsvg-convert -w 16 -h 16 "${path.join(iconsDir, 'icon-tiny.svg')}" -o "${path.join(iconsDir, 'icon16.png')}"`);
run(`rsvg-convert -w 32 -h 32 "${path.join(iconsDir, 'icon-small.svg')}" -o "${path.join(iconsDir, 'icon32.png')}"`);
run(`rsvg-convert -w 48 -h 48 "${path.join(iconsDir, 'icon-small.svg')}" -o "${path.join(iconsDir, 'icon48.png')}"`);
run(`rsvg-convert -w 128 -h 128 "${path.join(iconsDir, 'icon.svg')}" -o "${path.join(iconsDir, 'icon128.png')}"`);
run(`rsvg-convert -w 512 -h 512 "${path.join(iconsDir, 'icon.svg')}" -o "${path.join(iconsDir, 'icon-512.png')}"`);

// 导出深色模式 512px 图标
const darkSvgContent = fs.readFileSync(path.join(iconsDir, 'icon.svg'), 'utf8')
  .replace('.plate { fill: #F8F6F0; }', '.plate { fill: #16181D; }')
  .replace('.ink { fill: #1A1918; }', '.ink { fill: #ECE8DF; }')
  .replace('.ink-sub { fill: #1A1918; fill-opacity: 0.38; }', '.ink-sub { fill: #ECE8DF; fill-opacity: 0.38; }')
  .replace('.ink-head { fill: #1A1918; fill-opacity: 0.88; }', '.ink-head { fill: #ECE8DF; fill-opacity: 0.88; }')
  .replace('.rule { stroke: #1A1918; stroke-opacity: 0.16; }', '.rule { stroke: #ECE8DF; stroke-opacity: 0.18; }')
  .replace('.card-border { stroke: #1A1918; stroke-opacity: 0.28; }', '.card-border { stroke: #ECE8DF; stroke-opacity: 0.32; }')
  .replace('.card-bg { fill: #1A1918; fill-opacity: 0.035; }', '.card-bg { fill: #ECE8DF; fill-opacity: 0.05; }')
  .replace('.crimson { fill: #A31D1D; }', '.crimson { fill: #C52828; }')
  .replace('.on-crimson { fill: #F8F6F0; }', '.on-crimson { fill: #16181D; }');

const tmpDarkSvg = path.join(iconsDir, 'tmp-dark.svg');
fs.writeFileSync(tmpDarkSvg, darkSvgContent);
run(`rsvg-convert -w 512 -h 512 "${tmpDarkSvg}" -o "${path.join(iconsDir, 'icon-dark-512.png')}"`);
fs.unlinkSync(tmpDarkSvg);


// 2. 生成 Android 前景矢量 (透明底，主图标缩小到中央 68% 安全区域)
console.log('--- 2. 生成 Android Adaptive Icon 前景 ---');
const foregroundSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(64, 64) scale(0.75)">
    <!-- 引入主图标的核心视觉（带轻微投影的新闻纸与排版） -->
    <rect width="512" height="512" rx="108" fill="#F8F6F0" stroke="#1A1918" stroke-width="4" stroke-opacity="0.08"/>
    <!-- 牛津双线 -->
    <rect x="68" y="80" width="248" height="14" rx="2" fill="#1A1918"/>
    <rect x="68" y="104" width="248" height="5" rx="1" fill="#1A1918"/>
    <!-- 朱砂印 -->
    <g transform="translate(348, 72)">
      <rect width="96" height="96" rx="18" fill="#A31D1D"/>
      <path d="M48 18 C48 34 38 48 20 48 C38 48 48 62 48 78 C48 62 58 48 76 48 C58 48 48 34 48 18 Z" fill="#F8F6F0"/>
    </g>
    <!-- 分栏立柱 -->
    <line x1="256" y1="154" x2="256" y2="432" stroke="#1A1918" stroke-width="2.5" stroke-opacity="0.16"/>
    <!-- 左栏 -->
    <rect x="68" y="156" width="168" height="24" rx="3" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="68" y="190" width="128" height="11" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="68" y="222" width="6" height="84" rx="2" fill="#A31D1D"/>
    <rect x="84" y="226" width="152" height="11" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="84" y="247" width="152" height="11" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="84" y="268" width="124" height="11" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="84" y="289" width="140" height="11" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="68" y="328" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="68" y="349" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="68" y="370" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="68" y="391" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="68" y="412" width="118" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <!-- 右栏 -->
    <rect x="276" y="156" width="168" height="18" rx="3" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="276" y="186" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="206" width="142" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="234" width="168" height="72" rx="4" fill="#1A1918" fill-opacity="0.035" stroke="#1A1918" stroke-width="2" stroke-opacity="0.28"/>
    <rect x="292" y="254" width="136" height="9" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="292" y="275" width="98" height="9" rx="2" fill="#A31D1D"/>
    <rect x="276" y="328" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="349" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="370" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="391" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="276" y="412" width="106" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
  </g>
</svg>`;

const tmpForegroundSvg = path.join(iconsDir, 'tmp-foreground.svg');
fs.writeFileSync(tmpForegroundSvg, foregroundSvgContent);

const androidDensities = [
  { name: 'mipmap-mdpi', size: 108, legacySize: 48 },
  { name: 'mipmap-hdpi', size: 162, legacySize: 72 },
  { name: 'mipmap-xhdpi', size: 216, legacySize: 96 },
  { name: 'mipmap-xxhdpi', size: 324, legacySize: 144 },
  { name: 'mipmap-xxxhdpi', size: 432, legacySize: 192 }
];

for (const d of androidDensities) {
  const targetDir = path.join(androidResDir, d.name);
  if (!fs.existsSync(targetDir)) continue;
  
  // 1. Adaptive foreground
  run(`rsvg-convert -w ${d.size} -h ${d.size} "${tmpForegroundSvg}" -o "${path.join(targetDir, 'ic_launcher_foreground.png')}"`);
  // 2. Legacy launcher icon
  run(`rsvg-convert -w ${d.legacySize} -h ${d.legacySize} "${path.join(iconsDir, 'icon.svg')}" -o "${path.join(targetDir, 'ic_launcher.png')}"`);
  run(`rsvg-convert -w ${d.legacySize} -h ${d.legacySize} "${path.join(iconsDir, 'icon.svg')}" -o "${path.join(targetDir, 'ic_launcher_round.png')}"`);
}

fs.unlinkSync(tmpForegroundSvg);

// 3. 更新 Android 背景颜色配置为新闻纸颜色 #F8F6F0
const bgXmlPath = path.join(androidResDir, 'values/ic_launcher_background.xml');
fs.writeFileSync(bgXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F8F6F0</color>
</resources>
`);

console.log('✓ 图标导出与 Android 资源生成完成！');
