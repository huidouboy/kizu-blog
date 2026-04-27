import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { markdownToHtml } from "../core/markdown.mjs";
import { createRenderer } from "../core/template.mjs";
import { chooseTemplate, loadTheme } from "../core/theme.mjs";
import { formatDate, readingTime, slugify, stripHtml } from "../core/utils.mjs";

function postPath(item, settings) {
  return item.type === "page"
    ? `/${item.slug}/`
    : (settings.permalink || "/posts/:slug/").replace(":slug", item.slug);
}

function normalizeItem(item, settings, users = []) {
  const html = markdownToHtml(item.body || "");
  const date = item.date || item.createdAt;
  const author = users.find((user) => user.id === item.authorId);

  return {
    ...item,
    path: postPath(item, settings),
    url: postPath(item, settings),
    html,
    text: stripHtml(html),
    displayDate: formatDate(date, settings.language || "zh-CN"),
    readingTime: readingTime(item.body || ""),
    author: author ? {
      id: author.id,
      name: author.displayName,
      bio: author.bio || "",
      website: author.website || ""
    } : {
      id: "",
      name: settings.author?.name || "",
      bio: settings.author?.bio || "",
      website: ""
    },
    excerpt: item.excerpt || item.description || stripHtml(html).slice(0, 150),
    description: item.description || item.excerpt || stripHtml(html).slice(0, 150)
  };
}

