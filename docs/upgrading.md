# Kizu Blog 升级说明

当前项目版本是 `0.1.0`。

## 升级原则

Kizu Blog 的升级不会覆盖这些目录：

- `data/`
- `public/`
- `node_modules/`
- `.git/`
- `.kizu/`
- `themes/` 下不属于内置主题的目录

升级会替换这些内置源码区域：

- `.gitignore`
- `package.json`
- `README.md`
- `site.config.json`
- `admin/`
- `content/`
- `docs/`
- `scripts/`
- `src/`
- `themes/neo-journal/`

每次真正执行升级前，系统会自动备份当前项目内置源码和 `data/` 到：

```text
.kizu/backups/
```

## 命令行升级

查看当前版本和最近一次升级记录：

```powershell
node scripts/upgrade.mjs --status
```

从本地目录升级：

```powershell
node scripts/upgrade.mjs --from E:\releases\kizu-blog-v0.2.0
```

从本地压缩包升级：

```powershell
node scripts/upgrade.mjs --package E:\releases\kizu-blog-v0.2.0.zip
```

从 Git 仓库升级：

```powershell
node scripts/upgrade.mjs --git https://github.com/you/kizu-blog.git --ref main
```

只预演，不真正写入：

```powershell
node scripts/upgrade.mjs --git https://github.com/you/kizu-blog.git --ref main --dry-run
```

## 后台升级

管理员在后台的“升级”面板中可以：

- 上传 `.zip` 版本包直接升级
- 填写 Git 仓库地址和分支或标签执行升级
- 查看当前版本、最近升级记录和备份位置

升级完成后，当前运行中的服务需要手动重启，新代码才会完全生效。

## 导出干净版本

导出一个适合上传 GitHub 的纯净源码目录：

```powershell
node scripts/export-release.mjs
```

默认输出到：

```text
E:\codex\kizu-blog-v0.1.0
```

也可以自定义目标目录：

```powershell
node scripts/export-release.mjs --target E:\release\kizu-blog-v0.1.0
```

导出的目录不会包含本地账号、评论、会话、构建产物和升级备份。
