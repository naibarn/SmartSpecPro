import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Explicit local qualification; this neither builds nor starts a provider VM.
test("actual Rust HTTP Runner probes WAV, fences input and cleans temporary media", {
  skip: !process.env.SAH_TEST_RUNNER_BINARY || !process.env.SAH_TEST_FFPROBE,
  timeout: 15_000,
}, async () => {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const jobId = randomUUID(), attemptId = randomUUID(), leaseId = `lease-${randomUUID()}`;
  const root = join("/tmp/smartaihub-runner/jobs", jobId), scopeRoot = join(root, attemptId, leaseId);
  const marker = randomUUID(); await mkdir(scopeRoot, { recursive: true });
  await writeFile(join(root, "test-owner.json"), marker, { mode: 0o600 });
  const scope = { tenantId: "disposable-test-tenant", lease: { jobId, attemptId, leaseId, fencingVersion: 1, expiresAtMs: Date.now() + 60_000 } };
  const child = spawn(process.env.SAH_TEST_RUNNER_BINARY, ["run"], { env: {
    PATH: "/usr/bin:/bin", SAH_RUNNER_PROFILE: "shared_container", SAH_RUNNER_ID: "disposable-http-test", SAH_RUNNER_JOB_ID: jobId,
    SAH_RUNNER_ATTEMPT_ID: attemptId, SAH_RUNNER_LEASE_ID: leaseId, SAH_RUNNER_TENANT_ID: scope.tenantId,
    SAH_RUNNER_FENCING_VERSION: "1", SAH_RUNNER_EXPIRES_AT_MS: String(scope.lease.expiresAtMs), SAH_RUNNER_HEALTH_PORT: String(port),
    SAH_RUNNER_FFPROBE_PATH: process.env.SAH_TEST_FFPROBE,
  }, stdio: ["ignore", "ignore", "pipe"] });
  let diagnostic = ""; child.stderr.on("data", data => { diagnostic = (diagnostic + data).slice(-2048); });
  const exited = new Promise(resolve => child.once("exit", resolve));
  try {
    const origin = `http://127.0.0.1:${port}`; let ready = false;
    for (let retry = 0; retry < 30; retry++) {
      try {
        const response = await fetch(`${origin}/health/runner`, { signal: AbortSignal.timeout(500) });
        const health = await response.json(); assert.equal(health.profile, "shared_container");
        assert.deepEqual(health.capabilities, ["container-media-probe-v1"]); ready = true; break;
      } catch { if (child.exitCode !== null) break; await delay(100); }
    }
    assert.ok(ready, `Runner not ready: ${diagnostic}`);
    const wav = Buffer.alloc(16044); wav.write("RIFF", 0); wav.writeUInt32LE(16036, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16000, 40);
    const body = { contractVersion: "container-media-probe-v1", scope, input: {
      contentBase64: wav.toString("base64"), checksumSha256: createHash("sha256").update(wav).digest("hex"), sizeBytes: wav.length,
    } };
    const post = value => fetch(`${origin}/v1/media/probe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    const response = await post(body); assert.equal(response.status, 200); const result = await response.json();
    assert.deepEqual(result.scope, scope); assert.equal(result.result.derived.durationMs, 1000);
    assert.equal(result.result.derived.streams[0].codec_name, "pcm_s16le");
    assert.equal(result.result.derived.format.filename, undefined);
    assert.equal((await post({ ...body, input: { ...body.input, checksumSha256: "b".repeat(64) } })).status, 422);
    assert.equal((await post({ ...body, scope: { ...scope, tenantId: "foreign" } })).status, 422);
    assert.equal((await post({ ...body, command: "arbitrary" })).status, 400);
    await assert.rejects(readFile(join(scopeRoot, "media-probe", "input.bin")), { code: "ENOENT" });
    await assert.rejects(readFile(join(scopeRoot, "media-probe", "metadata.json")), { code: "ENOENT" });
  } finally {
    child.kill("SIGKILL"); await exited;
    assert.equal(await readFile(join(root, "test-owner.json"), "utf8"), marker);
    await rm(root, { recursive: true });
  }
});
