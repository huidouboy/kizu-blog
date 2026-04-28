# Security Policy

[English](./SECURITY.md) | [简体中文](./SECURITY.zh.md)

## Supported Versions

This project is in early development. Security fixes are expected to target the latest `main` branch unless a release branch is created later.

## Reporting a Vulnerability

Please report security issues privately when possible. If the repository does not yet provide a private advisory channel, contact the maintainer before opening a public issue with exploit details.

Include:

- Affected version or commit
- Steps to reproduce
- Impact
- Suggested fix, if you have one

Please avoid sharing live exploit payloads publicly before a fix is available.

## Security Model

The generated site is static HTML. It does not require Node.js, a database, or the admin server at runtime.

The admin panel is optional and intended for trusted operators. It writes only to:

- `content/posts/*.md`
- `content/pages/*.md`
- `config/site.json`
- `config/theme.json`
- `config/plugins.json`

Admin auth uses a single local account. Passwords are hashed with PBKDF2 and stored in `data/admin/account.json`. Deleted Markdown files are moved to `data/admin/trash`.

## Out of Scope

The project does not currently provide:

- Multi-user permissions
- SaaS tenant isolation
- Plugin sandboxing
- A public hosted admin service

Plugins run as local project code during the build. Only enable plugins you trust.

## Deployment Advice

- Publish only `dist/` for the public site.
- Do not expose the admin server unless you intentionally need remote editing.
- Keep `data/admin/` private and out of git.
- Set `baseUrl` correctly for production domains.
- Review plugins before enabling them in production builds.
