# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh.md)

## v0.1.0 - Initial Open-source Release

Author: kizu (伊甸黎明)

This is the first public release of Static-first Blog Engine.

### Highlights

- Static-first blog engine that outputs portable HTML into `dist/`.
- Markdown is the source of truth for posts and pages.
- JSON files remain the source of truth for site, theme, and plugin configuration.
- Theme system with layouts, styles, slots, and configurable settings.
- Plugin system with build lifecycle hooks, Markdown transforms, and HTML injection.
- Example plugins for SEO metadata, RSS generation, and search index generation.
- Optional file-backed admin panel for managing Markdown and config files.
- GitHub Pages deployment workflow for publishing `dist/`.
- Bilingual documentation in English and Simplified Chinese.

### Validation

- `pnpm typecheck`
- `pnpm build`
- `pnpm validate:build`
