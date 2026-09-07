// CaptureAdapter base contract (design doc §20).
// A CaptureAdapter abstracts "where the excerpt comes from" so the Notes
// core never depends on a specific site's DOM.
//
// Interface:
//   matches()              -> bool   whether this adapter handles the current page
//   getSelectedContent()   -> string currently selected text
//   getSource()            -> string e.g. "ChatGPT"
//   getSourceType()        -> string e.g. "chat"
//   getConversationTitle() -> string may be "" if unavailable
//   getConversationUrl()   -> string link back to the original conversation
//   getMetadata()          -> object free-form extras
(function (global) {
  class CaptureAdapter {
    matches() { return false; }
    getSelectedContent() {
      // Markdown first: rebuild the excerpt's structure from the rendered
      // HTML inside the selection; fall back to plain text.
      const sel = global.getSelection ? global.getSelection() : null;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return "";
      if (global.AIDN && global.AIDN.htmlToMarkdown) {
        try {
          const container = document.createElement("div");
          for (let i = 0; i < sel.rangeCount; i++) {
            container.appendChild(sel.getRangeAt(i).cloneContents());
          }
          const md = global.AIDN.htmlToMarkdown(container.innerHTML);
          if (md && md.trim()) return md.trim();
        } catch (_) { /* fall through to plain text */ }
      }
      return sel.toString().trim();
    }
    getSource() { return "unknown"; }
    getSourceType() { return "chat"; }
    getConversationTitle() { return ""; }
    getConversationUrl() { return global.location ? global.location.href : ""; }
    getMetadata() { return {}; }
  }
  global.AIDN = global.AIDN || {};
  global.AIDN.CaptureAdapter = CaptureAdapter;
})(typeof self !== "undefined" ? self : window);
