# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![静态输出](https://img.shields.io/badge/output-static%20HTML-blue)
![Version](https://img.shields.io/badge/version-v0.2.0-2f855a)

Kizu Blog 是一个静态优先的 Markdown 博客引擎。内容始终以 Markdown 文件为准，构建结果是可以直接部署的静态 HTML；主题、插件和可选后台彼此解耦，不会把项目绑成一个笨重系统。

当前版本：**v0.2.0**

## 功能

- 从 `content/posts` 和 `content/pages` 读取 Markdown 文章与页面
- 构建到 `dist/`，输出纯静态 HTML
- 主题系统支持布局、样式、配置项和 UI 区域
- 插件系统支持 Markdown 转换、HTML 注入和静态产物生成
- 可选后台可以编辑 Markdown 内容和 JSON 配置
- 内置 RSS、sitemap、搜索索引、归档页、标签页、阅读时间和上一篇/下一篇
- 内置 UI 文案自动中英文切换，但不会翻译用户写的正文
- 适合部署到 GitHub Pages
- 中英文文档同步维护

## 架构

```text
apps/
  admin/          可选在线后台
packages/
  core/           内容、主题、插件和渲染核心
  cli/            build/dev/preview/deploy 命令
  types/          共享 TypeScript 类型
  theme-default/ 默认主题包占位
themes/
  default/        当前默认主题
plugins/
  plugin-seo/
  plugin-rss/
  plugin-search/
```

`packages/core` 不依赖后台，也不依赖默认主题。生成后的静态站点不需要 Node.js，也不需要启动后台服务。

## 使用

安装依赖：

```bash
pnpm install
```

构建包和静态站点：

```bash
pnpm build
```

验证构建结果：

```bash
pnpm validate:build
```

启动可选后台：

```bash
pnpm admin
```

后台账号数据保存在 `data/admin/account.json`，密码会被哈希存储。后台只写入 Markdown 内容文件和 JSON 配置文件，不会把数据库变成内容源。

## UI 语言

在 `config/site.json` 中设置：

```json
{
  "language": "auto"
}
```

`auto` 会在静态前端根据访客浏览器语言自动选择界面语言。语言以 `zh` 开头时显示中文 UI，其余情况显示英文 UI。也可以显式设置为 `"zh-CN"` 或 `"en"`。

这只影响 Home、Archive、Tags、Reading time、Previous、Next 这类内置界面文案。用户自己写的 Markdown 文章和页面不会被自动翻译。

## 部署

推荐使用 GitHub Pages。`.github/workflows/deploy-pages.yml` 会安装依赖、执行类型检查、构建、验证，并把 `dist/` 部署出去。

Cloudflare Pages 可使用：

- 构建命令：`pnpm build`
- 输出目录：`dist`

Docker 或 VPS 部署时，只需要用任意静态文件服务器托管 `dist/`。

## 作者

kizu (伊甸黎明)

## 许可证

MIT
