# AI Discussion Notes — MVP 浏览器扩展

<p align="center">
  <img src="icons/icon128.png" alt="AI Discussion Notes logo" width="128" />
</p>

按照《AI Discussion Notes — MVP 初始设计文档 v0.1》实现的 Chrome 扩展（Manifest V3）。

> Save the best things you learn from AI.

## 架构（RFC-001 ~ RFC-004，v0.4）

六边形骨架 + 极简主路径外衣 + 经典中文大报（The Classic Broadsheet）。核心是纯模块（零 `chrome.*` 依赖，Node 可测），
边界通过端口注入适配器。

```text
DomSelectionSource(网页选区) ──┐
LocalHttpSource(桌面Agent, 预留) ─┼→ core.pipeline(归一化→序列化) → NoteRepo(Local-First + CloudSync)
SiteProfile(ChatGPT/Kimi…) ──┘        ↑ 纯模块，Node fixture 可测      │
                                                                   ▼
DeepSeek 认知编排 (RFC-003) ←───────────────────────────────────── 云端增量同步 (Delta Sync)
├── 认知画像 (Cognitive Profile)
└── 号外复习自测 (Broadsheet Recall: 头条推演 / 要闻辨析 / 微言快问)
```

```text
core/                  # 纯模块（业务规则唯一拥有者）
├── ports.js           # 端口定义文档：NoteRepo / CaptureSource / KV
├── note.js            # Note schema v3：createNote / migrate(v1/v2→v3) / search / thoughts
├── group.js           # 会话与专栏聚类聚合纯函数
├── normalize.js       # 块级选区归一化（修复选区丢失 table/ul 外壳）
├── html-to-markdown.js# HTML→Markdown 序列化
├── pipeline.js        # createPipeline({repo, serialize?}) → capture(RawCapture)
└── recall/            # [RFC-003] 复习与认知编排纯模块
    ├── prompt-builder.js    # 双层 User Prompt 组装器
    └── response-parser.js   # 号外 JSON 校验与解析器

adapters/              # 薄适配器
├── chrome/kv.js                 # KV 端口：ChromeKV(生产) / MemoryKV(测试)
├── chrome/storage-note-repo.js  # 本地 NoteRepo
├── chrome/cloud-sync-note-repo.js # [RFC-003] 云端增量同步适配器 (Delta Sync)
├── chrome/runtime-client.js     # NoteRepo 远程门面（吃掉消息协议）
├── chrome/runtime-server.js     # SW 侧消息分发（协议唯一拥有者）
├── llm/deepseek-client.js       # [RFC-003] DeepSeek 认知编排客户端 (含启发式降级)
└── sources/
    ├── site-profiles.js         # 平台资料 = 纯数据
    └── dom-selection-source.js  # CaptureSource：选区采集 + 归一化

client/aidn.js         # 主路径外衣：save() / all() / search() / remove() / thoughts / recall / sync
background/            # 装配层（组合端口与适配器，无业务规则）
content/               # 纯 UI：选区监听、悬浮按钮、toast
notes/                 # [RFC-004]《AI 讨论纪事报》：经典多栏大报版芯 + 头版号外自测
test/                  # 边界自动化测试：npm test
docs/                  # RFC 设计架构全套方案 (RFC-001 ~ RFC-004)
```

## 主路径 API

```js
// content script（悬浮按钮）
await aidn.save()            // 当前选区 → Note | null
// notes page
await aidn.all()             // Note[]，倒序
await aidn.search(query)     // Note[]
await aidn.remove(id)        // boolean
await aidn.addThought(id, t) // Thought
await aidn.recall.generateIssue({ notes, targetNoteId }) // IssuePayload
await aidn.recall.getProfile(notes)                      // CognitiveProfile
await aidn.sync.syncNow()                                // Delta Sync
```

## Note schema v3 (RFC-003)

```js
{
  id: string,
  schemaVersion: 3,
  contentMarkdown: string,   // 主展示（Markdown 原文）
  contentText: string,       // 搜索索引
  contentHtml: string,       // 原始 HTML 兜底
  source: string,
  sourceType: string,
  conversationTitle: string,
  conversationUrl: string,
  thoughts: Array<{ id, text, createdAt }>, // 想法便利贴 / 随感批注
  metadata: {
    host?: string,
    dirty?: boolean,         // 本地待推送标记
    syncedAt?: string,       // 云端同步时间戳
    lastRecalledAt?: string, // 最近一次出题复习时间
    recallCount?: number     // 复习唤醒次数
  },
  createdAt: string
}
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

支持平台：ChatGPT（chatgpt.com）、Kimi（kimi.com / kimi.moonshot.cn）、DeepSeek（chat.deepseek.com）。

## 扩展新平台 / 新来源

- 新网页平台：`site-profiles.js` 加一份纯数据 + manifest 加 matches + SW 右键菜单 patterns 加域名，核心零改动（Kimi 接入即此路径，见 commit 历史）
- 新内容类型（如 KaTeX 公式）：`aidn.advanced.registerSerializer({test, serialize})`
- 桌面 Agent：实现 `LocalHttpSource`（CaptureSource 端口），桌面进程
  `POST 127.0.0.1:PORT/capture` 即进入同一条管道
- 云同步：实现 NoteRepo 接口的 CloudSyncNoteRepo，SW 装配处一行替换
