import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function loopbackPort() {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
export async function startLocalMediaProbeRunner() {
  const port = await loopbackPort(), jobId = randomUUID(), attemptId = randomUUID();
  const leaseToken = `fixture-private-${randomUUID()}`, leaseId = `lease-${createHash("sha256").update(leaseToken).digest("hex")}`;
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
  let diagnostic = "", stopped = false;
  child.stderr.on("data", data => { diagnostic = (diagnostic + data).slice(-2048); });
  const exited = new Promise(resolve => { child.once("exit", resolve); child.once("error", resolve); });
  async function close() {
    if (stopped) return; stopped = true;
    child.kill("SIGKILL"); await exited;
    assert.equal(await readFile(join(root, "test-owner.json"), "utf8"), marker);
    await rm(root, { recursive: true });
  }
  const origin = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let retry = 0; retry < 30; retry++) {
      try {
        const response = await fetch(`${origin}/health/runner`, { signal: AbortSignal.timeout(500) });
        const health = await response.json(); assert.equal(health.profile, "shared_container");
        assert.deepEqual(health.capabilities, ["container-media-probe-v1"]); ready = true; break;
      } catch { if (child.exitCode !== null) break; await delay(100); }
    }
    assert.ok(ready, `Runner not ready: ${diagnostic}`);
  } catch (error) { await close(); throw error; }
  const wav = Buffer.alloc(16044); wav.write("RIFF", 0); wav.writeUInt32LE(16036, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16000, 40);
  return { origin, scope, scopeRoot, leaseToken, close, wav, checksum: createHash("sha256").update(wav).digest("hex") };
}
