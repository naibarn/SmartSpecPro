import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneHttpRuntimeDependencies } from "./prune-cloudflare-http-dependencies.mjs";
async function fixture() {
  const stage = await mkdtemp(join(tmpdir(), ".http-image-prune-")), root = join(stage, "runtime"), modules = join(root, "node_modules"), store = join(modules, ".pnpm");
  await mkdir(store, { recursive: true });
  async function pkg(name, dependencies = {}, optionalDependencies = {}) {
    const directory = join(store, `${name}@1`, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies, optionalDependencies }));
    await writeFile(join(directory, "index.js"), "module.exports = 1;");
    await symlink(join(".pnpm", `${name}@1`, "node_modules", name), join(modules, name));
    return directory;
  }
  await pkg("tsx"); await pkg("api", { native: "1" }, { "absent-platform": "1" }); await pkg("native"); await pkg("ui-only");
  return { root, stage, modules, pkg };
}
test("keeps API/native transitive packages and TS loader, omits unused UI store and broken links", async () => {
  const f = await fixture(); try {
    const proof = await pruneHttpRuntimeDependencies(f.root, ["api/subpath", "node:fs"]);
    assert.equal(proof.packageCount, 3);
    await access(join(f.modules, "api/index.js")); await access(join(f.modules, "native/index.js")); await access(join(f.modules, "tsx/index.js"));
    await assert.rejects(access(join(f.modules, "ui-only")));
  } finally { await rm(f.stage, { recursive: true, force: true }); }
});
test("missing required edges leave staged dependencies unchanged", async () => {
  const f = await fixture(); try {
    await f.pkg("broken", { "absent-required": "1" });
    await assert.rejects(pruneHttpRuntimeDependencies(f.root, ["broken"]), /PACKAGE_MISSING/);
    await access(join(f.modules, "ui-only/index.js"));
  } finally { await rm(f.stage, { recursive: true, force: true }); }
});
test("accepts a declared npm alias and rejects an undeclared package identity mismatch", async () => {
  const f = await fixture(); try {
    const api = join(f.modules, "api");
    await writeFile(join(api, "package.json"), JSON.stringify({ name: "api", dependencies: { "native-alias": "npm:native@1" } }));
    await symlink("native", join(f.modules, "native-alias"));
    const proof = await pruneHttpRuntimeDependencies(f.root, ["api"]);
    assert.equal(proof.packageCount, 3);
    await access(join(f.modules, "native-alias/index.js"));
    await assert.rejects(pruneHttpRuntimeDependencies(f.root, ["native-alias"]), /IDENTITY_MISMATCH/);
  } finally { await rm(f.stage, { recursive: true, force: true }); }
});
test("never prunes the primary artifact or resolves an external dependency symlink", async () => {
  await assert.rejects(pruneHttpRuntimeDependencies(process.cwd(), []), /STAGING_REQUIRED/);
  const f = await fixture(), outside = await mkdtemp(join(tmpdir(), "outside-dependency-")); try {
    await writeFile(join(outside, "package.json"), JSON.stringify({ name: "outside" }));
    await symlink(outside, join(f.modules, "outside"));
    await assert.rejects(pruneHttpRuntimeDependencies(f.root, ["outside"]), /PACKAGE_ESCAPE/);
    await access(join(f.modules, "ui-only/index.js"));
  } finally { await rm(f.stage, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
