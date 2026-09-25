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

  // 移动端/Web/PWA：包 window.localStorage 实现，提供与 chrome.storage 统一的 KV 端口
  function createLocalStorageKV(prefix = "aidn_") {
    return {
      async get(keys) {
        if (typeof localStorage === "undefined") return {};
        if (keys == null) {
          const out = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) {
              try {
                out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k));
              } catch (_) {
                out[k.slice(prefix.length)] = localStorage.getItem(k);
              }
            }
          }
          return out;
        }
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) {
          const val = localStorage.getItem(prefix + k);
          if (val != null) {
            try { out[k] = JSON.parse(val); } catch (_) { out[k] = val; }
          }
        }
        return out;
      },
      async set(items) {
        if (typeof localStorage === "undefined") return;
        for (const [k, v] of Object.entries(items || {})) {
          localStorage.setItem(prefix + k, JSON.stringify(v));
        }
      },
    };
  }

  AIDN.createChromeKV = createChromeKV;
  AIDN.createMemoryKV = createMemoryKV;
  AIDN.createLocalStorageKV = createLocalStorageKV;
})(typeof self !== "undefined" ? self : globalThis);
