#!/usr/bin/env node
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { buildSite } from "./build.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command = "help", ...rest] = args;

  switch (command) {
    case "build": {
      const includeDrafts = rest.includes("--include-drafts");
      const result = await buildSite({ includeDrafts });
      const relativeOutDir = nodePath.relative(process.cwd(), result.outDir) || ".";

      console.log(`Build complete.
Output: ${relativeOutDir} (${result.outDir})
Posts: ${result.posts}
Pages: ${result.pages}
Plugins: ${result.plugins}
Theme: ${result.theme}`);
      return;
    }

    case "dev":
      console.log("dev command is a placeholder for now.");
      return;

    case "preview":
      console.log("preview command is a placeholder for now.");
      return;

    case "deploy":
      console.log("deploy command is a placeholder for now.");
      return;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`Usage: static-blog <command>

Commands:
  build      Generate static HTML files in dist/
  dev        Placeholder for a future local dev workflow
  preview    Placeholder for a future static preview workflow
  deploy     Placeholder for a future deploy workflow

Options:
  --include-drafts   Include draft posts and pages during build`);
}

const entryPath = process.argv[1] ? nodePath.resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  main().catch((error: unknown) => {
    console.error(`Error: ${formatCliError(error)}`);
    process.exitCode = 1;
  });
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return process.env.DEBUG ? (error.stack ?? error.message) : error.message;
  }

  return String(error);
}
