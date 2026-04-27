# Kizu Blog 主题制作规范

本文档是 Kizu Blog 的主题制作基线。之后为这个项目制作新主题时，应优先遵守这份规范，而不是临时读取核心源码里的私有实现。

## 1. 设计目标

Kizu Blog 的主题系统融合三类博客系统的长处：

- Typecho 的轻量：主题文件结构直接，配置少而清晰。
- WordPress 的成熟：manifest、模板层级、partial、导航、归档视图都有固定约定。
- Hexo 的静态体验：主题最终参与静态生成，输出结果可部署到任意静态环境。

主题系统必须同时满足：

- 稳定：主题只能依赖公开上下文和公开语法。
- 兼容：新增主题能力时保持旧模板可回退。
- 美观：规范不仅定义文件位置，也定义排版、响应式和可访问要求。
- 可扩展：允许为具体页面覆盖模板，允许通过 slot 注入附加内容。

## 2. 主题目录

一个主题必须放在 `themes/{theme-name}/` 下：

```text
themes/example-theme/
  theme.json
  templates/
    home.html
    post.html
    page.html
    archive.html
    404.html
  partials/
    document-open.html
    document-close.html
    site-header.html
    site-footer.html
  assets/
    css/main.css
    images/
```

最小可用主题至少需要：

- `theme.json`
- `templates/index.html` 或 `templates/home.html`
- `templates/post.html` 或 `templates/singular.html`
- `templates/page.html` 或 `templates/singular.html`
- `templates/archive.html`

## 3. theme.json

`theme.json` 是主题契约的入口。

```json
{
  "name": "example-theme",
  "displayName": "Example Theme",
  "version": "0.1.0",
  "engine": ">=0.1.0",
  "author": "Theme Author",
  "description": "Short theme description.",
  "assets": "assets",
  "capabilities": [
    "template-hierarchy",
    "partials",
    "slots",
    "responsive-layout"
  ],
  "slots": [
    "head",
    "beforeContent",
    "afterContent",
    "footer"
  ],
  "defaults": {
    "accent": "#d84f3f",
    "surface": "#fffaf4"
  }
}
```

字段说明：

- `name`：目录名级别的稳定 ID，只用小写字母、数字和连字符。
- `displayName`：显示名称。
- `version`：主题版本，建议语义化版本。
- `engine`：兼容的 Kizu Blog 主题 API 范围。
- `assets`：静态资源目录，构建后复制到 `/assets/`。
- `capabilities`：主题能力声明，供未来主题市场、检查器或后台使用。
- `slots`：主题愿意暴露的插入点。
- `defaults`：主题默认配置，会被 `site.config.json` 的 `themeConfig` 覆盖。

## 4. 模板语法

Kizu Blog 当前模板语法是有意克制的，避免主题变成任意脚本。

变量转义输出：

```html
{{ post.title }}
```

原样 HTML 输出：

```html
{{{ post.html }}}
```

条件：

```html
{{#if post.cover}}
  <img src="{{ post.cover }}" alt="">
{{/if}}
```

循环：

```html
{{#each posts}}
  <a href="{{ this.path }}">{{ this.title }}</a>
{{/each}}
```

局部模板：

```html
{{> site-header}}
```

注意事项：

- 普通变量会自动 HTML 转义。
- 只有已经由核心生成的 HTML，例如 `post.html`、`page.html`，才使用三花括号。
- 不要在模板中写复杂业务逻辑。需要新数据时，应扩展公开上下文。

## 5. 模板层级

构建器会按候选顺序查找模板，找到第一个存在的模板。

首页：

```text
home.html -> index.html
```

文章页：

```text
post-{slug}.html -> post.html -> singular.html -> index.html
```

独立页面：

```text
page-{slug}.html -> page.html -> singular.html -> index.html
```

归档、标签、分类：

```text
archive.html -> index.html
```

404：

```text
404.html -> index.html
```

未来版本可以加入更细的 `tag-{slug}.html`、`category-{slug}.html`，但主题必须保留通用回退模板。

## 6. 公开数据上下文

