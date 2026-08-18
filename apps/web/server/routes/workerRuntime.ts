import crypto from "crypto";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

import type { Express, Request, Response } from "express";
import { z } from "zod";

import type { TenantRequest } from "../_core/tenant";
import {
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
  workerArtifactCompletePayloadSchema,
  workerArtifactInitPayloadSchema,
  workerClaimRequestSchema,
  workerDiagnosticsPayloadSchema,
  workerHeartbeatPayloadSchema,
  workerJobEventPayloadSchema,
  workerRegistrationPayloadSchema,
  remotionExecutorRuntimePackManifestSchema,
} from "../../shared/workerRuntime";
import {
  defaultHermesMediaAdapterRepo,
  extractHermesJobReferenceAssetIds,
  HermesReferenceAssetOwnershipError,
  mintHermesMediaReferenceUrls,
} from "../services/hermesMediaAdapter";
import { finalizeHermesMediaArtifact } from "../services/hermesMediaFinalizeService";
import { settleHermesConnectionJob } from "../services/hermesConnectionJobs";
import {
  delegatedSessionRequestSchema,
  delegatedWorkerCallbackPayloadSchema,
} from "../../shared/workerDelegation";
import { sendApiError } from "../middleware/publicApiHeaders";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import { debugError } from "../_core/logger";
import {
  createWorkerRegistrationToken,
  WorkerAuthError,
  extractWorkerDeviceProofFromRequest,
  extractBearerTokenFromRequest,
  refreshWorkerAccessTokens,
  type VerifyWorkerAccessTokenOptions,
  verifyWorkerAccessToken,
  verifyWorkerRegistrationToken,
  issueWorkerAccessTokens,
} from "../services/workerAuthService";
import { authorizeRequest } from "../_core/authz";
import {
  createDelegatedWorkerSession,
  getDelegatedWorkerManifest,
  WorkerDelegationError,
} from "../services/workerDelegationService";
import {
  publishWorkerCallback,
  WorkerCallbackError,
} from "../services/workerCallbackService";
import {
  WorkerRuntimeServiceError,
  claimWorkerJob,
  completeWorkerArtifact,
  initWorkerArtifactUpload,
  recordWorkerDiagnostics,
  recordWorkerHeartbeat,
  recordWorkerJobEvent,
  registerWorker,
} from "../services/workerRegistryService";
import { getWorkerPolicySnapshot } from "../services/workerPolicyService";
import {
  getEphemeralJson,
  getEphemeralText,
  setEphemeralJson,
  setEphemeralText,
  RedisEphemeralKeyRegistryError,
} from "../services/redisEphemeralKeyRegistry";
import { getWorkerAccessPermissionScopesForPreset } from "../../shared/workerAccessKeys";
import { getDb, getUserById } from "../db";
import { tenants, type WorkerArtifact, type WorkerJob } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { verifyBearerToken } from "../_core/tokens";
import { isConnectedDeviceRevoked, upsertConnectedDevice, updateConnectedDeviceTokenMetadata } from "../services/connectedDeviceService";

interface WorkerRuntimeRouteDeps {
  runtimePacks?: {
    releaseDirs?: string[];
  };
  workerCallbacks?: {
    publishWorkerCallback: typeof publishWorkerCallback;
  };
  workerDelegation?: {
    createDelegatedWorkerSession: typeof createDelegatedWorkerSession;
    getDelegatedWorkerManifest: typeof getDelegatedWorkerManifest;
  };
  workerPolicy?: {
    getWorkerPolicySnapshot: typeof getWorkerPolicySnapshot;
  };
  workerRegistry?: {
    claimWorkerJob: typeof claimWorkerJob;
    completeWorkerArtifact: typeof completeWorkerArtifact;
    initWorkerArtifactUpload: typeof initWorkerArtifactUpload;
    recordWorkerDiagnostics: typeof recordWorkerDiagnostics;
    recordWorkerHeartbeat: typeof recordWorkerHeartbeat;
    recordWorkerJobEvent: typeof recordWorkerJobEvent;
    registerWorker: typeof registerWorker;
  };
}

const WORKER_CONNECT_TTL_SECONDS = 15 * 60;
const WORKER_CONNECT_APPROVED_TTL_SECONDS = 2 * 60;
const WORKER_CONNECT_POLL_INTERVAL_SECONDS = 3;
const DEFAULT_WORKER_RUNTIME_PACK_ID = "hyperframes-wsl2";
const SUPPORTED_WORKER_RUNTIME_PACK_IDS = new Set([
  "hyperframes-wsl2",
  "hyperframes-windows-x64",
  "hyperframes-macos-arm64",
]);
const WORKER_RUNTIME_PACK_FILE_PATTERN = /^smart-ai-hub-worker-runtime-(hyperframes-(?:wsl2|windows-x64|macos-arm64))-(.+)\.zip$/i;
// Feature 135 §11 — Hermes runtime pack ids, additive and independent of the
// HyperFrames pack family above (own file-name pattern, own manifest shape,
// own allow-gate). Windows and macOS Apple Silicon are separate runtime packs;
// the macOS id is arm64-only and never selects or mutates the Windows pack.
const HERMES_RUNTIME_PACK_IDS = new Set(["hermes-windows-x64", "hermes-macos-arm64"]);
const HERMES_RUNTIME_PACK_FILE_PATTERN =
  /^smart-ai-hub-hermes-runtime-(hermes-(?:windows-x64|macos-arm64))-(.+)\.zip$/i;
const REMOTION_EXECUTOR_PACK_IDS = new Set([
  "remotion-executor-windows-x64",
  "remotion-executor-macos-arm64",
  "remotion-executor-macos-x64",
]);
const REMOTION_EXECUTOR_PACK_FILE_PATTERN =
  /^smart-ai-hub-remotion-executor-(remotion-executor-(?:windows-x64|macos-arm64|macos-x64))-(.+)\.zip$/i;
const HERMES_MACOS_SUPPORTED_MODELS = [
  "Apple Silicon Mac with M1",
  "Apple Silicon Mac with M2",
  "Apple Silicon Mac with M3",
  "Apple Silicon Mac with M4",
] as const;
const DENIED_RUNTIME_SIDECAR_SHA256 = new Set([
  // Placeholder sidecar from early runtime pack scaffolding.
  "f04671084625130d4ed59f89ebb29000a411247ed2e8491ecfa3216b6e9e0774",
  // FFmpeg diagnostic smoke renderer: uses lavfi/testsrc2 color bars, not real HyperFrames composition.
  "4a73439229e3c18034ada679a32f005e7e126376631405062f05e88a5562920e",
]);
const workerConnectStartSchema = z.object({
  payload: workerRegistrationPayloadSchema,
});

const workerConnectCodeSchema = z.object({
  deviceCode: z.string().min(16).max(256).optional(),
  device_code: z.string().min(16).max(256).optional(),
  userCode: z.string().min(4).max(32).optional(),
  user_code: z.string().min(4).max(32).optional(),
});

const workerConnectApproveSchema = workerConnectCodeSchema.extend({
  tenantId: z.union([z.string().min(1), z.number().int()]).optional(),
  workspaceId: z.union([z.string().min(1), z.number().int()]).optional(),
});

type WorkerConnectStatus = "pending" | "approved" | "denied" | "expired" | "error";

