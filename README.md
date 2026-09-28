# AI Discussion Notes (AIDN)

保存与 AI 对话中的摘录，回看原文并记录批注，在手机上做复习。项目包含 Chrome MV3 扩展、Capacitor Android 应用及可选的单人同步网关。

## 当前能力

- 桌面扩展在 ChatGPT、Kimi、DeepSeek 网页上采集选区，生成 HTML、Markdown、纯文本三种表示；按会话聚类、搜索、查看和批注。
- 移动端使用本地存储。JSON 导入完整校验后合并，不先清空原库；新时间覆盖旧时间，同 ID 同时间异文经确认后保存冲突副本。示例重载只替换示例笔记，并先确认。
- 未配置模型或请求失败时，围绕当前原文和批注生成确定性的离线回忆提示，明确标注未经模型推理。配置 Key 后，联网时客户端直接调用指定模型；号外请求及画像请求有超时和离线降级。
- 桌面认知雷达在页面刷新时分析最近 8 篇笔记。当前画像不持久化，也没有云端定时分析、号外缓存或按复习次数调度；相关 RFC 中的完整生命周期仍是设计目标。
- 同步网关是一个 Token 对应一份笔记库的个人服务，没有多用户权限模型。服务端使用文件存储和记录级更新时间合并，写入成功后才确认；客户端不会把请求期间的新修改误标为已同步。离线修改仍留在本机等待下次同步。
- DeepSeek Key、地址及模型可随同步共享。只有实际配置变化增加版本，两端按版本合并，支持显式清空 Key；同时间异值按 Key、地址、模型的稳定字符串序列排序，取较大者使双方收敛。时钟不同步仍是记录级时间合并的限制。同步 Token 和端点仅在本机保存。
- 应用更新检查访问 GitHub Release，下载完整 APK，由用户完成 Android 安装；没有差量更新，也不自动安装。

## 安装与运行

### 桌面扩展

在 Chrome/Edge 的扩展管理页启用开发者模式，选择“加载已解压的扩展”，指向项目根目录。点击扩展图标打开笔记页面。桌面页面依赖扩展运行时，直接通过普通 HTTP 打开 `notes/notes.html` 不提供真实存储和采集功能。

### 手机与浏览器预览

从 [GitHub Releases](https://github.com/PcOffeeP/ai-discussion-notes/releases) 选择相应版本的完整 APK；构建产物命名为 `AI-Discussion-Notes-v{version}.apk`。

浏览器调试可使用已有 Python 运行 `npm run serve`，访问 `http://localhost:8080/mobile.html`。开发者工具的设备仿真只能验证浏览器布局与交互，不能证明 Android 安装、软键盘或真机行为。`preview.html` 是静态展示页面。未构建的手机预览显示“开发预览”，不伪造安装包版本。

本地构建要求 Node >=22.12、JDK 21 及项目所需 Android SDK：

```sh
npm ci
npm test
npm run check
npm run build:mobile
node scripts/check-project.js --assets
cd android
./gradlew testDebugUnitTest assembleDebug
```

`build:mobile` 会清理生成目录 dist-mobile，并同步 Capacitor 原生资产；会更新 version.json、Android 版本信息及 Capacitor 生成配置。请在特性分支执行并检查 Git 状态。此命令使用已安装的本地 CLI，不自动下载工具。

### 可选个人同步网关

网关无需第三方运行时依赖。必须设置独立的 `SYNC_SECRET_TOKEN`；缺失或内置默认值将拒绝启动。启动日志不输出凭据。只向自己控制的 HTTPS 网关提交 Token、笔记及共享模型 Key。

```sh
# 凭据通过私密环境注入，不把实际值写进命令历史或仓库。
export SYNC_STORAGE_FILE=/your/persistent/path/cloud-notes.json
npm run start:sync
```

`SYNC_STORAGE_FILE` 默认位于 data/cloud-notes.json。文件损坏时服务拒绝启动；请保留备份并检查文件，不能通过清空原文件掩盖损坏。写入失败返回 503，客户端保留待同步状态。

云端文件包含笔记与共享模型 Key 的明文。部署者必须保护存储卷、备份和 Token；持有 Token 的人拥有整份个人库的读写权限。Docker 的 `/data` 应挂载到持久卷。客户端检测到 storageId 改变会重新提交本地基线，但恢复依赖尚存的本机数据，不能替代备份。

Render 部署与 Android 签名的选择参见 [部署与发布说明](docs/maintenance/deployment-and-release.md)。不要把免费临时存储或已公开签名当成可靠生产持久化与可信发布身份。

## 代码地图

| 路径 | 实际职责 |
| --- | --- |
| core/note.js、normalize.js、pipeline.js | 笔记 schema、迁移、选区补全与转换 |
| core/group.js | 会话分组与聚合 |
| core/recall/ | 模型提示组装与响应解析 |
| core/note-import.js、settings.js | 导入合并及共享配置的版本规则 |
| adapters/chrome/ | KV、本地事务、云同步、扩展消息通信 |
| adapters/sources/ | 网站采集规则 |
| adapters/llm/deepseek-client.js | 模型请求、超时及基于原文的离线降级 |
| background/service-worker.js | 扩展装配、采集菜单及笔记服务入口 |
| content/、notes/、mobile.html | 采集界面、桌面笔记界面、手机复习界面 |
| server/sync-server.js | Token 校验、文件提交与双向同步 |
| scripts/、.github/workflows/ | 构建资产、只读契约检查及 APK 发布流程 |
| test/、android/app/src/test/ | 纯模块、DOM、回环 HTTP 集成及原生工程契约检查 |

## 验证与发布

`npm test` 包含真实移动页面入口及本机 HTTP 集成测试；不调用付费模型或生产网关。原生设备测试需要另行在模拟器或设备执行，JS 测试通过不能证明 APK 安装成功。

CI 使用锁文件安装依赖，先执行测试与版本检查，再构建并核对移动资产、执行原生单元测试，最后才发布 APK。main 推送触发发布；手动运行在非 main 分支只构建产物。提交不等于发布成功，实际结果以 CI 记录为准。

版本以 package.json 为来源，manifest、锁文件、version.json 与 Android 版本须一致。当前版本 0.4.7，尚未宣称已发布。审计与修复记录见 [整改日志](docs/maintenance/repository-health-2026-09-28.md)。

## 设计文档

RFC-001 与 RFC-002 描述采集和笔记界面；RFC-003 的云端编排、自动画像等部分是已确认的设计目标，并非全部已实现；RFC-004 记录界面设计规范。设计文档中的分数、示例和性能目标不作为当前测试证据。仓库尚未包含独立 LICENSE 文件，原有 MIT 声明需要维护者补齐许可文件后再确认。
