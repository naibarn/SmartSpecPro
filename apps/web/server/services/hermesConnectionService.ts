/**
 * Feature 135 — Hermes Grok media worker connection service.
 *
 * User-facing connection layer over `hermes_provider_connections` (section
 * 02): list / connect / status / default / disconnect / probe / admin
 * operations, plus the `getHermesAvailability` readiness aggregate that the
 * client model picker (section 10) reads directly — there is no separate
 * readiness service.
 *
 * This module ALSO owns the three control-job insert builders
 * (`buildAuthorizeJobInsert` / `buildProbeJobInsert` /
 * `buildDisconnectJobInsert`) and the lazy settlement seam
 * (`settleHermesConnectionFromControlJob`) that section-04's completion
 * hook and 60s terminal-state sweep will call directly — no worker-side
 * handlers, stdout parsing, or proactive completion hook live here.
 *
 * Injected-repo pattern (mirrors `workerStallWatchdogService.ts`): every
 * exported function takes a plain params object plus an optional `deps`
 * object (`{ repo?, settings?, flags?, now? }`) so unit tests can inject
 * `vi.fn()` fakes with no DB and no `vi.mock` of drizzle required.
 *
 * Namespace note: this is the `hermesMedia` / `hermes_media` namespace — it
 * has nothing to do with the pre-existing, unrelated agent-gateway Hermes
 * lane (its own worker-queueing helper and its own tenant runtime flag, both
 * in `server/services/workerSchedulerService.ts` / `shared/featureFlags.ts`,
 * job type `external_agent_task`). The shared unit's worker id is
 * discovered ONLY via the `hermes_shared_worker_id` system setting — never
 * inferred from a worker's `runtimeType`. See
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { getDb } from "../db";
import {
  hermesProviderConnections,
  workerJobEvents,
  workerJobs,
  workers,
  type HermesProviderConnection,
  type InsertHermesProviderConnection,
  type InsertWorkerJob,
  type Worker,
  type WorkerJob,
  type WorkerJobEvent,
} from "../../drizzle/schema";
import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_CAPABILITY_FAMILIES,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
  type WorkerRuntimeType,
} from "../../shared/workerRuntime";
import { defaultHermesAdmissionCounters } from "./hermesMediaAdmission";
import {
  formatHermesErrorMessage,
  // Section-04 carry-forward item A: the shared failure-reason vocabulary
  // that `server/hermesWorker/connectionControlHandlers.ts` emits verbatim
  // as a job's `failureReason`. `mapAuthFailureReasonToErrorCode` /
  // `classifyProbeFailureReason` below match these constants FIRST, keeping
  // their pre-existing substring-sniffing heuristics only as a legacy
  // fallback for jobs whose `failureReason` predates this vocabulary.
  HERMES_CONTROL_FAILURE_REASONS,
  HERMES_MEDIA_ERROR_CODES,
  type HermesConnectionCapabilityManifest,
  type HermesMediaErrorCode,
  type HermesMediaOperation,
} from "../../shared/hermesMedia";
import {
  getHermesWorkerSettings,
  type HermesWorkerSettings,
} from "./hermesWorkerSettings";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import type { TenantFeatureFlags } from "../../shared/featureFlags";
import { getTraceId } from "./traceContext";
import {
  auditHermesConnectStarted,
  auditHermesConnectionAuthorized,
  auditHermesConnectionDisconnected,
  auditHermesConnectionEntitlementRestricted,
  auditHermesConnectionReauthRequired,
  auditHermesConnectionRevoked,
} from "./hermesMediaObservability";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export type HermesConnectionScope = HermesProviderConnection["scope"];
export type HermesConnectionStatus = HermesProviderConnection["status"];

/** Never contains a token/secret/profile-path field. */
export interface SafeHermesConnection {
  id: string;
  scope: HermesConnectionScope;
  status: HermesConnectionStatus;
  accountLabel: string | null;
  accountHint: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  entitlementStatus: string | null;
  assignedWorkerId: string | null;
  assignedWorkerOnline: boolean;
  capabilitySummary: {
    probedAt: string | null;
    imageEnabled: boolean;
    videoEnabled: boolean;
    maxEditReferences: number | null;
    /** Feature 135 §6.1 — most recent live "test generation" liveness-check
     *  result, if one has ever been run for this connection. Additive/
     *  optional projection of `HermesConnectionCapabilityManifest.
     *  lastGenerationTest` — `null` when the manifest carries none. */
    lastGenerationTest: {
      assetType: "image" | "video";
      ok: boolean;
      at: string;
      errorCode?: HermesMediaErrorCode;
    } | null;
  };
  dailyJobQuota: number | null;
  createdAt: string;
  authorizedAt: string | null;
}

export interface HermesConnectionRepo {
  findConnections(params: { tenantId: string; userId: number }): Promise<HermesProviderConnection[]>;
  findConnectionById(params: { tenantId?: string; connectionId: string }): Promise<HermesProviderConnection | null>;
  insertConnection(values: InsertHermesProviderConnection): Promise<HermesProviderConnection>;
  /** Atomic composite: inserts the connection row and its authorize job in
   *  ONE DB transaction (default impl) — used by `startHermesConnect` so a
   *  crash between the two writes can never leave a `pending` connection
   *  with no in-flight authorize job. */
  insertConnectionWithJob(params: {
    connection: InsertHermesProviderConnection;
    job: InsertWorkerJob;
  }): Promise<{ connection: HermesProviderConnection; job: WorkerJob }>;
  /** Atomic reconnect: moves an existing recoverable connection back to
   *  `pending` and inserts its fresh authorize job in the same transaction.
   *  Returns null when another request already changed the row. */
  restartConnectionWithJob(params: {
    tenantId: string;
    connectionId: string;
    expectedStatuses: HermesConnectionStatus[];
    connectionValues: Partial<InsertHermesProviderConnection>;
    job: InsertWorkerJob;
  }): Promise<{ connection: HermesProviderConnection; job: WorkerJob } | null>;
  updateConnection(params: {
    tenantId?: string;
    connectionId: string;
    values: Partial<InsertHermesProviderConnection>;
  }): Promise<HermesProviderConnection>;
  clearDefaultFor(params: {
    tenantId: string;
    userId: number;
    assetType: "image" | "video";
    excludeConnectionId: string;
  }): Promise<void>;
  /** Atomic composite: clears the caller's previous default for `assetType`
   *  then sets the new one, in ONE DB transaction (default impl) — so the
   *  partial-unique index on (tenantId, ownerUserId) can never observe an
   *  intermediate two-defaults state. */
  setDefaultAtomic(params: {
    tenantId: string;
    userId: number;
    connectionId: string;
    assetType: "image" | "video";
  }): Promise<HermesProviderConnection>;
  findWorkerById(params: { tenantId: string; workerId: string }): Promise<Worker | null>;
  findOwnedOnlineWorkers(params: { tenantId: string; userId: number }): Promise<Worker[]>;
  insertWorkerJob(values: InsertWorkerJob): Promise<WorkerJob>;
  findLatestControlJob(params: { tenantId: string; connectionId: string; jobType: string }): Promise<WorkerJob | null>;
  findJobEvents(params: { jobId: string; eventType?: string }): Promise<WorkerJobEvent[]>;
}

export interface HermesConnectionSettingsDeps {
  getHermesWorkerSettings(): Promise<HermesWorkerSettings>;
}

export interface HermesConnectionFlagsDeps {
  getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags>;
}

export interface HermesConnectionDeps {
  repo?: HermesConnectionRepo;
  settings?: HermesConnectionSettingsDeps;
  flags?: HermesConnectionFlagsDeps;
  now?: () => Date;
}

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

/** "Online" mirrors the 2-minute heartbeat-staleness convention already
 *  used by `usersRouter`'s connected-workers view. */
