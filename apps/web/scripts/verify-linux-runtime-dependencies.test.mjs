import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(new URL("./verify-linux-runtime-dependencies.mjs", import.meta.url));
test("rejects monorepo-relative imports escaping the flattened Linux artifact before promotion", async () => {
  const root = await mkdtemp(join(tmpdir(), "origin-runtime-import-"));
  try {
    await mkdir(join(root, "server", "_core"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
    const file = join(root, "server", "_core", "origin.ts");
    await writeFile(file, 'import { parseCloudflarePublicOrigin } from "../../../../packages/shared/src/cloudflareOrigin";');
    let result = spawnSync(process.execPath, [verifier, root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /escapes the standalone runtime artifact/);
    await writeFile(file, 'import { local } from "../local";');
    await writeFile(join(root, "server", "local.ts"), 'export const local = true;');
    result = spawnSync(process.execPath, [verifier, root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(root, { recursive: true, force: true }); }
});
