import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Plugin } from "@static-blog/types";

const plugin: Plugin = {
  name: "plugin-rss",
  hooks: {
    async onBuildEnd(context) {
      if (!context) {
        return;
      }

      const siteUrl = trimTrailingSlash(context.site.baseUrl ?? context.site.url ?? "");
      const items = context.posts
        .map((post) => {
          const url = siteUrl ? `${siteUrl}${post.url}` : post.url;

          return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(url)}</link>
  <guid>${escapeXml(url)}</guid>
  <pubDate>${escapeXml(new Date(post.date).toUTCString())}</pubDate>
  <description>${escapeXml(post.description)}</description>
</item>`;
        })
        .join("\n");
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(context.site.title)}</title>
  <description>${escapeXml(context.site.description ?? "")}</description>
  <link>${escapeXml(siteUrl || "/")}</link>
${items}
</channel>
</rss>
`;

      await writeFile(join(context.outDir, "rss.xml"), rss, "utf8");
    },
  },
};

export default plugin;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
