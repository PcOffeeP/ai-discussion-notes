# AI Discussion Notes — MVP 浏览器扩展

按照《AI Discussion Notes — MVP 初始设计文档 v0.1》实现的 Chrome 扩展（Manifest V3）。

## 功能对照设计文档

- **Markdown 原样保留**：捕获时把选区内的渲染 HTML 还原为 Markdown 存储（标题/列表/代码块/引用/表格/行内样式/链接），Notes 页用 markdown-it + DOMPurify 安全渲染，观感与大模型回复一致；Copy 复制的是 Markdown 原文

- **Capture**：在 chatgpt.com 选中文字 → 悬浮「＋ Note」按钮 → 点击即存，「Saved」轻提示自动消失（方案 A）；右键菜单「Save to AI Discussion Notes」作为永久备用入口（方案 B）
- **Store**：原文 + source / conversationTitle / conversationUrl / createdAt / sourceType，存于 `chrome.storage.local`（Local-first，无账号）
- **Recall**：点击浏览器工具栏扩展图标打开 Notes 页——倒序列表、全文搜索（content + conversationTitle）、Copy / Open Source / Delete
- **Empty State**：首次打开展示产品教学 + Open ChatGPT 按钮
- **Settings**：Capture Button 开关、笔记数量、Export (JSON)、Clear All

## 目录结构

```text
ai-discussion-notes/
├── manifest.json
├── background/service-worker.js   # 存储管理、右键菜单、消息 API
├── adapters/
│   ├── capture-adapter.js         # CaptureAdapter 抽象基类
│   └── chatgpt-adapter.js         # ChatGPT 实现（DOM 降级容错）
├── content/
│   ├── content.js                 # 选择监听、悬浮按钮、Saved toast
│   └── content.css
├── notes/
│   ├── notes.html                 # Notes 页面
│   ├── notes.css                  # Calm / minimal 风格
│   └── notes.js
└── shared/note-model.js           # Note 数据结构工厂
```

## 安装（开发者模式）

1. 打开 Chrome → `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录 `ai-discussion-notes/`
4. 打开 https://chatgpt.com/ 开始对话，选中任意文字点击「＋ Note」
5. 点击工具栏扩展图标打开 Notes 页面

## 扩展新平台（第二阶段）

新增平台只需：实现一个继承 `CaptureAdapter` 的 Adapter 并 push 到 `AIDN.adapters`，在 manifest 的 content_scripts matches 中加入对应域名。Notes Core 无需改动。
