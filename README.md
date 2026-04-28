# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Output: Static HTML](https://img.shields.io/badge/output-static%20HTML-blue)
![Version](https://img.shields.io/badge/version-v0.2.0-2f855a)

Kizu Blog is a static-first Markdown blog engine. Markdown files stay the source of truth, the build output is portable static HTML, and themes, plugins, and the optional admin panel stay decoupled.

Current version: **v0.2.0**

## Features

- Markdown posts and pages from `content/posts` and `content/pages`
- Static HTML output in `dist/`
- Theme system with layouts, styles, settings, and UI slots
- Hook-based plugin system for Markdown transforms and static artifacts
- Optional file-backed admin panel for content and config editing
- RSS, sitemap, search index, archive pages, tag pages, reading time, and post navigation
- Automatic English / Chinese built-in UI labels without translating user-authored Markdown
- GitHub Pages friendly output
- Bilingual documentation

## Architecture

```text
apps/
  admin/          optional online admin panel
packages/
  core/           content, theme, plugin, and rendering primitives
  cli/            build/dev/preview/deploy commands
  types/          shared TypeScript contracts
  theme-default/ default theme package placeholder
themes/
  default/        active default theme
plugins/
  plugin-seo/
  plugin-rss/
  plugin-search/
```

`packages/core` does not depend on the admin app or the default theme. The generated static site does not require Node.js or the admin server.

## Usage

Install dependencies:

```bash
pnpm install
```

Build packages and the static site:

```bash
pnpm build
```

Validate the generated output:

```bash
pnpm validate:build
```

Start the optional admin panel:

```bash
pnpm admin
```

The admin stores its account data in `data/admin/account.json`, hashes passwords, and writes content/config back to Markdown and JSON files.

## UI Language

Set `config/site.json`:

```json
{
  "language": "auto"
}
```

`auto` detects the visitor language in the static frontend. Any language starting with `zh` uses Chinese UI labels; all other languages use English. You can force a language with `"zh-CN"` or `"en"`.

This only affects built-in UI labels such as Home, Archive, Tags, Reading time, Previous, and Next. Markdown article and page content is never translated automatically.

## Deployment

GitHub Pages is the primary target. The workflow in `.github/workflows/deploy-pages.yml` installs dependencies, typechecks, builds, validates, and deploys `dist/`.

Cloudflare Pages can use:

- Build command: `pnpm build`
- Output directory: `dist`

Docker and VPS deployments can serve `dist/` with any static file server.

## Author

kizu (伊甸黎明)

## License

MIT
