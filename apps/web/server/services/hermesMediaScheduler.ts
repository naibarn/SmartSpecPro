/**
 * Feature 135 — Hermes Grok media worker: `queueHermesMediaJob`, the single
 * server-side entry point every generation surface submits a Hermes media
 * job through (spec §9, §10.2, §13.7, §14).
 *
 * Flow (fail-closed at every step; every typed rejection throws
 * `new TRPCError({ code, message: formatHermesErrorMessage(code, detail?) })`
 * per the section-01 wire convention):
 *
 *   1. Flags: global `hermes_worker_enabled` + tenant `hermesMediaWorker`
 *      flag → `HERMES_DISABLED`.
 *   2. Resolve connection (single pass, no tier fallback): explicit
 *      `connectionId` → `repo.findConnectionById`; else auto-pick the
 *      eligible `server_shared` connection whose capability manifest
 *      advertises the operation's asset type, skipping any connection that
 *      is currently busy (running > 0), then picking the lowest queue depth
 *      with daily-quota headroom (code review FIX 3). Enforces tenant +
 *      (personal/private) owner match and `status === "authorized"`.
 *   2b. Per-scope flag (+ video flag for video operations) → `HERMES_DISABLED`.
 *   3. Assigned worker online (heartbeat-staleness) → `HERMES_WORKER_UNAVAILABLE`.
 *   4. Contract validation: `hermesMediaJobContractSchema.parse` +
 *      `effectiveHermesCapability` operation/reference-limit gate — BEFORE
 *      admission/fee (TDD §3.2), never silently degraded.
 *   5. Idempotency (non-terminal jobs only — a terminal prior job never
 *      blocks a fresh submit; gets an attempt-suffixed key instead). Checked
 *      BEFORE admission (code review FIX 4) so a duplicate submit against an
 *      already non-terminal job never consumes a submission-window slot or a
 *      queued-cap unit, and never reserves (then has to refund) a second fee.
 *   6. `checkHermesMediaAdmission` (batchSize from `settings.outputCount`) —
 *      runs INSIDE `repo.withAdmissionLock` (code review FIX 1), together
 *      with the fee reserve and the insert, so the whole
 *      check-then-act sequence is race-safe under concurrent submissions.
 *   7. Fee: iff `scope === "server_shared"` && `hermes_shared_pool_fee_credits > 0`.
 *   8. `repo.insertJob`.
 *   9. Return `{ created, taskId: "hermes_" + job.id, job }`.
 *
 * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import { getDb } from "../db";
import {
  hermesProviderConnections,
  workerJobs,
  workers,
  type HermesProviderConnection,
  type Worker,
} from "../../drizzle/schema";
import {
  HERMES_MEDIA_CAPABILITY_FAMILIES,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
} from "../../shared/workerRuntime";
import {
  effectiveHermesCapability,
  formatHermesErrorMessage,
  hermesMediaJobContractSchema,
  type HermesConnectionCapabilityManifest,
  type HermesMediaErrorCode,
  type HermesMediaJobContract,
  type HermesMediaOperation,
} from "../../shared/hermesMedia";
import { refundReservation } from "./creditService";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { checkHermesMediaAdmission, type HermesAdmissionResult } from "./hermesMediaAdmission";
import { getHermesWorkerSettings, type HermesWorkerSettings } from "./hermesWorkerSettings";
import { HERMES_WORKER_ONLINE_STALE_MS } from "./hermesConnectionService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import type { TenantFeatureFlags } from "../../shared/featureFlags";
import { debugError } from "../_core/logger";

type WorkerJobRecord = Record<string, any>;
type HermesConnectionAssetType = "image" | "video";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

/**
 * Queue-only additive fields layered on top of the frozen `hermesMedia`
 * contract (`shared/hermesMedia.ts`), mirroring the
 * `QueueVerticalDramaFfmpegAssemblyJobInput extends ...JobContract` pattern
 * in `workerSchedulerService.ts`.
 *
 * `connectionId` is deliberately OPTIONAL here (unlike the frozen contract,
 * where it's a required non-empty string) — an omitted/blank value means
 * "auto-pick from the shared pool" (step 2); the final, fully-resolved
 * `connectionId` is substituted back in before schema validation (step 4).
 */
