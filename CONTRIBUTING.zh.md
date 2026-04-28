# 贡献指南

[English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING.zh.md)

感谢你愿意为 Static-first Blog Engine 做贡献。

这个项目会刻意保持克制：内容以 Markdown 为准，配置以 JSON 为准，最终输出可移植的静态 HTML。

## 项目原则

- Markdown 是内容主存储。
- 配置保存在 JSON 文件中。
- 生成后的站点必须保持静态、可移植。
- 后台面板必须保持可选。
- Core、主题、插件、后台之间要保持解耦。
- 除非能明确解决实际问题，否则不要引入重依赖。

## 开发环境

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm validate:build
```

## Pull Request 建议

- 让改动保持聚焦。
- 优先提交小而清晰的补丁，避免大范围重写。
- 行为变化时，请补充或更新验证。
- 不要把数据库变成内容源。
- 不要让后台成为静态构建的必需项。
- 面向用户的行为发生变化时，请同时更新中英文文档。

## 代码区域

- `packages/core`：内容加载、主题加载、插件加载和引擎工具
- `packages/cli`：CLI 命令和静态构建流程
- `packages/types`：共享 TypeScript 类型
- `apps/admin`：可选的文件型后台
- `themes/default`：默认主题文件
- `plugins/*`：本地示例插件

## 提交前验证

请运行：

```sh
pnpm typecheck
pnpm build
pnpm validate:build
```

如果某条命令无法运行，请在 PR 里说明原因。

## 文档

项目文档采用中英文双语。行为变化时，请更新：

- `README.md`
- `README.zh.md`
- 相关的英文和中文文档

中文文档应该像正常中文技术文档一样自然，不要逐词硬翻。

## 安全相关改动

如果改动涉及后台认证、文件写入、插件加载或部署，请尽量保持补丁小而明确，并在 PR 中说明风险边界。
