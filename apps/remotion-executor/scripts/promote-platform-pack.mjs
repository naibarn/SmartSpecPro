import fs from "node:fs/promises";
import path from "node:path";

const sourceArg = process.argv.includes("--archive") ? process.argv[process.argv.indexOf("--archive") + 1] : process.argv[2];
const source = path.resolve(sourceArg ?? "");
const releaseDirArg = process.argv.includes("--release-dir") ? process.argv[process.argv.indexOf("--release-dir") + 1] : undefined;
const releaseDir = path.resolve(releaseDirArg ?? process.env.REMOTION_EXECUTOR_RELEASE_DIR ?? "dist/runtime-packs");
if (!source) throw new Error("runtime_pack_archive_required");
const manifestPath = `${source}.manifest.json`;
const fileName = path.basename(source);
await fs.access(manifestPath);
await fs.mkdir(releaseDir, { recursive: true });
const destination = path.join(releaseDir, fileName);
const previous = `${destination}.previous`;
await fs.rm(previous, { force: true });
try { await fs.rename(destination, previous); await fs.rename(`${destination}.manifest.json`, `${previous}.manifest.json`); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
try {
  await fs.copyFile(source, destination);
  await fs.copyFile(manifestPath, `${destination}.manifest.json`);
} catch (error) {
  await fs.rm(destination, { force: true });
  try { await fs.rename(previous, destination); await fs.rename(`${previous}.manifest.json`, `${destination}.manifest.json`); } catch {}
  throw error;
}
console.log(JSON.stringify({ promoted: destination }));
