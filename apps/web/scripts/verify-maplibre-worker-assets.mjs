import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Fail a production asset build before it is swapped live when the emergency
 * map's MapLibre worker was omitted or the emitted map chunk points elsewhere.
 */
export function verifyMapLibreWorkerAssets(publicDir) {
  const assetsDir = path.join(publicDir, "assets");
  let files;
  try {
    files = readdirSync(assetsDir);
  } catch {
    throw new Error("MAPLIBRE_ASSETS_DIRECTORY_MISSING");
  }

  const workers = files.filter((name) => /^maplibre-gl-worker-[A-Za-z0-9_-]+\.js$/.test(name));
  if (workers.length !== 1 || statSync(path.join(assetsDir, workers[0] ?? "")).size === 0) {
    throw new Error("MAPLIBRE_WORKER_ASSET_MISSING");
  }

  const mapChunks = files.filter((name) => /^EmergencyPublicMap-[A-Za-z0-9_-]+\.js$/.test(name));
  if (mapChunks.length === 0) throw new Error("EMERGENCY_MAP_ASSET_MISSING");
  const worker = workers[0];
  const referencesWorker = mapChunks.some((name) => readFileSync(path.join(assetsDir, name), "utf8").includes(worker));
  if (!referencesWorker) throw new Error("MAPLIBRE_WORKER_REFERENCE_MISSING");

  return { worker, mapChunks: mapChunks.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const publicDir = process.argv[2];
  if (!publicDir) {
    console.error("Usage: node scripts/verify-maplibre-worker-assets.mjs <public-dir>");
    process.exitCode = 2;
  } else {
    try {
      const result = verifyMapLibreWorkerAssets(publicDir);
      console.log(`[maplibre-worker] verified ${result.worker}; referenced by ${result.mapChunks} emergency map chunk(s)`);
    } catch (error) {
      console.error(`[maplibre-worker] ${error instanceof Error ? error.message : "verification failed"}`);
      process.exitCode = 1;
    }
  }
}
