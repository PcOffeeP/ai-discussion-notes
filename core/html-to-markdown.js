// core/html-to-markdown.js — HTML → Markdown 序列化核心（纯逻辑，依赖 DOM 解析由调用方提供）。
// 内部为 Serializer 注册表：AIDN.registerSerializer({test, serialize}) 可注册
// 内容类型特例（如 MathSerializer 从 KaTeX annotation 还原 LaTeX，预留位）。
// 平台特例属于各 source 的预处理职责，通用规则留在本核心。
(function (global) {
  const AIDN = (global.AIDN = global.AIDN || {});

  // 自定义序列化器注册表：{ test(node)->bool, serialize(node)->markdown|null }
  const customSerializers = [];
  function registerSerializer(s) {
    customSerializers.push(s);
  }
  function tryCustomSerializers(node) {
    for (const s of customSerializers) {
      try {
        if (s.test(node)) {
          const out = s.serialize(node);
          if (typeof out === "string") return out;
        }
      } catch (_) { /* 单个 serializer 失败不阻断整体 */ }
    }
    return null;
  }

  function esc(text) {
    return text.replace(/([\\`*_[\]])/g, "\\$1");
  }

  function inlineNodes(children) {
    let out = "";
    children.forEach((child) => {
      if (child.nodeType === 1) {
        const custom = tryCustomSerializers(child);
        if (custom !== null) { out += custom; return; }
      }
      if (child.nodeType === Node.TEXT_NODE) {
        out += esc(child.textContent.replace(/\s+/g, " "));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();
      const inner = inline(child);
      switch (tag) {
        case "strong": case "b":
          out += inner.trim() ? `**${inner.trim()}**` : "";
          break;
        case "em": case "i":
          out += inner.trim() ? `*${inner.trim()}*` : "";
          break;
        case "del": case "s":
          out += inner.trim() ? `~~${inner.trim()}~~` : "";
          break;
        case "code":
          out += "`" + child.textContent.replace(/`/g, "\\`") + "`";
          break;
        case "a": {
          const href = child.getAttribute("href") || "";
          out += href ? `[${inner.trim() || href}](${href})` : inner;
          break;
        }
        case "img": {
          const src = child.getAttribute("src") || "";
          const alt = child.getAttribute("alt") || "";
          if (src) out += `![${alt}](${src})`;
          break;
        }
        case "br":
          out += "  \n";
          break;
        default:
          out += inner || esc(child.textContent || "");
      }
    });
    return out;
  }

  function inline(node) {
    return inlineNodes([...node.childNodes]);
  }

  function listToMd(listEl, indent) {
    const ordered = listEl.tagName.toLowerCase() === "ol";
    let index = parseInt(listEl.getAttribute("start") || "1", 10);
    let out = "";
    listEl.childNodes.forEach((li) => {
      if (!li.tagName || li.tagName.toLowerCase() !== "li") return;
      const marker = ordered ? `${index++}. ` : "- ";
      const content = blockChildren(li, indent + marker.length);
      const lines = content.split("\n");
      out += " ".repeat(indent) + marker + (lines.shift() || "") + "\n";
      lines.forEach((l) => {
        out += l.trim() ? " ".repeat(indent + marker.length) + l + "\n" : "\n";
      });
    });
    return out.replace(/\n$/, "");
  }

  function tableToMd(tableEl) {
    const rows = [];
    tableEl.querySelectorAll("tr").forEach((tr) => {
      const cells = [];
      tr.querySelectorAll("th,td").forEach((cell) => {
        cells.push(inline(cell).trim().replace(/\|/g, "\\|"));
      });
      if (cells.length) rows.push(cells);
    });
    if (!rows.length) return "";
    const header = rows[0];
    const sep = header.map(() => "---");
    return [header, sep, ...rows.slice(1)].map((r) => "| " + r.join(" | ") + " |").join("\n");
  }

  // 行内元素集合：块级上下文遇到它们时按文本处理，不拆成独立块
  const INLINE_TAGS = new Set([
    "strong", "b", "em", "i", "del", "s", "code", "a", "img", "br",
    "span", "font", "mark", "small", "sub", "sup", "u", "abbr", "kbd", "wbr",
  ]);

  function block(node, indent) {
    if (node.nodeType === 1) {
      const custom = tryCustomSerializers(node);
      if (custom !== null) return custom;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return esc(node.textContent || "").trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const h = /^h([1-6])$/.exec(tag);
    if (h) return "#".repeat(Number(h[1])) + " " + inline(node).trim();
    switch (tag) {
      case "p":
        return inline(node).trim();
      case "ul": case "ol":
        return listToMd(node, indent || 0);
      case "pre": {
        const codeEl = node.querySelector("code");
        let lang = "";
        if (codeEl) {
          const m = /language-([\w+-]+)/.exec(codeEl.className || "");
          if (m) lang = m[1];
        }
        const text = (codeEl || node).textContent.replace(/\n$/, "");
        return "```" + lang + "\n" + text + "\n```";
      }
      case "blockquote": {
        const inner = blockChildren(node, 0);
        return inner.split("\n").map((l) => (l.trim() ? "> " + l : ">")).join("\n");
      }
      case "table":
        return tableToMd(node);
      case "hr":
        return "---";
      case "code":
        return "`" + node.textContent.replace(/`/g, "\\`") + "`";
      case "li":
        return "- " + inline(node).trim();
      case "script": case "style": case "button": case "svg":
        return "";
      default:
        // 行内元素出现在块级位置时按文本处理（不拆块、保留 ** 等标记）
        if (INLINE_TAGS.has(tag)) return inline(node).trim();
        return blockChildren(node, indent || 0);
    }
  }

  function blockChildren(node, indent) {
    // 把连续的行内节点（文本、strong、code…）聚成一个段落，
    // 遇到块级元素再切分——否则 <li><strong>A</strong>：B</li>
    // 会被拆成两个块且丢失加粗（2026-09-09 Kimi 列表事故的深层原因之一）。
    const blocks = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const text = inlineNodes(run).trim();
      if (text) blocks.push(text);
      run = [];
    };
    node.childNodes.forEach((child) => {
      const isInline =
        child.nodeType === Node.TEXT_NODE ||
        (child.nodeType === Node.ELEMENT_NODE &&
          INLINE_TAGS.has(child.tagName.toLowerCase()) &&
          tryCustomSerializers(child) === null);
      if (isInline) {
        run.push(child);
        return;
      }
      const b = block(child, indent);
      if (b && b.trim()) {
        flush();
        blocks.push(b);
      }
    });
    flush();
    return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // html 字符串 -> markdown。doc 由调用方提供（浏览器里用 document，
  // 测试/服务端可注入任意 DOM 实现）。
  function htmlToMarkdown(html, doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) throw new Error("htmlToMarkdown 需要 DOM document");
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    return blockChildren(tpl.content, 0);
  }

  AIDN.htmlToMarkdown = htmlToMarkdown;
  AIDN.registerSerializer = registerSerializer;
})(typeof self !== "undefined" ? self : globalThis);
