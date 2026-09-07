// ChatGPTAdapter: CaptureAdapter implementation for chatgpt.com.
// Deliberately tolerant: every DOM lookup degrades to a safe fallback so the
// adapter keeps working when ChatGPT changes its markup.
(function (global) {
  class ChatGPTAdapter extends global.AIDN.CaptureAdapter {
    matches() {
      return /(^|\.)chatgpt\.com$/.test(location.hostname) ||
             /(^|\.)chat\.openai\.com$/.test(location.hostname);
    }
    getSource() { return "ChatGPT"; }
    getSourceType() { return "chat"; }
    getConversationTitle() {
      // 1) document.title is the most stable source; ChatGPT sets it to the
      //    conversation title, often suffixed with " - ChatGPT".
      const t = (document.title || "").replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();
      if (t && t.toLowerCase() !== "chatgpt") return t;
      // 2) fall back to the active conversation in the sidebar.
      const active = document.querySelector(
        'nav a[aria-current="page"], nav a[data-active="true"], nav .active a'
      );
      if (active && active.textContent.trim()) return active.textContent.trim();
      return "";
    }
    getConversationUrl() { return location.href; }
    getMetadata() {
      return { host: location.hostname };
    }
  }
  global.AIDN.adapters = global.AIDN.adapters || [];
  global.AIDN.adapters.push(new ChatGPTAdapter());
})(typeof self !== "undefined" ? self : window);
