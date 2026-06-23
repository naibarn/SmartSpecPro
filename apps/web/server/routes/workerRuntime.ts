import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { Express, Request, Response } from "express";
import { z } from "zod";

import type { TenantRequest } from "../_core/tenant";
import {
  workerArtifactCompletePayloadSchema,
  workerArtifactInitPayloadSchema,
  workerClaimRequestSchema,
  workerDiagnosticsPayloadSchema,
  workerHeartbeatPayloadSchema,
  workerJobEventPayloadSchema,
  workerRegistrationPayloadSchema,
} from "../../shared/workerRuntime";
import {
  delegatedSessionRequestSchema,
  delegatedWorkerCallbackPayloadSchema,
} from "../../shared/workerDelegation";
import { sendApiError } from "../middleware/publicApiHeaders";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import {
  createWorkerRegistrationToken,
  WorkerAuthError,
  extractWorkerDeviceProofFromRequest,
  extractBearerTokenFromRequest,
  refreshWorkerAccessTokens,
  type VerifyWorkerAccessTokenOptions,
  verifyWorkerAccessToken,
  verifyWorkerRegistrationToken,
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
import { getRedisClient } from "../services/redis";
import { getWorkerAccessPermissionScopesForPreset } from "../../shared/workerAccessKeys";
import { getDb, getUserById } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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

const WORKER_CONNECT_TTL_SECONDS = 7 * 24 * 60 * 60;
const WORKER_CONNECT_POLL_INTERVAL_SECONDS = 3;
const WORKER_RUNTIME_PACK_ID = "hyperframes-windows-x64";
const WORKER_RUNTIME_PACK_FILE_PATTERN = /^smart-ai-hub-worker-runtime-(hyperframes-windows-x64)-(.+)\.zip$/i;
const workerConnectSessions = new Map<string, WorkerConnectSession>();
const workerConnectUserCodeIndex = new Map<string, string>();

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
  result?: Awaited<ReturnType<typeof registerWorker>>;
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
  workerConnectSessions.set(session.deviceCode, session);
  workerConnectUserCodeIndex.set(session.userCode, session.deviceCode);
  try {
    const redis = getRedisClient();
    if (!redis) return;
    const keys = redisKeysForConnect(session.deviceCode, session.userCode);
    await redis.setex(keys.device, WORKER_CONNECT_TTL_SECONDS, JSON.stringify(session));
    if (keys.user) {
      await redis.setex(keys.user, WORKER_CONNECT_TTL_SECONDS, session.deviceCode);
    }
  } catch {
    // In-memory fallback keeps local development and single-node installs working.
  }
}

async function getWorkerConnectSessionByDevice(deviceCode: string): Promise<WorkerConnectSession | null> {
  const memory = workerConnectSessions.get(deviceCode);
  if (memory) return memory;
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    const raw = await redis.get(redisKeysForConnect(deviceCode).device);
    if (!raw) return null;
    const session = JSON.parse(raw) as WorkerConnectSession;
    workerConnectSessions.set(session.deviceCode, session);
    workerConnectUserCodeIndex.set(session.userCode, session.deviceCode);
    return session;
  } catch {
    return null;
  }
}

async function getWorkerConnectSessionByUserCode(userCode: string): Promise<WorkerConnectSession | null> {
  const indexedDeviceCode = workerConnectUserCodeIndex.get(userCode);
  if (indexedDeviceCode) {
    return getWorkerConnectSessionByDevice(indexedDeviceCode);
  }
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    const deviceCode = await redis.get(redisKeysForConnect("", userCode).user ?? "");
    return deviceCode ? getWorkerConnectSessionByDevice(deviceCode) : null;
  } catch {
    return null;
  }
}

function handleWorkerRouteError(error: unknown, res: Response): void {
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
  const candidates = [
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

function findLatestRuntimePack(releaseDirs: string[]) {
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
  return await verifyWorkerAccessToken(token, {
    ...opts,
    requestProof: extractWorkerDeviceProofFromRequest(req),
  });
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
        const runtimeId = String(req.query.runtimeId || WORKER_RUNTIME_PACK_ID).trim();
        if (runtimeId !== WORKER_RUNTIME_PACK_ID) {
          sendApiError(res, 404, "runtime_pack_not_found", `Runtime pack is not available for ${runtimeId}`, "not_found_error");
          return;
        }
        const pack = findLatestRuntimePack(runtimePackReleaseDirs);
        if (!pack) {
          sendApiError(
            res,
            404,
            "runtime_pack_not_published",
            "Official HyperFrames runtime pack has not been published yet. Build the Worker App can run UI/connection tests, but render jobs remain blocked until the signed runtime pack is available.",
            "not_found_error",
          );
          return;
        }
        const manifest = readRuntimePackManifest(pack.filePath);
        if (!manifest || manifest.allowed !== true) {
          sendApiError(
            res,
            409,
            "runtime_pack_not_allowed",
            "The latest HyperFrames runtime pack is present but is not allowed for render jobs. Check manifest.allowed, checksum, signature, and license notices.",
            "invalid_request_error",
          );
          return;
        }
        const archiveSha256 = sha256File(pack.filePath);
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
        const fileName = path.basename(String(req.params.fileName || ""));
        if (!WORKER_RUNTIME_PACK_FILE_PATTERN.test(fileName)) {
          sendApiError(res, 400, "invalid_runtime_pack_file", "Invalid runtime pack file name", "invalid_request_error");
          return;
        }
        const pack = findLatestRuntimePack(runtimePackReleaseDirs);
        if (!pack || pack.fileName !== fileName) {
          sendApiError(res, 404, "runtime_pack_not_found", "Runtime pack file was not found", "not_found_error");
          return;
        }
        const manifest = readRuntimePackManifest(pack.filePath);
        if (!manifest || manifest.allowed !== true) {
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
        session.errorMessage = undefined;
        session.status = "approved";
        session.approvedAt = new Date().toISOString();
        session.approvedByUserId = auth.userId ?? null;
        session.tenantId = tenantId;
        session.result = result;
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
        res.json({
          status: "approved",
          interval: WORKER_CONNECT_POLL_INTERVAL_SECONDS,
          worker: {
            id: session.result.worker.id,
            displayName: session.result.worker.displayName,
            runtimeType: session.result.worker.runtimeType,
            machineName: session.result.worker.machineName ?? null,
          },
          tokens: session.result.tokens,
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
        res.json({
          status: worker.status,
          workerId: worker.id,
          lastSeenAt: worker.lastSeenAt ?? null,
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
