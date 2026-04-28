import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";

import {
  createSlug,
  loadActiveTheme,
  loadPages,
  loadPosts,
  renderTemplate,
} from "../packages/core/dist/index.js";
import { buildSite } from "../packages/cli/dist/build.js";
import {
  ensureInitialSampleContentForRoot,
  validateAdminSlug,
} from "../apps/admin/dist/index.js";

const rootDir = process.cwd();

const files = {
  home: "dist/index.html",
  archive: "dist/archive/index.html",
  post: "dist/posts/hello-world/index.html",
  page: "dist/pages/about/index.html",
  rss: "dist/rss.xml",
  search: "dist/search-index.json",
  sitemap: "dist/sitemap.xml",
  tag: "dist/tags/markdown/index.html",
  tokens: "dist/assets/theme/tokens.css",
  global: "dist/assets/theme/global.css",
};

const contents = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(join(rootDir, path), "utf8"),
    ]),
  ),
);

assertIncludes(contents.home, 'data-content-type="home"', files.home);
assertIncludes(contents.archive, 'data-content-type="archive"', files.archive);
assertIncludes(contents.post, 'data-content-type="post"', files.post);
assertIncludes(contents.page, 'data-content-type="page"', files.page);
assertIncludes(contents.home, 'data-path="/"', files.home);
assertIncludes(contents.archive, 'data-path="/archive/"', files.archive);
assertIncludes(contents.post, 'data-path="/posts/hello-world/"', files.post);
assertIncludes(contents.page, 'data-path="/pages/about/"', files.page);
assertIncludes(contents.home, "layout-classic sidebar-true animation-fade", files.home);
assertIncludes(contents.home, "--theme-accent-color: #7c3aed", files.home);
assertIncludes(contents.home, 'data-i18n="personalBlogPrefix"', files.home);
assertIncludes(contents.home, "Static Author", files.home);
assertIncludes(contents.home, 'data-i18n="search"', files.home);
assertIncludes(contents.home, "data-search-open", files.home);
assertIncludes(contents.home, 'role="dialog"', files.home);
assertIncludes(contents.home, "data-search-input", files.home);
assertIncludes(contents.home, "Cmd", files.home);
assertNotIncludes(contents.home, "search-box", files.home);
assertIncludes(contents.home, "首页", files.home);
assertIncludes(contents.home, "pages/about/index.html", files.home);
assertIncludes(contents.home, "tags/markdown/index.html", files.home);
assertIncludes(contents.post, "Hello World", files.post);
assertIncludes(contents.post, "data-i18n-reading-time", files.post);
assertIncludes(contents.post, "Static-first Notes", files.post);
assertIncludes(contents.page, "About", files.page);
assertIncludes(contents.tag, 'data-content-type="tag"', files.tag);
assertIncludes(contents.tag, 'data-i18n="tag"', files.tag);
assertIncludes(contents.tag, "markdown", files.tag);
assertIncludes(contents.home, 'meta name="generator" content="Static Blog Engine"', files.home);
assertIncludes(contents.post, 'meta name="static-blog:path" content="/posts/hello-world/"', files.post);
assertIncludes(contents.rss, "<rss version=\"2.0\">", files.rss);
assertIncludes(contents.rss, "<title>Hello World</title>", files.rss);
assertIncludes(contents.rss, "https://example.com/posts/hello-world/", files.rss);
assertIncludes(contents.search, '"title": "Hello World"', files.search);
assertIncludes(contents.search, '"url": "/posts/hello-world/"', files.search);
assertIncludes(contents.sitemap, "https://example.com/posts/hello-world/", files.sitemap);
assertIncludes(contents.sitemap, "https://example.com/tags/markdown/", files.sitemap);
assertIncludes(contents.tokens, "--radius-lg", files.tokens);
assertIncludes(contents.tokens, "--shadow-md", files.tokens);
assertIncludes(contents.global, ".sidebar-false", files.global);
assertIncludes(contents.global, ".animation-fade", files.global);
assertIncludes(contents.global, ".search-overlay", files.global);
assertIncludes(contents.global, ".search-panel", files.global);
assertIncludes(contents.global, ".site-header.is-hidden", files.global);
assertIncludes(contents.tokens, "cubic-bezier(0.22, 1, 0.36, 1)", files.tokens);