所有模板都能访问：

```text
site              站点配置
theme             合并后的主题配置
navigation        导航数组
posts             当前视图文章列表
pages             独立页面列表
latestPosts       最近文章
featuredPosts     精选文章
collections.tags  标签集合
collections.categories 分类集合
slot              插入点对象
view              当前视图名称
pageTitle         当前页面标题
description       当前页面描述
```

文章模板额外包含：

```text
post.title
post.slug
post.path
post.date
post.displayDate
post.description
post.excerpt
post.cover
post.tags
post.categories
post.readingTime
post.html
```

页面模板额外包含：

```text
page.title
page.slug
page.path
page.description
page.html
```

归档模板额外包含：

```text
archive.name
archive.type
archive.posts
```

## 7. Slot 规范

当前核心提供这些 slot：

- `slot.head`：插入 `<head>` 内的附加标签。
- `slot.beforeContent`：主内容前。
- `slot.afterContent`：主内容后。
- `slot.footer`：页脚内。

主题必须把 slot 放在语义合理的位置。slot 只能作为扩展入口，不应承担主题主结构。

## 8. CSS 与设计规范

主题必须满足：

- 响应式布局至少覆盖 360px、768px、1024px、1440px 宽度。
- 正文字号建议不小于 16px，文章行宽建议控制在 68 到 78 字符。
- 不使用负 letter spacing。
- 交互元素需要有 hover 与 focus 状态。
- 图片必须设置稳定尺寸、比例或容器，避免布局跳动。
- 卡片圆角不超过 8px，除非主题 manifest 明确声明特殊视觉语言。
- 页面区块不应全部做成浮动卡片；卡片适合文章项、列表项、弹窗和工具面板。
- 颜色不应只依赖单一色相，必须提供清晰文本对比度。

主题建议提供 CSS 变量：

```css
:root {
  --theme-accent: #d84f3f;
  --theme-surface: #fffaf4;
  --ink: #24211f;
  --muted: #6f6964;
  --line: #ded7ce;
}
```

## 9. 可访问性

主题必须：

- 保留跳转到内容的链接。
- 使用语义标签：`header`、`nav`、`main`、`article`、`section`、`footer`。
- 导航提供 `aria-label`。
- 装饰图片使用空 `alt=""`，内容图片使用准确 alt。
- 颜色不能作为唯一信息来源。
- 焦点状态必须可见。

## 10. 内容兼容

主题必须正确处理内容缺省值：

- 没有 `cover` 时，文章页和卡片不能出现破图。
- 没有 `tags` 或 `categories` 时，列表区域不能破坏布局。
- 没有精选文章时，首页仍然能显示文章流。
- 文章标题过长时，不能溢出容器。

## 11. 新主题制作流程

1. 复制 `themes/neo-journal/` 为新目录。
2. 修改 `theme.json` 的 `name`、`displayName`、`version`。
3. 保留基础模板，先确认 `node scripts/build.mjs` 能成功。
4. 再改 CSS 和 partial，最后再做特殊模板覆盖。
5. 在 360px、768px、1280px 视口检查首页、文章页、归档页和 404。
6. 不要修改 `src/core` 来满足单个主题需求；需要扩展时先更新主题规范。

## 12. 禁止事项

- 不要在主题中读取磁盘文件。
- 不要假设构建器内部模块路径。
- 不要把核心页面结构全部依赖 JavaScript 渲染。
- 不要覆盖 `/assets/` 之外的输出路径。
- 不要用未声明的全局变量或远程脚本作为主题基础能力。
- 不要为了单个主题改动全局内容模型，除非同时更新规范和示例主题。

## 13. 当前限制与后续方向

当前版本是稳定主题契约的第一版，暂不包含在线后台、评论系统、插件运行时和复杂模板 helper。

建议后续扩展：

- 增加主题校验脚本。
- 增加 `tag-{slug}.html` 与 `category-{slug}.html` 覆盖。
- 增加主题配置 schema。
- 增加搜索索引生成。
- 增加插件式 slot 注入源。
