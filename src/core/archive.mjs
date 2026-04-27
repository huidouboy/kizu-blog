import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

export function safeArchivePath(pathname) {
  const clean = String(pathname || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .join("/");

  if (
    !clean ||
    clean.startsWith("/") ||
    clean.includes("../") ||
    clean === ".." ||
    clean.includes(":")
  ) {
    return "";
  }

  return clean;
}

export function readZipEntries(zipBuffer) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;

  for (let index = zipBuffer.length - 22; index >= Math.max(0, zipBuffer.length - 66000); index -= 1) {
    if (zipBuffer.readUInt32LE(index) === eocdSignature) {
      eocd = index;
      break;
    }
  }

  if (eocd === -1) {
    throw Object.assign(new Error("不是有效的 zip 压缩包"), { status: 400 });
  }

  const entryCount = zipBuffer.readUInt16LE(eocd + 10);
  const centralOffset = zipBuffer.readUInt32LE(eocd + 16);
  const files = [];
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw Object.assign(new Error("zip 中央目录损坏"), { status: 400 });
    }

    const method = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localOffset = zipBuffer.readUInt32LE(cursor + 42);
    const rawName = zipBuffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    const name = safeArchivePath(rawName);

    cursor += 46 + fileNameLength + extraLength + commentLength;

    if (!name || rawName.endsWith("/")) {
      continue;
    }
    if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw Object.assign(new Error("zip 本地文件头损坏"), { status: 400 });
    }

    const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
    let content;

    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      content = inflateRawSync(compressed);
    } else {
      throw Object.assign(new Error(`不支持的 zip 压缩方式：${method}`), { status: 400 });
    }

    if (content.length !== uncompressedSize) {
      throw Object.assign(new Error("zip 条目大小校验失败"), { status: 400 });
    }

    files.push({ name, content });
  }

  return files.filter((file) => {
    if (file.content.length !== 0) {
      return true;
    }
    return !files.some((candidate) => candidate !== file && candidate.name.startsWith(`${file.name}/`));
  });
}

export function stripCommonRoot(files, markers = ["package.json"]) {
  const markerList = Array.isArray(markers) ? markers : [markers];
  if (files.some((file) => markerList.includes(file.name))) {
    return files;
  }

  const roots = new Set(files.map((file) => file.name.split("/")[0]));
  if (roots.size !== 1) {
    return files;
  }

  const [root] = roots;
  return files
    .map((file) => ({
      ...file,
      name: file.name.slice(root.length + 1)
    }))
    .filter((file) => file.name);
}

export async function writeArchiveEntries(targetRoot, files) {
  const root = resolve(targetRoot);
  await mkdir(root, { recursive: true });

  for (const file of files) {
    const targetFile = resolve(root, file.name);
    const localPath = relative(root, targetFile);
    if (localPath.startsWith("..") || isAbsolute(localPath)) {
      throw Object.assign(new Error("压缩包包含非法路径"), { status: 400 });
    }

    await mkdir(dirname(targetFile), { recursive: true });
    await writeFile(targetFile, file.content);
  }
}