export const HERMES_WORKER_ONLINE_STALE_MS = 2 * 60 * 1000;

export const HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS = 900;
export const HERMES_CONNECTION_PROBE_TIMEOUT_SECONDS = 300;
export const HERMES_CONNECTION_DISCONNECT_TIMEOUT_SECONDS = 120;

const DEFAULT_ELIGIBLE_STATUSES: ReadonlySet<HermesConnectionStatus> = new Set([
  "authorized",
  "reauth_required",
  "entitlement_restricted",
]);

const IMAGE_OPERATIONS: HermesMediaOperation[] = ["image.generate", "image.edit"];
const VIDEO_OPERATIONS: HermesMediaOperation[] = [
  "video.generate",
  "video.image_to_video",
  "video.reference_to_video",
];

const TERMINAL_FAILURE_STATUSES = new Set(["failed", "canceled", "expired"]);

// ────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────

function tenantRequired(tenantId: string | undefined | null): string {
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  }
  return tenantId;
}

function hermesTypedError(
  code: HermesMediaErrorCode,
  httpCode: "FORBIDDEN" | "PRECONDITION_FAILED" | "BAD_REQUEST" | "NOT_FOUND",
  detail?: string,
): TRPCError {
  return new TRPCError({ code: httpCode, message: formatHermesErrorMessage(code, detail) });
}

function isWorkerOnline(worker: Pick<Worker, "status" | "lastSeenAt"> | null | undefined, now: Date): boolean {
  if (!worker) return false;
  if (worker.status !== "online") return false;
  if (!worker.lastSeenAt) return false;
  const lastSeenMs = new Date(worker.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;
  return now.getTime() - lastSeenMs <= HERMES_WORKER_ONLINE_STALE_MS;
}

function getHermesMediaCapability(worker: Pick<Worker, "capabilitiesJson"> | null | undefined): {
  advertised: boolean;
  doctorOk: boolean | null;
  hermesVersion: string | null;
  reason: string | null;
} {
  const capabilities = worker?.capabilitiesJson;
  const raw = capabilities && typeof capabilities === "object"
    ? (capabilities as Record<string, unknown>).hermesMedia
    : null;
  const media = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    advertised: media.advertised === true,
    doctorOk: typeof media.doctorOk === "boolean" ? media.doctorOk : null,
    hermesVersion: typeof media.hermesVersion === "string" ? media.hermesVersion : null,
    reason: typeof media.reason === "string" && media.reason.trim() ? media.reason : null,
  };
}

function isHermesMediaWorkerReady(worker: Worker | null | undefined, now: Date): boolean {
  if (!isWorkerOnline(worker, now)) return false;
  const capability = getHermesMediaCapability(worker);
  return capability.advertised && capability.doctorOk !== false;
}

function isAssetTypeEnabledInManifest(
  manifest: HermesConnectionCapabilityManifest,
  assetType: "image" | "video",
): boolean {
  const ops = assetType === "image" ? IMAGE_OPERATIONS : VIDEO_OPERATIONS;
  return ops.some((op) => manifest.operations?.[op]?.enabled === true);
}

function buildCapabilitySummary(
  manifest: HermesConnectionCapabilityManifest | null | undefined,
): SafeHermesConnection["capabilitySummary"] {
  if (!manifest) {
    return { probedAt: null, imageEnabled: false, videoEnabled: false, maxEditReferences: null, lastGenerationTest: null };
  }
  return {
    probedAt: manifest.probedAt ?? null,
    imageEnabled: isAssetTypeEnabledInManifest(manifest, "image"),
    videoEnabled: isAssetTypeEnabledInManifest(manifest, "video"),
    maxEditReferences: manifest.operations?.["image.edit"]?.maxReferences ?? null,
    lastGenerationTest: manifest.lastGenerationTest ?? null,
  };
}

function toSafeHermesConnection(row: HermesProviderConnection, assignedWorkerOnline: boolean): SafeHermesConnection {
  return {
    id: row.id,
    scope: row.scope,
    status: row.status,
    accountLabel: row.accountLabel,
    accountHint: row.accountHint,
    defaultForImage: row.defaultForImage,
    defaultForVideo: row.defaultForVideo,
    entitlementStatus: row.entitlementStatus,
    assignedWorkerId: row.assignedWorkerId,
    assignedWorkerOnline,
    capabilitySummary: buildCapabilitySummary(row.capabilitiesJson),
    dailyJobQuota: row.dailyJobQuota,
    createdAt: row.createdAt.toISOString(),
    authorizedAt: row.authorizedAt ? row.authorizedAt.toISOString() : null,
  };
}

/** Tenant-wide readable: `server_shared` rows readable by anyone in the
 *  tenant; `server_personal` / `private_worker` rows readable only by the
 *  owner. Used by `listHermesConnections` / `getHermesConnection` (spec:
 *  "visible to the caller"). NOT used for `setHermesDefaultConnection` —
 *  defaults are a strictly per-owner concept even for `server_shared` rows,
 *  see `assertOwnerRegardlessOfScope` below. */
function assertReadable(row: HermesProviderConnection | null, userId: number): asserts row is HermesProviderConnection {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  if (row.scope === "server_shared") return;
  if (row.ownerUserId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  }
}

/** Strict ownership check used by `setHermesDefaultConnection`, regardless
 *  of scope. A `server_shared` connection's `defaultForImage`/
 *  `defaultForVideo` flags belong to its creating `ownerUserId` (the
 *  partial-unique index is keyed on `(tenantId, ownerUserId)`) — allowing
 *  any tenant member to flip those flags on an admin-owned shared
 *  connection would both corrupt another user's default state and risk a
 *  partial-unique index collision against the real owner's own connection.
 *  Everyone but the exact owner gets a NOT_FOUND-style rejection (existence
 *  of another user's connection is not leaked). */
function assertOwnerRegardlessOfScope(
  row: HermesProviderConnection | null,
  userId: number,
): asserts row is HermesProviderConnection {
  if (!row || row.ownerUserId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  }
}

/** Stricter visibility used for connect-status / disconnect / probe: the
 *  owner, or (for `server_shared`) an admin — everyone else gets a
 *  NOT_FOUND-style rejection so existence of another user's connection is
 *  not leaked. */
function assertOwnerOrAdminForShared(
  row: HermesProviderConnection | null,
  userId: number,
  isAdmin: boolean,
): asserts row is HermesProviderConnection {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  if (row.scope === "server_shared") {
    if (!isAdmin && row.ownerUserId !== userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
    }
    return;
  }
  if (row.ownerUserId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  }
}

function isTerminalWorkerJobStatus(status: string): boolean {
  return status === "completed" || TERMINAL_FAILURE_STATUSES.has(status);
}

/** True when `reason` is one of the frozen `HERMES_CONTROL_FAILURE_REASONS`
 *  strings — section-04's handlers emit exactly these, so an exact match
 *  here always wins over the legacy substring heuristics below it. */
function isKnownControlFailureReason(
  reason: string,
): reason is (typeof HERMES_CONTROL_FAILURE_REASONS)[number] {
  return (HERMES_CONTROL_FAILURE_REASONS as readonly string[]).includes(reason);
}

function mapAuthFailureReasonToErrorCode(job: {
  status: string;
  failureReason?: string | null;
}): HermesMediaErrorCode {
  if (job.status === "expired") return "HERMES_TIMEOUT";
  const reason = job.failureReason ?? "";
  if (isKnownControlFailureReason(reason)) {
    if (reason === "oauth_session_expired") return "HERMES_OAUTH_SESSION_EXPIRED";
    if (reason === "oauth_denied") return "HERMES_OAUTH_DENIED";
  }
  // Legacy substring fallback (jobs written before the section-04
  // vocabulary existed).
  const lower = reason.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) return "HERMES_TIMEOUT";
  if (lower.includes("denied") || lower.includes("declined")) return "HERMES_OAUTH_DENIED";
  if (lower.includes("expired")) return "HERMES_OAUTH_SESSION_EXPIRED";
  return "HERMES_PROCESS_FAILED";
}