interface WorkerConnectSession {
  deviceCode: string;
  userCode: string;
  payload: z.infer<typeof workerRegistrationPayloadSchema>;
  createdAt: string;
  expiresAt: string;
  status: WorkerConnectStatus;
  approvedAt?: string;
  approvedByUserId?: number | null;
  tenantId?: string | null;
  errorMessage?: string;
  result?: { worker: Awaited<ReturnType<typeof registerWorker>>["worker"] };
}

function randomCode(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function randomUserCode(): string {
  return crypto.randomBytes(5).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
}

function normalizeConnectDeviceCode(input: unknown): string {
  const parsed = workerConnectCodeSchema.parse(input ?? {});
  const code = parsed.deviceCode ?? parsed.device_code ?? "";
  if (!code) {
    throw new WorkerAuthError("worker_connect_missing_code", 400, "Missing worker device code");
  }
  return code;
}

function normalizeConnectUserCode(input: unknown): string {
  const parsed = workerConnectCodeSchema.parse(input ?? {});
  const code = (parsed.userCode ?? parsed.user_code ?? "").trim().toUpperCase();
  if (!code) {
    throw new WorkerAuthError("worker_connect_missing_code", 400, "Missing worker approval code");
  }
  return code;
}

function normalizeRequestedTenantId(input: unknown): string {
  const parsed = workerConnectApproveSchema.parse(input ?? {});
  const requestedTenantId = parsed.tenantId ?? parsed.workspaceId ?? null;
  return requestedTenantId === null || requestedTenantId === undefined
    ? ""
    : String(requestedTenantId).trim();
}

function publicBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = forwardedHost || String(req.headers.host || "").trim();
  return host ? `${proto}://${host}` : "";
}

async function resolveApprovedTenantId(
  auth: Awaited<ReturnType<typeof authorizeRequest>>,
  requestedTenantId = "",
  requestTenantId = "",
): Promise<string> {
  if (!auth.ok || auth.mode !== "session") {
    return "";
  }
  const cleanRequestedTenantId = String(requestedTenantId || "").trim();
  const cleanRequestTenantId = String(requestTenantId || "").trim();
  if (cleanRequestedTenantId) {
    if (cleanRequestTenantId && cleanRequestTenantId !== cleanRequestedTenantId) {
      return "";
    }
    const userRole = String((auth.user as any)?.role || "").trim();
    const currentTenantId = String((auth.user as any)?.currentTenantId || "").trim();
    if (
      userRole !== "admin"
      && userRole !== "domain_admin"
      && currentTenantId
      && currentTenantId !== cleanRequestedTenantId
    ) {
      return "";
    }
    const db = await getDb();
    if (!db) {
      return "";
    }
    const [tenantRow] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, cleanRequestedTenantId)).limit(1);
    return tenantRow?.id ? String(tenantRow.id) : "";
  }
  const authTenantId = String(auth.tenantId || "").trim();
  if (authTenantId) {
    return authTenantId;
  }
  const sessionTenantId = String((auth.user as any)?.currentTenantId || "").trim();
  if (sessionTenantId) {
    return sessionTenantId;
  }
  if (cleanRequestTenantId) {
    return cleanRequestTenantId;
  }
  const userId = Number.isInteger(auth.userId) && auth.userId && auth.userId > 0
    ? auth.userId
    : Number.parseInt(String((auth.user as any)?.id || ""), 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return "";
  }
  const dbUser = await getUserById(userId);
  return String(dbUser?.currentTenantId || "").trim();
}

function isWorkerConnectExpired(session: WorkerConnectSession): boolean {
  return Date.parse(session.expiresAt) <= Date.now();
}

function browserSessionPayload(session: WorkerConnectSession) {
  const expired = isWorkerConnectExpired(session);
  return {
    status: expired && session.status === "pending" ? "expired" : session.status,
    userCode: session.userCode,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    worker: session.result?.worker
      ? {
          id: session.result.worker.id,
          displayName: session.result.worker.displayName,
          runtimeType: session.result.worker.runtimeType,
          machineName: session.result.worker.machineName ?? null,
        }
      : null,
    request: {
      displayName: session.payload.displayName,
      runtimeType: session.payload.runtimeType,
      machineName: session.payload.machineName ?? null,
      sharingMode: session.payload.workerMode,
    },
    errorMessage: session.errorMessage ?? null,
  };
}

function redisKeysForConnect(deviceCode: string, userCode?: string) {
  return {
    device: `worker-connect:device:${deviceCode}`,
    user: userCode ? `worker-connect:user:${userCode}` : null,
  };
}

async function saveWorkerConnectSession(session: WorkerConnectSession): Promise<void> {
  const keys = redisKeysForConnect(session.deviceCode, session.userCode);
  const ttl = session.status === "approved" ? WORKER_CONNECT_APPROVED_TTL_SECONDS : WORKER_CONNECT_TTL_SECONDS;
  await setEphemeralJson(keys.device, session, ttl);
  if (keys.user) await setEphemeralText(keys.user, session.deviceCode, ttl);
}

async function getWorkerConnectSessionByDevice(deviceCode: string): Promise<WorkerConnectSession | null> {
  return getEphemeralJson<WorkerConnectSession>(redisKeysForConnect(deviceCode).device);
}

async function getWorkerConnectSessionByUserCode(userCode: string): Promise<WorkerConnectSession | null> {
  const deviceCode = await getEphemeralText(redisKeysForConnect("", userCode).user ?? "");
  return deviceCode ? getWorkerConnectSessionByDevice(deviceCode) : null;
}

