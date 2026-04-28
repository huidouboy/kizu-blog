# @static-blog/core

Core content loading utilities for the static-first blog engine.

Markdown files are loaded from:

```text
content/
  posts/*.md
  pages/*.md
```

## Sample Usage

```ts
import { loadPages, loadPosts } from "@static-blog/core";

const posts = await loadPosts();
const pages = await loadPages();
const postsWithDrafts = await loadPosts({ includeDrafts: true });
```

By default, drafts are excluded. Posts are sorted by `date` descending.

The returned content objects include `id`, `slug`, `path`, `frontmatter`, `rawBody`, and an empty `html` placeholder.

## Theme Loading

The core package also exposes theme utilities:

```ts
import { loadActiveTheme, renderTemplate } from "@static-blog/core";

const theme = await loadActiveTheme();
const html = renderTemplate(theme.layouts.home, {
  site: { title: "Static Blog" },
  content: { title: "Home", type: "home" },
  theme: { accentColor: "#7c3aed" },
  posts: [],
  pages: [],
  path: "/",
});
```

Themes are loaded from `themes/<theme-name>` based on `config/theme.json`.

## Plugin Loading

The core package exposes plugin utilities:

```ts
import { loadPlugins, runPluginHook } from "@static-blog/core";

const plugins = await loadPlugins();
await runPluginHook(plugins, "onBuildStart", context);
```

Plugins are optional and are loaded from `plugins/<plugin-name>` based on `config/plugins.json`.