type ProbeFailureOutcome = "reauth_required" | "entitlement_restricted" | "other";

/** Classifies a terminal-failure probe job's reason so
 *  `settleHermesConnectionFromControlJob` can drive the connection to the
 *  right terminal-ish state instead of silently no-op'ing (a probe failure
 *  is meaningful signal, not just "try again later"):
 *  - auth-invalidation-classified (expired session / revoked grant /
 *    unauthorized) → `reauth_required` + `HERMES_REAUTH_REQUIRED`.
 *  - xAI-403/entitlement-classified → `entitlement_restricted` (mirrors the
 *    success-output path's entitlement classification).
 *  - anything else → `other`; the row's `status` is left untouched, only
 *    `metadataJson.lastError` records the mapped code. */
function classifyProbeFailureReason(job: {
  status: string;
  failureReason?: string | null;
}): { outcome: ProbeFailureOutcome; errorCode: HermesMediaErrorCode } {
  const rawReason = job.failureReason ?? "";

  // Constants-first (section-04 carry-forward item A): the handlers emit
  // exactly these reason strings — match them before the legacy substring
  // heuristics further down.
  if (isKnownControlFailureReason(rawReason)) {
    if (rawReason === "entitlement_restricted") {
      return { outcome: "entitlement_restricted", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" };
    }
    if (rawReason === "reauth_required" || rawReason === "oauth_session_expired" || rawReason === "oauth_denied") {
      return { outcome: "reauth_required", errorCode: "HERMES_REAUTH_REQUIRED" };
    }
    if (rawReason === "process_failed") {
      return { outcome: "other", errorCode: "HERMES_PROCESS_FAILED" };
    }
  }

  // Legacy substring fallback (jobs written before the section-04
  // vocabulary existed).
  const reason = rawReason.toLowerCase();
  if (reason.includes("403") || reason.includes("entitlement") || reason.includes("forbidden")) {
    return { outcome: "entitlement_restricted", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" };
  }
  if (
    reason.includes("reauth")
    || reason.includes("unauthorized")
    || reason.includes("invalid_grant")
    || reason.includes("revoked")
    || reason.includes("session")
  ) {
    return { outcome: "reauth_required", errorCode: "HERMES_REAUTH_REQUIRED" };
  }
  if (job.status === "expired" || reason.includes("timeout") || reason.includes("timed out")) {
    return { outcome: "other", errorCode: "HERMES_TIMEOUT" };
  }
  return { outcome: "other", errorCode: "HERMES_PROCESS_FAILED" };
}

// ────────────────────────────────────────────────────────────────────────
// Control-job insert builders — exported so section-04's
// `hermesConnectionJobs.ts` can reuse them without duplication.
// ────────────────────────────────────────────────────────────────────────

interface BuildJobInsertParams {
  tenantId: string;
  connectionId: string;
  workerId: string;
  runtimeType: WorkerRuntimeType;
  requestedByUserId: number | null;
  profileReference: string;
}

function buildControlJobInsert(
  jobType: string,
  timeoutSeconds: number,
  params: BuildJobInsertParams,
  extraInput: Record<string, unknown> = {},
): InsertWorkerJob {
  return {
    tenantId: params.tenantId,
    workerId: params.workerId,
    runtimeType: params.runtimeType,
    requestedByUserId: params.requestedByUserId ?? undefined,
    jobType,
    status: "queued",
    resourceProfile: "cpu_light",
    capabilityRequirementsJson: {
      requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
      // `workerJobMatchesSelection` (workerSchedulerService.ts) reads this
      // array — required so only a worker declaring the `hermes-media-
      // generation` family can claim these control jobs.
      capabilityFamilies: HERMES_MEDIA_CAPABILITY_FAMILIES,
      connectionId: params.connectionId,
      preferredWorkerId: params.workerId,
    },
    inputJson: {
      connectionId: params.connectionId,
      profileReference: params.profileReference,
      timeoutSeconds,
      ...extraInput,
    },
    timeoutSeconds,
  };
}

export function buildAuthorizeJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
  return buildControlJobInsert(
    HERMES_CONNECTION_AUTH_JOB_TYPE,
    HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
    params,
  );
}

export function buildProbeJobInsert(
  params: BuildJobInsertParams & { testGeneration?: "image" | "video" },
): InsertWorkerJob {
  return buildControlJobInsert(
    HERMES_CONNECTION_PROBE_JOB_TYPE,
    HERMES_CONNECTION_PROBE_TIMEOUT_SECONDS,
    params,
    // Feature 135 §6.1 — threaded through to `jobHandlers.ts`'s
    // `handleControlJob` (out of this file's touch scope — see the backend
    // agent's DEVIATIONS note) which must read `input.testGeneration` and
    // forward it into `ConnectionControlInput` for
    // `runHermesConnectionProbe` to actually run the live generation test.
    // Absent when `testGeneration` is undefined — existing probe-job insert
    // shape is otherwise byte-identical.
    params.testGeneration ? { testGeneration: params.testGeneration } : {},
  );
}

export function buildDisconnectJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
  return buildControlJobInsert(
    HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
    HERMES_CONNECTION_DISCONNECT_TIMEOUT_SECONDS,
    params,
  );
}

// ────────────────────────────────────────────────────────────────────────
// Default (DB-backed) repo
// ────────────────────────────────────────────────────────────────────────

