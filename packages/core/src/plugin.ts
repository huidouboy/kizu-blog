import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { pathToFileURL } from "node:url";

import type { Plugin, PluginContext } from "@static-blog/types";

export interface LoadPluginsOptions {
  rootDir?: string;
  configPath?: string;
  pluginsDir?: string;
}

interface PluginsConfig {
  enabled: string[];
}

type TypeScriptModule = typeof import("typescript");

export async function loadPlugins(options: LoadPluginsOptions = {}): Promise<Plugin[]> {
  const rootDir = nodePath.resolve(options.rootDir ?? process.cwd());
  const configPath = options.configPath ?? nodePath.join(rootDir, "config", "plugins.json");
  const pluginsDir = options.pluginsDir ?? nodePath.join(rootDir, "plugins");
  const config = await loadPluginsConfig(configPath);

  const plugins: Plugin[] = [];

  for (const pluginName of config.enabled) {
    const plugin = await loadPlugin(pluginName, pluginsDir, rootDir);
    plugins.push(plugin);
  }

  return plugins;
}

export async function runPluginHook(
  plugins: Plugin[],
  hookName: "onBuildStart" | "onBuildEnd",
  context: PluginContext,
): Promise<void> {
  for (const plugin of plugins) {
    await plugin.hooks?.[hookName]?.(context);
  }
}

export async function transformMarkdownWithPlugins(
  plugins: Plugin[],
  content: string,
  context: PluginContext,
): Promise<string> {
  let transformedContent = content;

  for (const plugin of plugins) {
    const transform = plugin.hooks?.transformMarkdown;

    if (!transform) {
      continue;
    }

    transformedContent = await transform(transformedContent, context);
  }

  return transformedContent;
}

export async function collectPluginHtml(
  plugins: Plugin[],
  hookName: "injectHead" | "injectBodyEnd",
  context: PluginContext,
): Promise<string> {
  const chunks: string[] = [];

  for (const plugin of plugins) {
    const hook = plugin.hooks?.[hookName];

    if (!hook) {
      continue;
    }

    const chunk = await hook(context);

    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
  }

  return chunks.join("\n");
}

async function loadPluginsConfig(configPath: string): Promise<PluginsConfig> {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { enabled: [] };
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${configPath}: invalid JSON in plugin config. ${error.message}`);
    }

    throw error;
  }

  if (Array.isArray(parsedConfig)) {
    return {
      enabled: parseEnabledPlugins(parsedConfig, configPath),
    };
  }

  if (!isRecord(parsedConfig)) {
    throw new Error(`${configPath}: expected a JSON object or string array.`);
  }

  const enabled = parsedConfig.enabled === undefined ? [] : parseEnabledPlugins(parsedConfig.enabled, configPath);

  return { enabled };
}

function parseEnabledPlugins(value: unknown, configPath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${configPath}: expected "enabled" to be a string array.`);
  }

  return value;
}

async function loadPlugin(pluginName: string, pluginsDir: string, rootDir: string): Promise<Plugin> {
  const pluginDir = nodePath.join(pluginsDir, pluginName);
  const entryPath = await findPluginEntry(pluginDir);
  const moduleUrl = await resolveImportablePluginUrl(entryPath, pluginName, rootDir);
  const module = (await import(moduleUrl)) as Record<string, unknown>;
  const plugin = module.default ?? module.plugin;

  if (!isPlugin(plugin)) {
    throw new Error(
      `${entryPath}: expected a default export or named "plugin" export with a string name and optional function hooks.`,
    );
  }

  if (plugin.name !== pluginName) {
    return {
      ...plugin,
      name: plugin.name || pluginName,
    };
  }

  return plugin;
}

async function findPluginEntry(pluginDir: string): Promise<string> {
  try {
    const pluginDirStats = await stat(pluginDir);

    if (!pluginDirStats.isDirectory()) {
      throw new Error(`Plugin path is not a directory: ${pluginDir}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Missing plugin directory: ${pluginDir}`);
    }

    throw error;
  }

  const candidates = ["plugin.ts", "index.ts", "plugin.js", "index.js"].map((fileName) =>
    nodePath.join(pluginDir, fileName),
  );

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Missing plugin entry in ${pluginDir}. Expected plugin.ts or index.ts.`);
}

async function resolveImportablePluginUrl(
  entryPath: string,
  pluginName: string,
  rootDir: string,
): Promise<string> {
  if (entryPath.endsWith(".js")) {
    return pathToFileURL(entryPath).href;
  }

  const source = await readFile(entryPath, "utf8");
  const ts = await loadTypeScript();
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: entryPath,
  });
  const cacheDir = nodePath.join(rootDir, ".static-blog-cache", "plugins");
  const cachePath = nodePath.join(cacheDir, `${pluginName}.mjs`);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, output.outputText, "utf8");

  return `${pathToFileURL(cachePath).href}?v=${Date.now()}`;
}

async function loadTypeScript(): Promise<TypeScriptModule> {
  try {
    return await import("typescript");
  } catch {
    throw new Error("TypeScript is required to load .ts plugins.");
  }
}

function isPlugin(value: unknown): value is Plugin {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return false;
  }

  if (value.hooks === undefined) {
    return true;
  }

  if (!isRecord(value.hooks)) {
    return false;
  }

  const hookNames = new Set([
    "onBuildStart",
    "onBuildEnd",
    "transformMarkdown",
    "injectHead",
    "injectBodyEnd",
  ]);

  return Object.entries(value.hooks).every(
    ([hookName, hook]) => hookNames.has(hookName) && typeof hook === "function",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
