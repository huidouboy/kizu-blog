import { escapeHtml } from "./utils.mjs";

function parseInline(value) {
  let output = escapeHtml(value);
  const stash = [];

  output = output.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_${stash.length}@@`;
    stash.push(`<code>${code}</code>`);
    return token;
  });

  output = output
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (const [index, html] of stash.entries()) {
    output = output.replace(`@@CODE_${index}@@`, html);
  }

  return output;
}

export function markdownToHtml(markdown = "") {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let codeFence = null;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${parseInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) {
      return;
    }
    html.push(`<${list.type}>${list.items.map((item) => `<li>${parseInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  const flushQuote = () => {
    if (quote.length === 0) {
      return;
    }
    html.push(`<blockquote>${quote.map((item) => `<p>${parseInline(item)}</p>`).join("")}</blockquote>`);
    quote = [];
  };

  const flushFlow = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeFence) {
      if (line.startsWith("```")) {
        html.push(`<pre><code class="language-${escapeHtml(codeFence)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeFence = null;
        codeLines = [];
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    const fenceMatch = line.match(/^```([\w-]*)/);
    if (fenceMatch) {
      flushFlow();
      codeFence = fenceMatch[1] || "text";
      continue;
    }

    if (!line.trim()) {
      flushFlow();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushFlow();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(orderedMatch[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeFence) {
    html.push(`<pre><code class="language-${escapeHtml(codeFence)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  flushFlow();
  return html.join("\n");
}
