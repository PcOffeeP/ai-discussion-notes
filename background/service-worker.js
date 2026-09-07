// background/service-worker.js — 装配层：组合端口与适配器，不含业务规则。
importScripts(
  "../core/note.js",
  "../core/html-to-markdown.js",
  "../core/pipeline.js",
  "../client/aidn.js",
  "../adapters/chrome/kv.js",
  "../adapters/chrome/storage-note-repo.js",
  "../adapters/chrome/runtime-server.js"
);

const AIDN = self.AIDN;
const kv = AIDN.createChromeKV();
const repo = AIDN.createStorageNoteRepo(kv);
const server = AIDN.createRuntimeNoteServer({ repo, kv });
const aidn = AIDN.createClient({ repo });

// ---- 右键菜单（备用捕获入口，与悬浮按钮共用同一条管道） ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "aidn-save-selection",
    title: "Save to AI Discussion Notes",
    contexts: ["selection"],
    documentUrlPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "aidn-save-selection" || !tab?.id) return;
  const title = (tab.title || "").replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();
  await aidn.advanced.saveRaw({
    text: info.selectionText || "",
    source: "ChatGPT",
    sourceType: "chat",
    conversationTitle: title,
    conversationUrl: info.pageUrl || tab.url || "",
  });
  chrome.tabs.sendMessage(tab.id, { type: "AIDN_TOAST", text: "Saved" }, () => {
    void chrome.runtime.lastError; // 页面可能未加载 content script，忽略
  });
});

// ---- 工具栏图标打开 Notes 页 ----
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("notes/notes.html") });
});

void server; // 消息监听已在 createRuntimeNoteServer 中注册
