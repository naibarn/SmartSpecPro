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
import { and, desc, eq, ne, sql } from "drizzle-orm";
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
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  type WorkerRuntimeType,
} from "../../shared/workerRuntime";
import {
  formatHermesErrorMessage,
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
    return { probedAt: null, imageEnabled: false, videoEnabled: false, maxEditReferences: null };
  }
  return {
    probedAt: manifest.probedAt ?? null,
    imageEnabled: isAssetTypeEnabledInManifest(manifest, "image"),
    videoEnabled: isAssetTypeEnabledInManifest(manifest, "video"),
    maxEditReferences: manifest.operations?.["image.edit"]?.maxReferences ?? null,
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

function mapAuthFailureReasonToErrorCode(job: {
  status: string;
  failureReason?: string | null;
}): HermesMediaErrorCode {
  if (job.status === "expired") return "HERMES_TIMEOUT";
  const reason = (job.failureReason ?? "").toLowerCase();
  if (reason.includes("timeout") || reason.includes("timed out")) return "HERMES_TIMEOUT";
  if (reason.includes("denied") || reason.includes("declined")) return "HERMES_OAUTH_DENIED";
  if (reason.includes("expired")) return "HERMES_OAUTH_SESSION_EXPIRED";
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
  const reason = (job.failureReason ?? "").toLowerCase();
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

export function buildProbeJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
  return buildControlJobInsert(
    HERMES_CONNECTION_PROBE_JOB_TYPE,
    HERMES_CONNECTION_PROBE_TIMEOUT_SECONDS,
    params,
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
  videoEnabled: boolean;
  scopes: { serverShared: boolean; serverPersonal: boolean; privateWorker: boolean };
}> {
  const resolved = resolveDeps(deps);
  const tenantId = tenantRequired(params.tenantId);
  const settings = await readSettingsFailClosed(resolved.settings);
  const tenantFlags = await readTenantFlagsFailClosed(resolved.flags, tenantId);

  const enabled = Boolean(settings?.enabled) && Boolean(tenantFlags?.hermesMediaWorker);
  const videoEnabled = enabled && Boolean(settings?.videoEnabled);

  return {
    enabled,
    videoEnabled,
    scopes: {
      serverShared: enabled && Boolean(settings?.sharedPoolEnabled),
      serverPersonal: enabled && Boolean(settings?.serverPersonalEnabled),
      privateWorker: enabled && Boolean(settings?.privateEnabled),
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
      return worker;
    }
    const owned = await input.repo.findOwnedOnlineWorkers({ tenantId: input.tenantId, userId: input.userId });
    if (owned.length !== 1) {
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

  const worker = await resolveTargetWorker({
    scope: params.scope,
    workerId: params.workerId,
    userId: params.userId,
    tenantId,
    repo: resolved.repo,
    settings,
    now: nowDate,
  });

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

  if (job) {
    // Never log the device code / user code — only connectionId/jobId may
    // appear in structured logs elsewhere in this feature.
    const events = await resolved.repo.findJobEvents({ jobId: job.id, eventType: "hermes_device_code" });
    const deviceEvent = events[0];
    if (deviceEvent) {
      const payload = (deviceEvent.payloadJson ?? {}) as Record<string, unknown>;
      verificationUrl = typeof payload.verificationUrl === "string" ? payload.verificationUrl : undefined;
      userCode = typeof payload.userCode === "string" ? payload.userCode : undefined;
      expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;
    }

    if (isTerminalWorkerJobStatus(job.status)) {
      await settleHermesConnectionFromControlJob(
        {
          connectionId: row.id,
          job: {
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
    : undefined;

  return { status: row.status, verificationUrl, userCode, expiresAt, errorCode };
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

  const isSuccess = params.job.status === "completed";
  const isFailure = TERMINAL_FAILURE_STATUSES.has(params.job.status);
  if (!isSuccess && !isFailure) return;

  const output = params.job.outputJson ?? {};

  if (params.job.jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) {
    if (row.status !== "pending") return; // already settled — idempotent no-op
    if (isSuccess) {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "authorized",
          authorizedAt: nowDate,
          accountHint: typeof output.accountHint === "string" ? output.accountHint : row.accountHint,
          capabilitiesJson: (output.capabilities as HermesConnectionCapabilityManifest | undefined) ?? row.capabilitiesJson,
        },
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
    }
    return;
  }

  if (params.job.jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) {
    if (row.status === "disconnected") return; // already settled — idempotent no-op
    if (isSuccess) {
      if (output.entitlementRestricted === true) {
        await repo.updateConnection({
          connectionId: row.id,
          values: {
            status: "entitlement_restricted",
            entitlementStatus: typeof output.entitlementStatus === "string" ? output.entitlementStatus : "restricted",
            lastProbeAt: nowDate,
          },
        });
        return;
      }
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          capabilitiesJson: (output.capabilities as HermesConnectionCapabilityManifest | undefined) ?? row.capabilitiesJson,
          lastProbeAt: nowDate,
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
    if (classification.outcome === "entitlement_restricted") {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "entitlement_restricted",
          entitlementStatus: "restricted",
          lastProbeAt: nowDate,
          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
        },
      });
      return;
    }
    if (classification.outcome === "reauth_required") {
      await repo.updateConnection({
        connectionId: row.id,
        values: {
          status: "reauth_required",
          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
        },
      });
      return;
    }
    // Other probe failures: record the typed reason but leave `status`
    // untouched — a transient probe error should not demote an otherwise
    // healthy connection.
    await repo.updateConnection({
      connectionId: row.id,
      values: {
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

export async function probeHermesConnection(
  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
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

  if (!row.assignedWorkerId) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
  }
  const nowDate = resolved.now();
  const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
  if (!worker || !isWorkerOnline(worker, nowDate)) {
    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker offline");
  }

  await resolved.repo.insertWorkerJob(buildProbeJobInsert({
    tenantId,
    connectionId: row.id,
    workerId: row.assignedWorkerId,
    runtimeType: worker.runtimeType,
    requestedByUserId: params.userId,
    profileReference: row.profileReference,
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
}
