# AI Discussion Notes (AIDN)

<p align="center">
  <img src="icons/icon128.png" alt="AI Discussion Notes logo" width="128" />
</p>

<p align="center">
  <strong>随时随地从 AI 对话中汲取高价值认知，跨端协同沉淀与智能自测复习。</strong>
</p>

<p align="center">
  <a href="https://github.com/PcOffeeP/ai-discussion-notes/releases/latest">
    <img src="https://img.shields.io/badge/Release-v0.4.2-blue.svg" alt="Latest Release" />
  </a>
  <a href="https://github.com/PcOffeeP/ai-discussion-notes/actions">
    <img src="https://img.shields.io/badge/Build-Passing-brightgreen.svg" alt="CI Status" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Chrome%20MV3%20%7C%20Android%20APP-orange.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/Sync-Delta%20Sync%20Gateway-purple.svg" alt="Sync Gateway" />
</p>

> **“Save the best things you learn from AI.”**
> 
> 在与 ChatGPT、Kimi、DeepSeek 等顶尖大模型的长对话中，往往闪烁着极其精妙的推演、洞见与架构思考。AI Discussion Notes 专为捕捉这些“思维火花”而生——桌面划词无感剪藏，手机离线百年大报式出题自测，跨端私密极速同步。

---

## 🌟 核心特性

### 1. 桌面端 Chrome 扩展（Manifest V3）
- **无感划词剪藏**：在 ChatGPT、Kimi、DeepSeek 对话中自由选区，一键浮钮秒级剪藏；自动提取对话主题、来源平台并补全表格与列表外壳。
- **《AI 讨论纪事报》复习排版**：采用经典百年大报（The Classic Broadsheet）多栏排版与衬线报纸质感设计，摒弃枯燥列表，带来沉浸式研读体验。
- **动态认知雷达 (Cognitive Radar)**：提炼近期笔记的高频思辨主题与关注焦点，形成多维认知画像。
- **号外自测编排**：内置本地启发式与 DeepSeek 大模型出题双引擎，自动生成「头条推演、要闻辨析、微言快问」三种深度的自测号外。

### 2. 移动端原生 APP（Capacitor Android）
- **随时随地离线复习**：通勤、地铁等无网弱网环境下完整可用，开箱即测。
- **防剧透渐进式答题**：思考线索、号外原文对照、概念辨析、快测答案四段式抽屉折叠交互，引导深度思考而非被动刷题。
- **随手反思批注**：支持记录答题感想与个人随笔，批注自动沉淀并可随路回流电脑端。
- **应用内一键在线升级**：内置精准版本比对（语义化版本与 Build Code），APP 内一键检查云端更新并直接下载升级，告别手动拷贝 APK 安装包。

### 3. 极简免绑定云同步网关 (Delta Sync)
- **单 Token 零账号依赖**：基于单一 Secret Token 校验，免去复杂的第三方登录与账号绑定流程。
- **增量双向同步 (LWW)**：电脑插件与手机端双向增量合并，毫秒级响应；初次配对自动基准全量上传。
- **DeepSeek 模型配置随路同步**：在电脑端配置好 DeepSeek API Key 后随同步自动落入手机本地，移动端即开即用大模型出题。
- **轻量云端部署**：位于 `server/sync-server.js`，纯 Node.js 标准库实现（零外部运行时依赖），支持一键部署到 Render / Docker / 个人 VPS。

---

## 🏗️ 架构设计 (RFC-001 ~ RFC-004)

采用六边形架构（Ports & Adapters），核心领域层纯模块化、零浏览器环境依赖，业务规则拥有完整单元测试保障：

```text
DomSelectionSource (网页选区采集) ──┐
LocalHttpSource (桌面Agent扩展预留) ─┼→ core.pipeline(选区归一化 → Markdown序列化) → NoteRepo
SiteProfile (ChatGPT / Kimi / …) ──┘        ↑ 纯业务模块，Node.js 自动化测试       │
                                                                                 ▼
DeepSeek 认知编排 (RFC-003) ←──────────────────────────────────────── 增量双向同步 (Delta Sync)
├── 认知画像 (Cognitive Profile)                                                 ├── 桌面 Chrome 扩展
└── 号外自测系统 (Broadsheet Recall: 启发式 / 大模型双模态)                       └── 移动端原生 APP
```

### 目录结构

```text
├── core/                  # 纯核心领域模块（业务规则唯一拥有者）
│   ├── note.js            # Note Schema v3、迁移逻辑、搜索过滤与批注模型
│   ├── group.js           # 对话聚类与来源聚合算法
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

---

## 🚀 快速上手

### 1. 桌面 Chrome 扩展安装
1. 克隆本项目仓库：
   ```bash
   git clone https://github.com/PcOffeeP/ai-discussion-notes.git
   cd ai-discussion-notes
   ```
2. 打开 Chrome，访问 `chrome://extensions/`；
3. 打开右上角的 **「开发者模式」**；
4. 点击 **「加载已解压的扩展程序」**，选取本项目根目录；
5. 在 ChatGPT、Kimi 或 DeepSeek 对话中划词，即可看到剪藏浮钮。

### 2. 移动端 Android APP 安装
- **方式一（推荐）**：直接在手机浏览器访问 [GitHub Releases 最新安装包](https://github.com/PcOffeeP/ai-discussion-notes/releases/latest)，下载 `app-debug.apk` 安装。安装后后续均可在 APP 内点击「检查更新」一键在线升级。
- **方式二（本地编译）**：
  ```bash
  npm install
  npm run build:mobile
  cd android && ./gradlew assembleDebug
  ```
  编译生成的安装包位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

### 3. 配置云端同步网关 (双端同步)
1. **部署网关**：可将本项目直接导入 [Render](https://render.com/) 作为 Web Service（启动命令：`node server/sync-server.js`，环境变量配置 `SYNC_SECRET_TOKEN`），或在个人服务器通过 Node.js 直接运行：
   ```bash
   node server/sync-server.js
   ```
2. **电脑端配置**：打开扩展“设置抽屉”，填入网关地址（如 `https://xxx.onrender.com`）与私密 Token，点击「立即增量同步」。
3. **手机端配置**：打开手机 APP“设置抽屉”，填入相同的网关地址与 Token，点击「立即同步」，笔记与 DeepSeek 配置即刻全量入驻！

---

## 🧪 自动化测试

运行全部 61 项单元与冒烟测试：
```bash
npm test
```

---

## 🛠️ 开发与发版工作流

本项目遵循标准规范的 **“特性分支迭代，主分支发布”** 工作流，详细说明请参阅 [**`AGENTS.md`**](file:///Users/pcoffeep/AgentPlayground/active-projects/ai-discussion-notes/AGENTS.md)。
- 新功能开发在 `feature/*` 分支独立完成；
- 合并至 `main` 分支并推送后，GitHub Actions 自动触发编译生成最新 Android 安装包，并发布至 GitHub Releases；
- Render 云同步网关同步热重载。

---

## 📄 开源许可

[MIT License](LICENSE)
