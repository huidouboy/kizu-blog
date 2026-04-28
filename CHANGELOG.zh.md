# 更新日志

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh.md)

## v0.2.0 - 国际化与默认体验打磨

作者：kizu (伊甸黎明)

### 重点内容

- 新增内置 UI 文案的中英文自动切换。
- `config/site.json` 支持 `auto`、`en`、`zh-CN` 三种语言模式。
- 用户自己写的 Markdown 内容不会被自动翻译，只有内置界面文案会切换语言。
- 后台界面、按钮、空状态和常见校验错误增加中英文文案。
- 首次初始化后台时，会根据管理员语言生成对应语言的示例内容。
- 优化默认主题的排版、间距、文章卡片、归档页、标签页和阅读页。
- 加强构建验证，覆盖中英文静态输出和后台示例内容安全性。

### 验证

- `pnpm typecheck`
- `pnpm build`
- `pnpm validate:build`

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
