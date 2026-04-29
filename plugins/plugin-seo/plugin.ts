import type { Plugin } from "@static-blog/types";

const plugin: Plugin = {
  name: "plugin-seo",
  hooks: {
    injectHead(context) {
      const title = escapeHtml(context?.render?.content.title ?? context?.site.title ?? "");
      const description = escapeHtml(
        context?.render?.content.description ?? context?.site.description ?? "",
      );
      const path = escapeHtml(context?.path ?? "/");

      return [
        '<meta name="generator" content="Static-first Blog Engine">',
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:type" content="article">`,
        `<meta name="static-blog:path" content="${path}">`,
      ].join("\n");
    },
  },
};

export default plugin;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
