#!/usr/bin/env node
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

export const MAX_WORKER_ASSET_BYTES = 25 * 1024 * 1024;
const DOWNLOADABLE_EXTENSIONS = new Set([
  ".zip", ".exe", ".msi", ".dmg", ".pkg", ".appimage", ".7z", ".tar", ".gz",
]);

function downloadRoute(name) {
  const file = name.split(sep).join("/");
  const base = file.split("/").at(-1) ?? file;
  if (file.startsWith(`releases${sep}runtime${sep}`)) {
    return base.endsWith(".zip") ? `/api/workers/runtime-pack/download/${encodeURIComponent(base)}` : null;
  }
  if (/^smartaihub-(?:companion|marketplace-capture)-extension-/i.test(base)) {
    return `/api/desktop-releases/${base.toLowerCase().includes("marketplace-capture") ? "marketplace-extension" : "companion-extension"}/download`;
  }
  if (/^smart-ai-hub-worker-app-/i.test(base)) {
    if (/macos-source-/i.test(base)) return "/api/desktop-releases/worker-app/macos-source/download";
    return "/api/desktop-releases/worker-app/download";
  }
  return null;
}

export async function prepareWorkerAssets({ sourceDir, assetsDir, privateSourceMapsDir }) {
  const source = await realpath(sourceDir);
  const destination = resolve(assetsDir);
  const destinationStat = await lstat(destination);
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
    throw new Error("WORKER_ASSET_OUTPUT_INVALID");
  }
  const included = [];
  const excluded = [];

  async function visit(directory, relativeDirectory = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const sourcePath = join(directory, entry.name);
      const rel = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
      const normalized = rel.split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`WORKER_ASSET_SYMLINK_DENIED:${normalized}`);
      if (entry.isDirectory()) {
        if (normalized === "releases/runtime") {
          const contents = await readdir(sourcePath, { withFileTypes: true });
          for (const item of contents) {
            const itemPath = join(sourcePath, item.name);
            const itemStat = await stat(itemPath);
            if (!itemStat.isFile()) throw new Error(`WORKER_ARTIFACT_ENTRY_INVALID:${item.name}`);
            excluded.push({
              source: `client/public/${normalized}/${item.name}`,
              sizeBytes: itemStat.size,
              route: downloadRoute(join(normalized, item.name)),
              reason: item.name.endsWith(".zip") ? "runtime_download" : "runtime_release_metadata",
              browserRequired: false,
            });
          }
          continue;
        }
        await visit(sourcePath, rel);
        continue;
      }
      if (!entry.isFile()) throw new Error(`WORKER_ASSET_ENTRY_INVALID:${normalized}`);

      const fileStat = await stat(sourcePath);
      if (entry.name.endsWith(".map")) {
        excluded.push({
          source: `client/public/${normalized}`,
          sizeBytes: fileStat.size,
          route: null,
          reason: "private_source_map",
          browserRequired: false,
        });
        continue;
      }
      const isDownloadable = normalized.startsWith("releases/") && DOWNLOADABLE_EXTENSIONS.has(extname(entry.name).toLowerCase());
      if (isDownloadable) {
        excluded.push({
          source: `client/public/${normalized}`,
          sizeBytes: fileStat.size,
          route: downloadRoute(rel),
          reason: "downloadable_artifact",
          browserRequired: false,
        });
        continue;
      }
      if (fileStat.size > MAX_WORKER_ASSET_BYTES) {
        throw new Error(`WORKER_STATIC_ASSET_TOO_LARGE:${normalized}:${fileStat.size}`);
      }
      const target = join(destination, rel);
      await mkdir(resolve(target, ".."), { recursive: true });
      await cp(sourcePath, target, { force: true, errorOnExist: false });
      included.push({ path: normalized, sizeBytes: fileStat.size });
    }
  }

  await visit(source);
  async function removePublicSourceMaps(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`WORKER_ASSET_SYMLINK_DENIED:${name}`);
      if (entry.isDirectory()) await removePublicSourceMaps(filePath, name);
      else if (entry.isFile() && entry.name.endsWith(".map")) {
        const fileStat = await stat(filePath);
        if (privateSourceMapsDir) {
          const privateTarget = join(resolve(privateSourceMapsDir), name);
          await mkdir(resolve(privateTarget, ".."), { recursive: true });
          await cp(filePath, privateTarget, { force: true });
        }
        await rm(filePath);
        excluded.push({
          source: `apps/web/dist/public/${name}`,
          sizeBytes: fileStat.size,
          route: null,
          reason: "private_source_map",
          browserRequired: false,
        });
      }
    }
  }
  await removePublicSourceMaps(destination);
  const htmlPath = join(destination, "index.html");
  const htmlStat = await stat(htmlPath).catch(() => null);
  if (!htmlStat?.isFile()) throw new Error("WORKER_WEBSITE_INDEX_MISSING");
  const html = await readFile(htmlPath, "utf8");
  const referencedBundles = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(match => match[1]);
  if (!referencedBundles.some(file => file.endsWith(".js")) || !referencedBundles.some(file => file.endsWith(".css"))) {
    throw new Error("WORKER_WEBSITE_ENTRY_BUNDLES_MISSING");
  }
  for (const bundle of referencedBundles) {
    const bundleStat = await stat(join(destination, bundle.slice(1))).catch(() => null);
    if (!bundleStat?.isFile()) throw new Error(`WORKER_WEBSITE_BUNDLE_MISSING:${bundle}`);
  }
  for (const required of ["favicon.ico", "favicon.svg"]) {
    if (!included.some(file => file.path === required)) throw new Error(`WORKER_WEBSITE_ASSET_MISSING:${required}`);
  }

  const allAssets = [];
  async function verify(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`WORKER_ASSET_SYMLINK_DENIED:${name}`);
      if (entry.isDirectory()) await verify(filePath, name);
      else if (entry.isFile()) {
        const fileStat = await stat(filePath);
        if (fileStat.size > MAX_WORKER_ASSET_BYTES) throw new Error(`WORKER_STATIC_ASSET_TOO_LARGE:${name}:${fileStat.size}`);
        if (name.startsWith("releases/runtime/") && name.endsWith(".zip")) throw new Error(`WORKER_RUNTIME_ZIP_INCLUDED:${name}`);
        allAssets.push({ path: name, sizeBytes: fileStat.size });
      } else throw new Error(`WORKER_ASSET_ENTRY_INVALID:${name}`);
    }
  }
  await verify(destination);
  const largest = allAssets.sort((a, b) => b.sizeBytes - a.sizeBytes)[0] ?? null;
  return { included: allAssets.length, excluded, largest };
}

