import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import {
  workerSeriesBindings,
  workerSeriesControlPlaneIdempotency,
  verticalDramaSeries,
  workers,
  workerJobs,
  workerArtifacts,
  mediaAssets,
  verticalDramaMediaAssets,
  verticalDramaMediaIndexRecords,
  verticalDramaEpisodes,
  verticalDramaShotReferences,
  libraryItems,
} from "../../drizzle/schema";
import {
  buildWorkerSeriesFilterHash,
  createWorkerSeriesError,
  hashWorkerSeriesRequest,
  workerSeriesCursorPayloadSchema,
  workerSeriesQuickActionRequestSchema,
} from "../../shared/workerSeriesControlPlane";
import type { WorkerSeriesCursorPayload } from "../../shared/workerSeriesControlPlane";
import {
  mediaArtifactManifestSchema,
  mediaQcReportSchema,
} from "../../shared/verticalDramaMedia/contracts";
import {
  hashAdapterPolicy,
  hashSpeakerAwarePayload,
  speakerAwareJobPayloadSchema,
} from "../../shared/verticalDramaMedia/speakerAwareContracts";
import { storageStreamFile } from "../storage";
import {
  buildMediaCapabilityProbe,
  admitVerticalDramaMediaJob,
  parseVerticalDramaMediaJobPayload,
} from "../services/verticalDramaMediaJobService";
import { validateVerticalDramaMediaPublication } from "../services/verticalDramaMediaPublicationService";
import { processVerticalDramaMediaIndexRecord } from "../services/verticalDramaMediaIndexWorker";
import { resolveVerticalDramaWorkflow } from "../services/verticalDramaWorkflowResolver";

function hashVerticalDramaMediaRequest(payload: unknown): string {
  const normalized = parseVerticalDramaMediaJobPayload(payload);
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function collectReferencedMediaAssetIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedMediaAssetIds(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  const assetId = record.assetId;
  if (typeof assetId === "string" && /^media-[1-9][0-9]*$/.test(assetId)) {
    output.add(assetId);
  }
  Object.values(record).forEach((child) => collectReferencedMediaAssetIds(child, output));
  return output;
}

function containsNumericMediaAssetId(value: unknown, target: number): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNumericMediaAssetId(item, target));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    (/mediaAssetId$/i.test(key) && Number(child) === target)
      || containsNumericMediaAssetId(child, target),
  );
}

function episodeStartFrameContainsAssetForShot(plan: unknown, target: number, shotNumber: number): boolean {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
  const frames = (plan as Record<string, unknown>).frames;
  if (!Array.isArray(frames)) return false;
  return frames.some((frame) => {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) return false;
    const record = frame as Record<string, unknown>;
    return Number(record.shotNumber ?? record.shot_number) === shotNumber
      && containsNumericMediaAssetId(record, target);
  });
}

