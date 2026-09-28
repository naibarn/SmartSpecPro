import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDeviceProof, uploadArtifact } from "../src/controlPlane.js";

test("device proof signs the method, route, token jti, nonce, and body digest", () => {
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const device = {
    deviceId: "device-test",
    machineFingerprint: "f".repeat(64),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const token = [
    "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9",
    Buffer.from(JSON.stringify({ jti: "worker-refresh-test" })).toString("base64url"),
    "signature",
  ].join(".");
  const headers = buildDeviceProof(token, "POST", "/api/workers/connect/refresh", { action: "refresh" }, device);
  const payload = [
    "POST",
    "/api/workers/connect/refresh",
    "worker-refresh-test",
    headers["x-worker-device-timestamp"],
    headers["x-worker-device-nonce"],
    headers["x-worker-body-sha256"],
  ].join("\n");
  const verifier = crypto.createVerify("sha256");
  verifier.update(payload);
  verifier.end();
  assert.equal(verifier.verify(device.publicKey, Buffer.from(headers["x-worker-device-signature"], "base64")), true);
  assert.equal(headers["x-worker-device-id"], device.deviceId);
  assert.equal(headers["x-worker-machine-fingerprint"], device.machineFingerprint);
});

test("artifact upload binds init/put/complete to checksum and rejects insecure presigned URLs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "remotion-upload-test-"));
  const filePath = path.join(tempDir, "render.mp4");
  await fs.writeFile(filePath, Buffer.from("fake-mp4-output"));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/artifacts/init-upload")) {
      return new Response(JSON.stringify({ method: "presigned", uploadUrl: "https://r2.example.test/presigned?sig=test", storageRef: "r2://render.mp4" }), { status: 200 });
    }
    if (url.startsWith("https://r2.example.test/")) return new Response(null, { status: 200 });
    if (url.includes("/artifacts/complete")) return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
    throw new Error(`unexpected_url:${url}`);
  }) as typeof fetch;
  try {
    await uploadArtifact({
      jobId: "job-1",
      token: "access-token",
      uploadToken: "upload-token",
      filePath,
      leaseOwnerToken: "lease-1",
      assignmentAttempt: "2",
    });
    const initBody = JSON.parse(String(calls[0]?.init?.body));
    const completeBody = JSON.parse(String(calls[2]?.init?.body));
    assert.match(initBody.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(completeBody.checksumSha256, initBody.checksumSha256);
    assert.match(calls[1]?.url ?? "", /r2\.example\.test/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/artifacts/init-upload")) {
      return new Response(JSON.stringify({ method: "presigned", uploadUrl: "http://127.0.0.1/internal", storageRef: "internal" }), { status: 200 });
    }
    throw new Error("insecure presigned URL was fetched");
  }) as typeof fetch;
  try {
    await assert.rejects(uploadArtifact({
      jobId: "job-2",
      token: "access-token",
      uploadToken: "upload-token",
      filePath,
      leaseOwnerToken: "lease-2",
      assignmentAttempt: "1",
    }), /artifact_upload_url_invalid/);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