export interface QueueHermesMediaJobInput extends Omit<HermesMediaJobContract, "connectionId"> {
  connectionId?: string;
  tenantId: string;
  requestedByUserId: number;
  priority?: number;
  idempotencyKey?: string;
}

/**
 * Narrow repo seam this scheduler needs beyond
 * `WorkerSchedulerRepository`'s `findJobByIdempotencyKey` /
 * `findWorkerById` / `insertJob` (all reused verbatim from that
 * interface's shape, not its private `defaultRepo`, which isn't exported).
 */
export interface HermesSchedulerRepoExtras {
  findConnectionById(params: { tenantId: string; connectionId: string }): Promise<HermesProviderConnection | null>;
  listEligibleSharedConnections(params: {
    tenantId: string;
    assetType: HermesConnectionAssetType;
  }): Promise<HermesProviderConnection[]>;
  countQueuedForConnection(params: { connectionId: string }): Promise<number>;
  /** Code review FIX 3: jobs on this connection that are actively occupying
   *  it (claimed/preparing/running/etc) — the auto-pick loop skips any
   *  candidate with a non-zero count here BEFORE ranking by queue depth, so
   *  a busy shared connection is never handed a new job just because its
   *  queue happens to be shallow. */
  countRunningForConnection(params: { connectionId: string }): Promise<number>;
  isWorkerOnline(params: { tenantId: string; workerId: string }): Promise<boolean>;
  /** Optional hook for a future global `media_models`-style row lookup
   *  (section-09/12) — absent today, so the operation-unsupported gate
   *  relies solely on the connection's own capability manifest. */
  findHermesModelRow?(params: {
    model: string;
    assetType: HermesConnectionAssetType;
  }): Promise<{ enabled?: boolean; maxReferences?: number; maxOutputs?: number } | null>;
  /**
   * Code review FIX 1 (BLOCKER): admission is check-then-act — without a
   * mutual-exclusion seam, two concurrent submissions can both read counts
   * under the cap before either writes, admitting more than the configured
   * cap. `withAdmissionLock` runs `fn` with exclusive access for every key
   * in `keys` (the default impl acquires one Postgres advisory
   * transaction lock per key, sorted for a stable acquisition order to
   * avoid cross-key deadlocks, inside ONE transaction) — the admission
   * check, the fee reserve, and the `insertJob` call all run inside this
   * one `fn` so the whole "check counts then insert" sequence is race-safe.
   * Tests inject a fake (e.g. a simple promise-chain mutex) so unit tests
   * never need a real Postgres connection.
   */
  withAdmissionLock<T>(keys: string[], fn: () => Promise<T>): Promise<T>;
}

export interface HermesSchedulerRepository extends HermesSchedulerRepoExtras {
  findJobByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<WorkerJobRecord | null>;
  findWorkerById(tenantId: string, workerId: string): Promise<Worker | null>;
  insertJob(values: Record<string, unknown>): Promise<WorkerJobRecord>;
}

export interface QueueHermesMediaJobDeps {
  repo?: HermesSchedulerRepository;
  admission?: typeof checkHermesMediaAdmission;
  reserveFee?: typeof reserveWorkerJobCredits;
  getFlags?: (tenantId: string) => Promise<TenantFeatureFlags>;
  getSettings?: typeof getHermesWorkerSettings;
  now?: () => Date;
}

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

/** Below `HERMES_CONTROL_JOB_PRIORITY` (50, `hermesConnectionJobs.ts`) —
 *  control jobs must always jump the media queue on the same worker. */
const HERMES_MEDIA_JOB_DEFAULT_PRIORITY = 25;

const HERMES_MEDIA_JOB_TYPES = [HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE] as const;

const HERMES_MEDIA_JOB_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "canceled",
  "expired",
]);

/** Non-`queued`, non-terminal statuses — a job in any of these is actively
 *  occupying its connection (mirrors `hermesMediaAdmission.ts`'s own
 *  `ACTIVE_CONNECTION_STATUSES` — duplicated here rather than imported so
 *  this module never reaches into that module's private internals). */
