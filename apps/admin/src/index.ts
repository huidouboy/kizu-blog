import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { buildSite } from "@static-blog/cli/build";
import {
  getUiDictionary,
  loadPages,
  loadPosts,
  loadThemeManifest,
  parseMarkdown,
  resolveUiLocale,
  type UiLocale,
} from "@static-blog/core";
import type { PageContent, PostContent } from "@static-blog/core";

const pbkdf2 = promisify(pbkdf2Callback);

const rootDir = nodePath.resolve(process.env.BLOG_ROOT ?? process.cwd());
const port = Number(process.env.ADMIN_PORT ?? process.env.PORT ?? 4173);
const adminDataDir = nodePath.join(rootDir, "data", "admin");
const accountPath = nodePath.join(adminDataDir, "account.json");
const sessions = new Map<string, Session>();
const reservedSlugs = new Set(["admin", "assets", "tags", "posts", "pages", "archive"]);

type ConfigFileName = "site.json" | "theme.json" | "plugins.json";

class AdminInputError extends Error {}

interface Session {
  username: string;
  expiresAt: number;
}

interface AccountFile {
  username: string;
  salt: string;
  hash: string;
  iterations: number;
  digest: string;
}

interface ContentPayload {
  title?: string;
  date?: string;
  tags?: string[] | string;
  draft?: boolean;
  description?: string;
  slug?: string;
  body?: string;
}

export interface StartAdminServerOptions {
  port?: number;
}