function handleWorkerRouteError(error: unknown, res: Response): void {
  if (error instanceof RedisEphemeralKeyRegistryError) {
    sendApiError(res, 503, error.code, "Worker connection state is temporarily unavailable; try again shortly", "transient_error");
    return;
  }
  if (
    error instanceof WorkerAuthError
    || error instanceof WorkerRuntimeServiceError
    || error instanceof WorkerDelegationError
    || error instanceof WorkerCallbackError
  ) {
    sendApiError(res, error.statusCode, error.code, error.message, error.type);
    return;
  }
  if (error && typeof error === "object" && "issues" in (error as any)) {
    const issues = Array.isArray((error as any).issues) ? (error as any).issues : [];
    sendApiError(
      res,
      400,
      "invalid_request",
      issues.map((issue: any) => issue?.message).filter(Boolean).join("; ") || "Invalid request",
    );
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  sendApiError(res, 500, "internal_error", message, "internal_error");
}

function getRuntimePackReleaseDirs(): string[] {
  const configuredDirs = (
    process.env.SMARTAIHUB_RUNTIME_RELEASES_DIR
    || process.env.SMARTAIHUB_PUBLIC_RELEASES_DIR
    || ""
  )
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(value, value.endsWith("/runtime") ? "" : "runtime"));
  const candidates = [
    ...configuredDirs,
    path.resolve(process.cwd(), "client/public/releases/runtime"),
    path.resolve(process.cwd(), "dist/public/releases/runtime"),
    path.resolve(process.cwd(), "public/releases/runtime"),
    path.resolve(import.meta.dirname, "../../client/public/releases/runtime"),
    path.resolve(import.meta.dirname, "../../dist/public/releases/runtime"),
    path.resolve(import.meta.dirname, "../../public/releases/runtime"),
  ];
  return Array.from(new Set(candidates));
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findLatestRuntimePack(releaseDirs: string[], runtimeId = DEFAULT_WORKER_RUNTIME_PACK_ID) {
  const packs: Array<{
    fileName: string;
    filePath: string;
    runtimeId: string;
    version: string;
    updatedAt: string;
    sizeBytes: number;
  }> = [];
  for (const releaseDir of releaseDirs) {
    if (!fs.existsSync(releaseDir)) continue;
    for (const fileName of fs.readdirSync(releaseDir)) {
      const match = fileName.match(WORKER_RUNTIME_PACK_FILE_PATTERN);
      if (!match?.[1] || !match?.[2]) continue;
      if (match[1] !== runtimeId) continue;
      const filePath = path.join(releaseDir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      packs.push({
        fileName,
        filePath,
        runtimeId: match[1],
        version: match[2],
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }
  return packs.sort((left, right) => {
    const versionCompare = right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" });
    return versionCompare || right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}

function readRuntimePackManifest(packFilePath: string): Record<string, unknown> | null {
  const manifestPath = `${packFilePath}.manifest.json`;
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function archiveContainsFiles(filePath: string, requiredFiles: string[]): boolean {
  try {
    const entries = new Set(new AdmZip(filePath).getEntries().map((entry) => entry.entryName));
    return requiredFiles.every((file) => {
      if (file.endsWith("*")) {
        const prefix = file.slice(0, -1);
        return Array.from(entries).some((entryName) => entryName.startsWith(prefix));
      }
      return entries.has(file);
    });
  } catch {
    return false;
  }
}

function archiveEntriesFromManifest(manifest: Record<string, unknown> | null): string[] | null {
  const archiveEntries = manifest?.archiveEntries;
  if (!Array.isArray(archiveEntries)) return null;
  const entries = archiveEntries.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return entries.length > 0 ? entries : null;
}

function manifestArchiveContainsFiles(manifest: Record<string, unknown> | null, requiredFiles: string[]): boolean {
  const archiveEntries = archiveEntriesFromManifest(manifest);
  if (!archiveEntries) return false;
  const entries = new Set(archiveEntries);
  return requiredFiles.every((file) => {
    if (file.endsWith("*")) {
      const prefix = file.slice(0, -1);
      return archiveEntries.some((entryName) => entryName.startsWith(prefix));
    }
    return entries.has(file);
  });
}

function runtimeArchiveContainsFiles(
  filePath: string,
  manifest: Record<string, unknown> | null,
  requiredFiles: string[],
): boolean {
  if (manifestArchiveContainsFiles(manifest, requiredFiles)) return true;
  return archiveContainsFiles(filePath, requiredFiles);
}

function requiredRuntimeArchiveFiles(runtimeId: string): string[] {
  const common = [
    "runtime-pack/manifest.json",
    "runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js",
    "runtime-pack/hyperframes/node_modules/@hyperframes/producer/package.json",
    "runtime-pack/hyperframes-sidecar/render.mjs",
    "runtime-pack/SHA256SUMS",
    "runtime-pack/SHA256SUMS.sig",
  ];
  if (runtimeId === "hyperframes-wsl2") {
    return [
      ...common,
      "runtime-pack/node/bin/node",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
      "runtime-pack/browser-libs/libnspr4.so*",
      "runtime-pack/browser-libs/libnss3.so*",
      "runtime-pack/browser-libs/libnssutil3.so*",
      "runtime-pack/browser-libs/libsmime3.so*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*",
      "sidecars/hyperframes-render.exe",
    ];
  }
  if (runtimeId === "hyperframes-macos-arm64") {
    return [
      ...common,
      "runtime-pack/node/bin/node",
      "runtime-pack/bin/ffmpeg",
      "runtime-pack/bin/ffprobe",
      "runtime-pack/browser/*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64*",
      "runtime-pack/hyperframes/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp*",
      "runtime-pack/remotion-sidecar/render.mjs",
      "runtime-pack/remotion-sidecar/node_modules/@smartspec/remotion-render/dist/index.js",
      "sidecars/hyperframes-render",
    ];
  }
  return [
    ...common,
    "runtime-pack/node/node.exe",
    "runtime-pack/bin/ffmpeg.exe",
    "runtime-pack/bin/ffprobe.exe",
    "sidecars/hyperframes-render.exe",
  ];
}

function isOfficialRuntimePackManifest(
  manifest: Record<string, unknown> | null,
  runtimeId = DEFAULT_WORKER_RUNTIME_PACK_ID,
): manifest is Record<string, unknown> {
  if (!manifest || manifest.allowed !== true) return false;
  if (!SUPPORTED_WORKER_RUNTIME_PACK_IDS.has(runtimeId)) return false;
  const manifestRuntimeId = stringField(manifest.runtimeId);
  if (manifestRuntimeId && manifestRuntimeId !== runtimeId) return false;
  const sidecarSha256 = stringField(manifest.sidecarSha256).toLowerCase();
  if (DENIED_RUNTIME_SIDECAR_SHA256.has(sidecarSha256)) return false;
  const denyReason = stringField(manifest.denyReason).toLowerCase();
  const hyperframesVersion = stringField(manifest.hyperframesVersion).toLowerCase();
  const runtimeKind = stringField(manifest.runtimeKind).toLowerCase();
  const sidecarKind = stringField(manifest.sidecarKind).toLowerCase();
  const rendererKind = stringField(manifest.rendererKind);
  const sidecarLauncher = stringField(manifest.sidecarLauncher);
  const sidecarScriptPath = stringField(manifest.sidecarScriptPath);
  const runtimePlatform = stringField(manifest.runtimePlatform).toLowerCase();
  if (rendererKind !== "hyperframes_cli_official") return false;
  if (sidecarLauncher !== "smart-ai-hub-hyperframes-node-launcher") return false;
  if (sidecarScriptPath !== "hyperframes-sidecar/render.mjs") return false;
  if (runtimeId === "hyperframes-wsl2" && !/wsl2|linux/.test(runtimePlatform)) return false;
  if (runtimeId === "hyperframes-windows-x64" && !/windows|win/.test(runtimePlatform || runtimeId)) return false;
  if (runtimeId === "hyperframes-macos-arm64" && !/macos|darwin/.test(runtimePlatform)) return false;
  const architecture = stringField(manifest.architecture).toLowerCase();
  if (runtimeId === "hyperframes-macos-arm64" && !architecture.includes("arm64")) return false;
  const blockedText = [denyReason, hyperframesVersion, runtimeKind, sidecarKind, runtimePlatform].join(" ");
  if ([
    "mock",
    "placeholder",
    "smoke",
    "testsrc",
    "lavfi",
    "ffmpeg-render-sidecar",
    "diagnostic",
    "fallback",
  ].some(marker => blockedText.includes(marker))) {
    return false;
  }
  return hyperframesVersion.includes("hyperframes@") && hyperframesVersion.includes("@hyperframes/producer@");
}

function findLatestAllowedRuntimePack(releaseDirs: string[], runtimeId = DEFAULT_WORKER_RUNTIME_PACK_ID) {
  const candidates: Array<NonNullable<ReturnType<typeof findLatestRuntimePack>>> = [];
  for (const releaseDir of releaseDirs) {
    if (!fs.existsSync(releaseDir)) continue;
    for (const fileName of fs.readdirSync(releaseDir)) {
      const match = fileName.match(WORKER_RUNTIME_PACK_FILE_PATTERN);
      if (!match?.[1] || !match?.[2]) continue;
      if (match[1] !== runtimeId) continue;
      const filePath = path.join(releaseDir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const manifest = readRuntimePackManifest(filePath);
      if (!isOfficialRuntimePackManifest(manifest, runtimeId)) continue;
      if (!runtimeArchiveContainsFiles(filePath, manifest, requiredRuntimeArchiveFiles(runtimeId))) continue;
      candidates.push({
        fileName,
        filePath,
        runtimeId: match[1],
        version: match[2],
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }
  return candidates.sort((left, right) => {
    const versionCompare = right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" });
    return versionCompare || right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 §11 — Hermes runtime pack manifest serving. Deliberately does
// NOT reuse `isOfficialRuntimePackManifest`/`findLatestAllowedRuntimePack`
// (those encode HyperFrames-specific manifest fields like `hyperframesVersion`);
// the Hermes pack (built by `apps/web/scripts/build-hermes-runtime-pack.ts`)
// has its own manifest shape (`hermes_runtime.rs::HermesRuntimeManifest`).
// ────────────────────────────────────────────────────────────────────────

function findLatestHermesRuntimePack(releaseDirs: string[], runtimeId: string) {
  const candidates: Array<{
    fileName: string;
    filePath: string;
    runtimeId: string;
    version: string;
    updatedAt: string;
    sizeBytes: number;
  }> = [];
  for (const releaseDir of releaseDirs) {
    if (!fs.existsSync(releaseDir)) continue;
    for (const fileName of fs.readdirSync(releaseDir)) {
      const match = fileName.match(HERMES_RUNTIME_PACK_FILE_PATTERN);
      if (!match?.[1] || !match?.[2]) continue;
      if (match[1] !== runtimeId) continue;
      const filePath = path.join(releaseDir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      candidates.push({
        fileName,
        filePath,
        runtimeId: match[1],
        version: match[2],
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }
  return candidates.sort((left, right) => {
    const versionCompare = right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" });
    return versionCompare || right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}

function findLatestRemotionExecutorPack(releaseDirs: string[], runtimeId: string) {
  const candidates: Array<NonNullable<ReturnType<typeof findLatestRuntimePack>>> = [];
  for (const releaseDir of releaseDirs) {
    if (!fs.existsSync(releaseDir)) continue;
    for (const fileName of fs.readdirSync(releaseDir)) {
      const match = fileName.match(REMOTION_EXECUTOR_PACK_FILE_PATTERN);
      if (!match?.[1] || !match?.[2] || match[1] !== runtimeId) continue;
      const filePath = path.join(releaseDir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const manifest = readRuntimePackManifest(filePath);
      if (!remotionExecutorRuntimePackManifestSchema.safeParse(manifest).success) continue;
      const manifestRuntimeId = stringField(manifest?.runtimeId);
      const runtimeKind = stringField(manifest?.runtimeKind);
      const platform = stringField(manifest?.runtimePlatform).toLowerCase();
      if (manifest?.allowed !== true || (manifestRuntimeId && manifestRuntimeId !== runtimeId)) continue;
      if (runtimeKind !== "standalone_remotion_executor") continue;
      if (runtimeId.includes("windows") && !platform.includes("windows")) continue;
      if (runtimeId.includes("macos") && !platform.includes("macos")) continue;
      const architecture = stringField(manifest?.architecture).toLowerCase();
      if (runtimeId.includes("arm64") && !architecture.includes("arm64")) continue;
      if (runtimeId.includes("macos-x64") && !architecture.includes("x86_64") && !architecture.includes("x64")) continue;
      if (!runtimeArchiveContainsFiles(filePath, manifest, ["runtime-pack/remotion-sidecar/render.mjs"])) continue;
      candidates.push({ fileName, filePath, runtimeId: match[1], version: match[2], updatedAt: stat.mtime.toISOString(), sizeBytes: stat.size });
    }
  }
  return candidates.sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" }) || right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

/** Synthesized manifest for a registered Hermes pack that is not published.
 * Includes every field `HermesRuntimeManifest` requires in Rust so
 * `fetch_runtime_manifest` still parses successfully, plus public hardware
 * metadata used by the Dashboard. */
function defaultHermesManifestEntry(runtimeId: string): Record<string, unknown> {
  return {
    runtimeId,
    version: "0.0.0",
    hermesVersion: "0.0.0",
    pythonRelativePath: "",
    hermesRelativePath: "",
    checksumFile: "SHA256SUMS",
    signatureFile: "SHA256SUMS.sig",
    allowed: false,
    denyReason: `${runtimeId} runtime pack has not been published yet`,
    platform: runtimeId === "hermes-macos-arm64" ? "macos" : "windows",
    architecture: runtimeId === "hermes-macos-arm64" ? "arm64" : "x86_64",
    supportedMacModels: runtimeId === "hermes-macos-arm64" ? HERMES_MACOS_SUPPORTED_MODELS : [],
    unsupportedMacArchitectures: runtimeId === "hermes-macos-arm64" ? ["x86_64 (Intel)"] : [],
  };
}

function requireBearerToken(req: Request): string {
  const token = extractBearerTokenFromRequest(req);
  if (!token) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker authentication required");
  }
  return token;
}

async function verifyWorkerRouteAccessToken(
  req: Request,
  token: string,
  opts: VerifyWorkerAccessTokenOptions = {},
) {
  const claims = await verifyWorkerAccessToken(token, {
    ...opts,
    requestProof: extractWorkerDeviceProofFromRequest(req),
  });
  if (await isConnectedDeviceRevoked({
    tenantId: String(claims.tenantId ?? ""),
    workerConnectionId: claims.workerConnectionId ? String(claims.workerConnectionId) : null,
    authKind: "worker_executor",
  })) {
    throw new WorkerAuthError("worker_connection_blocked", 401, "Worker connection is revoked and must be paired again");
  }
  return claims;
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 — Hermes Grok media worker (section 06): claim-time reference
// URL enrichment + the `/references/urls` re-mint route. `workerRegistryService.ts`
// is off-limits to this section (concurrent-edit guard), so the lease /
// job-scope checks below are deliberately duplicated (not imported) from
// `ensureLease` / `ensureJobScopedAccess` in that file — same semantics,
// applied only to this narrow reference-URL surface.
// ────────────────────────────────────────────────────────────────────────

const HERMES_MEDIA_JOB_TYPES: ReadonlySet<string> = new Set([
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
]);

const HERMES_MEDIA_REFERENCE_URL_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "claimed",
  "preparing",
  "running",
  "uploading",
]);

// Code review fix (nit): `workerRegistryService.ts`'s `ensureAssignmentAttempt`
// (the /events route's equivalent check) only ever enforces stale-attempt
// rejection for `jobType === "hyperframes_final_composite"` — it's a no-op
// for every other job type, including hermes_media_*. Since this route has
// no matching enforcement to mirror, `assignmentAttempt` is dropped from
// the request schema entirely rather than accepted-but-ignored.
const hermesReferenceUrlRequestSchema = z.object({
  leaseOwnerToken: z.string().min(1),
});

function ensureHermesJobScopedAccess(
  auth: { tenantId: string; runtimeType: string; workerId: string },
  job: { tenantId: string; runtimeType: string; workerId: string | null },
): void {
  if (job.tenantId !== auth.tenantId || job.runtimeType !== auth.runtimeType) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not match the requested job scope", "auth_error");
  }
  if (job.workerId && job.workerId !== auth.workerId) {
    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not own the requested job", "auth_error");
  }
}

function ensureHermesJobLease(
  job: { leaseOwnerToken: string | null; leaseExpiresAt: Date | string | null },
  leaseOwnerToken: string,
): void {
  if (!leaseOwnerToken || !job.leaseOwnerToken || job.leaseOwnerToken !== leaseOwnerToken) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease token is stale or invalid");
  }
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease has expired");
  }
}

async function mintHermesReferenceUrlsOrThrow(params: {
  tenantId: string;
  requestedByUserId: number | null;
  references: Array<{ assetId: string }>;
}) {
  if (params.references.length === 0 || params.requestedByUserId == null) {
    return [];
  }
  try {
    return await mintHermesMediaReferenceUrls({
      tenantId: params.tenantId,
      requestedByUserId: params.requestedByUserId,
      references: params.references,
    });
  } catch (error) {
    if (error instanceof HermesReferenceAssetOwnershipError) {
      throw new WorkerRuntimeServiceError(
        "hermes_reference_asset_not_found",
        404,
        error.message,
        "not_found_error",
      );
    }
    throw error;
  }
}

export function registerWorkerRuntimeRoutes(
  app: Express,
  deps: WorkerRuntimeRouteDeps = {},
): void {
  const workerDelegation = deps.workerDelegation ?? {
    createDelegatedWorkerSession,
    getDelegatedWorkerManifest,
  };
  const workerCallbacks = deps.workerCallbacks ?? {
    publishWorkerCallback,
  };
  const workerRegistry = deps.workerRegistry ?? {
    claimWorkerJob,
    completeWorkerArtifact,
    initWorkerArtifactUpload,
    recordWorkerDiagnostics,
    recordWorkerHeartbeat,
    recordWorkerJobEvent,
    registerWorker,
  };
  const workerPolicy = deps.workerPolicy ?? { getWorkerPolicySnapshot };
  const runtimePackReleaseDirs = deps.runtimePacks?.releaseDirs ?? getRuntimePackReleaseDirs();

  const registrationLimiter = rateLimit("workers-register", { rpm: 10 });
  const heartbeatLimiter = rateLimit("workers-heartbeat", { rpm: 120 });
  const claimLimiter = rateLimit("workers-claim", { rpm: 60 });
  const delegatedSessionLimiter = rateLimit("worker-delegated-session", { rpm: 60 });
  const eventLimiter = rateLimit("worker-job-events", { rpm: 240 });
  const artifactLimiter = rateLimit("worker-job-artifacts", { rpm: 120 });
  const diagnosticsLimiter = rateLimit("worker-diagnostics", { rpm: 30 });
  const callbackLimiter = rateLimit("worker-job-callbacks", { rpm: 60 });
  const connectLimiter = rateLimit("worker-connect", { rpm: 60 });
  const runtimePackLimiter = rateLimit("worker-runtime-pack", { rpm: 60 });

  app.get(
    "/api/workers/runtime-pack/manifest",
    runtimePackLimiter,
    async (req, res) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        const runtimeId = String(req.query.runtimeId || DEFAULT_WORKER_RUNTIME_PACK_ID).trim();

        // Feature 135 §11 — Hermes runtime pack ids are served by this same
        // endpoint but resolved independently of the HyperFrames pack logic
        // below (see `findLatestHermesRuntimePack`'s doc comment).
        if (HERMES_RUNTIME_PACK_IDS.has(runtimeId)) {
          const hermesPack = findLatestHermesRuntimePack(runtimePackReleaseDirs, runtimeId);
          if (!hermesPack) {
            res.json(defaultHermesManifestEntry(runtimeId));
            return;
          }
          const hermesManifest = readRuntimePackManifest(hermesPack.filePath);
          if (!hermesManifest || hermesManifest.allowed !== true) {
            res.json({
              ...(hermesManifest ?? defaultHermesManifestEntry(runtimeId)),
              runtimeId,
              allowed: false,
            });
            return;
          }
          const hermesManifestArchiveSha256 = stringField(hermesManifest.archiveSha256).toLowerCase();
          const hermesArchiveSha256 = /^[a-f0-9]{64}$/.test(hermesManifestArchiveSha256)
            ? hermesManifestArchiveSha256
            : sha256File(hermesPack.filePath);
          res.json({
            ...hermesManifest,
            runtimeId: hermesManifest.runtimeId ?? hermesPack.runtimeId,
            version: hermesManifest.version ?? hermesPack.version,
            archiveFileName: hermesPack.fileName,
            archiveSha256: hermesArchiveSha256,
            archiveSizeBytes: hermesPack.sizeBytes,
            archiveUrl: `/api/workers/runtime-pack/download/${encodeURIComponent(hermesPack.fileName)}`,
            updatedAt: hermesPack.updatedAt,
          });
          return;
        }

        if (REMOTION_EXECUTOR_PACK_IDS.has(runtimeId)) {
          const executorPack = findLatestRemotionExecutorPack(runtimePackReleaseDirs, runtimeId);
          if (!executorPack) {
            sendApiError(res, 404, "runtime_pack_not_published", "The standalone Remotion executor pack has not been published yet.", "not_found_error");
            return;
          }
          const executorManifest = readRuntimePackManifest(executorPack.filePath);
          const archiveSha256 = /^[a-f0-9]{64}$/.test(stringField(executorManifest?.archiveSha256).toLowerCase())
            ? stringField(executorManifest?.archiveSha256).toLowerCase()
            : sha256File(executorPack.filePath);
          res.json({
            ...(executorManifest ?? {}), runtimeId, version: executorManifest?.version ?? executorPack.version,
            archiveFileName: executorPack.fileName, archiveSha256, archiveSizeBytes: executorPack.sizeBytes,
            archiveUrl: `/api/workers/runtime-pack/download/${encodeURIComponent(executorPack.fileName)}`,
            updatedAt: executorPack.updatedAt,
          });
          return;
        }

        if (!SUPPORTED_WORKER_RUNTIME_PACK_IDS.has(runtimeId)) {
          sendApiError(res, 404, "runtime_pack_not_found", `Runtime pack is not available for ${runtimeId}`, "not_found_error");
          return;
        }
        const pack = findLatestAllowedRuntimePack(runtimePackReleaseDirs, runtimeId);
        if (!pack) {
          sendApiError(
            res,
            404,
            "runtime_pack_not_published",
            "Official HyperFrames runtime pack has not been published yet. Mock, fallback, diagnostic smoke, and FFmpeg test-source packs are not allowed for render jobs.",
            "not_found_error",
          );
          return;
        }
        const manifest = readRuntimePackManifest(pack.filePath);
        if (!isOfficialRuntimePackManifest(manifest, runtimeId)) {
          sendApiError(
            res,
            409,
            "runtime_pack_not_allowed",
            "The latest HyperFrames runtime pack is present but is not allowed for render jobs. Mock, fallback, diagnostic smoke, and FFmpeg test-source packs are blocked.",
            "invalid_request_error",
          );
          return;
        }
        const manifestArchiveSha256 = stringField(manifest.archiveSha256).toLowerCase();
        const archiveSha256 = /^[a-f0-9]{64}$/.test(manifestArchiveSha256)
          ? manifestArchiveSha256
          : sha256File(pack.filePath);
        res.json({
          ...manifest,
          runtimeId: manifest.runtimeId ?? pack.runtimeId,
          version: manifest.version ?? pack.version,
          archiveFileName: pack.fileName,
          archiveSha256,
          archiveSizeBytes: pack.sizeBytes,
          archiveUrl: `/api/workers/runtime-pack/download/${encodeURIComponent(pack.fileName)}`,
          updatedAt: pack.updatedAt,
        });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get(
    "/api/workers/runtime-pack/download/:fileName",
    runtimePackLimiter,
    async (req, res) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        const fileName = path.basename(String(req.params.fileName || ""));

        // Feature 135 §11 — Hermes runtime pack downloads, resolved
        // independently of the HyperFrames pack logic below (own file-name
        // pattern/allow-gate; see `findLatestHermesRuntimePack`).
        const hermesMatch = fileName.match(HERMES_RUNTIME_PACK_FILE_PATTERN);
        if (hermesMatch?.[1] && HERMES_RUNTIME_PACK_IDS.has(hermesMatch[1])) {
          const hermesPack = findLatestHermesRuntimePack(runtimePackReleaseDirs, hermesMatch[1]);
          if (!hermesPack || hermesPack.fileName !== fileName) {
            sendApiError(res, 404, "runtime_pack_not_found", "Hermes runtime pack file was not found", "not_found_error");
            return;
          }
          const hermesManifest = readRuntimePackManifest(hermesPack.filePath);
          if (!hermesManifest || hermesManifest.allowed !== true) {
            sendApiError(res, 409, "runtime_pack_not_allowed", "Hermes runtime pack is not allowed for download", "invalid_request_error");
            return;
          }
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Length", String(hermesPack.sizeBytes));
          res.setHeader("Content-Disposition", `attachment; filename="${hermesPack.fileName.replace(/"/g, "")}"`);
          fs.createReadStream(hermesPack.filePath).pipe(res);
          return;
        }

        const executorMatch = fileName.match(REMOTION_EXECUTOR_PACK_FILE_PATTERN);
        if (executorMatch?.[1] && REMOTION_EXECUTOR_PACK_IDS.has(executorMatch[1])) {
          const executorPack = findLatestRemotionExecutorPack(runtimePackReleaseDirs, executorMatch[1]);
          if (!executorPack || executorPack.fileName !== fileName) {
            sendApiError(res, 404, "runtime_pack_not_found", "Standalone Remotion executor pack was not found", "not_found_error");
            return;
          }
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Length", String(executorPack.sizeBytes));
          res.setHeader("Content-Disposition", `attachment; filename="${executorPack.fileName.replace(/"/g, "")}"`);
          fs.createReadStream(executorPack.filePath).pipe(res);
          return;
        }

        const runtimeMatch = fileName.match(WORKER_RUNTIME_PACK_FILE_PATTERN);
        if (!runtimeMatch?.[1] || !SUPPORTED_WORKER_RUNTIME_PACK_IDS.has(runtimeMatch[1])) {
          sendApiError(res, 400, "invalid_runtime_pack_file", "Invalid runtime pack file name", "invalid_request_error");
          return;
        }
        const pack = findLatestAllowedRuntimePack(runtimePackReleaseDirs, runtimeMatch[1]);
        if (!pack || pack.fileName !== fileName) {
          sendApiError(res, 404, "runtime_pack_not_found", "Runtime pack file was not found", "not_found_error");
          return;
        }
        const manifest = readRuntimePackManifest(pack.filePath);
        if (!isOfficialRuntimePackManifest(manifest, runtimeMatch[1])) {
          sendApiError(res, 409, "runtime_pack_not_allowed", "Runtime pack is not allowed for download", "invalid_request_error");
          return;
        }
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Length", String(pack.sizeBytes));
        res.setHeader("Content-Disposition", `attachment; filename="${pack.fileName.replace(/"/g, "")}"`);
        fs.createReadStream(pack.filePath).pipe(res);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/connect/start",
    connectLimiter,
    enforceJsonBodyMaxBytes(96 * 1024),
    async (req, res) => {
      try {
        const parsed = workerConnectStartSchema.parse(req.body ?? {});
        const now = new Date();
        const expiresAt = new Date(now.getTime() + WORKER_CONNECT_TTL_SECONDS * 1000);
        const deviceCode = randomCode(32);
        let userCode = randomUserCode();
        for (let attempt = 0; attempt < 5 && await getWorkerConnectSessionByUserCode(userCode); attempt += 1) {
          userCode = randomUserCode();
        }
        const baseUrl = publicBaseUrl(req);
        const verificationUri = `${baseUrl}/workers/connect`;
        const verificationUriComplete = `${verificationUri}?code=${encodeURIComponent(userCode)}`;
        const session: WorkerConnectSession = {
          deviceCode,
          userCode,
          payload: parsed.payload,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          status: "pending",
        };
        await saveWorkerConnectSession(session);
        res.status(201).json({
          deviceCode,
          userCode,
          verificationUri,
          verificationUriComplete,
          expiresIn: WORKER_CONNECT_TTL_SECONDS,
          interval: WORKER_CONNECT_POLL_INTERVAL_SECONDS,
        });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get(
    "/api/workers/connect/status",
    connectLimiter,
    async (req, res) => {
      try {
        const userCode = normalizeConnectUserCode(req.query);
        const session = await getWorkerConnectSessionByUserCode(userCode);
        if (!session) {
          sendApiError(res, 404, "worker_connect_not_found", "Worker connection request was not found or has expired", "not_found_error");
          return;
        }
        res.json({ session: browserSessionPayload(session) });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/connect/approve",
    connectLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req, res) => {
      let session: WorkerConnectSession | null = null;
      try {
        const userCode = normalizeConnectUserCode(req.body);
        session = await getWorkerConnectSessionByUserCode(userCode);
        if (!session) {
          sendApiError(res, 404, "worker_connect_not_found", "Worker connection request was not found or has expired", "not_found_error");
          return;
        }
        if (isWorkerConnectExpired(session)) {
          session.status = "expired";
          await saveWorkerConnectSession(session);
          sendApiError(res, 410, "worker_connect_expired", "Worker connection request has expired. Please start Connect again in the Worker App.", "invalid_request_error");
          return;
        }
        if (session.status === "approved") {
          res.json({ session: browserSessionPayload(session) });
          return;
        }
        if (session.status !== "pending") {
          sendApiError(res, 409, "worker_connect_not_pending", "Worker connection request is no longer waiting for approval.", "invalid_request_error");
          return;
        }

        const auth = await authorizeRequest(req, { allowBearer: false, allowSession: true });
        if (!auth.ok || auth.mode !== "session") {
          sendApiError(res, 401, "unauthorized", "Please log in before approving this Worker App.", "auth_error");
          return;
        }
        const requestedTenantId = normalizeRequestedTenantId(req.body);
        const requestTenant = req as TenantRequest;
        const requestTenantId = String(requestTenant.tenantId || requestTenant.tenant?.id || "").trim();
        const tenantId = await resolveApprovedTenantId(auth, requestedTenantId, requestTenantId);
        if (!tenantId) {
          sendApiError(res, 400, "tenant_required", "Please select a workspace before approving this Worker App.", "invalid_request_error");
          return;
        }

        const registrationToken = createWorkerRegistrationToken({
          tenantId,
          registeredByUserId: auth.userId ?? null,
          runtimeType: session.payload.runtimeType,
          externalReference: session.payload.externalReference,
          permissionPreset: "operator_basic",
          permissionScopes: getWorkerAccessPermissionScopesForPreset("operator_basic"),
          subject: `worker-connect:${tenantId}:${session.userCode}`,
        }, "10m");
        const registrationAuth = await verifyWorkerRegistrationToken(registrationToken, {
          runtimeType: session.payload.runtimeType,
        });
        const result = await workerRegistry.registerWorker({
          auth: registrationAuth,
          payload: session.payload,
        });
        if (auth.userId && session.payload.deviceBinding) {
          await upsertConnectedDevice({
            tenantId,
            ownerUserId: auth.userId,
            workerId: result.worker.id,
            deviceId: session.payload.deviceBinding.deviceId,
            displayName: result.worker.displayName,
            runtimeType: result.worker.runtimeType,
            authKind: "worker_executor",
            connectionMethod: "worker_connect",
            platform: typeof session.payload.hardwareJson?.platform === "string" ? session.payload.hardwareJson.platform : null,
            architecture: typeof session.payload.hardwareJson?.architecture === "string" ? session.payload.hardwareJson.architecture : null,
            scopes: ["workers:heartbeat", "workers:claim", "workers:report", "workers:diagnostics"],
            approvedAt: new Date(),
            metadataJson: { source: "worker_connect", externalReference: result.worker.externalReference },
          }).catch((error) => {
            console.warn("[workerRuntime] connected device metadata unavailable", error instanceof Error ? error.message : String(error));
          });
        }
        session.errorMessage = undefined;
        session.status = "approved";
        session.approvedAt = new Date().toISOString();
        session.approvedByUserId = auth.userId ?? null;
        session.tenantId = tenantId;
        // Never serialize access/upload/refresh tokens into the device-code
        // record. They are minted only when the device redeems approval.
        session.result = { worker: result.worker };
        await saveWorkerConnectSession(session);
        res.json({ session: browserSessionPayload(session) });
      } catch (error) {
        if (session) {
          session.errorMessage = error instanceof Error ? error.message : "Worker App approval failed";
          await saveWorkerConnectSession(session);
        }
        console.error("[workerRuntime] connect approve failed", {
          userCode: session?.userCode ?? null,
          runtimeType: session?.payload.runtimeType ?? null,
          externalReference: session?.payload.externalReference ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/connect/token",
    connectLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req, res) => {
      try {
        const deviceCode = normalizeConnectDeviceCode(req.body);
        const session = await getWorkerConnectSessionByDevice(deviceCode);
        if (!session) {
          sendApiError(res, 404, "worker_connect_not_found", "Worker connection request was not found or has expired", "not_found_error");
          return;
        }
        if (isWorkerConnectExpired(session) && session.status === "pending") {
          session.status = "expired";
          await saveWorkerConnectSession(session);
        }
        if (session.status !== "approved" || !session.result) {
          res.json({
            status: session.status,
            interval: WORKER_CONNECT_POLL_INTERVAL_SECONDS,
            expiresAt: session.expiresAt,
            errorMessage: session.errorMessage ?? null,
          });
          return;
        }
        if (session.payload.deviceBinding?.deviceId && await isConnectedDeviceRevoked({
          tenantId: session.tenantId ?? session.result.worker.tenantId,
          deviceId: session.payload.deviceBinding.deviceId,
          authKind: "worker_executor",
        })) {
          sendApiError(res, 401, "worker_connection_revoked", "Worker connection was revoked and must be approved again", "authorization_error");
          return;
        }
        const tokens = issueWorkerAccessTokens({
          tenantId: session.tenantId ?? session.result.worker.tenantId,
          workerId: session.result.worker.id,
          runtimeType: session.result.worker.runtimeType,
          teamId: session.result.worker.teamId ?? null,
          deviceBinding: session.payload.deviceBinding ?? undefined,
        });
        await verifyBearerToken(tokens.executionToken).then(async (claims) => {
          await updateConnectedDeviceTokenMetadata({
            tenantId: String(claims.tenantId ?? session.tenantId ?? session.result?.worker.tenantId ?? ""),
            workerId: String(claims.workerId ?? ""),
            workerConnectionId: String(claims.workerConnectionId ?? ""),
            deviceId: typeof claims.deviceId === "string" ? claims.deviceId : null,
            authKind: "worker_executor",
            accessTokenExpiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
          });
        }).catch((error) => {
          console.warn("[workerRuntime] connected device token metadata unavailable", error instanceof Error ? error.message : String(error));
        });
        await verifyBearerToken(tokens.refreshToken).then(async (claims) => {
          await updateConnectedDeviceTokenMetadata({
            tenantId: String(claims.tenantId ?? session.tenantId ?? session.result?.worker.tenantId ?? ""),
            workerId: String(claims.workerId ?? ""),
            workerConnectionId: String(claims.workerConnectionId ?? ""),
            deviceId: typeof claims.deviceId === "string" ? claims.deviceId : null,
            authKind: "worker_executor",
            refreshTokenExpiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
          });
        }).catch((error) => {
          console.warn("[workerRuntime] connected device token metadata unavailable", error instanceof Error ? error.message : String(error));
        });
        res.json({
          status: "approved",
          interval: WORKER_CONNECT_POLL_INTERVAL_SECONDS,
          worker: {
            id: session.result.worker.id,
            displayName: session.result.worker.displayName,
            runtimeType: session.result.worker.runtimeType,
            machineName: session.result.worker.machineName ?? null,
          },
          tokens,
        });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/connect/refresh",
    registrationLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const tokens = await refreshWorkerAccessTokens(token, {
          requestProof: extractWorkerDeviceProofFromRequest(req),
        });
        const executionClaims = await verifyBearerToken(tokens.executionToken);
        const refreshClaims = await verifyBearerToken(tokens.refreshToken);
        await updateConnectedDeviceTokenMetadata({
          tenantId: String(refreshClaims.tenantId ?? ""),
          workerId: String(refreshClaims.workerId ?? ""),
          workerConnectionId: String(refreshClaims.workerConnectionId ?? ""),
          deviceId: typeof refreshClaims.deviceId === "string" ? refreshClaims.deviceId : null,
          authKind: "worker_executor",
          accessTokenExpiresAt: executionClaims.exp ? new Date(executionClaims.exp * 1000) : null,
          refreshTokenExpiresAt: refreshClaims.exp ? new Date(refreshClaims.exp * 1000) : null,
        }).catch((error) => {
          console.warn("[workerRuntime] connected device token metadata unavailable", error instanceof Error ? error.message : String(error));
        });
        res.json({ tokens });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/register",
    registrationLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerRegistrationPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRegistrationToken(token, {
          runtimeType: parsed.runtimeType,
        });
        const result = await workerRegistry.registerWorker({ auth, payload: parsed });
        res.status(result.created ? 201 : 200).json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/:workerId/heartbeat",
    heartbeatLimiter,
    enforceJsonBodyMaxBytes(48 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerHeartbeatPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:heartbeat"],
          runtimeType: parsed.runtimeType,
          workerId: req.params.workerId,
        });
        const worker = await workerRegistry.recordWorkerHeartbeat({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });
        await updateConnectedDeviceTokenMetadata({
          tenantId: worker.tenantId,
          workerId: worker.id,
          authKind: "worker_executor",
        }).catch((error) => {
          console.warn("[workerRuntime] connected device heartbeat metadata unavailable", error instanceof Error ? error.message : String(error));
        });
        res.json({
          status: worker.status,
          workerId: worker.id,
          lastSeenAt: worker.lastSeenAt ?? null,
          // Feature 135 §11 — surfaces workerRegistryService.ts's
          // `enforceHermesMinVersion` warning (persisted in
          // `warningFlagsJson`) so the Worker App can render an "update
          // required" banner from this same heartbeat round-trip.
          warningFlagsJson: Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : [],
        });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get("/api/workers/:workerId/policy", async (req, res) => {
    try {
      const token = requireBearerToken(req);
      const auth = await verifyWorkerRouteAccessToken(req, token, {
        allowedTokenUses: ["worker_execution"],
        requiredScopes: ["workers:heartbeat"],
        workerId: req.params.workerId,
      });
      const snapshot = await workerPolicy.getWorkerPolicySnapshot({
        auth,
        workerId: req.params.workerId,
      });
      res.json(snapshot);
    } catch (error) {
      handleWorkerRouteError(error, res);
    }
  });

  app.post(
    "/api/workers/:workerId/jobs/claim",
    claimLimiter,
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerClaimRequestSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
          workerId: req.params.workerId,
        });
        const result = await workerRegistry.claimWorkerJob({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });

        // Feature 135 section 06 — claim-time reference URL enrichment for
        // hermes_media_* jobs ONLY. Response-only: the `worker_jobs` row
        // itself is never mutated to contain a URL (contract stays
        // `assetId + sha256` at rest — spec §13.1).
        if (result.job && HERMES_MEDIA_JOB_TYPES.has(result.job.jobType)) {
          // `result.job` is `claimWorkerJob`'s intentionally loose
          // `Record<string, any>` row shape — cast to the strict Drizzle
          // row type at this one crossing point (see the doc comment on
          // `extractHermesJobReferenceAssetIds`).
          const references = extractHermesJobReferenceAssetIds(result.job as unknown as WorkerJob);
          const referenceUrls = await mintHermesReferenceUrlsOrThrow({
            tenantId: auth.tenantId,
            requestedByUserId: result.job.requestedByUserId ?? null,
            references,
          });
          res.json({
            ...result,
            job: { ...result.job, referenceUrls },
          });
          return;
        }

        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/delegated-session",
    delegatedSessionLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedSessionRequestSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
        });
        const result = await workerDelegation.createDelegatedWorkerSession({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.status(201).json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get(
    "/api/worker-jobs/:jobId/delegated-manifest",
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
        });
        const manifest = await workerDelegation.getDelegatedWorkerManifest({
          auth,
          jobId: req.params.jobId,
        });
        res.json({ manifest });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-room-update",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "room_update",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-workflow-update",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "workflow_update",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-user-notification",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "user_notification",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/events",
    eventLimiter,
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerJobEventPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.recordWorkerJobEvent({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  // Feature 135 section 06 — same middleware stack as the events route
  // above (rate limiter, body cap, `requireBearerToken` +
  // `verifyWorkerRouteAccessToken` with `worker_execution` use +
  // `workers:report` scope), then lease + active-state enforcement
  // mirroring `recordWorkerJobEvent`. Re-mints the exact same URL set the
  // claim response minted, via the same shared helper.
  app.post(
    "/api/worker-jobs/:jobId/references/urls",
    eventLimiter,
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = hermesReferenceUrlRequestSchema.parse(req.body ?? {});
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const job = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
        if (!job) {
          throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${req.params.jobId} was not found`, "not_found_error");
        }
        // Code review fix — this route is hermes_media_* only (matches the
        // claim-enrichment and finalize-dispatch gates); a non-hermes job id
        // must be rejected the same way a nonexistent job would be, never
        // leaking that it exists as some other job type.
        if (!HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
          throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${req.params.jobId} was not found`, "not_found_error");
        }
        ensureHermesJobScopedAccess(auth, job);
        ensureHermesJobLease(job, parsed.leaseOwnerToken);
        if (!HERMES_MEDIA_REFERENCE_URL_ACTIVE_STATUSES.has(job.status)) {
          throw new WorkerRuntimeServiceError(
            "worker_state_invalid",
            409,
            "Worker job is not in an active state for reference URL minting",
          );
        }
        const references = extractHermesJobReferenceAssetIds(job);
        const referenceUrls = await mintHermesReferenceUrlsOrThrow({
          tenantId: job.tenantId,
          requestedByUserId: job.requestedByUserId,
          references,
        });
        res.json({ referenceUrls });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/artifacts/init-upload",
    artifactLimiter,
    enforceJsonBodyMaxBytes(32 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerArtifactInitPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_upload"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.initWorkerArtifactUpload({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/artifacts/complete",
    artifactLimiter,
    enforceJsonBodyMaxBytes(48 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerArtifactCompletePayloadSchema.parse(req.body);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_upload"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.completeWorkerArtifact({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });

        // Feature 135 section 06 — finalize dispatch. Only hermes_media_*
        // job artifacts are handled here; every other job type (including
        // hyperframes) is untouched by this branch (regression-safe).
        const job = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
        if (job && HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
          try {
            // `result.artifact` is `completeWorkerArtifact`'s intentionally
            // loose `Record<string, any>` row shape — cast to the strict
            // Drizzle row type at this one crossing point.
            await finalizeHermesMediaArtifact({ job, artifact: result.artifact as unknown as WorkerArtifact });

            // Feature 135 section 12 (code review fix) — settle THIS job
            // immediately after finalize moves it to `completed`, through
            // the SAME `settleHermesConnectionJob` the 60s sweep uses: fee
            // reconciliation + usage row/quota bump (via
            // `onTerminalHermesMediaJob`) AND appending the
            // `hermes_connection_settled` worker_job_events marker.
            // Writing that marker HERE (not only from the sweep) is what
            // makes `listTerminalUnsettledHermesJobs` correctly exclude
            // this job on the sweep's next tick — before this fix, NO path
            // ever marked a job settled except the sweep itself, so every
            // completed job sat "unsettled" for up to 60s and was
            // re-processed (re-invoking `recordHermesUsage`) on the very
            // next tick, making a Redis hiccup during that window a
            // routine double-usage-row / double-quota-bump risk rather
            // than a rare one. The sweep is now a genuine backstop for
            // jobs THIS call didn't reach (a crash between finalize and
            // here, or a true lease-expiry completion this route never
            // observes at all) — not the only place settlement happens.
            // Re-fetches the row so the `status === "completed"` gates
            // inside see the POST-finalize state (`job` above was read
            // BEFORE finalize ran). Never throws into this route — a
            // settlement failure must not un-complete the job (§4.2).
            try {
              const completedJob = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
              if (completedJob) {
                await settleHermesConnectionJob(completedJob);
              }
            } catch (settleError) {
              debugError("workerRuntime", `Failed to settle hermes job ${req.params.jobId} after finalize`, settleError);
            }
          } catch (finalizeError) {
            // finalizeHermesMediaArtifact already fails the job internally
            // (typed failureReason) on a validation/safety-gate rejection —
            // the artifact upload itself still succeeded, so the HTTP
            // response to the worker must not change; just log.
            debugError("workerRuntime", `Hermes media finalize failed for job ${req.params.jobId}`, finalizeError);
          }
        }

        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/:workerId/diagnostics",
    diagnosticsLimiter,
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerDiagnosticsPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRouteAccessToken(req, token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:diagnostics"],
          workerId: req.params.workerId,
        });
        const result = await workerRegistry.recordWorkerDiagnostics({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );
}
