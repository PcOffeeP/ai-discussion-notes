// adapters/chrome/runtime-server.js — service worker 侧消息分发。
// 唯一的消息协议拥有者；协议字符串是本文件的私有细节。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const SETTINGS_KEY = "settings";
  const DEFAULT_SETTINGS = {
    captureButtonEnabled: true,
    deepseekApiKey: "",
    deepseekBaseUrl: "https://api.deepseek.com/v1",
    deepseekModel: "deepseek-chat",
    syncEndpoint: "",
    userToken: "",
  };

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

    // 写操作成功后向所有扩展页面广播变更（kind = save|update|delete|clear），
    // 打开中的 Notes 页据此自动刷新，无需手动 F5。
    // 覆盖 repo 层而非仅 handlers：右键菜单 fallback 等绕过 handlers 的写入同样会广播。
    const notifyChanged = (kind) => {
      try {
        Promise.resolve(
          rt.sendMessage({ __aidn: true, action: "notes.changed", payload: { kind } })
        ).catch(() => { /* 无接收者时静默忽略 */ });
      } catch (_) { /* 同上 */ }
    };
    const notifyingRepo = Object.assign({}, repo);
    for (const method of ["save", "update", "delete", "clear"]) {
      notifyingRepo[method] = async (...args) => {
        const result = await repo[method](...args);
        notifyChanged(method);
        return result;
      };
    }

    const handlers = {
      "notes.save": (note) => notifyingRepo.save(AIDN.note.createNote(note)),
      "notes.list": () => repo.list(),
      "notes.update": ({ id, patch }) => notifyingRepo.update(id, patch),
      "notes.delete": ({ id }) => notifyingRepo.delete(id),
      "notes.clear": () => notifyingRepo.clear(),
      "settings.get": () => getSettings(),
      "settings.patch": (patch) => patchSettings(patch),
      "recall.issue": async (params) => {
        const settings = await getSettings();
        if (AIDN.llm?.createDeepSeekClient) {
          const client = AIDN.llm.createDeepSeekClient({
            apiKey: settings.deepseekApiKey,
            baseUrl: settings.deepseekBaseUrl,
            model: settings.deepseekModel,
          });
          return client.generateRecallIssue(params);
        }
        throw new Error("DeepSeek 客户端未加载");
      },
      "recall.profile": async (params) => {
        const settings = await getSettings();
        if (AIDN.llm?.createDeepSeekClient) {
          const client = AIDN.llm.createDeepSeekClient({
            apiKey: settings.deepseekApiKey,
            baseUrl: settings.deepseekBaseUrl,
            model: settings.deepseekModel,
          });
          return client.generateCognitiveProfile(params);
        }
        throw new Error("DeepSeek 客户端未加载");
      },
      "sync.now": async (params) => {
        const settings = await getSettings();
        if (typeof repo.sync === "function") {
          return repo.sync({
            syncEndpoint: params?.syncEndpoint || settings.syncEndpoint,
            userToken: params?.userToken || settings.userToken,
          });
        }
        return { ok: true, offline: true };
      },
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
