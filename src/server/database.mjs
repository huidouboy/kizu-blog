import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadContent } from "../core/content.mjs";
import { readJson, slugify } from "../core/utils.mjs";

const DATA_DIR = "data";
const DB_PATH = join(DATA_DIR, "db.json");
const TMP_PATH = join(DATA_DIR, "db.tmp.json");
let writeQueue = Promise.resolve();

async function exists(filePath) {
  return stat(filePath).then(() => true).catch(() => false);
}

function defaultSettings(config) {
  return {
    title: config.title || "Kizu Blog",
    subtitle: config.subtitle || "记录想法、作品和日常灵感",
    description: config.description || "一个干净、灵动、可管理的个人博客。",
    url: config.url || "http://localhost:4173",
    language: config.language || "zh-CN",
    timezone: config.timezone || "Asia/Shanghai",
    theme: config.theme || "neo-journal",
    permalink: config.permalink || "/posts/:slug/",
    pagination: config.pagination || { perPage: 6 },
    author: config.author || { name: "伊甸黎明", bio: "" },
    navigation: config.navigation || [
      { label: "首页", url: "/" },
      { label: "归档", url: "/archives/" },
      { label: "关于", url: "/about/" }
    ],
    themeConfig: config.themeConfig || {},
    registrationOpen: true,
    commentsModeration: true
  };
}

function fromDocument(document) {
  return {
    id: randomUUID(),
    type: document.type,
    title: document.title,
    slug: document.slug,
    date: document.date,
    updated: document.updated,
    description: document.description,
    excerpt: document.excerpt,
    body: document.body,
    cover: document.cover || "",
    tags: document.tags || [],
    categories: document.categories || [],
    status: document.status || "published",
    featured: Boolean(document.featured),
    authorId: null,
    createdAt: document.date,
    updatedAt: document.updated
  };
}

async function createInitialDatabase() {
  const config = await readJson("site.config.json");
  const content = await loadContent(config);
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    settings: defaultSettings(config),
    users: [],
    sessions: [],
    posts: content.posts.map(fromDocument),
    pages: content.pages.map(fromDocument),
    comments: [],
    media: []
  };
}

async function saveDb(db) {
  await mkdir(DATA_DIR, { recursive: true });
  db.updatedAt = new Date().toISOString();
  await writeFile(TMP_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await rename(TMP_PATH, DB_PATH);
}

export async function ensureDatabase() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!await exists(DB_PATH)) {
    await saveDb(await createInitialDatabase());
    return;
  }

  const db = JSON.parse(await readFile(DB_PATH, "utf8"));
  let changed = false;

  if (db.settings?.title === "kizu blog") {
    db.settings.title = "Kizu Blog";
    changed = true;
  }
  if (db.settings?.author?.name === "Kizu Team") {
    db.settings.author.name = "伊甸黎明";
    changed = true;
  }
  if (Array.isArray(db.settings?.navigation)) {
    const nextNavigation = db.settings.navigation.filter((item) => item.url !== "/theme-guide/");
    if (nextNavigation.length !== db.settings.navigation.length) {
      db.settings.navigation = nextNavigation;
      changed = true;
    }
  }
  if (Array.isArray(db.pages)) {
    const nextPages = db.pages.filter((item) => item.slug !== "theme-guide");
    if (nextPages.length !== db.pages.length) {
      db.pages = nextPages;
      changed = true;
    }
  }
  if (Array.isArray(db.users)) {
    for (const user of db.users) {
      if (!("theme" in user)) {
        user.theme = db.settings?.theme || "neo-journal";
        changed = true;
      }
      if (!("bio" in user)) {
        user.bio = "";
        changed = true;
      }
      if (!("website" in user)) {
        user.website = "";
        changed = true;
      }
    }
  }

  if (changed) {
    await saveDb(db);
  }
}

export async function loadDb() {
  await ensureDatabase();
  return JSON.parse(await readFile(DB_PATH, "utf8"));
}

export async function transact(mutator) {
  const run = writeQueue.then(async () => {
    const db = await loadDb();
    const result = await mutator(db);
    await saveDb(db);
    return result;
  });

  writeQueue = run.catch(() => {});
  return run;
}

export function hasAdmin(db) {
  return db.users.some((user) => user.role === "admin" && user.status !== "disabled");
}

export function contentBucket(db, type) {
  return type === "page" ? db.pages : db.posts;
}

export function uniqueSlug(items, title, requestedSlug, currentId = null) {
  const base = slugify(requestedSlug || title || "untitled") || "untitled";
  let slug = base;
  let index = 2;

  while (items.some((item) => item.slug === slug && item.id !== currentId)) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

export function createContentItem(payload, user) {
  const now = new Date().toISOString();
  const type = payload.type === "page" ? "page" : "post";

  return {
    id: randomUUID(),
    type,
    title: String(payload.title || "未命名内容"),
    slug: "",
    date: payload.date || now,
    updated: now,
    description: String(payload.description || ""),
    excerpt: String(payload.excerpt || payload.description || ""),
    body: String(payload.body || ""),
    cover: String(payload.cover || ""),
    tags: Array.isArray(payload.tags) ? payload.tags.map(String).filter(Boolean) : [],
    categories: Array.isArray(payload.categories) ? payload.categories.map(String).filter(Boolean) : [],
    status: ["draft", "published", "private"].includes(payload.status) ? payload.status : "draft",
    featured: Boolean(payload.featured),
    authorId: user?.id || null,
    createdAt: now,
    updatedAt: now
  };
}