await validateArchitectureBoundaries();
await validateContentLoading();
await validateThemeLoading();
await validateErrorHandling();
await validateAdminSafetyValidation();
validateAutomaticBrowserLanguage(contents.home);
await validateForcedUiLanguages();
await validateAdminSampleContentSafety();
await validateStaticOutputIsPortable();

for (const [key, content] of Object.entries(contents)) {
  if (content.includes("{{")) {
    throw new Error(`${files[key]} contains an unresolved template variable.`);
  }
}

await validateLegacyTemplateVariables();
await validatePluginHooks();
await validateBaseUrlSubpath();

console.log("Static build validation passed.");

function assertIncludes(content, expected, filePath) {
  if (!content.includes(expected)) {
    throw new Error(`${filePath} does not include expected content: ${expected}`);
  }
}

function assertNotIncludes(content, unexpected, filePath) {
  if (content.includes(unexpected)) {
    throw new Error(`${filePath} includes unexpected content: ${unexpected}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

async function assertRejectsMessage(action, expected, label) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes(expected)) {
      throw new Error(`${label}: expected error to include "${expected}", got "${message}".`);
    }

    return;
  }

  throw new Error(`${label}: expected an error including "${expected}".`);
}

async function validateArchitectureBoundaries() {
  const corePackage = await readJson(join(rootDir, "packages", "core", "package.json"));
  const typesPackage = await readJson(join(rootDir, "packages", "types", "package.json"));
  const coreDeps = Object.keys(corePackage.dependencies ?? {});

  assertEqual(coreDeps.length, 1, "core dependency count");
  assertEqual(coreDeps[0], "@static-blog/types", "core dependency boundary");

  if (typesPackage.dependencies || typesPackage.devDependencies) {
    throw new Error("packages/types must not depend on runtime packages.");
  }

  const coreSource = await readTextTree(join(rootDir, "packages", "core", "src"));
  const typesSource = await readTextTree(join(rootDir, "packages", "types", "src"));

  for (const forbidden of ["apps/admin", "@static-blog/admin", "theme-default", "@static-blog/theme-default"]) {
    if (coreSource.includes(forbidden)) {
      throw new Error(`packages/core must not depend on ${forbidden}.`);
    }
  }

  for (const forbidden of ["@static-blog/core", "@static-blog/cli", "apps/", "packages/core"]) {
    if (typesSource.includes(forbidden)) {
      throw new Error(`packages/types must not depend on ${forbidden}.`);
    }
  }
}

async function validateContentLoading() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-content-loading-"));
  const contentDir = join(projectDir, "content");

  try {
    await mkdir(join(contentDir, "posts"), { recursive: true });
    await mkdir(join(contentDir, "pages"), { recursive: true });
    await writeFile(
      join(contentDir, "posts", "visible-post.md"),
      `---\ntitle: Visible Post\ndate: 2026-04-28\ntags: [release, markdown]\ndraft: false\n---\nVisible body\n`,
    );
    await writeFile(
      join(contentDir, "posts", "draft-post.md"),
      `---\ntitle: Draft Post\ndate: 2026-04-27\ntags: []\ndraft: true\n---\nDraft body\n`,
    );
    await writeFile(
      join(contentDir, "pages", "visible-page.md"),
      `---\ntitle: Visible Page\n---\nVisible page\n`,
    );
    await writeFile(
      join(contentDir, "posts", "invalid-post.md"),
      `---\ntitle: Invalid Post\ndate: nope\ntags: []\ndraft: false\n---\nInvalid body\n`,
    );

    await assertRejectsMessage(
      () => loadPosts({ contentDir, includeDrafts: true }),
      "expected frontmatter \"date\" to be a valid date string",
      "invalid frontmatter",
    );

    await rm(join(contentDir, "posts", "invalid-post.md"), { force: true });

    const visiblePosts = await loadPosts({ contentDir });
    const allPosts = await loadPosts({ contentDir, includeDrafts: true });
    const pages = await loadPages({ contentDir });
    const missingPosts = await loadPosts({ contentDir: join(projectDir, "missing-content") });

    assertEqual(createSlug("Hello, World!"), "hello-world", "slug generation");
    assertEqual(visiblePosts.length, 1, "draft filtering");
    assertEqual(allPosts.length, 2, "includeDrafts post loading");
    assertEqual(pages.length, 1, "page loading");
    assertEqual(missingPosts.length, 0, "missing content directory loading");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateThemeLoading() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-theme-loading-"));

  try {
    await writeMinimalProject(projectDir, {
      themeName: "theme-test",
      manifest: {
        name: "theme-test",
        version: "1.0.0",
        slots: ["main"],
        pages: {
          home: "layouts/home.html",
          post: "layouts/post.html",
          page: "layouts/page.html",
          archive: "layouts/archive.html",
        },
        settings: {
          accentColor: { type: "color", default: "#123456" },
        },
      },
      layouts: {
        "home.html": "<main>{{site.title}} {{content.type}} {{theme.accentColor}} {{path}}</main>",
        "post.html": "<article>{{content.title}}</article>",
        "page.html": "<article>{{content.title}}</article>",
        "archive.html": "<main>{{content.type}}</main>",
      },
      themeConfig: { theme: "theme-test" },
    });

    const theme = await loadActiveTheme({ rootDir: projectDir });
    const rendered = renderTemplate(theme.layouts.home, {
      site: { title: "Theme Site" },
      content: { type: "home" },
      theme: theme.settings,
      path: "/",
    });

    assertEqual(theme.name, "theme-test", "active theme name");
    assertIncludes(rendered, "Theme Site home #123456 /", "render context");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateErrorHandling() {
  const missingSiteDir = await mkdtemp(join(tmpdir(), "static-blog-missing-site-"));

  try {
    await assertRejectsMessage(
      () => buildSite({ rootDir: missingSiteDir }),
      "Missing site config",
      "missing site config",
    );
  } finally {
    await rm(missingSiteDir, { recursive: true, force: true });
  }

  const missingThemeConfigDir = await mkdtemp(join(tmpdir(), "static-blog-missing-theme-config-"));

  try {
    await writeMinimalProject(missingThemeConfigDir, { themeName: "default" });
    await rm(join(missingThemeConfigDir, "config", "theme.json"), { force: true });
    const result = await buildSite({ rootDir: missingThemeConfigDir });

    assertEqual(result.theme, "default", "missing theme config fallback");
  } finally {
    await rm(missingThemeConfigDir, { recursive: true, force: true });
  }

  const invalidThemeDir = await mkdtemp(join(tmpdir(), "static-blog-invalid-theme-"));

  try {
    await writeMinimalProject(invalidThemeDir);
    await writeFile(join(invalidThemeDir, "themes", "test", "theme.json"), "{ bad json");
    await assertRejectsMessage(
      () => buildSite({ rootDir: invalidThemeDir }),
      "invalid JSON in theme manifest",
      "invalid theme json",
    );
  } finally {
    await rm(invalidThemeDir, { recursive: true, force: true });
  }

  const missingLayoutDir = await mkdtemp(join(tmpdir(), "static-blog-missing-layout-"));

  try {
    await writeMinimalProject(missingLayoutDir, {
      layouts: {
        "home.html": "<main>{{site.title}}</main>",
        "post.html": "<article>{{content.title}}</article>",
        "page.html": "<article>{{content.title}}</article>",
      },
    });
    await assertRejectsMessage(
      () => buildSite({ rootDir: missingLayoutDir }),
      "Missing theme layout file",
      "missing layout file",
    );
  } finally {
    await rm(missingLayoutDir, { recursive: true, force: true });
  }

  const missingPluginDir = await mkdtemp(join(tmpdir(), "static-blog-missing-plugin-"));

  try {
    await writeMinimalProject(missingPluginDir, {
      pluginsConfig: { enabled: ["plugin-missing"] },
    });
    await assertRejectsMessage(
      () => buildSite({ rootDir: missingPluginDir }),
      "Missing plugin directory",
      "missing plugin directory",
    );
  } finally {
    await rm(missingPluginDir, { recursive: true, force: true });
  }

  const invalidPluginDir = await mkdtemp(join(tmpdir(), "static-blog-invalid-plugin-"));

  try {
    await writeMinimalProject(invalidPluginDir, {
      pluginsConfig: { enabled: ["plugin-bad"] },
    });
    await mkdir(join(invalidPluginDir, "plugins", "plugin-bad"), { recursive: true });
    await writeFile(
      join(invalidPluginDir, "plugins", "plugin-bad", "plugin.ts"),
      `export default { name: "plugin-bad", hooks: { onBuildStart: "not-a-function" } };`,
    );
    await assertRejectsMessage(
      () => buildSite({ rootDir: invalidPluginDir }),
      "expected a default export",
      "invalid plugin export",
    );
  } finally {
    await rm(invalidPluginDir, { recursive: true, force: true });
  }
}

function validateAdminSafetyValidation() {
  assertEqual(validateAdminSlug("safe-slug-123"), "safe-slug-123", "valid admin slug");

  for (const slug of ["", "Admin", "admin", "../post", "/post", "post/path", "post_path"]) {
    try {
      validateAdminSlug(slug);
    } catch {
      continue;
    }

    throw new Error(`admin safety validation accepted invalid slug: ${JSON.stringify(slug)}`);
  }
}

function validateAutomaticBrowserLanguage(homeHtml) {
  const script = extractFirstInlineScript(homeHtml);
  const zhResult = runAutoLanguageScript(script, ["zh-CN", "en-US"]);
  const enResult = runAutoLanguageScript(script, ["en-US", "en"]);

  assertEqual(zhResult.htmlLang, "zh-CN", "Chinese browser UI locale");
  assertEqual(zhResult.home, "首页", "Chinese browser home label");
  assertEqual(zhResult.archive, "归档", "Chinese browser archive label");
  assertEqual(zhResult.readingTime, "约 3 分钟阅读", "Chinese browser reading time label");
  assertEqual(enResult.htmlLang, "en", "English browser UI locale");
  assertEqual(enResult.home, "Home", "English browser home label");
  assertEqual(enResult.archive, "Archive", "English browser archive label");
  assertEqual(enResult.readingTime, "3 min read", "English browser reading time label");
}

function extractFirstInlineScript(html) {
  const match = /<script>\s*([\s\S]*?)\s*<\/script>/.exec(html);

  if (!match) {
    throw new Error("Auto language script was not found in generated frontend HTML.");
  }

  return match[1];
}

function runAutoLanguageScript(script, languages) {
  const textElements = [
    createFakeElement({ "data-i18n": "home" }, "Home"),
    createFakeElement({ "data-i18n": "archive" }, "Archive"),
  ];
  const readingTimeElements = [
    createFakeElement({ "data-minutes": "3" }, "3 min read"),
  ];
  const documentElement = { lang: "", dataset: {} };
  const document = {
    documentElement,
    readyState: "complete",
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return textElements;
      }

      if (selector === "[data-i18n-reading-time]") {
        return readingTimeElements;
      }

      return [];
    },
    addEventListener() {},
  };

  runInNewContext(script, {
    document,
    navigator: {
      language: languages[0],
      languages,
    },
  });

  return {
    htmlLang: documentElement.lang,
    home: textElements[0].textContent,
    archive: textElements[1].textContent,
    readingTime: readingTimeElements[0].textContent,
  };
}

function createFakeElement(attributes, textContent) {
  return {
    textContent,
    getAttribute(key) {
      return attributes[key] ?? null;
    },
  };
}

async function validateForcedUiLanguages() {
  await validateForcedUiLanguage("zh-CN", {
    body: "User-authored content stays English.",
    expected: ["首页", "归档", "文章", "搜索", "发布于", "阅读时间", "约 1 分钟阅读"],
    title: "English User Post",
  });
  await validateForcedUiLanguage("en", {
    body: "用户自己写的正文会保持原样。",
    expected: ["Home", "Archive", "Posts", "Search", "Published on", "Reading time", "1 min read"],
    title: "中文用户文章",
  });
}

async function validateForcedUiLanguage(language, { body, expected, title }) {
  const projectDir = await mkdtemp(join(tmpdir(), `static-blog-i18n-${language}-`));

  try {
    await writeMinimalProject(projectDir, {
      themeName: "i18n",
      siteConfig: {
        title: "I18n Site",
        description: "Checks localized UI labels.",
        author: "Tester",
        language,
      },
      layouts: {
        "home.html": `<!doctype html><html lang="{{site.language}}"><head><title>{{site.title}}</title>{{ui.script}}</head><body>{{ui.home}} {{ui.archive}} {{ui.posts}} {{ui.search}} {{content.content}}</body></html>`,
        "post.html": `<!doctype html><html lang="{{site.language}}"><head><title>{{content.title}}</title>{{ui.script}}</head><body>{{ui.publishedOn}} {{ui.readingTime}} {{content.readingTime}} {{content.content}}</body></html>`,
        "page.html": `<!doctype html><html><body>{{content.content}}</body></html>`,
        "archive.html": `<!doctype html><html><body>{{ui.archive}} {{content.content}}</body></html>`,
      },
    });
    await writeFile(
      join(projectDir, "content", "posts", "i18n-post.md"),
      `---\ntitle: ${title}\ndate: 2026-04-28\ntags: [i18n]\ndraft: false\n---\n${body}\n`,
    );

    await buildSite({ rootDir: projectDir });

    const homeHtml = await readFile(join(projectDir, "dist", "index.html"), "utf8");
    const postHtml = await readFile(
      join(projectDir, "dist", "posts", "i18n-post", "index.html"),
      "utf8",
    );
    const combinedHtml = `${homeHtml}\n${postHtml}`;

    for (const label of expected) {
      assertIncludes(combinedHtml, label, `${language} UI output`);
    }

    assertIncludes(postHtml, body, `${language} user content preservation`);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateAdminSampleContentSafety() {
  const zhProjectDir = await mkdtemp(join(tmpdir(), "static-blog-admin-sample-zh-"));

  try {
    await ensureInitialSampleContentForRoot(zhProjectDir, "zh-CN");

    const post = await readFile(
      join(zhProjectDir, "content", "posts", "hello-world.md"),
      "utf8",
    );
    const page = await readFile(join(zhProjectDir, "content", "pages", "about.md"), "utf8");

    assertIncludes(post, "你好，世界", "Chinese setup sample post");
    assertIncludes(page, "关于", "Chinese setup sample page");

    if (post.includes("A first sample post") || page.includes("A sample about page")) {
      throw new Error("Chinese admin setup generated English sample content.");
    }
  } finally {
    await rm(zhProjectDir, { recursive: true, force: true });
  }

  const enProjectDir = await mkdtemp(join(tmpdir(), "static-blog-admin-sample-en-"));

  try {
    await ensureInitialSampleContentForRoot(enProjectDir, "en");

    const post = await readFile(
      join(enProjectDir, "content", "posts", "hello-world.md"),
      "utf8",
    );
    const page = await readFile(join(enProjectDir, "content", "pages", "about.md"), "utf8");

    assertIncludes(post, "Hello World", "English setup sample post");
    assertIncludes(page, "About", "English setup sample page");

    if (post.includes("你好，世界") || page.includes("关于")) {
      throw new Error("English admin setup generated Chinese sample content.");
    }
  } finally {
    await rm(enProjectDir, { recursive: true, force: true });
  }

  const existingContentDir = await mkdtemp(join(tmpdir(), "static-blog-admin-sample-safe-"));

  try {
    await mkdir(join(existingContentDir, "content", "posts"), { recursive: true });
    await mkdir(join(existingContentDir, "content", "pages"), { recursive: true });
    await writeFile(
      join(existingContentDir, "content", "posts", "my-real-post.md"),
      `---\ntitle: My Real Post\ndate: 2026-04-28\ntags: []\ndraft: false\n---\nDo not delete this.\n`,
    );

    await ensureInitialSampleContentForRoot(existingContentDir, "zh-CN");

    assertIncludes(
      await readFile(join(existingContentDir, "content", "posts", "my-real-post.md"), "utf8"),
      "Do not delete this.",
      "existing user content",
    );

    if (await pathExists(join(existingContentDir, "content", "posts", "hello-world.md"))) {
      throw new Error("Admin sample generation wrote over a project with existing user content.");
    }
  } finally {
    await rm(existingContentDir, { recursive: true, force: true });
  }
}

async function validateStaticOutputIsPortable() {
  const distText = await readTextTree(join(rootDir, "dist"));

  for (const forbidden of ["apps/admin", "data/admin", "localhost:4173"]) {
    if (distText.includes(forbidden)) {
      throw new Error(`Generated static output unexpectedly references ${forbidden}.`);
    }
  }
}

async function validatePluginHooks() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-plugin-hooks-"));

  try {
    await mkdir(join(projectDir, "config"), { recursive: true });
    await mkdir(join(projectDir, "content", "posts"), { recursive: true });
    await mkdir(join(projectDir, "content", "pages"), { recursive: true });
    await mkdir(join(projectDir, "themes", "test", "layouts"), { recursive: true });
    await mkdir(join(projectDir, "plugins", "plugin-hooks"), { recursive: true });

    await writeFile(
      join(projectDir, "config", "site.json"),
      JSON.stringify({ title: "Hook Site", description: "Hook check", language: "en" }),
    );
    await writeFile(
      join(projectDir, "config", "theme.json"),
      JSON.stringify({ theme: "test" }),
    );
    await writeFile(
      join(projectDir, "config", "plugins.json"),
      JSON.stringify({ enabled: ["plugin-hooks"] }),
    );
    await writeFile(
      join(projectDir, "content", "posts", "hook-post.md"),
      `---\ntitle: Hook Post\ndate: 2026-04-28\ntags: []\ndraft: false\n---\nOriginal body\n`,
    );
    await writeFile(
      join(projectDir, "themes", "test", "theme.json"),
      JSON.stringify({
        name: "test",
        version: "1.0.0",
        slots: ["main"],
        pages: {
          home: "layouts/home.html",
          post: "layouts/post.html",
          page: "layouts/page.html",
          archive: "layouts/archive.html",
        },
      }),
    );
    await writeFile(
      join(projectDir, "themes", "test", "layouts", "home.html"),
      `<!doctype html><html><head><title>{{site.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "test", "layouts", "post.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "test", "layouts", "page.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "test", "layouts", "archive.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "plugins", "plugin-hooks", "plugin.ts"),
      `import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "@static-blog/types";

const plugin: Plugin = {
  name: "plugin-hooks",
  hooks: {
    async onBuildStart(context) {
      if (!context) return;
      await writeFile(join(context.rootDir, "hook-start.txt"), "started", "utf8");
    },
    transformMarkdown(content) {
      return content + "\\n\\nTransformed by plugin.";
    },
    injectHead() {
      return '<meta name="hook-head" content="ok">';
    },
    injectBodyEnd() {
      return '<script type="application/json" id="hook-body">{"ok":true}</script>';
    },
    async onBuildEnd(context) {
      if (!context) return;
      await mkdir(context.outDir, { recursive: true });
      await writeFile(join(context.outDir, "hook-end.txt"), "ended", "utf8");
    },
  },
};

export default plugin;
`,
    );

    await buildSite({ rootDir: projectDir });

    const startMarker = await readFile(join(projectDir, "hook-start.txt"), "utf8");
    const endMarker = await readFile(join(projectDir, "dist", "hook-end.txt"), "utf8");
    const postHtml = await readFile(
      join(projectDir, "dist", "posts", "hook-post", "index.html"),
      "utf8",
    );

    assertIncludes(startMarker, "started", "hook start marker");
    assertIncludes(endMarker, "ended", "hook end marker");
    assertIncludes(postHtml, "Transformed by plugin.", "hook post");
    assertIncludes(postHtml, 'meta name="hook-head" content="ok"', "hook post");
    assertIncludes(postHtml, 'id="hook-body"', "hook post");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateLegacyTemplateVariables() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-legacy-theme-"));

  try {
    await mkdir(join(projectDir, "config"), { recursive: true });
    await mkdir(join(projectDir, "content", "posts"), { recursive: true });
    await mkdir(join(projectDir, "content", "pages"), { recursive: true });
    await mkdir(join(projectDir, "themes", "legacy", "layouts"), { recursive: true });

    await writeFile(
      join(projectDir, "config", "site.json"),
      JSON.stringify({ title: "Legacy Site", description: "Legacy check", language: "en" }),
    );
    await writeFile(
      join(projectDir, "config", "theme.json"),
      JSON.stringify({ theme: "legacy", settings: { accentColor: "#111111" } }),
    );
    await writeFile(
      join(projectDir, "content", "posts", "legacy-post.md"),
      `---\ntitle: Legacy Post\ndate: 2026-04-28\ntags: [old]\ndraft: false\n---\nLegacy body\n`,
    );
    await writeFile(
      join(projectDir, "content", "pages", "legacy-page.md"),
      `---\ntitle: Legacy Page\n---\nLegacy page body\n`,
    );
    await writeFile(
      join(projectDir, "themes", "legacy", "theme.json"),
      JSON.stringify({
        name: "legacy",
        version: "1.0.0",
        slots: ["main"],
        pages: {
          home: "layouts/home.html",
          post: "layouts/post.html",
          page: "layouts/page.html",
          archive: "layouts/archive.html",
        },
      }),
    );
    await writeFile(
      join(projectDir, "themes", "legacy", "layouts", "home.html"),
      `<main data-content-type="{{content.type}}" data-path="{{path}}">{{content.title}}</main>`,
    );
    await writeFile(
      join(projectDir, "themes", "legacy", "layouts", "post.html"),
      `<article data-content-type="{{content.type}}" data-path="{{path}}"><h1>{{post.title}}</h1><p>{{post.date}}</p><p>{{post.tags}}</p>{{post.content}}</article>`,
    );
    await writeFile(
      join(projectDir, "themes", "legacy", "layouts", "page.html"),
      `<article data-content-type="{{content.type}}"><h1>{{page.title}}</h1>{{page.content}}</article>`,
    );
    await writeFile(
      join(projectDir, "themes", "legacy", "layouts", "archive.html"),
      `<main data-content-type="{{content.type}}">{{content.content}}</main>`,
    );

    await buildSite({ rootDir: projectDir });

    const postHtml = await readFile(
      join(projectDir, "dist", "posts", "legacy-post", "index.html"),
      "utf8",
    );
    const pageHtml = await readFile(
      join(projectDir, "dist", "pages", "legacy-page", "index.html"),
      "utf8",
    );
    const archiveHtml = await readFile(join(projectDir, "dist", "archive", "index.html"), "utf8");

    assertIncludes(postHtml, "Legacy Post", "legacy post");
    assertIncludes(postHtml, "Legacy body", "legacy post");
    assertIncludes(postHtml, 'data-path="/posts/legacy-post/"', "legacy post");
    assertIncludes(pageHtml, "Legacy Page", "legacy page");
    assertIncludes(pageHtml, "Legacy page body", "legacy page");
    assertIncludes(archiveHtml, 'data-content-type="archive"', "legacy archive");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateBaseUrlSubpath() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-baseurl-subpath-"));

  try {
    await mkdir(join(projectDir, "config"), { recursive: true });
    await mkdir(join(projectDir, "content", "posts"), { recursive: true });
    await mkdir(join(projectDir, "themes", "subpath", "layouts"), { recursive: true });

    await writeFile(
      join(projectDir, "config", "site.json"),
      JSON.stringify({
        title: "Subpath Site",
        description: "Subpath check",
        language: "en",
        baseUrl: "https://kizu.github.io/static-first-blog-engine",
      }),
    );
    await writeFile(
      join(projectDir, "config", "theme.json"),
      JSON.stringify({ theme: "subpath" }),
    );
    await writeFile(
      join(projectDir, "content", "posts", "subpath-post.md"),
      `---\ntitle: Subpath Post\ndate: 2026-04-28\ntags: []\ndraft: false\n---\nSubpath body\n`,
    );
    await writeFile(
      join(projectDir, "themes", "subpath", "theme.json"),
      JSON.stringify({
        name: "subpath",
        version: "1.0.0",
        slots: ["main"],
        pages: {
          home: "layouts/home.html",
          post: "layouts/post.html",
          page: "layouts/page.html",
          archive: "layouts/archive.html",
        },
      }),
    );
    await writeFile(
      join(projectDir, "themes", "subpath", "layouts", "home.html"),
      `<!doctype html><html><head><title>{{site.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "subpath", "layouts", "post.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "subpath", "layouts", "page.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );
    await writeFile(
      join(projectDir, "themes", "subpath", "layouts", "archive.html"),
      `<!doctype html><html><head><title>{{content.title}}</title></head><body>{{content.content}}</body></html>`,
    );

    await buildSite({ rootDir: projectDir });

    const sitemap = await readFile(join(projectDir, "dist", "sitemap.xml"), "utf8");

    assertIncludes(
      sitemap,
      "https://kizu.github.io/static-first-blog-engine/posts/subpath-post/",
      "subpath sitemap",
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function writeMinimalProject(
  projectDir,
  {
    themeName = "test",
    manifest = {
      name: themeName,
      version: "1.0.0",
      slots: ["main"],
      pages: {
        home: "layouts/home.html",
        post: "layouts/post.html",
        page: "layouts/page.html",
        archive: "layouts/archive.html",
      },
    },
    layouts = {
      "home.html": "<main>{{site.title}}</main>",
      "post.html": "<article>{{content.title}}</article>",
      "page.html": "<article>{{content.title}}</article>",
      "archive.html": "<main>{{content.type}}</main>",
    },
    siteConfig = { title: "Test Site", description: "Test site", language: "en" },
    themeConfig = { theme: themeName },
    pluginsConfig,
  } = {},
) {
  await mkdir(join(projectDir, "config"), { recursive: true });
  await mkdir(join(projectDir, "content", "posts"), { recursive: true });
  await mkdir(join(projectDir, "content", "pages"), { recursive: true });
  await mkdir(join(projectDir, "themes", themeName, "layouts"), { recursive: true });
  await writeFile(join(projectDir, "config", "site.json"), JSON.stringify(siteConfig));
  await writeFile(join(projectDir, "config", "theme.json"), JSON.stringify(themeConfig));

  if (pluginsConfig !== undefined) {
    await writeFile(join(projectDir, "config", "plugins.json"), JSON.stringify(pluginsConfig));
  }

  await writeFile(join(projectDir, "themes", themeName, "theme.json"), JSON.stringify(manifest));

  for (const [fileName, content] of Object.entries(layouts)) {
    await writeFile(join(projectDir, "themes", themeName, "layouts", fileName), content);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextTree(directory) {
  const chunks = [];

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      chunks.push(await readFile(entryPath, "utf8"));
    }
  }

  await visit(directory);

  return chunks.join("\n");
}
