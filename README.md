# Kizu Blog

[English](./README.md) | [简体中文](./README.zh.md)

A static-first, theme-driven blog engine.

No database. No framework. Just Markdown, themes, and full control.

---

## ✨ Features

- 📝 Markdown as the source of truth  
- 🎨 Theme system with official spec  
- 🔌 Optional plugin system  
- 🔍 Built-in static search (Ctrl / Cmd + K)  
- 🌐 Automatic English / Chinese UI  
- ⚡ Zero backend required  
- 🧩 Admin panel (optional, file-based)  

---

## 🚀 Quick Start

```bash
pnpm install
pnpm build
```

Open:

```
dist/index.html
```

---

## 🧠 Philosophy

- Content lives in files, not databases  
- Output is static and portable  
- Themes define presentation, not logic  
- The system stays small and predictable  

---

## 🎨 Theme System

- Official theme specification  
- Stable template variables  
- Theme settings schema  
- Starter theme for learning  

See:

- docs/theme-spec.md
- docs/theme-spec.zh.md
- themes/starter/

---

## 🔍 Search

Command-style static search powered by search-index.json.

- Ctrl / Cmd + K  
- Keyboard navigation  
- No external service required  

---

## 🌐 i18n

- UI switches automatically (English / Chinese)  
- Based on browser language  
- Markdown content is never translated  

---

## 🧩 Admin Panel (Optional)

```bash
pnpm admin
```

- Edit Markdown content  
- Manage config  
- Switch themes  
- Manage plugins  
- Trigger build  

---

## 📦 Deployment

Deploy `dist/` to any static hosting:

- GitHub Pages  
- Cloudflare Pages  
- Vercel  
- Any static server  

---

## 📌 Status

Current version: v0.3.1

Stable for personal use. Theme ecosystem is defined and evolving.

---

## 👤 Author

kizu
