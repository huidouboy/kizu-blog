import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import nodePath from "node:path";

import {
  collectPluginHtml,
  createSlug,
  loadActiveTheme,
  loadPlugins,
  loadPages,
  loadPosts,
  renderTemplate,
  runPluginHook,
  transformMarkdownWithPlugins,
  type LoadedTheme,
  type PageContent,
  type PostContent,
} from "@static-blog/core";
import type {
  ContentObject,
  NavigationItem,
  Plugin,
  PluginContext,
  RenderContext,
  RenderListItem,
  SiteConfig,
  TemplateSite,
  ThemeSettings,
} from "@static-blog/types";

export interface BuildSiteOptions {
  rootDir?: string;
  includeDrafts?: boolean;
}

export interface BuildSiteResult {
  outDir: string;
  posts: number;
  pages: number;
  theme: string;
  plugins: number;
}

interface BuildRenderContext {
  rootDir: string;
  outDir: string;
  site: SiteConfig;
  theme: LoadedTheme;
  plugins: Plugin[];
  posts: PostContent[];
  pages: PageContent[];
  tagGroups: TagGroup[];
}

interface BuildPluginContext {
  rootDir: string;
  outDir: string;
  site: SiteConfig;
  posts: PostContent[];
  pages: PageContent[];
}

interface TagGroup {
  name: string;
  slug: string;
  posts: PostContent[];
}

export async function buildSite(options: BuildSiteOptions = {}): Promise<BuildSiteResult> {
  const rootDir = nodePath.resolve(options.rootDir ?? process.cwd());
  const configPath = nodePath.join(rootDir, "config", "site.json");
  const contentDir = nodePath.join(rootDir, "content");
  const outDir = nodePath.join(rootDir, "dist");

  assertInsideRoot(rootDir, outDir);

  const site = await loadSiteConfig(configPath);
  const plugins = await loadPlugins({ rootDir });
  const buildStartContext: BuildPluginContext = {
    rootDir,
    outDir,
    site,
    posts: [],
    pages: [],
  };

  await runPluginHook(plugins, "onBuildStart", createPluginContext(buildStartContext));

  const [theme, posts, pages] = await Promise.all([
    loadActiveTheme({ rootDir }),
    loadPosts({ contentDir, includeDrafts: options.includeDrafts }),
    loadPages({ contentDir, includeDrafts: options.includeDrafts }),
  ]);
  const tagGroups = createTagGroups(posts);
  const context: BuildRenderContext = {
    rootDir,
    outDir,
    site,
    theme,
    plugins,
    posts,
    pages,
    tagGroups,
  };

  await rm(outDir, { recursive: true, force: true });
  await copyThemeStyles(theme, outDir);
  await writeHtmlFile(nodePath.join(outDir, "index.html"), await renderHomePage(context));
  await writeHtmlFile(
    nodePath.join(outDir, "archive", "index.html"),
    await renderArchivePage(context),
  );

  await Promise.all([
    ...posts.map(async (post) =>
      writeHtmlFile(
        nodePath.join(outDir, "posts", post.slug, "index.html"),
        await renderPostPage(context, post),
      ),
    ),
    ...pages.map(async (page) =>
      writeHtmlFile(
        nodePath.join(outDir, "pages", page.slug, "index.html"),
        await renderStaticPage(context, page),
      ),
    ),
    ...tagGroups.map(async (tagGroup) =>
      writeHtmlFile(
        nodePath.join(outDir, "tags", tagGroup.slug, "index.html"),
        await renderTagPage(context, tagGroup),
      ),
    ),
  ]);

  await writeHtmlFile(nodePath.join(outDir, "sitemap.xml"), renderSitemap(context));

  await runPluginHook(plugins, "onBuildEnd", createPluginContext(context));

  return {
    outDir,
    posts: posts.length,
    pages: pages.length,
    theme: theme.name,
    plugins: plugins.length,
  };
}

