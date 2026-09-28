#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.RUNNER_RUNTIME_SMOKE_PORT || 39123);
const baseUrl = `http://127.0.0.1:${port}`;
const runnerId = `runtime-smoke-${process.pid}`;

function artifactDigest() {
  return createHash("sha256")
    .update(readFileSync(path.join(webRoot, "dist/public/index.html")))
    .digest("hex");
}

async function waitForHealth(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`runtime exited before health check: ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The runtime may still be loading DB/Redis/skill registries.
    }
    await delay(500);
  }
  throw new Error("runtime health check timed out");
}

async function main() {
  execFileSync("npm", ["run", "build"], {
    cwd: webRoot,
    env: { ...process.env, NODE_ENV: "production", DEBUG: "false" },
    stdio: "inherit",
  });

  const child = spawn(process.execPath, ["--import", "tsx", "server/_core/index.ts"], {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEBUG: "false",
      PORT: String(port),
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => process.stdout.write(`[runtime] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[runtime] ${chunk}`));

  try {
    await waitForHealth(child);
    const response = await fetch(`${baseUrl}/api/runners/connect/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runnerId,
        displayName: "Runner runtime artifact smoke",
        deviceId: `device-${process.pid}`,
        machineFingerprint: `runtime-smoke-${process.pid}`,
        publicKey: "runtime-smoke-public-key",
        runnerVersion: "0.1.0",
        supportedRunnerContractVersions: ["sah-runner-v1"],
        supportedConnectSchemaRevisions: ["sah-runner-connect-v2"],
      }),
    });
    const payload = await response.json();
    if (response.status !== 201) {
      throw new Error(`connect/start returned HTTP ${response.status}`);
    }

    const required = [
      "pairingNonce",
      "runnerSessionId",
      "expiresIn",
      "controlPlaneContractVersion",
      "connectSchemaRevision",
      "minRunnerVersion",
    ];
    for (const field of required) {
      if (!(field in payload)) throw new Error(`connect/start missing ${field}`);
    }
    if (payload.controlPlaneContractVersion !== "sah-runner-v1") {
      throw new Error("unexpected control-plane contract version");
    }
    if (payload.connectSchemaRevision !== "sah-runner-connect-v2") {
      throw new Error("unexpected connect schema revision");
    }
    if (!Number.isInteger(payload.expiresIn) || payload.expiresIn <= 0) {
      throw new Error("invalid pairing expiry");
    }

    console.log(JSON.stringify({
      status: "passed",
      artifactIndexSha256: artifactDigest(),
      runtimePid: child.pid,
      runnerId,
      httpStatus: response.status,
      requiredFields: required,
      pairingExpirySeconds: payload.expiresIn,
      controlPlaneContractVersion: payload.controlPlaneContractVersion,
      connectSchemaRevision: payload.connectSchemaRevision,
      rawSecrets: "redacted",
    }));
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise(resolve => child.once("exit", resolve)),
      delay(10_000).then(() => child.kill("SIGKILL")),
    ]);
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
