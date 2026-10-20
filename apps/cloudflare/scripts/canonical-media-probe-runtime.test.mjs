import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loopbackPort, startLocalMediaProbeRunner } from "../../runner-app/testsupport/containerMediaProbe.mjs";

// Real workerd/R2 plus a real Rust/FFprobe child. Provider VM lifecycle and
// canonical HTTP authority are explicit local test adapters, not live proof.
test("local workerd verifies real R2 input/result and Rust media execution", {
  skip: !process.env.SAH_TEST_RUNNER_BINARY || !process.env.SAH_TEST_FFPROBE, timeout: 90_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "sah-probe-workerd-")), port = await loopbackPort();
  const runner = await startLocalMediaProbeRunner(), sourceKey = "uploads/7/fixture.wav";
  const source = { tenantId: runner.scope.tenantId, userId: 7, assetId: 1, objectKey: sourceKey, checksumSha256: runner.checksum,
    sizeBytes: runner.wav.length, contentType: "audio/wav", expiresAt: new Date(runner.scope.lease.expiresAtMs).toISOString() };
  const executePath = fileURLToPath(new URL("../src/canonicalMediaProbe.ts", import.meta.url));
  await writeFile(join(directory, "worker.ts"), `
import { executeCanonicalMediaProbe } from ${JSON.stringify(executePath)};
const source = ${JSON.stringify(source)}, scope = ${JSON.stringify(runner.scope)}, nativeFetch = fetch;
let prepareCalls = 0, starts = 0, stops = 0;
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith('https://canonical.private.invalid/')) {
    const body = JSON.parse(init.body); if (body.claim.leaseToken !== ${JSON.stringify(runner.leaseToken)} || body.jobId !== scope.lease.jobId) throw new Error('fixture authority mismatch');
    prepareCalls++; return Response.json({ mediaSource: source });
  }
  return nativeFetch(input, init);
};
export default { async fetch(request, bindings) {
  if (new URL(request.url).pathname === '/healthz') return new Response('ok');
  const bytes = Uint8Array.from(atob(${JSON.stringify(runner.wav.toString('base64'))}), c => c.charCodeAt(0));
  await bindings.MEDIA_BUCKET.put(source.objectKey, bytes, { sha256: source.checksumSha256 });
  const env = { MEDIA_BUCKET: bindings.MEDIA_BUCKET, CLOUDFLARE_CONTAINER_POLICY: 'on-demand', CLOUDFLARE_ACTIVATION: 'enabled', CLOUDFLARE_MEDIA_PROBE: 'container-media-probe-v1',
    CLOUDFLARE_ENVIRONMENT: 'staging', CLOUDFLARE_JOB_TRANSPORT: 'workflows', CLOUDFLARE_WORKFLOW_TENANT_ID: scope.tenantId,
    CLOUDFLARE_WORKFLOW_EXPIRES_AT: source.expiresAt, CLOUDFLARE_RUNNER_IMAGE_REF: 'registry.cloudflare.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/fixture/runner@sha256:' + 'a'.repeat(64),
    PLATFORM_EDGE_ORIGIN: 'https://canonical.private.invalid', PLATFORM_EDGE_PRIVATE_HOST: 'canonical.private.invalid', CLOUDFLARE_CONTROL_PLANE_TOKEN: 'fixture-purpose-control-only',
    JOB_CONTAINERS: {
      async start({ assignment }) { if (assignment.leaseId !== scope.lease.leaseId) throw new Error('scope mismatch'); starts++; },
      async probeMedia(assignment, input) {
        const response = await nativeFetch(${JSON.stringify(runner.origin + '/v1/media/probe')}, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contractVersion: 'container-media-probe-v1', scope: { tenantId: assignment.tenantId, lease: { ...scope.lease, expiresAtMs: Date.parse(assignment.expiresAt) } }, input }) });
        if (!response.ok) throw new Error('rust status ' + response.status); return response.json();
      }, async stop() { stops++; },
    },
  };
  const input = { taskName: 'app.tasks.media_job_worker.execute_media_job', taskImportPath: 'app.tasks.media_job_worker.execute_media_job',
    args: [JSON.stringify({ jobId: 'external-1', jobType: 'probe', inputs: { assets: [{ uri: 'r2://' + source.objectKey }] } }), '7', 'external-1'], kwargs: {}, queue: null, legacyUserId: '7' };
  const envelope = { job_id: scope.lease.jobId, business_attempt: 1, attempt_id: null, contract_version: 'feature-186-v1', dispatch_id: 'fixture-dispatch', dedupe_key: 'fixture-dedupe', routing_metadata: {} };
  const result = await executeCanonicalMediaProbe({ env, envelope, job: { jobId: scope.lease.jobId, tenantId: scope.tenantId, contractVersion: 'feature-186-v1', businessAttempt: 1, status: 'running', operatorReviewRequired: false, jobType: 'python.legacy_task', executionClass: 'long', input },
    claim: { attemptId: scope.lease.attemptId, leaseToken: ${JSON.stringify(runner.leaseToken)}, fencingVersion: 1, expiresAt: source.expiresAt } });
  const cached = await executeCanonicalMediaProbe({ env, envelope, job: { jobId: scope.lease.jobId, tenantId: scope.tenantId, contractVersion: 'feature-186-v1', businessAttempt: 1, status: 'running', operatorReviewRequired: false, jobType: 'python.legacy_task', executionClass: 'long', input },
    claim: { attemptId: scope.lease.attemptId, leaseToken: ${JSON.stringify(runner.leaseToken)}, fencingVersion: 1, expiresAt: source.expiresAt } });
  if (cached.resultRef !== result.resultRef) throw new Error('cached result mismatch');
  const persisted = await bindings.MEDIA_BUCKET.get(result.resultRef);
  const duplicate = await bindings.MEDIA_BUCKET.put(result.resultRef, 'must not overwrite', { onlyIf: { etagDoesNotMatch: '*' } });
  const after = await bindings.MEDIA_BUCKET.get(result.resultRef);
  return Response.json({ result, persisted: await persisted.json(), after: await after.json(), createOnlyRejected: duplicate === null,
    metadata: after.customMetadata, prepareCalls, starts, stops });
} };
`);
  await writeFile(join(directory, "wrangler.json"), JSON.stringify({ name: "sah-probe-local-fixture", main: "worker.ts", compatibility_date: "2026-10-19",
    r2_buckets: [{ binding: "MEDIA_BUCKET", bucket_name: "disposable-media-probe-fixture" }] }));
  const child = spawn("pnpm", ["dlx", "wrangler@4.151.1", "dev", "--config", join(directory, "wrangler.json"), "--local", "--port", String(port), "--persist-to", join(directory, "state")], {
    detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  let log = ""; for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { log = (log + data).slice(-6000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready || child.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready, `workerd not ready: ${log}`);
    const response = await fetch(`http://127.0.0.1:${port}/run`, { signal: AbortSignal.timeout(15_000) });
    const text = await response.text(); assert.equal(response.status, 200, text + log); const result = JSON.parse(text);
    assert.equal(result.result.output.derived.durationMs, 1000); assert.equal(result.result.output.derived.streams[0].codec_name, "pcm_s16le");
    assert.deepEqual(result.persisted, result.result.output); assert.deepEqual(result.after, result.persisted); assert.equal(result.createOnlyRejected, true);
    assert.deepEqual([result.prepareCalls, result.starts, result.stops], [2, 1, 1]);
    assert.equal(result.metadata.tenantId, source.tenantId); assert.equal(result.metadata.jobId, runner.scope.lease.jobId);
    assert.ok(!JSON.stringify(result).includes(runner.leaseToken));
    await assert.rejects(readFile(join(runner.scopeRoot, "media-probe", "input.bin")), { code: "ENOENT" });
  } finally {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} resolve(); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    await runner.close(); await rm(directory, { recursive: true, force: true });
  }
});
