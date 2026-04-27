import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readJson } from "./utils.mjs";

async function readTemplates(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const templates = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) {
      continue;
    }
    const name = entry.name.replace(/\.html$/, "");
    templates[name] = await readFile(join(dir, entry.name), "utf8");
  }

  return templates;
}

export async function loadTheme(config) {
  const root = join("themes", config.theme);
  const manifest = await readJson(join(root, "theme.json"));
  const templates = await readTemplates(join(root, "templates"));
  const partials = await readTemplates(join(root, "partials"));
  const assetPath = join(root, manifest.assets || "assets");
  const hasAssets = await stat(assetPath).then((value) => value.isDirectory()).catch(() => false);

  return {
    root,
    manifest,
    templates,
    partials,
    assetPath: hasAssets ? assetPath : null,
    config: {
      ...(manifest.defaults || {}),
      ...(config.themeConfig || {})
    }
  };
}

export function chooseTemplate(theme, candidates) {
  const match = candidates.find((candidate) => theme.templates[candidate]);
  if (!match) {
    throw new Error(`Theme ${theme.manifest.name} is missing templates: ${candidates.join(", ")}`);
  }
  return theme.templates[match];
}
