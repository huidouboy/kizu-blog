import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyUpgrade,
  loadUpgradeInfo,
  stageGitRepository,
  stageZipPackage
} from "../src/core/upgrade.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function help() {
  return `Kizu Blog upgrade

用法：
  node scripts/upgrade.mjs --status
  node scripts/upgrade.mjs --from <folder-or-zip>
  node scripts/upgrade.mjs --package <kizu-blog-version.zip>
  node scripts/upgrade.mjs --git <repo-url> [--ref <branch-or-tag>]

选项：
  --dry-run           只校验并输出将要替换的路径
  --allow-downgrade   允许回退到更低版本
  --status            查看当前版本与最近一次升级记录
`;
}

async function isDirectory(pathname) {
  return stat(pathname).then((value) => value.isDirectory()).catch(() => false);
}

async function stageLocalSource(input) {
  const source = resolve(input);
  if (await isDirectory(source)) {
    return {
      sourceRoot: source,
      cleanup: async () => {}
    };
  }

  if (!source.toLowerCase().endsWith(".zip")) {
    throw new Error("本地升级源必须是目录或 .zip 压缩包。");
  }

  return stageZipPackage(await readFile(source), source);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(help());
    return;
  }

  if (args.status) {
    console.log(JSON.stringify(await loadUpgradeInfo(projectRoot), null, 2));
    return;
  }

  const input = args.git || args.package || args.from || args._[0];
  if (!input) {
    console.log(help());
    process.exitCode = 1;
    return;
  }

  const staged = args.git
    ? await stageGitRepository(args.git, args.ref || "")
    : await stageLocalSource(input);

  try {
    const result = await applyUpgrade({
      sourceRoot: staged.sourceRoot,
      targetRoot: projectRoot,
      dryRun: Boolean(args["dry-run"]),
      allowDowngrade: Boolean(args["allow-downgrade"]),
      actor: "cli"
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.dryRun) {
      console.log("升级已应用。请重启 Kizu Blog 服务让新版本生效。");
    }
  } finally {
    await staged.cleanup();
  }
}

await main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
