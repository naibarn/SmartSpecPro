import { and, desc, eq, gt, gte, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { LibraryContextPackResolveResult } from "../../shared/libraryContextPacks";
import { getDb } from "../db";
import {
  libraryContextPacks,
  libraryIndexJobs,
  libraryItems,
  libraryKnowledgeReleaseGateOverrides,
  libraryKnowledgeTelemetryEvents,
  libraryKnowledgeTelemetryRollups,
  libraryKnowledgeNotes,
  libraryKnowledgeRelations,
} from "../../drizzle/schema";
import {
  getKnowledgeVaultAccessPolicy,
  isKnowledgeVaultReleaseGateOverrideActive,
  type KnowledgeVaultReleaseGateOverrideMetadata,
} from "./libraryFeatureFlags";

export type LibraryKnowledgeRolloutPhase = "internal" | "canary" | "production";

export type LibraryKnowledgeReleaseGateStatus =
  | "pass"
  | "blocked"
  | "insufficient_data"
  | "overridden";

export type LibraryKnowledgeReleaseGateMetricSnapshot = {
  readableMarkdownBackfillCoveragePercent: number;
  staleCacheRatioPercent: number;
  saveToRefreshP95Ms: number;
  quickSwitchP95Ms: number;
  localGraphP95Ms: number;
  contextPackResolutionP95Ms: number;
  citationCoveragePercent: number;
  hiddenNoteLeakageCount: number;
  privateVaultLeakageCount: number;
  privateVaultBlockedCount: number;
  delegatedUnauthorizedResolveCount: number;
  unresolvedReferenceRatePercent: number;
  ambiguousReferenceRatePercent: number;
};

export type LibraryKnowledgeReleaseGateThresholds = {
  minReadableMarkdownBackfillCoveragePercent: number;
  maxStaleCacheRatioPercent: number;
  maxSaveToRefreshP95Ms: number;
  maxQuickSwitchP95Ms: number;
  maxLocalGraphP95Ms: number;
  maxContextPackResolutionP95Ms: number;
  minCitationCoveragePercent: number;
  maxHiddenNoteLeakageCount: number;
  maxPrivateVaultLeakageCount: number;
  maxDelegatedUnauthorizedResolveCount: number;
  maxUnresolvedReferenceRatePercent: number;
  maxAmbiguousReferenceRatePercent: number;
};

export type LibraryKnowledgeReleaseGateIssue = {
  check: string;
  severity: "blocker" | "warning" | "insufficient_data";
  metric: keyof LibraryKnowledgeReleaseGateMetricSnapshot | "metric_snapshot";
  actual: number | null;
  threshold: number | null;
  message: string;
};

export type LibraryKnowledgeReleaseGateSampleSnapshot = {
  refreshLatencySampleCount: number;
  quickSwitchSampleCount: number;
  graphSampleCount: number;
  contextPackResolutionSampleCount: number;
};

export type LibraryKnowledgeReleaseGateMinimumSamples =
  LibraryKnowledgeReleaseGateSampleSnapshot;

export type LibraryKnowledgeReleaseGateOverrideMode =
  | "standard"
  | "break_glass";

export type LibraryKnowledgeReleaseGateOverrideStatus =
  | "pending_approval"
  | "active"
  | "rejected"
  | "revoked"
  | "expired";

export type LibraryKnowledgeReleaseGateOverride = {
  id?: number;
  actorUserId: number | null;
  approvedByUserId: number | null;
  reason: string;
  scopeType: "tenant" | "global";
  scopeId: string | null;
  status?: LibraryKnowledgeReleaseGateOverrideStatus;
  mode?: LibraryKnowledgeReleaseGateOverrideMode;
  metadata?: Record<string, unknown>;
  approvedAt?: string | null;
  approvalReason?: string | null;
  rejectedAt?: string | null;
  rejectedByUserId?: number | null;
  rejectedReason?: string | null;
  createdAt: string;
  expiresAt: string;
};

export type LibraryKnowledgeReleaseGateResult = {
  status: LibraryKnowledgeReleaseGateStatus;
  phase: LibraryKnowledgeRolloutPhase;
  scopeType: "tenant" | "global";
  scopeId: string | null;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  evaluatedAt: string;
  metrics: LibraryKnowledgeReleaseGateMetricSnapshot;
  observed: LibraryKnowledgeReleaseGateSampleSnapshot;
  minimumSamples: LibraryKnowledgeReleaseGateMinimumSamples;
  thresholds: LibraryKnowledgeReleaseGateThresholds;
  override: LibraryKnowledgeReleaseGateOverride | null;
  failedChecks: string[];
  warningChecks: string[];
  issues: LibraryKnowledgeReleaseGateIssue[];
  summary: string;
};

export type LibraryContextPackResolutionMetric = {
  contextPackId: number;
  contextPackSlug: string;
  status: LibraryContextPackResolveResult["status"];
  latencyMs: number;
  itemCount: number;
  citedItemCount: number;
  citationCoveragePercent: number;
  diagnosticsCount: number;
};

export type LibraryKnowledgeLeakageProbeResult = {
  probeId: string;
  probeType:
    | "unreadable_backlink"
    | "private_vault_mention"
    | "revoked_graph_neighbor"
    | "revoked_context_pack_item"
    | "delegated_context_pack_without_grant";
  status: "blocked" | "leaked" | "not_applicable";
  tenantId: string;
  actorUserId?: number | null;
  blockedReason?: string | null;
  hiddenResourceRef?: string | null;
};

export type LibraryKnowledgeLatencySurface =
  | "quickSwitch"
  | "inspector"
  | "localGraph"
  | "contextPackResolution";

export type LibraryKnowledgeTelemetrySnapshot = {
  tenantId: string;
  generatedAt: string;
  surfaceLatency: Record<
    LibraryKnowledgeLatencySurface,
    {
      sampleCount: number;
      p95Ms: number;
      recentSamplesMs: number[];
    }
  >;
  counters: {
    hiddenNoteLeakageCount: number;
    privateVaultLeakageCount: number;
    privateVaultBlockedCount: number;
    delegatedUnauthorizedResolveCount: number;
    telemetryPersistenceFailureCount: number;
  };
  contextPackResolution: {
    sampleCount: number;
    citedItemCount: number;
    itemCount: number;
    citationCoveragePercent: number;
    recentSamples: LibraryContextPackResolutionMetric[];
  };
  leakageProbes: LibraryKnowledgeLeakageProbeResult[];
};

export type LibraryKnowledgeObservabilityReport = {
  tenantId: string;
  generatedAt: string;
  policy: ReturnType<typeof getKnowledgeVaultAccessPolicy>;
  metrics: LibraryKnowledgeReleaseGateMetricSnapshot;
  gate: LibraryKnowledgeReleaseGateResult;
  telemetry: LibraryKnowledgeTelemetrySnapshot;
  coverage: {
    readableMarkdownCount: number;
    indexedKnowledgeNoteCount: number;
    staleKnowledgeNoteCount: number;
  };
  relations: {
    total: number;
    unresolved: number;
    ambiguous: number;
  };
  contextPacks: {
    total: number;
    trusted: number;
    reviewPending: number;
    stale: number;
    approvedForAgents: number;
  };
};

export const defaultLibraryKnowledgeReleaseGateThresholds: LibraryKnowledgeReleaseGateThresholds = {
  minReadableMarkdownBackfillCoveragePercent: 99,
  maxStaleCacheRatioPercent: 5,
  maxSaveToRefreshP95Ms: 5_000,
  maxQuickSwitchP95Ms: 250,
  maxLocalGraphP95Ms: 400,
  maxContextPackResolutionP95Ms: 1_200,
  minCitationCoveragePercent: 100,
  maxHiddenNoteLeakageCount: 0,
  maxPrivateVaultLeakageCount: 0,
  maxDelegatedUnauthorizedResolveCount: 0,
  maxUnresolvedReferenceRatePercent: 2,
  maxAmbiguousReferenceRatePercent: 2,
};

export const defaultLibraryKnowledgeReleaseGateMinimumSamples: LibraryKnowledgeReleaseGateMinimumSamples = {
  refreshLatencySampleCount: 100,
  quickSwitchSampleCount: 100,
  graphSampleCount: 100,
  contextPackResolutionSampleCount: 25,
};

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type LibraryKnowledgeTelemetryBucket = {
  latencies: Record<LibraryKnowledgeLatencySurface, number[]>;
  latencySampleCounts: Record<LibraryKnowledgeLatencySurface, number>;
  counters: LibraryKnowledgeTelemetrySnapshot["counters"];
  contextPackResolutionSamples: LibraryContextPackResolutionMetric[];
  contextPackResolutionSampleCount: number;
  contextPackResolvedItemCount: number;
  contextPackCitedItemCount: number;
  leakageProbes: LibraryKnowledgeLeakageProbeResult[];
};

type PersistedLibraryKnowledgeTelemetryEvent = {
  eventType: string;
  surface: string | null;
  status: string | null;
  sampleCount: number;
  metricJson: Record<string, unknown>;
  createdAt: Date;
};

type PersistedLibraryKnowledgeTelemetryRollup = {
  id: number;
  eventType: string;
  surface: string | null;
  status: string | null;
  sampleCount: number;
  metricJson: Record<string, unknown>;
  windowStart: Date;
  windowEnd: Date;
  updatedAt: Date;
};

type PersistedLibraryKnowledgeReleaseGateOverride = {
  id: number;
  actorUserId: number | null;
  approvedByUserId: number | null;
  reason: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  overrideMode: string;
  metadata: Record<string, unknown>;
  approvedAt: Date | null;
  approvalReason: string | null;
  rejectedAt: Date | null;
  rejectedByUserId: number | null;
  rejectedReason: string | null;
  createdAt: Date;
  expiresAt: Date;
};

const MAX_LATENCY_SAMPLES = 200;
const MAX_CONTEXT_PACK_RESOLUTION_SAMPLES = 50;
const MAX_LEAKAGE_PROBES = 25;
const PERSISTED_TELEMETRY_PAGE_SIZE = 1_000;
const MAX_PERSISTED_TELEMETRY_ROWS_PER_REPORT = 100_000;
const STANDARD_RELEASE_GATE_OVERRIDE_MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const BREAK_GLASS_RELEASE_GATE_OVERRIDE_MAX_DURATION_MS = 4 * 60 * 60 * 1000;

const libraryKnowledgeTelemetryStore = new Map<
  string,
  LibraryKnowledgeTelemetryBucket
>();

function persistedOverrideToReleaseGateOverride(
  row: PersistedLibraryKnowledgeReleaseGateOverride,
  now = new Date(),
): LibraryKnowledgeReleaseGateOverride | null {
  if (row.scopeType !== "tenant" && row.scopeType !== "global") {
    return null;
  }
  if (row.overrideMode !== "standard" && row.overrideMode !== "break_glass") {
    return null;
  }

  const status = (
    row.expiresAt.getTime() <= now.getTime()
    && row.status !== "revoked"
    && row.status !== "rejected"
  )
    ? "expired"
    : row.status;
  if (
    status !== "pending_approval"
    && status !== "active"
    && status !== "rejected"
    && status !== "revoked"
    && status !== "expired"
  ) {
    return null;
  }

  return {
    id: row.id,
    actorUserId: row.actorUserId,
    approvedByUserId: row.approvedByUserId,
    reason: row.reason,
    scopeType: row.scopeType,
    scopeId: row.scopeType === "global" ? null : row.scopeId,
    status,
    mode: row.overrideMode,
    metadata: row.metadata ?? {},
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalReason: row.approvalReason ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectedByUserId: row.rejectedByUserId ?? null,
    rejectedReason: row.rejectedReason ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function normalizeReleaseGateOverrideMode(
  mode: LibraryKnowledgeReleaseGateOverrideMode | undefined,
): LibraryKnowledgeReleaseGateOverrideMode {
  return mode === "break_glass" ? "break_glass" : "standard";
}

function validateReleaseGateOverrideCommon(input: {
  tenantId: string | null;
  scopeType: "tenant" | "global";
  scopeId: string | null;
  actorUserId: number;
  reason: string;
  expiresAt: Date;
  now: Date;
  mode: LibraryKnowledgeReleaseGateOverrideMode;
  metadata: Record<string, unknown>;
}): void {
  if (input.scopeType === "global" && input.tenantId !== null) {
    throw new Error(
      "Global release-gate overrides require a platform-scoped pathway",
    );
  }
  if (input.scopeType === "tenant" && input.tenantId === null) {
    throw new Error("Tenant-scoped release-gate overrides require a tenant ID");
  }
  if (!Number.isInteger(input.actorUserId) || input.actorUserId <= 0) {
    throw new Error("actorUserId must be a positive integer");
  }
  if (input.reason.length < 8) {
    throw new Error("Release-gate override reason must be at least 8 characters");
  }
  if (
    Number.isNaN(input.expiresAt.getTime())
    || input.expiresAt.getTime() <= input.now.getTime()
  ) {
    throw new Error("Release-gate override expiry must be in the future");
  }

  const durationMs = input.expiresAt.getTime() - input.now.getTime();
  const maxDurationMs = input.mode === "break_glass"
    ? BREAK_GLASS_RELEASE_GATE_OVERRIDE_MAX_DURATION_MS
    : STANDARD_RELEASE_GATE_OVERRIDE_MAX_DURATION_MS;
  if (durationMs > maxDurationMs) {
    throw new Error(
      input.mode === "break_glass"
        ? "Break-glass overrides must expire within 4 hours"
        : "Standard overrides must expire within 24 hours",
    );
  }

  if (input.mode === "break_glass") {
    const incidentRef =
      typeof input.metadata.incidentRef === "string"
        ? input.metadata.incidentRef.trim()
        : "";
    if (incidentRef.length < 4) {
      throw new Error("Break-glass overrides require metadata.incidentRef");
    }
  }

  if (input.scopeType === "tenant" && !input.scopeId) {
    throw new Error("Tenant-scoped release-gate overrides require a scopeId");
  }
}

function overrideReturningFields() {
  return {
    id: libraryKnowledgeReleaseGateOverrides.id,
    actorUserId: libraryKnowledgeReleaseGateOverrides.actorUserId,
    approvedByUserId: libraryKnowledgeReleaseGateOverrides.approvedByUserId,
    reason: libraryKnowledgeReleaseGateOverrides.reason,
    scopeType: libraryKnowledgeReleaseGateOverrides.scopeType,
    scopeId: libraryKnowledgeReleaseGateOverrides.scopeId,
    status: libraryKnowledgeReleaseGateOverrides.status,
    overrideMode: libraryKnowledgeReleaseGateOverrides.overrideMode,
    metadata: libraryKnowledgeReleaseGateOverrides.metadata,
    approvedAt: libraryKnowledgeReleaseGateOverrides.approvedAt,
    approvalReason: libraryKnowledgeReleaseGateOverrides.approvalReason,
    rejectedAt: libraryKnowledgeReleaseGateOverrides.rejectedAt,
    rejectedByUserId: libraryKnowledgeReleaseGateOverrides.rejectedByUserId,
    rejectedReason: libraryKnowledgeReleaseGateOverrides.rejectedReason,
    createdAt: libraryKnowledgeReleaseGateOverrides.createdAt,
    expiresAt: libraryKnowledgeReleaseGateOverrides.expiresAt,
  };
}

async function getPersistedLibraryKnowledgeReleaseGateOverrideById(
  db: DbClient,
  overrideId: number,
): Promise<PersistedLibraryKnowledgeReleaseGateOverride | null> {
  const rows = await db
    .select(overrideReturningFields())
    .from(libraryKnowledgeReleaseGateOverrides)
    .where(eq(libraryKnowledgeReleaseGateOverrides.id, overrideId))
    .limit(1);
  return rows[0] ?? null;
}

export async function requestLibraryKnowledgeReleaseGateOverride(input: {
  tenantId: string | number | null;
  actorUserId: number;
  reason: string;
  scopeType?: "tenant" | "global";
  scopeId?: string | null;
  expiresAt: Date | string;
  mode?: LibraryKnowledgeReleaseGateOverrideMode;
  metadata?: Record<string, unknown>;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride> {
  const scopeType = input.scopeType ?? "tenant";
  const tenantId = input.tenantId === null
    ? null
    : normalizeTenantId(input.tenantId);
  let scopeId: string | null = null;
  if (scopeType === "tenant") {
    scopeId = normalizeTenantId(input.scopeId ?? tenantId ?? "");
  }
  const reason = input.reason.trim();
  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : new Date(input.expiresAt);
  const mode = normalizeReleaseGateOverrideMode(input.mode);
  const metadata = input.metadata ?? {};

  validateReleaseGateOverrideCommon({
    tenantId,
    scopeType,
    scopeId,
    actorUserId: input.actorUserId,
    reason,
    expiresAt,
    now,
    mode,
    metadata,
  });

  const db = input.dbClient ?? await getDb();
  const [row] = await db
    .insert(libraryKnowledgeReleaseGateOverrides)
    .values({
      tenantId,
      scopeType,
      scopeId,
      actorUserId: input.actorUserId,
      approvedByUserId: null,
      overrideMode: mode,
      reason,
      status: "pending_approval",
      metadata,
      expiresAt,
      approvedAt: null,
      approvalReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedReason: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning(overrideReturningFields());

  const override = row ? persistedOverrideToReleaseGateOverride(row, now) : null;
  if (!override) {
    throw new Error("Failed to create release-gate override request");
  }
  return override;
}

export async function createLibraryKnowledgeReleaseGateOverride(input: {
  tenantId: string | number | null;
  actorUserId: number;
  approvedByUserId: number;
  reason: string;
  scopeType?: "tenant" | "global";
  scopeId?: string | null;
  expiresAt: Date | string;
  mode?: LibraryKnowledgeReleaseGateOverrideMode;
  metadata?: Record<string, unknown>;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride> {
  const scopeType = input.scopeType ?? "tenant";
  const tenantId = input.tenantId === null
    ? null
    : normalizeTenantId(input.tenantId);
  if (scopeType === "global" && tenantId !== null) {
    throw new Error(
      "Global release-gate overrides require a platform-scoped pathway",
    );
  }
  if (scopeType === "tenant" && tenantId === null) {
    throw new Error("Tenant-scoped release-gate overrides require a tenant ID");
  }
  let scopeId: string | null = null;
  if (scopeType === "tenant") {
    scopeId = normalizeTenantId(input.scopeId ?? tenantId ?? "");
  }
  const reason = input.reason.trim();
  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : new Date(input.expiresAt);
  const mode = normalizeReleaseGateOverrideMode(input.mode);
  const metadata = input.metadata ?? {};

  validateReleaseGateOverrideCommon({
    tenantId,
    scopeType,
    scopeId,
    actorUserId: input.actorUserId,
    reason,
    expiresAt,
    now,
    mode,
    metadata,
  });
  if (!Number.isInteger(input.approvedByUserId) || input.approvedByUserId <= 0) {
    throw new Error("approvedByUserId must be a positive integer");
  }
  if (input.approvedByUserId === input.actorUserId) {
    throw new Error("Release-gate overrides require a second approving admin");
  }

  const db = input.dbClient ?? await getDb();
  const [row] = await db
    .insert(libraryKnowledgeReleaseGateOverrides)
    .values({
      tenantId,
      scopeType,
      scopeId,
      actorUserId: input.actorUserId,
      approvedByUserId: input.approvedByUserId,
      overrideMode: mode,
      reason,
      status: "active",
      metadata,
      expiresAt,
      approvedAt: now,
      approvalReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedReason: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning(overrideReturningFields());

  const override = row ? persistedOverrideToReleaseGateOverride(row, now) : null;
  if (!override) {
    throw new Error("Failed to create release-gate override");
  }
  return override;
}

export async function approveLibraryKnowledgeReleaseGateOverride(input: {
  overrideId: number;
  approvedByUserId: number;
  reason: string;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride> {
  if (!Number.isInteger(input.overrideId) || input.overrideId <= 0) {
    throw new Error("overrideId must be a positive integer");
  }
  if (!Number.isInteger(input.approvedByUserId) || input.approvedByUserId <= 0) {
    throw new Error("approvedByUserId must be a positive integer");
  }
  const reason = input.reason.trim();
  if (reason.length < 4) {
    throw new Error("Approval reason is required");
  }

  const db = input.dbClient ?? await getDb();
  const now = input.now ?? new Date();
  const existing = await getPersistedLibraryKnowledgeReleaseGateOverrideById(
    db,
    input.overrideId,
  );
  if (!existing) {
    throw new Error("Release-gate override request not found");
  }
  const existingOverride = persistedOverrideToReleaseGateOverride(existing, now);
  if (!existingOverride) {
    throw new Error("Release-gate override request is invalid");
  }
  if (existingOverride.status === "expired") {
    throw new Error("Release-gate override request is expired");
  }
  if (existingOverride.status !== "pending_approval") {
    throw new Error("Only pending override requests can be approved");
  }
  if (
    existingOverride.actorUserId
    && existingOverride.actorUserId === input.approvedByUserId
  ) {
    throw new Error("Release-gate overrides require a second approving admin");
  }

  const [row] = await db
    .update(libraryKnowledgeReleaseGateOverrides)
    .set({
      approvedByUserId: input.approvedByUserId,
      approvedAt: now,
      approvalReason: reason,
      status: "active",
      updatedAt: now,
    })
    .where(eq(libraryKnowledgeReleaseGateOverrides.id, input.overrideId))
    .returning(overrideReturningFields());

  const override = row ? persistedOverrideToReleaseGateOverride(row, now) : null;
  if (!override) {
    throw new Error("Failed to approve release-gate override");
  }
  return override;
}

export async function rejectLibraryKnowledgeReleaseGateOverride(input: {
  overrideId: number;
  rejectedByUserId: number;
  reason: string;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride> {
  if (!Number.isInteger(input.overrideId) || input.overrideId <= 0) {
    throw new Error("overrideId must be a positive integer");
  }
  if (!Number.isInteger(input.rejectedByUserId) || input.rejectedByUserId <= 0) {
    throw new Error("rejectedByUserId must be a positive integer");
  }
  const reason = input.reason.trim();
  if (reason.length < 4) {
    throw new Error("Rejection reason is required");
  }

  const db = input.dbClient ?? await getDb();
  const now = input.now ?? new Date();
  const existing = await getPersistedLibraryKnowledgeReleaseGateOverrideById(
    db,
    input.overrideId,
  );
  if (!existing) {
    throw new Error("Release-gate override request not found");
  }
  const existingOverride = persistedOverrideToReleaseGateOverride(existing, now);
  if (!existingOverride) {
    throw new Error("Release-gate override request is invalid");
  }
  if (existingOverride.status === "expired") {
    throw new Error("Release-gate override request is expired");
  }
  if (existingOverride.status !== "pending_approval") {
    throw new Error("Only pending override requests can be rejected");
  }
  if (
    existingOverride.actorUserId
    && existingOverride.actorUserId === input.rejectedByUserId
  ) {
    throw new Error("Release-gate override requests require an independent reviewer");
  }

  const [row] = await db
    .update(libraryKnowledgeReleaseGateOverrides)
    .set({
      status: "rejected",
      rejectedAt: now,
      rejectedByUserId: input.rejectedByUserId,
      rejectedReason: reason,
      updatedAt: now,
    })
    .where(eq(libraryKnowledgeReleaseGateOverrides.id, input.overrideId))
    .returning(overrideReturningFields());

  const override = row ? persistedOverrideToReleaseGateOverride(row, now) : null;
  if (!override) {
    throw new Error("Failed to reject release-gate override");
  }
  return override;
}

export async function revokeLibraryKnowledgeReleaseGateOverride(input: {
  overrideId: number;
  revokedByUserId: number;
  reason: string;
  dbClient?: DbClient;
  now?: Date;
}): Promise<void> {
  if (!Number.isInteger(input.overrideId) || input.overrideId <= 0) {
    throw new Error("overrideId must be a positive integer");
  }
  if (!Number.isInteger(input.revokedByUserId) || input.revokedByUserId <= 0) {
    throw new Error("revokedByUserId must be a positive integer");
  }
  const reason = input.reason.trim();
  if (reason.length < 4) {
    throw new Error("Revocation reason is required");
  }

  const db = input.dbClient ?? await getDb();
  const now = input.now ?? new Date();
  const existing = await getPersistedLibraryKnowledgeReleaseGateOverrideById(
    db,
    input.overrideId,
  );
  if (!existing) {
    throw new Error("Release-gate override not found");
  }
  const existingOverride = persistedOverrideToReleaseGateOverride(existing, now);
  if (!existingOverride) {
    throw new Error("Release-gate override is invalid");
  }
  if (existingOverride.status !== "active") {
    throw new Error("Only active release-gate overrides can be revoked");
  }
  await db
    .update(libraryKnowledgeReleaseGateOverrides)
    .set({
      status: "revoked",
      revokedAt: now,
      revokedByUserId: input.revokedByUserId,
      revokedReason: reason,
      updatedAt: now,
    })
    .where(eq(libraryKnowledgeReleaseGateOverrides.id, input.overrideId));
}

export async function listLibraryKnowledgeReleaseGateOverrides(input: {
  tenantId: string | number;
  status?: LibraryKnowledgeReleaseGateOverrideStatus | "all";
  limit?: number;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride[]> {
  const tenantId = normalizeTenantId(input.tenantId);
  const db = input.dbClient ?? await getDb();
  const now = input.now ?? new Date();
  const whereClause = input.status === "expired"
    ? and(
        eq(libraryKnowledgeReleaseGateOverrides.tenantId, tenantId),
        or(
          eq(libraryKnowledgeReleaseGateOverrides.status, "active"),
          eq(libraryKnowledgeReleaseGateOverrides.status, "pending_approval"),
        ),
      )
    : input.status && input.status !== "all"
      ? and(
          eq(libraryKnowledgeReleaseGateOverrides.tenantId, tenantId),
          eq(libraryKnowledgeReleaseGateOverrides.status, input.status),
        )
      : eq(libraryKnowledgeReleaseGateOverrides.tenantId, tenantId);
  const rows = await db
    .select(overrideReturningFields())
    .from(libraryKnowledgeReleaseGateOverrides)
    .where(whereClause)
    .orderBy(
      desc(libraryKnowledgeReleaseGateOverrides.createdAt),
      desc(libraryKnowledgeReleaseGateOverrides.id),
    )
    .limit(Math.max(1, Math.min(50, Math.floor(input.limit ?? 20))));

  return rows
    .map((row) => persistedOverrideToReleaseGateOverride(row, now))
    .filter((row): row is LibraryKnowledgeReleaseGateOverride => {
      if (!row) {
        return false;
      }
      if (input.status && input.status !== "all" && row.status !== input.status) {
        return false;
      }
      return true;
    });
}

export async function getActiveLibraryKnowledgeReleaseGateOverride(input: {
  tenantId: string | number;
  dbClient?: DbClient;
  now?: Date;
}): Promise<LibraryKnowledgeReleaseGateOverride | null> {
  const tenantId = normalizeTenantId(input.tenantId);
  const db = input.dbClient ?? await getDb();
  const now = input.now ?? new Date();
  const rows = await db
    .select(overrideReturningFields())
    .from(libraryKnowledgeReleaseGateOverrides)
    .where(
      and(
        eq(libraryKnowledgeReleaseGateOverrides.status, "active"),
        isNotNull(libraryKnowledgeReleaseGateOverrides.approvedByUserId),
        isNotNull(libraryKnowledgeReleaseGateOverrides.approvedAt),
        isNull(libraryKnowledgeReleaseGateOverrides.revokedAt),
        gt(libraryKnowledgeReleaseGateOverrides.expiresAt, now),
        or(
          and(
            isNull(libraryKnowledgeReleaseGateOverrides.tenantId),
            eq(libraryKnowledgeReleaseGateOverrides.scopeType, "global"),
            isNull(libraryKnowledgeReleaseGateOverrides.scopeId),
          ),
          and(
            eq(libraryKnowledgeReleaseGateOverrides.tenantId, tenantId),
            eq(libraryKnowledgeReleaseGateOverrides.scopeType, "tenant"),
            eq(libraryKnowledgeReleaseGateOverrides.scopeId, tenantId),
          ),
        ),
      ),
    )
    .orderBy(desc(libraryKnowledgeReleaseGateOverrides.expiresAt))
    .limit(1);

  const override = rows[0]
    ? persistedOverrideToReleaseGateOverride(rows[0], now)
    : null;
  return normalizeReleaseGateOverride(
    override,
    "tenant",
    tenantId,
    now,
  );
}

const percentMetrics: Array<keyof LibraryKnowledgeReleaseGateMetricSnapshot> = [
  "readableMarkdownBackfillCoveragePercent",
  "staleCacheRatioPercent",
  "citationCoveragePercent",
  "unresolvedReferenceRatePercent",
  "ambiguousReferenceRatePercent",
];

function normalizeTenantId(value: string | number): string {
  const normalized = String(value).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function percentile95(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
  );
  return sorted[index] ?? 0;
}

function pushBounded<T>(values: T[], next: T, maxSize: number): T[] {
  values.push(next);
  if (values.length > maxSize) {
    values.splice(0, values.length - maxSize);
  }
  return values;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
}

function telemetryRollupWindow(value: Date): {
  windowStart: Date;
  windowEnd: Date;
} {
  const windowStart = startOfUtcDay(value);
  return {
    windowStart,
    windowEnd: new Date(windowStart.getTime() + 24 * 60 * 60 * 1000),
  };
}

function recordLatencyIntoBucket(
  bucket: LibraryKnowledgeTelemetryBucket,
  surface: LibraryKnowledgeLatencySurface,
  latencyMs: number,
  sampleCount = 1,
): void {
  const nextSampleCount = Math.max(0, Math.floor(sampleCount));
  pushBounded(
    bucket.latencies[surface],
    Math.max(0, latencyMs),
    MAX_LATENCY_SAMPLES,
  );
  bucket.latencySampleCounts[surface] += nextSampleCount;
}

function recordContextPackMetricIntoBucket(
  bucket: LibraryKnowledgeTelemetryBucket,
  metric: LibraryContextPackResolutionMetric,
  sampleCount = 1,
): void {
  const nextSampleCount = Math.max(0, Math.floor(sampleCount));
  pushBounded(
    bucket.contextPackResolutionSamples,
    metric,
    MAX_CONTEXT_PACK_RESOLUTION_SAMPLES,
  );
  bucket.contextPackResolutionSampleCount += nextSampleCount;
  bucket.contextPackResolvedItemCount += Math.max(
    0,
    Math.floor(metric.itemCount),
  ) * nextSampleCount;
  bucket.contextPackCitedItemCount += Math.max(
    0,
    Math.floor(metric.citedItemCount),
  ) * nextSampleCount;
  recordLatencyIntoBucket(
    bucket,
    "contextPackResolution",
    metric.latencyMs,
    nextSampleCount,
  );
}

function getTelemetryBucket(tenantId: string): LibraryKnowledgeTelemetryBucket {
  const existing = libraryKnowledgeTelemetryStore.get(tenantId);
  if (existing) {
    return existing;
  }

  const created: LibraryKnowledgeTelemetryBucket = {
    latencies: {
      quickSwitch: [],
      inspector: [],
      localGraph: [],
      contextPackResolution: [],
    },
    latencySampleCounts: {
      quickSwitch: 0,
      inspector: 0,
      localGraph: 0,
      contextPackResolution: 0,
    },
    counters: {
      hiddenNoteLeakageCount: 0,
      privateVaultLeakageCount: 0,
      privateVaultBlockedCount: 0,
      delegatedUnauthorizedResolveCount: 0,
      telemetryPersistenceFailureCount: 0,
    },
    contextPackResolutionSamples: [],
    contextPackResolutionSampleCount: 0,
    contextPackResolvedItemCount: 0,
    contextPackCitedItemCount: 0,
    leakageProbes: [],
  };
  libraryKnowledgeTelemetryStore.set(tenantId, created);
  return created;
}

function normalizeContextPackResolutionMetric(
  metric: Partial<LibraryContextPackResolutionMetric>,
): LibraryContextPackResolutionMetric | null {
  if (
    typeof metric.contextPackId !== "number"
    || typeof metric.contextPackSlug !== "string"
    || typeof metric.latencyMs !== "number"
  ) {
    return null;
  }

  return {
    contextPackId: metric.contextPackId,
    contextPackSlug: metric.contextPackSlug,
    status:
      metric.status === "complete"
      || metric.status === "partial"
      || metric.status === "empty"
        ? metric.status
        : "partial",
    latencyMs: Math.max(0, metric.latencyMs),
    itemCount: Math.max(0, Math.floor(Number(metric.itemCount ?? 0))),
    citedItemCount: Math.max(0, Math.floor(Number(metric.citedItemCount ?? 0))),
    citationCoveragePercent: Math.max(0, Number(metric.citationCoveragePercent ?? 0)),
    diagnosticsCount: Math.max(0, Math.floor(Number(metric.diagnosticsCount ?? 0))),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function upsertLibraryKnowledgeTelemetryRollup(
  db: DbClient,
  input: {
    tenantId: string;
    eventType: string;
    surface?: string | null;
    status?: string | null;
    sampleCount: number;
    metricJson: Record<string, unknown>;
    createdAt: Date;
  },
): Promise<void> {
  const { windowStart, windowEnd } = telemetryRollupWindow(input.createdAt);
  let rollupSurface = input.surface ?? null;
  let rollupStatus = input.status ?? null;
  let nextMetricJson: Record<string, unknown> = {};

  if (input.eventType === "counter") {
    const counter = nullableString(input.metricJson.counter);
    if (!counter) {
      return;
    }
    rollupSurface = counter;
  } else if (input.eventType === "leakage_probe") {
    const probeType = nullableString(input.metricJson.probeType);
    if (!probeType) {
      return;
    }
    rollupSurface = probeType;
    rollupStatus = nullableString(input.status) ?? nullableString(input.metricJson.status);
  } else if (input.eventType === "context_pack_resolution") {
    rollupSurface = "contextPackResolution";
  }

  const existingRows = await db
    .select({
      id: libraryKnowledgeTelemetryRollups.id,
      eventType: libraryKnowledgeTelemetryRollups.eventType,
      surface: libraryKnowledgeTelemetryRollups.surface,
      status: libraryKnowledgeTelemetryRollups.status,
      sampleCount: libraryKnowledgeTelemetryRollups.sampleCount,
      metricJson: libraryKnowledgeTelemetryRollups.metricJson,
      windowStart: libraryKnowledgeTelemetryRollups.windowStart,
      windowEnd: libraryKnowledgeTelemetryRollups.windowEnd,
      updatedAt: libraryKnowledgeTelemetryRollups.updatedAt,
    })
    .from(libraryKnowledgeTelemetryRollups)
    .where(
      and(
        eq(libraryKnowledgeTelemetryRollups.tenantId, input.tenantId),
        eq(libraryKnowledgeTelemetryRollups.windowStart, windowStart),
        eq(libraryKnowledgeTelemetryRollups.windowEnd, windowEnd),
        eq(libraryKnowledgeTelemetryRollups.eventType, input.eventType),
        rollupSurface === null
          ? isNull(libraryKnowledgeTelemetryRollups.surface)
          : eq(libraryKnowledgeTelemetryRollups.surface, rollupSurface),
        rollupStatus === null
          ? isNull(libraryKnowledgeTelemetryRollups.status)
          : eq(libraryKnowledgeTelemetryRollups.status, rollupStatus),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  const existingMetricJson =
    existing?.metricJson && typeof existing.metricJson === "object"
      ? existing.metricJson as Record<string, unknown>
      : {};
  const nextSampleCount =
    Math.max(0, existing?.sampleCount ?? 0) + input.sampleCount;

  if (input.eventType === "surface_latency") {
    const recentSamplesMs = Array.isArray(existingMetricJson.recentSamplesMs)
      ? existingMetricJson.recentSamplesMs
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : [];
    if (typeof input.metricJson.latencyMs === "number") {
      pushBounded(recentSamplesMs, Math.max(0, input.metricJson.latencyMs), MAX_LATENCY_SAMPLES);
    }
    nextMetricJson = { recentSamplesMs };
  } else if (input.eventType === "counter") {
    const counter = nullableString(input.metricJson.counter);
    const delta = Math.max(1, Math.floor(Number(input.metricJson.delta ?? input.sampleCount)));
    nextMetricJson = {
      counter,
      total: Math.max(0, Number(existingMetricJson.total ?? 0)) + delta,
    };
  } else if (input.eventType === "leakage_probe") {
    const probes = Array.isArray(existingMetricJson.probes)
      ? existingMetricJson.probes.filter(
        (entry): entry is LibraryKnowledgeLeakageProbeResult =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
      : [];
    const probe = input.metricJson as unknown as LibraryKnowledgeLeakageProbeResult;
    const counterDelta = summarizeLeakageProbeCounters(probe);
    pushBounded(probes, probe, MAX_LEAKAGE_PROBES);
    nextMetricJson = {
      probeType: rollupSurface,
      probes,
      hiddenNoteLeakageCount:
        Math.max(0, Number(existingMetricJson.hiddenNoteLeakageCount ?? 0))
        + counterDelta.hiddenNoteLeakageCount,
      privateVaultLeakageCount:
        Math.max(0, Number(existingMetricJson.privateVaultLeakageCount ?? 0))
        + counterDelta.privateVaultLeakageCount,
      privateVaultBlockedCount:
        Math.max(0, Number(existingMetricJson.privateVaultBlockedCount ?? 0))
        + counterDelta.privateVaultBlockedCount,
      delegatedUnauthorizedResolveCount:
        Math.max(0, Number(existingMetricJson.delegatedUnauthorizedResolveCount ?? 0))
        + counterDelta.delegatedUnauthorizedResolveCount,
    };
  } else if (input.eventType === "context_pack_resolution") {
    const recentSamples = Array.isArray(existingMetricJson.recentSamples)
      ? existingMetricJson.recentSamples
        .map((entry) =>
          normalizeContextPackResolutionMetric(
            entry as Partial<LibraryContextPackResolutionMetric>,
          ))
        .filter((entry): entry is LibraryContextPackResolutionMetric => Boolean(entry))
      : [];
    const normalizedMetric = normalizeContextPackResolutionMetric(
      input.metricJson as Partial<LibraryContextPackResolutionMetric>,
    );
    if (normalizedMetric) {
      pushBounded(recentSamples, normalizedMetric, MAX_CONTEXT_PACK_RESOLUTION_SAMPLES);
    }
    nextMetricJson = {
      recentSamples,
      totalItemCount:
        Math.max(0, Number(existingMetricJson.totalItemCount ?? 0))
        + (Math.max(0, Number(input.metricJson.itemCount ?? 0)) * input.sampleCount),
      totalCitedItemCount:
        Math.max(0, Number(existingMetricJson.totalCitedItemCount ?? 0))
        + (Math.max(0, Number(input.metricJson.citedItemCount ?? 0)) * input.sampleCount),
    };
  } else {
    return;
  }

  if (existing) {
    await db
      .update(libraryKnowledgeTelemetryRollups)
      .set({
        sampleCount: nextSampleCount,
        metricJson: nextMetricJson,
        updatedAt: input.createdAt,
      })
      .where(eq(libraryKnowledgeTelemetryRollups.id, existing.id));
    return;
  }

  await db.insert(libraryKnowledgeTelemetryRollups).values({
    tenantId: input.tenantId,
    windowStart,
    windowEnd,
    eventType: input.eventType,
    surface: rollupSurface,
    status: rollupStatus,
    sampleCount: nextSampleCount,
    metricJson: nextMetricJson,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

async function persistLibraryKnowledgeTelemetryEvent(input: {
  tenantId: string;
  eventType: string;
  surface?: string | null;
  status?: string | null;
  sampleCount?: number;
  metricJson?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db || typeof (db as { insert?: unknown }).insert !== "function") {
      return;
    }
    const createdAt = new Date();
    const sampleCount = Math.max(1, Math.floor(input.sampleCount ?? 1));
    const metricJson = input.metricJson ?? {};

    await db.insert(libraryKnowledgeTelemetryEvents).values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      surface: input.surface ?? null,
      status: input.status ?? null,
      sampleCount,
      metricJson,
      createdAt,
    });
    await upsertLibraryKnowledgeTelemetryRollup(db, {
      tenantId: input.tenantId,
      eventType: input.eventType,
      surface: input.surface ?? null,
      status: input.status ?? null,
      sampleCount,
      metricJson,
      createdAt,
    });
  } catch {
    const bucket = getTelemetryBucket(input.tenantId);
    bucket.counters.telemetryPersistenceFailureCount += 1;
    // Telemetry persistence must never break the user-facing read path.
  }
}

function buildEmptyTelemetryBucket(): LibraryKnowledgeTelemetryBucket {
  return {
    latencies: {
      quickSwitch: [],
      inspector: [],
      localGraph: [],
      contextPackResolution: [],
    },
    latencySampleCounts: {
      quickSwitch: 0,
      inspector: 0,
      localGraph: 0,
      contextPackResolution: 0,
    },
    counters: {
      hiddenNoteLeakageCount: 0,
      privateVaultLeakageCount: 0,
      privateVaultBlockedCount: 0,
      delegatedUnauthorizedResolveCount: 0,
      telemetryPersistenceFailureCount: 0,
    },
    contextPackResolutionSamples: [],
    contextPackResolutionSampleCount: 0,
    contextPackResolvedItemCount: 0,
    contextPackCitedItemCount: 0,
    leakageProbes: [],
  };
}

function bucketToTelemetrySnapshot(
  tenantId: string,
  bucket: LibraryKnowledgeTelemetryBucket,
  now: Date,
): LibraryKnowledgeTelemetrySnapshot {
  return {
    tenantId,
    generatedAt: now.toISOString(),
    surfaceLatency: {
      quickSwitch: {
        sampleCount: bucket.latencySampleCounts.quickSwitch,
        p95Ms: percentile95(bucket.latencies.quickSwitch),
        recentSamplesMs: [...bucket.latencies.quickSwitch],
      },
      inspector: {
        sampleCount: bucket.latencySampleCounts.inspector,
        p95Ms: percentile95(bucket.latencies.inspector),
        recentSamplesMs: [...bucket.latencies.inspector],
      },
      localGraph: {
        sampleCount: bucket.latencySampleCounts.localGraph,
        p95Ms: percentile95(bucket.latencies.localGraph),
        recentSamplesMs: [...bucket.latencies.localGraph],
      },
      contextPackResolution: {
        sampleCount: bucket.latencySampleCounts.contextPackResolution,
        p95Ms: percentile95(bucket.latencies.contextPackResolution),
        recentSamplesMs: [...bucket.latencies.contextPackResolution],
      },
    },
    counters: {
      ...bucket.counters,
    },
    contextPackResolution: {
      sampleCount: bucket.contextPackResolutionSampleCount,
      citedItemCount: bucket.contextPackCitedItemCount,
      itemCount: bucket.contextPackResolvedItemCount,
      citationCoveragePercent:
        bucket.contextPackResolvedItemCount === 0
          ? 100
          : (bucket.contextPackCitedItemCount / bucket.contextPackResolvedItemCount) * 100,
      recentSamples: [...bucket.contextPackResolutionSamples],
    },
    leakageProbes: [...bucket.leakageProbes],
  };
}

type LibraryKnowledgeSafetyCounterDelta = Pick<
  LibraryKnowledgeTelemetrySnapshot["counters"],
  | "hiddenNoteLeakageCount"
  | "privateVaultLeakageCount"
  | "privateVaultBlockedCount"
  | "delegatedUnauthorizedResolveCount"
>;

function emptySafetyCounterDelta(): LibraryKnowledgeSafetyCounterDelta {
  return {
    hiddenNoteLeakageCount: 0,
    privateVaultLeakageCount: 0,
    privateVaultBlockedCount: 0,
    delegatedUnauthorizedResolveCount: 0,
  };
}

function summarizeLeakageProbeCounters(
  probe: LibraryKnowledgeLeakageProbeResult,
): LibraryKnowledgeSafetyCounterDelta {
  const delta = emptySafetyCounterDelta();

  if (probe.status === "leaked") {
    if (probe.probeType === "private_vault_mention") {
      delta.privateVaultLeakageCount += 1;
    } else if (probe.probeType !== "delegated_context_pack_without_grant") {
      delta.hiddenNoteLeakageCount += 1;
    }
    return delta;
  }

  if (probe.status === "blocked") {
    if (probe.probeType === "private_vault_mention") {
      delta.privateVaultBlockedCount += 1;
    }
    if (probe.probeType === "delegated_context_pack_without_grant") {
      delta.delegatedUnauthorizedResolveCount += 1;
    }
  }

  return delta;
}

function applySafetyCounterDelta(
  counters: LibraryKnowledgeTelemetrySnapshot["counters"],
  delta: LibraryKnowledgeSafetyCounterDelta,
): void {
  counters.hiddenNoteLeakageCount += delta.hiddenNoteLeakageCount;
  counters.privateVaultLeakageCount += delta.privateVaultLeakageCount;
  counters.privateVaultBlockedCount += delta.privateVaultBlockedCount;
  counters.delegatedUnauthorizedResolveCount += delta.delegatedUnauthorizedResolveCount;
}

function pushProbePreviewIntoBucket(
  bucket: LibraryKnowledgeTelemetryBucket,
  probe: LibraryKnowledgeLeakageProbeResult,
): void {
  pushBounded(bucket.leakageProbes, probe, MAX_LEAKAGE_PROBES);
}

function buildTelemetrySnapshotFromPersistedEvents(
  tenantId: string,
  rows: PersistedLibraryKnowledgeTelemetryEvent[],
  now: Date,
): LibraryKnowledgeTelemetrySnapshot {
  const bucket = buildEmptyTelemetryBucket();

  for (const row of rows.slice().reverse()) {
    const metricJson =
      row.metricJson && typeof row.metricJson === "object"
        ? row.metricJson
        : {};

    if (
      row.eventType === "surface_latency"
      && row.surface
      && row.surface in bucket.latencies
      && typeof metricJson.latencyMs === "number"
    ) {
      recordLatencyIntoBucket(
        bucket,
        row.surface as LibraryKnowledgeLatencySurface,
        Math.max(0, metricJson.latencyMs),
        row.sampleCount,
      );
      continue;
    }

    if (row.eventType === "counter") {
      const counter = metricJson.counter;
      if (
        typeof counter === "string"
        && counter in bucket.counters
      ) {
        bucket.counters[counter as keyof LibraryKnowledgeTelemetrySnapshot["counters"]]
          += Math.max(1, Math.floor(Number(metricJson.delta ?? row.sampleCount)));
      }
      continue;
    }

    if (row.eventType === "leakage_probe") {
      const probe = metricJson as Partial<LibraryKnowledgeLeakageProbeResult>;
      if (
        typeof probe.probeId === "string"
        && typeof probe.probeType === "string"
        && typeof probe.status === "string"
      ) {
        recordProbeIntoBucket(bucket, probe as LibraryKnowledgeLeakageProbeResult);
      }
      continue;
    }

    if (row.eventType === "context_pack_resolution") {
      const normalizedMetric = normalizeContextPackResolutionMetric(
        metricJson as Partial<LibraryContextPackResolutionMetric>,
      );
      if (normalizedMetric) {
        recordContextPackMetricIntoBucket(bucket, normalizedMetric, row.sampleCount);
      }
    }
  }

  return bucketToTelemetrySnapshot(tenantId, bucket, now);
}

function buildTelemetrySnapshotFromPersistedRollups(
  tenantId: string,
  rows: PersistedLibraryKnowledgeTelemetryRollup[],
  now: Date,
): LibraryKnowledgeTelemetrySnapshot {
  const bucket = buildEmptyTelemetryBucket();
  const orderedRows = rows
    .slice()
    .sort((left, right) =>
      left.windowStart.getTime() - right.windowStart.getTime()
      || left.updatedAt.getTime() - right.updatedAt.getTime()
      || left.id - right.id
    );

  for (const row of orderedRows) {
    const metricJson =
      row.metricJson && typeof row.metricJson === "object"
        ? row.metricJson
        : {};

    if (
      row.eventType === "surface_latency"
      && row.surface
      && row.surface in bucket.latencies
    ) {
      const surface = row.surface as LibraryKnowledgeLatencySurface;
      const recentSamplesMs = Array.isArray(metricJson.recentSamplesMs)
        ? metricJson.recentSamplesMs.filter(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        )
        : [];
      bucket.latencySampleCounts[surface] += Math.max(0, Math.floor(row.sampleCount));
      for (const sample of recentSamplesMs) {
        recordLatencyIntoBucket(bucket, surface, Math.max(0, sample), 0);
      }
      continue;
    }

    if (row.eventType === "counter") {
      const counter = row.surface ?? nullableString(metricJson.counter);
      if (
        counter
        && counter in bucket.counters
      ) {
        bucket.counters[counter as keyof LibraryKnowledgeTelemetrySnapshot["counters"]]
          += Math.max(0, Math.floor(Number(metricJson.total ?? row.sampleCount)));
      }
      continue;
    }

    if (row.eventType === "leakage_probe") {
      const probes = Array.isArray(metricJson.probes)
        ? metricJson.probes.filter(
          (entry): entry is LibraryKnowledgeLeakageProbeResult =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
        )
        : [];
      const hasAggregatedCounters = [
        "hiddenNoteLeakageCount",
        "privateVaultLeakageCount",
        "privateVaultBlockedCount",
        "delegatedUnauthorizedResolveCount",
      ].some((key) => metricJson[key] !== undefined);
      if (hasAggregatedCounters) {
        applySafetyCounterDelta(bucket.counters, {
          hiddenNoteLeakageCount: Math.max(
            0,
            Math.floor(Number(metricJson.hiddenNoteLeakageCount ?? 0)),
          ),
          privateVaultLeakageCount: Math.max(
            0,
            Math.floor(Number(metricJson.privateVaultLeakageCount ?? 0)),
          ),
          privateVaultBlockedCount: Math.max(
            0,
            Math.floor(Number(metricJson.privateVaultBlockedCount ?? 0)),
          ),
          delegatedUnauthorizedResolveCount: Math.max(
            0,
            Math.floor(Number(metricJson.delegatedUnauthorizedResolveCount ?? 0)),
          ),
        });
        for (const probe of probes) {
          pushProbePreviewIntoBucket(bucket, probe);
        }
      } else {
        for (const probe of probes) {
          recordProbeIntoBucket(bucket, probe);
        }
      }
      continue;
    }

    if (row.eventType === "context_pack_resolution") {
      bucket.contextPackResolutionSampleCount += Math.max(
        0,
        Math.floor(row.sampleCount),
      );
      bucket.latencySampleCounts.contextPackResolution += Math.max(
        0,
        Math.floor(row.sampleCount),
      );
      bucket.contextPackResolvedItemCount += Math.max(
        0,
        Math.floor(Number(metricJson.totalItemCount ?? 0)),
      );
      bucket.contextPackCitedItemCount += Math.max(
        0,
        Math.floor(Number(metricJson.totalCitedItemCount ?? 0)),
      );

      const recentSamples = Array.isArray(metricJson.recentSamples)
        ? metricJson.recentSamples
          .map((entry) =>
            normalizeContextPackResolutionMetric(
              entry as Partial<LibraryContextPackResolutionMetric>,
            ))
          .filter((entry): entry is LibraryContextPackResolutionMetric => Boolean(entry))
        : [];
      for (const sample of recentSamples) {
        recordContextPackMetricIntoBucket(bucket, sample, 0);
      }
    }
  }

  return bucketToTelemetrySnapshot(tenantId, bucket, now);
}

function recordProbeIntoBucket(
  bucket: LibraryKnowledgeTelemetryBucket,
  probe: LibraryKnowledgeLeakageProbeResult,
): void {
  pushProbePreviewIntoBucket(bucket, probe);
  applySafetyCounterDelta(bucket.counters, summarizeLeakageProbeCounters(probe));
}

function isValidMetric(
  metric: keyof LibraryKnowledgeReleaseGateMetricSnapshot,
  value: number,
): boolean {
  if (!Number.isFinite(value) || value < 0) {
    return false;
  }
  if (percentMetrics.includes(metric) && value > 100) {
    return false;
  }
  return true;
}

function issue(
  check: string,
  severity: LibraryKnowledgeReleaseGateIssue["severity"],
  metric: LibraryKnowledgeReleaseGateIssue["metric"],
  actual: number | null,
  threshold: number | null,
  message: string,
): LibraryKnowledgeReleaseGateIssue {
  return {
    check,
    severity,
    metric,
    actual,
    threshold,
    message,
  };
}

function normalizeReleaseGateOverride(
  override: LibraryKnowledgeReleaseGateOverride | null | undefined,
  expectedScopeType: "tenant" | "global",
  expectedScopeId: string | null,
  now: Date,
): LibraryKnowledgeReleaseGateOverride | null {
  if (!override) {
    return null;
  }
  const normalizedMetadata: KnowledgeVaultReleaseGateOverrideMetadata = {
    actorUserId: override.actorUserId,
    approvedByUserId: override.approvedByUserId,
    reason: override.reason,
    scopeType: override.scopeType,
    scopeId: override.scopeId,
    createdAt: override.createdAt,
    expiresAt: override.expiresAt,
  };
  if (!isKnowledgeVaultReleaseGateOverrideActive(normalizedMetadata, expectedScopeId, now)) {
    return null;
  }
  if (expectedScopeType === "global" && override.scopeType !== "global") {
    return null;
  }
  if (
    expectedScopeType === "tenant"
    && override.scopeType === "tenant"
    && override.scopeId !== expectedScopeId
  ) {
    return null;
  }
  return override;
}

function addMinCheck(
  issues: LibraryKnowledgeReleaseGateIssue[],
  metrics: LibraryKnowledgeReleaseGateMetricSnapshot,
  metric: keyof LibraryKnowledgeReleaseGateMetricSnapshot,
  threshold: number,
  check: string,
  severity: LibraryKnowledgeReleaseGateIssue["severity"],
): void {
  const actual = metrics[metric];
  if (actual < threshold) {
    issues.push(
      issue(
        check,
        severity,
        metric,
        actual,
        threshold,
        `${metric} ${actual} is below required ${threshold}`,
      ),
    );
  }
}

function addMaxCheck(
  issues: LibraryKnowledgeReleaseGateIssue[],
  metrics: LibraryKnowledgeReleaseGateMetricSnapshot,
  metric: keyof LibraryKnowledgeReleaseGateMetricSnapshot,
  threshold: number,
  check: string,
  severity: LibraryKnowledgeReleaseGateIssue["severity"],
): void {
  const actual = metrics[metric];
  if (actual > threshold) {
    issues.push(
      issue(
        check,
        severity,
        metric,
        actual,
        threshold,
        `${metric} ${actual} exceeds allowed ${threshold}`,
      ),
    );
  }
}

export function evaluateLibraryKnowledgeReleaseGate(input: {
  metrics: LibraryKnowledgeReleaseGateMetricSnapshot;
  phase?: LibraryKnowledgeRolloutPhase;
  thresholds?: Partial<LibraryKnowledgeReleaseGateThresholds>;
  observed?: Partial<LibraryKnowledgeReleaseGateSampleSnapshot>;
  minimumSamples?: Partial<LibraryKnowledgeReleaseGateMinimumSamples>;
  scopeType?: "tenant" | "global";
  scopeId?: string | null;
  windowStart?: Date;
  windowEnd?: Date;
  override?: LibraryKnowledgeReleaseGateOverride | null;
  now?: Date;
}): LibraryKnowledgeReleaseGateResult {
  const phase = input.phase ?? "canary";
  const evaluatedAt = input.now ?? new Date();
  const windowEnd = input.windowEnd ?? evaluatedAt;
  const windowStart =
    input.windowStart ?? new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thresholds = {
    ...defaultLibraryKnowledgeReleaseGateThresholds,
    ...(input.thresholds ?? {}),
  };
  const minimumSamples = {
    ...defaultLibraryKnowledgeReleaseGateMinimumSamples,
    ...(input.minimumSamples ?? {}),
  };
  const observed = {
    refreshLatencySampleCount: 0,
    quickSwitchSampleCount: 0,
    graphSampleCount: 0,
    contextPackResolutionSampleCount: 0,
    ...(input.observed ?? {}),
  };
  const issues: LibraryKnowledgeReleaseGateIssue[] = [];

  for (const [metric, value] of Object.entries(input.metrics) as Array<
    [keyof LibraryKnowledgeReleaseGateMetricSnapshot, number]
  >) {
    if (!isValidMetric(metric, value)) {
      issues.push(
        issue(
          `invalid_metric_${metric}`,
          "blocker",
          metric,
          Number.isFinite(value) ? value : null,
          null,
          `${metric} must be a finite non-negative number within its valid range`,
        ),
      );
    }
  }

  if (issues.length > 0) {
    issues.unshift(
      issue(
        "invalid_metric_input",
        "blocker",
        "metric_snapshot",
        null,
        null,
        "Metric snapshot contains invalid values and cannot be trusted",
      ),
    );
  } else {
    const sampleChecks: Array<{
      key: keyof LibraryKnowledgeReleaseGateSampleSnapshot;
      check: string;
    }> = [
      {
        key: "refreshLatencySampleCount",
        check: "refresh_latency_insufficient_data",
      },
      {
        key: "quickSwitchSampleCount",
        check: "quick_switch_insufficient_data",
      },
      {
        key: "graphSampleCount",
        check: "graph_latency_insufficient_data",
      },
      {
        key: "contextPackResolutionSampleCount",
        check: "context_pack_resolution_insufficient_data",
      },
    ];

    for (const sampleCheck of sampleChecks) {
      const actual = Math.max(0, Math.floor(observed[sampleCheck.key] ?? 0));
      const required = minimumSamples[sampleCheck.key];
      if (actual < required) {
        issues.push(
          issue(
            sampleCheck.check,
            "insufficient_data",
            "metric_snapshot",
            actual,
            required,
            `${sampleCheck.key} ${actual} is below required sample count ${required}`,
          ),
        );
      }
    }

    addMaxCheck(
      issues,
      input.metrics,
      "hiddenNoteLeakageCount",
      thresholds.maxHiddenNoteLeakageCount,
      "hidden_note_leakage_detected",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "privateVaultLeakageCount",
      thresholds.maxPrivateVaultLeakageCount,
      "private_vault_leakage_detected",
      "blocker",
    );
    addMinCheck(
      issues,
      input.metrics,
      "citationCoveragePercent",
      thresholds.minCitationCoveragePercent,
      "citation_coverage_below_threshold",
      "blocker",
    );
    addMinCheck(
      issues,
      input.metrics,
      "readableMarkdownBackfillCoveragePercent",
      thresholds.minReadableMarkdownBackfillCoveragePercent,
      "backfill_coverage_below_threshold",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "saveToRefreshP95Ms",
      thresholds.maxSaveToRefreshP95Ms,
      "save_to_refresh_latency_exceeded",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "quickSwitchP95Ms",
      thresholds.maxQuickSwitchP95Ms,
      "quick_switch_latency_exceeded",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "localGraphP95Ms",
      thresholds.maxLocalGraphP95Ms,
      "local_graph_latency_exceeded",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "contextPackResolutionP95Ms",
      thresholds.maxContextPackResolutionP95Ms,
      "context_pack_resolution_latency_exceeded",
      "blocker",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "staleCacheRatioPercent",
      thresholds.maxStaleCacheRatioPercent,
      "stale_cache_ratio_exceeded",
      "warning",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "delegatedUnauthorizedResolveCount",
      thresholds.maxDelegatedUnauthorizedResolveCount,
      phase === "production"
        ? "delegated_unauthorized_resolve_detected"
        : "delegated_unauthorized_resolve_observed",
      phase === "production" ? "blocker" : "warning",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "unresolvedReferenceRatePercent",
      thresholds.maxUnresolvedReferenceRatePercent,
      "unresolved_reference_rate_exceeded",
      "warning",
    );
    addMaxCheck(
      issues,
      input.metrics,
      "ambiguousReferenceRatePercent",
      thresholds.maxAmbiguousReferenceRatePercent,
      "ambiguous_reference_rate_exceeded",
      "warning",
    );
  }

  const failedChecks = issues
    .filter((entry) => entry.severity === "blocker")
    .map((entry) => entry.check);
  const warningChecks = issues
    .filter((entry) => entry.severity === "warning")
    .map((entry) => entry.check);
  const insufficientDataChecks = issues
    .filter((entry) => entry.severity === "insufficient_data")
    .map((entry) => entry.check);
  const activeOverride = normalizeReleaseGateOverride(
    input.override,
    input.scopeType ?? input.override?.scopeType ?? "tenant",
    input.scopeId ?? input.override?.scopeId ?? null,
    evaluatedAt,
  );
  const status: LibraryKnowledgeReleaseGateStatus =
    activeOverride
      ? "overridden"
      : failedChecks.length > 0
      ? "blocked"
      : insufficientDataChecks.length > 0
        ? "insufficient_data"
        : "pass";

  return {
    status,
    phase,
    scopeType: input.scopeType ?? "tenant",
    scopeId: input.scopeId ?? null,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    generatedAt: evaluatedAt.toISOString(),
    evaluatedAt: evaluatedAt.toISOString(),
    metrics: input.metrics,
    observed,
    minimumSamples,
    thresholds,
    override: activeOverride,
    failedChecks,
    warningChecks,
    issues,
    summary:
      status === "pass"
        ? "Knowledge Vault release gate passed."
        : status === "overridden"
          ? "Knowledge Vault release gate is using a time-bounded audited override."
        : status === "blocked"
          ? "Knowledge Vault release gate is blocked by safety or SLO failures."
          : "Knowledge Vault release gate has insufficient data for broad rollout.",
  };
}

export function recordLibraryKnowledgeSurfaceLatency(input: {
  tenantId: string | number;
  surface: LibraryKnowledgeLatencySurface;
  latencyMs: number;
}): void {
  if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0) {
    return;
  }

  const bucket = getTelemetryBucket(normalizeTenantId(input.tenantId));
  recordLatencyIntoBucket(
    bucket,
    input.surface,
    Math.max(0, input.latencyMs),
  );
  if (input.surface !== "contextPackResolution") {
    void persistLibraryKnowledgeTelemetryEvent({
      tenantId: normalizeTenantId(input.tenantId),
      eventType: "surface_latency",
      surface: input.surface,
      metricJson: {
        latencyMs: Math.max(0, input.latencyMs),
      },
    });
  }
}

export function incrementLibraryKnowledgeCounter(input: {
  tenantId: string | number;
  counter: keyof LibraryKnowledgeTelemetrySnapshot["counters"];
  delta?: number;
}): void {
  const bucket = getTelemetryBucket(normalizeTenantId(input.tenantId));
  const nextDelta = Math.max(1, Math.floor(input.delta ?? 1));
  bucket.counters[input.counter] += nextDelta;
  void persistLibraryKnowledgeTelemetryEvent({
    tenantId: normalizeTenantId(input.tenantId),
    eventType: "counter",
    metricJson: {
      counter: input.counter,
      delta: nextDelta,
    },
  });
}

export function recordLibraryKnowledgeLeakageProbe(
  probe: LibraryKnowledgeLeakageProbeResult,
): void {
  const tenantId = normalizeTenantId(probe.tenantId);
  const bucket = getTelemetryBucket(tenantId);
  recordProbeIntoBucket(bucket, probe);
  void persistLibraryKnowledgeTelemetryEvent({
    tenantId,
    eventType: "leakage_probe",
    status: probe.status,
    metricJson: probe as unknown as Record<string, unknown>,
  });
}

export function recordLibraryContextPackResolutionMetric(input: {
  tenantId: string | number;
  metric: LibraryContextPackResolutionMetric;
}): void {
  const tenantId = normalizeTenantId(input.tenantId);
  const bucket = getTelemetryBucket(tenantId);
  recordContextPackMetricIntoBucket(bucket, input.metric);
  void persistLibraryKnowledgeTelemetryEvent({
    tenantId,
    eventType: "context_pack_resolution",
    status: input.metric.status,
    metricJson: input.metric as unknown as Record<string, unknown>,
  });
}

export function getLibraryKnowledgeTelemetrySnapshot(
  tenantId: string | number,
  now = new Date(),
): LibraryKnowledgeTelemetrySnapshot {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const bucket = getTelemetryBucket(normalizedTenantId);
  return bucketToTelemetrySnapshot(normalizedTenantId, bucket, now);
}

export function resetLibraryKnowledgeTelemetryForTests(): void {
  libraryKnowledgeTelemetryStore.clear();
}

export function buildContextPackResolutionMetric(input: {
  result: LibraryContextPackResolveResult;
  latencyMs: number;
}): LibraryContextPackResolutionMetric {
  const itemCount = input.result.items.length;
  const citedItemCount = input.result.items.filter(
    (item) => item.citations.length > 0,
  ).length;
  return {
    contextPackId: input.result.pack.id,
    contextPackSlug: input.result.pack.slug,
    status: input.result.status,
    latencyMs: Math.max(0, input.latencyMs),
    itemCount,
    citedItemCount,
    citationCoveragePercent:
      itemCount === 0 ? 100 : (citedItemCount / itemCount) * 100,
    diagnosticsCount: input.result.diagnostics.length,
  };
}

export function sanitizeLibraryKnowledgeLeakageProbe(input: {
  probeId: string;
  probeType: LibraryKnowledgeLeakageProbeResult["probeType"];
  tenantId: string;
  actorUserId?: number | null;
  leaked: boolean;
  blockedReason?: string | null;
  hiddenResourceId?: number | string | null;
}): LibraryKnowledgeLeakageProbeResult {
  return {
    probeId: input.probeId,
    probeType: input.probeType,
    status: input.leaked ? "leaked" : "blocked",
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    blockedReason: input.leaked ? null : input.blockedReason ?? "blocked_by_acl",
    hiddenResourceRef:
      input.hiddenResourceId === undefined || input.hiddenResourceId === null
        ? null
        : `library_item:${input.hiddenResourceId}`,
  };
}

export function buildLibraryKnowledgeMetricSnapshot(input: {
  readableMarkdownCount: number;
  indexedKnowledgeNoteCount: number;
  staleKnowledgeNoteCount: number;
  saveToRefreshLatenciesMs: number[];
  totalRelationCount: number;
  unresolvedRelationCount: number;
  ambiguousRelationCount: number;
  telemetry: LibraryKnowledgeTelemetrySnapshot;
}): LibraryKnowledgeReleaseGateMetricSnapshot {
  const readableMarkdownCount = Math.max(0, input.readableMarkdownCount);
  const indexedKnowledgeNoteCount = Math.max(0, input.indexedKnowledgeNoteCount);
  const staleKnowledgeNoteCount = Math.max(0, input.staleKnowledgeNoteCount);
  const totalRelationCount = Math.max(0, input.totalRelationCount);
  const unresolvedRelationCount = Math.max(0, input.unresolvedRelationCount);
  const ambiguousRelationCount = Math.max(0, input.ambiguousRelationCount);

  return {
    readableMarkdownBackfillCoveragePercent:
      readableMarkdownCount === 0
        ? 100
        : (indexedKnowledgeNoteCount / readableMarkdownCount) * 100,
    staleCacheRatioPercent:
      indexedKnowledgeNoteCount === 0
        ? 0
        : (staleKnowledgeNoteCount / indexedKnowledgeNoteCount) * 100,
    saveToRefreshP95Ms: percentile95(input.saveToRefreshLatenciesMs),
    quickSwitchP95Ms: input.telemetry.surfaceLatency.quickSwitch.p95Ms,
    localGraphP95Ms: input.telemetry.surfaceLatency.localGraph.p95Ms,
    contextPackResolutionP95Ms:
      input.telemetry.surfaceLatency.contextPackResolution.p95Ms,
    citationCoveragePercent:
      input.telemetry.contextPackResolution.citationCoveragePercent,
    hiddenNoteLeakageCount: input.telemetry.counters.hiddenNoteLeakageCount,
    privateVaultLeakageCount: input.telemetry.counters.privateVaultLeakageCount,
    privateVaultBlockedCount: input.telemetry.counters.privateVaultBlockedCount,
    delegatedUnauthorizedResolveCount:
      input.telemetry.counters.delegatedUnauthorizedResolveCount,
    unresolvedReferenceRatePercent:
      totalRelationCount === 0
        ? 0
        : (unresolvedRelationCount / totalRelationCount) * 100,
    ambiguousReferenceRatePercent:
      totalRelationCount === 0
        ? 0
        : (ambiguousRelationCount / totalRelationCount) * 100,
  };
}

async function loadCount(
  db: DbClient,
  query: Promise<Array<{ count: number }>>,
): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.count ?? 0);
}

async function fetchPersistedTelemetryRows(
  db: DbClient,
  tenantId: string,
  windowStart: Date,
): Promise<PersistedLibraryKnowledgeTelemetryEvent[]> {
  const rows: PersistedLibraryKnowledgeTelemetryEvent[] = [];

  for (
    let offset = 0;
    offset < MAX_PERSISTED_TELEMETRY_ROWS_PER_REPORT;
    offset += PERSISTED_TELEMETRY_PAGE_SIZE
  ) {
    const page = await db
      .select({
        eventType: libraryKnowledgeTelemetryEvents.eventType,
        surface: libraryKnowledgeTelemetryEvents.surface,
        status: libraryKnowledgeTelemetryEvents.status,
        sampleCount: libraryKnowledgeTelemetryEvents.sampleCount,
        metricJson: libraryKnowledgeTelemetryEvents.metricJson,
        createdAt: libraryKnowledgeTelemetryEvents.createdAt,
      })
      .from(libraryKnowledgeTelemetryEvents)
      .where(
        and(
          eq(libraryKnowledgeTelemetryEvents.tenantId, tenantId),
          gte(libraryKnowledgeTelemetryEvents.createdAt, windowStart),
        ),
      )
      .orderBy(desc(libraryKnowledgeTelemetryEvents.createdAt))
      .limit(PERSISTED_TELEMETRY_PAGE_SIZE)
      .offset(offset);

    rows.push(
      ...page.map((row) => ({
        ...row,
        metricJson:
          row.metricJson && typeof row.metricJson === "object"
            ? row.metricJson as Record<string, unknown>
            : {},
      })),
    );

    if (page.length < PERSISTED_TELEMETRY_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchPersistedTelemetryRollups(
  db: DbClient,
  tenantId: string,
  windowStart: Date,
): Promise<PersistedLibraryKnowledgeTelemetryRollup[]> {
  const rows = await db
    .select({
      id: libraryKnowledgeTelemetryRollups.id,
      eventType: libraryKnowledgeTelemetryRollups.eventType,
      surface: libraryKnowledgeTelemetryRollups.surface,
      status: libraryKnowledgeTelemetryRollups.status,
      sampleCount: libraryKnowledgeTelemetryRollups.sampleCount,
      metricJson: libraryKnowledgeTelemetryRollups.metricJson,
      windowStart: libraryKnowledgeTelemetryRollups.windowStart,
      windowEnd: libraryKnowledgeTelemetryRollups.windowEnd,
      updatedAt: libraryKnowledgeTelemetryRollups.updatedAt,
    })
    .from(libraryKnowledgeTelemetryRollups)
    .where(
      and(
        eq(libraryKnowledgeTelemetryRollups.tenantId, tenantId),
        gte(libraryKnowledgeTelemetryRollups.windowEnd, windowStart),
      ),
    )
    .orderBy(
      desc(libraryKnowledgeTelemetryRollups.windowStart),
      desc(libraryKnowledgeTelemetryRollups.updatedAt),
      desc(libraryKnowledgeTelemetryRollups.id),
    );

  return rows.map((row) => ({
    ...row,
    metricJson:
      row.metricJson && typeof row.metricJson === "object"
        ? row.metricJson as Record<string, unknown>
        : {},
  }));
}

export async function getLibraryKnowledgeObservabilityReport(input: {
  tenantId: string | number;
  phase?: LibraryKnowledgeRolloutPhase;
  now?: Date;
  dbClient?: DbClient;
}): Promise<LibraryKnowledgeObservabilityReport> {
  const db = input.dbClient ?? await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const tenantId = normalizeTenantId(input.tenantId);
  const now = input.now ?? new Date();
  const telemetry = getLibraryKnowledgeTelemetrySnapshot(tenantId, now);
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    readableMarkdownCount,
    indexedKnowledgeNoteCount,
    staleKnowledgeNoteCount,
    totalRelationCount,
    unresolvedRelationCount,
    ambiguousRelationCount,
    saveToRefreshRows,
    contextPackRows,
    activeOverride,
  ] = await Promise.all([
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.tenantId, tenantId),
            eq(libraryItems.itemType, "md"),
            isNull(libraryItems.deletedAt),
          ),
        ),
    ),
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryKnowledgeNotes)
        .where(eq(libraryKnowledgeNotes.tenantId, tenantId)),
    ),
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryKnowledgeNotes)
        .where(
          and(
            eq(libraryKnowledgeNotes.tenantId, tenantId),
            eq(libraryKnowledgeNotes.isStale, true),
          ),
        ),
    ),
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryKnowledgeRelations)
        .where(eq(libraryKnowledgeRelations.tenantId, tenantId)),
    ),
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryKnowledgeRelations)
        .where(
          and(
            eq(libraryKnowledgeRelations.tenantId, tenantId),
            eq(libraryKnowledgeRelations.resolutionStatus, "unresolved"),
          ),
        ),
    ),
    loadCount(
      db,
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryKnowledgeRelations)
        .where(
          and(
            eq(libraryKnowledgeRelations.tenantId, tenantId),
            eq(libraryKnowledgeRelations.resolutionStatus, "ambiguous"),
          ),
        ),
    ),
    db
      .select({
        latencyMs:
          sql<number>`extract(epoch from ${libraryIndexJobs.knowledgeRefreshCompletedAt} - ${libraryIndexJobs.knowledgeRefreshRequestedAt}) * 1000`,
      })
      .from(libraryIndexJobs)
      .where(
        and(
          eq(libraryIndexJobs.tenantId, tenantId),
          isNotNull(libraryIndexJobs.knowledgeRefreshRequestedAt),
          isNotNull(libraryIndexJobs.knowledgeRefreshCompletedAt),
        ),
      )
      .orderBy(desc(libraryIndexJobs.knowledgeRefreshCompletedAt))
      .limit(200),
    db
      .select({
        readinessStatus: libraryContextPacks.readinessStatus,
        approvedForAgents: libraryContextPacks.approvedForAgents,
      })
      .from(libraryContextPacks)
      .where(
        and(
          eq(libraryContextPacks.tenantId, tenantId),
          isNull(libraryContextPacks.archivedAt),
        ),
      ),
    getActiveLibraryKnowledgeReleaseGateOverride({
      tenantId,
      dbClient: db,
      now,
    }),
  ]);
  const telemetryRollups = await fetchPersistedTelemetryRollups(
    db,
    tenantId,
    windowStart,
  );
  let resolvedPersistedTelemetry = telemetry;
  if (telemetryRollups.length > 0) {
    resolvedPersistedTelemetry = buildTelemetrySnapshotFromPersistedRollups(
      tenantId,
      telemetryRollups,
      now,
    );
  } else {
    const telemetryRows = await fetchPersistedTelemetryRows(
      db,
      tenantId,
      windowStart,
    );
    if (telemetryRows.length > 0) {
      resolvedPersistedTelemetry = buildTelemetrySnapshotFromPersistedEvents(
        tenantId,
        telemetryRows,
        now,
      );
    }
  }
  resolvedPersistedTelemetry.counters.telemetryPersistenceFailureCount =
    telemetry.counters.telemetryPersistenceFailureCount;

  const metrics = buildLibraryKnowledgeMetricSnapshot({
    readableMarkdownCount,
    indexedKnowledgeNoteCount,
    staleKnowledgeNoteCount,
    saveToRefreshLatenciesMs: saveToRefreshRows.map((row) =>
      Math.max(0, Number(row.latencyMs ?? 0))
    ),
    totalRelationCount,
    unresolvedRelationCount,
    ambiguousRelationCount,
    telemetry: resolvedPersistedTelemetry,
  });
  const gate = evaluateLibraryKnowledgeReleaseGate({
    metrics,
    phase: input.phase,
    observed: {
      refreshLatencySampleCount: saveToRefreshRows.length,
      quickSwitchSampleCount:
        resolvedPersistedTelemetry.surfaceLatency.quickSwitch.sampleCount,
      graphSampleCount: resolvedPersistedTelemetry.surfaceLatency.localGraph.sampleCount,
      contextPackResolutionSampleCount:
        resolvedPersistedTelemetry.contextPackResolution.sampleCount,
    },
    scopeType: "tenant",
    scopeId: tenantId,
    windowStart,
    windowEnd: now,
    override: activeOverride,
    now,
  });

  return {
    tenantId,
    generatedAt: now.toISOString(),
    policy: getKnowledgeVaultAccessPolicy(tenantId, {
      releaseGateOverride: activeOverride,
      now,
    }),
    metrics,
    gate,
    telemetry: resolvedPersistedTelemetry,
    coverage: {
      readableMarkdownCount,
      indexedKnowledgeNoteCount,
      staleKnowledgeNoteCount,
    },
    relations: {
      total: totalRelationCount,
      unresolved: unresolvedRelationCount,
      ambiguous: ambiguousRelationCount,
    },
    contextPacks: {
      total: contextPackRows.length,
      trusted: contextPackRows.filter(
        (row) => row.readinessStatus === "trusted",
      ).length,
      reviewPending: contextPackRows.filter(
        (row) => row.readinessStatus === "review_pending",
      ).length,
      stale: contextPackRows.filter(
        (row) => row.readinessStatus === "stale",
      ).length,
      approvedForAgents: contextPackRows.filter(
        (row) => row.approvedForAgents === true,
      ).length,
    },
  };
}
