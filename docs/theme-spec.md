# Theme Spec

Kizu Blog themes are filesystem-based packages that control layout, styles, assets, and configurable visual settings. A theme should rely only on the public template variables documented here, not on internal build implementation details.

This specification describes the stable theme contract for the current engine line.

## Directory Structure

```text
themes/<theme-name>/
  theme.json
  layouts/
    home.html
    post.html
    page.html
    archive.html
    tag.html
  styles/
    tokens.css
    global.css
    optional.css
    optional.js
  assets/
    optional
```

Required files:

- `theme.json`
- `layouts/home.html`
- `layouts/post.html`
- `layouts/page.html`
- `layouts/archive.html`
- `layouts/tag.html`

Optional files:

- `styles/tokens.css`
- `styles/global.css`
- `styles/*.css`
- `styles/*.js`
- `assets/**`

Unknown files are ignored by the engine unless a layout links to them through copied `styles/` or `assets/` paths.

## theme.json

`theme.json` is the theme manifest. Missing optional fields use safe defaults.

```json
{
  "name": "default",
  "displayName": "Default",
  "version": "0.1.0",
  "description": "Default theme",
  "author": "kizu",
  "engine": {
    "version": ">=0.3.0"
  },
  "settings": {
    "accentColor": {
      "type": "color",
      "default": "#7c3aed"
    },
    "layout": {
      "type": "select",
      "default": "classic",
      "options": ["classic", "magazine"]
    },
    "showSidebar": {
      "type": "boolean",
      "default": true
    },
    "animation": {
      "type": "select",
      "default": "fade",
      "options": ["none", "fade"]
    }
  }
}
```

Supported fields:

- `name`: machine-readable theme name. Defaults to the folder name.
- `displayName`: human-readable theme name.
- `version`: theme version. Defaults to `0.0.0`.
- `description`: short theme description.
- `author`: theme author.
- `engine.version`: optional compatibility note, such as `>=0.3.0`. The current engine documents this field but does not perform complex semver matching.
- `slots`: optional list of layout regions. Defaults to `["header", "main", "footer"]`.
- `pages`: optional layout path map. Defaults to the official `layouts/*.html` paths.
- `settings`: configurable theme settings.

The `pages` map may override layout paths:

```json
{
  "pages": {
    "home": "layouts/home.html",
    "post": "layouts/post.html",
    "page": "layouts/page.html",
    "archive": "layouts/archive.html",
    "tag": "layouts/tag.html"
  }
}
```

Settings support:

- `color`: string default, exposed as a CSS-ready string.
- `select`: string default plus string `options`; the default must be one of the options.
- `boolean`: boolean default, exposed to templates as `"true"` or `"false"`.

User overrides live in `config/theme.json`:

```json
{
  "theme": "default",
  "settings": {
    "accentColor": "#7c3aed",
    "layout": "classic",
    "showSidebar": "true",
    "animation": "fade"
  }
}
```

Boolean settings accept either JSON booleans or the strings `"true"` and `"false"` for backward compatibility.

## Layout Files

Layout files are plain HTML with simple variable replacement. The engine does not provide loops, conditionals, or a full template language.

Use variables like:

```html
<title>{{content.title}} - {{site.title}}</title>
<main>{{content.content}}</main>
```

Unresolved or missing variables render as an empty string.

## Public Template Variables

### site

- `{{site.title}}`
- `{{site.description}}`
- `{{site.author}}`
- `{{site.language}}`
- `{{site.navigation}}`

`site.navigation` is pre-rendered HTML for the configured navigation.

### content

- `{{content.type}}`: `home`, `post`, `page`, `archive`, or `tag`
- `{{content.title}}`
- `{{content.description}}`
- `{{content.content}}`
- `{{content.date}}`
- `{{content.tags}}`
- `{{content.readingTime}}`
- `{{content.previous}}`
- `{{content.next}}`

`content.content`, `content.tags`, `content.previous`, and `content.next` may contain rendered HTML.

