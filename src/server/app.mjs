import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  contentBucket,
  createContentItem,
  ensureDatabase,
  hasAdmin,
  loadDb,
  transact,
  uniqueSlug
} from "./database.mjs";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  safeUser,
  verifyPassword
} from "./security.mjs";
import { renderPublicRoute } from "./render.mjs";
import { readZipEntries, stripCommonRoot } from "../core/archive.mjs";
import { applyUpgrade, loadUpgradeInfo, stageGitRepository, stageZipPackage } from "../core/upgrade.mjs";

const SESSION_COOKIE = "kizu_session";
const SESSION_DAYS = 7;
const MAX_BODY = 1024 * 1024;
const MAX_THEME_PACKAGE = 50 * 1024 * 1024;
const MAX_UPGRADE_PACKAGE = 120 * 1024 * 1024;
const PROJECT_ROOT = resolve(".");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".xml", "application/xml; charset=utf-8"]
]);

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function html(response, status, body) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }).filter(([key]) => key));
}

async function bodyJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > MAX_BODY) {
      throw Object.assign(new Error("请求体过大"), { status: 413 });
    }
  }

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("JSON 格式无效"), { status: 400 });
  }
}

async function bodyBuffer(request, maxSize = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) {
      throw Object.assign(new Error("请求体过大"), { status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipartFile(request, buffer, fieldName) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) {
    throw Object.assign(new Error("缺少上传边界"), { status: 400 });
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(boundaryBuffer);

  while (cursor !== -1) {
    const partStart = cursor + boundaryBuffer.length;
    const nextBoundary = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundary === -1) break;

    let part = buffer.subarray(partStart, nextBoundary);
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(-2).toString() === "\r\n") part = part.subarray(0, -2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4);
      const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/)?.[1];
      const filename = disposition.match(/filename="([^"]*)"/)?.[1] || "theme.zip";
      if (name === fieldName) {
        return { filename, content };
      }
    }

    cursor = nextBoundary;
  }

  throw Object.assign(new Error("没有找到主题压缩包"), { status: 400 });
}

