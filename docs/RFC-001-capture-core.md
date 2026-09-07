# RFC-001: 深化「Capture → Serialize → Store」主干链路

**状态**：已确认方案，待实施
**日期**：2026-09-07
**方案**：六边形架构为骨架 + 主路径极简 API 为外衣（方案 4 + 方案 3 混合，吸收方案 1/2 的实现细节）

---

## 问题

当前「捕获 → 转换 → 存储」主干没有任何一段是深模块：

- **存储访问是手写 RPC**：`content.js`、`service-worker.js`、`notes.js` 三处共享 6 个消息字符串（`AIDN_SAVE_NOTE` 等），消息名、payload、响应格式无类型约束，改字段需人肉同步三处
- **捕获与序列化职责错位**：`CaptureAdapter` 基类的 `getSelectedContent()` 同时做选区克隆、HTML→Markdown 转换、降级 fallback；`html-to-markdown.js` 是浅模块（7 个内部函数纠缠，接口只暴露一个）
- **Note schema 知识散在三处**：`note-model.js` 的工厂只有 service worker 能用（importScripts），content script 绕过工厂手工组装字面量，渲染层硬编码字段名
- **已知 bug**：选中表格一部分时 DOM 片段丢失 `<table>` 外壳，序列化退化为纯文本（实测复现，见 2026-09-07 截图反馈）
- **单表示存储**：`content` 单字段，序列化失败即永久丢信息
- **零测试**：DOM 依赖与业务逻辑混杂，无法在 Node 中测试；ChatGPT 改版导致的回归无防护网

产品路线要求未来接入 Kimi/Claude 网页、桌面 Agent（Cursor/Codex 等非 DOM 来源），现有结构下每接一个平台都要同时动捕获、转换、存储三层。

## 提议的接口

### 分层

```text
DomSelectionSource(网页选区) ──┐
LocalHttpSource(桌面Agent, 预留) ─┼→ core.pipeline(归一化→序列化) → NoteRepo(chrome.storage / 未来云)
SiteProfile(ChatGPT/Kimi…) ──┘        ↑ 纯模块，Node fixture 可测
```

### Port（核心纯模块，零 chrome.* 依赖，JSDoc interface）

```js
// core/ports.js —— 三个端口
/** @interface NoteRepo    { save(note), list(), delete(id), clear() } */
/** @interface CaptureSource { start(emit), stop() } —— 推模式，emit(RawCapture) */
/** @interface KV { get(keys), set(items) } —— chrome.storage 的窄抽象 */

// RawCapture —— 与 DOM 无关的捕获输入
// { html?, text?, source, sourceType, conversationTitle?, conversationUrl?, metadata? }
```

### 核心模块

```js
// core/note.js —— schema 唯一拥有者
SCHEMA_VERSION = 2
createNote(dto)        // v2: { id, contentMarkdown, contentText, contentHtml,
                       //        source, sourceType, conversationTitle,
                       //        conversationUrl, metadata, createdAt, schemaVersion }
migrate(rawNote)       // v1(单 content 字符串) → v2，无损
search(notes, query)   // 搜索逻辑收进核心，UI 不再自写

// core/pipeline.js —— 深模块：归一化 + 序列化 + 入库
createPipeline({ repo, normalize?, serialize? })
// → async capture(raw: RawCapture): Promise<Note>
//   normalize: 块级选区归一化（选区落在 td/li 内部时向上补齐 table/ul 外壳）
//   serialize: htmlToMarkdown（内部为 Serializer 注册表：table/code/list/math 预留位）

// core/html-to-markdown.js —— 从 shared/ 迁入并注册表化
```

### 适配器

