// adapters/sources/site-profiles.js — 平台资料（纯数据，不再是类继承）。
// 新平台接入 = 在这里加一份数据 + 在 manifest 加 matches，核心零改动。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  const siteProfiles = [
    {
      platform: "ChatGPT",
      sourceType: "chat",
      matches: (hostname) => /(^|\.)(chatgpt\.com|chat\.openai\.com)$/.test(hostname),
      getTitle(doc) {
        const t = (doc.title || "").replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();
        if (t && t.toLowerCase() !== "chatgpt") return t;
        const active = doc.querySelector(
          'nav a[aria-current="page"], nav a[data-active="true"], nav .active a'
        );
        return active && active.textContent.trim() ? active.textContent.trim() : "";
      },
    },
    {
      platform: "Kimi",
      sourceType: "chat",
      matches: (hostname) => /(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/.test(hostname),
      getTitle(doc) {
        // Kimi 标题通常为「对话标题 - Kimi」形态，做同样的后缀剥离 + 侧栏高亮回退
        const t = (doc.title || "").replace(/\s*[-–—]\s*Kimi\s*$/i, "").trim();
        if (t && t.toLowerCase() !== "kimi") return t;
        const active = doc.querySelector(
          '[class*="chat-list"] [class*="active"], [class*="conversation"][class*="active"], [aria-current="page"]'
        );
        return active && active.textContent.trim() ? active.textContent.trim() : "";
      },
    },
    {
      platform: "DeepSeek",
      sourceType: "chat",
      matches: (hostname) => /(^|\.)chat\.deepseek\.com$/.test(hostname),
      getTitle(doc) {
        // DeepSeek 标题通常为「对话标题 - DeepSeek」形态，做同样的后缀剥离 + 侧栏高亮回退
        const t = (doc.title || "").replace(/\s*[-–—]\s*DeepSeek\s*$/i, "").trim();
        if (t && t.toLowerCase() !== "deepseek") return t;
        const active = doc.querySelector(
          '[class*="active"] [class*="title"], [class*="conversation"][class*="active"], [aria-current="page"]'
        );
        return active && active.textContent.trim() ? active.textContent.trim() : "";
      },
    },
    // 未来：
    // { platform: "Claude", sourceType: "chat", matches: h => /(^|\.)claude\.ai$/.test(h), getTitle: ... },
  ];

  function matchProfile(hostname) {
    return siteProfiles.find((p) => p.matches(hostname)) || null;
  }
  function registerSiteProfile(profile) {
    siteProfiles.push(profile);
  }

  AIDN.siteProfiles = siteProfiles;
  AIDN.matchProfile = matchProfile;
  AIDN.registerSiteProfile = registerSiteProfile;
})(typeof self !== "undefined" ? self : globalThis);
