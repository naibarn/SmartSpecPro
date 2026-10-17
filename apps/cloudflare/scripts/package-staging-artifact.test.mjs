import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sourceScript = new URL("./package-staging-artifact.mjs", import.meta.url);
const sourceConfig = new URL("../wrangler.staging.jsonc", import.meta.url);

test("packages only the staging Wrangler bundle and Vite public assets with source-bound hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloudflare-staging-artifact-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Artifact Test"], { cwd: root });
    await mkdir(join(root, "apps/cloudflare/.staging-artifact/wrangler"), { recursive: true });
    await mkdir(join(root, "apps/web/dist/public/assets"), { recursive: true });
    await mkdir(join(root, "apps/web/client/public/releases"), { recursive: true });
    await writeFile(join(root, "apps/cloudflare/.staging-artifact/wrangler/index.js"), "export default {};\n");
    await writeFile(join(root, "apps/web/dist/public/index.html"), "<html></html>\n");
    await writeFile(join(root, "apps/web/dist/public/assets/app.js"), "console.log('ready');\n");
    await writeFile(join(root, "apps/web/client/public/releases/current.json"), "{\"release\":1}\n");
    await symlink("../../client/public/releases", join(root, "apps/web/dist/public/releases"));
    await mkdir(join(root, "apps/cloudflare"), { recursive: true });
    await writeFile(join(root, "apps/cloudflare/wrangler.staging.jsonc"), await readFile(sourceConfig));
    const script = join(root, "apps/cloudflare/scripts/package-staging-artifact.mjs");
    await mkdir(join(root, "apps/cloudflare/scripts"), { recursive: true });
    await writeFile(script, await readFile(sourceScript));
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    const result = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" }));
    const manifest = JSON.parse(await readFile(join(root, "apps/cloudflare/.staging-artifact/bundle-manifest.json"), "utf8"));
    assert.equal(result.status, "BUNDLE_BUILT");
    assert.equal(manifest.sourceSha, sourceSha);
    assert.equal(manifest.mainModule, "index.js");
    assert.equal(manifest.moduleFiles.length, 1);
    assert.deepEqual(manifest.assets.map(file => file.name), ["assets/app.js", "index.html", "releases/current.json"]);
    assert.match(manifest.buildDigest, /^[a-f0-9]{64}$/);

    await mkdir(join(root, "apps/web/private"), { recursive: true });
    await writeFile(join(root, "apps/web/private/secret.txt"), "must not be packaged");
    await unlink(join(root, "apps/web/dist/public/releases"));
    await symlink("../../private", join(root, "apps/web/dist/public/releases"));
    assert.throws(
      () => execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8", stdio: "pipe" }),
      error => error.stderr.toString().includes("STAGING_ARTIFACT_SYMLINK_OUTSIDE_PUBLIC_SOURCE"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
