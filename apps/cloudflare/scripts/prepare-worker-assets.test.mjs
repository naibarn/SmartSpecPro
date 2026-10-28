import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_WORKER_ASSET_BYTES, prepareWorkerAssets } from "./prepare-worker-assets.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "worker-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, "client", "public");
  const assetsDir = join(root, "dist", "public");
  const privateSourceMapsDir = join(root, "private-source-maps");
  await mkdir(join(sourceDir, "releases", "runtime"), { recursive: true });
  await mkdir(join(sourceDir, "images"), { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(join(assetsDir, "assets"), { recursive: true });
  await writeFile(join(assetsDir, "index.html"), '<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">');
  await writeFile(join(assetsDir, "assets", "app.js"), "console.log('ok')");
  await writeFile(join(assetsDir, "assets", "app.css"), "body { color: black }\n");
  await writeFile(join(sourceDir, "favicon.ico"), "icon");
  await writeFile(join(sourceDir, "favicon.svg"), "<svg/>");
  await writeFile(join(sourceDir, "images", "hero.webp"), "image");
  await writeFile(join(sourceDir, "releases", "runtime", "worker-runtime-linux-1.zip"), "large runtime archive");
  await truncate(join(sourceDir, "releases", "runtime", "worker-runtime-linux-1.zip"), 4 * MAX_WORKER_ASSET_BYTES);
  await writeFile(join(sourceDir, "releases", "runtime", "worker-runtime-linux-1.zip.manifest.json"), "{}");
  await writeFile(join(sourceDir, "releases", "worker-app-1.exe"), "installer");
  await writeFile(join(assetsDir, "assets", "app.js.map"), "private source map");
  return { root, sourceDir, assetsDir, privateSourceMapsDir };
}

test("copies website files and omits downloads without deleting source artifacts", async t => {
  const { sourceDir, assetsDir, privateSourceMapsDir } = await fixture(t);
  const result = await prepareWorkerAssets({ sourceDir, assetsDir, privateSourceMapsDir });

  assert.equal(await readFile(join(assetsDir, "favicon.ico"), "utf8"), "icon");
  assert.equal(await readFile(join(assetsDir, "images", "hero.webp"), "utf8"), "image");
  await assert.rejects(stat(join(assetsDir, "releases", "runtime", "worker-runtime-linux-1.zip")), { code: "ENOENT" });
  await assert.rejects(stat(join(assetsDir, "releases", "worker-app-1.exe")), { code: "ENOENT" });
  await assert.rejects(stat(join(assetsDir, "assets", "app.js.map")), { code: "ENOENT" });
  assert.equal(await readFile(join(privateSourceMapsDir, "assets", "app.js.map"), "utf8"), "private source map");
  assert.equal(result.largest.sizeBytes <= MAX_WORKER_ASSET_BYTES, true);
  assert.deepEqual(result.excluded.map(file => file.route), [
    "/api/workers/runtime-pack/download/worker-runtime-linux-1.zip",
    null,
    null,
    null,
  ]);

  const workerRuntime = await readFile(new URL("../../web/server/routes/workerRuntime.ts", import.meta.url), "utf8");
  assert.match(workerRuntime, /\/api\/workers\/runtime-pack\/download\/:fileName/);
  const desktopReleases = await readFile(new URL("../../web/server/routes/desktopReleases.ts", import.meta.url), "utf8");
  assert.match(desktopReleases, /\/worker-app\/download/);
});

test("fails instead of dropping an oversized non-download website asset", async t => {
  const { sourceDir, assetsDir } = await fixture(t);
  await writeFile(join(sourceDir, "images", "too-large.png"), "x");
  await truncate(join(sourceDir, "images", "too-large.png"), MAX_WORKER_ASSET_BYTES + 1);

  await assert.rejects(
    prepareWorkerAssets({ sourceDir, assetsDir }),
    /WORKER_STATIC_ASSET_TOO_LARGE:images\/too-large\.png:/,
  );
});