export const defaultHermesConnectionRepo: HermesConnectionRepo = {
  async findConnections({ tenantId }) {
    const db = getDb();
    return db
      .select()
      .from(hermesProviderConnections)
      .where(eq(hermesProviderConnections.tenantId, tenantId));
  },

  async findConnectionById({ tenantId, connectionId }) {
    const db = getDb();
    const conditions = [eq(hermesProviderConnections.id, connectionId)];
    if (tenantId) conditions.push(eq(hermesProviderConnections.tenantId, tenantId));
    const [row] = await db
      .select()
      .from(hermesProviderConnections)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  },

  async insertConnection(values) {
    const db = getDb();
    const [row] = await db.insert(hermesProviderConnections).values(values).returning();
    return row;
  },

  async insertConnectionWithJob({ connection, job }) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [connectionRow] = await tx.insert(hermesProviderConnections).values(connection).returning();
      const [jobRow] = await tx.insert(workerJobs).values(job).returning();
      return { connection: connectionRow, job: jobRow };
    });
  },

  async restartConnectionWithJob({
    tenantId,
    connectionId,
    expectedStatuses,
    connectionValues,
    job,
  }) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [connectionRow] = await tx
        .update(hermesProviderConnections)
        .set(connectionValues)
        .where(and(
          eq(hermesProviderConnections.id, connectionId),
          eq(hermesProviderConnections.tenantId, tenantId),
          inArray(hermesProviderConnections.status, expectedStatuses),
        ))
        .returning();
      if (!connectionRow) return null;
      const [jobRow] = await tx.insert(workerJobs).values(job).returning();
      return { connection: connectionRow, job: jobRow };
    });
  },

  async updateConnection({ tenantId, connectionId, values }) {
    const db = getDb();
    const conditions = [eq(hermesProviderConnections.id, connectionId)];
    if (tenantId) conditions.push(eq(hermesProviderConnections.tenantId, tenantId));
    const [row] = await db
      .update(hermesProviderConnections)
      .set(values)
      .where(and(...conditions))
      .returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
    return row;
  },

  async clearDefaultFor({ tenantId, userId, assetType, excludeConnectionId }) {
    const db = getDb();
    const column = assetType === "image"
      ? hermesProviderConnections.defaultForImage
      : hermesProviderConnections.defaultForVideo;
    await db
      .update(hermesProviderConnections)
      .set(assetType === "image" ? { defaultForImage: false } : { defaultForVideo: false })
      .where(and(
        eq(hermesProviderConnections.tenantId, tenantId),
        eq(hermesProviderConnections.ownerUserId, userId),
        eq(column, true),
        ne(hermesProviderConnections.id, excludeConnectionId),
      ));
  },

  async setDefaultAtomic({ tenantId, userId, connectionId, assetType }) {
    const db = getDb();
    const column = assetType === "image"
      ? hermesProviderConnections.defaultForImage
      : hermesProviderConnections.defaultForVideo;
    return db.transaction(async (tx) => {
      await tx
        .update(hermesProviderConnections)
        .set(assetType === "image" ? { defaultForImage: false } : { defaultForVideo: false })
        .where(and(
          eq(hermesProviderConnections.tenantId, tenantId),
          eq(hermesProviderConnections.ownerUserId, userId),
          eq(column, true),
          ne(hermesProviderConnections.id, connectionId),
        ));
      const [row] = await tx
        .update(hermesProviderConnections)
        .set(assetType === "image" ? { defaultForImage: true } : { defaultForVideo: true })
        .where(and(
          eq(hermesProviderConnections.id, connectionId),
          eq(hermesProviderConnections.tenantId, tenantId),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
      return row;
    });
  },

  async findWorkerById({ tenantId, workerId }) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return row ?? null;
  },

  async findOwnedOnlineWorkers({ tenantId, userId }) {
    const db = getDb();
    const rows = await db
      .select()
      .from(workers)
      .where(and(
        eq(workers.tenantId, tenantId),
        eq(workers.registeredByUserId, userId),
        eq(workers.status, "online"),
      ));
    const now = new Date();
    return rows.filter((row) => isWorkerOnline(row, now));
  },

  async insertWorkerJob(values) {
    const db = getDb();
    const [row] = await db.insert(workerJobs).values(values).returning();
    return row;
  },

  async findLatestControlJob({ tenantId, connectionId, jobType }) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workerJobs)
      .where(and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.jobType, jobType),
        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
      ))
      .orderBy(desc(workerJobs.createdAt))
      .limit(1);
    return row ?? null;
  },

  async findJobEvents({ jobId, eventType }) {
    const db = getDb();
    const conditions = [eq(workerJobEvents.workerJobId, jobId)];
    if (eventType) conditions.push(eq(workerJobEvents.eventType, eventType));
    return db
      .select()
      .from(workerJobEvents)
      .where(and(...conditions))
      .orderBy(desc(workerJobEvents.createdAt));
  },
};

function resolveDeps(deps: HermesConnectionDeps) {
  return {
    repo: deps.repo ?? defaultHermesConnectionRepo,
    settings: deps.settings ?? { getHermesWorkerSettings },
    flags: deps.flags ?? { getTenantFeatureFlags },
    now: deps.now ?? (() => new Date()),
  };
}

async function readSettingsFailClosed(settingsDeps: HermesConnectionSettingsDeps): Promise<HermesWorkerSettings | null> {
  try {
    return await settingsDeps.getHermesWorkerSettings();
  } catch {
    return null;
  }
}

async function readTenantFlagsFailClosed(
  flagsDeps: HermesConnectionFlagsDeps,
  tenantId: string,
): Promise<TenantFeatureFlags | null> {
  try {
    return await flagsDeps.getTenantFeatureFlags(tenantId);
  } catch {
    return null;
  }
}

function scopeFlagFrom(settings: HermesWorkerSettings, scope: HermesConnectionScope): boolean {
  if (scope === "server_shared") return settings.sharedPoolEnabled;
  if (scope === "server_personal") return settings.serverPersonalEnabled;
  return settings.privateEnabled;
}

// ────────────────────────────────────────────────────────────────────────
// listConnections / getConnection
// ────────────────────────────────────────────────────────────────────────

export async function listHermesConnections(
  params: { tenantId: string; userId: number; assetType?: "image" | "video" },
  deps: HermesConnectionDeps = {},
): Promise<SafeHermesConnection[]> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const rows = await resolved.repo.findConnections({ tenantId, userId: params.userId });
  const visible = rows.filter((row) => row.scope === "server_shared" || row.ownerUserId === params.userId);
  const nowDate = resolved.now();

  const results: SafeHermesConnection[] = [];
  for (const row of visible) {
    if (params.assetType && row.capabilitiesJson && !isAssetTypeEnabledInManifest(row.capabilitiesJson, params.assetType)) {
      continue;
    }
    const worker = row.assignedWorkerId
      ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
      : null;
    results.push(toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)));
  }
  return results;
}

export async function getHermesConnection(
  params: { tenantId: string; userId: number; connectionId: string },
  deps: HermesConnectionDeps = {},
): Promise<SafeHermesConnection & { capabilities: HermesConnectionCapabilityManifest | null }> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  assertReadable(row, params.userId);
  const nowDate = resolved.now();
  const worker = row.assignedWorkerId
    ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
    : null;
  return {
    ...toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)),
    capabilities: row.capabilitiesJson ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// getHermesAvailability
// ────────────────────────────────────────────────────────────────────────

export async function getHermesAvailability(
  params: { tenantId: string },
  deps: HermesConnectionDeps = {},
): Promise<{
  enabled: boolean;
  platformEnabled: boolean;
  tenantEnabled: boolean;
  videoEnabled: boolean;
  scopes: { serverShared: boolean; serverPersonal: boolean; privateWorker: boolean };
  serverWorker: {
    configured: boolean;
    online: boolean;
    ready: boolean;
    status: Worker["status"] | null;
    lastSeenAt: string | null;
    hermesVersion: string | null;
    reason: "not_configured" | "not_found" | "offline" | "capability_unavailable" | null;
    detail: string | null;
  };
}> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const settings = await readSettingsFailClosed(resolved.settings);
  const tenantFlags = await readTenantFlagsFailClosed(resolved.flags, tenantId);

  const platformEnabled = Boolean(settings?.enabled);
  const tenantEnabled = Boolean(tenantFlags?.hermesMediaWorker);
  const enabled = platformEnabled && tenantEnabled;
  const videoEnabled = enabled && Boolean(settings?.videoEnabled);
  const sharedWorkerId = settings?.sharedWorkerId ?? null;
  const sharedWorker = sharedWorkerId
    ? await resolved.repo.findWorkerById({ tenantId, workerId: sharedWorkerId }).catch(() => null)
    : null;
  const serverWorkerOnline = isWorkerOnline(sharedWorker, resolved.now());
  const serverWorkerCapability = getHermesMediaCapability(sharedWorker);
  const serverWorkerReady = isHermesMediaWorkerReady(sharedWorker, resolved.now());
  const serverWorkerReason = !sharedWorkerId
    ? "not_configured" as const
    : !sharedWorker
      ? "not_found" as const
      : !serverWorkerOnline
        ? "offline" as const
        : !serverWorkerReady
          ? "capability_unavailable" as const
          : null;

  return {
    enabled,
    platformEnabled,
    tenantEnabled,
    videoEnabled,
    scopes: {
      serverShared: enabled && serverWorkerReady && Boolean(settings?.sharedPoolEnabled),
      serverPersonal: enabled && serverWorkerReady && Boolean(settings?.serverPersonalEnabled),
      privateWorker: enabled && Boolean(settings?.privateEnabled),
    },
    serverWorker: {
      configured: Boolean(sharedWorkerId),
      online: serverWorkerOnline,
      ready: serverWorkerReady,
      status: sharedWorker?.status ?? null,
      lastSeenAt: sharedWorker?.lastSeenAt ? new Date(sharedWorker.lastSeenAt).toISOString() : null,
      hermesVersion: serverWorkerCapability.hermesVersion,
      reason: serverWorkerReason,
      detail: serverWorkerCapability.reason,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// startHermesConnect
// ────────────────────────────────────────────────────────────────────────

async function resolveTargetWorker(input: {
  scope: HermesConnectionScope;
  workerId: string | undefined;
  userId: number;
  tenantId: string;
  repo: HermesConnectionRepo;
  settings: HermesWorkerSettings;
  now: Date;
}): Promise<Worker> {
  if (input.scope === "private_worker") {
    if (input.workerId) {
      const worker = await input.repo.findWorkerById({ tenantId: input.tenantId, workerId: input.workerId });
      if (!worker || worker.registeredByUserId !== input.userId) {
        throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "worker not owned by caller");
      }
      if (!isWorkerOnline(worker, input.now)) {
        throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "worker offline");
      }
      if (!isHermesMediaWorkerReady(worker, input.now)) {
        throw hermesTypedError(
          "HERMES_WORKER_UNAVAILABLE",
          "PRECONDITION_FAILED",
          "worker Hermes capability unavailable",
        );
      }
      return worker;
    }
    const owned = await input.repo.findOwnedOnlineWorkers({ tenantId: input.tenantId, userId: input.userId });
    if (owned.length !== 1 || !isHermesMediaWorkerReady(owned[0], input.now)) {
      throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no unambiguous eligible worker");
    }
    return owned[0];
  }

  // server_shared / server_personal — discovery ONLY via the
  // `hermes_shared_worker_id` setting. Never inferred from runtimeType.
  const sharedWorkerId = input.settings.sharedWorkerId;
  if (!sharedWorkerId) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no shared worker configured");
  }
  const worker = await input.repo.findWorkerById({ tenantId: input.tenantId, workerId: sharedWorkerId });
  if (!worker || !isWorkerOnline(worker, input.now)) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "shared worker offline");
  }
  if (!isHermesMediaWorkerReady(worker, input.now)) {
    throw hermesTypedError(
      "HERMES_WORKER_UNAVAILABLE",
      "PRECONDITION_FAILED",
      "shared worker Hermes capability unavailable",
    );
  }
  return worker;
}

