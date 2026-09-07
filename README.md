# AI Discussion Notes — MVP 浏览器扩展

按照《AI Discussion Notes — MVP 初始设计文档 v0.1》实现的 Chrome 扩展（Manifest V3）。

> Save the best things you learn from AI.

## 架构（RFC-001，v0.2 起）

六边形骨架 + 极简主路径外衣。核心是纯模块（零 `chrome.*` 依赖，Node 可测），
边界通过端口注入适配器。

```text
DomSelectionSource(网页选区) ──┐
LocalHttpSource(桌面Agent, 预留) ─┼→ core.pipeline(归一化→序列化) → NoteRepo(chrome.storage / 未来云)
SiteProfile(ChatGPT/Kimi…) ──┘        ↑ 纯模块，Node fixture 可测
```

```text
core/                  # 纯模块（业务规则唯一拥有者）
├── ports.js           # 端口定义文档：NoteRepo / CaptureSource / KV
├── note.js            # Note schema v2：createNote / migrate(v1→v2) / search
├── normalize.js       # 块级选区归一化（修复选区丢失 table/ul 外壳）
├── html-to-markdown.js# HTML→Markdown（内含 Serializer 注册表，math 预留位）
└── pipeline.js        # createPipeline({repo, serialize?}) → capture(RawCapture)

adapters/              # 薄适配器（薄到无可测）
├── chrome/kv.js                 # KV 端口：ChromeKV(生产) / MemoryKV(测试)
├── chrome/storage-note-repo.js  # NoteRepo 生产实现 + 惰性迁移回写
├── chrome/runtime-client.js     # NoteRepo 远程门面（吃掉消息协议）
├── chrome/runtime-server.js     # SW 侧消息分发（协议唯一拥有者）
└── sources/
    ├── site-profiles.js         # 平台资料 = 纯数据（新平台只加一份数据）
    └── dom-selection-source.js  # CaptureSource：选区采集 + 归一化

client/aidn.js         # 主路径外衣：save() / all() / search() / remove() + advanced.*
background/            # 装配层（组合端口与适配器，无业务规则）
content/               # 纯 UI：选区监听、悬浮按钮、toast
notes/                 # Notes 页（markdown-it + DOMPurify 渲染）
test/                  # Node 边界测试：npm test
docs/RFC-001-capture-core.md  # 本次重构的完整设计依据
```

## 主路径 API

```js
// content script（悬浮按钮）
await aidn.save()            // 当前选区 → Note | null
// notes page
await aidn.all()             // Note[]，倒序
await aidn.search(query)     // Note[]
await aidn.remove(id)        // boolean
// 二级：aidn.advanced.saveRaw / registerSiteProfile / registerSerializer /
//       exportAll / clearAll / settings.get / settings.patch
```

## Note schema v2

```js
{ id, schemaVersion: 2,
  contentMarkdown,   // 主展示（Markdown 原文）
  contentText,       // 搜索索引
  contentHtml,       // 原始 HTML 兜底（序列化失败不丢信息）
  source, sourceType, conversationTitle, conversationUrl, metadata, createdAt }
```

v1 数据（单 `content` 字段）在 `repo.list()` 时惰性迁移并回写，用户无感知。

## 安装（开发者模式）

1. Chrome → `chrome://extensions` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择本目录
3. 打开 https://chatgpt.com/ ，选中文字点「＋ Note」
4. 点击工具栏扩展图标打开 Notes 页

## 测试

```bash
npm test   # node --test：note schema / 迁移 / 搜索 / 管道编排 / repo 契约
```

DOM 相关（块归一化、html-to-markdown）目前走浏览器手动验证清单，
引入 jsdom 后自动化。

## 扩展新平台 / 新来源

- 新网页平台：`site-profiles.js` 加一份纯数据 + manifest 加 matches，核心零改动
- 新内容类型（如 KaTeX 公式）：`aidn.advanced.registerSerializer({test, serialize})`
- 桌面 Agent：实现 `LocalHttpSource`（CaptureSource 端口），桌面进程
  `POST 127.0.0.1:PORT/capture` 即进入同一条管道
- 云同步：实现 NoteRepo 接口的 CloudSyncNoteRepo，SW 装配处一行替换
