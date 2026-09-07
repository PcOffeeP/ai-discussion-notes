// adapters/chrome/kv.js — KV 端口的生产/测试双实现。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  // 生产：包 chrome.storage.local
  function createChromeKV(area) {
    const storage = area || chrome.storage.local;
    return {
      get: (keys) => storage.get(keys),
      set: (items) => storage.set(items),
    };
  }

  // 测试/Node：内存实现，接口完全一致
  function createMemoryKV(initial) {
    const map = new Map(Object.entries(initial || {}));
    return {
      async get(keys) {
        if (keys == null) return Object.fromEntries(map);
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) if (map.has(k)) out[k] = map.get(k);
        return out;
      },
      async set(items) {
        for (const [k, v] of Object.entries(items)) map.set(k, v);
      },
      _dump: () => Object.fromEntries(map), // 仅测试断言用
    };
  }

  AIDN.createChromeKV = createChromeKV;
  AIDN.createMemoryKV = createMemoryKV;
})(typeof self !== "undefined" ? self : globalThis);
