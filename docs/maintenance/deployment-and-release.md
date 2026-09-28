# 部署与发布说明

最后更新：2026-09-29。适用版本：0.4.7（Android versionCode 407）。

用户已授权提交维护文档、合并并推送本次已验收修复，以及在 GitHub 发布下一版本。旧文档中的“不推送触发发布”仅是上一阶段的操作边界，不再描述本次执行。当前仍不迁移签名、不购买持久盘、不直接修改线上凭据或数据；本次 main 推送会触发仓库既有发布流水线，并可能触发已连接的 Render 自动部署。

## 本次发布范围

v0.4.7 包含本地并发存储、同步应答保护、服务端可靠提交及默认凭据移除、安全合并导入、基于当前笔记的离线提示、共享配置版本合并和发布验证门槛等六批整改。完整范围、独立审查边界和未关闭事项见 [整改记录](repository-health-2026-09-28.md)。

全端删除尚未接入：删除和清空仍只影响本机，其他设备或云端记录可能再次同步回来。旧客户端兼容方案未确定，不能在 Release 中宣称这个问题已修复。

## 同步存储与部署兼容

网关通过 `SYNC_STORAGE_FILE` 指向持久文件，默认路径为 `data/cloud-notes.json`。Docker 声明 `/data` 挂载点并默认使用 `/data/cloud-notes.json`；部署者必须实际挂载持久卷。只声明 VOLUME 或设置路径不能证明宿主机或云端存储可靠。

必须通过私密环境配置 `SYNC_SECRET_TOKEN`。空值及历史内置默认值将拒绝启动，日志不输出 Token。由 main 自动部署的现有 Render 服务同样必须满足这个条件；无需将 Token 写入 GitHub Release、命令行示例或仓库。

同步先写临时文件、fsync 并原子替换，再确认成功。提交失败返回 503 并保留原库；损坏文件拒绝启动。服务重启使用同一文件维持 `storageId`，存储重建后新版客户端重新提交本地全量基线。这种恢复依赖尚存的客户端数据，不能替代备份，也不能保证断电、磁盘损坏或所有文件系统条件下零损失。

现有 `render.yaml` 仍使用 free 计划，没有配置持久盘，只适用于演示与短期测试。重部署等情况下文件可能丢失。本次未开通付费资源、未调整线上存储；生产持久化、费用、备份和恢复策略仍由维护者确认。服务文件与备份包含笔记和共享模型 Key 的明文，须按个人私密数据保护；持有 Token 的人拥有该库的读写权限。

## Android 签名与安装

当前 debug 和 release 构建都使用仓库中的 `android/app/debug.keystore`，本次 CI 发布 `assembleDebug` 产物。保留现有签名用于维持与历史包的签名连续性，不构成私密发布身份，也不保证任意版本组合都能覆盖安装；设备测试与安装兼容仍需实际验证。

公开签名文件及其公开密码可被他人使用。迁移私密签名需要确定数据导出、重新安装或其他经验证的兼容方案，并由维护者私密保存签名、配置 CI Secrets。本版本没有迁移或增加外部私密签名支持，也不会生成或公开私密签名。

应用更新检查读取 GitHub Release，下载完整 APK，再由用户完成 Android 安装。它不是差量更新，也不会自动完成安装。

## 发布执行与验收

1. 在特性分支执行 `npm test`、`npm run build:mobile`、`npm run check` 和 `node scripts/check-project.js --assets`。检查工作树，提交维护文档及必要构建元数据；原工作区用户修改不纳入本次提交。
2. 核对远端 main 和最新 Release。当前下一发布版本为 `v0.4.7`；若该版本已存在，不覆盖其标签或不相关产物，应先核对发布来源。
3. 合并修复分支到 main 并正常推送，不强制覆盖远端进展。
4. `.github/workflows/build-apk.yml` 使用锁文件安装依赖，执行 JS 测试、版本契约检查、移动构建和同步资产核对，再执行 `testDebugUnitTest assembleDebug`。
5. 只有前置步骤成功且分支为 main，才执行 Release 发布。手动运行非 main 分支只构建，不发布正式 Release。
6. 验收实际 Actions 结论、Release 是否正式发布及其 `AI-Discussion-Notes-v0.4.7.apk`、`version.json` 附件。核对附件的版本、versionCode 与构建来源。Git push 成功只代表提交已推送，不代表构建或发布已成功。

本机截至发布准备阶段：Node v22.22.1，完整回归 82/82，通过版本及同步资产检查。Java 与 Gradle 缓存缺失，所以本机没有执行原生测试和 APK 编译；GitHub Actions 的运行结论才是本次远端原生构建证据。Android 设备集成测试不会随当前 CI 自动运行，不声称真机验收通过。

发布与构建入口：[v0.4.7 Release](https://github.com/PcOffeeP/ai-discussion-notes/releases/tag/v0.4.7)、[APK 流水线](https://github.com/PcOffeeP/ai-discussion-notes/actions/workflows/build-apk.yml)。
