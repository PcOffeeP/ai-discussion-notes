# AI Discussion Notes (AIDN)

<p align="center">
  <img src="icons/icon128.png" alt="AI Discussion Notes logo" width="128" />
</p>

<p align="center">
  <strong>百年大报排版风格的 AI 思考纪事与自测复习系统</strong><br />
  <em>The Classic Broadsheet for AI Insights, Cognitive Radar & Spaced Recall</em>
</p>

<p align="center">
  <a href="https://github.com/PcOffeeP/ai-discussion-notes/releases/latest">
    <img src="https://img.shields.io/badge/Release-v0.4.5-blue.svg" alt="Latest Release" />
  </a>
  <a href="https://github.com/PcOffeeP/ai-discussion-notes/actions/workflows/build-apk.yml">
    <img src="https://img.shields.io/badge/CI%20Build-Passing-brightgreen.svg" alt="CI Status" />
  </a>
  <img src="https://img.shields.io/badge/Tests-61%2F61%20Pass-success.svg" alt="Tests" />
  <img src="https://img.shields.io/badge/Critic%20Audit-9.56%20%2F%2010%20(Masterpiece)-orange.svg" alt="Design Critic Score" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20MV3%20%7C%20Android%20APP-darkblue.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-lightgrey.svg" alt="License" />
</p>

> **“Save the best things you learn from AI.”**
>
> 在与 ChatGPT、Kimi、DeepSeek 等顶尖大模型的长对话中，往往闪烁着极其精妙的推演、洞见与架构思考。**AI Discussion Notes** 专为捕捉这些“思维火花”而生——桌面划词无感剪藏，手机离线百年大报式出题自测，私密单 Token 免绑定双向增量同步。

---

## 📑 目录

