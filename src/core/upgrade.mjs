import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readZipEntries, stripCommonRoot, writeArchiveEntries } from "./archive.mjs";

export const DEFAULT_UPGRADE_MANIFEST = {
  schema: 1,
  product: "kizu-blog",
  managedFiles: [".gitignore", "package.json", "README.md", "site.config.json"],
  managedDirectories: ["admin", "content", "docs", "scripts", "src"],
  managedThemes: ["neo-journal"],
  preserve: ["data", "public", "node_modules", ".git", ".kizu", "themes/<non-managed>"]
};

const PROTECTED_ROOTS = new Set(["data", "public", "node_modules", ".git", ".kizu"]);

function runFile(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout || "";
        error.stderr = stderr || "";
        rejectPromise(error);
        return;
      }
      resolvePromise({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function exists(filePath) {
  return stat(filePath).then(() => true).catch(() => false);
}

function ensureSafeRelativePath(pathname, label) {
  const clean = String(pathname || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const root = clean.split("/")[0];

  if (!clean || clean.includes("../") || clean.includes(":") || PROTECTED_ROOTS.has(root)) {
    throw new Error(`${label} 包含受保护路径：${pathname}`);
  }

  return clean;
}

function semverParts(version = "0.0.0") {
  return String(version)
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left = "0.0.0", right = "0.0.0") {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

export async function readPackage(root) {
  const packagePath = join(root, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  return { pkg, packagePath };
}

export function upgradeManifest(pkg) {
  return {
    ...DEFAULT_UPGRADE_MANIFEST,
    ...(pkg.kizu?.upgrade || {}),
    managedFiles: pkg.kizu?.upgrade?.managedFiles || DEFAULT_UPGRADE_MANIFEST.managedFiles,
    managedDirectories: pkg.kizu?.upgrade?.managedDirectories || DEFAULT_UPGRADE_MANIFEST.managedDirectories,
    managedThemes: pkg.kizu?.upgrade?.managedThemes || DEFAULT_UPGRADE_MANIFEST.managedThemes,
    preserve: pkg.kizu?.upgrade?.preserve || DEFAULT_UPGRADE_MANIFEST.preserve
  };
}

export function validateUpgradeManifest(pkg, manifest) {
  if (pkg.name !== "kizu-blog" && pkg.kizu?.product !== "kizu-blog") {
    throw new Error("升级源不是 Kizu Blog 项目。");
  }
  if (manifest.schema !== 1) {
    throw new Error(`不支持的升级清单版本：${manifest.schema}`);
  }

  for (const file of manifest.managedFiles) {
    ensureSafeRelativePath(file, "managedFiles");
  }
  for (const directory of manifest.managedDirectories) {
    ensureSafeRelativePath(directory, "managedDirectories");
  }
  for (const theme of manifest.managedThemes) {
    ensureSafeRelativePath(`themes/${theme}`, "managedThemes");
  }
}

async function assertInside(root, target) {
  const localPath = relative(root, target);
  if (localPath.startsWith("..") || isAbsolute(localPath)) {
    throw new Error(`路径越界：${target}`);
  }
}

async function copyPath(sourceRoot, targetRoot, pathname, operations, dryRun) {
  const source = resolve(sourceRoot, pathname);
  const target = resolve(targetRoot, pathname);

  await assertInside(resolve(sourceRoot), source);
  await assertInside(resolve(targetRoot), target);

  if (!await exists(source)) {
    throw new Error(`升级源缺少必要文件：${pathname}`);
  }

  operations.push({ type: "replace", path: pathname });
  if (dryRun) return;

  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

async function copyIfExists(sourceRoot, targetRoot, pathname) {
  const source = resolve(sourceRoot, pathname);
  const target = resolve(targetRoot, pathname);

  if (!await exists(source)) return false;
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  return true;
}

async function createBackup(targetRoot, manifest, currentVersion, nextVersion) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = resolve(targetRoot, ".kizu", "backups", `upgrade-${stamp}-${randomUUID().slice(0, 8)}`);
  await mkdir(backupRoot, { recursive: true });

  const paths = [
    ...manifest.managedFiles,
    ...manifest.managedDirectories,
    ...manifest.managedThemes.map((theme) => `themes/${theme}`),
    "data"
  ];
  const copied = [];

  for (const pathname of paths) {
    if (await copyIfExists(targetRoot, backupRoot, pathname)) {
      copied.push(pathname);
    }
  }

  await writeFile(join(backupRoot, "backup.json"), `${JSON.stringify({
    product: "kizu-blog",
    currentVersion,
    nextVersion,
    copied,
    createdAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");

  return backupRoot;
}

export async function loadUpgradeInfo(targetRoot = ".") {
  const root = resolve(targetRoot);
  const { pkg } = await readPackage(root);
  const statePath = join(root, ".kizu", "upgrade-state.json");
  const lastUpgrade = await readFile(statePath, "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => null);

  return {
    product: pkg.kizu?.product || pkg.name,
    version: pkg.version,
    manifest: upgradeManifest(pkg),
    lastUpgrade
  };
}

export async function applyUpgrade({
  sourceRoot,
  targetRoot = ".",
  dryRun = false,
  allowDowngrade = false,
  actor = "system"
}) {
  const source = resolve(sourceRoot);
  const target = resolve(targetRoot);

  if (source === target) {
    throw new Error("升级源不能是当前项目目录。");
  }

  const { pkg: currentPackage } = await readPackage(target);
  const { pkg: nextPackage } = await readPackage(source);
  const manifest = upgradeManifest(nextPackage);
  validateUpgradeManifest(nextPackage, manifest);

  const relation = compareVersions(nextPackage.version, currentPackage.version);
  if (relation < 0 && !allowDowngrade) {
    throw new Error(`不能从 ${currentPackage.version} 降级到 ${nextPackage.version}。如确需回退，请使用 --allow-downgrade。`);
  }

  const operations = [];
  let backupRoot = null;

  if (!dryRun) {
    backupRoot = await createBackup(target, manifest, currentPackage.version, nextPackage.version);
  }

  for (const file of manifest.managedFiles) {
    await copyPath(source, target, file, operations, dryRun);
  }
  for (const directory of manifest.managedDirectories) {
    await copyPath(source, target, directory, operations, dryRun);
  }
  for (const theme of manifest.managedThemes) {
    await copyPath(source, target, `themes/${theme}`, operations, dryRun);
  }

  const result = {
    ok: true,
    product: "kizu-blog",
    previousVersion: currentPackage.version,
    nextVersion: nextPackage.version,
    relation,
    backupRoot,
    dryRun,
    restartRequired: true,
    operations,
    actor,
    completedAt: new Date().toISOString()
  };

  if (!dryRun) {
    const statePath = join(target, ".kizu", "upgrade-state.json");
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function stageZipPackage(zipBuffer, filename = "kizu-upgrade.zip") {
  const tempRoot = await mkdtemp(join(tmpdir(), "kizu-upgrade-"));
  const sourceRoot = join(tempRoot, "source");
  const files = stripCommonRoot(readZipEntries(zipBuffer), ["package.json"]);

  await writeArchiveEntries(sourceRoot, files);

  return {
    sourceRoot,
    tempRoot,
    filename: basename(filename),
    cleanup: () => rm(tempRoot, { recursive: true, force: true })
  };
}

export async function stageGitRepository(repository, ref = "") {
  const repo = String(repository || "").trim();
  if (!repo) {
    throw Object.assign(new Error("请填写 Git 仓库地址"), { status: 400 });
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "kizu-upgrade-git-"));
  const sourceRoot = join(tempRoot, "source");
  const args = ["clone", "--depth", "1"];

  if (ref) {
    args.push("--branch", String(ref));
  }
  args.push(repo, sourceRoot);

  try {
    await runFile("git", args, { cwd: tempRoot });
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw Object.assign(new Error(error.stderr || error.message || "Git 拉取失败"), { status: 400 });
  }

  return {
    sourceRoot,
    tempRoot,
    repository: repo,
    ref,
    cleanup: () => rm(tempRoot, { recursive: true, force: true })
  };
}
