// adapters/sources/dom-selection-source.js — CaptureSource 生产适配器（网页选区）。
// 职责收窄为"从 DOM 采集"：取选区 → 块级归一化 → 结合 SiteProfile 元数据，
// 产出与 DOM 无关的 RawCapture。不做序列化、不做存储。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  function createDomSelectionSource(win) {
    const w = win || window;
    const doc = w.document;

    // 当前选区 → RawCapture；选区为空返回 null
    function captureSelection() {
      const sel = w.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const text = sel.toString().trim();
      if (!text) return null;

      const range = sel.getRangeAt(0);
      const html = AIDN.normalize.normalizeRange(range, doc);

      const profile = AIDN.matchProfile(w.location.hostname);
      return {
        html,
        text,
        source: profile ? profile.platform : w.location.hostname,
        sourceType: profile ? profile.sourceType : "web",
        conversationTitle: profile ? profile.getTitle(doc) : (doc.title || ""),
        conversationUrl: w.location.href,
        metadata: { host: w.location.hostname },
      };
    }

    // CaptureSource 端口（推模式）：外部主动拉取的场景用 captureSelection，
    // start/stop 预留给未来的自动捕获类来源，本适配器暂不产生推送。
    function start() {}
    function stop() {}

    return { captureSelection, start, stop };
  }

  AIDN.createDomSelectionSource = createDomSelectionSource;
})(typeof self !== "undefined" ? self : globalThis);