const ACTIVE_CONNECTION_STATUSES = [
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
] as const;

const HERMES_MEDIA_REQUIRED_PROGRESS_STAGES = [
  "downloading_references",
  "starting_hermes",
  "generating",
  "collecting_output",
  "validating_output",
  "uploading",
] as const;

const IMAGE_HERMES_TIMEOUT_SECONDS = 600;
const VIDEO_HERMES_TIMEOUT_SECONDS = 1800;

const IMAGE_OPERATIONS: HermesMediaOperation[] = ["image.generate", "image.edit"];
const VIDEO_OPERATIONS: HermesMediaOperation[] = [
  "video.generate",
  "video.image_to_video",
  "video.reference_to_video",
];

// ────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────

function hermesTypedError(
  code: HermesMediaErrorCode,
  httpCode: "FORBIDDEN" | "NOT_FOUND" | "PRECONDITION_FAILED" | "BAD_REQUEST" | "TOO_MANY_REQUESTS",
  detail?: string,
): TRPCError {
  return new TRPCError({ code: httpCode, message: formatHermesErrorMessage(code, detail) });
}

function assetTypeForOperation(operation: HermesMediaOperation): HermesConnectionAssetType {
  return operation.startsWith("image.") ? "image" : "video";
}

function scopeFlagFrom(settings: HermesWorkerSettings, scope: HermesProviderConnection["scope"]): boolean {
  if (scope === "server_shared") return settings.sharedPoolEnabled;
  if (scope === "server_personal") return settings.serverPersonalEnabled;
  return settings.privateEnabled;
}

/**
 * Code review FIX 3: `listEligibleSharedConnections` must actually use its
 * `assetType` — a connection's capability manifest is the source of truth
 * for whether it can serve image vs video operations. A connection with no
 * manifest yet (never successfully probed) is treated as NOT eligible
 * (strict — mirrors the operation-unsupported gate's "never silently
 * degraded" rule) rather than permissively assumed to support everything.
 */
function isAssetTypeEnabledInManifest(
  manifest: HermesConnectionCapabilityManifest | null | undefined,
  assetType: HermesConnectionAssetType,
): boolean {
  if (!manifest) return false;
  const ops = assetType === "image" ? IMAGE_OPERATIONS : VIDEO_OPERATIONS;
  return ops.some((op) => manifest.operations?.[op]?.enabled === true);
}

/** Maps a non-`authorized` connection status to its typed rejection code
 *  (spec §13.7). `pending` / `disconnected` / `error` all mean "this
 *  connection isn't usable right now, (re)connect it" — `reauth_required`
 *  and `entitlement_restricted` get their own dedicated codes. */
function mapConnectionStatusToErrorCode(
  status: HermesProviderConnection["status"],
): HermesMediaErrorCode {
  if (status === "reauth_required") return "HERMES_REAUTH_REQUIRED";
  if (status === "entitlement_restricted") return "HERMES_ENTITLEMENT_RESTRICTED";
  return "HERMES_CONNECTION_REQUIRED";
}