function formatReport(result) {
  const mib = bytes => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  const runtimeArchives = result.excluded.filter(file => file.reason === "runtime_download").sort((a, b) => b.sizeBytes - a.sizeBytes);
  const binaryGroups = new Map();
  for (const file of result.excluded.filter(file => file.reason === "downloadable_artifact")) {
    const key = file.route ?? "No mapped public API";
    const group = binaryGroups.get(key) ?? { count: 0, total: 0, largest: 0 };
    group.count += 1;
    group.total += file.sizeBytes;
    group.largest = Math.max(group.largest, file.sizeBytes);
    binaryGroups.set(key, group);
  }
  const sourceMaps = result.excluded.filter(file => file.reason === "private_source_map");
  const runtimeMetadata = result.excluded.filter(file => file.reason === "runtime_release_metadata");
  const rows = runtimeArchives.map(file => `| \`${file.source}\` | ${mib(file.sizeBytes)} | \`${file.route}\` | No |`);
  return [
    "### Cloudflare Worker asset inventory",
    "",
    `Included website assets: ${result.included}. Largest: ${result.largest ? `\`${result.largest.path}\` (${mib(result.largest.sizeBytes)})` : "none"}. Limit: 25 MiB per file.`,
    "",
    "Runtime archive inventory (source → build target omitted → existing on-demand API route; none is needed to execute browser JavaScript):",
    "",
    "| Source | Size | Existing download route | Browser execution |",
    "| --- | ---: | --- | --- |",
    ...rows,
    "",
    "Other excluded content:",
    ...[...binaryGroups].map(([route, group]) => `- ${group.count} installer/archive files (${mib(group.total)} total, largest ${mib(group.largest)}) → ${route}.`),
    `- ${runtimeMetadata.length} runtime signature/manifest files (${mib(runtimeMetadata.reduce((sum, file) => sum + file.sizeBytes, 0))} total) are consumed by existing download validation, not browser execution.`,
    `- ${sourceMaps.length} hidden source maps (${mib(sourceMaps.reduce((sum, file) => sum + file.sizeBytes, 0))} total) are kept out of public Worker assets.`,
    "",
    "Download artifacts remain in their source/release storage. This step omits them from Worker static assets; it does not publish or delete them.",
  ].join("\n");
}

async function main() {
  const sourceDir = process.argv[2] ?? "apps/web/client/public";
  const assetsDir = process.argv[3] ?? "apps/web/dist/public";
  const privateSourceMapsDir = process.argv[4];
  const result = await prepareWorkerAssets({ sourceDir, assetsDir, privateSourceMapsDir });
  const report = formatReport(result);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "WORKER_ASSET_PREPARATION_FAILED");
    process.exitCode = 1;
  });
}
