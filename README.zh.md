# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

Kizu Blog 是一个静态优先、主题驱动的 Markdown 博客引擎，并提供可选的可视化后台。

Kizu Blog 始终把 Markdown 作为内容来源，构建结果输出到 `dist/`，可以直接部署到任意静态托管。主题、插件和后台彼此解耦，你可以把它当作完整博客系统使用，也可以只把它当作静态站点生成器使用。

## 快速开始：完整博客 + 后台

这是最适合新手的入口。它会构建静态博客，并启动可选后台，让你通过可视化界面管理站点。

```bash
git clone https://github.com/huidouboy/kizu-blog.git
cd kizu-blog
npm exec --yes pnpm@10.8.0 -- install
npm exec --yes pnpm@10.8.0 -- build
npm exec --yes pnpm@10.8.0 -- admin
```

如果你已经安装了 `pnpm`，也可以直接使用：

```bash
pnpm install
pnpm build
pnpm admin
```

打开：

```text
http://localhost:4173
```

首次访问时，后台会显示初始化页面，用于创建第一个管理员账号。密码会被哈希后保存。初始化过程中，系统可能会根据浏览器语言生成对应语言的示例内容。

初始化完成后，你可以在后台管理文章、页面、站点配置、主题设置、插件启用状态，并触发构建。公开站点仍然输出在 `dist/`。后台是可选能力，公开静态部署不依赖后台服务。

## 仅构建静态站点

如果你只想生成静态前端，不想启动后台服务，可以使用这个流程。

```bash
git clone https://github.com/huidouboy/kizu-blog.git
cd kizu-blog
npm exec --yes pnpm@10.8.0 -- install
npm exec --yes pnpm@10.8.0 -- build
```

如果你已经安装了 `pnpm`，也可以直接使用：

```bash
pnpm install
pnpm build
```

这只会生成 `dist/`，不会启动后台服务。你可以把 `dist/` 部署到 GitHub Pages、Cloudflare Pages 或任意静态托管服务。

## 进阶命令

```bash
pnpm build
pnpm validate:build
pnpm admin
pnpm typecheck
```

`pnpm build` 会构建 workspace 包并生成静态站点到 `dist/`。`pnpm validate:build` 会验证构建产物和项目边界。`pnpm admin` 会启动可选后台。`pnpm typecheck` 会运行整个 workspace 的 TypeScript 检查。

## 功能

- 从 `content/posts` 和 `content/pages` 读取 Markdown 文章与页面
- 构建纯静态 HTML 到 `dist/`
- 带官方规范的主题系统
- 为主题作者准备的 starter 教学主题
- 可选插件系统，用于 Markdown 转换和静态产物生成
- 可选文件驱动后台
- 内置 RSS、sitemap、归档页、标签页、阅读时间和上一篇/下一篇
- 基于 `search-index.json` 的内置静态搜索
- 内置 UI 自动中英文切换，但不会翻译 Markdown 正文
- 适合部署到 GitHub Pages 和 Cloudflare Pages

## 主题系统

主题负责控制布局、样式、资源和可配置项。第三方主题应使用官方主题规范，而不是依赖内部实现细节。

参考：

- [中文主题规范](./docs/theme-spec.zh.md)
- [Theme Spec](./docs/theme-spec.md)
- `themes/starter/`

## 搜索

默认主题内置类 command palette 的搜索浮层。它使用生成的静态 `search-index.json`，无需后端，并支持 `Ctrl+K` 或 `Cmd+K` 打开。

如果搜索插件被禁用，或 `search-index.json` 不存在，搜索界面会优雅显示失败状态，而不是让站点报错。

## i18n

在 `config/site.json` 中设置：

```json
{
  "language": "auto"
}
```

`auto` 会在静态前端根据访客浏览器语言自动选择界面语言。语言以 `zh` 开头时显示中文 UI，其余情况显示英文 UI。也可以显式设置为 `"zh-CN"` 或 `"en"`。

这只影响内置 UI 文案和内置默认/示例文案。用户自己写的 Markdown 文章和页面不会被自动翻译。

## 后台详情

后台是可选的，并以文件作为真实数据源。它会写入：

- `content/posts/*.md`
- `content/pages/*.md`
- `config/site.json`
- `config/theme.json`
- `config/plugins.json`

管理员账号数据保存在 `data/admin/account.json`。目前只支持单管理员账号。密码会被哈希存储，不会保存明文。

后台可以列表、创建、编辑、删除和预览内容；编辑站点配置；切换主题；根据 `theme.json` 编辑主题设置；启用或禁用插件；以及触发构建。

## 部署

公开站点就是静态目录 `dist/`。公开托管时不需要后台服务。

推荐使用 GitHub Pages。`.github/workflows/pages.yml` 会安装依赖、执行类型检查、构建、验证，并部署 `dist/`。

Cloudflare Pages 可使用：

- 构建命令：`pnpm build`
- 输出目录：`dist`

Docker、VPS、Vercel、Netlify 或任意静态文件服务器都可以托管 `dist/`。

## 当前状态

当前版本：**v0.3.1**

已适合个人使用。主题生态已经建立，并仍在持续演进。

## 作者

kizu

## 许可证

MIT
