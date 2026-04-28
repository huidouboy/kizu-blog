import { readFile } from "node:fs/promises";
import nodePath from "node:path";

import type {
  ThemeConfig,
  ThemeManifest,
  ThemePages,
  ThemeSettingDefinition,
} from "@static-blog/types";

export interface LoadThemeOptions {
  rootDir?: string;
}

export interface LoadedTheme {
  name: string;
  rootDir: string;
  manifest: ThemeManifest;
  layouts: ThemeLayouts;
  settings: Record<string, string>;
}

export interface ThemeLayouts {
  home: string;
  post: string;
  page: string;
  archive: string;
  tag?: string;
}

export async function loadActiveTheme(options: LoadThemeOptions = {}): Promise<LoadedTheme> {
  const rootDir = nodePath.resolve(options.rootDir ?? process.cwd());
  const themeConfig = await loadThemeConfig(nodePath.join(rootDir, "config", "theme.json"));
  const themeRootDir = nodePath.join(rootDir, "themes", themeConfig.theme);
  const manifest = await loadThemeManifest(nodePath.join(themeRootDir, "theme.json"));
  const layouts = await loadThemeLayouts(themeRootDir, manifest.pages);

  return {
    name: themeConfig.theme,
    rootDir: themeRootDir,
    manifest,
    layouts,
    settings: resolveThemeSettings(manifest.settings ?? {}, themeConfig.settings ?? {}),
  };
}

export async function loadThemeConfig(configPath: string): Promise<ThemeConfig> {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { theme: "default" };
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${configPath}: invalid JSON in theme config. ${error.message}`);
    }

    throw error;
  }

  if (!isRecord(parsedConfig)) {
    throw new Error(`${configPath}: expected a JSON object.`);
  }

  const theme = optionalString(parsedConfig.theme, "theme", configPath) ?? "default";
  const settings = optionalStringRecord(parsedConfig.settings, "settings", configPath);

  return { theme, settings };
}

export async function loadThemeManifest(manifestPath: string): Promise<ThemeManifest> {
  let parsedManifest: unknown;

  try {
    parsedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Missing theme manifest: ${manifestPath}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${manifestPath}: invalid JSON in theme manifest. ${error.message}`);
    }

    throw error;
  }

  if (!isRecord(parsedManifest)) {
    throw new Error(`${manifestPath}: expected a JSON object.`);
  }

  const manifest: ThemeManifest = {
    name: requireString(parsedManifest.name, "name", manifestPath),
    version: requireString(parsedManifest.version, "version", manifestPath),
    slots: requireStringArray(parsedManifest.slots, "slots", manifestPath),
    pages: requireThemePages(parsedManifest.pages, manifestPath),
    settings: optionalThemeSettings(parsedManifest.settings, manifestPath),
    description: optionalString(parsedManifest.description, "description", manifestPath),
    author: optionalString(parsedManifest.author, "author", manifestPath),
  };

  return manifest;
}

export async function loadThemeLayouts(
  themeRootDir: string,
  pages: ThemePages,
): Promise<ThemeLayouts> {
  return {
    home: await readThemeFile(themeRootDir, pages.home),
    post: await readThemeFile(themeRootDir, pages.post),
    page: await readThemeFile(themeRootDir, pages.page),
    archive: await readThemeFile(themeRootDir, pages.archive),
    tag: pages.tag ? await readThemeFile(themeRootDir, pages.tag) : undefined,
  };
}

export function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replaceAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = resolveTemplateValue(values, path);

    return stringifyTemplateValue(value);
  });
}

function stringifyTemplateValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean"
          ? String(item)
          : "",
      )
      .filter(Boolean)
      .join(", ");
  }

  return "";
}

function resolveThemeSettings(
  definitions: Record<string, ThemeSettingDefinition>,
  overrides: Record<string, string>,
): Record<string, string> {
  const settings: Record<string, string> = {};

  for (const [key, definition] of Object.entries(definitions)) {
    settings[key] = definition.default;
  }

  for (const [key, value] of Object.entries(overrides)) {
    const definition = definitions[key];

    if (!definition) {
      settings[key] = value;
      continue;
    }

    if (definition.type === "select" && !definition.options.includes(value)) {
      throw new Error(
        `Invalid theme setting "${key}": expected one of ${definition.options.join(", ")}.`,
      );
    }

    settings[key] = value;
  }

  return settings;
}

async function readThemeFile(themeRootDir: string, relativePath: string): Promise<string> {
  const filePath = nodePath.resolve(themeRootDir, relativePath);

  assertInsideRoot(themeRootDir, filePath);

  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Missing theme layout file: ${relativePath} (${filePath})`);
    }

    throw error;
  }
}

function assertInsideRoot(rootDir: string, targetPath: string): void {
  const relativePath = nodePath.relative(rootDir, targetPath);

  if (relativePath.startsWith("..") || nodePath.isAbsolute(relativePath)) {
    throw new Error(`Refusing to read theme file outside theme root: ${targetPath}`);
  }
}

function requireThemePages(value: unknown, filePath: string): ThemePages {
  if (!isRecord(value)) {
    throw new Error(`${filePath}: expected "pages" to be an object.`);
  }

  return {
    home: requireString(value.home, "pages.home", filePath),
    post: requireString(value.post, "pages.post", filePath),
    page: requireString(value.page, "pages.page", filePath),
    archive: requireString(value.archive, "pages.archive", filePath),
    tag: optionalString(value.tag, "pages.tag", filePath),
  };
}

function optionalThemeSettings(
  value: unknown,
  filePath: string,
): Record<string, ThemeSettingDefinition> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${filePath}: expected "settings" to be an object.`);
  }

  const settings: Record<string, ThemeSettingDefinition> = {};

  for (const [key, definition] of Object.entries(value)) {
    if (!isRecord(definition)) {
      throw new Error(`${filePath}: expected "settings.${key}" to be an object.`);
    }

    const type = requireString(definition.type, `settings.${key}.type`, filePath);

    if (type === "color") {
      settings[key] = {
        type,
        default: requireString(definition.default, `settings.${key}.default`, filePath),
      };
      continue;
    }

    if (type === "select") {
      settings[key] = {
        type,
        options: requireStringArray(definition.options, `settings.${key}.options`, filePath),
        default: requireString(definition.default, `settings.${key}.default`, filePath),
      };
      continue;
    }

    throw new Error(`${filePath}: unsupported theme setting type "${type}".`);
  }

  return settings;
}

function resolveTemplateValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((currentValue, key) => {
    if (!isRecord(currentValue)) {
      return undefined;
    }

    return currentValue[key];
  }, value);
}

function optionalStringRecord(
  value: unknown,
  key: string,
  filePath: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${filePath}: expected "${key}" to be an object.`);
  }

  const record: Record<string, string> = {};

  for (const [recordKey, recordValue] of Object.entries(value)) {
    if (typeof recordValue !== "string") {
      throw new Error(`${filePath}: expected "${key}.${recordKey}" to be a string.`);
    }

    record[recordKey] = recordValue;
  }

  return record;
}

function requireStringArray(value: unknown, key: string, filePath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${filePath}: expected "${key}" to be a string array.`);
  }

  return value;
}

function requireString(value: unknown, key: string, filePath: string): string {
  const stringValue = optionalString(value, key, filePath);

  if (!stringValue) {
    throw new Error(`${filePath}: expected "${key}" to be a non-empty string.`);
  }

  return stringValue;
}

function optionalString(value: unknown, key: string, filePath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${filePath}: expected "${key}" to be a string.`);
  }

  const trimmedValue = value.trim();

  return trimmedValue || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