export async function startHermesConnect(
  params: {
    tenantId: string;
    userId: number;
    isAdmin: boolean;
    scope: HermesConnectionScope;
    workerId?: string;
    label?: string;
    consentAcknowledged: boolean;
  },
  deps: HermesConnectionDeps = {},
): Promise<{ connectionId: string }> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const nowDate = resolved.now();

  const settings = await readSettingsFailClosed(resolved.settings);
  if (!settings || !settings.enabled || !scopeFlagFrom(settings, params.scope)) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }
  const tenantFlags = await readTenantFlagsFailClosed(resolved.flags, tenantId);
  if (!tenantFlags || !tenantFlags.hermesMediaWorker) {
    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
  }

  if (params.scope === "server_shared" && !params.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins may create a server_shared Hermes connection",
    });
  }

  if (!params.consentAcknowledged) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Data-transfer consent must be acknowledged before connecting",
    });
  }

  const existingRows = await resolved.repo.findConnections({
    tenantId,
    userId: params.userId,
  });
  const requestedWorkerId = params.workerId
    ?? (params.scope === "private_worker" ? null : settings.sharedWorkerId);

  // Only a connection whose OAuth session remains usable is idempotently
  // reusable. `reauth_required` must continue below and create a fresh
  // device-code job; returning it here makes the Reconnect button a no-op.
  const reusableActiveConnection = existingRows
    .filter((row) =>
      (row.status === "authorized" || row.status === "entitlement_restricted")
      && row.scope === params.scope
      && (
        params.scope === "server_shared"
          ? true
          : row.ownerUserId === params.userId
      )
      && (!requestedWorkerId || row.assignedWorkerId === requestedWorkerId)
    )
    .sort((left, right) =>
      (right.authorizedAt?.getTime() ?? right.createdAt.getTime())
      - (left.authorizedAt?.getTime() ?? left.createdAt.getTime())
    )[0];
  if (reusableActiveConnection) {
    return { connectionId: reusableActiveConnection.id };
  }

  // A connect attempt is durable server state. Repeated clicks, multiple
  // tabs, or a page reload must resume the same non-terminal attempt instead
  // of creating another pending row and another queued authorize job.
  const pendingRows = existingRows.filter((row) =>
    row.status === "pending"
    && row.scope === params.scope
    && (
      params.scope === "server_shared"
        ? true
        : row.ownerUserId === params.userId
    )
    && (!requestedWorkerId || row.assignedWorkerId === requestedWorkerId)
  );
  const reusableAttempts = (
    await Promise.all(pendingRows.map(async (row) => ({
      row,
      job: await resolved.repo.findLatestControlJob({
        tenantId,
        connectionId: row.id,
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
      }),
    })))
  )
    .filter((attempt) => attempt.job && !isTerminalWorkerJobStatus(attempt.job.status))
    .sort((left, right) => {
      const leftActive = left.job?.status === "queued" ? 1 : 0;
      const rightActive = right.job?.status === "queued" ? 1 : 0;
      if (leftActive !== rightActive) return leftActive - rightActive;
      return left.row.createdAt.getTime() - right.row.createdAt.getTime();
    });
  if (reusableAttempts[0]) {
    return { connectionId: reusableAttempts[0].row.id };
  }

  const worker = await resolveTargetWorker({
    scope: params.scope,
    workerId: params.workerId,
    userId: params.userId,
    tenantId,
    repo: resolved.repo,
    settings,
    now: nowDate,
  });

  const reconnectableConnection = existingRows
    .filter((row) =>
      (row.status === "reauth_required" || row.status === "error")
      && row.scope === params.scope
      && (
        params.scope === "server_shared"
          ? true
          : row.ownerUserId === params.userId
      )
      && (!requestedWorkerId || row.assignedWorkerId === requestedWorkerId)
    )
    .sort((left, right) =>
      (right.authorizedAt?.getTime() ?? right.createdAt.getTime())
      - (left.authorizedAt?.getTime() ?? left.createdAt.getTime())
    )[0];

  if (reconnectableConnection) {
    const metadataJson = { ...(reconnectableConnection.metadataJson ?? {}) };
    delete metadataJson.lastError;
    const restarted = await resolved.repo.restartConnectionWithJob({
      tenantId,
      connectionId: reconnectableConnection.id,
      expectedStatuses: ["reauth_required", "error"],
      connectionValues: {
        status: "pending",
        assignedWorkerId: worker.id,
        entitlementStatus: null,
        metadataJson: {
          ...metadataJson,
          consentAcknowledgedAt: nowDate.toISOString(),
          consentUserId: params.userId,
        },
      },
      job: buildAuthorizeJobInsert({
        tenantId,
        connectionId: reconnectableConnection.id,
        workerId: worker.id,
        runtimeType: worker.runtimeType,
        requestedByUserId: params.userId,
        profileReference: reconnectableConnection.profileReference,
      }),
    });
    // A concurrent click may have won the conditional update. Both callers
    // resume the same durable connection instead of creating duplicates.
    return { connectionId: restarted?.connection.id ?? reconnectableConnection.id };
  }

  const connectionId = randomUUID();
  const profileReference = `conn_${connectionId}`;

  // Atomic: insert the connection row and its authorize job in ONE DB
  // transaction (default impl) so a crash mid-sequence can never leave a
  // `pending` connection with no in-flight authorize job.
  const { connection } = await resolved.repo.insertConnectionWithJob({
    connection: {
      id: connectionId,
      tenantId,
      ownerUserId: params.userId,
      scope: params.scope,
      status: "pending",
      assignedWorkerId: worker.id,
      profileReference,
      accountLabel: params.label ?? null,
      metadataJson: {
        consentAcknowledgedAt: nowDate.toISOString(),
        consentUserId: params.userId,
      },
    },
    job: buildAuthorizeJobInsert({
      tenantId,
      connectionId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      requestedByUserId: params.userId,
      profileReference,
    }),
  });

  auditHermesConnectStarted({
    traceId: getTraceId(),
    userId: params.userId,
    tenantId,
    connectionId: connection.id,
    scope: params.scope,
  });

  return { connectionId: connection.id };
}

