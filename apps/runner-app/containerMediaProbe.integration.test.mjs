import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startLocalMediaProbeRunner } from "./testsupport/containerMediaProbe.mjs";

// Explicit local qualification; this neither builds nor starts a provider VM.
test("actual Rust HTTP Runner probes WAV, fences input and cleans temporary media", {
  skip: !process.env.SAH_TEST_RUNNER_BINARY || !process.env.SAH_TEST_FFPROBE,
  timeout: 15_000,
}, async () => {
  const runner = await startLocalMediaProbeRunner();
  try {
    const body = { contractVersion: "container-media-probe-v1", scope: runner.scope, input: {
      contentBase64: runner.wav.toString("base64"), checksumSha256: runner.checksum, sizeBytes: runner.wav.length,
    } };
    const post = value => fetch(`${runner.origin}/v1/media/probe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    const response = await post(body); assert.equal(response.status, 200); const result = await response.json();
    assert.deepEqual(result.scope, runner.scope); assert.equal(result.result.derived.durationMs, 1000);
    assert.equal(result.result.derived.streams[0].codec_name, "pcm_s16le"); assert.equal(result.result.derived.format.filename, undefined);
    assert.equal((await post({ ...body, input: { ...body.input, checksumSha256: "b".repeat(64) } })).status, 422);
    assert.equal((await post({ ...body, scope: { ...runner.scope, tenantId: "foreign" } })).status, 422);
    assert.equal((await post({ ...body, command: "arbitrary" })).status, 400);
    await assert.rejects(readFile(join(runner.scopeRoot, "media-probe", "input.bin")), { code: "ENOENT" });
    await assert.rejects(readFile(join(runner.scopeRoot, "media-probe", "metadata.json")), { code: "ENOENT" });
  } finally { await runner.close(); }
});
