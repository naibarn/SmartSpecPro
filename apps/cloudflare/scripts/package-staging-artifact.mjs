#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, writeFile, mkdir, copyFile, lstat, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(process.cwd());
const outRoot = resolve(repoRoot, "apps/cloudflare/.staging-artifact");
const wranglerOut = join(outRoot, "wrangler");
const moduleRoot = join(outRoot, "modules");
const publicRoot = resolve(repoRoot, "apps/web/dist/public");
const manifestPath = join(outRoot, "bundle-manifest.json");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function contentType(name) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "js" || extension === "mjs") return "application/javascript";
  if (extension === "wasm") return "application/wasm";
  if (extension === "json") return "application/json";
  if (extension === "html") return "text/html; charset=utf-8";
  if (extension === "css") return "text/css; charset=utf-8";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function walk(root, { allowedSymlinkRoot } = {}) {
  const output = [];
  const rootReal = await realpath(root);
  const activeDirectories = new Set([rootReal]);
  async function visit(logicalDirectory, physicalDirectory) {
    for (const entry of await readdir(physicalDirectory, { withFileTypes: true })) {
      const logicalPath = join(logicalDirectory, entry.name);
      const physicalPath = join(physicalDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        if (!allowedSymlinkRoot) throw new Error("STAGING_ARTIFACT_SYMLINK_DENIED");
        let target;
        try {
          target = await realpath(physicalPath);
        } catch {
          throw new Error("STAGING_ARTIFACT_SYMLINK_INVALID");
        }
        const targetRel = relative(allowedSymlinkRoot, target);
        if (!targetRel || targetRel === ".." || targetRel.startsWith(`..${sep}`) || resolve(allowedSymlinkRoot, targetRel) !== target) {
          throw new Error("STAGING_ARTIFACT_SYMLINK_OUTSIDE_PUBLIC_SOURCE");
        }
        const targetStat = await stat(target);
        if (targetStat.isDirectory()) {
          if (activeDirectories.has(target)) throw new Error("STAGING_ARTIFACT_SYMLINK_CYCLE");
          activeDirectories.add(target);
          await visit(logicalPath, target);
          activeDirectories.delete(target);
        } else if (targetStat.isFile()) {
          output.push({ path: target, name: relative(root, logicalPath) });
        } else {
          throw new Error("STAGING_ARTIFACT_SPECIAL_FILE_DENIED");
        }
      } else if (entry.isDirectory()) {
        await visit(logicalPath, physicalPath);
      } else if (entry.isFile()) {
        output.push({ path: physicalPath, name: relative(root, logicalPath) });
      } else {
        throw new Error("STAGING_ARTIFACT_SPECIAL_FILE_DENIED");
      }
    }
  }
  await visit(root, rootReal);
  return output.sort((left, right) => left.name.localeCompare(right.name));
}

function safeRelative(value) {
  return value.length > 0 && !value.startsWith("/") && !value.split(/[\\/]/).some(part => !part || part === "." || part === "..");
}

function assertUnder(path, root) {
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== path) throw new Error("STAGING_ARTIFACT_PATH_OUTSIDE_ROOT");
}

await realpath(repoRoot);
if (!(await lstat(wranglerOut)).isDirectory() || (await lstat(wranglerOut)).isSymbolicLink() ||
    !(await lstat(publicRoot)).isDirectory() || (await lstat(publicRoot)).isSymbolicLink()) {
  throw new Error("STAGING_ARTIFACT_ROOT_INVALID");
}
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("STAGING_ARTIFACT_SOURCE_SHA_INVALID");
const wranglerFiles = await walk(wranglerOut);
if (wranglerFiles.length === 0) throw new Error("STAGING_ARTIFACT_WRANGLER_OUTPUT_MISSING");
const publicSourceRoot = await realpath(resolve(repoRoot, "apps/web/client/public"));
// Vite preserves the releases alias; copy its bytes only from the approved in-repo public source tree.
const publicFiles = await walk(publicRoot, { allowedSymlinkRoot: publicSourceRoot });
if (publicFiles.length === 0) throw new Error("STAGING_ARTIFACT_SPA_OUTPUT_MISSING");

const mainCandidate = wranglerFiles.find(file => file.name === "index.js") ??
  wranglerFiles.find(file => file.name.toLowerCase().endsWith(".js"));
if (!mainCandidate) throw new Error("STAGING_ARTIFACT_MAIN_MODULE_MISSING");
await mkdir(moduleRoot, { recursive: true });
const moduleFiles = [];
for (const sourceFile of wranglerFiles.filter(file => !file.name.endsWith(".map"))) {
  const name = sourceFile.name.split(sep).join("/");
  if (!safeRelative(name)) throw new Error("STAGING_ARTIFACT_MODULE_PATH_INVALID");
  const destination = resolve(moduleRoot, name);
  assertUnder(destination, moduleRoot);
  await mkdir(join(destination, ".."), { recursive: true });
  await copyFile(sourceFile.path, destination);
  const bytes = await readFile(destination);
  moduleFiles.push({ name, file: `modules/${name}`, contentType: contentType(name), size: bytes.byteLength, sha256: digest(bytes) });
}
const mainModule = mainCandidate.name.split(sep).join("/");
if (!moduleFiles.some(file => file.name === mainModule)) throw new Error("STAGING_ARTIFACT_MAIN_MODULE_UNAVAILABLE");

const assets = [];
for (const sourceFile of publicFiles) {
  const name = sourceFile.name.split(sep).join("/");
  if (!safeRelative(name)) throw new Error("STAGING_ARTIFACT_ASSET_PATH_INVALID");
  const bytes = await readFile(sourceFile.path);
  assets.push({ name, file: `apps/web/dist/public/${name}`, contentType: contentType(name), size: bytes.byteLength, sha256: digest(bytes) });
}
const entries = [
  ...moduleFiles.map(file => [`modules/${file.name}`, file.sha256, file.size]),
  ...assets.map(file => [`public/${file.name}`, file.sha256, file.size]),
].sort(([left], [right]) => left.localeCompare(right));
const buildDigest = digest(Buffer.from(entries.map(([name, sha, size]) => `${name}\0${sha}\0${size}`).join("\n")));
const compatibilityDate = JSON.parse((await readFile(join(repoRoot, "apps/cloudflare/wrangler.staging.jsonc"), "utf8")).replace(/^\s*\/\/.*$/gm, "")).compatibility_date;
if (!/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)) throw new Error("STAGING_ARTIFACT_COMPATIBILITY_DATE_INVALID");
const manifest = {
  format: "cloudflare-staging-build-bundle-v1",
  sourceSha,
  buildDigest,
  mainModule,
  compatibilityDate,
  moduleFiles,
  assets,
};
await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: "BUNDLE_BUILT", sourceSha, buildDigest, moduleCount: moduleFiles.length, assetCount: assets.length, manifest: "apps/cloudflare/.staging-artifact/bundle-manifest.json" }));