// ────────────────────────────────────────────────────────────────────────
// getHermesConnectStatus + settlement seam
// ────────────────────────────────────────────────────────────────────────

export async function getHermesConnectStatus(
  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
  deps: HermesConnectionDeps = {},
): Promise<{
  status: HermesConnectionStatus;
  verificationUrl?: string;
  userCode?: string;
  expiresAt?: string;
  errorCode?: HermesMediaErrorCode;
  jobStatus?: string;
  stage?: string;
  startedAt?: string;
  timeoutSeconds?: number;
  elapsedSeconds?: number;
}> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  let row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);

  const job = await resolved.repo.findLatestControlJob({
    tenantId,
    connectionId: row.id,
    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
  });

  let verificationUrl: string | undefined;
  let userCode: string | undefined;
  let expiresAt: string | undefined;
  let eventErrorCode: HermesMediaErrorCode | undefined;
  let jobStatus: string | undefined;
  let stage: string | undefined;
  let startedAt: string | undefined;
  let timeoutSeconds: number | undefined;
  let elapsedSeconds: number | undefined;

  if (job) {
    jobStatus = job.status;
    const jobOutput = (job.outputJson ?? {}) as Record<string, unknown>;
    const lastEventPayload = (
      jobOutput.lastEventPayload && typeof jobOutput.lastEventPayload === "object"
        ? jobOutput.lastEventPayload
        : {}
    ) as Record<string, unknown>;
    stage = typeof lastEventPayload.stage === "string"
      ? lastEventPayload.stage
      : typeof jobOutput.lastEventType === "string"
        ? jobOutput.lastEventType
        : undefined;
    if (job.startedAt) {
      const parsedStartedAt = new Date(job.startedAt);
      if (!Number.isNaN(parsedStartedAt.getTime())) {
        startedAt = parsedStartedAt.toISOString();
        elapsedSeconds = Math.max(
          0,
          Math.floor((resolved.now().getTime() - parsedStartedAt.getTime()) / 1000),
        );
      }
    }
    timeoutSeconds = typeof job.timeoutSeconds === "number" ? job.timeoutSeconds : undefined;

    // Never log the device code / user code — only connectionId/jobId may
    // appear in structured logs elsewhere in this feature.
    const events = await resolved.repo.findJobEvents({ jobId: job.id, eventType: "hermes_device_code" });
    const deviceEvent = events[0];
    if (deviceEvent) {
      const payload = (deviceEvent.payloadJson ?? {}) as Record<string, unknown>;
      verificationUrl = typeof payload.verificationUrl === "string" ? payload.verificationUrl : undefined;
      userCode = typeof payload.userCode === "string" ? payload.userCode : undefined;
      expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;
      // Worker App <= 0.1.132 could latch the URL-only first line as a
      // raw-only event. Never expose that OAuth output; surface a recoverable
      // error so the UI stops polling instead of hanging forever.
      if ((!verificationUrl || !userCode) && typeof payload.raw === "string") {
        eventErrorCode = "HERMES_PROCESS_FAILED";
      }
    }

    if (isTerminalWorkerJobStatus(job.status)) {
      await settleHermesConnectionFromControlJob(
        {
          connectionId: row.id,
          job: {
            // Section-04 carry-forward item B (defense-in-depth): this
            // lookup is already tenant-scoped above, but pass tenantId
            // through anyway so the seam's own tenant check applies
            // uniformly regardless of call site.
            tenantId,
            jobType: job.jobType,
            status: job.status,
            failureReason: job.failureReason ?? undefined,
            outputJson: job.outputJson ?? undefined,
          },
        },
        { repo: resolved.repo, now: resolved.now },
      );
      row = (await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId })) ?? row;
    }
  }

  const lastError = (row.metadataJson as Record<string, unknown> | null | undefined)?.lastError;
  const errorCode = typeof lastError === "string" && (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(lastError)
    ? (lastError as HermesMediaErrorCode)
    : eventErrorCode;

  return {
    status: row.status,
    verificationUrl,
    userCode,
    expiresAt,
    errorCode,
    jobStatus,
    stage,
    startedAt,
    timeoutSeconds,
    elapsedSeconds,
  };
}

/**
 * Lazy settlement seam. Called from `getConnectStatus` above; section-04's
 * proactive completion hook and 60s terminal-state sweep will call this
 * SAME function directly once a control job reaches a terminal state — do
 * NOT duplicate this mapping logic elsewhere.
 *
 * Idempotent: a connection row that has already left the expected
 * pre-settlement state (e.g. `pending` for an authorize job, or already
 * `disconnected` for a disconnect job) is left untouched.
 */