Backward-compatible aliases currently remain available:

- `{{post.title}}`, `{{post.content}}`, `{{post.date}}`, `{{post.tags}}`
- `{{page.title}}`, `{{page.content}}`
- `{{content.previousPost}}`, `{{content.nextPost}}`

New themes should prefer the unified `content.*` variables.

### theme

- `{{theme.*}}`: resolved setting values, for example `{{theme.accentColor}}`
- `{{theme.settings.*}}`: the same resolved settings under a stable namespace, for example `{{theme.settings.accentColor}}`

### ui

Built-in UI labels:

- `{{ui.home}}`
- `{{ui.archive}}`
- `{{ui.tags}}`
- `{{ui.posts}}`
- `{{ui.pages}}`
- `{{ui.search}}`
- `{{ui.readingTime}}`
- `{{ui.previous}}`
- `{{ui.next}}`
- `{{ui.publishedOn}}`
- `{{ui.backToHome}}`
- `{{ui.viewAllPosts}}`

The engine also exposes additional internal UI labels for current default theme needs, but third-party themes should treat the list above as the stable contract.

### Other Context

The render context also includes:

- `{{path}}`: current route path, such as `/posts/hello-world/`
- `posts`: post list data for internal render helpers and future-compatible theme usage
- `pages`: page list data for internal render helpers and future-compatible theme usage
- `tags`: tag list data for internal render helpers and future-compatible theme usage

The current simple template renderer does not loop over object arrays directly. Themes that need lists should use the rendered HTML already provided through `content.content` or layout-specific aliases.

## i18n Behavior

Built-in UI text can switch between English and Chinese. If `config/site.json` uses `"language": "auto"`, the static frontend uses a tiny inline script to choose Chinese for browser languages starting with `zh`; otherwise it uses English.

Themes should use `ui.*` labels instead of hardcoded UI text when a label is part of the engine UI. User-authored Markdown content is never translated automatically.

`site.description` may be a string or a localized object:

```json
{
  "description": {
    "en": "A static-first, theme-driven personal blog engine.",
    "zh-CN": "静态优先、主题驱动的个人博客引擎。"
  }
}
```

## CSS and Style Expectations

Theme CSS should be portable static CSS. Recommended conventions:

- Put design tokens in `styles/tokens.css`.
- Put global theme styles in `styles/global.css`.
- Keep runtime JavaScript minimal.
- Respect `prefers-reduced-motion` when adding animation.
- Use stable relative paths from each layout to `assets/theme/...`.

The engine copies:

- `themes/<theme>/styles/**` to `dist/assets/theme/`
- `themes/<theme>/assets/**` to `dist/assets/theme/assets/`

## Asset Handling

Assets must stay inside the theme directory. The build refuses to read layout files outside the theme root and copies only files from the official `styles/` and `assets/` directories.

Example paths:

- Home page CSS: `assets/theme/global.css`
- Post page CSS: `../../assets/theme/global.css`
- Theme image from `assets/logo.svg`: `assets/theme/assets/logo.svg` on the home page

## Compatibility Rules

Theme authors should:

- Depend on documented variables only.
- Keep layouts static and deterministic.
- Avoid assuming plugin output is present.
- Avoid requiring the admin app.
- Keep user content as Markdown source of truth.
- Include all required layouts, including `tag.html`.
- Use `theme.settings.*` for new themes while `theme.*` remains supported.

The engine keeps backward compatibility where practical, but undocumented internals may change.

## Creating a New Theme

1. Copy `themes/starter/` to `themes/<your-theme>/`.
2. Update `theme.json` with your name, version, author, and settings.
3. Edit the required layout files.
4. Add CSS under `styles/`.
5. Add optional images or other static files under `assets/`.
6. Set `config/theme.json`:

```json
{
  "theme": "your-theme",
  "settings": {
    "accentColor": "#2563eb"
  }
}
```

7. Run:

```bash
pnpm build
pnpm validate:build
```

