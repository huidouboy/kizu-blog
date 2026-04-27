import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve, sep } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parentRoot = resolve(projectRoot, "..");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version || "0.1.0";
const targetRoot = resolve(readArg("--target") || join(parentRoot, `kizu-blog-v${version}`));

const excludedNames = new Set([
  ".git",
  ".kizu",
  "data",
  "public",
  "node_modules"
]);

const excludedFiles = new Set([
  ".kizu-test.log",
  ".kizu-test.err.log",
  ".kizu-test.pid"
]);

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function assertSafeTarget() {
  const targetName = basename(targetRoot);
  const insideProject = targetRoot === projectRoot || targetRoot.startsWith(`${projectRoot}${sep}`);

  if (insideProject) {
    throw new Error(`Refusing to export inside current project: ${targetRoot}`);
  }
  if (!/^kizu-blog-v/i.test(targetName) && !readArg("--target")) {
    throw new Error(`Unexpected release target: ${targetRoot}`);
  }
}

async function copyClean(source, target) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(target, { recursive: true });

  for (const entry of entries) {
    if (excludedNames.has(entry.name) || excludedFiles.has(entry.name)) continue;

    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);

    if (entry.isDirectory()) {
      await copyClean(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await cp(sourcePath, targetPath);
    }
  }
}

async function writeFreshRuntimeFiles(target) {
  await mkdir(join(target, "data"), { recursive: true });
  await writeFile(join(target, "data", ".gitkeep"), "\n", "utf8");
}

assertSafeTarget();
await rm(targetRoot, { recursive: true, force: true });
await copyClean(projectRoot, targetRoot);
await writeFreshRuntimeFiles(targetRoot);

console.log(JSON.stringify({
  version,
  source: projectRoot,
  target: targetRoot
}, null, 2));
