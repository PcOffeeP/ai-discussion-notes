// Background service worker: note creation, storage management, context menu.
importScripts("../shared/note-model.js");

const NOTES_KEY = "notes";
const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = { captureButtonEnabled: true };

// ---- storage helpers ----
async function getNotes() {
  const data = await chrome.storage.local.get(NOTES_KEY);
  return data[NOTES_KEY] || [];
}

async function saveNotes(notes) {
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return Object.assign({}, DEFAULT_SETTINGS, data[SETTINGS_KEY] || {});
}

async function addNote(note) {
  const notes = await getNotes();
  notes.push(note);
  await saveNotes(notes);
  return note;
}

// ---- context menu (Plan B entry, kept permanently) ----
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "aidn-save-selection",
    title: "Save to AI Discussion Notes",
    contexts: ["selection"],
    documentUrlPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  });
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  if (!data[SETTINGS_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "aidn-save-selection" || !tab?.id) return;
  // Ask the content script for adapter metadata (title, url, source).
  chrome.tabs.sendMessage(tab.id, { type: "AIDN_GET_CONTEXT" }, async (ctx) => {
    if (chrome.runtime.lastError) return;
    const note = self.AIDN.createNote({
      content: info.selectionText || "",
      source: ctx?.source || "ChatGPT",
      sourceType: "chat",
      conversationTitle: ctx?.conversationTitle || "",
      conversationUrl: ctx?.conversationUrl || info.pageUrl || "",
    });
    await addNote(note);
    chrome.tabs.sendMessage(tab.id, { type: "AIDN_SHOW_SAVED" }).catch(() => {});
  });
});

// ---- toolbar icon opens the Notes page ----
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("notes/notes.html") });
});

// ---- message API ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "AIDN_SAVE_NOTE": {
        const note = self.AIDN.createNote(msg.payload || {});
        await addNote(note);
        sendResponse({ ok: true, note });
        break;
      }
      case "AIDN_LIST_NOTES": {
        sendResponse({ ok: true, notes: await getNotes() });
        break;
      }
      case "AIDN_DELETE_NOTE": {
        const notes = await getNotes();
        await saveNotes(notes.filter((n) => n.id !== msg.id));
        sendResponse({ ok: true });
        break;
      }
      case "AIDN_CLEAR_NOTES": {
        await saveNotes([]);
        sendResponse({ ok: true });
        break;
      }
      case "AIDN_GET_SETTINGS": {
        sendResponse({ ok: true, settings: await getSettings() });
        break;
      }
      case "AIDN_SET_SETTINGS": {
        const settings = Object.assign(await getSettings(), msg.settings || {});
        await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
        sendResponse({ ok: true, settings });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown_message" });
    }
  })();
  return true; // async response
});
