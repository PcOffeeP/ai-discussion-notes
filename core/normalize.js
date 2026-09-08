// core/normalize.js — 块级选区归一化。
// 算法：取选区两端各自最近的顶层块祖先，把选区扩展为
// 「起始块开头 → 结束块结尾」的完整区间再克隆。
// 用户的意图单位是"块"而不是字符（RFC-002 决策），且该算法天然避免了
// 「残片 + 完整块重复拼接」的旧 bug（2026-09-09 实测发现）。
// 依赖 DOM Range，仅在浏览器上下文使用（Node 测试经 jsdom 注入）。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  // 顶层块：选区扩展的取整单位
  const BLOCK_SELECTOR = "p,ul,ol,table,pre,blockquote,h1,h2,h3,h4,h5,h6";

  function asEl(node) {
    return !node ? null : node.nodeType === 1 ? node : node.parentElement;
  }

  // 最近的顶层块祖先；嵌套时（如 blockquote > p）取最外层
  function topBlockOf(node, doc) {
    let el = asEl(node);
    let found = null;
    while (el && el !== doc.body && el !== doc.documentElement) {
      if (el.matches && el.matches(BLOCK_SELECTOR)) found = el;
      el = el.parentElement;
    }
    return found;
  }

  /**
   * normalizeRange(range, doc) -> HTML string
   * 输出块级结构完整的 HTML 片段。
   */
  function normalizeRange(range, doc) {
    if (!range || range.collapsed) return "";

    const startBlock = topBlockOf(range.startContainer, doc);
    const endBlock = topBlockOf(range.endContainer, doc);

    // 两端都在顶层块之外（如纯文本选区）：直接克隆
    if (!startBlock && !endBlock) {
      const holder = doc.createElement("div");
      holder.appendChild(range.cloneContents());
      return holder.innerHTML;
    }

    // 计算包含两端块的最小区间
    const start = startBlock || endBlock;
    const end = endBlock || startBlock;
    let outer = null;
    if (start === end) outer = start;
    else if (start.contains(end)) outer = start;
    else if (end.contains(start)) outer = end;

    let html;
    if (outer) {
      // 选区落在同一个顶层块内，或存在嵌套关系（如块引用内含段落）：取整块
      html = outer.outerHTML;
    } else {
      // 跨块：扩展为「起始块开头 → 结束块结尾」
      const expanded = doc.createRange();
      expanded.setStartBefore(start);
      expanded.setEndAfter(end);
      const holder = doc.createElement("div");
      holder.appendChild(expanded.cloneContents());
      html = holder.innerHTML;
      expanded.detach();
    }
    return html;
  }

  AIDN.normalize = { normalizeRange, BLOCK_SELECTOR };
})(typeof self !== "undefined" ? self : globalThis);
