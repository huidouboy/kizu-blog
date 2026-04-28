# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh.md)

## v0.2.0 - I18n and Default Experience Polish

Author: kizu (伊甸黎明)

### Highlights

- Added automatic built-in UI language support for English and Chinese.
- Added `config/site.json` language modes: `auto`, `en`, and `zh-CN`.
- Kept user-authored Markdown content untouched; only built-in UI labels switch language.
- Added localized admin UI labels and validation messages.
- Added language-aware first-time admin sample content generation.
- Improved default theme typography, spacing, cards, archive, tags, and reading pages.
- Strengthened validation for localized static output and admin sample safety.

### Validation

- `pnpm typecheck`
- `pnpm build`
- `pnpm validate:build`

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
