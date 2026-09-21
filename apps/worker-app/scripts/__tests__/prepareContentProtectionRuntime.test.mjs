import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const script = resolve(repoRoot, "apps/worker-app/scripts/prepare-content-protection-runtime.mjs");
const commit = "870ca7fb33578b90f14c602016b6c2788096226e";
const packageJsonPath = resolve(repoRoot, "apps/worker-app/package.json");
const tauriConfigPath = resolve(repoRoot, "apps/worker-app/src-tauri/tauri.conf.json");
const workerRuntimeContractPath = resolve(repoRoot, "apps/web/shared/workerRuntimeReleases.ts");

test("content protection pack check accepts a complete generated bundle", () => {
  const root = resolve(tmpdir(), `smartspec-content-protection-pack-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "provider"), { recursive: true });
  mkdirSync(join(root, "ckpts"), { recursive: true });
  writeFileSync(join(root, "provider/videoseal-provider"), "provider");
  writeFileSync(join(root, "THIRD_PARTY_NOTICES.txt"), "VideoSeal MIT license");
  const model = join(root, "ckpts/videoseal_y_256b_img.pth");
  writeFileSync(model, "");
  truncateSync(model, 100 * 1024 * 1024);
  writeFileSync(join(root, "content-protection-manifest.json"), JSON.stringify({
    provider: "videoseal",
    providerVersion: "videoseal-1.0",
    videoSealCommit: commit,
    providerCommand: "provider/videoseal-provider",
    modelPath: "ckpts/videoseal_y_256b_img.pth",
    healthChecked: true,
    licenseNotice: "THIRD_PARTY_NOTICES.txt",
  }));

  try {
    const output = execFileSync(process.execPath, [script, "--check-only", "--bundle-root", root], { encoding: "utf8" });
    assert.match(output, /content protection bundle is ready/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("optional Windows Content Protection runtime has a separate release contract", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  const workerRuntimeContract = readFileSync(workerRuntimeContractPath, "utf8");

  assert.equal(
    packageJson.scripts["content-protection:release"],
    "node scripts/package-content-protection-runtime.mjs",
  );
  assert.match(workerRuntimeContract, /content-protection-windows-x64/);
  assert.doesNotMatch(JSON.stringify(tauriConfig.bundle?.resources ?? {}), /content-protection/);
});
