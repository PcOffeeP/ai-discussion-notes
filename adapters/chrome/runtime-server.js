// adapters/chrome/runtime-server.js — service worker 侧消息分发。
// 唯一的消息协议拥有者；协议字符串是本文件的私有细节。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const SETTINGS_KEY = "settings";
  const DEFAULT_SETTINGS = { captureButtonEnabled: true };

  function createRuntimeNoteServer({ repo, kv, runtime }) {
    const rt = runtime || chrome.runtime;

    async function getSettings() {
      const data = await kv.get(SETTINGS_KEY);
      return Object.assign({}, DEFAULT_SETTINGS, data[SETTINGS_KEY] || {});
    }
    async function patchSettings(patch) {
      const merged = Object.assign(await getSettings(), patch || {});
      await kv.set({ [SETTINGS_KEY]: merged });
      return merged;
    }

    const handlers = {
      "notes.save": (note) => repo.save(AIDN.note.createNote(note)),
      "notes.list": () => repo.list(),
      "notes.delete": ({ id }) => repo.delete(id),
      "notes.clear": () => repo.clear(),
      "settings.get": () => getSettings(),
      "settings.patch": (patch) => patchSettings(patch),
    };

    rt.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.__aidn !== true) return false;
      const handler = handlers[msg.action];
      if (!handler) {
        sendResponse({ ok: false, error: "unknown_action" });
        return false;
      }
      handler(msg.payload || {})
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true; // async response
    });

    return { getSettings, patchSettings };
  }

  AIDN.createRuntimeNoteServer = createRuntimeNoteServer;
})(typeof self !== "undefined" ? self : globalThis);
