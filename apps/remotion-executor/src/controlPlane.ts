import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { serverUrl } from "./config.js";

type Json = Record<string, unknown>;

export type DeviceProofMaterial = {
  deviceId: string;
  machineFingerprint: string;
  publicKey: string;
  privateKey: string;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function tokenJti(token: string): string {
  const encoded = token.split(".")[1] ?? "";
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { jti?: unknown };
    return typeof payload.jti === "string" ? payload.jti : "";
  } catch {
    return "";
  }
}

export function buildDeviceProof(token: string, method: string, route: string, body: unknown, device: DeviceProofMaterial): Record<string, string> {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash("sha256").update(stableJson(body ?? {})).digest("hex");
  const payload = [method.toUpperCase(), route, tokenJti(token), timestamp, nonce, bodyHash].join("\n");
  const signer = crypto.createSign("sha256");
  signer.update(payload);
  signer.end();
  const signature = signer.sign(device.privateKey).toString("base64");
  return {
    "x-worker-device-id": device.deviceId,
    "x-worker-device-public-key": device.publicKey,
    "x-worker-device-nonce": nonce,
    "x-worker-device-timestamp": timestamp,
    "x-worker-device-signature": signature,
    "x-worker-body-sha256": bodyHash,
    "x-worker-machine-fingerprint": device.machineFingerprint,
  };
}

async function request<T>(route: string, init: RequestInit & { maxBytes?: number } = {}): Promise<T> {
  const url = new URL(route, `${serverUrl()}/`);
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
  const maxBytes = init.maxBytes ?? 4 * 1024 * 1024;
  const bytes = Number(response.headers.get("content-length") ?? 0);
  if (bytes > maxBytes) throw new Error("control-plane response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("control-plane response body missing");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("control-plane response too large");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  if (!response.ok) throw new Error(`control_plane_${response.status}`);
  return JSON.parse(text) as T;
}

export async function startConnect(payload: Json): Promise<Json> {
  return request<Json>("/api/workers/connect/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
}

export async function pollConnect(deviceCode: string): Promise<Json> {
  return request<Json>("/api/workers/connect/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceCode }) });
}

export async function refreshToken(refreshTokenValue: string): Promise<Json> {
  return request<Json>("/api/workers/connect/refresh", { method: "POST", headers: { authorization: `Bearer ${refreshTokenValue}`, "content-type": "application/json" }, body: JSON.stringify({}) });
}

export async function refreshTokenWithProof(refreshTokenValue: string, device: DeviceProofMaterial): Promise<Json> {
  const body = {};
  return request<Json>("/api/workers/connect/refresh", { method: "POST", headers: { authorization: `Bearer ${refreshTokenValue}`, "content-type": "application/json", ...buildDeviceProof(refreshTokenValue, "POST", "/api/workers/connect/refresh", body, device) }, body: JSON.stringify(body) });
}

export async function workerRequest<T>(route: string, token: string, body: Json, device?: DeviceProofMaterial): Promise<T> {
  return request<T>(route, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(device ? buildDeviceProof(token, "POST", route, body, device) : {}) }, body: JSON.stringify(body) });
}

export async function uploadArtifact(input: {
  jobId: string; token: string; uploadToken: string; filePath: string; leaseOwnerToken: string; assignmentAttempt: string; device?: DeviceProofMaterial;
}): Promise<Json> {
  const stat = await fs.stat(input.filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error("artifact_file_invalid");
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(input.filePath)) hash.update(chunk);
  const checksum = hash.digest("hex");
  const fileName = path.basename(input.filePath);
  const init = await workerRequest<Json>(`/api/worker-jobs/${input.jobId}/artifacts/init-upload`, input.uploadToken, {
    artifactType: "remotion_render_video", fileName, contentType: "video/mp4", sizeBytes: stat.size,
    checksumSha256: checksum, leaseOwnerToken: input.leaseOwnerToken, assignmentAttempt: input.assignmentAttempt,
  }, input.device);
  if (init.method !== "presigned" || typeof init.uploadUrl !== "string") throw new Error("artifact_upload_not_supported");
  let uploadUrl: URL;
  try {
    uploadUrl = new URL(init.uploadUrl);
    if (uploadUrl.protocol !== "https:" || uploadUrl.username || uploadUrl.password || uploadUrl.hash) {
      throw new Error("invalid_presigned_url");
    }
  } catch {
    throw new Error("artifact_upload_url_invalid");
  }
  const put = await fetch(init.uploadUrl, {
    method: "PUT", redirect: "error", signal: AbortSignal.timeout(30 * 60_000),
    headers: { "content-type": "video/mp4", "content-length": String(stat.size) },
    body: createReadStream(input.filePath) as any,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!put.ok) throw new Error("artifact_put_failed");
  return workerRequest<Json>(`/api/worker-jobs/${input.jobId}/artifacts/complete`, input.uploadToken, {
    artifactType: "remotion_render_video", storageRef: init.storageRef, checksumSha256: checksum, sizeBytes: stat.size,
    contentType: "video/mp4", leaseOwnerToken: input.leaseOwnerToken, assignmentAttempt: input.assignmentAttempt,
    metadataJson: { verificationState: "worker_uploaded", sha256: checksum, sizeBytes: stat.size },
  }, input.device);
}
