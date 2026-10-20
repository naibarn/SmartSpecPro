import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
    await writeFile(join(root, "apps/cloudflare/.staging-artifact/wrangler/entrypoint.js"), "export class CanonicalJobWorkflow {}\nexport default {};\n");
    await writeFile(join(root, "apps/web/dist/public/index.html"), "<html></html>\n");
    await writeFile(join(root, "apps/web/dist/public/assets/app.js"), "console.log('ready');\n");
    await writeFile(join(root, "apps/web/dist/public/.gitkeep"), "");
    await writeFile(join(root, "apps/web/dist/public/ä-user-guide.md"), "localized guide\n");
    await writeFile(join(root, "apps/web/client/public/releases/current.json"), "{\"release\":1}\n");
    await symlink("../../client/public/releases", join(root, "apps/web/dist/public/releases"));
    await mkdir(join(root, "apps/cloudflare"), { recursive: true });
    await writeFile(join(root, "apps/cloudflare/wrangler.staging.jsonc"), await readFile(sourceConfig));
    const script = join(root, "apps/cloudflare/scripts/package-staging-artifact.mjs");
    await mkdir(join(root, "apps/cloudflare/scripts"), { recursive: true });
    await writeFile(script, await readFile(sourceScript));
    await mkdir(join(root, "apps/web/shared"), { recursive: true });
    await writeFile(join(root, "apps/web/shared/runtimePackAvailability.mjs"), await readFile(new URL("../../web/shared/runtimePackAvailability.mjs", import.meta.url)));
    await mkdir(join(root, "apps/web/client/public/releases/runtime"), { recursive: true });
    const runtimeNames = [
      "smart-ai-hub-worker-runtime-hyperframes-macos-arm64-old.zip",
      "smart-ai-hub-remotion-executor-remotion-executor-macos-arm64-old.zip.manifest.json",
      "smart-ai-hub-remotion-executor-remotion-executor-macos-x64-old.zip",
      "smart-ai-hub-hermes-runtime-hermes-macos-arm64-current.zip",
      "smart-ai-hub-remotion-executor-remotion-executor-windows-x64-current.zip",
    ];
    for (const name of runtimeNames) await writeFile(join(root, "apps/web/client/public/releases/runtime", name), "retained");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    const result = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" }));
    const manifest = JSON.parse(await readFile(join(root, "apps/cloudflare/.staging-artifact/bundle-manifest.json"), "utf8"));
    assert.equal(result.status, "BUNDLE_BUILT");
    assert.equal(manifest.sourceSha, sourceSha);
    assert.equal(manifest.mainModule, "entrypoint.js", "a stale index.js must not replace the configured Workflow entrypoint");
    assert.equal(manifest.moduleFiles.length, 2);
    assert.deepEqual(manifest.assets.map(file => file.name), ["assets/app.js", "index.html", "releases/current.json", ...runtimeNames.slice(3).map(name => `releases/runtime/${name}`), "ä-user-guide.md"]);
    assert.ok(!manifest.assets.some(file => file.name === ".gitkeep"));
    assert.match(manifest.buildDigest, /^[a-f0-9]{64}$/);
    for (const name of runtimeNames) assert.equal(await readFile(join(root, "apps/web/client/public/releases/runtime", name), "utf8"), "retained");
    // Linux distribution materialization uses the identical pause policy and
    // retains the source archives instead of deleting them.
    await mkdir(join(root, "apps/web/scripts"), { recursive: true });
    const materializer = join(root, "apps/web/scripts/materialize-public-releases.sh");
    await writeFile(materializer, await readFile(new URL("../../web/scripts/materialize-public-releases.sh", import.meta.url)));
    execFileSync("bash", [materializer, join(root, "apps/web")], { cwd: root });
    for (const name of runtimeNames.slice(0, 3)) {
      await assert.rejects(readFile(join(root, "apps/web/dist/public/releases/runtime", name)), { code: "ENOENT" });
      assert.equal(await readFile(join(root, "apps/web/client/public/releases/runtime", name), "utf8"), "retained");
    }
    for (const name of runtimeNames.slice(3)) assert.equal(await readFile(join(root, "apps/web/dist/public/releases/runtime", name), "utf8"), "retained");
    const digestRows = [
      ...manifest.moduleFiles.map(file => [`modules/${file.name}`, file.sha256, file.size]),
      ...manifest.assets.map(file => [`public/${file.name}`, file.sha256, file.size]),
    ].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const expectedDigest = createHash("sha256")
      .update(digestRows.map(([name, sha, size]) => `${name}\0${sha}\0${size}`).join("\n"))
      .digest("hex");
    assert.equal(manifest.buildDigest, expectedDigest);

    await mkdir(join(root, "apps/web/private"), { recursive: true });
    await writeFile(join(root, "apps/web/private/secret.txt"), "must not be packaged");
    await rm(join(root, "apps/web/dist/public/releases"), { recursive: true });
    await symlink("../../private", join(root, "apps/web/dist/public/releases"));
    assert.throws(
      () => execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8", stdio: "pipe" }),
      error => error.stderr.toString().includes("STAGING_ARTIFACT_SYMLINK_OUTSIDE_PUBLIC_SOURCE"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
