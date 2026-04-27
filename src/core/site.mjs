import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadContent } from "./content.mjs";
import { createRenderer } from "./template.mjs";
import { chooseTemplate, loadTheme } from "./theme.mjs";
import { readJson, slugify, writeText } from "./utils.mjs";

function pagePathToFile(routePath) {
  const normalized = routePath.replace(/^\/+|\/+$/g, "");
  return normalized ? join("public", normalized, "index.html") : join("public", "index.html");
}

function makeCollection(posts, key) {
  const collection = new Map();
  for (const post of posts) {
    for (const value of post[key] || []) {
      const slug = slugify(value);
      if (!collection.has(slug)) {
        collection.set(slug, { name: value, slug, path: `/${key}/${slug}/`, posts: [] });
      }
      collection.get(slug).posts.push(post);
    }
  }
  return [...collection.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function paginate(items, perPage) {
  const pages = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages.length ? pages : [[]];
}

function layoutData(config, theme, content, extra = {}) {
  const tags = makeCollection(content.posts, "tags");
  const categories = makeCollection(content.posts, "categories");
  return {
    site: {
      ...config,
      year: new Date().getFullYear()
    },
    theme: theme.config,
    collections: {
      tags,
      categories
    },
    navigation: config.navigation || [],
    pages: content.pages,
    posts: content.posts,
    featuredPosts: content.posts.filter((post) => post.featured).slice(0, 3),
    latestPosts: content.posts.slice(0, 6),
    slot: {
      head: "",
      beforeContent: "",
      afterContent: "",
      footer: ""
    },
    ...extra
  };
}

async function emit(routePath, html) {
  const filePath = pagePathToFile(routePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");
}

function renderPage(theme, content, config, template, extra) {
  const render = createRenderer(theme.partials);
  return render(template, layoutData(config, theme, content, extra));
}

function createFeed(config, posts) {
  const items = posts.slice(0, 20).map((post) => `  <item>
    <title><![CDATA[${post.title}]]></title>
    <link>${config.url}${post.path}</link>
    <guid>${config.url}${post.path}</guid>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <description><![CDATA[${post.description}]]></description>
  </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${config.title}</title>
  <link>${config.url}</link>
  <description>${config.description}</description>
${items}
</channel>
</rss>`;
}

async function emitHome(config, theme, content) {
  const perPage = config.pagination?.perPage || 6;
  const pages = paginate(content.posts, perPage);

  for (const [index, pagePosts] of pages.entries()) {
    const pageNumber = index + 1;
    const routePath = pageNumber === 1 ? "/" : `/page/${pageNumber}/`;
    const template = chooseTemplate(theme, ["home", "index"]);
    await emit(routePath, renderPage(theme, content, config, template, {
      view: "home",
      title: config.title,
      pageTitle: "首页",
      description: config.description,
      posts: pagePosts,
      pagination: {
        current: pageNumber,
        total: pages.length,
        hasPrev: pageNumber > 1,
        hasNext: pageNumber < pages.length,
        prevPath: pageNumber === 2 ? "/" : `/page/${pageNumber - 1}/`,
        nextPath: `/page/${pageNumber + 1}/`
      }
    }));
  }
}

async function emitPosts(config, theme, content) {
  for (const post of content.posts) {
    const template = chooseTemplate(theme, [`post-${post.slug}`, "post", "singular", "index"]);
    await emit(post.path, renderPage(theme, content, config, template, {
      view: "post",
      title: post.title,
      pageTitle: post.title,
      description: post.description,
      post
    }));
  }
}

async function emitPages(config, theme, content) {
  for (const page of content.pages) {
    const template = chooseTemplate(theme, [`page-${page.slug}`, "page", "singular", "index"]);
    await emit(page.path, renderPage(theme, content, config, template, {
      view: "page",
      title: page.title,
      pageTitle: page.title,
      description: page.description,
      page
    }));
  }
}

async function emitArchives(config, theme, content) {
  const template = chooseTemplate(theme, ["archive", "index"]);
  await emit("/archives/", renderPage(theme, content, config, template, {
    view: "archive",
    title: "归档",
    pageTitle: "归档",
    description: "所有文章按时间排列。",
    archive: {
      name: "归档",
      type: "archive",
      posts: content.posts
    }
  }));

  for (const tag of makeCollection(content.posts, "tags")) {
    await emit(tag.path, renderPage(theme, content, config, template, {
      view: "tag",
      title: `标签：${tag.name}`,
      pageTitle: `标签：${tag.name}`,
      description: `${tag.name} 标签下的文章。`,
      archive: {
        ...tag,
        type: "tag"
      },
      posts: tag.posts
    }));
  }

  for (const category of makeCollection(content.posts, "categories")) {
    await emit(category.path, renderPage(theme, content, config, template, {
      view: "category",
      title: `分类：${category.name}`,
      pageTitle: `分类：${category.name}`,
      description: `${category.name} 分类下的文章。`,
      archive: {
        ...category,
        type: "category"
      },
      posts: category.posts
    }));
  }
}

async function emitNotFound(config, theme, content) {
  const template = chooseTemplate(theme, ["404", "index"]);
  await emit("/404/", renderPage(theme, content, config, template, {
    view: "404",
    title: "页面不存在",
    pageTitle: "页面不存在",
    description: "请求的页面不存在。"
  }));
}

export async function buildSite() {
  const config = await readJson("site.config.json");
  const [content, theme] = await Promise.all([
    loadContent(config),
    loadTheme(config)
  ]);

  await rm("public", { recursive: true, force: true });
  await mkdir("public", { recursive: true });

  if (theme.assetPath) {
    await cp(theme.assetPath, join("public", "assets"), { recursive: true });
  }

  await emitHome(config, theme, content);
  await emitPosts(config, theme, content);
  await emitPages(config, theme, content);
  await emitArchives(config, theme, content);
  await emitNotFound(config, theme, content);
  await writeText(join("public", "feed.xml"), createFeed(config, content.posts));

  console.log(`Built ${content.posts.length} posts and ${content.pages.length} pages with theme ${theme.manifest.name}.`);
}