export function startAdminServer(options: StartAdminServerOptions = {}): Server {
  const listenPort = options.port ?? port;
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error: unknown) => {
      sendJson(response, error instanceof AdminInputError ? 400 : 500, {
        error: translateAdminError(error, resolveAdminLocale(request)),
      });
    });
  });

  server.listen(listenPort, () => {
    console.log(`Admin panel running at http://localhost:${listenPort}`);
    console.log(`Managing blog root: ${rootDir}`);
  });

  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, method, url);
    return;
  }

  if (method !== "GET") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  sendHtml(response, 200, renderAdminShell(resolveAdminLocale(request)));
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
): Promise<void> {
  const locale = resolveAdminLocale(request);
  const ui = getUiDictionary(locale);

  if (method === "GET" && url.pathname === "/api/status") {
    const hasAccount = await fileExists(accountPath);
    const session = getSession(request);

    sendJson(response, 200, {
      hasAccount,
      authenticated: Boolean(session),
      username: session?.username ?? null,
      locale,
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/setup") {
    if (await fileExists(accountPath)) {
      sendJson(response, 409, { error: ui.adminAccountAlreadyExists });
      return;
    }

    const body = await readJsonBody(request);
    const username = requireString(body.username, "username");
    const password = requireString(body.password, "password");

    if (password.length < 8) {
      sendJson(response, 400, { error: ui.passwordMin });
      return;
    }

    await writeAccount(username, password);
    await ensureInitialSampleContent(locale);
    const token = createSession(username);

    setSessionCookie(response, token);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await readJsonBody(request);
    const username = requireString(body.username, "username");
    const password = requireString(body.password, "password");
    const valid = await verifyAccount(username, password);

    if (!valid) {
      sendJson(response, 401, { error: ui.invalidAuth });
      return;
    }

    const token = createSession(username);

    setSessionCookie(response, token);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    const token = getCookie(request, "admin_session");

    if (token) {
      sessions.delete(token);
    }

    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  const hasAccount = await fileExists(accountPath);

  if (!hasAccount) {
    sendJson(response, 409, { error: ui.adminAccountNotInitialized });
    return;
  }

  if (!getSession(request)) {
    sendJson(response, 401, { error: ui.authenticationRequired });
    return;
  }

  await handleAuthenticatedApiRequest(request, response, method, url, locale);
}

async function handleAuthenticatedApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  url: URL,
  locale: UiLocale,
): Promise<void> {
  const ui = getUiDictionary(locale);

  if (method === "GET" && url.pathname === "/api/posts") {
    const posts = await loadPosts({ contentDir: contentDir(), includeDrafts: true });

    sendJson(response, 200, {
      posts: posts.map(toPostSummary),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/posts") {
    const payload = await readJsonBody(request);
    const result = await writePost(undefined, payload);

    sendJson(response, 200, result);
    return;
  }

  const postMatch = /^\/api\/posts\/([^/]+)$/.exec(url.pathname);

  if (postMatch) {
    const slug = validateAdminSlug(decodeURIComponent(postMatch[1]));

    if (method === "GET") {
      sendJson(response, 200, await readPost(slug));
      return;
    }

    if (method === "PUT") {
      sendJson(response, 200, await writePost(slug, await readJsonBody(request)));
      return;
    }

    if (method === "DELETE") {
      await deleteContentFile("posts", slug);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (method === "GET" && url.pathname === "/api/pages") {
    const pages = await loadPages({ contentDir: contentDir(), includeDrafts: true });

    sendJson(response, 200, {
      pages: pages.map(toPageSummary),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/pages") {
    sendJson(response, 200, await writePage(undefined, await readJsonBody(request)));
    return;
  }

  const pageMatch = /^\/api\/pages\/([^/]+)$/.exec(url.pathname);

  if (pageMatch) {
    const slug = validateAdminSlug(decodeURIComponent(pageMatch[1]));

    if (method === "GET") {
      sendJson(response, 200, await readPage(slug));
      return;
    }

    if (method === "PUT") {
      sendJson(response, 200, await writePage(slug, await readJsonBody(request)));
      return;
    }

    if (method === "DELETE") {
      await deleteContentFile("pages", slug);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (method === "POST" && url.pathname === "/api/preview") {
    const body = await readJsonBody(request);

    sendJson(response, 200, {
      html: renderMarkdownToHtml(requireString(body.body ?? "", "body")),
    });
    return;
  }

  if (url.pathname === "/api/config/site") {
    if (method === "GET") {
      sendJson(response, 200, await readJsonFile(configPath("site.json"), {}));
      return;
    }

    if (method === "PUT") {
      const value = await readJsonBody(request);

      await writeJsonFile(configPath("site.json"), value);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (url.pathname === "/api/config/theme") {
    if (method === "GET") {
      sendJson(response, 200, await readJsonFile(configPath("theme.json"), { theme: "default" }));
      return;
    }

    if (method === "PUT") {
      const value = await readJsonBody(request);

      await writeJsonFile(configPath("theme.json"), value);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (url.pathname === "/api/config/plugins") {
    if (method === "GET") {
      sendJson(response, 200, await readJsonFile(configPath("plugins.json"), { enabled: [] }));
      return;
    }

    if (method === "PUT") {
      const value = await readJsonBody(request);

      await writeJsonFile(configPath("plugins.json"), value);
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (method === "GET" && url.pathname === "/api/themes") {
    sendJson(response, 200, await readThemes());
    return;
  }

  if (method === "GET" && url.pathname === "/api/plugins") {
    sendJson(response, 200, await readPlugins());
    return;
  }

  if (method === "POST" && url.pathname === "/api/build") {
    const result = await buildSite({ rootDir });

    sendJson(response, 200, {
      ok: true,
      result,
    });
    return;
  }

  sendJson(response, 404, { error: ui.notFound });
}

async function writeAccount(username: string, password: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const iterations = 310000;
  const digest = "sha256";
  const hash = await hashPassword(password, salt, iterations, digest);

  await mkdir(nodePath.dirname(accountPath), { recursive: true });
  await writeJsonFile(accountPath, {
    username,
    salt,
    hash,
    iterations,
    digest,
  });
}

async function ensureInitialSampleContent(locale: UiLocale): Promise<void> {
  await ensureInitialSampleContentForRoot(rootDir, locale);
}

export async function ensureInitialSampleContentForRoot(
  projectRootDir: string,
  locale: UiLocale,
): Promise<void> {
  const safeRootDir = nodePath.resolve(projectRootDir);
  const baseContentDir = nodePath.join(safeRootDir, "content");
  const postsDir = nodePath.join(baseContentDir, "posts");
  const pagesDir = nodePath.join(baseContentDir, "pages");

  assertInsideRoot(safeRootDir, postsDir);
  assertInsideRoot(safeRootDir, pagesDir);

  const postFiles = await listMarkdownFileNames(postsDir);
  const pageFiles = await listMarkdownFileNames(pagesDir);
  const existingFiles = [...postFiles, ...pageFiles];
  const existingPostsAreGenerated = await allFilesAreGeneratedSamples(postsDir, postFiles);
  const existingPagesAreGenerated = await allFilesAreGeneratedSamples(pagesDir, pageFiles);

  if (existingFiles.length > 0 && !(existingPostsAreGenerated && existingPagesAreGenerated)) {
    return;
  }

  await mkdir(postsDir, { recursive: true });
  await mkdir(pagesDir, { recursive: true });

  const samples = locale === "zh-CN" ? createChineseSamples() : createEnglishSamples();

  await writeGeneratedSample(nodePath.join(postsDir, "hello-world.md"), samples.post);
  await writeGeneratedSample(nodePath.join(pagesDir, "about.md"), samples.page);
}

async function listMarkdownFileNames(directory: string): Promise<string[]> {
  const entries = await safeReadDir(directory);

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name);
}

async function allFilesAreGeneratedSamples(directory: string, fileNames: string[]): Promise<boolean> {
  if (fileNames.length === 0) {
    return true;
  }

  const knownSampleNames = new Set(["hello-world.md", "about.md"]);

  for (const fileName of fileNames) {
    if (!knownSampleNames.has(fileName)) {
      return false;
    }

    const source = await readFile(nodePath.join(directory, fileName), "utf8");

    if (!source.includes("generated: static-blog-sample")) {
      return false;
    }
  }

  return true;
}

async function writeGeneratedSample(filePath: string, source: string): Promise<void> {
  if (await fileExists(filePath)) {
    const existingSource = await readFile(filePath, "utf8");

    if (!existingSource.includes("generated: static-blog-sample")) {
      return;
    }
  }

  await writeFile(filePath, source, "utf8");
}

function createEnglishSamples(): { post: string; page: string } {
  return {
    post: `---\ntitle: Hello World\ndate: 2026-04-28\ntags:\n  - markdown\n  - release\ndraft: false\ndescription: A first sample post for your static-first blog.\nslug: hello-world\ngenerated: static-blog-sample\n---\n# Hello World\n\nThis sample post shows the default post page, archive listing, tag page, and reading time.\n\nEdit or delete it from the admin panel when you are ready to publish your own writing.\n`,
    page: `---\ntitle: About\ndescription: A sample about page.\nslug: about\ngenerated: static-blog-sample\n---\n# About\n\nThis is a sample page for your new static-first blog.\n\nReplace it with your own introduction when you are ready.\n`,
  };
}

function createChineseSamples(): { post: string; page: string } {
  return {
    post: `---\ntitle: 你好，世界\ndate: 2026-04-28\ntags:\n  - markdown\n  - 发布\ndraft: false\ndescription: 这是静态优先博客的第一篇示例文章。\nslug: hello-world\ngenerated: static-blog-sample\n---\n# 你好，世界\n\n这篇示例文章会展示默认文章页、归档、标签页和阅读时间。\n\n准备好发布自己的内容后，你可以在后台编辑或删除它。\n`,
    page: `---\ntitle: 关于\ndescription: 一个示例关于页面。\nslug: about\ngenerated: static-blog-sample\n---\n# 关于\n\n这是你的静态优先博客的示例页面。\n\n你可以把这里替换成自己的介绍。\n`,
  };
}

async function verifyAccount(username: string, password: string): Promise<boolean> {
  if (!(await fileExists(accountPath))) {
    return false;
  }

  const account = (await readJsonFile(accountPath, null)) as AccountFile | null;

  if (!account || account.username !== username) {
    return false;
  }

  const hash = await hashPassword(password, account.salt, account.iterations, account.digest);
  const expected = Buffer.from(account.hash, "hex");
  const actual = Buffer.from(hash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function hashPassword(
  password: string,
  salt: string,
  iterations: number,
  digest: string,
): Promise<string> {
  const hash = await pbkdf2(password, salt, iterations, 32, digest);

  return hash.toString("hex");
}

function createSession(username: string): string {
  const token = randomBytes(32).toString("hex");

  sessions.set(token, {
    username,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8,
  });

  return token;
}

function getSession(request: IncomingMessage): Session | undefined {
  const token = getCookie(request, "admin_session");

  if (!token) {
    return undefined;
  }

  const session = sessions.get(token);

  if (!session) {
    return undefined;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }

  return session;
}

function setSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader(
    "Set-Cookie",
    `admin_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
  );
}

function clearSessionCookie(response: ServerResponse): void {
  response.setHeader("Set-Cookie", "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function resolveAdminLocale(request: IncomingMessage): UiLocale {
  const acceptLanguage = Array.isArray(request.headers["accept-language"])
    ? request.headers["accept-language"].join(",")
    : request.headers["accept-language"] ?? "";

  return resolveUiLocale("auto", acceptLanguage);
}

function translateAdminError(error: unknown, locale: UiLocale): string {
  const ui = getUiDictionary(locale);
  const message = error instanceof Error ? error.message : String(error);

  if (message === "Unexpected server error") {
    return ui.unexpectedServerError;
  }

  if (message.includes("Password must be at least")) {
    return ui.passwordMin;
  }

  if (message.includes("Invalid username or password")) {
    return ui.invalidAuth;
  }

  if (
    message.includes("Slug cannot be empty") ||
    message.includes("Invalid slug") ||
    message.includes("Reserved slug")
  ) {
    return ui.invalidSlug;
  }

  if (message.includes("Authentication required")) {
    return ui.authenticationRequired;
  }

  if (message.includes("Admin account already exists")) {
    return ui.adminAccountAlreadyExists;
  }

  if (message.includes("Admin account has not been initialized")) {
    return ui.adminAccountNotInitialized;
  }

  if (message.includes("not found") || message.includes("Not found")) {
    return ui.notFound;
  }

  return message;
}

function getCookie(request: IncomingMessage, key: string): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (rawName === key) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}

async function readPost(slug: string): Promise<Record<string, unknown>> {
  const post = await findPost(slug);

  return {
    ...toPostSummary(post),
    body: post.rawBody,
  };
}

async function writePost(existingSlug: string | undefined, payload: unknown): Promise<Record<string, unknown>> {
  const data = normalizeContentPayload(payload);
  const slug = createContentSlug(data.slug, data.title);
  const filePath = contentFilePath("posts", slug);
  const oldPost = existingSlug ? await findPost(existingSlug) : undefined;
  const oldPostPath = oldPost ? assertContentSourcePath("posts", oldPost.path) : undefined;
  const frontmatter = {
    title: data.title,
    date: data.date || new Date().toISOString().slice(0, 10),
    tags: normalizeTags(data.tags),
    draft: data.draft ?? false,
    description: data.description || undefined,
    slug,
  };

  if (!oldPost && (await fileExists(filePath))) {
    throw new AdminInputError(`Post "${slug}" already exists.`);
  }

  if (oldPostPath && oldPostPath !== filePath && (await fileExists(filePath))) {
    throw new AdminInputError(`Post "${slug}" already exists.`);
  }

  await mkdir(nodePath.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeMarkdown(frontmatter, data.body ?? ""), "utf8");

  if (oldPostPath && oldPostPath !== filePath) {
    await rm(oldPostPath, { force: true });
  }

  return { ok: true, slug };
}

async function findPost(slug: string): Promise<PostContent> {
  const safeSlug = validateAdminSlug(slug);
  const posts = await loadPosts({ contentDir: contentDir(), includeDrafts: true });
  const post = posts.find((item) => item.slug === safeSlug);

  if (!post) {
    throw new AdminInputError(`Post "${safeSlug}" not found.`);
  }

  return post;
}

function toPostSummary(post: PostContent): Record<string, unknown> {
  return {
    slug: post.slug,
    title: post.frontmatter.title,
    date: post.frontmatter.date,
    tags: post.frontmatter.tags,
    draft: post.frontmatter.draft,
    description: post.frontmatter.description ?? "",
    path: post.path,
  };
}

async function readPage(slug: string): Promise<Record<string, unknown>> {
  const page = await findPage(slug);

  return {
    ...toPageSummary(page),
    body: page.rawBody,
  };
}

async function writePage(existingSlug: string | undefined, payload: unknown): Promise<Record<string, unknown>> {
  const data = normalizeContentPayload(payload);
  const slug = createContentSlug(data.slug, data.title);
  const filePath = contentFilePath("pages", slug);
  const oldPage = existingSlug ? await findPage(existingSlug) : undefined;
  const oldPagePath = oldPage ? assertContentSourcePath("pages", oldPage.path) : undefined;
  const frontmatter = {
    title: data.title,
    draft: data.draft || undefined,
    description: data.description || undefined,
    slug,
  };

  if (!oldPage && (await fileExists(filePath))) {
    throw new AdminInputError(`Page "${slug}" already exists.`);
  }

  if (oldPagePath && oldPagePath !== filePath && (await fileExists(filePath))) {
    throw new AdminInputError(`Page "${slug}" already exists.`);
  }

  await mkdir(nodePath.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeMarkdown(frontmatter, data.body ?? ""), "utf8");

  if (oldPagePath && oldPagePath !== filePath) {
    await rm(oldPagePath, { force: true });
  }

  return { ok: true, slug };
}

async function findPage(slug: string): Promise<PageContent> {
  const safeSlug = validateAdminSlug(slug);
  const pages = await loadPages({ contentDir: contentDir(), includeDrafts: true });
  const page = pages.find((item) => item.slug === safeSlug);

  if (!page) {
    throw new AdminInputError(`Page "${safeSlug}" not found.`);
  }

  return page;
}

function toPageSummary(page: PageContent): Record<string, unknown> {
  return {
    slug: page.slug,
    title: page.frontmatter.title,
    draft: page.frontmatter.draft ?? false,
    description: page.frontmatter.description ?? "",
    path: page.path,
  };
}

async function deleteContentFile(kind: "posts" | "pages", slug: string): Promise<void> {
  const safeSlug = validateAdminSlug(slug);
  const item = kind === "posts" ? await findPost(safeSlug) : await findPage(safeSlug);
  const sourcePath = assertContentSourcePath(kind, item.path);
  const trashDir = nodePath.resolve(adminDataDir, "trash", kind);
  const trashFileName = `${safeSlug}-${Date.now()}.md`;
  const trashPath = nodePath.resolve(trashDir, trashFileName);

  assertInsideRoot(adminDataDir, trashDir);
  assertExactChildFile(trashDir, trashPath, trashFileName);

  await mkdir(trashDir, { recursive: true });
  await rename(sourcePath, trashPath);
}

function normalizeContentPayload(value: unknown): Required<Pick<ContentPayload, "title" | "body">> & ContentPayload {
  if (!isRecord(value)) {
    throw new AdminInputError("Expected content payload to be an object.");
  }

  return {
    title: requireString(value.title, "title"),
    date: typeof value.date === "string" ? value.date : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter(isString)
      : typeof value.tags === "string"
        ? value.tags
        : undefined,
    draft: typeof value.draft === "boolean" ? value.draft : false,
    description: typeof value.description === "string" ? value.description : "",
    slug: typeof value.slug === "string" ? value.slug : "",
    body: typeof value.body === "string" ? value.body : "",
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function createContentSlug(slug: string | undefined, title: string): string {
  const candidate = slug?.trim() ? slug : createSlugFromTitle(title);

  return validateAdminSlug(candidate);
}

function createSlugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function validateAdminSlug(value: string | undefined): string {
  const slug = value?.trim() ?? "";

  if (!slug) {
    throw new AdminInputError("Slug cannot be empty.");
  }

  if (nodePath.isAbsolute(slug) || slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new AdminInputError(`Invalid slug "${slug}". Slugs cannot contain path segments.`);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new AdminInputError(
      `Invalid slug "${slug}". Use lowercase letters, numbers, and single hyphens only.`,
    );
  }

  if (reservedSlugs.has(slug)) {
    throw new AdminInputError(`Reserved slug "${slug}" cannot be used.`);
  }

  return slug;
}

function normalizeTags(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
}

function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${key}:`);

      for (const item of value) {
        lines.push(`  - ${escapeYamlScalar(String(item))}`);
      }

      continue;
    }

    lines.push(`${key}: ${escapeYamlScalar(String(value))}`);
  }

  lines.push("---", "", body.trim(), "");

  return lines.join("\n");
}

function escapeYamlScalar(value: string): string {
  if (!value || /[:#[\]{}\n]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }

  return value;
}

async function readThemes(): Promise<Record<string, unknown>> {
  const activeConfig = await readJsonFile(configPath("theme.json"), { theme: "default", settings: {} });
  const activeTheme = isRecord(activeConfig) && typeof activeConfig.theme === "string"
    ? activeConfig.theme
    : "default";
  const themesDir = nodePath.join(rootDir, "themes");
  const entries = await safeReadDir(themesDir);
  const themes = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const manifest = await loadThemeManifest(nodePath.join(themesDir, entry.name, "theme.json"));

      themes.push(manifest);
    } catch {
      continue;
    }
  }

  const activeManifest = themes.find((theme) => theme.name === activeTheme) ?? null;

  return {
    active: activeConfig,
    activeManifest,
    themes,
  };
}

async function readPlugins(): Promise<Record<string, unknown>> {
  const activeConfig = await readJsonFile(configPath("plugins.json"), { enabled: [] });
  const enabled = isRecord(activeConfig) && Array.isArray(activeConfig.enabled)
    ? activeConfig.enabled.filter((item) => typeof item === "string")
    : [];
  const pluginsDir = nodePath.join(rootDir, "plugins");
  const entries = await safeReadDir(pluginsDir);
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = nodePath.join(pluginsDir, entry.name, "plugin.json");
    const manifest = await readJsonFile(manifestPath, {
      name: entry.name,
      version: "",
    });

    plugins.push({
      name: isRecord(manifest) && typeof manifest.name === "string" ? manifest.name : entry.name,
      version: isRecord(manifest) && typeof manifest.version === "string" ? manifest.version : "",
      enabled: enabled.includes(entry.name),
    });
  }

  return {
    active: activeConfig,
    plugins,
  };
}

async function safeReadDir(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function renderMarkdownToHtml(markdown: string): string {
  const parsed = parseMarkdown(markdown);
  const lines = parsed.rawBody.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const paragraph: string[] = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
      paragraph.length = 0;
    }
  };

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);

    if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(trimmed);

    if (listItem) {
      flushParagraph();

      if (!inList) {
        html.push("<ul>");
        inList = true;
      }

      html.push(`<li>${escapeHtml(listItem[1])}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

function contentDir(): string {
  return nodePath.join(rootDir, "content");
}

function contentFilePath(kind: "posts" | "pages", slug: string): string {
  const safeSlug = validateAdminSlug(slug);
  const directory = contentKindDir(kind);
  const fileName = `${safeSlug}.md`;
  const filePath = nodePath.resolve(directory, fileName);

  assertExactChildFile(directory, filePath, fileName);

  return filePath;
}

function contentKindDir(kind: "posts" | "pages"): string {
  return nodePath.resolve(contentDir(), kind);
}

function configPath(fileName: ConfigFileName): string {
  const directory = nodePath.resolve(rootDir, "config");
  const filePath = nodePath.resolve(directory, fileName);

  assertExactChildFile(directory, filePath, fileName);

  return filePath;
}

function assertContentSourcePath(kind: "posts" | "pages", filePath: string): string {
  const directory = contentKindDir(kind);
  const resolvedPath = nodePath.resolve(filePath);
  const fileName = nodePath.basename(resolvedPath);

  assertInsideRoot(directory, resolvedPath);

  if (nodePath.dirname(resolvedPath) !== directory || nodePath.extname(resolvedPath) !== ".md") {
    throw new AdminInputError(`Content path is outside content/${kind}/*.md: ${filePath}`);
  }

  validateAdminSlug(nodePath.basename(fileName, ".md"));

  return resolvedPath;
}

function assertInsideRoot(baseDir: string, targetPath: string): void {
  const resolvedBase = nodePath.resolve(baseDir);
  const resolvedTarget = nodePath.resolve(targetPath);
  const relativePath = nodePath.relative(resolvedBase, resolvedTarget);

  if (relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    throw new AdminInputError(`Refusing to access path outside ${resolvedBase}: ${resolvedTarget}`);
  }
}

function assertExactChildFile(directory: string, filePath: string, fileName: string): void {
  const resolvedDirectory = nodePath.resolve(directory);
  const resolvedFilePath = nodePath.resolve(filePath);

  assertInsideRoot(resolvedDirectory, resolvedFilePath);

  if (nodePath.dirname(resolvedFilePath) !== resolvedDirectory || nodePath.basename(resolvedFilePath) !== fileName) {
    throw new AdminInputError(`Refusing to access unsafe file path: ${resolvedFilePath}`);
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      size += buffer.length;

      if (size > 1024 * 1024) {
        throw new AdminInputError("Request body is too large.");
      }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;

  if (!isRecord(value)) {
    throw new AdminInputError("Expected request body to be a JSON object.");
  }

  return value;
}

async function readJsonFile(filePath: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(nodePath.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminInputError(`Expected "${key}" to be a non-empty string.`);
  }

  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAdminShell(locale: UiLocale): string {
  const ui = getUiDictionary(locale);
  const uiJson = JSON.stringify(ui).replaceAll("</", "<\\/");

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(ui.adminTitle)}</title>
  <style>
    :root { font-family: Arial, sans-serif; color: #17202a; background: #f5f7f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    button, input, textarea, select { font: inherit; }
    button { border: 0; border-radius: 6px; padding: 8px 12px; color: white; background: #2563eb; cursor: pointer; }
    button.secondary { color: #17202a; background: #e5e7eb; }
    button.danger { background: #dc2626; }
    input, textarea, select { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; background: white; }
    textarea { min-height: 240px; resize: vertical; font-family: Consolas, monospace; }
    label { display: grid; gap: 5px; color: #475569; font-size: 0.9rem; }
    .shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
    aside { padding: 20px; color: white; background: #111827; }
    aside h1 { margin: 0 0 20px; font-size: 1.1rem; }
    nav { display: grid; gap: 8px; }
    nav button { text-align: left; color: #dbeafe; background: transparent; }
    nav button.active, nav button:hover { background: #1f2937; }
    main { padding: 24px; }
    .card { margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; background: white; box-shadow: 0 1px 2px rgb(15 23 42 / 6%); }
    .grid { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 18px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .list { display: grid; gap: 8px; }
    .list button { display: block; width: 100%; color: #17202a; text-align: left; background: #f1f5f9; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .muted { color: #64748b; }
    .error { color: #b91c1c; }
    .success { color: #047857; }
    .preview { border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; background: #fbfdff; }
    .hidden { display: none; }
    @media (max-width: 820px) {
      .shell, .grid, .form-grid { grid-template-columns: 1fr; }
      aside { position: static; }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
const state = {
  status: null,
  posts: [],
  pages: [],
  activeSection: "posts",
  selectedPost: null,
  selectedPage: null,
  themes: null,
  plugins: null
};
const ui = ${uiJson};

const app = document.getElementById("app");

function t(key) {
  return ui[key] || key;
}

init();

async function init() {
  state.status = await api("/api/status");
  if (!state.status.hasAccount) {
    renderSetup();
    return;
  }
  if (!state.status.authenticated) {
    renderLogin();
    return;
  }
  await loadAdminData();
  renderAdmin();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || t("requestFailed"));
  return data;
}

function renderSetup() {
  app.innerHTML = authCard(t("initializeAdmin"), t("createAccount"), "setup");
  document.getElementById("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuth("/api/setup");
  });
}

function renderLogin() {
  app.innerHTML = authCard(t("adminLogin"), t("login"), "login");
  document.getElementById("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuth("/api/login");
  });
}

function authCard(title, buttonLabel, mode) {
  return '<main><section class="card" style="max-width:420px;margin:10vh auto;">' +
    '<h1>' + title + '</h1>' +
    '<form id="auth-form" class="list">' +
    '<label>' + t("username") + '<input name="username" autocomplete="username" value="admin"></label>' +
    '<label>' + t("password") + '<input name="password" type="password" autocomplete="' + (mode === "setup" ? "new-password" : "current-password") + '"></label>' +
    '<button>' + buttonLabel + '</button><p id="message" class="error"></p></form></section></main>';
}

async function submitAuth(path) {
  const form = new FormData(document.getElementById("auth-form"));
  try {
    await api(path, {
      method: "POST",
      body: { username: form.get("username"), password: form.get("password") }
    });
    await init();
  } catch (error) {
    document.getElementById("message").textContent = error.message;
  }
}

async function loadAdminData() {
  const [posts, pages, site, theme, themes, plugins] = await Promise.all([
    api("/api/posts"),
    api("/api/pages"),
    api("/api/config/site"),
    api("/api/config/theme"),
    api("/api/themes"),
    api("/api/plugins")
  ]);
  state.posts = posts.posts;
  state.pages = pages.pages;
  state.site = site;
  state.theme = theme;
  state.themes = themes;
  state.plugins = plugins;
}

function renderAdmin() {
  app.innerHTML = '<div class="shell"><aside><h1>' + t("adminTitle") + '</h1><nav>' +
    navButton("posts", t("posts")) + navButton("pages", t("pages")) + navButton("site", t("siteConfig")) +
    navButton("theme", t("theme")) + navButton("plugins", t("plugins")) + navButton("build", t("build")) +
    '</nav><hr><button class="secondary" id="logout">' + t("logout") + '</button></aside><main id="main"></main></div>';
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSection = button.dataset.section;
      renderAdmin();
    });
  });
  document.getElementById("logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: {} });
    await init();
  });
  renderSection();
}

function navButton(section, label) {
  return '<button data-section="' + section + '" class="' + (state.activeSection === section ? "active" : "") + '">' + label + '</button>';
}

function renderSection() {
  if (state.activeSection === "posts") renderPosts();
  if (state.activeSection === "pages") renderPages();
  if (state.activeSection === "site") renderJsonConfig(t("siteConfig"), "/api/config/site", state.site);
  if (state.activeSection === "theme") renderTheme();
  if (state.activeSection === "plugins") renderPlugins();
  if (state.activeSection === "build") renderBuild();
}

function renderPosts() {
  const main = document.getElementById("main");
  main.innerHTML = '<div class="grid"><section class="card"><div class="row"><h2>' + t("posts") + '</h2><button id="new-post">' + t("new") + '</button></div><div class="list">' +
    (state.posts.length ? state.posts.map((post) => '<button data-post="' + esc(post.slug) + '">' + esc(post.title) + '<br><span class="muted">' + esc(post.date) + (post.draft ? " - " + t("draft") : "") + '</span></button>').join("") : '<p class="muted">' + t("noPostsYet") + '</p>') +
    '</div></section><section class="card" id="editor"></section></div>';
  document.getElementById("new-post").addEventListener("click", () => renderPostEditor(null));
  document.querySelectorAll("[data-post]").forEach((button) => {
    button.addEventListener("click", async () => renderPostEditor(await api("/api/posts/" + encodeURIComponent(button.dataset.post))));
  });
  renderPostEditor(state.selectedPost);
}

function renderPostEditor(post) {
  state.selectedPost = post;
  const editor = document.getElementById("editor");
  const value = post || { title: "", slug: "", date: new Date().toISOString().slice(0, 10), tags: [], draft: false, description: "", body: "" };
  editor.innerHTML = '<h2>' + (post ? t("editPost") : t("createPost")) + '</h2><form id="content-form" class="list">' +
    '<div class="form-grid"><label>' + t("title") + '<input name="title" value="' + esc(value.title || "") + '"></label>' +
    '<label>' + t("slug") + '<input name="slug" value="' + esc(value.slug || "") + '"></label>' +
    '<label>' + t("date") + '<input name="date" type="date" value="' + esc(value.date || "") + '"></label>' +
    '<label>' + t("tags") + '<input name="tags" value="' + esc((value.tags || []).join(", ")) + '"></label></div>' +
    '<label>' + t("description") + '<input name="description" value="' + esc(value.description || "") + '"></label>' +
    '<label><span><input name="draft" type="checkbox" style="width:auto" ' + (value.draft ? "checked" : "") + '> ' + t("draft") + '</span></label>' +
    '<label>' + t("markdown") + '<textarea name="body">' + esc(value.body || "") + '</textarea></label>' +
    '<div class="row"><button>' + t("save") + '</button><button type="button" class="secondary" id="preview">' + t("preview") + '</button>' +
    (post ? '<button type="button" class="danger" id="delete">' + t("delete") + '</button>' : "") + '</div><p id="message"></p><div id="preview-box" class="preview hidden"></div></form>';
  document.getElementById("content-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await savePost(post);
  });
  document.getElementById("preview").addEventListener("click", previewMarkdown);
  if (post) document.getElementById("delete").addEventListener("click", () => deletePost(post.slug));
}

async function savePost(existing) {
  const payload = readContentForm(true);
  const path = existing ? "/api/posts/" + encodeURIComponent(existing.slug) : "/api/posts";
  const method = existing ? "PUT" : "POST";
  const result = await api(path, { method, body: payload });
  await loadAdminData();
  state.selectedPost = await api("/api/posts/" + encodeURIComponent(result.slug));
  renderPosts();
}

async function deletePost(slug) {
  if (!confirm(t("deletePostConfirm"))) return;
  await api("/api/posts/" + encodeURIComponent(slug), { method: "DELETE", body: {} });
  await loadAdminData();
  state.selectedPost = null;
  renderPosts();
}

function renderPages() {
  const main = document.getElementById("main");
  main.innerHTML = '<div class="grid"><section class="card"><div class="row"><h2>' + t("pages") + '</h2><button id="new-page">' + t("new") + '</button></div><div class="list">' +
    (state.pages.length ? state.pages.map((page) => '<button data-page="' + esc(page.slug) + '">' + esc(page.title) + (page.draft ? '<br><span class="muted">' + t("draft") + '</span>' : "") + '</button>').join("") : '<p class="muted">' + t("noPagesYet") + '</p>') +
    '</div></section><section class="card" id="editor"></section></div>';
  document.getElementById("new-page").addEventListener("click", () => renderPageEditor(null));
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", async () => renderPageEditor(await api("/api/pages/" + encodeURIComponent(button.dataset.page))));
  });
  renderPageEditor(state.selectedPage);
}

function renderPageEditor(page) {
  state.selectedPage = page;
  const editor = document.getElementById("editor");
  const value = page || { title: "", slug: "", draft: false, description: "", body: "" };
  editor.innerHTML = '<h2>' + (page ? t("editPage") : t("createPage")) + '</h2><form id="content-form" class="list">' +
    '<div class="form-grid"><label>' + t("title") + '<input name="title" value="' + esc(value.title || "") + '"></label>' +
    '<label>' + t("slug") + '<input name="slug" value="' + esc(value.slug || "") + '"></label></div>' +
    '<label>' + t("description") + '<input name="description" value="' + esc(value.description || "") + '"></label>' +
    '<label><span><input name="draft" type="checkbox" style="width:auto" ' + (value.draft ? "checked" : "") + '> ' + t("draft") + '</span></label>' +
    '<label>' + t("markdown") + '<textarea name="body">' + esc(value.body || "") + '</textarea></label>' +
    '<div class="row"><button>' + t("save") + '</button><button type="button" class="secondary" id="preview">' + t("preview") + '</button>' +
    (page ? '<button type="button" class="danger" id="delete">' + t("delete") + '</button>' : "") + '</div><p id="message"></p><div id="preview-box" class="preview hidden"></div></form>';
  document.getElementById("content-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await savePage(page);
  });
  document.getElementById("preview").addEventListener("click", previewMarkdown);
  if (page) document.getElementById("delete").addEventListener("click", () => deletePage(page.slug));
}

async function savePage(existing) {
  const payload = readContentForm(false);
  const path = existing ? "/api/pages/" + encodeURIComponent(existing.slug) : "/api/pages";
  const method = existing ? "PUT" : "POST";
  const result = await api(path, { method, body: payload });
  await loadAdminData();
  state.selectedPage = await api("/api/pages/" + encodeURIComponent(result.slug));
  renderPages();
}

async function deletePage(slug) {
  if (!confirm(t("deletePageConfirm"))) return;
  await api("/api/pages/" + encodeURIComponent(slug), { method: "DELETE", body: {} });
  await loadAdminData();
  state.selectedPage = null;
  renderPages();
}

function readContentForm(includeDate) {
  const form = new FormData(document.getElementById("content-form"));
  return {
    title: form.get("title"),
    slug: form.get("slug"),
    date: includeDate ? form.get("date") : "",
    tags: includeDate ? String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    draft: form.get("draft") === "on",
    description: form.get("description"),
    body: form.get("body")
  };
}

async function previewMarkdown() {
  const body = new FormData(document.getElementById("content-form")).get("body");
  const result = await api("/api/preview", { method: "POST", body: { body } });
  const preview = document.getElementById("preview-box");
  preview.classList.remove("hidden");
  preview.innerHTML = result.html;
}

function renderJsonConfig(title, path, value) {
  const main = document.getElementById("main");
  main.innerHTML = '<section class="card"><h2>' + title + '</h2><form id="json-form" class="list">' +
    '<label>' + t("json") + '<textarea name="json">' + esc(JSON.stringify(value, null, 2)) + '</textarea></label>' +
    '<button>' + t("save") + '</button><p id="message"></p></form></section>';
  document.getElementById("json-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const json = JSON.parse(new FormData(event.currentTarget).get("json"));
      await api(path, { method: "PUT", body: json });
      await loadAdminData();
      setMessage(t("saved"), true);
    } catch (error) {
      setMessage(error.message, false);
    }
  });
}

function renderTheme() {
  const active = state.themes.active || { theme: "default", settings: {} };
  const manifest = state.themes.activeManifest;
  const settings = active.settings || {};
  const main = document.getElementById("main");
  main.innerHTML = '<section class="card"><h2>' + t("theme") + '</h2><form id="theme-form" class="list">' +
    '<label>' + t("activeTheme") + '<select name="theme">' + state.themes.themes.map((theme) => '<option value="' + esc(theme.name) + '" ' + (theme.name === active.theme ? "selected" : "") + '>' + esc(theme.name) + '</option>').join("") + '</select></label>' +
    '<div id="theme-settings">' + renderThemeSettings(manifest, settings) + '</div>' +
    '<button>' + t("saveTheme") + '</button><p id="message"></p></form></section>';
  const themeSelect = document.querySelector('select[name="theme"]');
  themeSelect.addEventListener("change", () => {
    const nextManifest = state.themes.themes.find((theme) => theme.name === themeSelect.value);
    const nextSettings = nextManifest && nextManifest.name === active.theme ? settings : {};
    document.getElementById("theme-settings").innerHTML = renderThemeSettings(nextManifest, nextSettings);
  });
  document.getElementById("theme-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextSettings = {};
    document.querySelectorAll("[data-theme-setting]").forEach((input) => {
      nextSettings[input.name] = input.value;
    });
    await api("/api/config/theme", {
      method: "PUT",
      body: { theme: form.get("theme"), settings: nextSettings }
    });
    await loadAdminData();
    setMessage(t("themeSaved"), true);
  });
}

function renderThemeSettings(manifest, settings) {
  if (!manifest || !manifest.settings) return '<p class="muted">' + t("noConfigurableSettings") + '</p>';
  return Object.entries(manifest.settings).map(([key, definition]) => {
    const value = settings[key] ?? definition.default ?? "";
    if (definition.type === "select") {
      return '<label>' + esc(key) + '<select data-theme-setting name="' + esc(key) + '">' + definition.options.map((option) => '<option value="' + esc(option) + '" ' + (option === value ? "selected" : "") + '>' + esc(option) + '</option>').join("") + '</select></label>';
    }
    return '<label>' + esc(key) + '<input data-theme-setting name="' + esc(key) + '" type="' + (definition.type === "color" ? "color" : "text") + '" value="' + esc(value) + '"></label>';
  }).join("");
}

function renderPlugins() {
  const enabled = new Set((state.plugins.active && state.plugins.active.enabled) || []);
  const main = document.getElementById("main");
  main.innerHTML = '<section class="card"><h2>' + t("plugins") + '</h2><form id="plugins-form" class="list">' +
    state.plugins.plugins.map((plugin) => '<label><span><input type="checkbox" name="plugins" value="' + esc(plugin.name) + '" style="width:auto" ' + (enabled.has(plugin.name) ? "checked" : "") + '> ' + esc(plugin.name) + ' <span class="muted">' + esc(plugin.version || "") + '</span></span></label>').join("") +
    '<button>' + t("savePlugins") + '</button><p id="message"></p></form></section>';
  document.getElementById("plugins-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = Array.from(document.querySelectorAll("input[name=plugins]:checked")).map((input) => input.value);
    await api("/api/config/plugins", { method: "PUT", body: { enabled: selected } });
    await loadAdminData();
    setMessage(t("pluginSaved"), true);
  });
}

function renderBuild() {
  const main = document.getElementById("main");
  main.innerHTML = '<section class="card"><h2>' + t("build") + '</h2><p>' + t("buildPrompt") + ' <code>dist/</code>.</p><button id="build">' + t("triggerBuild") + '</button><p id="message"></p></section>';
  document.getElementById("build").addEventListener("click", async () => {
    setMessage(t("building"), true);
    try {
      const result = await api("/api/build", { method: "POST", body: {} });
      setMessage(t("buildComplete").replace("{posts}", result.result.posts).replace("{pages}", result.result.pages), true);
    } catch (error) {
      setMessage(error.message, false);
    }
  });
}

function setMessage(message, ok) {
  const element = document.getElementById("message");
  if (!element) return;
  element.className = ok ? "success" : "error";
  element.textContent = message;
}

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
  </script>
</body>
</html>`;
}

const entryPath = process.argv[1] ? nodePath.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  startAdminServer();
}
