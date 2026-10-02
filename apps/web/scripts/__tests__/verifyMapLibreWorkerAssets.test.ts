import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyMapLibreWorkerAssets } from "../verify-maplibre-worker-assets.mjs";

const tempDirs: string[] = [];

function createPublicDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "maplibre-worker-assets-"));
  tempDirs.push(directory);
  mkdirSync(path.join(directory, "assets"));
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("MapLibre production worker asset verification", () => {
  it("accepts a non-empty worker referenced by the emergency map chunk", () => {
    const publicDir = createPublicDir();
    writeFileSync(path.join(publicDir, "assets", "maplibre-gl-worker-a1.js"), "self.onmessage = () => {};\n");
    writeFileSync(path.join(publicDir, "assets", "EmergencyPublicMap-b2.js"), 'const worker = "/assets/maplibre-gl-worker-a1.js";');

    expect(verifyMapLibreWorkerAssets(publicDir)).toEqual({ worker: "maplibre-gl-worker-a1.js", mapChunks: 1 });
  });

  it("rejects a build with no emitted MapLibre worker", () => {
    const publicDir = createPublicDir();
    writeFileSync(path.join(publicDir, "assets", "EmergencyPublicMap-b2.js"), "const map = true;");

    expect(() => verifyMapLibreWorkerAssets(publicDir)).toThrow("MAPLIBRE_WORKER_ASSET_MISSING");
  });

  it("rejects a map chunk that does not reference the emitted worker", () => {
    const publicDir = createPublicDir();
    writeFileSync(path.join(publicDir, "assets", "maplibre-gl-worker-a1.js"), "self.onmessage = () => {};\n");
    writeFileSync(path.join(publicDir, "assets", "EmergencyPublicMap-b2.js"), "const map = true;");

    expect(() => verifyMapLibreWorkerAssets(publicDir)).toThrow("MAPLIBRE_WORKER_REFERENCE_MISSING");
  });
});
