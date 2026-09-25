# AI Discussion Notes — 协作开发与发布工作流 (Agent Workflow)

本文档记录本项目当前的标准开发、CI/CD 自动化构建、云端部署以及双端协同工作流。

---

## 1. 核心架构与各端角色

- **桌面端 (Chrome MV3 扩展)**：
  - 负责网页端（ChatGPT / Kimi / DeepSeek）的无感划词剪藏、百年大报式复习排版、认知雷达与 DeepSeek 密钥管理。
- **移动端 (Capacitor Android 原生 APP)**：
  - 负责随时随地自测号外、离线复习与想法批注回流；内置应用内一键在线检查更新机制。
- **云端同步网关 (Render 托管 Node.js 服务)**：
  - 位于 `server/sync-server.js`，基于单一 Secret Token 校验实现免注册、免绑定的极简增量同步，双向同步笔记数据与 DeepSeek 模型配置。

---

## 2. 标准分支开发流程

开发遵循**特性分支迭代，主分支发布**的原则：

### Step 1: 在特性分支开发与测试
所有新功能或 Bug 修复均在特性分支（例如 `feature/broadsheet-recall-system`）上完成：
```bash
# 1. 运行所有单元测试（确保全部通过）
npm test

# 2. 组装移动端原生资产并同步版本号
npm run build:mobile

# 3. 提交特性分支代码
git add -A
git commit -m "feat/fix: 简要描述"
git push origin feature/broadsheet-recall-system
```

### Step 2: 合并至主分支并推送
特性验证无误后，合并到 `main` 分支触发线上构建：
```bash
# 切换到 main 并合并
git checkout main
git merge feature/broadsheet-recall-system
git push origin main

# 切回开发分支继续后续迭代
git checkout feature/broadsheet-recall-system
```

---

## 3. 自动化 CI/CD 与发版 (GitHub Actions)

- **触发规则**：
  - `.github/workflows/build-apk.yml` 仅监听 `main` 分支的 `push` 事件（支持手动 `workflow_dispatch`）。
- **执行内容**：
  1. 初始化 Node.js 22 与 Java JDK 21 环境；
  2. 执行 `npm run build:mobile` 注入版本元数据（`versionCode`、`versionName`、`commitHash`）；
  3. 执行 `./gradlew assembleDebug` 构建最新的 Debug APK；
  4. 自动更新 GitHub Release 标签 `latest-mobile`，发布最新的 `app-debug.apk` 与 `version.json`。
- **Render 同步网关部署**：
  - Render 云服务绑定 GitHub 仓库的 `main` 分支，推送后自动拉取最新代码并热重载云同步网关。

---

## 4. 客户端数据同步与应用升级体验

### 增量数据同步
1. **电脑端**：在插件“设置抽屉”中输入 Render 服务地址（例如 `https://xxx.onrender.com`）与自定义 Token，点击「立即增量同步」，将笔记与已配置的 DeepSeek 密钥推至云端。
2. **手机端**：在 APP“设置抽屉”中输入相同的服务地址与 Token，点击「立即同步」，一键拉取全部笔记库，且 DeepSeek 状态自动激活就绪。

### APP 应用内一键升级
- 手机端内部设有「检查更新」按钮，通过请求 GitHub Releases 的 `latest-mobile/version.json` 比对本地版本；
- 检测到更高版本时提示新特性并直接下载 APK 安装，无需反复将安装包从电脑手动传输到手机。
