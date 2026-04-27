import { escapeHtml } from "./utils.mjs";

function getPath(context, keyPath) {
  if (keyPath === "this") {
    return context.this ?? context;
  }

  return keyPath.split(".").reduce((value, key) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    return value[key];
  }, context);
}

function renderVariables(template, context) {
  return template
    .replace(/{{{\s*([^}]+)\s*}}}/g, (_, keyPath) => {
      const value = getPath(context, keyPath.trim());
      return value === undefined || value === null ? "" : String(value);
    })
    .replace(/{{\s*([^#/>{][^}]*)\s*}}/g, (_, keyPath) => {
      const value = getPath(context, keyPath.trim());
      return escapeHtml(value === undefined || value === null ? "" : String(value));
    });
}

function findMatchingClose(template, tag, fromIndex) {
  const blockPattern = new RegExp(`{{#${tag}\\s+[^}]+}}|{{\\/${tag}}}`, "g");
  blockPattern.lastIndex = fromIndex;
  let depth = 1;
  let match = blockPattern.exec(template);

  while (match) {
    if (match[0].startsWith(`{{#${tag}`)) {
      depth += 1;
    } else {
      depth -= 1;
    }

    if (depth === 0) {
      return {
        start: match.index,
        end: blockPattern.lastIndex
      };
    }

    match = blockPattern.exec(template);
  }

  return null;
}

function renderBlocks(template, context, render) {
  const startPattern = /{{#(if|each)\s+([^}]+)}}/g;
  let output = "";
  let cursor = 0;
  let match = startPattern.exec(template);

  while (match) {
    const [fullMatch, tag, keyPath] = match;
    const innerStart = match.index + fullMatch.length;
    const close = findMatchingClose(template, tag, innerStart);

    if (!close) {
      output += template.slice(cursor, startPattern.lastIndex);
      cursor = startPattern.lastIndex;
      match = startPattern.exec(template);
      continue;
    }

    output += template.slice(cursor, match.index);
    const inner = template.slice(innerStart, close.start);

    if (tag === "if") {
      const value = getPath(context, keyPath.trim());
      output += value ? render(inner, context) : "";
    }

    if (tag === "each") {
      const value = getPath(context, keyPath.trim());
      if (Array.isArray(value)) {
        output += value.map((item, index) => render(inner, {
          ...context,
          this: item,
          index,
          isFirst: index === 0,
          isLast: index === value.length - 1
        })).join("");
      }
    }

    cursor = close.end;
    startPattern.lastIndex = close.end;
    match = startPattern.exec(template);
  }

  return output + template.slice(cursor);
}

function expandPartials(template, partials, depth = 0) {
  if (depth > 12) {
    throw new Error("Partial nesting is too deep. Check for circular partial references.");
  }

  return template.replace(/{{>\s*([\w.-]+)\s*}}/g, (_, name) => {
    const partial = partials[name] || "";
    return expandPartials(partial, partials, depth + 1);
  });
}

export function createRenderer(partials = {}) {
  const render = (template, context) => {
    let output = expandPartials(template, partials);
    output = renderBlocks(output, context, render);
    output = renderVariables(output, context);
    return output;
  };

  return render;
}
