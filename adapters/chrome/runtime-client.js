// adapters/chrome/runtime-client.js — NoteRepo/设置 的远程门面。
// 吃掉 chrome.runtime 消息协议细节（消息字符串、lastError、async 信封），
// 调用方只看到与本地 NoteRepo 一致的 Promise 接口。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  function createRuntimeNoteClient(runtime) {
    const rt = runtime || chrome.runtime;

    function call(action, payload) {
      return new Promise((resolve, reject) => {
        rt.sendMessage({ __aidn: true, action, payload }, (resp) => {
          if (rt.lastError) return reject(new Error(rt.lastError.message));
          if (!resp || !resp.ok) return reject(new Error(resp?.error || "unknown"));
          resolve(resp.data);
        });
      });
    }

    return {
      // NoteRepo 远程门面
      save: (note) => call("notes.save", note),
      list: () => call("notes.list"),
      update: (id, patch) => call("notes.update", { id, patch }),
      delete: (id) => call("notes.delete", { id }),
      clear: () => call("notes.clear"),
      // 设置
      getSettings: () => call("settings.get"),
      patchSettings: (patch) => call("settings.patch", patch),
    };
  }

  AIDN.createRuntimeNoteClient = createRuntimeNoteClient;
})(typeof self !== "undefined" ? self : globalThis);