- [🌟 核心端态与特性](#-核心端态与特性)
- [📰 百年大报视觉美学规范 (RFC-004)](#-百年大报视觉美学规范-rfc-004)
- [🏗️ 系统架构与 RFC 演进](#️-系统架构与-rfc-演进)
- [🚀 快速上手](#-快速上手)
  - [1. 桌面端 Chrome 扩展安装](#1-桌面端-chrome-扩展安装)
  - [2. 移动端 Android 原生 APP 安装](#2-移动端-android-原生-app-安装)
  - [3. 个人免绑定云同步网关部署](#3-个人免绑定云同步网关部署)
  - [4. 本地前端零构建调试与机型仿真](#4-本地前端零构建调试与机型仿真)
- [🛠️ 开发与发版工作流 (Agent Workflow)](#️-开发与发版工作流-agent-workflow)
- [🧪 自动化测试验证](#-自动化测试验证)
- [📄 开源协议](#-开源协议)

---

## 🌟 核心端态与特性

```mermaid
flowchart LR
    subgraph Desktop [🖥️ 桌面端 (Chrome MV3 扩展)]
        D1[ChatGPT / Kimi / DeepSeek] -->|划词剪藏| D2[选区归一化管道]
        D2 --> D3[《AI 讨论纪事报》主版面]
        D3 --> D4[DeepSeek 认知雷达]
    end

    subgraph Sync [☁️ 云端同步网关 (Render / Node.js)]
        S1[单 Token 鉴权] <--> S2[LWW 增量双向同步]
        S2 <--> S3[DeepSeek 密钥随路下发]
    end

    subgraph Mobile [📱 移动端 (Capacitor Android APP)]
        M1[统一部署报头] --> M2[头版号外三栏自测]
        M2 --> M3[防剧透折叠 & 提炼锚点]
        M3 --> M4[批注随笔回流 & 一键在线升级]
    end

    Desktop <==> Sync
    Sync <==> Mobile
```

### 1. 🖥️ 桌面端 Chrome 扩展（Manifest V3）
- **无感划词智能剪藏**：在 ChatGPT、Kimi、DeepSeek 网页中自由选区，智能修复选中局部表格/列表时的外壳丢失问题，生成包含 HTML、Markdown 和纯文本的无损三表示数据。
- **《AI 讨论纪事报》排版研读**：摒弃枯燥的数字列表，采用居中 36px 报头、牛津双线（Oxford Double Rule）、直角实体水墨卡片与自然流式操作栏，单行文字严格约束在人体工程学黄金扫视跨度（35~45 字）。
- **DeepSeek 动态认知雷达 (RFC-004)**：周期性全量分析笔记语义，提炼近期高频思辨主题与关注焦点，形成专属认知雷达画像。
- **头版号外自测弹窗**：内置启发式与 DeepSeek 大模型出题双引擎，支持键盘快捷键操控防剧透步进自测。

### 2. 📱 移动端原生 APP（Capacitor Android）
- **离线开箱即测**：地铁、通勤等弱网无网环境下完整可用，启动即见三栏式号外（【头版头条】· 专稿推演、【报眼要闻】· 概念辨析、【微言速测】· 警句快问）。
- **单层自然流长卷轴**：展开号外原文对照时摒弃嵌套小滚动盒，长文如同经典信纸自然向下平滑延伸，彻底治愈双重滚动槽卡顿。
- **核心提炼锚点与批注回流**：朱砂立柱标记金句，随笔扎记输入框置于底部防软键盘挤压，记录的思考心得自动随同步网关回流至桌面端。
- **应用内一键在线升级**：内置跨版本语义版本号与 Build Code 精准比对，一键完成增量下载并触发覆盖安装；工程固化原生签名保证跨版本覆盖安装零指纹冲突。

### 3. ☁️ 极简免绑定云同步网关 (Delta Sync)
- **单 Token 零账号负担**：无需繁琐的第三方登录绑定流程，仅凭单一私密 `SYNC_SECRET_TOKEN` 实现极简免登安全鉴权。
- **增量双向同步 (LWW)**：笔记修改自动生成 `dirty: true` 标记，毫秒级增量合并；首次配对自动全量对齐基准。
- **DeepSeek 配置随路下发**：电脑端配置的 DeepSeek API Key 随同步自动推送到云端并在手机端本地解包，移动端零门槛即开即用大模型出题。
- **纯原生极轻实现**：位于 `server/sync-server.js`，纯 Node.js 标准库实现（零第三方 NPM 运行时依赖），支持一键部署到 Render 或个人 VPS。

---

## 📰 百年大报视觉美学规范 (RFC-004)

系统经由独立视觉审查智能体（**Lead Visual Critic**）实施全量客观挑刺与深度重构，在 9 大设计维度斩获 **9.56 / 10 卓越级评分 (Masterpiece Grade)**：

```text
┌────────────────────────────────────────────────────────────────────────┐
│  甲辰年 · 讨论文汇           【头版号外】                 总第四十二期  │
│  ────────────────────────────────────────────────────────────────────  │
│  AI 讨论纪事报 [存录典藏]                                DEEPSEEK: 就绪  │
│  ════════════════════════════════════════════════════════════════════  │
│  【头版头条】· 专稿推演                                                │
│  深度推演大模型架构中的长上下文注意力压缩机理                          │
│                                                                        │
│  ┌─ ✦ 核心提炼锚点 ──────────────────────────────────────────────────┐ │
│  │ “注意力机制的本质并非存储，而是在高维语义流形上的即时投影计算。”    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  [❖ 展开思考线索]   [❖ 展开号外原文]                                    │
└────────────────────────────────────────────────────────────────────────┘
```

- **0px 直角纪律 (Strict Orthogonality)**：彻底摒弃圆角药丸与泛滥的弥散大阴影，全局采用 0 倒角、1px 细线分隔与物理印刷错版硬阴影。
- **纯正新闻纸墨感**：新闻纸米黄底色（`#f8f6f0`）搭配水墨浓黑阶梯（`#1a1918`），融合 SVG 分形微纤维噪点滤镜（`--paper-grain`），还原活字印刷的实体触感。
- **严格色彩与字阶系统**：
  - **色彩纪律**：92% 新闻纸/水墨基底 + 8% 次级灰 + 2% 纯正朱砂印泥暗红（`--crimson-red: #a31d1d`，绝不混用 Tailwind 亮红）。
  - **6 级数学字阶体系**：`11px`（元信息/角标）→ `12px`（辅助引言/按钮）→ `14px`（正文阅读）→ `16px`（报眼小标）→ `22px`（头版头条）→ `24px/36px`（大报头）。

---

## 🏗️ 系统架构与 RFC 演进

遵循经典**六边形架构（Ports & Adapters）**，核心领域层零浏览器及平台依赖，代码结构清晰解耦：

```text
├── core/                  # 纯核心领域模块（业务规则唯一拥有者）
│   ├── note.js            # Note Schema v3、迁移逻辑、搜索过滤与批注模型
│   ├── group.js           # 对话聚类与多维来源聚合算法
│   ├── normalize.js       # 选区块级补全（修复选中部分表格/列表时外壳丢失）
│   ├── html-to-markdown.js# 纯 JavaScript 实现的 HTML 序列化
│   ├── pipeline.js        # 采集输入处理管道
│   └── recall/            # 认知画像提炼与号外自测出题引擎
├── adapters/              # 薄适配器层（连接外部世界）
│   ├── chrome/            # Chrome Storage、运行时通信与云同步适配器 (Delta Sync)
│   ├── llm/               # DeepSeek API 客户端与启发式出题降级实现
│   └── sources/           # ChatGPT / Kimi / DeepSeek 平台数据配置
├── notes/                 # 桌面端《AI 讨论纪事报》排版与复习 UI
├── mobile.html            # 移动端专用复习号外自测界面与更新交互
├── android/               # Capacitor Android 原生应用工程
├── server/sync-server.js  # 极简个人免绑定云同步网关（零外部依赖）
├── test/                  # 全链路自动化测试（61 项测试）
├── docs/                  # RFC-001 ~ RFC-004 详细设计架构方案
├── AGENTS.md              # 规范协作开发、CI/CD 与多端发版工作流说明
└── .github/workflows/     # GitHub Actions 自动化编译打包与 Release 部署
```

- **[RFC-001](docs/RFC-001-capture-core.md)**：划词采集核心管道与选区块级补全算法。
- **[RFC-002](docs/RFC-002-notes-ui.md)**：对话自动聚类、来源倒序索引与大容量存储管理。
- **[RFC-003](docs/RFC-003-system-architecture-and-lifecycle.md)**：系统全生命周期、六边形架构与免绑定增量云同步规范。
- **[RFC-004](docs/RFC-004-broadsheet-ui-spec.md)**：百年大报视觉规范、认知雷达画像与头版号外自测交互。

---

## 🚀 快速上手

### 1. 桌面端 Chrome 扩展安装
1. 克隆代码仓库：
   ```bash
   git clone https://github.com/PcOffeeP/ai-discussion-notes.git
   cd ai-discussion-notes
   ```
2. 打开 Chrome / Edge 浏览器，访问 `chrome://extensions/`；
3. 开启右上角的 **「开发者模式」**；
4. 点击 **「加载已解压的扩展程序」**，选取本项目根目录；
5. 在 ChatGPT、Kimi 或 DeepSeek 对话中划词，即可看到剪藏浮钮，点击图标或快捷键即可秒级入库。

### 2. 移动端 Android 原生 APP 安装
- **直接下载安装（推荐）**：在手机浏览器访问 [GitHub Releases 最新发布页](https://github.com/PcOffeeP/ai-discussion-notes/releases/latest)，直接下载最新版本的 `AI-Discussion-Notes-v0.4.5.apk`。后续版本可在 APP 抽屉内点击「检查更新」一键在线差量升级。
- **本地编译构建**：
  ```bash
  npm install
  npm run build:mobile
  cd android && ./gradlew assembleDebug
  ```
  产物位于 `android/app/build/outputs/apk/debug/AI-Discussion-Notes-v0.4.5.apk`。

### 3. 个人免绑定云同步网关部署
1. **一键托管至 Render（推荐）**：
   - 将本项目 Fork 到个人 GitHub，在 [Render.com](https://render.com/) 创建一个 **Web Service**；
   - 填写启动命令：`node server/sync-server.js`；
   - 添加环境变量：`SYNC_SECRET_TOKEN=你的个人专属随机秘钥`。
2. **本地或 VPS 运行**：
   ```bash
   SYNC_SECRET_TOKEN=my_secure_token_123 node server/sync-server.js
   ```
3. **双端配置连接**：
   - 桌面扩展：点击右上角「设置」抽屉，输入网关服务地址与 Token，点击「立即增量同步」；
   - 手机端：点击报头「设置」抽屉，填入相同的网关服务地址与 Token，点击「立即同步」，双端瞬间打通！

### 4. 本地前端零构建调试与机型仿真
95% 的移动端出题逻辑与样式均为纯前端资产，无需每次打包 APK，可直接启动本地轻量预览服务：
```bash
npm run serve
```
- 访问桌面排版：`http://localhost:8080/notes/notes.html`
- 访问移动端自测：`http://localhost:8080/mobile.html`

> [!TIP]
> **OPPO Find X9 等旗舰机型高保真仿真指南**：  
> 按 `F12` 开启设备仿真（`Cmd + Shift + M`），添加自定义机型：
> - 视口逻辑尺寸：**`419 × 920`**（或内容区 `419 × 850`）
> - 设备像素比 (DPR)：**`3.0`**（460 PPI 换算标准）  
> 此时在电脑上即可体验 1:1 的真机排版张力与长卷轴滑动效果。

---

## 🛠️ 开发与发版工作流 (Agent Workflow)

本项目遵循严格的自动化发版规范（详见 [**`AGENTS.md`**](AGENTS.md)）：

1. **特性分支快速迭代**：所有日常修复与新特性在 `feature/*` 分支独立推进，验证无误批量累积提交；
2. **原生资产自动化打包**：提交前必须通过 `npm test` 并执行 `npm run build:mobile` 生成原生对齐资产；
3. **主分支自动化集中发版**：
   - 递增 `package.json` 中的语义化版本；
   - 合并至 `main` 分支并推送，自动触发 GitHub Actions 构建 Android APK；
   - 自动生成动态版本命名（`AI-Discussion-Notes-v{version}.apk`）并发布 GitHub Release；
   - 远端 Render 云同步网关同步热重载。

---

## 🧪 自动化测试验证

全套测试覆盖数据归一化、聚类索引、DeepSeek 启发式出题、增量同步与百年大报 DOM 状态机：

```bash
npm test
```

```text
✔ cloudSyncNoteRepo: 保存与更新自动打上 dirty: true
✔ cloudSyncNoteRepo: 云端增量双向同步与 LWW 合并
✔ deepseekClient: 启发式自测号外装配 (零网络环境开箱可用)
✔ normalize: 表格/列表选中截断向上智能闭合修复
✔ notes 页面 UI: 百年大报报头、认知雷达与防剧透状态机交互 (RFC-004)
...
ℹ tests 61
ℹ suites 0
ℹ pass 61
ℹ fail 0
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 许可协议开源。
