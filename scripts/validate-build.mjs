import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";

import {
  createSlug,
  loadActiveTheme,
  loadThemeManifest,
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
  searchScript: "dist/assets/theme/search-overlay.js",
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
assertIncludes(contents.home, "Kizu Blog", files.home);
assertIncludes(contents.home, "kizu", files.home);
assertIncludes(contents.home, "Kizu Blog by kizu", files.home);
assertIncludes(contents.archive, "Kizu Blog by kizu", files.archive);
assertIncludes(contents.post, "Kizu Blog by kizu", files.post);
assertIncludes(contents.page, "Kizu Blog by kizu", files.page);
assertIncludes(contents.tag, "Kizu Blog by kizu", files.tag);
assertIncludes(contents.home, "A static-first, theme-driven personal blog engine.", files.home);
assertIncludes(contents.home, "静态优先、主题驱动的个人博客引擎。", files.home);
assertIncludes(contents.home, 'data-i18n="search"', files.home);
assertIncludes(contents.home, "data-search-open", files.home);
assertIncludes(contents.home, 'data-search-index-path="search-index.json"', files.home);
assertIncludes(contents.archive, 'data-search-index-path="../search-index.json"', files.archive);
assertIncludes(contents.post, 'data-search-index-path="../../search-index.json"', files.post);
assertIncludes(contents.page, 'data-search-index-path="../../search-index.json"', files.page);
assertIncludes(contents.home, 'role="dialog"', files.home);
assertIncludes(contents.home, "data-search-input", files.home);
assertIncludes(contents.home, "data-search-status", files.home);
assertIncludes(contents.home, "data-search-results", files.home);
assertIncludes(contents.home, 'data-i18n-placeholder="searchPlaceholder"', files.home);
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
assertIncludes(contents.home, 'meta name="generator" content="Static-first Blog Engine"', files.home);
assertIncludes(contents.post, 'meta name="static-blog:path" content="/posts/hello-world/"', files.post);
assertIncludes(contents.rss, "<rss version=\"2.0\">", files.rss);
assertIncludes(contents.rss, "<title>Hello World</title>", files.rss);
assertIncludes(contents.rss, "https://example.com/posts/hello-world/", files.rss);
assertIncludes(contents.search, '"title": "Hello World"', files.search);
assertIncludes(contents.search, '"url": "/posts/hello-world/"', files.search);
assertIncludes(contents.search, '"excerpt": "This post is written in Markdown and rendered as a static HTML file. Markdown is the source of truth. The generated output is plain HTML. No database is required."', files.search);
assertIncludes(contents.sitemap, "https://example.com/posts/hello-world/", files.sitemap);
assertIncludes(contents.sitemap, "https://example.com/tags/markdown/", files.sitemap);
assertIncludes(contents.tokens, "--radius-lg", files.tokens);
assertIncludes(contents.tokens, "--shadow-md", files.tokens);
assertIncludes(contents.global, ".sidebar-false", files.global);
assertIncludes(contents.global, ".animation-fade", files.global);
assertIncludes(contents.global, ".search-overlay", files.global);
assertIncludes(contents.global, ".search-panel", files.global);
assertIncludes(contents.global, ".search-status", files.global);
assertIncludes(contents.global, ".search-result-link", files.global);
assertIncludes(contents.global, ".site-header.is-hidden", files.global);
assertIncludes(contents.tokens, "cubic-bezier(0.22, 1, 0.36, 1)", files.tokens);
assertIncludes(contents.searchScript, "isEditableTarget", files.searchScript);
assertIncludes(contents.searchScript, "fetch(searchIndexPath", files.searchScript);
assertIncludes(contents.searchScript, "routeToRelativeHref", files.searchScript);
assertIncludes(contents.searchScript, "ArrowDown", files.searchScript);
assertIncludes(contents.searchScript, "event.target !== input", files.searchScript);
assertIncludes(contents.searchScript, "hasIndexError", files.searchScript);
assertNotIncludes(Object.values(contents).join("\n"), "Static Blog", "generated dist output");
assertNotIncludes(Object.values(contents).join("\n"), "Static Author", "generated dist output");
assertNotIncludes(
  Object.values(contents).join("\n"),
  "A minimal static-first Markdown blog.",
  "generated dist output",
);
assertNotIncludes(
  Object.values(contents).join("\n"),
  "PERSONAL BLOG BY STATIC AUTHOR",
  "generated dist output",
);

await validateArchitectureBoundaries();
await validateContentLoading();
await validateThemeLoading();
await validateOfficialThemeSpec();
await validateStarterThemeBuild();
await validateThemeAssetCopying();
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
await validateSearchWithoutPlugin();
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
    assertEqual(theme.layouts.tag.includes("tag"), true, "required tag layout");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateOfficialThemeSpec() {
  const defaultManifest = await loadThemeManifest(
    join(rootDir, "themes", "default", "theme.json"),
  );
  const starterManifest = await loadThemeManifest(
    join(rootDir, "themes", "starter", "theme.json"),
  );

  await assertThemeMatchesSpec("default", defaultManifest);
  await assertThemeMatchesSpec("starter", starterManifest);

  const themeSpec = await readFile(join(rootDir, "docs", "theme-spec.md"), "utf8");
  const themeSpecZh = await readFile(join(rootDir, "docs", "theme-spec.zh.md"), "utf8");
  const readme = await readFile(join(rootDir, "README.md"), "utf8");
  const readmeZh = await readFile(join(rootDir, "README.zh.md"), "utf8");

  assertIncludes(themeSpec, "## Directory Structure", "docs/theme-spec.md");
  assertIncludes(themeSpec, "{{content.previous}}", "docs/theme-spec.md");
  assertIncludes(themeSpec, "{{theme.settings.*}}", "docs/theme-spec.md");
  assertIncludes(themeSpecZh, "## 目录结构", "docs/theme-spec.zh.md");
  assertIncludes(themeSpecZh, "{{content.previous}}", "docs/theme-spec.zh.md");
  assertIncludes(readme, "./docs/theme-spec.md", "README.md");
  assertIncludes(readmeZh, "./docs/theme-spec.zh.md", "README.zh.md");
}

async function assertThemeMatchesSpec(themeName, manifest) {
  const themeDir = join(rootDir, "themes", themeName);

  for (const [layoutName, layoutPath] of Object.entries(manifest.pages)) {
    if (!["home", "post", "page", "archive", "tag"].includes(layoutName)) {
      continue;
    }

    if (!(await pathExists(join(themeDir, layoutPath)))) {
      throw new Error(`${themeName} theme is missing required layout: ${layoutPath}`);
    }
  }

  assertEqual(Boolean(manifest.name), true, `${themeName} theme name`);
  assertEqual(Boolean(manifest.version), true, `${themeName} theme version`);
  assertEqual(Boolean(manifest.pages.tag), true, `${themeName} tag layout`);

  if (manifest.settings?.showSidebar) {
    assertEqual(manifest.settings.showSidebar.type, "boolean", `${themeName} showSidebar setting`);
  }
}

async function validateStarterThemeBuild() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-starter-theme-"));

  try {
    await mkdir(join(projectDir, "config"), { recursive: true });
    await mkdir(join(projectDir, "content", "posts"), { recursive: true });
    await mkdir(join(projectDir, "content", "pages"), { recursive: true });
    await mkdir(join(projectDir, "themes"), { recursive: true });
    await cp(join(rootDir, "themes", "starter"), join(projectDir, "themes", "starter"), {
      recursive: true,
    });
    await writeFile(
      join(projectDir, "config", "site.json"),
      JSON.stringify({
        title: "Starter Site",
        description: "Starter theme check",
        author: "Tester",
        language: "en",
      }),
    );
    await writeFile(
      join(projectDir, "config", "theme.json"),
      JSON.stringify({
        theme: "starter",
        settings: {
          accentColor: "#0f766e",
          layout: "classic",
          showSidebar: true,
          animation: "none",
        },
      }),
    );
    await writeFile(
      join(projectDir, "content", "posts", "starter-post.md"),
      `---\ntitle: Starter Post\ndate: 2026-04-28\ntags: [starter]\ndraft: false\ndescription: Starter theme post.\n---\nStarter body.\n`,
    );

    const result = await buildSite({ rootDir: projectDir });
    const homeHtml = await readFile(join(projectDir, "dist", "index.html"), "utf8");
    const postHtml = await readFile(
      join(projectDir, "dist", "posts", "starter-post", "index.html"),
      "utf8",
    );

    assertEqual(result.theme, "starter", "starter theme build result");
    assertIncludes(homeHtml, "starter-theme", "starter home output");
    assertIncludes(homeHtml, "Starter Site", "starter home output");
    assertIncludes(postHtml, "Starter Post", "starter post output");
    assertIncludes(postHtml, "--accent: #0f766e", "starter theme setting");
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "tokens.css")),
      true,
      "starter tokens copied",
    );
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "global.css")),
      true,
      "starter global copied",
    );
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function validateThemeAssetCopying() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-theme-assets-"));

  try {
    await writeMinimalProject(projectDir, {
      themeName: "asset-theme",
      siteConfig: {
        title: "Asset Site",
        description: "Asset copy check",
        language: "en",
      },
      themeConfig: { theme: "asset-theme" },
    });

    const themeDir = join(projectDir, "themes", "asset-theme");

    await mkdir(join(themeDir, "styles", "nested"), { recursive: true });
    await mkdir(join(themeDir, "assets", "icons"), { recursive: true });
    await writeFile(join(themeDir, "styles", "tokens.css"), ":root { --asset-check: ok; }");
    await writeFile(join(themeDir, "styles", "extra.js"), "window.assetCheck = true;");
    await writeFile(join(themeDir, "styles", "nested", "extra.css"), ".nested { color: red; }");
    await writeFile(join(themeDir, "assets", "icons", "logo.txt"), "logo");
    await writeFile(join(themeDir, "notes.md"), "Do not copy root notes.");

    await buildSite({ rootDir: projectDir });

    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "tokens.css")),
      true,
      "theme tokens copied",
    );
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "extra.js")),
      true,
      "theme script copied",
    );
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "nested", "extra.css")),
      true,
      "nested theme style copied",
    );
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "assets", "icons", "logo.txt")),
      true,
      "theme asset copied",
    );
    assertEqual(
      await pathExists(join(projectDir, "dist", "assets", "theme", "notes.md")),
      false,
      "unrelated theme file not copied",
    );
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
      "Missing required theme layout",
      "missing layout file",
    );
  } finally {
    await rm(missingLayoutDir, { recursive: true, force: true });
  }

  const invalidThemeSettingDir = await mkdtemp(join(tmpdir(), "static-blog-invalid-theme-setting-"));

  try {
    await writeMinimalProject(invalidThemeSettingDir, {
      manifest: {
        name: "test",
        version: "1.0.0",
        pages: {
          home: "layouts/home.html",
          post: "layouts/post.html",
          page: "layouts/page.html",
          archive: "layouts/archive.html",
          tag: "layouts/tag.html",
        },
        settings: {
          layout: {
            type: "select",
            options: ["classic"],
            default: "magazine",
          },
        },
      },
    });
    await assertRejectsMessage(
      () => buildSite({ rootDir: invalidThemeSettingDir }),
      'expected "settings.layout.default" to be one of classic',
      "invalid theme setting schema",
    );
  } finally {
    await rm(invalidThemeSettingDir, { recursive: true, force: true });
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

function validateAutomaticBrowserLanguageLegacy(homeHtml) {
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

function runAutoLanguageScriptLegacy(script, languages) {
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

function createFakeElementLegacy(attributes, textContent) {
  return {
    textContent,
    getAttribute(key) {
      return attributes[key] ?? null;
    },
  };
}

function validateAutomaticBrowserLanguage(homeHtml) {
  const script = extractFirstInlineScript(homeHtml);
  const zhResult = runAutoLanguageScript(script, ["zh-CN", "en-US"]);
  const enResult = runAutoLanguageScript(script, ["en-US", "en"]);

  assertEqual(zhResult.htmlLang, "zh-CN", "Chinese browser UI locale");
  assertEqual(zhResult.home, "\u9996\u9875", "Chinese browser home label");
  assertEqual(zhResult.archive, "\u5f52\u6863", "Chinese browser archive label");
  assertEqual(
    zhResult.readingTime,
    "\u7ea6 3 \u5206\u949f\u9605\u8bfb",
    "Chinese browser reading time label",
  );
  assertEqual(
    zhResult.siteDescription,
    "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
    "Chinese browser site description",
  );
  assertEqual(
    zhResult.metaDescription,
    "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
    "Chinese browser meta description",
  );
  assertEqual(enResult.htmlLang, "en", "English browser UI locale");
  assertEqual(enResult.home, "Home", "English browser home label");
  assertEqual(enResult.archive, "Archive", "English browser archive label");
  assertEqual(enResult.readingTime, "3 min read", "English browser reading time label");
  assertEqual(
    enResult.siteDescription,
    "A static-first, theme-driven personal blog engine.",
    "English browser site description",
  );
  assertEqual(
    enResult.metaDescription,
    "A static-first, theme-driven personal blog engine.",
    "English browser meta description",
  );
}

function runAutoLanguageScript(script, languages) {
  const textElements = [
    createFakeElement({ "data-i18n": "home" }, "Home"),
    createFakeElement({ "data-i18n": "archive" }, "Archive"),
  ];
  const readingTimeElements = [
    createFakeElement({ "data-minutes": "3" }, "3 min read"),
  ];
  const siteDescriptionElements = [
    createFakeElement(
      {
        "data-site-description-en": "A static-first, theme-driven personal blog engine.",
        "data-site-description-zh":
          "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
      },
      "A static-first, theme-driven personal blog engine.",
    ),
  ];
  const metaDescriptionElements = [
    createFakeElement(
      {
        content: "A static-first, theme-driven personal blog engine.",
        "data-site-description-content": "",
        "data-site-description-en": "A static-first, theme-driven personal blog engine.",
        "data-site-description-zh":
          "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
      },
      "",
    ),
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

      if (selector === "[data-site-description]") {
        return siteDescriptionElements;
      }

      if (selector === "[data-site-description-content]") {
        return metaDescriptionElements;
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
    siteDescription: siteDescriptionElements[0].textContent,
    metaDescription: metaDescriptionElements[0].getAttribute("content"),
  };
}

function createFakeElement(attributes, textContent) {
  const attributeMap = { ...attributes };

  return {
    textContent,
    getAttribute(key) {
      return attributeMap[key] ?? null;
    },
    setAttribute(key, value) {
      attributeMap[key] = value;
    },
  };
}

async function validateForcedUiLanguagesLegacy() {
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

async function validateForcedUiLanguageLegacy(language, { body, expected, title }) {
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

async function validateForcedUiLanguages() {
  await validateForcedUiLanguage("zh-CN", {
    body: "User-authored content stays English.",
    expected: [
      "\u9996\u9875",
      "\u5f52\u6863",
      "\u6587\u7ae0",
      "\u641c\u7d22",
      "\u53d1\u5e03\u4e8e",
      "\u9605\u8bfb\u65f6\u95f4",
      "\u7ea6 1 \u5206\u949f\u9605\u8bfb",
      "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
    ],
    title: "English User Post",
  });
  await validateForcedUiLanguage("en", {
    body: "\u7528\u6237\u81ea\u5df1\u5199\u7684\u6b63\u6587\u4f1a\u4fdd\u6301\u539f\u6837\u3002",
    expected: [
      "Home",
      "Archive",
      "Posts",
      "Search",
      "Published on",
      "Reading time",
      "1 min read",
      "A static-first, theme-driven personal blog engine.",
    ],
    title: "\u4e2d\u6587\u7528\u6237\u6587\u7ae0",
  });
}

async function validateForcedUiLanguage(language, { body, expected, title }) {
  const projectDir = await mkdtemp(join(tmpdir(), `static-blog-i18n-${language}-`));

  try {
    await writeMinimalProject(projectDir, {
      themeName: "i18n",
      siteConfig: {
        title: "I18n Site",
        description: {
          en: "A static-first, theme-driven personal blog engine.",
          "zh-CN":
            "\u9759\u6001\u4f18\u5148\u3001\u4e3b\u9898\u9a71\u52a8\u7684\u4e2a\u4eba\u535a\u5ba2\u5f15\u64ce\u3002",
        },
        author: "Tester",
        language,
      },
      layouts: {
        "home.html": `<!doctype html><html lang="{{site.language}}"><head><title>{{site.title}}</title><meta name="description" content="{{site.description}}" data-site-description-content data-site-description-en="{{site.descriptionEn}}" data-site-description-zh="{{site.descriptionZhCn}}">{{ui.script}}</head><body><p data-site-description data-site-description-en="{{site.descriptionEn}}" data-site-description-zh="{{site.descriptionZhCn}}">{{site.description}}</p>{{ui.home}} {{ui.archive}} {{ui.posts}} {{ui.search}} {{content.content}}</body></html>`,
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
          tag: "layouts/tag.html",
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
      join(projectDir, "themes", "test", "layouts", "tag.html"),
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

async function validateSearchWithoutPlugin() {
  const projectDir = await mkdtemp(join(tmpdir(), "static-blog-search-optional-"));

  try {
    await mkdir(join(projectDir, "config"), { recursive: true });
    await mkdir(join(projectDir, "content", "posts"), { recursive: true });
    await mkdir(join(projectDir, "content", "pages"), { recursive: true });
    await cp(join(rootDir, "themes", "default"), join(projectDir, "themes", "default"), {
      recursive: true,
    });
    await writeFile(
      join(projectDir, "config", "site.json"),
      JSON.stringify({
        title: "Optional Search Site",
        description: "Plugin optional check",
        author: "Tester",
        language: "en",
      }),
    );
    await writeFile(
      join(projectDir, "config", "theme.json"),
      JSON.stringify({
        theme: "default",
        settings: {
          accentColor: "#0f766e",
          layout: "classic",
          showSidebar: "true",
          animation: "fade",
        },
      }),
    );
    await writeFile(
      join(projectDir, "content", "posts", "optional-search.md"),
      `---\ntitle: Optional Search\ndate: 2026-04-28\ntags: [search]\ndraft: false\ndescription: Search plugin is disabled here.\n---\nSearch works as an optional enhancement.\n`,
    );

    await buildSite({ rootDir: projectDir });

    if (await pathExists(join(projectDir, "dist", "search-index.json"))) {
      throw new Error("Search index should not be generated when plugin-search is disabled.");
    }

    const homeHtml = await readFile(join(projectDir, "dist", "index.html"), "utf8");
    const searchScript = await readFile(
      join(projectDir, "dist", "assets", "theme", "search-overlay.js"),
      "utf8",
    );

    assertIncludes(homeHtml, 'data-search-overlay', "optional search home");
    assertIncludes(homeHtml, 'data-search-status', "optional search home");
    assertIncludes(searchScript, "hasIndexError = true", "optional search script");
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
          tag: "layouts/tag.html",
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
    await writeFile(
      join(projectDir, "themes", "legacy", "layouts", "tag.html"),
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
          tag: "layouts/tag.html",
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
    await writeFile(
      join(projectDir, "themes", "subpath", "layouts", "tag.html"),
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
        tag: "layouts/tag.html",
      },
    },
    layouts = {
      "home.html": "<main>{{site.title}}</main>",
      "post.html": "<article>{{content.title}}</article>",
      "page.html": "<article>{{content.title}}</article>",
      "archive.html": "<main>{{content.type}}</main>",
      "tag.html": "<main>tag {{content.title}}</main>",
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

  const resolvedLayouts = {
    "tag.html": "<main>tag {{content.title}}</main>",
    ...layouts,
  };

  for (const [fileName, content] of Object.entries(resolvedLayouts)) {
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
