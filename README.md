# Kizu Blog

Kizu Blog is a static-first, extensible blog engine.

## Goals

- Markdown as the source of truth
- Static HTML output
- Extensible theme system
- Plugin architecture
- Optional online admin panel
- Deployable to GitHub Pages, Cloudflare Pages, Docker, or VPS

## Status

This repository has been reset for the next open-source architecture.

Implementation should proceed in phases:

1. Monorepo scaffold and shared types
2. Core content system
3. CLI and static build pipeline
4. Theme system
5. Plugin system
6. Default theme and complete static blog output
7. Optional online admin panel
8. Deployment support
9. Stabilization and documentation

## Architecture

```txt
apps/
  site/
  admin/
packages/
  core/
  cli/
  types/
  theme-default/
```

## Principles

- Static-first
- Content-first
- Config-driven
- Plugin-first
- Minimal runtime JavaScript
- Core, theme, plugin, and admin are decoupled

## License

TBD