| 适配器 | 实现 | 部署位置 |
|---|---|---|
| `ChromeStorageNoteRepo`（含 v1→v2 迁移钩子） | NoteRepo | service worker |
| `RuntimeNoteClient`（sendMessage 封装，吃掉消息字符串） | NoteRepo 远程门面 | content / notes page |
| `RuntimeNoteServer`（消息监听 → 分发到 repo） | — | service worker |
| `DomSelectionSource`（DOM 选区 + 上下文采集） | CaptureSource | content script |
| `SiteProfile`（纯数据：matches/title 选择器，不再是子类继承） | 被 DomSelectionSource 消费 | content script |
| `MemoryNoteRepo` / `MemoryKV` | 测试适配器 | Node 测试 |
| `LocalHttpSource`（桌面 Agent：`POST 127.0.0.1:PORT/capture`） | CaptureSource | 预留，本期不实现 |

### 主路径外衣（调用方唯一可见的 API）

```js
// content script
await aidn.save()            // 一行：当前选区 → Note | null
// notes page
await aidn.all()             // Note[]，createdAt 倒序
await aidn.search(query)     // Note[]
await aidn.remove(id)        // boolean
// 二级 API：aidn.advanced.*（registerSiteProfile / exportAll / settings / migrate）
// 纪律：主路径必须实现为 advanced 的薄封装，保证二级路径被默认流量检验
```

### 使用示例

```js
// content.js 悬浮按钮
saveBtn.onclick = async () => { if (await aidn.save()) toast("Saved"); };

// 未来桌面 Agent（同一条管道，不区分 DOM 还是进程来源）
// fetch("http://127.0.0.1:7821/capture", { method: "POST", body: JSON.stringify({
//   text: snippet, source: "Cursor", sourceType: "agent" }) })

// Node 测试：fixture → Note，全程无 chrome
const pipeline = createPipeline({ repo: new MemoryNoteRepo() });
const note = await pipeline({ html: "<td>仅选中单元格</td>", source: "ChatGPT", ... });
```

## 依赖策略

| 类别 | 实例 | 处理 |
|---|---|---|
| 进程内 | pipeline、note schema、htmlToMarkdown、search | 直接合并为纯模块，不隔接口 |
| 本地可替代 | chrome.storage、chrome.runtime | 窄接口 KV / Transport 注入；测试用 MemoryKV + LoopbackTransport |
| 端口与适配器 | 捕获来源（DOM/桌面 IPC）、持久化（local/云） | 定义 Port，生产/测试双适配器 |
| Mock | 无 | 不手写 mock，测试用内存真实现 |

约束：核心模块用 UMD 风格 `(function(global){...})(globalThis)` 挂到 `AIDN` 命名空间——content script 无法用 ESM import，又不引入构建工具；Node 测试通过 eval 加载同一文件。

## 测试策略

- **新增边界测试**（Node `node --test`）：
  - `note.test.js`：createNote 默认值、v1→v2 迁移无损、search 命中 contentText/title
  - `pipeline.test.js`：注入 stub normalize/serialize 验证编排与入库
  - `repo.test.js`：MemoryNoteRepo 行为即接口契约
- **DOM fixture 测试**（htmlToMarkdown / 块归一化）：需要 DOM，本期标记为浏览器手动验证清单，后续引入 jsdom 后自动化
- **删除的旧测试**：无（当前零测试）
- **测试环境**：Node 内置 runner，无新依赖

## 实施建议

- 模块职责：core/* 拥有业务规则；adapters/* 薄到无可测；主路径 aidn.* 只做组合
- 隐藏：消息字符串、schema 迁移、块归一化、serializer 调度、storage key
- 暴露：save/all/search/remove + advanced.*
- 迁移步骤：
  1. 新建 core/ 与 ports，旧文件保持可用
  2. 适配器接管 storage 与消息，service-worker 瘦身为装配层
  3. content.js / notes.js 切到 aidn.* 主路径
  4. 删除 adapters/capture-adapter.js（类继承）、shared/note-model.js
  5. README 更新架构图
- 禁止在 Port 之外出现第三个抽象层；适配器必须薄到无可测