function sessionCookie(token, name = SESSION_COOKIE) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}`;
}

function sessionCookies(token) {
  return [sessionCookie(token, SESSION_COOKIE)];
}

function clearSessionCookies() {
  return [`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`];
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function validateUsername(username) {
  return typeof username === "string" && /^[A-Za-z0-9_-]{3,32}$/.test(username);
}

function randomAvatarColor(seed = "") {
  const colors = ["#d84f3f", "#22776e", "#7d5de8", "#a16f22", "#2f6fb3", "#bd3f7a"];
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function sanitizeThemeName(value = "theme") {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "theme";
}

async function uniqueThemeDirectory(baseName) {
  const base = sanitizeThemeName(baseName);
  let name = base;
  let index = 2;

  while (await stat(join("themes", name)).then(() => true).catch(() => false)) {
    name = `${base}-${index}`;
    index += 1;
  }

  return name;
}

async function importThemeZip(zipBuffer, filename) {
  const files = stripCommonRoot(readZipEntries(zipBuffer), ["theme.json"]);
  const manifestEntry = files.find((file) => file.name === "theme.json");
  if (!manifestEntry) {
    throw Object.assign(new Error("主题包根目录必须包含 theme.json"), { status: 400 });
  }
  const names = new Set(files.map((file) => file.name));
  if (!names.has("templates/index.html") && !names.has("templates/home.html")) {
    throw Object.assign(new Error("主题包必须包含 templates/index.html 或 templates/home.html"), { status: 400 });
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.content.toString("utf8"));
  } catch {
    throw Object.assign(new Error("theme.json 格式无效"), { status: 400 });
  }

  const directory = await uniqueThemeDirectory(manifest.name || filename.replace(/\.zip$/i, ""));
  const target = join("themes", directory);

  await mkdir(target, { recursive: true });
  try {
    for (const file of files) {
      const targetFile = resolve(target, file.name);
      const relative = normalize(targetFile).replace(resolve(target), "");
      if (!(relative === "" || relative.startsWith(sep))) {
        throw Object.assign(new Error("主题包包含非法路径"), { status: 400 });
      }
      await mkdir(dirname(targetFile), { recursive: true });
      await writeFile(targetFile, file.content);
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }

  return { ...manifest, directory, imported: true };
}

async function runStagedUpgrade(staged, options = {}) {
  try {
    return await applyUpgrade({
      sourceRoot: staged.sourceRoot,
      targetRoot: PROJECT_ROOT,
      dryRun: Boolean(options.dryRun),
      allowDowngrade: Boolean(options.allowDowngrade),
      actor: options.actor || "admin"
    });
  } finally {
    await staged.cleanup();
  }
}

async function createSession(userId) {
  const token = createSessionToken();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await transact((db) => {
    db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    db.sessions.push({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt
    });
  });

  return token;
}

async function requestContext(request) {
  const db = await loadDb();
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return { db, user: null, session: null };
  }

  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const session = db.sessions.find((item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now);
  const user = session ? db.users.find((item) => item.id === session.userId && item.status !== "disabled") : null;
  return { db, user: user || null, session: session || null };
}

function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    throw Object.assign(new Error("需要管理员权限"), { status: 403 });
  }
}

function requireUser(user) {
  if (!user) {
    throw Object.assign(new Error("需要登录"), { status: 401 });
  }
}

function isAdmin(user) {
  return user?.role === "admin";
}

function visibleContentItems(db, user) {
  const all = [...db.posts, ...db.pages];
  if (isAdmin(user)) {
    return all;
  }
  return all.filter((item) => item.authorId === user.id);
}

function canEditContent(user, item) {
  return isAdmin(user) || item.authorId === user.id;
}

function visibleComments(db, user) {
  if (isAdmin(user)) {
    return db.comments;
  }
  const ownPostIds = new Set(db.posts.filter((post) => post.authorId === user.id).map((post) => post.id));
  return db.comments.filter((comment) => ownPostIds.has(comment.postId));
}

function canModerateComment(db, user, comment) {
  if (isAdmin(user)) {
    return true;
  }
  const post = db.posts.find((item) => item.id === comment.postId);
  return post?.authorId === user.id;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicComment(comment, user) {
  return {
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    status: comment.status,
    createdAt: comment.createdAt,
    author: {
      displayName: user?.displayName || "访客",
      avatarColor: user?.avatarColor || "#d84f3f"
    }
  };
}

async function listThemes(activeTheme, userTheme = "") {
  const entries = await readdir("themes", { withFileTypes: true }).catch(() => []);
  const themes = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const manifest = JSON.parse(await readFile(join("themes", entry.name, "theme.json"), "utf8"));
      themes.push({
        ...manifest,
        activeSite: entry.name === activeTheme,
        activeUser: entry.name === userTheme,
        directory: entry.name
      });
    } catch {
      themes.push({
        name: entry.name,
        displayName: entry.name,
        version: "unknown",
        description: "theme.json 无法读取",
        activeSite: entry.name === activeTheme,
        activeUser: entry.name === userTheme,
        directory: entry.name
      });
    }
  }

  return themes;
}

async function handlePublicApi(request, response, pathname, user, db) {
  if (request.method === "GET" && pathname === "/api/bootstrap") {
    json(response, 200, {
      hasAdmin: hasAdmin(db),
      currentUser: safeUser(user),
      site: {
        title: db.settings.title,
        subtitle: db.settings.subtitle,
        description: db.settings.description,
        registrationOpen: db.settings.registrationOpen
      },
      counts: {
        posts: db.posts.filter((post) => post.status === "published").length,
        pages: db.pages.filter((page) => page.status === "published").length
      }
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/setup-admin") {
    const payload = await bodyJson(request);

    if (hasAdmin(db)) {
      throw Object.assign(new Error("初始账号已经创建"), { status: 409 });
    }
    if (!validateUsername(payload.username)) {
      throw Object.assign(new Error("用户名需为 3-32 位字母、数字、下划线或连字符"), { status: 400 });
    }
    if (!validatePassword(payload.password)) {
      throw Object.assign(new Error("密码至少 8 位"), { status: 400 });
    }

    const userId = randomUUID();
    await transact((nextDb) => {
      if (hasAdmin(nextDb)) {
        throw Object.assign(new Error("初始账号已经创建"), { status: 409 });
      }
      nextDb.users.push({
        id: userId,
        username: payload.username,
        displayName: payload.displayName || payload.username,
        email: payload.email || "",
        role: "admin",
        status: "active",
        bio: "",
        website: "",
        theme: nextDb.settings.theme || "neo-journal",
        avatarColor: randomAvatarColor(payload.username),
        passwordHash: hashPassword(payload.password),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (payload.siteTitle) {
        nextDb.settings.title = String(payload.siteTitle);
      }
      if (payload.siteSubtitle) {
        nextDb.settings.subtitle = String(payload.siteSubtitle);
      }
    });

    const token = await createSession(userId);
    json(response, 201, { ok: true }, { "set-cookie": sessionCookies(token) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const payload = await bodyJson(request);
    const login = String(payload.login || "").trim();
    const account = db.users.find((item) => item.username === login || item.email === login);

    if (!account || account.status === "disabled" || !verifyPassword(String(payload.password || ""), account.passwordHash)) {
      throw Object.assign(new Error("账号或密码错误"), { status: 401 });
    }

    const token = await createSession(account.id);
    json(response, 200, { ok: true, user: safeUser(account) }, { "set-cookie": sessionCookies(token) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/register") {
    const payload = await bodyJson(request);

    if (!hasAdmin(db)) {
      throw Object.assign(new Error("请先创建管理员账号"), { status: 409 });
    }
    if (!db.settings.registrationOpen) {
      throw Object.assign(new Error("站点未开放公开注册"), { status: 403 });
    }
    if (!validateUsername(payload.username)) {
      throw Object.assign(new Error("用户名需为 3-32 位字母、数字、下划线或连字符"), { status: 400 });
    }
    if (!validatePassword(payload.password)) {
      throw Object.assign(new Error("密码至少 8 位"), { status: 400 });
    }
    if (db.users.some((item) => item.username === payload.username || item.email === payload.email)) {
      throw Object.assign(new Error("用户名或邮箱已存在"), { status: 409 });
    }

    const userId = randomUUID();
    await transact((nextDb) => {
      if (nextDb.users.some((item) => item.username === payload.username || item.email === payload.email)) {
        throw Object.assign(new Error("用户名或邮箱已存在"), { status: 409 });
      }
      nextDb.users.push({
        id: userId,
        username: payload.username,
        displayName: payload.displayName || payload.username,
        email: payload.email || "",
        role: "subscriber",
        status: "active",
        bio: "",
        website: "",
        theme: nextDb.settings.theme || "neo-journal",
        avatarColor: randomAvatarColor(payload.username),
        passwordHash: hashPassword(payload.password),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    const token = await createSession(userId);
    json(response, 201, { ok: true }, { "set-cookie": sessionCookies(token) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const cookies = parseCookies(request);
    const token = cookies[SESSION_COOKIE];
    if (token) {
      const tokenHash = hashSessionToken(token);
      await transact((nextDb) => {
        nextDb.sessions = nextDb.sessions.filter((session) => session.tokenHash !== tokenHash);
      });
    }
    json(response, 200, { ok: true }, { "set-cookie": clearSessionCookies() });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/comments") {
    const url = new URL(request.url, "http://localhost");
    const postId = url.searchParams.get("postId");
    const comments = db.comments
      .filter((comment) => comment.postId === postId && comment.status === "approved")
      .map((comment) => publicComment(comment, db.users.find((item) => item.id === comment.userId)));
    json(response, 200, { comments });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/comments") {
    requireUser(user);
    const payload = await bodyJson(request);
    const body = String(payload.body || "").trim();
    const postId = String(payload.postId || "");

    if (!body || body.length > 2000) {
      throw Object.assign(new Error("评论不能为空，且不能超过 2000 字"), { status: 400 });
    }
    if (!db.posts.some((post) => post.id === postId && post.status === "published")) {
      throw Object.assign(new Error("文章不存在"), { status: 404 });
    }

    const comment = {
      id: randomUUID(),
      postId,
      userId: user.id,
      body,
      status: db.settings.commentsModeration ? "pending" : "approved",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await transact((nextDb) => {
      nextDb.comments.push(comment);
    });

    json(response, 201, { comment: publicComment(comment, user), pending: comment.status === "pending" });
    return true;
  }

  return false;
}

async function handleAdminApi(request, response, pathname, user, db) {
  requireUser(user);

  if (request.method === "GET" && pathname === "/api/admin/overview") {
    const items = visibleContentItems(db, user);
    const comments = visibleComments(db, user);
    json(response, 200, {
      role: user.role,
      counts: {
        posts: items.filter((item) => item.type === "post").length,
        pages: items.filter((item) => item.type === "page").length,
        users: isAdmin(user) ? db.users.length : 1,
        comments: comments.length,
        pendingComments: comments.filter((comment) => comment.status === "pending").length
      },
      recentPosts: items.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5),
      pendingComments: comments.filter((comment) => comment.status === "pending").slice(0, 5),
      capabilities: {
        admin: isAdmin(user),
        manageSite: isAdmin(user),
        manageUsers: isAdmin(user),
        manageThemes: isAdmin(user)
      }
    });
    return true;
  }

  if (pathname === "/api/admin/content" && request.method === "GET") {
    const url = new URL(request.url, "http://localhost");
    const type = url.searchParams.get("type");
    const items = visibleContentItems(db, user).filter((item) => !type || item.type === type);
    json(response, 200, {
      items: items.slice().sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date))
    });
    return true;
  }

  if (pathname === "/api/admin/content" && request.method === "POST") {
    const payload = await bodyJson(request);
    if (!isAdmin(user)) {
      payload.type = "post";
    }
    const item = createContentItem({
      ...payload,
      tags: normalizeList(payload.tags),
      categories: normalizeList(payload.categories)
    }, user);

    await transact((nextDb) => {
      const bucket = contentBucket(nextDb, item.type);
      item.slug = uniqueSlug(bucket, item.title, payload.slug);
      bucket.push(item);
    });

    json(response, 201, { item });
    return true;
  }

  const contentMatch = pathname.match(/^\/api\/admin\/content\/([^/]+)$/);
  if (contentMatch && request.method === "PUT") {
    const payload = await bodyJson(request);
    let updated = null;

    await transact((nextDb) => {
      const all = [...nextDb.posts, ...nextDb.pages];
      const item = all.find((candidate) => candidate.id === contentMatch[1]);
      if (!item) {
        throw Object.assign(new Error("内容不存在"), { status: 404 });
      }
      if (!canEditContent(user, item)) {
        throw Object.assign(new Error("只能修改自己的内容"), { status: 403 });
      }

      const bucket = contentBucket(nextDb, item.type);
      item.title = String(payload.title || item.title);
      item.slug = uniqueSlug(bucket, item.title, payload.slug || item.slug, item.id);
      item.description = String(payload.description || "");
      item.excerpt = String(payload.excerpt || payload.description || "");
      item.body = String(payload.body || "");
      item.cover = String(payload.cover || "");
      item.tags = normalizeList(payload.tags);
      item.categories = normalizeList(payload.categories);
      item.status = ["draft", "published", "private"].includes(payload.status) ? payload.status : item.status;
      item.featured = Boolean(payload.featured);
      item.date = payload.date || item.date;
      item.updated = new Date().toISOString();
      item.updatedAt = item.updated;
      updated = item;
    });

    json(response, 200, { item: updated });
    return true;
  }

  if (contentMatch && request.method === "DELETE") {
    await transact((nextDb) => {
      const item = [...nextDb.posts, ...nextDb.pages].find((candidate) => candidate.id === contentMatch[1]);
      if (!item) {
        throw Object.assign(new Error("内容不存在"), { status: 404 });
      }
      if (!canEditContent(user, item)) {
        throw Object.assign(new Error("只能删除自己的内容"), { status: 403 });
      }
      nextDb.posts = nextDb.posts.filter((candidate) => candidate.id !== contentMatch[1]);
      nextDb.pages = nextDb.pages.filter((candidate) => candidate.id !== contentMatch[1]);
      nextDb.comments = nextDb.comments.filter((comment) => comment.postId !== contentMatch[1]);
    });
    json(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/admin/profile" && request.method === "GET") {
    json(response, 200, { user: safeUser(user) });
    return true;
  }

  if (pathname === "/api/admin/profile" && request.method === "PUT") {
    const payload = await bodyJson(request);
    let updated = null;
    await transact((nextDb) => {
      const account = nextDb.users.find((item) => item.id === user.id);
      if (!account) {
        throw Object.assign(new Error("账号不存在"), { status: 404 });
      }
      account.displayName = String(payload.displayName || account.displayName);
      account.email = String(payload.email || "");
      account.bio = String(payload.bio || "");
      account.website = String(payload.website || "");
      account.updatedAt = new Date().toISOString();
      updated = account;
    });
    json(response, 200, { user: safeUser(updated) });
    return true;
  }

  if (pathname === "/api/admin/users" && request.method === "GET") {
    requireAdmin(user);
    json(response, 200, { users: db.users.map(safeUser) });
    return true;
  }

  if (pathname === "/api/admin/users" && request.method === "POST") {
    requireAdmin(user);
    const payload = await bodyJson(request);
    if (!validateUsername(payload.username)) {
      throw Object.assign(new Error("用户名需为 3-32 位字母、数字、下划线或连字符"), { status: 400 });
    }
    if (!validatePassword(payload.password)) {
      throw Object.assign(new Error("密码至少 8 位"), { status: 400 });
    }
    if (db.users.some((item) => item.username === payload.username || item.email === payload.email)) {
      throw Object.assign(new Error("用户名或邮箱已存在"), { status: 409 });
    }

    const role = ["admin", "author", "subscriber"].includes(payload.role) ? payload.role : "subscriber";
    const newUser = {
      id: randomUUID(),
      username: payload.username,
      displayName: payload.displayName || payload.username,
      email: payload.email || "",
      role,
      status: "active",
      bio: "",
      website: "",
      theme: db.settings.theme || "neo-journal",
      avatarColor: randomAvatarColor(payload.username),
      passwordHash: hashPassword(payload.password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await transact((nextDb) => {
      if (nextDb.users.some((item) => item.username === payload.username || item.email === payload.email)) {
        throw Object.assign(new Error("用户名或邮箱已存在"), { status: 409 });
      }
      nextDb.users.push(newUser);
    });

    json(response, 201, { user: safeUser(newUser) });
    return true;
  }

  if (pathname === "/api/admin/comments" && request.method === "GET") {
    const comments = visibleComments(db, user);
    json(response, 200, {
      comments: comments.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((comment) => ({
        ...comment,
        author: safeUser(db.users.find((item) => item.id === comment.userId)),
        post: db.posts.find((post) => post.id === comment.postId) || null
      }))
    });
    return true;
  }

  const commentMatch = pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
  if (commentMatch && request.method === "PUT") {
    const payload = await bodyJson(request);
    let updated = null;
    await transact((nextDb) => {
      const comment = nextDb.comments.find((item) => item.id === commentMatch[1]);
      if (!comment) {
        throw Object.assign(new Error("评论不存在"), { status: 404 });
      }
      if (!canModerateComment(nextDb, user, comment)) {
        throw Object.assign(new Error("只能管理自己文章下的评论"), { status: 403 });
      }
      comment.status = ["pending", "approved", "spam"].includes(payload.status) ? payload.status : comment.status;
      comment.updatedAt = new Date().toISOString();
      updated = comment;
    });
    json(response, 200, { comment: updated });
    return true;
  }

  if (commentMatch && request.method === "DELETE") {
    await transact((nextDb) => {
      const comment = nextDb.comments.find((item) => item.id === commentMatch[1]);
      if (!comment) {
        throw Object.assign(new Error("评论不存在"), { status: 404 });
      }
      if (!canModerateComment(nextDb, user, comment)) {
        throw Object.assign(new Error("只能管理自己文章下的评论"), { status: 403 });
      }
      nextDb.comments = nextDb.comments.filter((item) => item.id !== commentMatch[1]);
    });
    json(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/admin/settings" && request.method === "GET") {
    requireAdmin(user);
    json(response, 200, { settings: db.settings });
    return true;
  }

  if (pathname === "/api/admin/settings" && request.method === "PUT") {
    requireAdmin(user);
    const payload = await bodyJson(request);
    await transact((nextDb) => {
      nextDb.settings = {
        ...nextDb.settings,
        title: String(payload.title || nextDb.settings.title),
        subtitle: String(payload.subtitle || ""),
        description: String(payload.description || ""),
        url: String(payload.url || nextDb.settings.url),
        author: {
          ...(nextDb.settings.author || {}),
          name: String(payload.authorName || nextDb.settings.author?.name || "伊甸黎明"),
          bio: String(payload.authorBio || nextDb.settings.author?.bio || "")
        },
        registrationOpen: Boolean(payload.registrationOpen),
        commentsModeration: Boolean(payload.commentsModeration),
        themeConfig: {
          ...nextDb.settings.themeConfig,
          ...(payload.themeConfig || {})
        }
      };
    });
    json(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/admin/themes" && request.method === "GET") {
    json(response, 200, {
      themes: await listThemes(db.settings.theme, user.theme || db.settings.theme),
      activeSite: db.settings.theme,
      activeUser: user.theme || db.settings.theme,
      canImport: isAdmin(user),
      canSetSite: isAdmin(user)
    });
    return true;
  }

  if (pathname === "/api/admin/themes" && request.method === "PUT") {
    const payload = await bodyJson(request);
    const themes = await listThemes(db.settings.theme, user.theme || db.settings.theme);
    const theme = themes.find((item) => item.directory === payload.theme || item.name === payload.theme);
    if (!theme) {
      throw Object.assign(new Error("主题不存在"), { status: 404 });
    }
    await transact((nextDb) => {
      const account = nextDb.users.find((item) => item.id === user.id);
      if (!account) {
        throw Object.assign(new Error("账号不存在"), { status: 404 });
      }
      account.theme = theme.directory;
      if (payload.scope === "site") {
        requireAdmin(user);
        nextDb.settings.theme = theme.directory;
      }
    });
    json(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/admin/themes/import" && request.method === "POST") {
    requireAdmin(user);
    const uploaded = parseMultipartFile(request, await bodyBuffer(request, MAX_THEME_PACKAGE), "themePackage");
    if (!uploaded.filename.toLowerCase().endsWith(".zip")) {
      throw Object.assign(new Error("请上传 .zip 主题包"), { status: 400 });
    }
    const theme = await importThemeZip(uploaded.content, uploaded.filename);
    json(response, 201, { theme });
    return true;
  }

  if (pathname === "/api/admin/upgrade" && request.method === "GET") {
    requireAdmin(user);
    json(response, 200, await loadUpgradeInfo(PROJECT_ROOT));
    return true;
  }

  if (pathname === "/api/admin/upgrade/package" && request.method === "POST") {
    requireAdmin(user);
    const uploaded = parseMultipartFile(request, await bodyBuffer(request, MAX_UPGRADE_PACKAGE), "upgradePackage");
    if (!uploaded.filename.toLowerCase().endsWith(".zip")) {
      throw Object.assign(new Error("请上传 .zip 升级包"), { status: 400 });
    }

    const result = await runStagedUpgrade(
      await stageZipPackage(uploaded.content, uploaded.filename),
      { actor: user.username || user.id }
    );

    json(response, 200, {
      ok: true,
      result,
      info: await loadUpgradeInfo(PROJECT_ROOT)
    });
    return true;
  }

  if (pathname === "/api/admin/upgrade/git" && request.method === "POST") {
    requireAdmin(user);
    const payload = await bodyJson(request);
    const result = await runStagedUpgrade(
      await stageGitRepository(payload.repository, payload.ref || ""),
      {
        actor: user.username || user.id,
        dryRun: payload.dryRun,
        allowDowngrade: payload.allowDowngrade
      }
    );

    json(response, 200, {
      ok: true,
      result,
      info: await loadUpgradeInfo(PROJECT_ROOT)
    });
    return true;
  }

  return false;
}

function isInside(root, filePath) {
  const relative = normalize(filePath).replace(root, "");
  return relative === "" || relative.startsWith(sep);
}

async function serveFile(response, root, pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0]).replace(/^\/+/, "");
  const filePath = resolve(root, clean);

  if (!isInside(root, filePath)) {
    return false;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    return false;
  }

  response.writeHead(200, {
    "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
  return true;
}

async function handleStatic(request, response, pathname, db) {
  if (pathname.startsWith("/assets/")) {
    const themeRoot = resolve("themes", db.settings.theme || "neo-journal", "assets");
    return serveFile(response, themeRoot, pathname.replace(/^\/assets\//, ""));
  }

  if (pathname.startsWith("/admin/assets/")) {
    return serveFile(response, resolve("admin", "assets"), pathname.replace(/^\/admin\/assets\//, ""));
  }

  return false;
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname.endsWith("/") || extname(url.pathname) ? url.pathname : `${url.pathname}/`;

  try {
    const { db, user } = await requestContext(request);

    if (await handleStatic(request, response, url.pathname, db)) {
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (await handlePublicApi(request, response, url.pathname, user, db)) {
        return;
      }
      if (url.pathname.startsWith("/api/admin/") && await handleAdminApi(request, response, url.pathname, user, db)) {
        return;
      }
      json(response, 404, { error: "接口不存在" });
      return;
    }

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      html(response, 200, await readFile(join("admin", "index.html"), "utf8"));
      return;
    }

    const rendered = await renderPublicRoute(db, pathname, user);
    response.writeHead(rendered.status, { "content-type": rendered.type });
    response.end(rendered.body);
  } catch (error) {
    const status = error.status || 500;
    if (request.url?.startsWith("/api/")) {
      json(response, status, { error: error.message || "服务器错误" });
      return;
    }
    html(response, status, `<h1>${status}</h1><p>${error.message || "服务器错误"}</p>`);
  }
}

export async function startServer() {
  await ensureDatabase();
  const preferredPort = Number.parseInt(process.env.PORT || "4173", 10);

  function listen(port) {
    const server = createServer(handleRequest);

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        listen(port + 1);
        return;
      }
      throw error;
    });

    server.listen(port, () => {
      console.log(`Kizu Blog CMS: http://localhost:${port}`);
      console.log(`Admin console: http://localhost:${port}/admin/`);
    });
  }

  listen(preferredPort);
}
