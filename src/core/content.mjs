import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { markdownToHtml } from "./markdown.mjs";
import { formatDate, readingTime, slugify, stripHtml, toArray } from "./utils.mjs";

async function readMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readMarkdownFiles(entryPath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function createExcerpt(body, html, explicitExcerpt) {
  if (explicitExcerpt) {
    return explicitExcerpt;
  }
  const markerIndex = body.indexOf("<!-- more -->");
  if (markerIndex !== -1) {
    return stripHtml(markdownToHtml(body.slice(0, markerIndex)));
  }
  return stripHtml(html).slice(0, 150);
}

function buildDocument(filePath, source, type, config) {
  const { data, body } = parseFrontmatter(source);
  const fallbackSlug = slugify(basename(filePath, ".md"));
  const slug = slugify(data.slug || fallbackSlug);
  const html = markdownToHtml(body);
  const date = normalizeDate(data.date);
  const title = data.title || slug;
  const path = type === "post"
    ? config.permalink.replace(":slug", slug)
    : `/${slug}/`;

  return {
    ...data,
    type,
    title,
    slug,
    path,
    url: path,
    sourcePath: filePath,
    date,
    updated: normalizeDate(data.updated || data.date),
    displayDate: formatDate(date, config.language),
    body,
    html,
    text: stripHtml(html),
    excerpt: createExcerpt(body, html, data.excerpt || data.description),
    description: data.description || createExcerpt(body, html, data.excerpt),
    tags: toArray(data.tags).map(String),
    categories: toArray(data.categories).map(String),
    status: data.status || "published",
    featured: Boolean(data.featured),
    author: {
      name: data.author || config.author?.name || "",
      bio: config.author?.bio || "",
      website: ""
    },
    readingTime: readingTime(body)
  };
}

export async function loadContent(config) {
  const postFiles = await readMarkdownFiles("content/posts");
  const pageFiles = await readMarkdownFiles("content/pages");

  const posts = [];
  for (const filePath of postFiles) {
    const doc = buildDocument(filePath, await readFile(filePath, "utf8"), "post", config);
    if (doc.status === "published") {
      posts.push(doc);
    }
  }

  const pages = [];
  for (const filePath of pageFiles) {
    const doc = buildDocument(filePath, await readFile(filePath, "utf8"), "page", config);
    if (doc.status === "published") {
      pages.push(doc);
    }
  }

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  pages.sort((a, b) => a.title.localeCompare(b.title, config.language));

  return { posts, pages };
}
