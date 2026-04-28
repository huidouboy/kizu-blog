# Static-first Blog Engine

[English](./README.md) | [简体中文](./README.zh.md)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Output: Static HTML](https://img.shields.io/badge/output-static%20HTML-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)

一个静态优先的 Markdown 博客引擎，提供可扩展主题、可选插件，以及一个轻量的文件型后台。

当前版本：v0.1.0

这个项目的核心想法很简单：文章和页面以 Markdown 为准，配置以 JSON 为准，构建结果是 `dist/` 里的纯静态 HTML。发布后的站点不需要 Node.js 服务、不需要数据库，也不依赖后台面板。

## 功能

- 使用 `content/posts/*.md` 和 `content/pages/*.md` 管理文章与页面
- 输出完整静态 HTML 到 `dist/`
- 主题系统支持布局、插槽、样式和可配置设置
- 插件系统支持构建生命周期、Markdown 转换、HTML 注入、RSS 和搜索索引
- 可选在线后台，可直接编辑 Markdown 与 JSON 配置
- 默认主题响应式适配移动端
- 内置 sitemap、RSS、标签页、阅读时间、上一篇/下一篇导航
- TypeScript monorepo，并提供共享类型定义

## 架构概览

```text
apps/
  site/          Astro 静态前端预留目录
  admin/         可选的文件型后台
packages/
  core/          内容、主题、插件加载与引擎工具
  cli/           CLI 命令和静态构建流程
  types/         共享 TypeScript 类型
  theme-default/ 默认主题包预留目录
content/
  posts/         Markdown 文章
  pages/         Markdown 页面
config/
  site.json      站点元信息与导航
  theme.json     当前主题与主题设置
  plugins.json   启用的插件
themes/
  default/       默认主题
plugins/
  plugin-seo/
  plugin-rss/
  plugin-search/
```

几条边界不会变：

- Markdown 是内容源。
- JSON 文件是配置源。
- SQLite 不是必需项，也不会成为内容主存储。
- 后台是可选能力，和生成后的静态站点解耦。

## 安装

需要：

- Node.js 22 或更新版本
- pnpm 10.8.0

```sh
pnpm install
```

## 开发

构建所有 workspace 包：

```sh
pnpm build:packages
```

类型检查：

```sh
pnpm typecheck
```

运行当前的开发占位命令：

```sh
pnpm dev
```

## 构建

生成静态站点：

```sh
pnpm build
```

输出目录固定为：

```text
dist/
```

验证构建结果：

```sh
pnpm validate:build
```

## 预览

当前 `pnpm preview` 还是占位命令。因为输出是纯静态文件，你可以用任意静态文件服务器预览 `dist/`，例如：

```sh
npx serve dist
```

## 后台

启动可选后台：

```sh
pnpm admin
```

默认地址：

```text
http://localhost:4173
```

可用环境变量：

- `ADMIN_PORT`：修改后台端口。
- `BLOG_ROOT`：让后台管理另一个博客根目录。

后台目前支持初始化单个管理员账号、登录和退出、管理文章与页面、编辑站点/主题/插件配置、切换主题、启用或停用插件、预览 Markdown，以及触发静态构建。

安全说明：

- 后台数据存放在 `data/admin/`。
- `data/admin/` 已加入 gitignore。
- 密码使用 PBKDF2 哈希，不保存明文。
- 会话 Cookie 使用 `HttpOnly`、`SameSite=Lax` 和 `Path=/`。
- 后台写入范围限制在 `content/posts/*.md`、`content/pages/*.md`、`config/site.json`、`config/theme.json`、`config/plugins.json`。
- 删除的 Markdown 文件会被移动到 `data/admin/trash`。

后台不参与 `pnpm build`。生成后的 `dist/` 静态站点也不依赖后台服务。

## 主题系统

主题放在 `themes/<theme-name>/`：

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

当前主题由 `config/theme.json` 指定。

主题负责布局、插槽、CSS 和设置。默认主题支持：

- `accentColor`
- `layout`
- `showSidebar`
- `animation`

模板语法保持很轻，只做简单的点路径变量替换，例如：

- `{{site.title}}`
- `{{site.description}}`
- `{{content.title}}`
- `{{content.content}}`
- `{{theme.accentColor}}`

## 插件系统

插件放在 `plugins/<plugin-name>/`，并通过 `config/plugins.json` 启用：

```json
{
  "enabled": ["plugin-seo", "plugin-rss", "plugin-search"]
}
```

当前支持的 hooks：

- `onBuildStart`
- `transformMarkdown`
- `injectHead`
- `injectBodyEnd`
- `onBuildEnd`

示例插件会注入 SEO 元信息、生成 `rss.xml`，以及生成 `search-index.json`。

插件是可选的。即使没有启用任何插件，站点也可以正常构建。

## 部署

### GitHub Pages

项目已经包含 `.github/workflows/pages.yml`。

这个 workflow 会：

1. 安装依赖。
2. 执行 `pnpm typecheck`。
3. 执行 `pnpm build`。
4. 执行 `pnpm validate:build`。
5. 上传 `dist/`。
6. 将 `dist/` 部署到 GitHub Pages。

如果仓库地址对应的 Pages 站点是 `https://<user>.github.io/<repo>/`，请把 `config/site.json` 里的 `baseUrl` 设置成：

```json
{
  "baseUrl": "https://<user>.github.io/<repo>"
}
```

不要在末尾加斜杠。这样 sitemap 和 RSS 里的链接会自动包含 GitHub Pages 的子路径。

在 GitHub 仓库设置中启用 Pages，并选择 GitHub Actions 作为 Pages 来源。

### Cloudflare Pages

在 Cloudflare Pages 里连接这个仓库。

推荐配置：

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js version: `22`

把 `baseUrl` 设置为 Cloudflare Pages 域名或你的自定义域名：

```json
{
  "baseUrl": "https://example.pages.dev"
}
```

### Docker

生成结果是静态文件，所以 Docker 只需要负责托管 `dist/`。

一种简单方式：

```sh
pnpm install --frozen-lockfile
pnpm build
docker run --rm -p 8080:80 -v "$PWD/dist:/usr/share/nginx/html:ro" nginx:alpine
```

### VPS

你可以在本地或服务器上构建：

```sh
pnpm install --frozen-lockfile
pnpm build
```

然后用 Nginx、Caddy、Apache 或任何静态文件服务器托管 `dist/`。后台面板建议单独运行，只在你明确需要文件编辑权限的环境中开启。

## 作者

kizu (伊甸黎明)

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
