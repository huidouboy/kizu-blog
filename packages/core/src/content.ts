import { readdir, readFile } from "node:fs/promises";
import nodePath from "node:path";

import type { PageFrontmatter, PostFrontmatter } from "@static-blog/types";

export interface LoadContentOptions {
  contentDir?: string;
  includeDrafts?: boolean;
}

export interface MarkdownContent<TFrontmatter> {
  id: string;
  slug: string;
  path: string;
  frontmatter: TFrontmatter;
  rawBody: string;
  html: string;
}

export type PostContent = MarkdownContent<PostFrontmatter>;
export type PageContent = MarkdownContent<PageFrontmatter>;

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  rawBody: string;
}

export interface SiteContent {
  posts: PostContent[];
  pages: PageContent[];
}

export async function loadContent(options: LoadContentOptions = {}): Promise<SiteContent> {
  const [posts, pages] = await Promise.all([loadPosts(options), loadPages(options)]);

  return { posts, pages };
}

export async function loadPosts(options: LoadContentOptions = {}): Promise<PostContent[]> {
  const contentDir = resolveContentDir(options.contentDir);
  const files = await listMarkdownFiles(nodePath.join(contentDir, "posts"));
  const posts = await Promise.all(files.map((filePath) => loadPost(filePath, contentDir)));
  const visiblePosts = options.includeDrafts
    ? posts
    : posts.filter((post) => post.frontmatter.draft !== true);

  return visiblePosts.sort(
    (left, right) => Date.parse(right.frontmatter.date) - Date.parse(left.frontmatter.date),
  );
}

export async function loadPages(options: LoadContentOptions = {}): Promise<PageContent[]> {
  const contentDir = resolveContentDir(options.contentDir);
  const files = await listMarkdownFiles(nodePath.join(contentDir, "pages"));
  const pages = await Promise.all(files.map((filePath) => loadPage(filePath, contentDir)));

  return options.includeDrafts ? pages : pages.filter((page) => page.frontmatter.draft !== true);
}

export async function loadMarkdownFile(filePath: string): Promise<ParsedMarkdown> {
  const source = await readFile(filePath, "utf8");

  try {
    return parseMarkdown(source);
  } catch (error) {
    throw new Error(`${filePath}: ${formatErrorMessage(error)}`);
  }
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return {
      frontmatter: {},
      rawBody: source,
    };
  }

  const closingLine = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingLine === -1) {
    throw new Error("Markdown frontmatter is missing a closing delimiter.");
  }

  return {
    frontmatter: parseFrontmatter(lines.slice(1, closingLine).join("\n")),
    rawBody: lines.slice(closingLine + 1).join("\n"),
  };
}

export function parseFrontmatter(source: string): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);

    if (!match) {
      throw new Error(`Unsupported frontmatter line: "${line}"`);
    }

    const [, key, rawValue = ""] = match;

    if (rawValue.trim()) {
      frontmatter[key] = parseFrontmatterValue(rawValue);
      continue;
    }

    const listItems: string[] = [];
    let nextIndex = index + 1;

    while (nextIndex < lines.length) {
      const listMatch = /^\s*-\s*(.*)$/.exec(lines[nextIndex]);

      if (!listMatch) {
        break;
      }

      listItems.push(String(parseFrontmatterValue(listMatch[1])));
      nextIndex += 1;
    }

    if (listItems.length > 0) {
      frontmatter[key] = listItems;
      index = nextIndex - 1;
    } else {
      frontmatter[key] = "";
    }
  }

  return frontmatter;
}

export function createSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function loadPost(filePath: string, contentDir: string): Promise<PostContent> {
  const parsed = await loadMarkdownFile(filePath);
  const slug = resolveSlug(parsed.frontmatter.slug, filePath);
  const frontmatter = normalizePostFrontmatter(parsed.frontmatter, filePath, slug);

  return {
    id: createContentId(contentDir, filePath),
    slug,
    path: nodePath.resolve(filePath),
    frontmatter,
    rawBody: parsed.rawBody,
    html: "",
  };
}

async function loadPage(filePath: string, contentDir: string): Promise<PageContent> {
  const parsed = await loadMarkdownFile(filePath);
  const slug = resolveSlug(parsed.frontmatter.slug, filePath);
  const frontmatter = normalizePageFrontmatter(parsed.frontmatter, filePath, slug);

  return {
    id: createContentId(contentDir, filePath),
    slug,
    path: nodePath.resolve(filePath),
    frontmatter,
    rawBody: parsed.rawBody,
    html: "",
  };
}

function normalizePostFrontmatter(
  frontmatter: Record<string, unknown>,
  filePath: string,
  slug: string,
): PostFrontmatter {
  const date = requireString(frontmatter.date, "date", filePath);

  if (Number.isNaN(Date.parse(date))) {
    throw new Error(`${filePath}: expected frontmatter "date" to be a valid date string.`);
  }

  return {
    title: requireString(frontmatter.title, "title", filePath),
    date,
    tags: optionalStringArray(frontmatter.tags, "tags", filePath),
    draft: optionalBoolean(frontmatter.draft, "draft", filePath, false) ?? false,
    description: optionalString(frontmatter.description, "description", filePath),
    slug,
  };
}

function normalizePageFrontmatter(
  frontmatter: Record<string, unknown>,
  filePath: string,
  slug: string,
): PageFrontmatter {
  return {
    title: requireString(frontmatter.title, "title", filePath),
    description: optionalString(frontmatter.description, "description", filePath),
    draft: optionalBoolean(frontmatter.draft, "draft", filePath),
    slug,
  };
}

function resolveSlug(value: unknown, filePath: string): string {
  const explicitSlug = optionalString(value, "slug", filePath);

  if (explicitSlug) {
    return explicitSlug.replace(/^\/+|\/+$/g, "");
  }

  const slug = createSlug(nodePath.parse(filePath).name);

  if (!slug) {
    throw new Error(`${filePath}: could not generate a slug from the filename.`);
  }

  return slug;
}

function resolveContentDir(contentDir = "content"): string {
  return nodePath.resolve(contentDir);
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => nodePath.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function createContentId(contentDir: string, filePath: string): string {
  const relativePath = nodePath.relative(contentDir, filePath);
  const parsedPath = nodePath.parse(relativePath);
  const id = nodePath.join(parsedPath.dir, parsedPath.name);

  return id.split(nodePath.sep).join("/");
}

function parseFrontmatterValue(rawValue: string): unknown {
  const value = rawValue.trim();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const innerValue = value.slice(1, -1).trim();

    if (!innerValue) {
      return [];
    }

    return innerValue.split(",").map((item) => stripQuotes(item.trim()));
  }

  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function requireString(value: unknown, key: string, filePath: string): string {
  const stringValue = optionalString(value, key, filePath);

  if (!stringValue) {
    throw new Error(`${filePath}: expected frontmatter "${key}" to be a non-empty string.`);
  }

  return stringValue;
}

function optionalString(value: unknown, key: string, filePath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${filePath}: expected frontmatter "${key}" to be a string.`);
  }

  const trimmedValue = value.trim();

  return trimmedValue || undefined;
}

function optionalBoolean(
  value: unknown,
  key: string,
  filePath: string,
  defaultValue?: boolean,
): boolean | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${filePath}: expected frontmatter "${key}" to be a boolean.`);
  }

  return value;
}

function optionalStringArray(value: unknown, key: string, filePath: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${filePath}: expected frontmatter "${key}" to be a string array.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
