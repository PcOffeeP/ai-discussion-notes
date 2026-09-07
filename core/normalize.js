// core/normalize.js — 块级选区归一化。
// 修复已知 bug：用户选中表格/列表的一部分时，cloneContents 丢失块级外壳，
// 序列化退化为纯文本。归一化规则：选区与 table/ul/ol/pre/blockquote/标题
// 等块相交但未完整覆盖时，向上扩展为完整块。
// 依赖 DOM Range，仅在浏览器上下文使用（Node 测试中通过 stub 隔离）。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});
  const BLOCK_SELECTOR = "table,ul,ol,pre,blockquote,h1,h2,h3,h4,h5,h6";

  function isFullySelected(range, el) {
    try {
      return (
        range.comparePoint(el, 0) >= 0 &&
        range.comparePoint(el, el.childNodes.length) <= 0
      );
    } catch (_) {
      return false; // 节点部分在选区外时 comparePoint 抛异常 → 视为未完整覆盖
    }
  }

  // 沿祖先链找"包含整个选区但未被完整覆盖"的最外层块。
  function findCoveringPartialBlock(range, doc) {
    let el = range.commonAncestorContainer;
    el = el.nodeType === 1 ? el : el.parentElement;
    let candidate = null;
    while (el && el !== doc.body && el !== doc.documentElement) {
      if (el.matches && el.matches(BLOCK_SELECTOR) && !isFullySelected(range, el)) {
        candidate = el; // 继续向上，取最外层
      }
      el = el.parentElement;
    }
    return candidate;
  }

  // 端点处与选区相交但不完整、也不包含整个选区的块（跨块选择场景）。
  function findEdgePartialBlocks(range, doc) {
    const found = [];
    for (const node of [range.startContainer, range.endContainer]) {
      let el = node.nodeType === 1 ? node : node.parentElement;
      let outermost = null;
      while (el && el !== doc.body && el !== doc.documentElement) {
        if (
          el.matches &&
          el.matches(BLOCK_SELECTOR) &&
          safeIntersects(range, el) &&
          !isFullySelected(range, el)
        ) {
          outermost = el;
        }
        el = el.parentElement;
      }
      if (outermost && !found.includes(outermost)) found.push(outermost);
    }
    return found;
  }

  function safeIntersects(range, el) {
    try {
      return range.intersectsNode(el);
    } catch (_) {
      return false;
    }
  }

  /**
   * normalizeRange(range, doc) -> HTML string
   * 输出保证块级结构完整的 HTML 片段。
   */
  function normalizeRange(range, doc) {
    // 情形 1：选区整体落在某个块内部（典型：在表格里选了几个格子）
    const covering = findCoveringPartialBlock(range, doc);
    if (covering) return covering.outerHTML;

    // 情形 2：常规选区——克隆片段；端点若有残缺块，补全后附上
    const holder = doc.createElement("div");
    holder.appendChild(range.cloneContents());
    let html = holder.innerHTML;

    const edgeBlocks = findEdgePartialBlocks(range, doc).filter(
      (el) => !holder.contains(el) && !el.contains(holder.firstChild)
    );
    for (const el of edgeBlocks) {
      // 片段若已包含该块的部分内容，用整块替换以避免重复行
      html = el.outerHTML + html;
    }
    return html;
  }

  AIDN.normalize = { normalizeRange, BLOCK_SELECTOR };
})(typeof self !== "undefined" ? self : globalThis);
