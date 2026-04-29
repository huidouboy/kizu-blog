# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

一个静态优先、主题驱动的博客引擎。

没有数据库，没有框架，只有 Markdown、主题和完全的掌控权。

---

## ✨ 特性

- 📝 Markdown 作为唯一内容来源  
- 🎨 完整的主题系统与官方规范  
- 🔌 可选插件系统  
- 🔍 内置静态搜索（Ctrl / Cmd + K）  
- 🌐 自动中英文 UI 切换  
- ⚡ 无需后端  
- 🧩 可选后台管理（基于文件）  

---

## 🚀 快速开始

```bash
pnpm install
pnpm build
```

打开：

```
dist/index.html
```

---

## 🧠 设计理念

- 内容应存储在文件中，而不是数据库  
- 输出必须是纯静态、可移植  
- 主题只负责展示，不负责逻辑  
- 系统应保持简单、可预测  

---

## 🎨 主题系统

- 官方主题规范  
- 稳定的模板变量  
- 主题设置 schema  
- starter 教学主题  

参考：

- docs/theme-spec.md
- docs/theme-spec.zh.md
- themes/starter/

---

## 🔍 搜索

基于 search-index.json 的静态搜索：

- Ctrl / Cmd + K  
- 键盘导航  
- 无需第三方服务  

---

## 🌐 多语言

- UI 自动在中文 / 英文之间切换  
- 根据浏览器语言判断  
- Markdown 内容不会自动翻译  

---

## 🧩 后台管理（可选）

```bash
pnpm admin
```

- 编辑 Markdown 内容  
- 管理配置  
- 切换主题  
- 管理插件  
- 触发构建  

---

## 📦 部署

将 `dist/` 部署到任意静态托管：

- GitHub Pages  
- Cloudflare Pages  
- Vercel  
- 任意静态服务器  

---

## 📌 当前状态

当前版本：v0.3.1

已适合个人使用，主题生态已建立，但仍在演进中。

---

## 👤 作者

kizu
