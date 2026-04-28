# 更新日志

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh.md)

## v0.1.0 - 首个开源版本

作者：kizu (伊甸黎明)

这是 Static-first Blog Engine 的第一个公开版本。

### 重点内容

- 静态优先的博客引擎，构建结果输出到 `dist/`，可以直接托管为静态站点。
- Markdown 是文章和页面的内容源。
- 站点、主题、插件配置继续以 JSON 文件为准。
- 主题系统支持布局、样式、插槽和可配置设置。
- 插件系统支持构建生命周期、Markdown 转换和 HTML 注入。
- 提供 SEO 元信息、RSS、搜索索引三个示例插件。
- 可选的文件型后台，可管理 Markdown 内容和配置文件。
- 内置 GitHub Pages 部署 workflow，用于发布 `dist/`。
- 提供英文与简体中文双语文档。

### 验证

- `pnpm typecheck`
- `pnpm build`
- `pnpm validate:build`
