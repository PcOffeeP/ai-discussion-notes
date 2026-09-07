// HTML -> Markdown converter (capture side).
// Restores the Markdown structure that the AI platform already rendered as
// HTML (headings, lists, code blocks, quotes, tables, inline styles), so the
// saved excerpt keeps its original Markdown form (design: 原文优先).
(function (global) {
  function esc(text) {
    // escape characters that would be misread as markdown
    return text.replace(/([\\`*_[\]])/g, "\\$1");
  }

  function inline(node) {
    let out = "";
    node.childNodes.forEach((child) => {
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
        case "span": case "font": case "mark": case "small": case "sub": case "sup":
          out += inner;
          break;
        default:
          // block element appearing inside inline context: fall back to text
          out += inner || esc(child.textContent || "");
      }
    });
    return out;
  }

  function listToMd(listEl, indent) {
    const ordered = listEl.tagName.toLowerCase() === "ol";
    let index = parseInt(listEl.getAttribute("start") || "1", 10);
    let out = "";
    listEl.childNodes.forEach((li) => {
      if (!li.tagName || li.tagName.toLowerCase() !== "li") return;
      const marker = ordered ? `${index++}. ` : "- ";
      // item content may itself contain nested blocks
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
    const lines = [header, sep, ...rows.slice(1)].map((r) => "| " + r.join(" | ") + " |");
    return lines.join("\n");
  }

  function block(node, indent) {
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
          const cls = codeEl.className || "";
          const m = /language-([\w+-]+)/.exec(cls);
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
      case "code": // standalone inline code
        return "`" + node.textContent.replace(/`/g, "\\`") + "`";
      case "li": // stray li outside a list
        return "- " + inline(node).trim();
      case "script": case "style": case "button": case "svg":
        return ""; // skip UI chrome (e.g. "copy code" buttons inside pre)
      default:
        // div / section / article / figure ...: recurse into children
        return blockChildren(node, indent || 0);
    }
  }

  function blockChildren(node, indent) {
    const blocks = [];
    node.childNodes.forEach((child) => {
      const b = block(child, indent);
      if (b && b.trim()) blocks.push(b);
    });
    // join blocks with a blank line, but keep list/table internals tight
    return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function htmlToMarkdown(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    return blockChildren(tpl.content, 0);
  }

  global.AIDN = global.AIDN || {};
  global.AIDN.htmlToMarkdown = htmlToMarkdown;
})(typeof self !== "undefined" ? self : window);
