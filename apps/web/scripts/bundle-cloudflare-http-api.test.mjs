import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bundleCloudflareHttpApi } from "./bundle-cloudflare-http-api.mjs";

test("compiled API retains nested asset paths, dynamic imports, external packages and runtime secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "http-api-bundle-test-"));
  try {
    await mkdir(join(root, "server/_core"), { recursive: true });
    await mkdir(join(root, "server/services"));
    await mkdir(join(root, "node_modules/fixture-dependency"), { recursive: true });
    await mkdir(join(root, "node_modules/@smartspec/fixture"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "node_modules/fixture-dependency/package.json"), '{"type":"module","exports":"./index.js"}');
    await writeFile(join(root, "node_modules/fixture-dependency/index.js"), 'export const external = "external-fixture";');
    await writeFile(join(root, "node_modules/@smartspec/fixture/package.json"), '{"type":"module","exports":{".":{"types":"./index.d.ts","default":"./index.ts"},"./worker":{"types":"./worker.d.ts","default":"./worker.ts"}}}');
    await writeFile(join(root, "node_modules/@smartspec/fixture/index.ts"), 'export const workspace: string = "workspace-fixture";');
    await writeFile(join(root, "node_modules/@smartspec/fixture/worker.ts"), 'export const exportedWorker: string = "export-map-fixture";');
    await writeFile(join(root, "server/_core/state.ts"), 'export const state = {};');
    await writeFile(join(root, "server/services/anchor.ts"), 'export { state } from "../_core/state.ts"; export const anchor = new URL("./asset.txt", import.meta.url).href; export const folder = import.meta.dirname;');
    await writeFile(join(root, "server/services/dev.ts"), 'import "missing-development-only-package";');
    await writeFile(join(root, "server/_core/index.ts"), `
      import { external } from "fixture-dependency";
      import { workspace } from "@smartspec/fixture";
      import { exportedWorker } from "@smartspec/fixture/worker";
      import { state } from "./state.ts";
      const { anchor, folder, state: lazyState } = await import("../services/anchor.ts");
      if (process.env.BUNDLE_FIXTURE_DEV) await import("../services/dev.ts");
      console.log(JSON.stringify({ external, workspace, exportedWorker, anchor, folder, singleton: state === lazyState, secret: process.env.BUNDLE_FIXTURE_SECRET }));
    `);
    const output = join(root, "server/_core/cloudflare-http-api");
    const receipt = await bundleCloudflareHttpApi(root, output, root);
    assert.equal(receipt.inputModules, 6);
    assert.ok(receipt.files.length >= 3);
    assert.match(receipt.manifestSha256, /^[a-f0-9]{64}$/);
    const source = (await Promise.all(receipt.files.map(file => readFile(join(output, file.name), "utf8")))).join("\n");
    assert.ok(source.includes('"fixture-dependency"'));
    assert.ok(!source.includes("runtime-only-disposable-fixture"));
    const { stdout } = await promisify(execFile)(process.execPath, [join(output, receipt.entrypoint)], {
      env: { ...process.env, BUNDLE_FIXTURE_SECRET: "runtime-only-disposable-fixture" }, timeout: 5000,
    });
    assert.deepEqual(JSON.parse(stdout), { external: "external-fixture", workspace: "workspace-fixture", exportedWorker: "export-map-fixture", singleton: true,
      anchor: pathToFileURL(join(root, "server/services/asset.txt")).href,
      folder: join(root, "server/services"), secret: "runtime-only-disposable-fixture" });
    await assert.rejects(bundleCloudflareHttpApi(root, output, root), { code: "EEXIST" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