function isWorkerOnlineNow(worker: Pick<Worker, "status" | "lastSeenAt"> | null | undefined, now: Date): boolean {
  if (!worker) return false;
  if (worker.status !== "online") return false;
  if (!worker.lastSeenAt) return false;
  const lastSeenMs = new Date(worker.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  return now.getTime() - lastSeenMs <= HERMES_WORKER_ONLINE_STALE_MS;
}

/** Classifies a contract-schema `ZodError` against the two reference-shape
 *  rejection codes spec §13.7 defines — bounds violations (wrong count for
 *  the operation, or exceeding the connection's effective max) map to
 *  `HERMES_REFERENCE_LIMIT_EXCEEDED`; index/label conflicts (non-continuous,
 *  duplicate index, duplicate label) map to `HERMES_REFERENCE_MAPPING_CONFLICT`. */
function classifyContractZodError(error: ZodError): HermesMediaErrorCode {
  const messages = error.issues.map((issue) => issue.message);
  if (messages.some((message) => message.includes("requires between"))) {
    return "HERMES_REFERENCE_LIMIT_EXCEEDED";
  }
  if (
    messages.some(
      (message) =>
        message.includes("continuous")
        || message.includes("must be unique"),
    )
  ) {
    return "HERMES_REFERENCE_MAPPING_CONFLICT";
  }
  return "HERMES_REFERENCE_LIMIT_EXCEEDED";
}

function buildWorkerBillingMetadata(billing: WorkerJobBillingEnvelope | null): Record<string, unknown> | undefined {
  if (!billing) return undefined;
  return {
    reservationId: billing.reservationId,
    reservedCredits: billing.reservedCredits,
    sourceType: billing.sourceType,
  };
}

async function buildFreshAttemptIdempotencyKey(
  repo: HermesSchedulerRepository,
  tenantId: string,
  baseKey: string,
): Promise<string> {
  let attempt = 2;
  let candidateKey = `${baseKey}:a${attempt}`;
  // eslint-disable-next-line no-await-in-loop
  while (await repo.findJobByIdempotencyKey(tenantId, candidateKey)) {
    attempt += 1;
    candidateKey = `${baseKey}:a${attempt}`;
  }
  return candidateKey;
}

/** Code review FIX 1: two lock keys per submission — one scoped to the
 *  connection (guards running=1 + tenant shared-pool queued cap) and one
 *  scoped to the user (guards the per-user queued cap). Sorted so any two
 *  concurrent submissions acquire locks in the SAME order regardless of
 *  which key each needs first, preventing a cross-key deadlock. */
function buildHermesAdmissionLockKeys(connectionId: string, userId: number): string[] {
  return [`hermes:conn:${connectionId}`, `hermes:user:${userId}`].sort();
}

// ────────────────────────────────────────────────────────────────────────
// Default (DB-backed) repo
// ────────────────────────────────────────────────────────────────────────

export const defaultHermesSchedulerRepo: HermesSchedulerRepository = {
  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.idempotencyKey, idempotencyKey)))
      .limit(1);
    return job ?? null;
  },

  async findWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },

  async insertJob(values) {
    const db = await getDb();
    const [job] = await db.insert(workerJobs).values(values as any).returning();
    return job;
  },

  async findConnectionById({ tenantId, connectionId }) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(hermesProviderConnections)
      .where(and(eq(hermesProviderConnections.id, connectionId), eq(hermesProviderConnections.tenantId, tenantId)))
      .limit(1);
    return row ?? null;
  },

  async listEligibleSharedConnections({ tenantId, assetType }) {
    const db = await getDb();
    const rows = await db
      .select()
      .from(hermesProviderConnections)
      .where(
        and(
          eq(hermesProviderConnections.tenantId, tenantId),
          eq(hermesProviderConnections.scope, "server_shared"),
          eq(hermesProviderConnections.status, "authorized"),
        ),
      );
    return rows.filter((row) => isAssetTypeEnabledInManifest(row.capabilitiesJson, assetType));
  },

  async countQueuedForConnection({ connectionId }) {
    const db = await getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workerJobs)
      .where(
        and(
          inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
          eq(workerJobs.status, "queued"),
          sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
        ),
      );
    return row?.count ?? 0;
  },

  async countRunningForConnection({ connectionId }) {
    const db = await getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workerJobs)
      .where(
        and(
          inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
          inArray(workerJobs.status, [...ACTIVE_CONNECTION_STATUSES]),
          sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
        ),
      );
    return row?.count ?? 0;
  },

  async isWorkerOnline({ tenantId, workerId }) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return isWorkerOnlineNow(worker, new Date());
  },

  async withAdmissionLock(keys, fn) {
    const db = await getDb();
    const sortedKeys = Array.from(new Set(keys)).sort();
    return db.transaction(async (tx) => {
      for (const key of sortedKeys) {
        // eslint-disable-next-line no-await-in-loop
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      }
      return fn();
    });
  },
};

// ────────────────────────────────────────────────────────────────────────
// Connection resolution (step 2 — single pass, no tier fallback)
// ────────────────────────────────────────────────────────────────────────