function positiveSafeIntegerParam(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
import { getDb } from "../db";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import { sendApiError } from "../middleware/publicApiHeaders";
import {
  extractBearerTokenFromRequest,
  WorkerAuthError,
} from "../services/workerAuthService";
import { verifyWorkerRouteAccessToken } from "./workerRuntime";
import {
  isWorkerSeriesActionAllowed,
  projectWorkerSeries,
  resolveWorkerSeriesPrincipal,
} from "../services/verticalDramaSeriesAccessService";

function requestId(req: Request): string {
  return String(req.header("x-request-id") || `worker-series-${Date.now()}`).slice(0, 128);
}

function fail(res: Response, req: Request, status: number, code: Parameters<typeof createWorkerSeriesError>[0], retryable = false): void {
  const payload = createWorkerSeriesError(code, requestId(req), { retryable });
  res.status(status).json({ error: payload });
}

const WORKER_SERIES_CURSOR_TTL_MS = 15 * 60_000;
const EPHEMERAL_WORKER_SERIES_CURSOR_SECRET = crypto.randomBytes(32).toString("hex");

function workerSeriesCursorSecret(): string {
  return process.env.WORKER_SERIES_CURSOR_SECRET?.trim() || process.env.JWT_SECRET?.trim() || EPHEMERAL_WORKER_SERIES_CURSOR_SECRET;
}

function signWorkerSeriesCursor(encodedPayload: string): string | null {
  const secret = workerSeriesCursorSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodeWorkerSeriesCursor(payload: Record<string, unknown>): string | null {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signWorkerSeriesCursor(encodedPayload);
  return signature ? `${encodedPayload}.${signature}` : null;
}

function decodeWorkerSeriesCursor(raw: string): WorkerSeriesCursorPayload | null {
  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = signWorkerSeriesCursor(encodedPayload);
  if (!expected) return null;
  const actualBytes = Buffer.from(signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const parsed = workerSeriesCursorPayloadSchema.safeParse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    if (parsed.data.expiresAt && Date.parse(parsed.data.expiresAt) <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function auth(req: Request, requiredScopes: string[], allowedTokenUses?: Array<"worker_execution" | "worker_upload">) {
  const token = extractBearerTokenFromRequest(req);
  if (!token) throw new WorkerAuthError("worker_auth_invalid", 401, "Worker authentication required");
  return verifyWorkerRouteAccessToken(req, token, { requiredScopes: requiredScopes as never[], allowedTokenUses });
}

export function registerWorkerSeriesControlPlaneRoutes(app: Express): void {
  const limiter = rateLimit("worker-series-control-plane", { rpm: 120 });

  /** Feature 179 — local Worker submission. The source remains on the bound
   * Worker root; the server stores only the validated relative path and job
   * contract. The Worker later re-checks the root boundary before reading it. */
  app.post("/api/workers/:workerId/speaker-aware-jobs", limiter, enforceJsonBodyMaxBytes(256 * 1024), async (req, res) => {
    try {
      const claims = await auth(req, ["series:media:process"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const payload = speakerAwareJobPayloadSchema.parse(req.body?.payload);
      if (payload.inputArtifact.kind !== "local_media" || !payload.localSourceRelativeName) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      if (payload.adapterPolicyHash !== hashAdapterPolicy(payload.adapterPolicy)) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const db = getDb();
      const [worker] = await db.select().from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal || !isWorkerSeriesActionAllowed(principal, "process")) return fail(res, req, 403, "SERIES_ACCESS_DENIED");
      let binding: typeof workerSeriesBindings.$inferSelect | null = null;
      if (payload.seriesId !== null) {
        const parsedSeriesId = Number(payload.seriesId);
        if (!Number.isSafeInteger(parsedSeriesId) || parsedSeriesId <= 0) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
        [binding] = await db.select().from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, parsedSeriesId), isNull(workerSeriesBindings.revokedAt))).limit(1);
        if (!binding || binding.status !== "active") return fail(res, req, 409, "ROOT_NOT_ALLOWED");
      }
      const [existing] = await db.select({ id: workerJobs.id, inputJson: workerJobs.inputJson }).from(workerJobs).where(and(eq(workerJobs.tenantId, claims.tenantId), eq(workerJobs.workerId, claims.workerId), eq(workerJobs.idempotencyKey, payload.idempotencyKey))).limit(1);
      if (existing) {
        if (hashSpeakerAwarePayload(existing.inputJson) !== hashSpeakerAwarePayload(payload)) return fail(res, req, 409, "IDEMPOTENCY_CONFLICT");
        return res.status(200).json({ contractVersion: "feature-179-v1", status: "accepted", replayed: true, jobId: existing.id });
      }
      const [job] = await db.insert(workerJobs).values({
        tenantId: claims.tenantId,
        workerId: claims.workerId,
        workerSeriesBindingId: binding?.id ?? null,
        workerSeriesBindingRevision: binding?.bindingRevision ?? null,
        runtimeType: worker.runtimeType,
        requestedByUserId: principal.userId,
        jobType: payload.kind,
        status: "queued",
        resourceProfile: "cpu_heavy",
        capabilityRequirementsJson: { capabilityFamilies: ["speaker-aware-media-v1", "vertical-drama-media"], requiredClaimCapability: "speaker-aware-media-v1", contractVersion: "feature-179-v1" },
        inputJson: payload as Record<string, unknown>,
        instructionsJson: { requiredProgressStages: ["validate_contract", "preflight", "stage_inputs", "fuse_speakers", "compose_edit_map", "upload_artifacts", "publish_artifacts"] },
        timeoutSeconds: payload.kind === "speaker_aware_media_scan" ? 7200 : 1800,
        retryPolicyJson: { maxAttempts: 1, backoffSeconds: 0 },
        idempotencyKey: payload.idempotencyKey,
      }).returning({ id: workerJobs.id });
      return res.status(202).json({ contractVersion: "feature-179-v1", status: "accepted", replayed: false, jobId: job?.id });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 400, "ACTION_NOT_ALLOWED");
    }
  });

  app.get("/api/workers/:workerId/series", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId, teamId: workers.teamId, status: workers.status })
        .from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal) return res.status(200).json({ contractVersion: "2026-08-25.1", items: [], nextCursor: null });
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
      const filterHash = buildWorkerSeriesFilterHash({ q, archived: false });
      const rawCursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
      const cursor = rawCursor ? decodeWorkerSeriesCursor(rawCursor) : null;
      if (rawCursor && (!cursor || cursor.tenantId !== claims.tenantId || cursor.userId !== principal.userId || cursor.filterHash !== filterHash || cursor.authorityRevision !== principal.authorityRevision)) {
        return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      }
      const offset = cursor ? cursor.offset : Math.max(0, Number.parseInt(String(req.query.offset || "0"), 10) || 0);
      const rows = await db.select().from(verticalDramaSeries)
        .where(and(
          eq(verticalDramaSeries.tenantId, claims.tenantId),
          ne(verticalDramaSeries.status, "archived"),
          q ? ilike(verticalDramaSeries.title, `%${q}%`) : sql`true`,
        ))
        .orderBy(desc(verticalDramaSeries.updatedAt)).limit(501).offset(offset);
      const bindingRows = rows.length === 0 ? [] : await db.select({ seriesId: workerSeriesBindings.seriesId, status: workerSeriesBindings.status, bindingRevision: workerSeriesBindings.bindingRevision })
        .from(workerSeriesBindings)
        .where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), inArray(workerSeriesBindings.seriesId, rows.map(row => row.id)), isNull(workerSeriesBindings.revokedAt)));
      const bindingBySeries = new Map(bindingRows.map(row => [row.seriesId, row]));
      const items = rows.slice(0, 50).map(row => {
        const binding = bindingBySeries.get(row.id);
        return projectWorkerSeries({ series: row, principal, bindingStatus: (binding?.status as never) ?? null, bindingRevision: binding?.bindingRevision ?? null });
      }).filter(Boolean);
      const nextCursor = rows.length > 50
        ? encodeWorkerSeriesCursor({ version: 1, tenantId: claims.tenantId, userId: principal.userId, filterHash, offset: offset + 50, authorityRevision: principal.authorityRevision, expiresAt: new Date(Date.now() + WORKER_SERIES_CURSOR_TTL_MS).toISOString() })
        : null;
      return res.status(200).json({ contractVersion: "2026-08-25.1", items, nextCursor });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.get("/api/workers/:workerId/series/:seriesId", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId, teamId: workers.teamId, status: workers.status }).from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const seriesId = positiveSafeIntegerParam(req.params.seriesId);
      if (!seriesId) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const [series] = await db.select().from(verticalDramaSeries).where(and(eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived"), eq(verticalDramaSeries.id, seriesId))).limit(1);
      const projection = series ? projectWorkerSeries({ series, principal }) : null;
      if (!projection) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const [binding] = await db.select({ status: workerSeriesBindings.status, bindingRevision: workerSeriesBindings.bindingRevision }).from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, series.id), isNull(workerSeriesBindings.revokedAt))).limit(1);
      return res.status(200).json({ contractVersion: "2026-08-25.1", item: { ...projection, bindingRevision: binding?.bindingRevision ?? null, bindingStatus: binding?.status || null } });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.get("/api/workers/:workerId/queue", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId, teamId: workers.teamId, status: workers.status })
        .from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal) return res.status(200).json({ contractVersion: "2026-08-25.1", items: [] });
      const requestedSeriesId = typeof req.query.seriesId === "string" ? req.query.seriesId.trim() : "";
      const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit || "100"), 10) || 100, 200));
      const rows = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status, statusReason: workerJobs.statusReason, priority: workerJobs.priority, resourceProfile: workerJobs.resourceProfile, inputJson: workerJobs.inputJson, failureReason: workerJobs.failureReason, createdAt: workerJobs.createdAt, startedAt: workerJobs.startedAt, finishedAt: workerJobs.finishedAt })
        .from(workerJobs)
        .where(and(
          eq(workerJobs.tenantId, claims.tenantId),
          eq(workerJobs.workerId, claims.workerId),
          requestedSeriesId ? sql`${workerJobs.inputJson}->>'seriesId' = ${requestedSeriesId}` : sql`true`,
        ))
        .orderBy(desc(workerJobs.createdAt))
        .limit(limit);
      const seriesIds = [...new Set(rows.map(row => Number(row.inputJson?.seriesId)).filter(Number.isSafeInteger))];
      const seriesRows = seriesIds.length > 0
        ? await db.select().from(verticalDramaSeries).where(and(eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived"), inArray(verticalDramaSeries.id, seriesIds)))
        : [];
      const seriesById = new Map(seriesRows.map(series => [series.id, series]));
      const items = rows.flatMap(row => {
        const input = row.inputJson || {};
        const seriesId = Number(input.seriesId);
        const series = seriesById.get(seriesId);
        if (!series || !projectWorkerSeries({ series, principal })) return [];
        const source = input.source && typeof input.source === "object" ? input.source as Record<string, unknown> : {};
        const editPlan = input.editPlan && typeof input.editPlan === "object" ? input.editPlan as Record<string, unknown> : {};
        const workflowResolution = input.workflowResolution && typeof input.workflowResolution === "object" ? input.workflowResolution as Record<string, unknown> : {};
        const workflowRequest = input.workflowRequest && typeof input.workflowRequest === "object" ? input.workflowRequest as Record<string, unknown> : {};
        const isPaused = row.statusReason === "paused" || row.statusReason?.startsWith("paused:");
        const domainStatus = isPaused ? "paused" : row.status === "completed" ? "succeeded" : row.status === "failed" ? "needs_review" : row.status === "canceled" ? "canceled" : row.status === "expired" ? "expired" : row.status === "indexing" ? "indexed_for_series_ai" : ["uploading", "publishing"].includes(row.status) ? "publishing_series_assets" : row.jobType === "media_ingest" ? "scanning_local_files" : "processing_local_derivatives";
        return [{
          jobId: row.id,
          seriesId: String(series.id),
          seriesTitle: series.title,
          jobType: row.jobType,
          transportStatus: row.status,
          domainStatus,
          statusReason: typeof row.statusReason === "string" ? row.statusReason.slice(0, 240) : null,
          failureCode: typeof row.failureReason === "string" ? row.failureReason.slice(0, 160) : null,
          sourceFingerprint: typeof source.sourceFingerprint === "string" ? source.sourceFingerprint : null,
          requestedIntent: typeof editPlan.mode === "string" ? editPlan.mode : typeof workflowRequest.intent === "string" ? workflowRequest.intent : null,
          workflowId: typeof workflowResolution.selectedWorkflowId === "string" ? workflowResolution.selectedWorkflowId : null,
          resourceProfile: row.resourceProfile,
          priority: row.priority,
          createdAt: row.createdAt.toISOString(),
          startedAt: row.startedAt?.toISOString() ?? null,
          finishedAt: row.finishedAt?.toISOString() ?? null,
        }];
      });
      return res.status(200).json({ contractVersion: "2026-08-25.1", items });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.post("/api/workers/:workerId/series-bindings", limiter, enforceJsonBodyMaxBytes(64 * 1024), async (req, res) => {
    try {
      const claims = await auth(req, ["series:bind"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const body = req.body as Record<string, unknown>;
      const seriesId = Number(body?.seriesId);
      const rootId = typeof body?.rootId === "string" ? body.rootId.trim() : "";
      const rootFingerprint = typeof body?.rootFingerprint === "string" ? body.rootFingerprint.trim() : "";
      const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
      const expectedRevision = Number(body?.expectedRevision);
      const ifMatch = req.header("if-match")?.trim() || null;
      if (!Number.isSafeInteger(seriesId) || !rootId || rootId.length > 128 || !rootFingerprint || rootFingerprint.length > 128 || idempotencyKey.length < 8 || idempotencyKey.length > 160 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const db = getDb();
      const [worker] = await db.select().from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal || !isWorkerSeriesActionAllowed(principal, "bind")) return fail(res, req, 403, "SERIES_ACCESS_DENIED");
      const [series] = await db.select().from(verticalDramaSeries).where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived"))).limit(1);
      if (!series || !projectWorkerSeries({ series, principal })) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const [existingIdempotency] = await db.select().from(workerSeriesControlPlaneIdempotency).where(and(eq(workerSeriesControlPlaneIdempotency.tenantId, claims.tenantId), eq(workerSeriesControlPlaneIdempotency.workerId, claims.workerId), eq(workerSeriesControlPlaneIdempotency.idempotencyKey, idempotencyKey), gt(workerSeriesControlPlaneIdempotency.expiresAt, new Date()))).limit(1);
      const requestHash = hashWorkerSeriesRequest({ seriesId, rootId, rootFingerprint, expectedRevision, ifMatch });
      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) return fail(res, req, 409, "IDEMPOTENCY_CONFLICT");
        return res.status(200).json(existingIdempotency.responseJson || { contractVersion: "2026-08-25.1", status: "accepted" });
      }
      const response = await db.transaction(async tx => {
        const [current] = await tx.select().from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, seriesId), isNull(workerSeriesBindings.revokedAt))).limit(1);
        if (current) {
          const normalizedIfMatch = ifMatch?.replace(/^W\//, "").replace(/^\"|\"$/g, "");
          if (!normalizedIfMatch) throw new Error("IF_MATCH_REQUIRED");
          if (normalizedIfMatch !== String(current.bindingRevision) || current.bindingRevision !== expectedRevision) throw new Error("STALE_REVISION");
          if (current.rootId !== rootId) throw new Error("SERIES_BINDING_CONFLICT");
        } else if (expectedRevision !== 0 && ifMatch !== "*") {
          throw new Error("STALE_REVISION");
        }
        const [binding] = current
          ? await tx.update(workerSeriesBindings).set({ rootFingerprint, status: "active", bindingRevision: current.bindingRevision + 1, lastValidatedAt: new Date(), updatedAt: new Date() }).where(eq(workerSeriesBindings.id, current.id)).returning()
          : await tx.insert(workerSeriesBindings).values({ tenantId: claims.tenantId, workerId: claims.workerId, seriesId, rootId, rootFingerprint, status: "active", bindingRevision: 1, createdByUserId: principal.userId, lastValidatedAt: new Date() }).returning();
        const result = { contractVersion: "2026-08-25.1", status: "active", bindingId: binding.id, bindingRevision: binding.bindingRevision, seriesId: String(seriesId) };
        await tx.insert(workerSeriesControlPlaneIdempotency).values({ tenantId: claims.tenantId, workerId: claims.workerId, idempotencyKey, requestHash, status: "completed", responseJson: result, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        return result;
      });
      return res.status(201).json(response);
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      if (error instanceof Error && error.message === "STALE_REVISION") return fail(res, req, 409, "STALE_REVISION");
      if (error instanceof Error && error.message === "IF_MATCH_REQUIRED") return fail(res, req, 428, "ACTION_NOT_ALLOWED");
      if (error instanceof Error && error.message === "SERIES_BINDING_CONFLICT") return fail(res, req, 409, "SERIES_BINDING_CONFLICT");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.delete("/api/workers/:workerId/series-bindings/:seriesId", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:bind"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select({ id: workers.id, registeredByUserId: workers.registeredByUserId, tenantId: workers.tenantId, teamId: workers.teamId, status: workers.status })
        .from(workers)
        .where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId)))
        .limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal || !isWorkerSeriesActionAllowed(principal, "bind")) return fail(res, req, 403, "SERIES_ACCESS_DENIED");
      const seriesId = positiveSafeIntegerParam(req.params.seriesId);
      if (!seriesId) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const [series] = await db.select().from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived")))
        .limit(1);
      if (!series || !projectWorkerSeries({ series, principal })) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const revokedAt = new Date();
      const [binding] = await db.update(workerSeriesBindings).set({ status: "revoked", bindingRevision: sql`${workerSeriesBindings.bindingRevision} + 1`, revokedAt, revocationReason: "user_requested", updatedAt: revokedAt }).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, seriesId), isNull(workerSeriesBindings.revokedAt))).returning({ id: workerSeriesBindings.id, bindingRevision: workerSeriesBindings.bindingRevision });
      if (!binding) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const drained = await db.update(workerJobs).set({ status: "canceled", statusReason: "series_binding_revoked", finishedAt: revokedAt }).where(and(eq(workerJobs.tenantId, claims.tenantId), eq(workerJobs.workerId, claims.workerId), eq(workerJobs.status, "queued"), sql`${workerJobs.inputJson}->>'seriesId' = ${String(seriesId)}`)).returning({ id: workerJobs.id });
      return res.status(200).json({ contractVersion: "2026-08-25.1", status: "revoked", bindingId: binding.id, bindingRevision: binding.bindingRevision, drainedJobCount: drained.length });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.post("/api/workers/:workerId/quick-actions", limiter, enforceJsonBodyMaxBytes(64 * 1024), async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const parsed = workerSeriesQuickActionRequestSchema.safeParse(req.body);
      if (!parsed.success) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const db = getDb();
      const [worker] = await db.select().from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      const seriesId = Number(parsed.data.action.seriesId);
      const [series] = principal ? await db.select().from(verticalDramaSeries).where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived"))).limit(1) : [];
      if (!principal || !series || !projectWorkerSeries({ series, principal })) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const requestHash = hashWorkerSeriesRequest(parsed.data);
      const [existing] = await db.select().from(workerSeriesControlPlaneIdempotency).where(and(eq(workerSeriesControlPlaneIdempotency.tenantId, claims.tenantId), eq(workerSeriesControlPlaneIdempotency.workerId, claims.workerId), eq(workerSeriesControlPlaneIdempotency.idempotencyKey, parsed.data.idempotencyKey), gt(workerSeriesControlPlaneIdempotency.expiresAt, new Date()))).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) return fail(res, req, 409, "IDEMPOTENCY_CONFLICT");
        return res.status(200).json(existing.responseJson);
      }
      const action = parsed.data.action.action;
      const mutating = action !== "select" && action !== "review";
      if (mutating && !isWorkerSeriesActionAllowed(principal, action)) return fail(res, req, 403, "SERIES_ACCESS_DENIED");
      let status: "accepted" | "blocked" | "ready_for_review" = "accepted";
      let blockedReason: string | null = null;
      const details: Record<string, unknown> = {};

      if (action === "queue") {
        const jobIds = parsed.data.action.jobIds;
        const jobs = await db.select({ id: workerJobs.id, status: workerJobs.status, jobType: workerJobs.jobType })
          .from(workerJobs)
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            inArray(workerJobs.id, jobIds),
            sql`${workerJobs.inputJson}->>'seriesId' = ${String(series.id)}`,
          ));
        details.jobIds = jobs.map((job) => job.id);
        details.jobs = jobs;
        if (jobs.length !== jobIds.length) {
          status = "blocked";
          blockedReason = "บางงานไม่อยู่ใน Worker หรือ Series ที่เลือก";
        }
      } else if (action === "pause") {
        const paused = await db.update(workerJobs)
          .set({ statusReason: sql`concat('paused:', ${parsed.data.action.reason})` })
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            eq(workerJobs.status, "queued"),
            inArray(workerJobs.id, parsed.data.action.jobIds),
            sql`${workerJobs.inputJson}->>'seriesId' = ${String(series.id)}`,
            sql`(${workerJobs.statusReason} IS NULL OR (${workerJobs.statusReason} NOT LIKE 'paused:%' AND ${workerJobs.statusReason} <> 'paused'))`,
          ))
          .returning({ id: workerJobs.id });
        details.pausedJobIds = paused.map((job) => job.id);
        if (paused.length === 0) {
          status = "blocked";
          blockedReason = "ไม่พบงาน queued ที่หยุดได้";
        }
      } else if (action === "resume") {
        const resumed = await db.update(workerJobs)
          .set({ statusReason: null })
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            eq(workerJobs.status, "queued"),
            inArray(workerJobs.id, parsed.data.action.jobIds),
            sql`${workerJobs.inputJson}->>'seriesId' = ${String(series.id)}`,
            sql`(${workerJobs.statusReason} LIKE 'paused:%' OR ${workerJobs.statusReason} = 'paused')`,
          ))
          .returning({ id: workerJobs.id });
        details.resumedJobIds = resumed.map((job) => job.id);
        if (resumed.length === 0) {
          status = "blocked";
          blockedReason = "ไม่พบงานที่หยุดไว้และกลับมาทำต่อได้";
        }
      } else if (action === "cancel") {
        const now = new Date();
        const canceled = await db.update(workerJobs)
          .set({ status: "canceled", statusReason: parsed.data.action.reason, finishedAt: now })
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            eq(workerJobs.status, "queued"),
            inArray(workerJobs.id, parsed.data.action.jobIds),
            sql`${workerJobs.inputJson}->>'seriesId' = ${String(series.id)}`,
          ))
          .returning({ id: workerJobs.id });
        details.canceledJobIds = canceled.map((job) => job.id);
        if (canceled.length === 0) {
          status = "blocked";
          blockedReason = "ไม่พบงาน queued ที่ยกเลิกได้";
        }
      } else if (action === "retry") {
        const retryable = await db.select({ id: workerJobs.id, workerSeriesBindingId: workerJobs.workerSeriesBindingId, workerSeriesBindingRevision: workerJobs.workerSeriesBindingRevision, runtimeType: workerJobs.runtimeType, jobType: workerJobs.jobType, resourceProfile: workerJobs.resourceProfile, capabilityRequirementsJson: workerJobs.capabilityRequirementsJson, inputJson: workerJobs.inputJson })
          .from(workerJobs)
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            inArray(workerJobs.id, parsed.data.action.jobIds),
            inArray(workerJobs.status, ["failed", "expired", "canceled"]),
            sql`${workerJobs.inputJson}->>'seriesId' = ${String(series.id)}`,
          ));
        const [currentBinding] = await db.select().from(workerSeriesBindings).where(and(
          eq(workerSeriesBindings.tenantId, claims.tenantId),
          eq(workerSeriesBindings.workerId, claims.workerId),
          eq(workerSeriesBindings.seriesId, series.id),
          isNull(workerSeriesBindings.revokedAt),
        )).limit(1);
        const retriedJobIds: string[] = [];
        const blockedJobIds: string[] = [];
        for (const job of retryable) {
          const idempotencyKey = `retry:${job.id}:${parsed.data.requestId}`.slice(0, 128);
          let payload: ReturnType<typeof parseVerticalDramaMediaJobPayload> | null = null;
          let retryCapabilityRequirements = job.capabilityRequirementsJson;
          try {
            const parsedPayload = parseVerticalDramaMediaJobPayload(job.inputJson);
            if (parsedPayload.seriesId !== String(series.id) || !currentBinding) throw new Error("root_revision_stale");
            const binding = {
              seriesId: String(currentBinding.seriesId),
              rootId: currentBinding.rootId,
              rootFingerprint: currentBinding.rootFingerprint,
              bindingRevision: currentBinding.bindingRevision,
              workspaceMode: currentBinding.workspaceMode === "managed_local" ? "managed_local" as const : "local_only" as const,
              status: currentBinding.status === "active" ? "active" as const : "stale" as const,
            };
            const capabilityJson = worker.capabilitiesJson && typeof worker.capabilitiesJson === "object" ? worker.capabilitiesJson as Record<string, unknown> : {};
            const probe = buildMediaCapabilityProbe(capabilityJson, parsedPayload.kind);
            payload = { ...parsedPayload, idempotencyKey };
            if (parsedPayload.kind === "shot_video_generation") {
              const resolution = resolveVerticalDramaWorkflow({
                requestedWorkflowId: parsedPayload.workflowRequest.requestedWorkflowId,
                policy: series.policy,
                probe,
                resolutionId: `retry-${job.id}-${parsed.data.requestId}`,
                workflowFamily: parsedPayload.workflowRequest.workflowFamily,
                startFrame: parsedPayload.startFrame,
                referenceFrames: parsedPayload.referenceFrames,
              });
              payload = {
                ...parsedPayload,
                idempotencyKey,
                workflowRequest: { ...parsedPayload.workflowRequest, policyRevision: resolution.policyRevision },
                workflowResolution: resolution,
              };
              retryCapabilityRequirements = {
                ...(job.capabilityRequirementsJson && typeof job.capabilityRequirementsJson === "object" ? job.capabilityRequirementsJson as Record<string, unknown> : {}),
                capabilityRevision: probe.capabilityRevision,
                workflowId: resolution.selectedWorkflowId,
              };
            }
            admitVerticalDramaMediaJob({ payload, binding, capabilityProbe: probe, idempotencyKey, requestHash: hashWorkerSeriesRequest(payload), actor: { tenantId: claims.tenantId, userId: principal.userId, workerId: claims.workerId } });
          } catch {
            blockedJobIds.push(job.id);
            continue;
          }
          if (!payload) {
            blockedJobIds.push(job.id);
            continue;
          }
          const [newJob] = await db.insert(workerJobs).values({
            tenantId: claims.tenantId,
            workerId: claims.workerId,
            workerSeriesBindingId: currentBinding!.id,
            workerSeriesBindingRevision: currentBinding!.bindingRevision,
            runtimeType: job.runtimeType,
            requestedByUserId: principal.userId,
            jobType: job.jobType,
            status: "queued",
            resourceProfile: job.resourceProfile,
            capabilityRequirementsJson: retryCapabilityRequirements,
            inputJson: payload as Record<string, unknown>,
            idempotencyKey,
            statusReason: `retry_of:${job.id}`,
          }).onConflictDoNothing().returning({ id: workerJobs.id });
          if (newJob) retriedJobIds.push(newJob.id);
        }
        details.retriedJobIds = retriedJobIds;
        details.blockedJobIds = blockedJobIds;
        if (retriedJobIds.length === 0) {
          status = "blocked";
          blockedReason = blockedJobIds.length > 0 ? "งาน retry ไม่ผ่าน binding หรือ capability ปัจจุบัน" : "ไม่พบงาน failed/expired/canceled ที่ retry ได้";
        }
      } else if (action === "index") {
        const requestedIds = parsed.data.action.assetIds;
        const assetFilter = requestedIds.length > 0
          ? and(eq(verticalDramaMediaIndexRecords.tenantId, claims.tenantId), eq(verticalDramaMediaIndexRecords.seriesId, series.id), inArray(verticalDramaMediaIndexRecords.mediaAssetId, requestedIds))
          : and(eq(verticalDramaMediaIndexRecords.tenantId, claims.tenantId), eq(verticalDramaMediaIndexRecords.seriesId, series.id));
        const records = await db.select({ id: verticalDramaMediaIndexRecords.id, status: verticalDramaMediaIndexRecords.status })
          .from(verticalDramaMediaIndexRecords).where(assetFilter).limit(500);
        const queuedRecords = records.filter((record) => record.status === "queued" || record.status === "failed");
        queuedRecords.forEach((record) => void processVerticalDramaMediaIndexRecord(record.id).catch(() => undefined));
        details.indexRecordIds = queuedRecords.map((record) => record.id);
        details.indexedRecordCount = records.filter((record) => record.status === "indexed").length;
        if (records.length === 0) {
          status = "blocked";
          blockedReason = "ยังไม่มี media index record สำหรับ Series นี้";
        }
      } else if (action === "review") {
        const requestedIds = parsed.data.action.assetIds;
        const assets = await db.select({ id: verticalDramaMediaAssets.id, pipelineState: verticalDramaMediaAssets.pipelineState, vectorIndexStatus: verticalDramaMediaAssets.vectorIndexStatus })
          .from(verticalDramaMediaAssets)
          .where(and(eq(verticalDramaMediaAssets.tenantId, claims.tenantId), eq(verticalDramaMediaAssets.seriesId, series.id), requestedIds.length > 0 ? inArray(verticalDramaMediaAssets.id, requestedIds) : sql`true`))
          .limit(500);
        status = "ready_for_review";
        details.assets = assets;
        if (requestedIds.length > 0 && assets.length !== requestedIds.length) {
          status = "blocked";
          blockedReason = "มี media asset ที่ไม่อยู่ใน Series นี้";
        }
      } else if (["bind", "scan", "process", "publish"].includes(action)) {
        // These operations require a complete source/edit/publication payload
        // and must enter the durable media-job/publication contracts. A quick
        // action must never acknowledge work that cannot be executed safely.
        status = "blocked";
        blockedReason = "เปิด Media Workspace เพื่อยืนยัน root, intent, workflow และ QC ก่อนสั่งงาน";
      }

      const response = {
        contractVersion: "2026-08-25.1",
        requestId: parsed.data.requestId,
        status,
        action,
        seriesId: String(series.id),
        commandId: `worker-command-${parsed.data.requestId}`,
        blockedReason,
        details,
      };
      await db.insert(workerSeriesControlPlaneIdempotency).values({ tenantId: claims.tenantId, workerId: claims.workerId, idempotencyKey: parsed.data.idempotencyKey, requestHash, status: "completed", responseJson: response, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      return res.status(status === "blocked" ? 409 : 202).json(response);
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.get("/api/workers/:workerId/series/:seriesId/media-workspace", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId }).from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker: { ...worker, teamId: null, status: "online" }, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const seriesId = positiveSafeIntegerParam(req.params.seriesId);
      if (!seriesId) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const [series] = await db.select({ id: verticalDramaSeries.id, tenantId: verticalDramaSeries.tenantId, userId: verticalDramaSeries.userId, title: verticalDramaSeries.title, status: verticalDramaSeries.status, updatedAt: verticalDramaSeries.updatedAt, policy: verticalDramaSeries.policy }).from(verticalDramaSeries).where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, claims.tenantId), ne(verticalDramaSeries.status, "archived"))).limit(1);
      if (series && !projectWorkerSeries({ series, principal })) return fail(res, req, 404, "SERIES_NOT_FOUND");
      if (!series) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const [binding] = await db.select({ id: workerSeriesBindings.id, rootId: workerSeriesBindings.rootId, bindingRevision: workerSeriesBindings.bindingRevision, status: workerSeriesBindings.status }).from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, series.id), isNull(workerSeriesBindings.revokedAt))).limit(1);

      // Query real episodes belonging to this series
      const episodeRows = await db
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          status: verticalDramaEpisodes.status,
          motionPromptPack: verticalDramaEpisodes.motionPromptPack,
          assemblyManifest: verticalDramaEpisodes.assemblyManifest,
          startFramePlan: verticalDramaEpisodes.startFramePlan,
          updatedAt: verticalDramaEpisodes.updatedAt,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.seriesId, series.id),
            eq(verticalDramaEpisodes.tenantId, claims.tenantId)
          )
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      const episodes = episodeRows.map((ep) => ({
        episodeId: String(ep.id),
        episodeNumber: ep.episodeNumber,
        title: ep.title ? `EP ${String(ep.episodeNumber).padStart(2, "0")} - ${ep.title}` : `EP ${String(ep.episodeNumber).padStart(2, "0")}`,
        status: ep.status,
      }));

      const dynamicAssets: Array<Record<string, any>> = [];

      for (const ep of episodeRows) {
        const epIdStr = String(ep.id);
        const epTitleFormatted = ep.title
          ? `EP ${String(ep.episodeNumber).padStart(2, "0")}: ${ep.title}`
          : `EP ${String(ep.episodeNumber).padStart(2, "0")}`;

        // 1. Compound 9-Shot Video
        const manifest = ep.assemblyManifest as Record<string, any> | null;
        const compiled = manifest?.compiledVideo;
        if (compiled && compiled.videoUrl) {
          const thumbUrl = compiled.thumbnailUrl
            || (ep.startFramePlan as any)?.frames?.[0]?.url
            || (ep.motionPromptPack as any)?.clips?.[0]?.videoTask?.thumbnailUrl
            || undefined;
          const durMs = Number(compiled.durationSeconds || 72) * 1000;

          dynamicAssets.push({
            id: `compound_ep_${ep.id}`,
            sourceAssetId: `compound_ep_${ep.id}`,
            sourceRevision: compiled.assembledAt || "v1",
            assetKind: "compound_9_shots",
            pipelineState: compiled.status || "completed",
            episodeId: epIdStr,
            episodeNumber: ep.episodeNumber,
            episodeTitle: epTitleFormatted,
            isCompoundShot: true,
            isShotClip: false,
            shotNumber: null,
            sourceUrl: compiled.videoUrl,
            thumbnailUrl: thumbUrl,
            durationMs: durMs,
            sourceMetadataJson: {
              title: `[วิดีโอรวม 9 ช็อต] EP ${String(ep.episodeNumber).padStart(2, "0")} - ${ep.title || "ตอนที่ " + ep.episodeNumber}`,
              videoUrl: compiled.videoUrl,
              url: compiled.videoUrl,
              thumbnailUrl: thumbUrl,
              durationMs: durMs,
              format: "mp4",
              type: "video",
              stage: "compound_9_shot",
              status: compiled.status,
              episodeId: epIdStr,
              episodeTitle: epTitleFormatted,
              isCompoundShot: true,
            },
            derivedArtifactJson: {
              videoUrl: compiled.videoUrl,
              thumbnailUrl: thumbUrl,
              durationMs: durMs,
            },
            updatedAt: compiled.assembledAt || ep.updatedAt,
          });
        }

        // 2. Individual Shot Clips (e.g. 9 clips)
        const motionPack = ep.motionPromptPack as Record<string, any> | null;
        const clips = Array.isArray(motionPack?.clips) ? motionPack.clips : [];
        for (const clip of clips) {
          const vTask = clip.videoTask;
          const clipVideoUrl = vTask?.videoUrl || clip.videoUrl;
          if (clipVideoUrl) {
            const clipNumber = Number(clip.clipNumber || 1);
            const clipThumb = vTask?.thumbnailUrl || clip.thumbnailUrl || undefined;
            const durSec = Number(clip.durationSeconds || 8);
            const durMs = durSec * 1000;

            dynamicAssets.push({
              id: `shot_ep_${ep.id}_clip_${clipNumber}`,
              sourceAssetId: `shot_ep_${ep.id}_clip_${clipNumber}`,
              sourceRevision: "v1",
              assetKind: "shot_clip",
              pipelineState: vTask?.status || "completed",
              episodeId: epIdStr,
              episodeNumber: ep.episodeNumber,
              episodeTitle: epTitleFormatted,
              isCompoundShot: false,
              isShotClip: true,
              shotNumber: clipNumber,
              sourceUrl: clipVideoUrl,
              thumbnailUrl: clipThumb,
              durationMs: durMs,
              sourceMetadataJson: {
                title: `[EP ${String(ep.episodeNumber).padStart(2, "0")}] ช็อต ${clipNumber}${clip.prompt ? " · " + clip.prompt.slice(0, 45) : ""}`,
                videoUrl: clipVideoUrl,
                url: clipVideoUrl,
                thumbnailUrl: clipThumb,
                durationMs: durMs,
                format: "mp4",
                type: "video",
                prompt: clip.prompt,
                model: vTask?.selectedVideoModelId || motionPack?.selectedVideoModelId,
                status: vTask?.status || "completed",
                episodeId: epIdStr,
                episodeTitle: epTitleFormatted,
                isShotClip: true,
                shotNumber: clipNumber,
              },
              derivedArtifactJson: {
                videoUrl: clipVideoUrl,
                thumbnailUrl: clipThumb,
                durationMs: durMs,
              },
              updatedAt: ep.updatedAt,
            });
          }
        }
      }

      const dbAssets = await db.select({ id: verticalDramaMediaAssets.id, sourceAssetId: verticalDramaMediaAssets.sourceAssetId, sourceRevision: verticalDramaMediaAssets.sourceRevision, assetKind: verticalDramaMediaAssets.assetKind, pipelineState: verticalDramaMediaAssets.pipelineState, sourceMetadataJson: verticalDramaMediaAssets.sourceMetadataJson, derivedArtifactJson: verticalDramaMediaAssets.derivedArtifactJson, qcReportJson: verticalDramaMediaAssets.qcReportJson, vectorIndexStatus: verticalDramaMediaAssets.vectorIndexStatus, updatedAt: verticalDramaMediaAssets.updatedAt }).from(verticalDramaMediaAssets).where(and(eq(verticalDramaMediaAssets.tenantId, claims.tenantId), eq(verticalDramaMediaAssets.seriesId, series.id))).orderBy(desc(verticalDramaMediaAssets.updatedAt)).limit(500);

      const assets = [...dynamicAssets, ...dbAssets];
      return res.status(200).json({ contractVersion: "2026-08-25.1", series: { seriesId: String(series.id), title: series.title }, binding: binding ? { bindingId: binding.id, rootId: binding.rootId, bindingRevision: binding.bindingRevision, status: binding.status } : null, episodes, assets });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.get("/api/workers/:workerId/media-history", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db
        .select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId })
        .from(workers)
        .where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId)))
        .limit(1);
      if (!worker) return fail(res, req, 404, "WORKER_NOT_FOUND");
      if (!worker.registeredByUserId) {
        return res.status(200).json({ contractVersion: "2026-08-25.1", tasks: [], total: 0 });
      }

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const mediaType = typeof req.query.media_type === "string" ? req.query.media_type.trim() : null;
      const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : null;

      const conditions = [sql`user_id = ${Number(worker.registeredByUserId)}`];
      if (mediaType && mediaType !== "all") {
        conditions.push(sql`media_type = ${mediaType}`);
      }
      if (query) {
        conditions.push(sql`(lower(prompt) LIKE ${`%${query}%`} OR lower(model) LIKE ${`%${query}%`})`);
      }

      const whereClause = sql.join(conditions, sql` AND `);

      const queryResult = await db.execute(sql`
        SELECT id, task_id, media_type, status, model, prompt, parameters, result_url, result_data, error_message, created_at, completed_at
        FROM media_tasks
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `).catch(() => ({ rows: [] } as any));

      const rows = (queryResult as any).rows || (Array.isArray(queryResult) ? queryResult : []);

      // Also query mcp_media_tasks if table exists
      const mcpResult = await db.execute(sql`
        SELECT id, provider_task_id as task_id, media_type, status, model, prompt, parameters, NULL as result_url, result_data, error_message, created_at, completed_at
        FROM mcp_media_tasks
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `).catch(() => ({ rows: [] } as any));

      const mcpRows = (mcpResult as any).rows || (Array.isArray(mcpResult) ? mcpResult : []);

      const combinedRows = [...rows, ...mcpRows].sort((a: any, b: any) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      }).slice(0, limit);

      const tasks = combinedRows.map((row: any) => {
        let resultData: Record<string, unknown> | undefined = undefined;
        try {
          resultData = typeof row.result_data === "string" ? JSON.parse(row.result_data) : (row.result_data || undefined);
        } catch {
          resultData = undefined;
        }

        let parameters: Record<string, unknown> | undefined = undefined;
        try {
          parameters = typeof row.parameters === "string" ? JSON.parse(row.parameters) : (row.parameters || undefined);
        } catch {
          parameters = undefined;
        }

        let resultUrl = typeof row.result_url === "string" && row.result_url.trim() ? row.result_url.trim() : "";
        let thumbUrl = "";
        if (resultData) {
          resultUrl = resultUrl || (resultData.resultUrl || resultData.result_url || resultData.url || resultData.videoUrl || resultData.video_url || resultData.imageUrl || resultData.image_url || (Array.isArray(resultData.urls) ? resultData.urls[0] : "") || "") as string;
          thumbUrl = (resultData.thumbnailUrl || resultData.thumbnail_url || resultData.previewUrl || resultData.preview_url || resultData.posterUrl || resultData.poster_url || "") as string;
        }
        if (!thumbUrl) thumbUrl = resultUrl;

        return {
          id: String(row.id),
          taskId: row.task_id ? String(row.task_id) : undefined,
          mediaType: String(row.media_type || "image"),
          status: String(row.status || "completed"),
          model: row.model ? String(row.model) : undefined,
          prompt: row.prompt ? String(row.prompt) : undefined,
          parameters,
          resultUrl,
          thumbnailUrl: thumbUrl,
          errorMessage: row.error_message ? String(row.error_message) : undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
        };
      });

      return res.status(200).json({ contractVersion: "2026-08-25.1", tasks, total: tasks.length });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.get("/api/workers/:workerId/library", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db
        .select({ id: workers.id, tenantId: workers.tenantId, registeredByUserId: workers.registeredByUserId })
        .from(workers)
        .where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId)))
        .limit(1);
      if (!worker) return fail(res, req, 404, "WORKER_NOT_FOUND");

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const itemType = typeof req.query.item_type === "string" ? req.query.item_type.trim().toLowerCase() : null;
      const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : null;

      const conditions = [
        eq(libraryItems.tenantId, claims.tenantId),
        isNull(libraryItems.deletedAt),
        ne(libraryItems.itemType, "folder"),
      ];

      if (worker.registeredByUserId) {
        conditions.push(
          or(
            eq(libraryItems.ownerUserId, worker.registeredByUserId),
            inArray(libraryItems.visibility, ["team", "public"])
          )!
        );
      } else {
        conditions.push(inArray(libraryItems.visibility, ["team", "public"]));
      }

      if (itemType && itemType !== "all") {
        if (itemType === "video") {
          conditions.push(eq(libraryItems.itemType, "video"));
        } else if (itemType === "audio") {
          conditions.push(inArray(libraryItems.itemType, ["audio", "music", "sfx"]));
        } else if (itemType === "music") {
          conditions.push(inArray(libraryItems.itemType, ["music", "audio"]));
        } else if (itemType === "sfx") {
          conditions.push(eq(libraryItems.itemType, "sfx"));
        } else if (itemType === "image") {
          conditions.push(eq(libraryItems.itemType, "image"));
        } else if (itemType === "broll") {
          conditions.push(inArray(libraryItems.itemType, ["video", "image"]));
        } else {
          conditions.push(eq(libraryItems.itemType, itemType));
        }
      }

      if (query) {
        conditions.push(
          or(
            ilike(libraryItems.title, `%${query}%`),
            ilike(libraryItems.description, `%${query}%`)
          )!
        );
      }

      const rows = await db
        .select({
          id: libraryItems.id,
          tenantId: libraryItems.tenantId,
          ownerUserId: libraryItems.ownerUserId,
          itemType: libraryItems.itemType,
          source: libraryItems.source,
          projectId: libraryItems.projectId,
          title: libraryItems.title,
          description: libraryItems.description,
          status: libraryItems.status,
          visibility: libraryItems.visibility,
          metadata: libraryItems.metadata,
          sourceUrl: libraryItems.sourceUrl,
          thumbnailUrl: libraryItems.thumbnailUrl,
          createdAt: libraryItems.createdAt,
          updatedAt: libraryItems.updatedAt,
        })
        .from(libraryItems)
        .where(and(...conditions))
        .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.createdAt), desc(libraryItems.id))
        .limit(limit);

      const items = rows.map((row) => {
        const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, any>;
        let sourceUrl = row.sourceUrl || (meta.sourceUrl || meta.url || meta.videoUrl || meta.audioUrl || meta.fileUrl || "") as string;
        let thumbUrl = row.thumbnailUrl || (meta.thumbnailUrl || meta.previewUrl || meta.posterUrl || "") as string;
        if (!thumbUrl && row.itemType === "image") {
          thumbUrl = sourceUrl;
        }
        if (!thumbUrl && row.itemType === "video") {
          thumbUrl = (meta.previewUrl || meta.posterUrl || "") as string;
        }

        return {
          id: String(row.id),
          title: row.title,
          itemType: row.itemType,
          source: row.source,
          projectId: row.projectId || undefined,
          description: row.description || undefined,
          status: row.status,
          visibility: row.visibility,
          sourceUrl: sourceUrl || undefined,
          thumbnailUrl: thumbUrl || undefined,
          metadata: meta,
          createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
        };
      });

      return res.status(200).json({ contractVersion: "2026-08-25.1", items, total: items.length });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  /**
   * Materialize an approved start/reference image for a claimed shot job.
   * The browser never receives this route and the Worker must prove both the
   * job assignment and the asset's presence in that job input before bytes
   * leave managed storage.
   */
  app.get("/api/workers/:workerId/media-inputs/:assetId", limiter, async (req, res) => {
    try {
      const claims = await auth(req, ["series:media:process"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const numericAssetId = Number(req.params.assetId);
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId.trim() : "";
      const seriesId = typeof req.query.seriesId === "string" ? req.query.seriesId.trim() : "";
      const numericSeriesId = Number(seriesId);
      if (!Number.isSafeInteger(numericAssetId) || numericAssetId <= 0 || !Number.isSafeInteger(numericSeriesId) || numericSeriesId <= 0 || !jobId) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const db = getDb();
      const [job] = await db.select({ id: workerJobs.id, inputJson: workerJobs.inputJson, status: workerJobs.status, workerSeriesBindingId: workerJobs.workerSeriesBindingId }).from(workerJobs).where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, claims.tenantId), eq(workerJobs.workerId, claims.workerId))).limit(1);
      if (!job || !["claimed", "preparing", "running", "uploading", "publishing"].includes(job.status)) return fail(res, req, 409, "ACTION_NOT_ALLOWED");
      if (job.inputJson.seriesId !== seriesId || !job.workerSeriesBindingId) return fail(res, req, 403, "ARTIFACT_OWNERSHIP_FAILED");
      const [binding] = await db.select({ seriesId: workerSeriesBindings.seriesId, status: workerSeriesBindings.status, revokedAt: workerSeriesBindings.revokedAt })
        .from(workerSeriesBindings)
        .where(and(eq(workerSeriesBindings.id, job.workerSeriesBindingId), eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId)))
        .limit(1);
      if (!binding || String(binding.seriesId) !== seriesId || binding.status !== "active" || binding.revokedAt) return fail(res, req, 403, "ARTIFACT_OWNERSHIP_FAILED");
      const assetToken = `media-${numericAssetId}`;
      if (!collectReferencedMediaAssetIds(job.inputJson).has(assetToken)) return fail(res, req, 403, "ARTIFACT_OWNERSHIP_FAILED");
      const jobInput = job.inputJson && typeof job.inputJson === "object" ? job.inputJson as Record<string, unknown> : {};
      if (jobInput.kind === "shot_video_generation") {
        const episodeId = Number(jobInput.episodeId);
        const shotMatch = typeof jobInput.shotId === "string" ? jobInput.shotId.match(/^shot-(\d+)$/) : null;
        const shotNumber = shotMatch ? Number(shotMatch[1]) : NaN;
        const [episode] = Number.isSafeInteger(episodeId) && episodeId > 0
          ? await db.select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
            .from(verticalDramaEpisodes)
            .where(and(eq(verticalDramaEpisodes.id, episodeId), eq(verticalDramaEpisodes.tenantId, claims.tenantId), eq(verticalDramaEpisodes.seriesId, numericSeriesId)))
            .limit(1)
          : [];
        const [reference] = Number.isSafeInteger(episodeId) && episodeId > 0 && Number.isSafeInteger(shotNumber) && shotNumber > 0
          ? await db.select({ id: verticalDramaShotReferences.id })
            .from(verticalDramaShotReferences)
            .where(and(eq(verticalDramaShotReferences.tenantId, claims.tenantId), eq(verticalDramaShotReferences.seriesId, numericSeriesId), eq(verticalDramaShotReferences.episodeId, episodeId), eq(verticalDramaShotReferences.shotNumber, shotNumber), eq(verticalDramaShotReferences.mediaAssetId, numericAssetId)))
            .limit(1)
          : [];
        if (!episodeStartFrameContainsAssetForShot(episode?.startFramePlan, numericAssetId, shotNumber) && !reference) {
          return fail(res, req, 403, "ARTIFACT_OWNERSHIP_FAILED");
        }
      }
      const [asset] = await db.select({ storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType, checksumSha256: mediaAssets.checksumSha256 }).from(mediaAssets).where(and(eq(mediaAssets.id, numericAssetId), eq(mediaAssets.tenantId, claims.tenantId), ne(mediaAssets.status, "expired"))).limit(1);
      if (!asset?.storageKey || !asset.checksumSha256) return fail(res, req, 404, "SERIES_NOT_FOUND");
      const stored = await storageStreamFile(asset.storageKey);
      if (!stored) return fail(res, req, 404, "SERIES_NOT_FOUND");
      res.status(200);
      res.setHeader("Content-Type", asset.mimeType || stored.contentType || "application/octet-stream");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Asset-Sha256", asset.checksumSha256);
      if (stored.contentLength) res.setHeader("Content-Length", String(stored.contentLength));
      const nodeStream = stored.stream as NodeJS.ReadableStream;
      if (typeof (nodeStream as any).pipe === "function") return (nodeStream as any).pipe(res);
      const reader = (stored.stream as ReadableStream).getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        res.write(Buffer.from(chunk.value));
      }
      return res.end();
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      return fail(res, req, 500, "ACTION_NOT_ALLOWED", true);
    }
  });

  app.post("/api/workers/:workerId/media-jobs", limiter, enforceJsonBodyMaxBytes(256 * 1024), async (req, res) => {
    try {
      const claims = await auth(req, ["series:read"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const payload = parseVerticalDramaMediaJobPayload(req.body?.payload);
      const requiredScope = payload.kind === "media_ingest" ? "series:scan" : "series:media:process";
      if (!claims.scopes.includes(requiredScope)) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const db = getDb();
      const [worker] = await db.select().from(workers).where(and(eq(workers.id, claims.workerId), eq(workers.tenantId, claims.tenantId))).limit(1);
      const principal = worker && resolveWorkerSeriesPrincipal({ worker, grantedScopes: claims.scopes, authorityRevision: claims.workerConnectionId || "worker-current", policyRevision: "tenant-current" });
      if (!principal || !isWorkerSeriesActionAllowed(principal, "process")) return fail(res, req, 403, "SERIES_ACCESS_DENIED");
      const [bindingRow] = await db.select().from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, Number(payload.seriesId)), isNull(workerSeriesBindings.revokedAt))).limit(1);
      if (!bindingRow) return fail(res, req, 409, "ROOT_NOT_ALLOWED");
      const binding = { seriesId: String(bindingRow.seriesId), rootId: bindingRow.rootId, rootFingerprint: bindingRow.rootFingerprint, bindingRevision: bindingRow.bindingRevision, workspaceMode: bindingRow.workspaceMode === "managed_local" ? "managed_local" as const : "local_only" as const, status: bindingRow.status === "active" ? "active" as const : "stale" as const };
      const capabilityJson = worker.capabilitiesJson && typeof worker.capabilitiesJson === "object" ? worker.capabilitiesJson as Record<string, unknown> : {};
      const probe = buildMediaCapabilityProbe(capabilityJson, payload.kind);
      const requestHash = hashVerticalDramaMediaRequest(payload);
      const admissionInput = { payload, binding, capabilityProbe: probe, idempotencyKey: payload.idempotencyKey, requestHash, actor: { tenantId: claims.tenantId, userId: principal.userId, workerId: claims.workerId } };
      const [existingJob] = await db.select({ id: workerJobs.id, inputJson: workerJobs.inputJson })
        .from(workerJobs)
        .where(and(
          eq(workerJobs.tenantId, claims.tenantId),
          eq(workerJobs.workerId, claims.workerId),
          eq(workerJobs.idempotencyKey, payload.idempotencyKey),
        ))
        .limit(1);
      if (existingJob) {
        let existingRequestHash: string;
        try {
          existingRequestHash = hashVerticalDramaMediaRequest(existingJob.inputJson);
        } catch {
          throw new Error("idempotency_conflict");
        }
        admitVerticalDramaMediaJob({ ...admissionInput, existingRequestHash });
        return res.status(200).json({ contractVersion: "2026-08-25.1", status: "accepted", replayed: true, jobId: existingJob.id, jobKind: payload.kind, seriesId: payload.seriesId, idempotencyKey: payload.idempotencyKey });
      }
      const admission = admitVerticalDramaMediaJob(admissionInput);
      const [job] = await db.insert(workerJobs).values({ tenantId: claims.tenantId, workerId: claims.workerId, workerSeriesBindingId: bindingRow.id, workerSeriesBindingRevision: bindingRow.bindingRevision, runtimeType: worker.runtimeType, requestedByUserId: principal.userId, jobType: payload.kind, status: "queued", resourceProfile: payload.kind === "media_ingest" ? "cpu_heavy" : "gpu_required", capabilityRequirementsJson: { capabilityRevision: admission.capabilityRevision, requiredClaimCapability: payload.kind, seriesMedia: true }, inputJson: payload as Record<string, unknown>, idempotencyKey: payload.idempotencyKey }).onConflictDoNothing().returning({ id: workerJobs.id, status: workerJobs.status });
      if (!job) {
        const [conflictingJob] = await db.select({ id: workerJobs.id, inputJson: workerJobs.inputJson })
          .from(workerJobs)
          .where(and(
            eq(workerJobs.tenantId, claims.tenantId),
            eq(workerJobs.workerId, claims.workerId),
            eq(workerJobs.idempotencyKey, payload.idempotencyKey),
          ))
          .limit(1);
        if (!conflictingJob) return fail(res, req, 409, "IDEMPOTENCY_CONFLICT", true);
        let conflictingRequestHash: string;
        try {
          conflictingRequestHash = hashVerticalDramaMediaRequest(conflictingJob.inputJson);
        } catch {
          throw new Error("idempotency_conflict");
        }
        admitVerticalDramaMediaJob({ ...admissionInput, existingRequestHash: conflictingRequestHash });
        return res.status(200).json({ contractVersion: "2026-08-25.1", status: "accepted", replayed: true, jobId: conflictingJob.id, jobKind: payload.kind, seriesId: payload.seriesId, idempotencyKey: payload.idempotencyKey });
      }
      return res.status(202).json({ contractVersion: "2026-08-25.1", status: "accepted", replayed: false, jobId: job.id, jobKind: admission.jobKind, seriesId: admission.seriesId });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      if (error instanceof Error && ["root_not_bound", "root_revision_stale", "workflow_capability_blocked", "idempotency_conflict"].includes(error.message)) return fail(res, req, error.message === "root_not_bound" ? 409 : 422, error.message === "idempotency_conflict" ? "IDEMPOTENCY_CONFLICT" : error.message === "root_revision_stale" ? "STALE_REVISION" : error.message === "root_not_bound" ? "ROOT_NOT_ALLOWED" : "CAPABILITY_BLOCKED");
      return fail(res, req, 400, "ACTION_NOT_ALLOWED");
    }
  });

  app.post("/api/workers/:workerId/media-publications", limiter, enforceJsonBodyMaxBytes(256 * 1024), async (req, res) => {
    try {
      const claims = await auth(req, ["series:media:publish"], ["worker_upload"]);
      if (claims.workerId !== req.params.workerId) return fail(res, req, 403, "WORKER_SCOPE_DENIED");
      const body = req.body as Record<string, unknown>;
      const seriesId = Number(body.seriesId);
      const bindingRevision = Number(body.bindingRevision);
      const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
      const workerArtifactId = typeof body.workerArtifactId === "string" ? body.workerArtifactId.trim() : "";
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0 || !Number.isSafeInteger(bindingRevision) || bindingRevision <= 0 || !jobId || !workerArtifactId) return fail(res, req, 400, "ACTION_NOT_ALLOWED");
      const artifact = mediaArtifactManifestSchema.parse(body.artifact);
      const qc = mediaQcReportSchema.parse(body.qc);
      const db = getDb();
      const [binding] = await db.select({ id: workerSeriesBindings.id, bindingRevision: workerSeriesBindings.bindingRevision, status: workerSeriesBindings.status, revokedAt: workerSeriesBindings.revokedAt }).from(workerSeriesBindings).where(and(eq(workerSeriesBindings.tenantId, claims.tenantId), eq(workerSeriesBindings.workerId, claims.workerId), eq(workerSeriesBindings.seriesId, seriesId))).limit(1);
      if (!binding || binding.status !== "active" || binding.revokedAt) return fail(res, req, 409, "ROOT_NOT_ALLOWED");
      const [job] = await db.select({ id: workerJobs.id, workerId: workerJobs.workerId, jobType: workerJobs.jobType, status: workerJobs.status, workerSeriesBindingId: workerJobs.workerSeriesBindingId, workerSeriesBindingRevision: workerJobs.workerSeriesBindingRevision }).from(workerJobs).where(and(eq(workerJobs.tenantId, claims.tenantId), eq(workerJobs.id, jobId), eq(workerJobs.workerId, claims.workerId))).limit(1);
      const [workerArtifact] = await db.select({ id: workerArtifacts.id, workerJobId: workerArtifacts.workerJobId, artifactType: workerArtifacts.artifactType, storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson }).from(workerArtifacts).where(and(eq(workerArtifacts.id, workerArtifactId), eq(workerArtifacts.workerJobId, jobId))).limit(1);
      const metadata = workerArtifact?.metadataJson && typeof workerArtifact.metadataJson === "object" ? workerArtifact.metadataJson as Record<string, unknown> : {};
      const artifactProofValid = Boolean(job && workerArtifact && job.workerId === claims.workerId && ["completed", "publishing", "published"].includes(job.status) && job.workerSeriesBindingId === binding.id && job.workerSeriesBindingRevision === bindingRevision && workerArtifact.artifactType === artifact.kind && workerArtifact.storageRef.startsWith(`worker-artifacts/${claims.tenantId}/${jobId}/`) && metadata.checksumSha256 === artifact.checksum && Number(metadata.sizeBytes) === artifact.sizeBytes && metadata.contentType === artifact.contentType);
      const published = validateVerticalDramaMediaPublication({ context: { tenantId: claims.tenantId, seriesId: String(seriesId), bindingRevision, currentBindingRevision: binding.bindingRevision, uploadTokenWorkerId: claims.workerId, expectedWorkerId: job?.workerId ?? "", expectedChecksum: artifact.checksum, verifiedArtifact: artifactProofValid }, artifact, qc });
      const [record] = await db.insert(verticalDramaMediaAssets).values({ tenantId: claims.tenantId, seriesId, bindingId: binding.id, sourceAssetId: artifact.sourceAssetId, sourceRevision: artifact.sourceRevision, sourceFingerprint: artifact.checksum, assetKind: artifact.kind, pipelineState: "published", sourceMetadataJson: {}, derivedArtifactJson: artifact as unknown as Record<string, unknown>, qcReportJson: qc as unknown as Record<string, unknown>, provenanceJson: published.provenance, vectorIndexStatus: "queued" }).onConflictDoUpdate({ target: [verticalDramaMediaAssets.tenantId, verticalDramaMediaAssets.seriesId, verticalDramaMediaAssets.sourceAssetId, verticalDramaMediaAssets.sourceRevision], set: { pipelineState: "published", derivedArtifactJson: artifact as unknown as Record<string, unknown>, qcReportJson: qc as unknown as Record<string, unknown>, provenanceJson: published.provenance, vectorIndexStatus: "queued", updatedAt: new Date() } }).returning({ id: verticalDramaMediaAssets.id, pipelineState: verticalDramaMediaAssets.pipelineState });
      if (record) {
        const intelligence = artifact.intelligence;
        const scenes = intelligence?.scenes ?? [];
        const silenceSegments = intelligence?.silenceSegments ?? [];
        const transform = intelligence?.transform;
        const searchableText = [
          artifact.sourceAssetId,
          artifact.kind,
          intelligence?.transcript,
          ...(intelligence?.tags ?? []),
          ...(intelligence?.subjects ?? []),
          ...scenes.flatMap(scene => [scene.label, `${scene.startMs}-${scene.endMs ?? "end"}ms`]),
          ...silenceSegments.map(segment => `silence:${segment.startMs}-${segment.endMs ?? "end"}ms`),
          transform ? `aspect:${transform.aspectRatio}` : null,
          transform ? `tracking:${transform.trackingMode}` : null,
        ].filter(Boolean).join(" ").slice(0, 4000);
        const tags = [
          artifact.kind,
          ...(intelligence?.tags ?? []),
          ...(intelligence?.subjects ?? []),
          ...scenes.map(scene => `scene:${scene.label}`),
          ...(silenceSegments.length > 0 ? ["has_dead_air"] : []),
          ...(transform ? [`aspect:${transform.aspectRatio}`, `tracking:${transform.trackingMode}`] : []),
        ].slice(0, 64);
        const [indexRecord] = await db.insert(verticalDramaMediaIndexRecords).values({ tenantId: claims.tenantId, seriesId, mediaAssetId: record.id, artifactRevision: artifact.artifactRevision, searchableText, tagsJson: tags, status: "queued" }).onConflictDoNothing().returning({ id: verticalDramaMediaIndexRecords.id });
        if (indexRecord) void processVerticalDramaMediaIndexRecord(indexRecord.id).catch(() => undefined);
      }
      return res.status(201).json({ contractVersion: "2026-08-25.1", status: "published", asset: record });
    } catch (error) {
      if (error instanceof WorkerAuthError) return fail(res, req, error.statusCode, error.code === "worker_permission_denied" ? "WORKER_PERMISSION_DENIED" : "WORKER_AUTH_REQUIRED");
      if (error instanceof Error && ["root_revision_stale", "artifact_ownership_failed", "artifact_checksum_mismatch", "qc_failed", "publication_rejected"].includes(error.message)) return fail(res, req, error.message === "root_revision_stale" ? 409 : 422, error.message === "root_revision_stale" ? "STALE_REVISION" : error.message === "artifact_ownership_failed" ? "ARTIFACT_OWNERSHIP_FAILED" : error.message === "artifact_checksum_mismatch" ? "ARTIFACT_CHECKSUM_MISMATCH" : error.message === "qc_failed" ? "QC_FAILED" : "PUBLICATION_REJECTED");
      return fail(res, req, 400, "ACTION_NOT_ALLOWED");
    }
  });
}
