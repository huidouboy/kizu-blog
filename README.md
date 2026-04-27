# Kizu Blog / Kizu CMS

当前稳定版本：`0.1.0`

这是一个零依赖 Node.js 博客 CMS。它不只是前端主题，而是包含：

- 首次部署安装向导：没有管理员时自动引导创建管理员账号。
- 公开前台：只展示博客内容、归档、关于页、账号入口和评论。
- 登录注册：管理员存在后，普通用户可从前台头像按钮打开登录/注册弹窗。
- 管理后台：文章、页面、用户、评论、站点设置、主题切换、主题规范。
- 主题系统：`theme.json + templates + partials + assets + slot`，保留美观和扩展边界。
- 静态构建：仍可生成 `public/`，适合后续部署静态副本。

默认站点名是 `Kizu Blog`，默认署名是 `Kizu Blog © 2026 by 伊甸黎明`。站点名和署名可以在后台设置里修改。

## 启动 CMS

```powershell
node scripts/start.mjs
```

打开：

```text
http://localhost:4173
```

后台：

```text
http://localhost:4173/admin/
```

第一次启动时，如果还没有管理员账号，前台和后台都会显示安装向导。

## 纯净测试部署

为了保持源代码目录干净，可以把项目部署到同级测试目录再运行：

```powershell
node scripts/deploy-test.mjs
```

默认会复制当前源码到：

```text
E:\codex\kizu-blog-test
```

脚本会清理测试目录、跳过 `data/` 和 `public/`，并杀掉占用测试端口的旧进程后重新启动。源项目里的真实数据不会被复制到测试目录。

可选环境变量：

```powershell
$env:KIZU_TEST_PORT='4188'
$env:KIZU_TEST_TARGET='E:\codex\kizu-blog-test-4188'
node scripts/deploy-test.mjs
```

## 升级系统

查看当前版本和最近一次升级记录：

```powershell
node scripts/upgrade.mjs --status
```

从本地目录或压缩包升级：

```powershell
node scripts/upgrade.mjs --from E:\release\kizu-blog-v0.2.0
node scripts/upgrade.mjs --package E:\release\kizu-blog-v0.2.0.zip
```

从 Git 仓库升级：

```powershell
node scripts/upgrade.mjs --git https://github.com/you/kizu-blog.git --ref main
```

管理员也可以在后台的“升级”面板里上传版本包或填写 Git 仓库地址执行升级。升级会自动备份当前内置源码，并保留 `data/`、`public/`、`.git/`、`node_modules/` 和非内置主题目录。更完整说明见 `docs/upgrading.md`。

## 导出纯净源码

导出一个适合上传 GitHub、给其他设备拉取部署的纯净版本目录：

```powershell
node scripts/export-release.mjs
```

默认会输出到：

```text
E:\codex\kizu-blog-v0.1.0
```

## 静态构建

```powershell
node scripts/build.mjs
```

构建结果输出到 `public/`。静态构建适合导出展示，但日常写作和账号管理请使用 `node scripts/start.mjs`。

## 目录结构

```text
admin/             管理后台单页应用
content/           初始 Markdown 内容
data/              CMS 本地 JSON 数据库，首次启动自动生成
docs/              项目文档和主题规范
public/            静态构建输出
scripts/           启动、构建、清理脚本
src/core/          Markdown、模板、主题、静态生成核心
src/server/        CMS 后端、账号、会话、API、动态渲染
themes/            前台主题
```

## 主题制作规范

公开主站不会展示主题制作规范。规范放在：

```text
docs/theme-authoring.md
themes/neo-journal/THEME_AUTHORING.md
```

后台也提供“主题规范”面板，给管理员和主题作者查看。