async function resolveConnection(params: {
  tenantId: string;
  requestedByUserId: number;
  connectionId: string | undefined;
  operation: HermesMediaOperation;
  repo: HermesSchedulerRepository;
}): Promise<HermesProviderConnection> {
  const { tenantId, requestedByUserId, connectionId, operation, repo } = params;

  if (connectionId) {
    const connection = await repo.findConnectionById({ tenantId, connectionId });
    if (!connection || connection.tenantId !== tenantId) {
      throw hermesTypedError("HERMES_CONNECTION_REQUIRED", "NOT_FOUND", "connection not found");
    }
    if (connection.scope !== "server_shared" && connection.ownerUserId !== requestedByUserId) {
      // Never let a caller submit against another user's connection — a
      // NOT_FOUND-style rejection avoids leaking whether it exists.
      throw hermesTypedError("HERMES_CONNECTION_REQUIRED", "NOT_FOUND", "connection not found");
    }
    if (connection.status !== "authorized") {
      throw hermesTypedError(mapConnectionStatusToErrorCode(connection.status), "PRECONDITION_FAILED");
    }
    return connection;
  }

  // No explicit connectionId — shared-pool auto-pick ONLY. Single pass: a
  // failure past this point (admission, worker-offline, etc) never falls
  // back to trying a different connection.
  const assetType = assetTypeForOperation(operation);
  const eligible = (await repo.listEligibleSharedConnections({ tenantId, assetType }))
    .filter((candidate) => candidate.scope === "server_shared" && candidate.status === "authorized")
    // Defense-in-depth: re-assert the asset-type filter here even though
    // `listEligibleSharedConnections` is documented to apply it too (FIX 3)
    // — a fake/test repo that returns an unfiltered list must never leak an
    // image-only connection into a video auto-pick.
    .filter((candidate) => isAssetTypeEnabledInManifest(candidate.capabilitiesJson, assetType));

  const withHeadroom: Array<{ connection: HermesProviderConnection; queueDepth: number }> = [];
  for (const candidate of eligible) {
    // eslint-disable-next-line no-await-in-loop
    const runningCount = await repo.countRunningForConnection({ connectionId: candidate.id });
    if (runningCount > 0) {
      // FIX 3: a busy connection is skipped outright, before it's ever
      // ranked by queue depth — picking "lowest queue depth" among busy
      // candidates would just route into HERMES_CONNECTION_BUSY at the
      // admission stage instead of trying an idle one.
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const queueDepth = await repo.countQueuedForConnection({ connectionId: candidate.id });
    if (typeof candidate.dailyJobQuota === "number" && queueDepth >= candidate.dailyJobQuota) {
      continue;
    }
    withHeadroom.push({ connection: candidate, queueDepth });
  }

  if (withHeadroom.length === 0) {
    throw hermesTypedError(
      "HERMES_CONNECTION_REQUIRED",
      "PRECONDITION_FAILED",
      "no eligible shared pool connection with capacity",
    );
  }

  withHeadroom.sort((a, b) => a.queueDepth - b.queueDepth);
  return withHeadroom[0].connection;
}

// ────────────────────────────────────────────────────────────────────────
// queueHermesMediaJob
// ────────────────────────────────────────────────────────────────────────

function admissionHttpCodeFor(code: HermesMediaErrorCode): "TOO_MANY_REQUESTS" | "FORBIDDEN" {
  return code === "HERMES_QUOTA_EXHAUSTED" ? "FORBIDDEN" : "TOO_MANY_REQUESTS";
}

export async function queueHermesMediaJob(
  rawInput: QueueHermesMediaJobInput,
  deps: QueueHermesMediaJobDeps = {},
): Promise<{ created: boolean; taskId: string; job: WorkerJobRecord }> {
  const repo = deps.repo ?? defaultHermesSchedulerRepo;
  const admissionFn = deps.admission ?? checkHermesMediaAdmission;
  const reserveFee = deps.reserveFee ?? reserveWorkerJobCredits;
  const getFlags = deps.getFlags ?? getTenantFeatureFlags;
  const getSettings = deps.getSettings ?? getHermesWorkerSettings;
  const now = deps.now ?? (() => new Date());

  const { tenantId, requestedByUserId, priority, idempotencyKey: callerIdempotencyKey, connectionId: explicitConnectionId, ...contractCore } = rawInput;

  // 1. Flags — global kill switch + tenant rollout flag (cheap, no
  // connection lookup needed yet).
  const settings = await getSettings();
  if (!settings.enabled) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }
  const tenantFlags = await getFlags(tenantId);
  if (!tenantFlags.hermesMediaWorker) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }

  // 2. Resolve connection (single pass — no tier fallback).
  const connection = await resolveConnection({
    tenantId,
    requestedByUserId,
    connectionId: explicitConnectionId?.trim() || undefined,
    operation: rawInput.operation,
    repo,
  });

  const assetType = assetTypeForOperation(rawInput.operation);

  // 2b. Per-scope flag (+ video flag for video operations) — now that the
  // connection's scope is known.
  if (!scopeFlagFrom(settings, connection.scope)) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }
  if (assetType === "video" && !settings.videoEnabled) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }

  // 3. Assigned worker online (heartbeat-staleness), per spec §9.
  if (!connection.assignedWorkerId) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
  }
  const worker = await repo.findWorkerById(tenantId, connection.assignedWorkerId);
  if (!worker) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker not found");
  }
  const online = await repo.isWorkerOnline({ tenantId, workerId: connection.assignedWorkerId });
  if (!online) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker offline");
  }

  // 4. Contract validation — BEFORE admission/fee (TDD §3.2). Substitutes
  // the resolved connectionId back into the payload before parsing.
  let parsedContract: HermesMediaJobContract;
  try {
    parsedContract = hermesMediaJobContractSchema.parse({ ...contractCore, connectionId: connection.id });
  } catch (error) {
    if (error instanceof ZodError) {
      throw hermesTypedError(classifyContractZodError(error), "BAD_REQUEST", error.issues[0]?.message);
    }
    throw error;
  }

  // Operation-unsupported gate (owns spec §20's "unsupported reference-to-
  // video is visibly blocked" criterion) — the connection's own capability
  // manifest is the source of truth here; a future global model-row lookup
  // (`repo.findHermesModelRow`) can only ever NARROW this further, never
  // widen it (see `effectiveHermesCapability`'s doc comment).
  const modelRow = (await repo.findHermesModelRow?.({ model: parsedContract.settings.model, assetType })) ?? {
    enabled: true,
  };
  const effective = effectiveHermesCapability(modelRow, connection.capabilitiesJson, rawInput.operation);
  if (!effective.enabled) {
    throw hermesTypedError("HERMES_OPERATION_UNSUPPORTED", "PRECONDITION_FAILED", effective.reason);
  }
  if (typeof effective.maxReferences === "number" && parsedContract.references.length > effective.maxReferences) {
    throw hermesTypedError("HERMES_REFERENCE_LIMIT_EXCEEDED", "BAD_REQUEST", "exceeds connection's effective maximum references");
  }

  const jobType = assetType === "image" ? HERMES_MEDIA_IMAGE_JOB_TYPE : HERMES_MEDIA_VIDEO_JOB_TYPE;

  // 5. Idempotency — non-terminal jobs only; a terminal prior match never
  // blocks a fresh submit. Code review FIX 4: checked BEFORE admission (not
  // just before the fee reserve) so a duplicate submit against an already
  // non-terminal job never consumes a submission-window slot or a
  // queued-cap unit, on top of never reserving a second fee.
  const canonicalHash = createHash("sha256").update(JSON.stringify(parsedContract)).digest("hex").slice(0, 32);
  const baseIdempotencyKey = callerIdempotencyKey ?? `${jobType}:${connection.id}:${canonicalHash}`;
  const existing = await repo.findJobByIdempotencyKey(tenantId, baseIdempotencyKey);
  if (existing && !HERMES_MEDIA_JOB_TERMINAL_STATUSES.has(existing.status)) {
    return { created: false, taskId: `hermes_${existing.id}`, job: existing };
  }
  const idempotencyKeyToUse = existing
    ? await buildFreshAttemptIdempotencyKey(repo, tenantId, baseIdempotencyKey)
    : baseIdempotencyKey;

  const batchSize = typeof parsedContract.settings.outputCount === "number" ? parsedContract.settings.outputCount : 1;
  const workerIdPin = connection.scope === "private_worker" ? connection.assignedWorkerId : null;
  const resourceProfile = assetType === "image" ? "network_heavy" : "long_running";
  const timeoutSeconds = assetType === "image" ? IMAGE_HERMES_TIMEOUT_SECONDS : VIDEO_HERMES_TIMEOUT_SECONDS;

  // 6-8. Admission + fee + insert — ALL inside the atomic seam (code review
  // FIX 1). Without this, two concurrent submissions could both read counts
  // under the cap before either wrote, admitting more than the configured
  // cap; `withAdmissionLock`'s default implementation serializes concurrent
  // callers via a Postgres advisory transaction lock so the count-check and
  // the insert happen as one indivisible unit.
  const lockKeys = buildHermesAdmissionLockKeys(connection.id, requestedByUserId);
  return repo.withAdmissionLock(lockKeys, async () => {
    const admissionResult: HermesAdmissionResult = await admissionFn(
      {
        tenantId,
        userId: requestedByUserId,
        connection,
        operation: rawInput.operation,
        batchSize,
      },
      { now },
    );
    if (!admissionResult.ok) {
      const detail = admissionResult.retryAfterSeconds
        ? `retry after ${admissionResult.retryAfterSeconds}s`
        : undefined;
      throw hermesTypedError(admissionResult.code, admissionHttpCodeFor(admissionResult.code), detail);
    }

    // 7. Fee — server_shared scope only, and only when a fee is configured.
    let billing: WorkerJobBillingEnvelope | null = null;
    if (connection.scope === "server_shared" && settings.sharedPoolFeeCredits > 0) {
      billing = await reserveFee({
        userId: requestedByUserId,
        tenantId,
        requestedCredits: settings.sharedPoolFeeCredits,
        metadata: {
          jobType,
          connectionId: connection.id,
          operation: rawInput.operation,
        },
      });
    }

    // 8. Insert.
    try {
      const job = await repo.insertJob({
        tenantId,
        teamId: null,
        workerId: workerIdPin,
        runtimeType: worker.runtimeType,
        requestedByUserId,
        requestedBySystemComponent: "hermes_media_scheduler",
        jobType,
        status: "queued",
        statusReason: "hermes_media_scheduler",
        priority: priority ?? HERMES_MEDIA_JOB_DEFAULT_PRIORITY,
        resourceProfile,
        capabilityRequirementsJson: {
          capabilityFamilies: [...HERMES_MEDIA_CAPABILITY_FAMILIES],
          requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
          connectionId: connection.id,
          preferredWorkerId: workerIdPin,
        },
        inputJson: parsedContract,
        instructionsJson: {
          intent: jobType,
          requiredProgressStages: [...HERMES_MEDIA_REQUIRED_PROGRESS_STAGES],
          ...(billing ? { workerBilling: buildWorkerBillingMetadata(billing) } : {}),
        },
        timeoutSeconds,
        retryPolicyJson: { maxAttempts: 2, backoffSeconds: 30 },
        idempotencyKey: idempotencyKeyToUse,
      });

      return { created: true, taskId: `hermes_${job.id}`, job };
    } catch (error) {
      if (billing?.reservationId) {
        // Code review FIX 5: a refund failure here means credits stay
        // reserved-but-orphaned (the job insert already failed, so nothing
        // will ever reconcile this reservation otherwise) — this must be
        // loud, not a silent `.catch(() => {})`.
        try {
          await refundReservation(billing.reservationId);
        } catch (refundError) {
          debugError(
            "hermesMediaScheduler",
            `Failed to refund fee reservation ${billing.reservationId} for user ${requestedByUserId} after insert failure`,
            refundError,
          );
        }
      }
      throw error;
    }
  });
}
