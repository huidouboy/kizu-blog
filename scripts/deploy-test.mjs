import { cp, mkdir, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parentRoot = resolve(repoRoot, "..");
const targetRoot = resolve(process.env.KIZU_TEST_TARGET || join(parentRoot, "kizu-blog-test"));
const port = Number.parseInt(process.env.KIZU_TEST_PORT || process.env.PORT || "4173", 10);
const shouldStart = !process.argv.includes("--no-start");
const shouldKillPort = !process.argv.includes("--no-kill");

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

function assertSafeTarget() {
  const targetName = basename(targetRoot);
  const insideParent = targetRoot.startsWith(`${parentRoot}${sep}`) || targetRoot === parentRoot;
  const expectedName = /^kizu-blog-test(?:[-._a-z0-9]*)?$/i.test(targetName);

  if (!insideParent || !expectedName || targetRoot === repoRoot) {
    throw new Error(`Refusing to deploy into unsafe target: ${targetRoot}`);
  }
}

function runFile(command, args) {
  return new Promise((resolvePromise) => {
    try {
      execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        resolvePromise({
          ok: !error,
          stdout: stdout || "",
          stderr: stderr || "",
          error
        });
      });
    } catch (error) {
      resolvePromise({
        ok: false,
        stdout: "",
        stderr: error.message,
        error
      });
    }
  });
}

async function findListeningPids(targetPort) {
  const result = await runFile("netstat.exe", ["-ano", "-p", "tcp"]);
  if (!result.ok) return [];

  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const localAddress = parts[1] || "";
    const pid = Number.parseInt(parts.at(-1), 10);
    if (localAddress.endsWith(`:${targetPort}`) && Number.isFinite(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}

async function killPort(targetPort) {
  if (!shouldKillPort) return [];
  const pids = await findListeningPids(targetPort);
  for (const pid of pids) {
    if (pid === process.pid) continue;
    const result = await runFile("taskkill.exe", ["/PID", String(pid), "/F", "/T"]);
    if (!result.ok) {
      throw new Error(`Failed to stop process ${pid} on port ${targetPort}: ${result.stderr || result.error?.message || "unknown error"}`);
    }
  }
  return pids;
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

async function writeFreshRuntimeHints(target) {
  await mkdir(join(target, "data"), { recursive: true });
  await writeFile(join(target, "data", ".gitkeep"), "\n", "utf8");
}

async function startTarget(target, targetPort) {
  const out = await open(join(target, ".kizu-test.log"), "a");
  const err = await open(join(target, ".kizu-test.err.log"), "a");
  const child = spawn(process.execPath, ["scripts/start.mjs"], {
    cwd: target,
    detached: true,
    env: {
      ...process.env,
      PORT: String(targetPort)
    },
    stdio: ["ignore", out.fd, err.fd],
    windowsHide: true
  });

  await writeFile(join(target, ".kizu-test.pid"), String(child.pid), "utf8");
  child.unref();
  await out.close();
  await err.close();
  return child.pid;
}

async function main() {
  assertSafeTarget();

  const killed = await killPort(port);
  await rm(targetRoot, { recursive: true, force: true });
  await copyClean(repoRoot, targetRoot);
  await writeFreshRuntimeHints(targetRoot);

  let pid = null;
  if (shouldStart) {
    pid = await startTarget(targetRoot, port);
  }

  console.log(JSON.stringify({
    source: repoRoot,
    target: targetRoot,
    port,
    killedPids: killed,
    startedPid: pid,
    url: shouldStart ? `http://localhost:${port}` : null,
    admin: shouldStart ? `http://localhost:${port}/admin/` : null
  }, null, 2));
}

await main();
