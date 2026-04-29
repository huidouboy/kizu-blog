# 主题规范

Kizu Blog 的主题是基于文件夹的主题包，用来控制页面布局、样式、静态资源和可配置的视觉选项。主题应该依赖这份文档中公开的模板变量，而不是依赖构建器内部实现细节。

这份规范描述当前引擎线的稳定主题契约。

## 目录结构

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

必需文件：

- `theme.json`
- `layouts/home.html`
- `layouts/post.html`
- `layouts/page.html`
- `layouts/archive.html`
- `layouts/tag.html`

可选文件：

- `styles/tokens.css`
- `styles/global.css`
- `styles/*.css`
- `styles/*.js`
- `assets/**`

引擎会忽略未知文件，除非布局通过已复制的 `styles/` 或 `assets/` 路径主动引用它们。

## theme.json

`theme.json` 是主题清单。可选字段缺失时，引擎会使用安全默认值。

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

字段说明：

- `name`：机器可读的主题名，默认使用文件夹名。
- `displayName`：展示给人的主题名。
- `version`：主题版本，默认是 `0.0.0`。
- `description`：主题简介。
- `author`：主题作者。
- `engine.version`：可选的兼容性说明，例如 `>=0.3.0`。当前引擎会记录这个字段，但不会做复杂的 semver 匹配。
- `slots`：可选的布局区域列表，默认是 `["header", "main", "footer"]`。
- `pages`：可选的布局路径映射，默认使用官方 `layouts/*.html` 路径。
- `settings`：主题可配置项。

如果需要自定义布局路径，可以提供 `pages`：

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

支持的设置类型：

- `color`：默认值是字符串，适合直接用于 CSS。
- `select`：默认值是字符串，并且必须出现在 `options` 中。
- `boolean`：默认值是布尔值，在模板中会以 `"true"` 或 `"false"` 暴露。

用户覆盖项写在 `config/theme.json`：

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

为了兼容旧配置，布尔设置既可以写成 JSON 布尔值，也可以写成 `"true"` / `"false"` 字符串。

## 布局文件

布局文件就是普通 HTML，加上简单的变量替换。引擎不提供循环、条件判断，也不会引入完整模板引擎。

示例：

```html
<title>{{content.title}} - {{site.title}}</title>
<main>{{content.content}}</main>
```

变量不存在时会渲染为空字符串。

## 公开模板变量

### site

- `{{site.title}}`
- `{{site.description}}`
- `{{site.author}}`
- `{{site.language}}`
- `{{site.navigation}}`

`site.navigation` 是已经渲染好的导航 HTML。

### content

- `{{content.type}}`：`home`、`post`、`page`、`archive` 或 `tag`
- `{{content.title}}`
- `{{content.description}}`
- `{{content.content}}`
- `{{content.date}}`
- `{{content.tags}}`
- `{{content.readingTime}}`
- `{{content.previous}}`
- `{{content.next}}`

`content.content`、`content.tags`、`content.previous`、`content.next` 可能包含已经渲染好的 HTML。

目前仍保留这些兼容变量：

- `{{post.title}}`、`{{post.content}}`、`{{post.date}}`、`{{post.tags}}`
- `{{page.title}}`、`{{page.content}}`
- `{{content.previousPost}}`、`{{content.nextPost}}`

新主题建议优先使用统一的 `content.*`。

### theme

- `{{theme.*}}`：解析后的设置值，例如 `{{theme.accentColor}}`
- `{{theme.settings.*}}`：同一批设置的稳定命名空间，例如 `{{theme.settings.accentColor}}`

### ui

内置 UI 文案：

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

引擎还会暴露一些默认主题当前使用的内部文案，但第三方主题应该把上面这组视为稳定契约。

### 其他上下文

渲染上下文还包含：

- `{{path}}`：当前路由路径，例如 `/posts/hello-world/`
- `posts`：文章列表数据，供内部渲染辅助逻辑和未来兼容使用
- `pages`：页面列表数据，供内部渲染辅助逻辑和未来兼容使用
- `tags`：标签列表数据，供内部渲染辅助逻辑和未来兼容使用

当前的简单模板替换器不会直接循环对象数组。主题需要列表时，应使用 `content.content` 或布局专用别名里已经渲染好的 HTML。

## i18n 行为

内置 UI 文案支持英文和中文。如果 `config/site.json` 中设置 `"language": "auto"`，静态前台会用一小段内联脚本检测浏览器语言：以 `zh` 开头的语言显示中文，其余语言显示英文。

主题里的界面文案应该使用 `ui.*`，不要把内置 UI 文案硬编码成某一种语言。用户自己写的 Markdown 文章和页面内容永远不会被自动翻译。

`site.description` 可以是字符串，也可以是多语言对象：

```json
{
  "description": {
    "en": "A static-first, theme-driven personal blog engine.",
    "zh-CN": "静态优先、主题驱动的个人博客引擎。"
  }
}
```

## CSS 与样式约定

主题 CSS 应该保持为可移植的静态 CSS。推荐约定：

- 把设计 token 放在 `styles/tokens.css`。
- 把全局主题样式放在 `styles/global.css`。
- 尽量少写运行时 JavaScript。
- 添加动画时尊重 `prefers-reduced-motion`。
- 在不同布局中使用稳定的相对路径引用 `assets/theme/...`。

构建时，引擎会复制：

- `themes/<theme>/styles/**` 到 `dist/assets/theme/`
- `themes/<theme>/assets/**` 到 `dist/assets/theme/assets/`

## 静态资源处理

主题资源必须留在主题目录内。构建器会拒绝读取主题根目录之外的布局文件，并且只会复制官方 `styles/` 和 `assets/` 目录中的文件。

路径示例：

- 首页 CSS：`assets/theme/global.css`
- 文章页 CSS：`../../assets/theme/global.css`
- 如果主题有 `assets/logo.svg`，首页引用路径是 `assets/theme/assets/logo.svg`

## 兼容性规则

主题作者应该：

- 只依赖文档中公开的变量。
- 保持布局静态、确定、可重复构建。
- 不假设某个插件一定存在。
- 不依赖后台管理应用。
- 保持 Markdown 作为内容源。
- 提供所有必需布局，包括 `tag.html`。
- 新主题优先使用 `theme.settings.*`，同时 `theme.*` 仍会继续兼容。

引擎会尽量保持兼容，但未文档化的内部实现可能变化。

## 创建新主题

1. 复制 `themes/starter/` 到 `themes/<your-theme>/`。
2. 更新 `theme.json` 中的名称、版本、作者和设置。
3. 编辑必需的布局文件。
4. 在 `styles/` 中添加 CSS。
5. 在 `assets/` 中添加可选图片或其他静态资源。
6. 修改 `config/theme.json`：

```json
{
  "theme": "your-theme",
  "settings": {
    "accentColor": "#2563eb"
  }
}
```

7. 运行：

```bash
pnpm build
pnpm validate:build
```

