import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Plugin } from "@static-blog/types";

const plugin: Plugin = {
  name: "plugin-search",
  hooks: {
    async onBuildEnd(context) {
      if (!context) {
        return;
      }

      const searchIndex = {
        posts: context.posts.map((post) => ({
          type: "post",
          title: post.title,
          description: post.description,
          tags: post.tags,
          excerpt: createExcerpt(post),
          url: post.url,
        })),
        pages: context.pages.map((page) => ({
          type: "page",
          title: page.title,
          description: page.description,
          excerpt: createExcerpt(page),
          url: page.url,
        })),
      };

      await writeFile(
        join(context.outDir, "search-index.json"),
        `${JSON.stringify(searchIndex, null, 2)}\n`,
        "utf8",
      );
    },
  },
};

export default plugin;

function createExcerpt(entry: {
  description?: string;
  excerpt?: string;
  tags?: string;
  title: string;
}): string {
  const derivedExcerpt = entry.excerpt?.trim();

  if (derivedExcerpt) {
    return derivedExcerpt;
  }

  const preferredText = entry.description?.trim();

  if (preferredText) {
    return preferredText;
  }

  const fallback = [entry.title, entry.tags ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return fallback;
}
