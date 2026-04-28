# Static-first Blog Engine

[English](./README.md) | [简体中文](./README.zh.md)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Output: Static HTML](https://img.shields.io/badge/output-static%20HTML-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)

A static-first Markdown blog engine with extensible themes, optional plugins, and a lightweight file-backed admin panel.

Current version: v0.1.0

Markdown is the source of truth. The build output is plain static HTML in `dist/`, so the published site does not need Node.js, a database, or an admin server.

## Features

- Markdown posts and pages in `content/posts/*.md` and `content/pages/*.md`
- Static HTML output in `dist/`
- Theme system with layouts, slots, styles, and configurable settings
- Plugin hooks for build lifecycle, Markdown transforms, HTML injection, RSS, and search index generation
- Optional online admin panel for editing Markdown and JSON config files
- Responsive default theme
- Sitemap, RSS, tag pages, reading time, and post navigation
- TypeScript monorepo with shared types

## Architecture

```text
apps/
  site/          Astro static frontend placeholder
  admin/         Optional file-backed admin panel
packages/
  core/          Content loading, theme loading, plugin loading, shared engine utilities
  cli/           CLI commands and static build pipeline
  types/         Shared TypeScript types
  theme-default/ Default theme package placeholder
content/
  posts/         Markdown posts
  pages/         Markdown pages
config/
  site.json      Site metadata and navigation
  theme.json     Active theme and theme settings
  plugins.json   Enabled plugin list
themes/
  default/       Default theme
plugins/
  plugin-seo/
  plugin-rss/
  plugin-search/
```

Core rules:

- Markdown remains the primary content store.
- JSON config files remain the primary configuration store.
- SQLite is not required and is not used as content storage.
- The admin panel is optional and decoupled from the generated static site.

## Install

Requirements:

- Node.js 22 or newer
- pnpm 10.8.0

```sh
pnpm install
```

## Development

Build all workspace packages:

```sh
pnpm build:packages
```

Type-check the project:

```sh
pnpm typecheck
```

Run the placeholder dev command:

```sh
pnpm dev
```

## Build

Generate the static site:

```sh
pnpm build
```

The output directory is:

```text
dist/
```

Validate the generated static output:

```sh
pnpm validate:build
```

## Preview

The current `pnpm preview` command is a placeholder. Because the generated site is static, you can preview `dist/` with any static file server, for example:

```sh
npx serve dist
```

## Admin

Start the optional admin panel:

```sh
pnpm admin
```

Default URL:

```text
http://localhost:4173
```

Environment variables:

- `ADMIN_PORT` changes the admin server port.
- `BLOG_ROOT` points the admin server at another blog root.

The admin panel can initialize one admin account, log in and out, manage posts and pages, edit site/theme/plugin config, switch themes, enable or disable plugins, preview Markdown, and trigger a static build.

Security notes:

- Admin storage lives in `data/admin/`.
- `data/admin/` is ignored by git.
- The password is hashed with PBKDF2 and is not stored as plaintext.
- Session cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Admin writes are limited to `content/posts/*.md`, `content/pages/*.md`, `config/site.json`, `config/theme.json`, and `config/plugins.json`.
- Deleted Markdown files are moved to `data/admin/trash`.

The admin server is not required for `pnpm build`, and the generated `dist/` site does not depend on it.

## Theme System

Themes live in `themes/<theme-name>/`:

```text
themes/default/
  theme.json
  layouts/
    home.html
    post.html
    page.html
    archive.html
    tag.html
  blocks/
  components/
  styles/
    tokens.css
    global.css
```

The active theme is selected in `config/theme.json`.

Themes control layouts, slots, CSS, and settings. The default theme supports:

- `accentColor`
- `layout`
- `showSidebar`
- `animation`

Templates use simple dot-path variables such as:

- `{{site.title}}`
- `{{site.description}}`
- `{{content.title}}`
- `{{content.content}}`
- `{{theme.accentColor}}`

## Plugin System

Plugins live in `plugins/<plugin-name>/` and are enabled in `config/plugins.json`:

```json
{
  "enabled": ["plugin-seo", "plugin-rss", "plugin-search"]
}
```

Supported hooks:

- `onBuildStart`
- `transformMarkdown`
- `injectHead`
- `injectBodyEnd`
- `onBuildEnd`

Example plugins currently inject SEO metadata, generate `rss.xml`, and generate `search-index.json`.

Plugins are optional. The site builds normally with zero enabled plugins.

## Deployment

### GitHub Pages

This repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`.

The workflow:

1. Installs dependencies.
2. Runs `pnpm typecheck`.
3. Runs `pnpm build`.
4. Runs `pnpm validate:build`.
5. Uploads `dist/`.
6. Deploys `dist/` to GitHub Pages.

For a repository hosted at `https://<user>.github.io/<repo>/`, set `baseUrl` in `config/site.json` to:

```json
{
  "baseUrl": "https://<user>.github.io/<repo>"
}
```

Use no trailing slash. The build will generate sitemap and RSS URLs that include the GitHub Pages subpath.

In GitHub, enable Pages and select GitHub Actions as the Pages source.

### Cloudflare Pages

Create a Cloudflare Pages project connected to the repository.

Recommended settings:

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js version: `22`

Set `baseUrl` to your Cloudflare Pages domain or custom domain:

```json
{
  "baseUrl": "https://example.pages.dev"
}
```

### Docker

The generated site is static, so Docker only needs to serve `dist/`.

One simple approach:

```sh
pnpm install --frozen-lockfile
pnpm build
docker run --rm -p 8080:80 -v "$PWD/dist:/usr/share/nginx/html:ro" nginx:alpine
```

### VPS

Build locally or on the server:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then serve `dist/` with Nginx, Caddy, Apache, or any static file server. The admin panel should be run separately and only where you intentionally want file editing access.

## Author

kizu (伊甸黎明)

## License

MIT. See [LICENSE](./LICENSE).

<!-- Trigger GitHub Pages deployment check. -->