function collection(posts, key) {
  const bucket = new Map();

  for (const post of posts) {
    for (const value of post[key] || []) {
      const slug = slugify(value);
      if (!bucket.has(slug)) {
        bucket.set(slug, { name: value, slug, path: `/${key}/${slug}/`, posts: [] });
      }
      bucket.get(slug).posts.push(post);
    }
  }

  return [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function publicContent(db) {
  const posts = db.posts
    .filter((post) => post.status === "published")
    .map((post) => normalizeItem(post, db.settings, db.users))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const pages = db.pages
    .filter((page) => page.status === "published")
    .map((page) => normalizeItem(page, db.settings, db.users))
    .sort((a, b) => a.title.localeCompare(b.title, db.settings.language || "zh-CN"));

  return { posts, pages };
}

function layoutData(db, theme, content, extra = {}) {
  const tags = collection(content.posts, "tags");
  const categories = collection(content.posts, "categories");

  return {
    site: {
      ...db.settings,
      year: new Date().getFullYear()
    },
    theme: theme.config,
    collections: { tags, categories },
    navigation: db.settings.navigation || [],
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

function renderWith(theme, db, content, template, extra) {
  const render = createRenderer(theme.partials);
  return render(template, layoutData(db, theme, content, extra));
}

function paginate(items, perPage) {
  const pages = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages.length ? pages : [[]];
}

function feedXml(db, posts) {
  const items = posts.slice(0, 20).map((post) => `  <item>
    <title><![CDATA[${post.title}]]></title>
    <link>${db.settings.url}${post.path}</link>
    <guid>${db.settings.url}${post.path}</guid>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <description><![CDATA[${post.description}]]></description>
  </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${db.settings.title}</title>
  <link>${db.settings.url}</link>
  <description>${db.settings.description}</description>
${items}
</channel>
</rss>`;
}

async function renderNotFound(db, theme, content) {
  const template = chooseTemplate(theme, ["404", "index"]);
  return {
    status: 404,
    type: "text/html; charset=utf-8",
    body: renderWith(theme, db, content, template, {
      view: "404",
      title: "页面不存在",
      pageTitle: "页面不存在",
      description: "请求的页面不存在。"
    })
  };
}

export async function renderPublicRoute(db, pathname, user = null) {
  const content = publicContent(db);
  const settings = {
    ...db.settings,
    theme: user?.theme || db.settings.theme
  };
  let theme;
  try {
    theme = await loadTheme(settings);
  } catch {
    theme = await loadTheme(db.settings);
  }

  if (pathname === "/feed.xml") {
    return { status: 200, type: "application/xml; charset=utf-8", body: feedXml(db, content.posts) };
  }

  if (pathname === "/" || /^\/page\/\d+\/?$/.test(pathname)) {
    const match = pathname.match(/^\/page\/(\d+)\/?$/);
    const pageNumber = match ? Number.parseInt(match[1], 10) : 1;
    const perPage = db.settings.pagination?.perPage || 6;
    const pages = paginate(content.posts, perPage);
    const pagePosts = pages[pageNumber - 1];

    if (!pagePosts) {
      return renderNotFound(db, theme, content);
    }

    const template = chooseTemplate(theme, ["home", "index"]);
    return {
      status: 200,
      type: "text/html; charset=utf-8",
      body: renderWith(theme, db, content, template, {
        view: "home",
        title: db.settings.title,
        pageTitle: "首页",
        description: db.settings.description,
        posts: pagePosts,
        pagination: {
          current: pageNumber,
          total: pages.length,
          hasPrev: pageNumber > 1,
          hasNext: pageNumber < pages.length,
          prevPath: pageNumber === 2 ? "/" : `/page/${pageNumber - 1}/`,
          nextPath: `/page/${pageNumber + 1}/`
        }
      })
    };
  }

  const postMatch = pathname.match(/^\/posts\/([^/]+)\/?$/);
  if (postMatch) {
    const post = content.posts.find((item) => item.slug === decodeURIComponent(postMatch[1]));
    if (!post) {
      return renderNotFound(db, theme, content);
    }

    const template = chooseTemplate(theme, [`post-${post.slug}`, "post", "singular", "index"]);
    return {
      status: 200,
      type: "text/html; charset=utf-8",
      body: renderWith(theme, db, content, template, {
        view: "post",
        title: post.title,
        pageTitle: post.title,
        description: post.description,
        post
      })
    };
  }

  if (pathname === "/archives/" || pathname === "/archives") {
    const template = chooseTemplate(theme, ["archive", "index"]);
    return {
      status: 200,
      type: "text/html; charset=utf-8",
      body: renderWith(theme, db, content, template, {
        view: "archive",
        title: "归档",
        pageTitle: "归档",
        description: "所有文章按时间排列。",
        archive: { name: "归档", type: "archive", posts: content.posts },
        posts: content.posts
      })
    };
  }

  const taxMatch = pathname.match(/^\/(tags|categories)\/([^/]+)\/?$/);
  if (taxMatch) {
    const [, key, rawSlug] = taxMatch;
    const items = collection(content.posts, key);
    const archive = items.find((item) => item.slug === decodeURIComponent(rawSlug));
    if (!archive) {
      return renderNotFound(db, theme, content);
    }

    const template = chooseTemplate(theme, ["archive", "index"]);
    return {
      status: 200,
      type: "text/html; charset=utf-8",
      body: renderWith(theme, db, content, template, {
        view: key === "tags" ? "tag" : "category",
        title: archive.name,
        pageTitle: archive.name,
        description: `${archive.name} 下的文章。`,
        archive: { ...archive, type: key === "tags" ? "tag" : "category" },
        posts: archive.posts
      })
    };
  }

  const pageSlug = pathname.replace(/^\/+|\/+$/g, "");
  const page = content.pages.find((item) => item.slug === pageSlug);
  if (page) {
    const template = chooseTemplate(theme, [`page-${page.slug}`, "page", "singular", "index"]);
    return {
      status: 200,
      type: "text/html; charset=utf-8",
      body: renderWith(theme, db, content, template, {
        view: "page",
        title: page.title,
        pageTitle: page.title,
        description: page.description,
        page
      })
    };
  }

  return renderNotFound(db, theme, content);
}

export async function readAdminIndex() {
  return readFile(join("admin", "index.html"), "utf8");
}