export async function settleHermesConnectionFromControlJob(
  params: {
    connectionId: string;
    job: {
      /** Section-04 carry-forward item B (defense-in-depth): when a caller
       *  (the sweep / completion hook) supplies the job's tenantId, this
       *  seam refuses to settle a connection row belonging to a different
       *  tenant — guards against a corrupted/forged job row driving a
       *  cross-tenant connection-status mutation. Optional so existing
       *  call sites that don't pass it are unaffected. */
      tenantId?: string;
      jobType: string;
      status: string;
      failureReason?: string;
      outputJson?: Record<string, unknown> | null;
    };
  },
  deps: { repo?: HermesConnectionRepo; now?: () => Date } = {},
): Promise<void> {
  const repo = deps.repo ?? defaultHermesConnectionRepo;
  const now = deps.now ?? (() => new Date());
  const nowDate = now();

  const row = await repo.findConnectionById({ connectionId: params.connectionId });
  if (!row) return;
  if (params.job.tenantId !== undefined && params.job.tenantId !== row.tenantId) return;

  const isSuccess = params.job.status === "completed";
  const isFailure = TERMINAL_FAILURE_STATUSES.has(params.job.status);
  if (!isSuccess && !isFailure) return;

  const output = params.job.outputJson ?? {};
  // Worker event aggregation stores the terminal handler payload under
  // `lastEventPayload`; direct/unit callers may still provide the legacy
  // top-level shape. Accept both so successful probes actually persist the
  // capability manifest used by the UI and media scheduler.
  const terminalPayload = output.lastEventPayload && typeof output.lastEventPayload === "object"
    ? output.lastEventPayload as Record<string, unknown>
    : {};
  const outputValue = (key: string): unknown => output[key] ?? terminalPayload[key];

  if (params.job.jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) {
    if (row.status !== "pending") return; // already settled — idempotent no-op
    if (isSuccess) {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "authorized",
          authorizedAt: nowDate,
          accountHint: typeof outputValue("accountHint") === "string"
            ? outputValue("accountHint") as string
            : row.accountHint,
          capabilitiesJson: (outputValue("capabilities") as HermesConnectionCapabilityManifest | undefined)
            ?? row.capabilitiesJson,
        },
      });
      auditHermesConnectionAuthorized({
        userId: row.ownerUserId,
        tenantId: row.tenantId,
        connectionId: row.id,
        scope: row.scope,
      });
    } else {
      const reason = mapAuthFailureReasonToErrorCode({ status: params.job.status, failureReason: params.job.failureReason });
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "error",
          metadataJson: { ...(row.metadataJson ?? {}), lastError: reason },
        },
      });
      // Code review FIX 4 — a failed FIRST authorize attempt is, from an
      // operator's perspective, the same "this connection requires user
      // action to fix" signal as a later reauth_required demotion, even
      // though the row's `status` column lands on the distinct "error"
      // value here (never-yet-authorized) rather than "reauth_required"
      // (previously-authorized, now invalidated). Previously this branch
      // mutated connection state with NO audit event at all — the most
      // common real-world connection break (an admin debugging "why did
      // this stop working") had nothing to find.
      auditHermesConnectionReauthRequired({
        userId: row.ownerUserId,
        tenantId: row.tenantId,
        connectionId: row.id,
        scope: row.scope,
      });
    }
    return;
  }

  if (params.job.jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) {
    if (row.status === "disconnected") return; // already settled — idempotent no-op
    if (isSuccess) {
      if (outputValue("entitlementRestricted") === true) {
        await repo.updateConnection({
          connectionId: row.id,
          values: {
            status: "entitlement_restricted",
            entitlementStatus: typeof outputValue("entitlementStatus") === "string"
              ? outputValue("entitlementStatus") as string
              : "restricted",
            lastProbeAt: nowDate,
          },
        });
        auditHermesConnectionEntitlementRestricted({
          userId: row.ownerUserId,
          tenantId: row.tenantId,
          connectionId: row.id,
          scope: row.scope,
        });
        return;
      }
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "authorized",
          entitlementStatus: null,
          capabilitiesJson: (outputValue("capabilities") as HermesConnectionCapabilityManifest | undefined)
            ?? row.capabilitiesJson,
          lastProbeAt: nowDate,
          metadataJson: Object.fromEntries(
            Object.entries(row.metadataJson ?? {}).filter(([key]) => key !== "lastError"),
          ),
        },
      });
      return;
    }

    // Terminal-failure probe: this is meaningful signal, NOT a silent
    // no-op — otherwise `reauth_required` + `HERMES_REAUTH_REQUIRED` are
    // dead states that no code path ever reaches.
    const classification = classifyProbeFailureReason({
      status: params.job.status,
      failureReason: params.job.failureReason,
    });
    // Feature 135 §6.1 — a failed probe can still carry a manifest (e.g.
    // the auth-status/tools/version steps succeeded but the OPTIONAL
    // generation-liveness sub-step is what actually failed) — preserve it
    // (with `lastGenerationTest` recorded) instead of dropping it just
    // because the overall job is classified a failure. Falls back to the
    // row's existing manifest when the job output carries none.
    const capabilitiesFromFailure =
      (outputValue("capabilities") as HermesConnectionCapabilityManifest | undefined) ?? row.capabilitiesJson;
    if (classification.outcome === "entitlement_restricted") {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "entitlement_restricted",
          entitlementStatus: "restricted",
          lastProbeAt: nowDate,
          capabilitiesJson: capabilitiesFromFailure,
          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
        },
      });
      auditHermesConnectionEntitlementRestricted({
        userId: row.ownerUserId,
        tenantId: row.tenantId,
        connectionId: row.id,
        scope: row.scope,
      });
      return;
    }
    if (classification.outcome === "reauth_required") {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "reauth_required",
          capabilitiesJson: capabilitiesFromFailure,
          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
        },
      });
      // Code review FIX 4 — the actual most-common provider-side
      // revocation signal (an expired/invalidated OAuth session detected
      // by a probe) previously mutated the connection's status with NO
      // audit event at all.
      auditHermesConnectionReauthRequired({
        userId: row.ownerUserId,
        tenantId: row.tenantId,
        connectionId: row.id,
        scope: row.scope,
      });
      return;
    }
    // Other probe failures: record the typed reason but leave `status`
    // untouched — a transient probe error should not demote an otherwise
    // healthy connection.
    await repo.updateConnection({
      connectionId: row.id,
      values: {
        capabilitiesJson: capabilitiesFromFailure,
        metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
      },
    });
    return;
  }

  if (params.job.jobType === HERMES_CONNECTION_DISCONNECT_JOB_TYPE) {
    if (row.status === "disconnected") return; // already settled — idempotent no-op
    if (isSuccess) {
      await repo.updateConnection({
        connectionId: row.id,
        values: { status: "disconnected", disconnectedAt: nowDate },
      });
      auditHermesConnectionDisconnected({
        userId: row.ownerUserId,
        tenantId: row.tenantId,
        connectionId: row.id,
        scope: row.scope,
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// setDefault / disconnect / probe
// ────────────────────────────────────────────────────────────────────────

export async function setHermesDefaultConnection(
  params: { tenantId: string; userId: number; connectionId: string; assetType: "image" | "video" },
  deps: HermesConnectionDeps = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  // Strict ownership regardless of scope — a `server_shared` connection's
  // default flags belong to its creating owner only (see
  // `assertOwnerRegardlessOfScope`'s doc comment).
  assertOwnerRegardlessOfScope(row, params.userId);

  if (!DEFAULT_ELIGIBLE_STATUSES.has(row.status)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This Hermes connection is not eligible to be set as a default",
    });
  }

  // Atomic clear-then-set (ONE DB transaction in the default impl) so the
  // partial-unique index on (tenantId, ownerUserId) among eligible
  // statuses can never observe an intermediate two-defaults state.
  await resolved.repo.setDefaultAtomic({
    tenantId,
    userId: params.userId,
    connectionId: row.id,
    assetType: params.assetType,
  });
}

export async function disconnectHermesConnection(
  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
  deps: HermesConnectionDeps = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);

  if (row.scope === "server_shared" && !params.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins may disconnect a server_shared Hermes connection",
    });
  }

  if (!row.assignedWorkerId) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
  }
  const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
  if (!worker) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker not found");
  }

  const nowDate = resolved.now();
  await resolved.repo.updateConnection({
    tenantId,
    connectionId: row.id,
    values: {
      metadataJson: { ...(row.metadataJson ?? {}), disconnectRequestedAt: nowDate.toISOString() },
    },
  });

  await resolved.repo.insertWorkerJob(buildDisconnectJobInsert({
    tenantId,
    connectionId: row.id,
    workerId: row.assignedWorkerId,
    runtimeType: worker.runtimeType,
    requestedByUserId: params.userId,
    profileReference: row.profileReference,
  }));
}

/** Feature 135 §6.1 — a live generation test burns real Grok quota; cap it
 *  to one attempt per connection per this window. */
export const HERMES_GENERATION_TEST_COOLDOWN_MS = 5 * 60 * 1000;

function readLastGenerationTestAt(metadataJson: unknown): number | null {
  const value = (metadataJson as Record<string, unknown> | null | undefined)?.lastGenerationTestAt;
  if (typeof value !== "string") return null;
  const parsedMs = Date.parse(value);
  return Number.isFinite(parsedMs) ? parsedMs : null;
}

