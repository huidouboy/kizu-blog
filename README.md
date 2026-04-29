# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

A static-first, theme-driven Markdown blog engine with an optional visual admin panel.

Kizu Blog keeps Markdown as the source of truth, generates portable static HTML into `dist/`, and keeps themes, plugins, and the admin panel decoupled. You can use it as a full blog system with the admin panel, or as a frontend-only static site generator.

## Quick Start: Full Blog + Admin

This is the easiest path for beginners. It builds the static blog and starts the optional admin panel so you can manage the site visually.

```bash
git clone https://github.com/huidouboy/kizu-blog.git
cd kizu-blog
npm exec --yes pnpm@10.8.0 -- install
npm exec --yes pnpm@10.8.0 -- build
npm exec --yes pnpm@10.8.0 -- admin
```

If `pnpm` is already installed, you may use:

```bash
pnpm install
pnpm build
pnpm admin
```

Open:

```text
http://localhost:4173
```

On the first visit, the admin panel shows the setup screen for creating the first admin account. The password is hashed before it is stored. During setup, sample content may be generated based on the browser language.

After setup, you can manage posts, pages, site config, theme settings, enabled plugins, and builds from the admin UI. The generated public site still lives in `dist/`. The admin panel is optional and is not required for public static hosting.

## Static Site Only

Use this path if you only want static output and do not want to start the admin server.

```bash
git clone https://github.com/huidouboy/kizu-blog.git
cd kizu-blog
npm exec --yes pnpm@10.8.0 -- install
npm exec --yes pnpm@10.8.0 -- build
```

If `pnpm` is already installed, you may use:

```bash
pnpm install
pnpm build
```

This generates `dist/` only. No admin server is started. Deploy `dist/` to GitHub Pages, Cloudflare Pages, or any static hosting provider.

## Advanced Commands

```bash
pnpm build
pnpm validate:build
pnpm admin
pnpm typecheck
```

`pnpm build` builds packages and writes the static site to `dist/`. `pnpm validate:build` checks the generated output and project boundaries. `pnpm admin` starts the optional admin panel. `pnpm typecheck` runs TypeScript checks across the workspace.

## Features

- Markdown posts and pages from `content/posts` and `content/pages`
- Static HTML output in `dist/`
- Theme system with an official public spec
- Starter theme for third-party theme authors
- Optional plugin system for Markdown transforms and static artifacts
- Optional file-backed admin panel
- RSS, sitemap, archive pages, tag pages, reading time, and post navigation
- Built-in static search powered by `search-index.json`
- Automatic English / Chinese built-in UI labels without translating Markdown content
- GitHub Pages and Cloudflare Pages friendly output

## Theme System

Themes control layouts, styles, assets, and configurable settings. Third-party themes should use the official theme contract instead of depending on internal implementation details.

See:

- [Theme Spec](./docs/theme-spec.md)
- [Chinese Theme Spec](./docs/theme-spec.zh.md)
- `themes/starter/`

## Search

The default theme includes a command-style search overlay. It uses the generated static `search-index.json`, works without a backend, and can be opened with `Ctrl+K` or `Cmd+K`.

If the search plugin is disabled and `search-index.json` is missing, the UI fails gracefully.

## i18n

Set `config/site.json`:

```json
{
  "language": "auto"
}
```

`auto` detects the visitor language in the static frontend. Any language starting with `zh` uses Chinese UI labels; all other languages use English. You can force a language with `"zh-CN"` or `"en"`.

This only affects built-in UI labels and built-in demo/default text. User-authored Markdown articles and pages are never translated automatically.

## Admin Details

The admin panel is optional and file-backed. It writes to:

- `content/posts/*.md`
- `content/pages/*.md`
- `config/site.json`
- `config/theme.json`
- `config/plugins.json`

Admin account data is stored in `data/admin/account.json`. A single admin account is supported for now. Passwords are hashed, not stored as plaintext.

The admin can list, create, edit, delete, and preview content; edit site config; switch themes; edit theme settings from `theme.json`; enable or disable plugins; and trigger a build.

## Deployment

The public site is the static `dist/` directory. You do not need the admin server for public hosting.

GitHub Pages is the primary deployment target. The workflow in `.github/workflows/pages.yml` installs dependencies, runs typecheck, builds, validates, and deploys `dist/`.

Cloudflare Pages can use:

- Build command: `pnpm build`
- Output directory: `dist`

Docker, VPS, Vercel, Netlify, or any static file server can serve `dist/`.

## Status

Current version: **v0.3.1**

Stable for personal use. The theme ecosystem is defined and still evolving.

## Author

kizu

## License

MIT