async function loadSiteConfig(configPath: string): Promise<SiteConfig> {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Missing site config: ${configPath}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${configPath}: invalid JSON in site config. ${error.message}`);
    }

    throw error;
  }

  if (!isRecord(parsedConfig)) {
    throw new Error(`${configPath}: expected a JSON object.`);
  }

  if (typeof parsedConfig.title !== "string" || !parsedConfig.title.trim()) {
    throw new Error(`${configPath}: expected "title" to be a non-empty string.`);
  }

  return {
    title: parsedConfig.title.trim(),
    description: optionalString(parsedConfig.description, "description", configPath),
    author: optionalString(parsedConfig.author, "author", configPath),
    baseUrl: optionalString(parsedConfig.baseUrl, "baseUrl", configPath),
    url: optionalString(parsedConfig.url, "url", configPath),
    language: optionalString(parsedConfig.language, "language", configPath),
    postsDir: optionalString(parsedConfig.postsDir, "postsDir", configPath),
    pagesDir: optionalString(parsedConfig.pagesDir, "pagesDir", configPath),
    theme: optionalString(parsedConfig.theme, "theme", configPath),
    navigation: optionalNavigation(parsedConfig.navigation, configPath),
  };
}

async function renderHomePage(context: BuildRenderContext): Promise<string> {
  const content = createHomeContent(context);
  const renderContext = createRenderContext(context, content, "/");

  return renderThemeTemplate(context.theme.layouts.home, context, renderContext, {
    home: {
      posts: renderPostList(renderContext.posts, ""),
      pages: renderPageList(renderContext.pages, ""),
      tags: renderTagCloud(context.tagGroups, ""),
    },
  });
}

function renderTagCloud(tagGroups: TagGroup[], hrefPrefix: string): string {
  if (tagGroups.length === 0) {
    return `<span>No tags yet.</span>`;
  }

  return tagGroups
    .map(
      (tagGroup) =>
        `<a href="${escapeAttribute(`${hrefPrefix}tags/${encodeRouteSegment(tagGroup.slug)}/index.html`)}">${escapeHtml(
          tagGroup.name,
        )}</a>`,
    )
    .join("\n");
}

async function renderPostPage(context: BuildRenderContext, post: PostContent): Promise<string> {
  const content = await createPostContent(context, post, context.posts.indexOf(post));
  const renderContext = createRenderContext(context, content, `/posts/${post.slug}/`);

  return renderThemeTemplate(context.theme.layouts.post, context, renderContext, {
    post: renderContext.content,
  });
}

async function renderTagPage(context: BuildRenderContext, tagGroup: TagGroup): Promise<string> {
  if (!context.theme.layouts.tag) {
    return renderArchivePage(context);
  }

  const content = createTagContent(tagGroup);
  const renderContext = createRenderContext(context, content, `/tags/${tagGroup.slug}/`);

  return renderThemeTemplate(context.theme.layouts.tag, context, renderContext, {
    tag: {
      name: escapeHtml(tagGroup.name),
      posts: renderPostList(tagGroup.posts.map(createPostListItem), "../../"),
    },
  });
}

async function renderStaticPage(
  context: BuildRenderContext,
  page: PageContent,
): Promise<string> {
  const content = await createPageContent(context, page);
  const renderContext = createRenderContext(context, content, `/pages/${page.slug}/`);

  return renderThemeTemplate(context.theme.layouts.page, context, renderContext, {
    page: renderContext.content,
  });
}

async function renderArchivePage(context: BuildRenderContext): Promise<string> {
  const content = createArchiveContent(context);
  const renderContext = createRenderContext(context, content, "/archive/");

  return renderThemeTemplate(context.theme.layouts.archive, context, renderContext, {
    archive: {
      posts: renderPostList(renderContext.posts, "../"),
    },
  });
}

async function renderThemeTemplate(
  template: string,
  buildContext: BuildRenderContext,
  context: RenderContext,
  aliases: Record<string, unknown> = {},
): Promise<string> {
  const renderedHtml = renderTemplate(template, {
    ...context,
    ...aliases,
  });
  const pluginContext = createPluginContext(buildContext, context.path, context);
  const headHtml = await collectPluginHtml(buildContext.plugins, "injectHead", pluginContext);
  const bodyEndHtml = await collectPluginHtml(buildContext.plugins, "injectBodyEnd", pluginContext);

  return injectBodyEndHtml(injectHeadHtml(renderedHtml, headHtml), bodyEndHtml);
}

function createRenderContext(
  context: BuildRenderContext,
  content: ContentObject,
  path: string,
): RenderContext {
  return {
    site: createTemplateSite(context.site, path),
    content,
    theme: createThemeSettings(context),
    posts: context.posts.map(createPostListItem),
    pages: context.pages.map(createPageListItem),
    path,
  };
}

function createTemplateSite(site: SiteConfig, path: string): TemplateSite {
  return {
    title: escapeHtml(site.title),
    description: escapeHtml(site.description ?? ""),
    author: escapeHtml(site.author ?? ""),
    baseUrl: escapeHtml(site.baseUrl ?? site.url ?? ""),
    url: site.url ? escapeHtml(site.url) : undefined,
    language: escapeHtml(site.language ?? "en"),
    postsDir: site.postsDir ? escapeHtml(site.postsDir) : undefined,
    pagesDir: site.pagesDir ? escapeHtml(site.pagesDir) : undefined,
    theme: site.theme ? escapeHtml(site.theme) : undefined,
    navigation: renderNavigation(site.navigation ?? defaultNavigation(), path),
  };
}

function createThemeSettings(context: BuildRenderContext): ThemeSettings {
  return Object.fromEntries(
    Object.entries({
      accentColor: "#7c3aed",
      layout: "classic",
      showSidebar: "true",
      animation: "fade",
      ...context.theme.settings,
    }).map(([key, value]) => [key, escapeHtml(value)]),
  );
}

function createHomeContent(context: BuildRenderContext): ContentObject {
  return {
    title: escapeHtml(context.site.title),
    content: renderHomeContent(context),
    date: "",
    tags: "",
    description: escapeHtml(context.site.description ?? ""),
    slug: "",
    type: "home",
    url: "index.html",
    readingTime: "",
    previousPost: "",
    nextPost: "",
  };
}

async function createPostContent(
  context: BuildRenderContext,
  post: PostContent,
  postIndex: number,
): Promise<ContentObject> {
  const path = `/posts/${post.slug}/`;
  const rawBody = await transformMarkdownWithPlugins(
    context.plugins,
    post.rawBody,
    createPluginContext(context, path),
  );

  return {
    title: escapeHtml(post.frontmatter.title),
    content: renderMarkdownToHtml(rawBody),
    date: escapeHtml(post.frontmatter.date),
    tags: renderTagLinks(post.frontmatter.tags, "../../"),
    description: escapeHtml(post.frontmatter.description ?? ""),
    slug: escapeHtml(post.slug),
    type: "post",
    url: `posts/${encodeRouteSegment(post.slug)}/index.html`,
    readingTime: calculateReadingTime(rawBody),
    previousPost: renderAdjacentPostLink(context.posts[postIndex - 1], "Previous", "../../"),
    nextPost: renderAdjacentPostLink(context.posts[postIndex + 1], "Next", "../../"),
  };
}

async function createPageContent(
  context: BuildRenderContext,
  page: PageContent,
): Promise<ContentObject> {
  const path = `/pages/${page.slug}/`;
  const rawBody = await transformMarkdownWithPlugins(
    context.plugins,
    page.rawBody,
    createPluginContext(context, path),
  );

  return {
    title: escapeHtml(page.frontmatter.title),
    content: renderMarkdownToHtml(rawBody),
    date: "",
    tags: "",
    description: escapeHtml(page.frontmatter.description ?? ""),
    slug: escapeHtml(page.slug),
    type: "page",
    url: `pages/${encodeRouteSegment(page.slug)}/index.html`,
    readingTime: calculateReadingTime(rawBody),
    previousPost: "",
    nextPost: "",
  };
}

function createArchiveContent(context: BuildRenderContext): ContentObject {
  return {
    title: "Archive",
    content: `<ul class="content-list">\n${renderPostList(context.posts.map(createPostListItem), "../")}\n</ul>`,
    date: "",
    tags: "",
    description: escapeHtml(context.site.description ?? ""),
    slug: "archive",
    type: "archive",
    url: "archive/index.html",
    readingTime: "",
    previousPost: "",
    nextPost: "",
  };
}

function createTagContent(tagGroup: TagGroup): ContentObject {
  return {
    title: `Tag: ${escapeHtml(tagGroup.name)}`,
    content: `<ul class="content-list">\n${renderPostList(tagGroup.posts.map(createPostListItem), "../../")}\n</ul>`,
    date: "",
    tags: escapeHtml(tagGroup.name),
    description: `Posts tagged ${escapeHtml(tagGroup.name)}`,
    slug: escapeHtml(tagGroup.slug),
    type: "tag",
    url: `tags/${encodeRouteSegment(tagGroup.slug)}/index.html`,
    readingTime: "",
    previousPost: "",
    nextPost: "",
  };
}

function createPostListItem(post: PostContent): RenderListItem {
  return {
    title: escapeHtml(post.frontmatter.title),
    slug: escapeHtml(post.slug),
    url: `posts/${encodeRouteSegment(post.slug)}/index.html`,
    date: escapeHtml(post.frontmatter.date),
    description: escapeHtml(post.frontmatter.description ?? ""),
    tags: escapeHtml(post.frontmatter.tags.join(", ")),
  };
}

function createPageListItem(page: PageContent): RenderListItem {
  return {
    title: escapeHtml(page.frontmatter.title),
    slug: escapeHtml(page.slug),
    url: `pages/${encodeRouteSegment(page.slug)}/index.html`,
    date: "",
    description: escapeHtml(page.frontmatter.description ?? ""),
    tags: "",
  };
}

function renderHomeContent(context: BuildRenderContext): string {
  return `<section>
  <h2>Posts</h2>
  <ul class="content-list">
${renderPostList(context.posts.map(createPostListItem), "")}
  </ul>
</section>`;
}

function renderPostList(posts: RenderListItem[], hrefPrefix: string): string {
  if (posts.length === 0) {
    return `<li>No posts yet.</li>`;
  }

  return posts
    .map((post) => {
      const summary = post.description
        ? `  <span class="summary">${post.description}</span>\n`
        : "";

      return `<li>
  <a href="${escapeAttribute(`${hrefPrefix}${post.url}`)}">${post.title}</a>
  <time datetime="${escapeAttribute(post.date)}">${post.date}</time>
${summary}</li>`;
    })
    .join("\n");
}

function renderPageList(pages: RenderListItem[], hrefPrefix: string): string {
  if (pages.length === 0) {
    return `<li>No pages yet.</li>`;
  }

  return pages
    .map(
      (page) => `<li><a href="${escapeAttribute(`${hrefPrefix}${page.url}`)}">${page.title}</a></li>`,
    )
    .join("\n");
}

function createTagGroups(posts: PostContent[]): TagGroup[] {
  const groups = new Map<string, TagGroup>();

  for (const post of posts) {
    for (const tag of post.frontmatter.tags) {
      const slug = createSlug(tag);

      if (!slug) {
        continue;
      }

      const existingGroup = groups.get(slug);

      if (existingGroup) {
        existingGroup.posts.push(post);
      } else {
        groups.set(slug, {
          name: tag,
          slug,
          posts: [post],
        });
      }
    }
  }

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function renderTagLinks(tags: string[], hrefPrefix: string): string {
  if (tags.length === 0) {
    return "";
  }

  return tags
    .map((tag) => {
      const tagSlug = createSlug(tag);
      const href = `${hrefPrefix}tags/${encodeRouteSegment(tagSlug)}/index.html`;

      return `<a href="${escapeAttribute(href)}">${escapeHtml(tag)}</a>`;
    })
    .join(" ");
}

function renderAdjacentPostLink(
  post: PostContent | undefined,
  label: string,
  hrefPrefix: string,
): string {
  if (!post) {
    return "";
  }

  return `<a href="${escapeAttribute(`${hrefPrefix}posts/${encodeRouteSegment(post.slug)}/index.html`)}"><span>${escapeHtml(label)}</span>${escapeHtml(post.frontmatter.title)}</a>`;
}

function calculateReadingTime(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()-]/g, " ")
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 220));

  return `${minutes} min read`;
}

function renderNavigation(items: NavigationItem[], currentPath: string): string {
  if (items.length === 0) {
    return "";
  }

  return `<nav class="site-nav" aria-label="Primary navigation">
${items
  .map((item) => {
    const href = routeToRelativeHref(item.url, currentPath);
    const isCurrent = normalizeRoutePath(item.url) === normalizeRoutePath(currentPath);
    const ariaCurrent = isCurrent ? ` aria-current="page"` : "";

    return `  <a href="${escapeAttribute(href)}"${ariaCurrent}>${escapeHtml(item.label)}</a>`;
  })
  .join("\n")}
</nav>`;
}

function defaultNavigation(): NavigationItem[] {
  return [
    { label: "Home", url: "/" },
    { label: "Archive", url: "/archive/" },
  ];
}

function routeToRelativeHref(targetUrl: string, currentPath: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(targetUrl) || targetUrl.startsWith("#")) {
    return targetUrl;
  }

  const normalizedTarget = normalizeRoutePath(targetUrl);
  const prefix = "../".repeat(getRouteDepth(currentPath));

  if (normalizedTarget === "/") {
    return `${prefix}index.html`;
  }

  return `${prefix}${normalizedTarget.replace(/^\/|\/$/g, "")}/index.html`;
}

function normalizeRoutePath(path: string): string {
  if (!path || path === "index.html") {
    return "/";
  }

  const withoutIndex = path.replace(/index\.html$/i, "");
  const withLeadingSlash = withoutIndex.startsWith("/") ? withoutIndex : `/${withoutIndex}`;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function getRouteDepth(path: string): number {
  const normalizedPath = normalizeRoutePath(path);

  if (normalizedPath === "/") {
    return 0;
  }

  return normalizedPath.replace(/^\/|\/$/g, "").split("/").length;
}

function renderSitemap(context: BuildRenderContext): string {
  const routes = [
    { path: "/", lastmod: "" },
    { path: "/archive/", lastmod: "" },
    ...context.posts.map((post) => ({
      path: `/posts/${post.slug}/`,
      lastmod: post.frontmatter.date,
    })),
    ...context.pages.map((page) => ({
      path: `/pages/${page.slug}/`,
      lastmod: "",
    })),
    ...context.tagGroups.map((tagGroup) => ({
      path: `/tags/${tagGroup.slug}/`,
      lastmod: "",
    })),
  ];
  const urls = routes
    .map((route) => {
      const lastmod = route.lastmod ? `\n    <lastmod>${escapeXml(route.lastmod)}</lastmod>` : "";

      return `  <url>
    <loc>${escapeXml(toAbsoluteUrl(context.site, route.path))}</loc>${lastmod}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function toAbsoluteUrl(site: SiteConfig, path: string): string {
  const baseUrl = (site.baseUrl ?? site.url ?? "").replace(/\/+$/g, "");

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl}${path}`;
}

function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const paragraph: string[] = [];
  let inList = false;
  let inCodeBlock = false;
  let codeBlock: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  const closeList = () => {
    if (!inList) {
      return;
    }

    html.push("</ul>");
    inList = false;
  };

  const flushCodeBlock = () => {
    html.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
    codeBlock = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeList();

      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }

      continue;
    }

    if (inCodeBlock) {
      codeBlock.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);

    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;

      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
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

  if (inCodeBlock) {
    flushCodeBlock();
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

function createPluginContext(
  context: BuildPluginContext,
  path?: string,
  render?: RenderContext,
): PluginContext {
  return {
    rootDir: context.rootDir,
    outDir: context.outDir,
    site: context.site,
    posts: context.posts.map(createRawPostListItem),
    pages: context.pages.map(createRawPageListItem),
    path,
    render,
  };
}

function createRawPostListItem(post: PostContent): RenderListItem {
  return {
    title: post.frontmatter.title,
    slug: post.slug,
    url: `/posts/${post.slug}/`,
    date: post.frontmatter.date,
    description: post.frontmatter.description ?? "",
    tags: post.frontmatter.tags.join(", "),
  };
}

function createRawPageListItem(page: PageContent): RenderListItem {
  return {
    title: page.frontmatter.title,
    slug: page.slug,
    url: `/pages/${page.slug}/`,
    date: "",
    description: page.frontmatter.description ?? "",
    tags: "",
  };
}

function injectHeadHtml(html: string, headHtml: string): string {
  if (!headHtml) {
    return html;
  }

  if (!html.includes("</head>")) {
    return `${headHtml}\n${html}`;
  }

  return html.replace("</head>", `${headHtml}\n</head>`);
}

function injectBodyEndHtml(html: string, bodyEndHtml: string): string {
  if (!bodyEndHtml) {
    return html;
  }

  if (!html.includes("</body>")) {
    return `${html}\n${bodyEndHtml}`;
  }

  return html.replace("</body>", `${bodyEndHtml}\n</body>`);
}

async function copyThemeStyles(theme: LoadedTheme, outDir: string): Promise<void> {
  const stylesDir = nodePath.join(theme.rootDir, "styles");
  const themeAssetsDir = nodePath.join(outDir, "assets", "theme");

  try {
    await cp(stylesDir, themeAssetsDir, { recursive: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function writeHtmlFile(filePath: string, html: string): Promise<void> {
  await mkdir(nodePath.dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");
}

function assertInsideRoot(rootDir: string, targetPath: string): void {
  const relativePath = nodePath.relative(rootDir, targetPath);

  if (relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    throw new Error(`Refusing to write outside project root: ${targetPath}`);
  }
}

function encodeRouteSegment(segment: string): string {
  return segment.split("/").map(encodeURIComponent).join("/");
}

function optionalString(value: unknown, key: string, filePath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${filePath}: expected "${key}" to be a string.`);
  }

  const trimmedValue = value.trim();

  return trimmedValue || undefined;
}

function optionalNavigation(value: unknown, filePath: string): NavigationItem[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${filePath}: expected "navigation" to be an array.`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${filePath}: expected "navigation.${index}" to be an object.`);
    }

    const label = optionalString(item.label, `navigation.${index}.label`, filePath);
    const url = optionalString(item.url, `navigation.${index}.url`, filePath);

    if (!label || !url) {
      throw new Error(`${filePath}: expected "navigation.${index}" to include label and url.`);
    }

    return { label, url };
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