export async function probeHermesConnection(
  params: {
    tenantId: string;
    userId: number;
    isAdmin: boolean;
    connectionId: string;
    /** Feature 135 §6.1 — optional live "test generation" liveness check
     *  (spec §6.1 UI affordance), appended to this same probe job. */
    testGeneration?: "image" | "video";
  },
  deps: HermesConnectionDeps = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);

  // Consistent with `disconnectHermesConnection`: mutating a server_shared
  // connection (even a lighter-weight probe) requires admin, not merely
  // ownership visibility.
  if (row.scope === "server_shared" && !params.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins may probe a server_shared Hermes connection",
    });
  }

  if (params.testGeneration) {
    if (params.testGeneration === "video") {
      const settings = await readSettingsFailClosed(resolved.settings);
      if (!settings || !settings.videoEnabled) {
        throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN", "video test generation is disabled");
      }
    }

    // Cost/abuse guard — a live test burns real Grok quota. One test per
    // connection per `HERMES_GENERATION_TEST_COOLDOWN_MS` (5 minutes).
    const lastAtMs = readLastGenerationTestAt(row.metadataJson);
    const nowMsForCooldown = resolved.now().getTime();
    if (lastAtMs !== null) {
      const elapsedMs = nowMsForCooldown - lastAtMs;
      if (elapsedMs < HERMES_GENERATION_TEST_COOLDOWN_MS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((HERMES_GENERATION_TEST_COOLDOWN_MS - elapsedMs) / 1000));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: formatHermesErrorMessage("HERMES_RATE_LIMITED", "test generation cooldown active"),
          cause: { retryAfterSeconds },
        });
      }
    }
  }

  if (!row.assignedWorkerId) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
  }
  const nowDate = resolved.now();
  const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
  if (!worker || !isWorkerOnline(worker, nowDate)) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker offline");
  }

  if (params.testGeneration) {
    // Record the cooldown marker BEFORE enqueueing — a burst of concurrent
    // probe calls (e.g. a double-click) must not all slip through before
    // any of them lands the marker. Best-effort: a failure here must not
    // block the probe itself.
    await resolved.repo.updateConnection({
      tenantId,
      connectionId: row.id,
      values: {
        metadataJson: { ...(row.metadataJson ?? {}), lastGenerationTestAt: nowDate.toISOString() },
      },
    }).catch(() => {});
  }

  await resolved.repo.insertWorkerJob(buildProbeJobInsert({
    tenantId,
    connectionId: row.id,
    workerId: row.assignedWorkerId,
    runtimeType: worker.runtimeType,
    requestedByUserId: params.userId,
    profileReference: row.profileReference,
    testGeneration: params.testGeneration,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// Admin ops
// ────────────────────────────────────────────────────────────────────────

export async function adminListHermesConnections(
  params: { tenantId: string },
  deps: HermesConnectionDeps = {},
): Promise<SafeHermesConnection[]> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const rows = await resolved.repo.findConnections({ tenantId, userId: -1 });
  const nowDate = resolved.now();
  const results: SafeHermesConnection[] = [];
  for (const row of rows) {
    const worker = row.assignedWorkerId
      ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
      : null;
    results.push(toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)));
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────
// getHermesAdminOverview (Feature 135 section 12)
// ────────────────────────────────────────────────────────────────────────

const HERMES_ADMIN_OVERVIEW_JOB_TYPES = [HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE] as const;
const HERMES_ADMIN_OVERVIEW_TERMINAL_STATUSES = ["completed", "failed", "canceled", "expired"] as const;
const HERMES_ADMIN_OVERVIEW_SCOPE_ORDER: HermesConnectionScope[] = [
  "server_shared",
  "server_personal",
  "private_worker",
];

/** Non-terminal `hermes_media_*` `worker_jobs` count for one connection —
 *  the same "queue depth" shape the scheduler's auto-pick uses, but
 *  counting every non-terminal status (not just `queued`). */
async function defaultCountNonTerminalHermesJobsForConnection(connectionId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workerJobs)
    .where(and(
      inArray(workerJobs.jobType, [...HERMES_ADMIN_OVERVIEW_JOB_TYPES]),
      notInArray(workerJobs.status, [...HERMES_ADMIN_OVERVIEW_TERMINAL_STATUSES]),
      sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
    ));
  return row?.count ?? 0;
}

export interface HermesAdminOverviewConnectionEntry extends SafeHermesConnection {
  usedToday: number;
  queueDepth: number;
}

export interface HermesAdminOverviewScopeGroup {
  scope: HermesConnectionScope;
  connections: HermesAdminOverviewConnectionEntry[];
}

/** Typed values only — NEVER a raw `system_settings` dump. */
export interface HermesAdminOverviewSettingsSnapshot {
  hermesWorkerEnabled: boolean;
  sharedPoolEnabled: boolean;
  serverPersonalEnabled: boolean;
  privateEnabled: boolean;
  videoEnabled: boolean;
  sharedPoolFeeCredits: number;
  minHermesVersion: string;
}

export interface HermesAdminOverview {
  scopes: HermesAdminOverviewScopeGroup[];
  settings: HermesAdminOverviewSettingsSnapshot;
}

export interface HermesAdminOverviewDeps extends HermesConnectionDeps {
  getQueueDepth?(connectionId: string): Promise<number>;
  getUsedToday?(connectionId: string, dateKey: string): Promise<number>;
}

/**
 * Composes section-03's `adminListHermesConnections` with per-connection
 * `usedToday` (the section-05 daily quota counter — read only, never
 * incremented here) and `queueDepth` (non-terminal `worker_jobs` count),
 * plus a settings snapshot from `getHermesWorkerSettings()`. Backs the
 * `hermesConnections.adminOverview` router procedure.
 */
export async function getHermesAdminOverview(
  params: { tenantId: string },
  deps: HermesAdminOverviewDeps = {},
): Promise<HermesAdminOverview> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const getQueueDepth = deps.getQueueDepth ?? defaultCountNonTerminalHermesJobsForConnection;
  const getUsedToday = deps.getUsedToday ?? defaultHermesAdmissionCounters.getDailyQuotaUsage;

  const connections = await adminListHermesConnections({ tenantId }, deps);
  const dateKey = resolved.now().toISOString().slice(0, 10);

  const grouped = new Map<HermesConnectionScope, HermesAdminOverviewConnectionEntry[]>(
    HERMES_ADMIN_OVERVIEW_SCOPE_ORDER.map((scope) => [scope, []]),
  );

  for (const connection of connections) {
    const [usedToday, queueDepth] = await Promise.all([
      getUsedToday(connection.id, dateKey),
      getQueueDepth(connection.id),
    ]);
    const bucket = grouped.get(connection.scope) ?? [];
    bucket.push({ ...connection, usedToday, queueDepth });
    grouped.set(connection.scope, bucket);
  }

  const settings = await resolved.settings.getHermesWorkerSettings();

  return {
    scopes: HERMES_ADMIN_OVERVIEW_SCOPE_ORDER.map((scope) => ({
      scope,
      connections: grouped.get(scope) ?? [],
    })),
    settings: {
      hermesWorkerEnabled: settings.enabled,
      sharedPoolEnabled: settings.sharedPoolEnabled,
      serverPersonalEnabled: settings.serverPersonalEnabled,
      privateEnabled: settings.privateEnabled,
      videoEnabled: settings.videoEnabled,
      sharedPoolFeeCredits: settings.sharedPoolFeeCredits,
      minHermesVersion: settings.minHermesVersion,
    },
  };
}

export async function adminSetHermesQuota(
  params: { tenantId: string; connectionId: string; dailyJobQuota: number | null },
  deps: HermesConnectionDeps = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
  if (row.scope !== "server_shared") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Daily job quota can only be set on server_shared Hermes connections",
    });
  }
  await resolved.repo.updateConnection({
    tenantId,
    connectionId: row.id,
    values: { dailyJobQuota: params.dailyJobQuota },
  });
}

export async function adminDisableHermesConnection(
  params: { tenantId: string; connectionId: string },
  deps: HermesConnectionDeps = {},
): Promise<void> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });

  const nowDate = resolved.now();
  await resolved.repo.updateConnection({
    tenantId,
    connectionId: row.id,
    values: {
      status: "disconnected",
      disconnectedAt: nowDate,
      defaultForImage: false,
      defaultForVideo: false,
    },
  });

  if (row.assignedWorkerId) {
    const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
    if (worker && isWorkerOnline(worker, nowDate)) {
      await resolved.repo.insertWorkerJob(buildDisconnectJobInsert({
        tenantId,
        connectionId: row.id,
        workerId: row.assignedWorkerId,
        runtimeType: worker.runtimeType,
        requestedByUserId: null,
        profileReference: row.profileReference,
      }));
    }
  }

  // Admin-initiated forced disable — distinct from a self-service
  // `disconnectHermesConnection` (which completes via the settlement seam
  // above and emits `hermes_connection_disconnected`). This mutation is
  // synchronous and immediate regardless of whether a disconnect job could
  // be enqueued, so the audit event is emitted here directly.
  auditHermesConnectionRevoked({
    userId: row.ownerUserId,
    tenantId: row.tenantId,
    connectionId: row.id,
    scope: row.scope,
  });
}
