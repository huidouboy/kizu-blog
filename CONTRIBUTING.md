# Contributing

[English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING.zh.md)

Thanks for your interest in contributing to Static-first Blog Engine.

This project is intentionally small and conservative. The goal is to keep Markdown and JSON files as the source of truth while producing portable static HTML.

## Project Principles

- Markdown remains the primary content store.
- Config remains in JSON files.
- The generated site must stay static and portable.
- The admin panel must remain optional.
- Core, themes, plugins, and admin should stay decoupled.
- Avoid heavy dependencies unless they clearly solve a real problem.

## Development Setup

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm validate:build
```

## Pull Request Guidelines

- Keep changes focused.
- Prefer small, readable patches over broad rewrites.
- Add or update validation when behavior changes.
- Do not introduce a database as the content source.
- Do not make the admin panel required for static builds.
- Update both English and Chinese documentation when user-facing behavior changes.

## Working Areas

- `packages/core`: content loading, theme loading, plugin loading, shared engine utilities
- `packages/cli`: CLI commands and static build pipeline
- `packages/types`: shared TypeScript contracts
- `apps/admin`: optional file-backed admin panel
- `themes/default`: default theme files
- `plugins/*`: local example plugins

## Validation Before Submitting

Run:

```sh
pnpm typecheck
pnpm build
pnpm validate:build
```

If a command cannot be run, mention that clearly in the pull request.

## Documentation

Documentation is bilingual. When changing behavior, update:

- `README.md`
- `README.zh.md`
- related English and Chinese docs when applicable

Chinese documentation should be natural and readable, not a word-by-word translation.

## Security-Sensitive Changes

For changes touching admin auth, file writes, plugin loading, or deployment, please keep the patch especially small and explain the risk model in the pull request.
