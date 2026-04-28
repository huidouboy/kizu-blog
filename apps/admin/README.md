# Admin App

Minimal online admin panel for managing Markdown content and JSON config files.

Run from the repository root:

```sh
pnpm admin
```

The admin account is stored in `data/admin/account.json` with a hashed password. Blog content remains in `content/posts` and `content/pages`; config remains in `config/*.json`.

Default URL: `http://localhost:4173`.

Environment variables:

- `ADMIN_PORT` changes the admin server port.
- `BLOG_ROOT` points the admin server at another blog root.

The admin panel is intentionally single-user and file-backed. It edits Markdown and JSON directly, then can trigger the static build command.

The admin server is optional. Static builds do not start it, and generated `dist/` output does not depend on it.

Security notes:

- `data/admin/` is gitignored.
- Passwords are hashed with PBKDF2 and are not logged or stored in plaintext.
- Session cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/`.
- Admin writes are limited to Markdown files in `content/posts` and `content/pages`, plus `config/site.json`, `config/theme.json`, and `config/plugins.json`.
- Deleted Markdown files are moved to `data/admin/trash`.
