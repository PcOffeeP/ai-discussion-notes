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

// 确保 rsvg-convert 存在
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
  .replace('.rule-faint { stroke: #1A1918; stroke-opacity: 0.16; }', '.rule-faint { stroke: #ECE8DF; stroke-opacity: 0.18; }')
  .replace('.card-border { stroke: #1A1918; stroke-opacity: 0.28; }', '.card-border { stroke: #ECE8DF; stroke-opacity: 0.32; }')
  .replace('.card-bg { fill: #1A1918; fill-opacity: 0.035; }', '.card-bg { fill: #ECE8DF; fill-opacity: 0.05; }')
  .replace('.crimson { fill: #A31D1D; }', '.crimson { fill: #C52828; }')
  .replace('.on-crimson { fill: #F8F6F0; }', '.on-crimson { fill: #16181D; }');

const tmpDarkSvg = path.join(iconsDir, 'tmp-dark.svg');
fs.writeFileSync(tmpDarkSvg, darkSvgContent);
run(`rsvg-convert -w 512 -h 512 "${tmpDarkSvg}" -o "${path.join(iconsDir, 'icon-dark-512.png')}"`);
fs.unlinkSync(tmpDarkSvg);

// 2. 生成 Android Adaptive Icon 前景 (透明底，主图标缩小到中央 70% 黄金安全区域，严谨对称)
console.log('--- 2. 生成 Android Adaptive Icon 前景 ---');
const foregroundSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(64, 64) scale(0.75)">
    <!-- 引入主图标的核心视觉 (严格网格对称) -->
    <rect width="512" height="512" rx="108" fill="#F8F6F0" stroke="#1A1918" stroke-width="4" stroke-opacity="0.08"/>
    <!-- 顶部报头 -->
    <rect x="64" y="74" width="284" height="16" rx="3" fill="#1A1918"/>
    <rect x="64" y="98" width="284" height="5" rx="1" fill="#1A1918"/>
    <rect x="64" y="122" width="168" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <!-- 朱砂印 -->
    <g transform="translate(368, 64)">
      <rect width="80" height="80" rx="16" fill="#A31D1D"/>
      <path fill="#F8F6F0" d="M40 14 C40 28 31 40 16 40 C31 40 40 52 40 66 C40 52 49 40 64 40 C49 40 40 28 40 14 Z"/>
    </g>
    <line x1="64" y1="156" x2="448" y2="156" stroke="#1A1918" stroke-width="1.5" stroke-opacity="0.16"/>
    <!-- 中央分栏线 -->
    <line x1="256" y1="172" x2="256" y2="430" stroke="#1A1918" stroke-width="2" stroke-opacity="0.16"/>
    <!-- 行 1：双栏大标题 -->
    <rect x="64" y="176" width="180" height="24" rx="3" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="268" y="176" width="180" height="24" rx="3" fill="#1A1918" fill-opacity="0.88"/>
    <!-- 行 2：导读 -->
    <rect x="64" y="212" width="140" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="212" width="150" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <!-- 行 3：核心模块高度对齐 -->
    <rect x="64" y="236" width="6" height="80" rx="2" fill="#A31D1D"/>
    <rect x="80" y="240" width="164" height="10" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="80" y="260" width="164" height="10" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="80" y="280" width="132" height="10" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="80" y="300" width="150" height="10" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="268" y="236" width="180" height="80" rx="4" fill="#1A1918" fill-opacity="0.035" stroke="#1A1918" stroke-width="2" stroke-opacity="0.28"/>
    <rect x="284" y="258" width="148" height="10" rx="2" fill="#1A1918" fill-opacity="0.88"/>
    <rect x="284" y="282" width="108" height="10" rx="2" fill="#A31D1D"/>
    <!-- 行 4：报道正文 (完全水平对齐) -->
    <rect x="64" y="336" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="336" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="64" y="356" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="356" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="64" y="376" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="376" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="64" y="396" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="396" width="180" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="64" y="416" width="124" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
    <rect x="268" y="416" width="112" height="10" rx="2" fill="#1A1918" fill-opacity="0.38"/>
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
