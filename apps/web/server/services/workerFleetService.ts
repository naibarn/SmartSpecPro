import { and, count, desc, eq, gte, inArray, isNotNull, lt, isNull } from "drizzle-orm";

import { getDb } from "../db";
import {
  assistantProfiles,
  workerArtifacts,
  workerDelegatedSessions,
  workerHeartbeats,
  workerJobEvents,
  workerJobs,
  workers,
} from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";
import {
  delegatedCapabilityManifestSchema,
  type DelegatedCapabilityManifest,
} from "../../shared/workerDelegation";
import {
  sanitizeWorkerPayload,
  sanitizeWorkerWarningFlags,
} from "./workerPayloadSanitizer";
import type { AuditLogEntry } from "./auditLogger";
import {
  getWorkerRuntimeDefinition,
  summarizeHermesProviderRouting,
  summarizeHermesRuntimeChannel,
  summarizeHermesRuntimeMemorySync,
  summarizeHermesRuntimePersona,
  summarizeHermesTaskMode,
} from "../../shared/workerRuntime";

type WorkerRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;
type WorkerDelegatedSessionRecord = Record<string, any>;

const STALE_WORKER_THRESHOLD_MS = 10 * 60 * 1000;
const WORKER_QUEUE_REASSIGNABLE_THRESHOLD_MS = 15 * 60 * 1000;
const WORKER_QUEUE_STALLED_THRESHOLD_MS = 30 * 60 * 1000;
const WORKER_QUEUE_OVERVIEW_JOB_LIMIT = 1_000;
const WORKER_QUEUE_OVERVIEW_EVENT_LIMIT = 2_000;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled", "expired"]);
const RECLAIMABLE_JOB_STATUSES = [
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
] as const;
const MAX_MCP_AUDIT_READ_PER_DAY = 4000;
type WorkerRemoteEndpointPolicy = "loopback_only" | "audited_exception_granted" | "unknown";

export type WorkerFleetAction = "disable" | "drain" | "resume" | "revoke";

export interface WorkerFleetSummary {
  id: string;
  displayName: string;
  runtimeType: string;
  runtimeLabel: string;
  runtimeFamily: string;
  runtimeVersion: string;
  status: string;
  teamId: string | null;
  externalReference: string;
  lastSeenAt: Date | null;
  compatibilityState: "compatible" | "attention_required" | "unknown";
  registrationSupport: "stable" | "feature_gated" | "admin_gated";
  dispatchSupport: "stable" | "limited" | "admin_gated";
  healthState: "healthy" | "stale" | "failed" | "disabled" | "draining" | "unknown";
  warningFlagsJson: string[];
  boundProfileCount: number;
  activeJobCount: number;
  diagnosticsAvailable: boolean;
  dashboardUrl: string | null;
  revokedAt: string | null;
  remoteEndpointPolicy: WorkerRemoteEndpointPolicy | null;
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  personaDisplayLabel: string;
  personaDisplayPurpose: string;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  channelDisplayLabel: string;
  memorySyncEnabled: boolean;
  memorySyncScope: "personal" | "team_shared" | "workspace_shared" | "cross_channel" | null;
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  memorySyncDisplayLabel: string;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  providerRoutingDisplayLabel: string;
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
}

export interface WorkerDiagnosticsSnapshot {
  workerId: string;
  displayName: string;
  runtimeType: string;
  runtimeLabel: string;
  runtimeFamily: string;
  status: string;
  capturedAt: string | null;
  summaryJson: Record<string, unknown>;
  detailsJson: Record<string, unknown>;
  compatibilityState: WorkerFleetSummary["compatibilityState"];
  compatibility: Record<string, unknown> | null;
  warningFlagsJson: string[];
  dashboardUrl: string | null;
  revokedAt: string | null;
  remoteEndpointPolicy: WorkerRemoteEndpointPolicy | null;
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  personaDisplayLabel: string;
  personaDisplayPurpose: string;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  channelDisplayLabel: string;
  memorySyncEnabled: boolean;
  memorySyncScope: "personal" | "team_shared" | "workspace_shared" | "cross_channel" | null;
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  memorySyncDisplayLabel: string;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  providerRoutingDisplayLabel: string;
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
}

export interface WorkerMcpInsightTotals {
  sessionInitializations: number;
  toolListCalls: number;
  toolCalls: number;
  successCount: number;
  deniedCount: number;
  budgetDeniedCount: number;
  approvalRequiredCount: number;
  replayHitCount: number;
  failureCount: number;
}

export interface WorkerMcpFamilyMetric {
  family: string;
  totalCalls: number;
  successCount: number;
  deniedCount: number;
  lastSeenAt: string | null;
}

export interface WorkerMcpToolMetric {
  toolName: string;
  family: string;
  totalCalls: number;
  successCount: number;
  deniedCount: number;
  budgetDeniedCount: number;
  approvalRequiredCount: number;
  replayHitCount: number;
  lastSeenAt: string | null;
}

export interface WorkerMcpRecentEvent {
  timestamp: string;
  traceId: string;
  event: string;
  toolName: string | null;
  family: string | null;
  reason: string | null;
}

export interface WorkerMcpInsights {
  workerId: string;
  displayName: string;
  runtimeType: string;
  generatedAt: string;
  hours: number;
  manifestStatus: "ready" | "stale" | "unavailable";
  manifestReason: string | null;
  activeDelegatedSession: {
    sessionId: string;
    workerJobId: string;
    scopeProfile: string;
    activeMode: ReturnType<typeof summarizeHermesTaskMode>;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  } | null;
  manifest: Pick<
    DelegatedCapabilityManifest,
    "availability" | "mcp" | "discovery" | "scopeProfile" | "workerJobId" | "expiresAt"
  > | null;
  totals: WorkerMcpInsightTotals;
  familyMetrics: WorkerMcpFamilyMetric[];
  toolMetrics: WorkerMcpToolMetric[];
  denialReasons: Array<{ reason: string; count: number }>;
  recentEvents: WorkerMcpRecentEvent[];
}

export interface TenantWorkerMcpOverviewWorkerMetric {
  workerId: string;
  displayName: string;
  runtimeType: string;
  status: string;
  healthState: WorkerFleetSummary["healthState"];
  manifestStatus: WorkerMcpInsights["manifestStatus"];
  toolCalls: number;
  blockedCount: number;
  lastSeenAt: string | null;
  lastEventAt: string | null;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
}

export interface TenantWorkerMcpOverviewRecentEvent extends WorkerMcpRecentEvent {
  workerId: string | null;
  workerDisplayName: string | null;
}

export interface TenantWorkerMcpOverview {
  tenantId: string;
  generatedAt: string;
  hours: number;
  totalWorkers: number;
  workersWithRecentMcpCalls: number;
  workersWithActiveDelegatedSessions: number;
  manifestStatusCounts: Record<WorkerMcpInsights["manifestStatus"], number>;
  operatorPolicy: {
    enabled: boolean;
    disabledFamilies: string[];
    disabledToolGroups: string[];
    approvalRequiredToolGroups: string[];
  };
  totals: WorkerMcpInsightTotals;
  familyMetrics: WorkerMcpFamilyMetric[];
  toolMetrics: WorkerMcpToolMetric[];
  denialReasons: Array<{ reason: string; count: number }>;
  workerMetrics: TenantWorkerMcpOverviewWorkerMetric[];
  recentEvents: TenantWorkerMcpOverviewRecentEvent[];
}

export interface WorkerRetentionCleanupResult {
  deletedHeartbeats: number;
  deletedJobEvents: number;
  deletedUnpublishedArtifacts: number;
  expiredJobs: number;
}

export interface WorkerLegacyRedactionResult {
  tenantId: string;
  scannedWorkers: number;
  updatedWorkers: number;
  scannedArtifacts: number;
  updatedArtifacts: number;
}

type WorkerQueueOverviewJobRecord = Pick<
  WorkerRecord,
  | "id"
  | "workerId"
  | "runtimeType"
  | "jobType"
  | "status"
  | "statusReason"
  | "failureReason"
  | "createdAt"
  | "startedAt"
  | "finishedAt"
  | "leaseExpiresAt"
  | "outputJson"
>;

interface WorkerQueueOverviewEventRecord {
  workerJobId: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}

export interface WorkerQueueOverviewRecentJob {
  id: string;
  workerId: string | null;
  workerDisplayName: string | null;
  runtimeType: string;
  jobType: string;
  status: string;
  statusReason: string | null;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  leaseExpiresAt: string | null;
}

export interface WorkerQueueOverview {
  tenantId: string;
  generatedAt: string;
  hours: number;
  totalJobs: number;
  queuedJobCount: number;
  activeJobCount: number;
  stalledJobCount: number;
  reassignableJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  canceledJobCount: number;
  oldestQueuedAt: string | null;
  oldestQueuedAgeMs: number | null;
  verificationFailureCount: number;
  staleUploadRejectionCount: number;
  reassignmentCount: number;
  securityWarningCounts: {
    tokenReplay: number;
    deviceProofMismatch: number;
    refreshTokenReuse: number;
    autoBlockedConnection: number;
  };
  runtimeVersionDistribution: Array<{
    runtimeType: string;
    runtimeVersion: string;
    count: number;
  }>;
  recentJobs: WorkerQueueOverviewRecentJob[];
}

interface WorkerFleetRepository {
  cleanupHeartbeatsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  cleanupJobEventsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  cleanupUnpublishedArtifactsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  expireStaleJobsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  getWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  getLatestDelegatedSessionForWorker: (
    tenantId: string,
    workerId: string,
  ) => Promise<WorkerDelegatedSessionRecord | null>;
  listArtifactsByTenant: (tenantId: string) => Promise<WorkerArtifactRecord[]>;
  listActiveJobCounts: (tenantId: string) => Promise<Array<{ workerId: string | null; activeJobCount: number }>>;
  listBindingCounts: (tenantId: string) => Promise<Array<{ workerId: string | null; boundProfileCount: number }>>;
  listQueueOverviewEvents: (tenantId: string, since: Date) => Promise<WorkerQueueOverviewEventRecord[]>;
  listQueueOverviewJobs: (tenantId: string) => Promise<WorkerQueueOverviewJobRecord[]>;
  listWorkersByTenant: (tenantId: string) => Promise<WorkerRecord[]>;
  updateArtifact: (artifactId: string, values: Record<string, unknown>) => Promise<WorkerArtifactRecord>;
  updateWorker: (workerId: string, values: Record<string, unknown>) => Promise<WorkerRecord>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function readCompatibility(worker: WorkerRecord): Record<string, unknown> | null {
  const healthSummary = asRecord(worker.healthSummaryJson);
  const controlPlane = healthSummary ? asRecord(healthSummary.controlPlane) : null;
  return controlPlane ? asRecord(controlPlane.compatibility) : null;
}

function readRemoteEndpointPolicy(worker: WorkerRecord): WorkerRemoteEndpointPolicy | null {
  if (worker.runtimeType !== "hermes_agent_gateway") {
    return null;
  }

  const healthSummary = asRecord(worker.healthSummaryJson);
  const controlPlane = healthSummary ? asRecord(healthSummary.controlPlane) : null;
  const policy = controlPlane && typeof controlPlane.remoteEndpointPolicy === "string"
    ? controlPlane.remoteEndpointPolicy
    : null;
  if (policy === "loopback_only" || policy === "audited_exception_granted") {
    return policy;
  }
  return "unknown";
}

function readHermesPersonaSummary(worker: WorkerRecord): ReturnType<typeof summarizeHermesRuntimePersona> {
  if (worker.runtimeType !== "hermes_agent_gateway") {
    return summarizeHermesRuntimePersona(null);
  }
  const capabilities = isPlainObject(worker.capabilitiesJson) ? worker.capabilitiesJson : null;
  const runtimeMetadata = capabilities && isPlainObject(capabilities.runtimeMetadata)
    ? capabilities.runtimeMetadata
    : null;
  return summarizeHermesRuntimePersona(runtimeMetadata);
}

function readHermesRuntimeChannelSummary(worker: WorkerRecord): ReturnType<typeof summarizeHermesRuntimeChannel> {
  if (worker.runtimeType !== "hermes_agent_gateway") {
    return summarizeHermesRuntimeChannel(null, worker.status, readRevokedAt(worker));
  }
  const capabilities = isPlainObject(worker.capabilitiesJson) ? worker.capabilitiesJson : null;
  const runtimeMetadata = capabilities && isPlainObject(capabilities.runtimeMetadata)
    ? capabilities.runtimeMetadata
    : null;
  return summarizeHermesRuntimeChannel(runtimeMetadata, worker.status, readRevokedAt(worker));
}

function readHermesRuntimeMemorySyncSummary(worker: WorkerRecord): ReturnType<typeof summarizeHermesRuntimeMemorySync> {
  if (worker.runtimeType !== "hermes_agent_gateway") {
    return summarizeHermesRuntimeMemorySync(null);
  }
  const capabilities = isPlainObject(worker.capabilitiesJson) ? worker.capabilitiesJson : null;
  const runtimeMetadata = capabilities && isPlainObject(capabilities.runtimeMetadata)
    ? capabilities.runtimeMetadata
    : null;
  return summarizeHermesRuntimeMemorySync(runtimeMetadata);
}

function summarizeWorkerAccessPolicy(
  worker: WorkerRecord,
): {
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
} {
  const capabilities = isPlainObject(worker.capabilitiesJson) ? worker.capabilitiesJson : null;
  const runtimeMetadata = capabilities && isPlainObject(capabilities.runtimeMetadata)
    ? capabilities.runtimeMetadata
    : null;
  const policy = runtimeMetadata && isPlainObject(runtimeMetadata.workerAccessPolicy)
    ? runtimeMetadata.workerAccessPolicy
    : null;
  if (!policy) {
    return {
      workerAccessPolicyPreset: null,
      workerAccessPolicyScopeCount: 0,
      workerAccessPolicyQuotaDisplayLabel: "Policy unavailable",
    };
  }

  const permissionPreset = typeof policy.permissionPreset === "string" && policy.permissionPreset.trim().length > 0
    ? policy.permissionPreset.trim()
    : null;
  const permissionScopes = Array.isArray(policy.permissionScopes)
    ? policy.permissionScopes.filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0)
    : [];
  const quotaParts = [
    policy.quotaHourly ? `H${policy.quotaHourly}` : null,
    policy.quotaDaily ? `D${policy.quotaDaily}` : null,
    policy.quotaWeekly ? `W${policy.quotaWeekly}` : null,
    policy.quotaMonthly ? `M${policy.quotaMonthly}` : null,
  ].filter((part): part is string => Boolean(part));
  const quotaDisplay = quotaParts.length > 0 ? quotaParts.join(" / ") : "No quota limits";

  return {
    workerAccessPolicyPreset: permissionPreset,
    workerAccessPolicyScopeCount: permissionScopes.length,
    workerAccessPolicyQuotaDisplayLabel: quotaDisplay,
  };
}

function deriveCompatibilityState(
  compatibility: Record<string, unknown> | null,
): WorkerFleetSummary["compatibilityState"] {
  if (!compatibility) {
    return "unknown";
  }
  const transport = asRecord(compatibility.transport);
  const runtimeFamily = asRecord(compatibility.runtimeFamily);
  const runtimeProfile = asRecord(compatibility.runtimeProfile);
  const allCompatible = [transport, runtimeFamily, runtimeProfile].every(
    (lane) => lane?.compatible === true,
  );
  return allCompatible ? "compatible" : "attention_required";
}

function sanitizeDashboardUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readRevokedAt(worker: WorkerRecord): string | null {
  if (!isPlainObject(worker.healthSummaryJson)) {
    return null;
  }
  const controlPlane = worker.healthSummaryJson.controlPlane;
  if (!isPlainObject(controlPlane)) {
    return null;
  }
  return typeof controlPlane.revokedAt === "string" && controlPlane.revokedAt.trim()
    ? controlPlane.revokedAt
    : null;
}

function deriveHealthState(worker: WorkerRecord): WorkerFleetSummary["healthState"] {
  if (worker.status === "disabled") return "disabled";
  if (worker.status === "draining") return "draining";
  if (worker.status === "offline" || worker.status === "unhealthy") return "failed";
  if (!worker.lastSeenAt) return "unknown";
  const ageMs = Date.now() - new Date(worker.lastSeenAt).getTime();
  if (ageMs > STALE_WORKER_THRESHOLD_MS) return "stale";
  return "healthy";
}

function readAffectedRowCount(result: unknown): number {
  if (typeof result === "object" && result && "rowCount" in result) {
    const rowCount = (result as { rowCount?: unknown }).rowCount;
    return typeof rowCount === "number" ? rowCount : 0;
  }
  return 0;
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIsoOrNull(value: unknown): string | null {
  return toDateOrNull(value)?.toISOString() ?? null;
}

function eventSearchText(event: WorkerQueueOverviewEventRecord): string {
  return `${event.eventType} ${JSON.stringify(event.payloadJson ?? {})}`.toLowerCase();
}

function eventIncludesAny(event: WorkerQueueOverviewEventRecord, tokens: string[]): boolean {
  const text = eventSearchText(event);
  return tokens.some((token) => text.includes(token.toLowerCase()));
}

function readJobAssignmentStartedAtMs(job: WorkerQueueOverviewJobRecord): number | null {
  const output = asRecord(job.outputJson);
  const assignedAt = output
    ? toDateOrNull(output.assignedAt ?? output.assignmentStartedAt ?? output.assignmentClaimedAt)
    : null;
  const startedAt = toDateOrNull(job.startedAt);
  const createdAt = toDateOrNull(job.createdAt);
  return (assignedAt ?? startedAt ?? createdAt)?.getTime() ?? null;
}

function jobHasFailedVerification(job: WorkerQueueOverviewJobRecord): boolean {
  const output = asRecord(job.outputJson);
  const report = output ? asRecord(output.hyperframesWorkerVerification) : null;
  return report?.status === "failed" || Boolean(report?.failureCode);
}

function enumerateDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const finish = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cursor.getTime() <= finish.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function deriveMcpFamily(toolName: string | null | undefined): string | null {
  if (!toolName) {
    return null;
  }
  const normalized = String(toolName).trim();
  const match = /^smartspec\.([^.]+)\./.exec(normalized);
  return match?.[1] ?? null;
}

function coerceManifest(value: unknown): Pick<
  DelegatedCapabilityManifest,
  "availability" | "mcp" | "discovery" | "scopeProfile" | "activeMode" | "workerJobId" | "expiresAt"
> | null {
  const parsed = delegatedCapabilityManifestSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return {
    availability: parsed.data.availability,
    mcp: parsed.data.mcp,
    discovery: parsed.data.discovery,
    scopeProfile: parsed.data.scopeProfile,
    activeMode: parsed.data.activeMode ?? summarizeHermesTaskMode(parsed.data.scopeProfile),
    workerJobId: parsed.data.workerJobId,
    expiresAt: parsed.data.expiresAt,
  };
}

async function getRecentMcpAuditEntriesForWorker(
  tenantId: string,
  workerId: string,
  hours: number,
): Promise<AuditLogEntry[]> {
  const entries = await getRecentMcpAuditEntriesForTenant(tenantId, hours);
  return entries.filter((entry) => {
    const metadata = asRecord(entry.metadata);
    return metadata?.workerId === workerId;
  });
}

async function getRecentMcpAuditEntriesForTenant(
  tenantId: string,
  hours: number,
): Promise<AuditLogEntry[]> {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const dates = enumerateDatesBetween(since, now);
  const entries = (await Promise.all(
    dates.map((date) => auditLogger.readEntries({
      date,
      eventType: "mcp_tool_call",
      limit: MAX_MCP_AUDIT_READ_PER_DAY,
      sortOrder: "desc",
    })),
  )).flat();

  return entries
    .filter((entry) => {
      const timestamp = entry?.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (!timestamp || timestamp < since.getTime()) {
        return false;
      }
      const metadata = asRecord(entry.metadata);
      return metadata?.tenantId === tenantId;
    })
    .sort((a, b) => {
      const left = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const right = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return right - left;
    });
}

function summarizeLatestSessionManifest(
  latestSession: WorkerDelegatedSessionRecord | null,
): {
  manifestStatus: WorkerMcpInsights["manifestStatus"];
  activeDelegatedSession: boolean;
  manifest: WorkerMcpInsights["manifest"];
} {
  if (!latestSession) {
    return {
      manifestStatus: "unavailable",
      activeDelegatedSession: false,
      manifest: null,
    };
  }

  const manifest = coerceManifest(latestSession.manifestJson);
  const isActive = !latestSession.revokedAt && new Date(latestSession.expiresAt).getTime() > Date.now();
  if (isActive && manifest) {
    return {
      manifestStatus: "ready",
      activeDelegatedSession: true,
      manifest,
    };
  }

  return {
    manifestStatus: manifest ? "stale" : "unavailable",
    activeDelegatedSession: isActive,
    manifest,
  };
}

const defaultRepo: WorkerFleetRepository = {
  async cleanupHeartbeatsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantWorkers = await db
      .select({ workerId: workers.id })
      .from(workers)
      .where(eq(workers.tenantId, tenantId));
    const workerIds = tenantWorkers.map((row) => row.workerId);
    if (!workerIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerHeartbeats)
      .where(and(inArray(workerHeartbeats.workerId, workerIds), lt(workerHeartbeats.createdAt, cutoff)));
    return readAffectedRowCount(deleted);
  },
  async cleanupJobEventsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantJobs = await db
      .select({ jobId: workerJobs.id })
      .from(workerJobs)
      .where(eq(workerJobs.tenantId, tenantId));
    const jobIds = tenantJobs.map((row) => row.jobId);
    if (!jobIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerJobEvents)
      .where(and(inArray(workerJobEvents.workerJobId, jobIds), lt(workerJobEvents.createdAt, cutoff)));
    return readAffectedRowCount(deleted);
  },
  async cleanupUnpublishedArtifactsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantJobs = await db
      .select({ jobId: workerJobs.id })
      .from(workerJobs)
      .where(eq(workerJobs.tenantId, tenantId));
    const jobIds = tenantJobs.map((row) => row.jobId);
    if (!jobIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerArtifacts)
      .where(
        and(
          inArray(workerArtifacts.workerJobId, jobIds),
          isNull(workerArtifacts.publishedItemId),
          lt(workerArtifacts.createdAt, cutoff),
        ),
      );
    return readAffectedRowCount(deleted);
  },
  async expireStaleJobsBefore(tenantId, cutoff) {
    const db = await getDb();
    const updated = await db
      .update(workerJobs)
      .set({
        status: "expired",
        statusReason: "Worker lease expired during retention cleanup",
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          inArray(workerJobs.status, [...RECLAIMABLE_JOB_STATUSES]),
          lt(workerJobs.leaseExpiresAt, cutoff),
          isNull(workerJobs.finishedAt),
        ),
      );
    return readAffectedRowCount(updated);
  },
  async getWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },
  async getLatestDelegatedSessionForWorker(tenantId, workerId) {
    const db = await getDb();
    const [session] = await db
      .select()
      .from(workerDelegatedSessions)
      .where(and(
        eq(workerDelegatedSessions.tenantId, tenantId),
        eq(workerDelegatedSessions.workerId, workerId),
      ))
      .orderBy(desc(workerDelegatedSessions.createdAt))
      .limit(1);
    return session ?? null;
  },
  async listArtifactsByTenant(tenantId) {
    const db = await getDb();
    return db
      .select({
        id: workerArtifacts.id,
        workerJobId: workerArtifacts.workerJobId,
        artifactType: workerArtifacts.artifactType,
        storageRef: workerArtifacts.storageRef,
        metadataJson: workerArtifacts.metadataJson,
        publishedItemId: workerArtifacts.publishedItemId,
        createdAt: workerArtifacts.createdAt,
      })
      .from(workerArtifacts)
      .innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId))
      .where(eq(workerJobs.tenantId, tenantId));
  },
  async listActiveJobCounts(tenantId) {
    const db = await getDb();
    return db
      .select({
        workerId: workerJobs.workerId,
        activeJobCount: count(),
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          inArray(workerJobs.status, ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"]),
        ),
      )
      .groupBy(workerJobs.workerId);
  },
  async listBindingCounts(tenantId) {
    const db = await getDb();
    return db
      .select({
        workerId: assistantProfiles.externalWorkerId,
        boundProfileCount: count(),
      })
      .from(assistantProfiles)
      .where(
        and(
          eq(assistantProfiles.tenantId, tenantId),
          eq(assistantProfiles.memberKind, "external_connector"),
          isNotNull(assistantProfiles.externalWorkerId),
        ),
      )
      .groupBy(assistantProfiles.externalWorkerId);
  },
  async listQueueOverviewJobs(tenantId) {
    const db = await getDb();
    return db
      .select({
        id: workerJobs.id,
        workerId: workerJobs.workerId,
        runtimeType: workerJobs.runtimeType,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        failureReason: workerJobs.failureReason,
        createdAt: workerJobs.createdAt,
        startedAt: workerJobs.startedAt,
        finishedAt: workerJobs.finishedAt,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
        outputJson: workerJobs.outputJson,
      })
      .from(workerJobs)
      .where(eq(workerJobs.tenantId, tenantId))
      .orderBy(desc(workerJobs.createdAt))
      .limit(WORKER_QUEUE_OVERVIEW_JOB_LIMIT);
  },
  async listQueueOverviewEvents(tenantId, since) {
    const db = await getDb();
    return db
      .select({
        workerJobId: workerJobEvents.workerJobId,
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
        createdAt: workerJobEvents.createdAt,
      })
      .from(workerJobEvents)
      .innerJoin(workerJobs, eq(workerJobs.id, workerJobEvents.workerJobId))
      .where(and(eq(workerJobs.tenantId, tenantId), gte(workerJobEvents.createdAt, since)))
      .orderBy(desc(workerJobEvents.createdAt))
      .limit(WORKER_QUEUE_OVERVIEW_EVENT_LIMIT);
  },
  async listWorkersByTenant(tenantId) {
    const db = await getDb();
    return db
      .select()
      .from(workers)
      .where(eq(workers.tenantId, tenantId))
      .orderBy(desc(workers.lastSeenAt), workers.displayName);
  },
  async updateWorker(workerId, values) {
    const db = await getDb();
    const [worker] = await db
      .update(workers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    return worker;
  },
  async updateArtifact(artifactId, values) {
    const db = await getDb();
    const [artifact] = await db
      .update(workerArtifacts)
      .set(values)
      .where(eq(workerArtifacts.id, artifactId))
      .returning();
    if (!artifact) {
      throw new Error(`Worker artifact ${artifactId} not found`);
    }
    return artifact;
  },
};

export function getWorkerFleetDefaultRepository(): WorkerFleetRepository {
  return defaultRepo;
}

export async function listWorkerFleet(
  tenantId: string,
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerFleetSummary[]> {
  const repo = deps.repo ?? defaultRepo;
  const [workerRows, bindingCounts, activeJobCounts] = await Promise.all([
    repo.listWorkersByTenant(tenantId),
    repo.listBindingCounts(tenantId),
    repo.listActiveJobCounts(tenantId),
  ]);

  const bindingMap = new Map(
    bindingCounts
      .filter((row) => typeof row.workerId === "string" && row.workerId.length > 0)
      .map((row) => [row.workerId, Number(row.boundProfileCount ?? 0)]),
  );
  const activeJobMap = new Map(
    activeJobCounts
      .filter((row) => typeof row.workerId === "string" && row.workerId.length > 0)
      .map((row) => [row.workerId, Number(row.activeJobCount ?? 0)]),
  );

  return workerRows.map((worker) => {
    const runtimeDefinition = getWorkerRuntimeDefinition(worker.runtimeType);
    const compatibility = readCompatibility(worker);
    const personaSummary = readHermesPersonaSummary(worker);
    const channelSummary = readHermesRuntimeChannelSummary(worker);
    const memorySyncSummary = readHermesRuntimeMemorySyncSummary(worker);
    const accessPolicySummary = summarizeWorkerAccessPolicy(worker);
    const providerRoutingSummary = summarizeHermesProviderRouting(
      (worker.capabilitiesJson as Record<string, unknown> | null | undefined)?.runtimeMetadata as Record<string, unknown> | null | undefined,
    );

    return {
      id: worker.id,
      displayName: worker.displayName,
      runtimeType: worker.runtimeType,
      runtimeLabel: runtimeDefinition.displayName,
      runtimeFamily: runtimeDefinition.familyName,
      runtimeVersion: worker.runtimeVersion,
      status: worker.status,
      teamId: worker.teamId ?? null,
      externalReference: worker.externalReference,
      lastSeenAt: worker.lastSeenAt ?? null,
      compatibilityState: deriveCompatibilityState(compatibility),
      registrationSupport: runtimeDefinition.registrationSupport,
      dispatchSupport: runtimeDefinition.dispatchSupport,
      healthState: deriveHealthState(worker),
      warningFlagsJson: Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : [],
      boundProfileCount: bindingMap.get(worker.id) ?? 0,
      activeJobCount: activeJobMap.get(worker.id) ?? 0,
      diagnosticsAvailable: isPlainObject(worker.healthSummaryJson) && isPlainObject(worker.healthSummaryJson.details),
      dashboardUrl: sanitizeDashboardUrl(worker.dashboardUrl),
      revokedAt: readRevokedAt(worker),
      remoteEndpointPolicy: readRemoteEndpointPolicy(worker),
      profileName: personaSummary.profileName,
      profileLabel: personaSummary.profileLabel,
      profilePurpose: personaSummary.profilePurpose,
      personaDisplayLabel: personaSummary.displayLabel,
      personaDisplayPurpose: personaSummary.displayPurpose,
      channelStatus: channelSummary.channelStatus,
      channelDisplayLabel: channelSummary.displayLabel,
      memorySyncEnabled: memorySyncSummary.memorySyncEnabled,
      memorySyncScope: memorySyncSummary.memorySyncScope,
      memorySyncStatus: memorySyncSummary.memorySyncStatus,
      memorySyncDisplayLabel: memorySyncSummary.displayLabel,
      llmRoutingMode: providerRoutingSummary.llmRoutingMode,
      preferredProviderId: providerRoutingSummary.preferredProviderId,
      preferredProviderName: providerRoutingSummary.preferredProviderName,
      providerRoutingDisplayLabel: providerRoutingSummary.displayLabel,
      workerAccessPolicyPreset: accessPolicySummary.workerAccessPolicyPreset,
      workerAccessPolicyScopeCount: accessPolicySummary.workerAccessPolicyScopeCount,
      workerAccessPolicyQuotaDisplayLabel: accessPolicySummary.workerAccessPolicyQuotaDisplayLabel,
    };
  });
}

export async function getWorkerQueueOverview(
  tenantId: string,
  input: {
    hours?: number;
    now?: Date;
  } = {},
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerQueueOverview> {
  const repo = deps.repo ?? defaultRepo;
  const now = input.now ?? new Date();
  const hours = Math.min(168, Math.max(1, Math.floor(input.hours ?? 24)));
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const [workerRows, jobRows, eventRows] = await Promise.all([
    repo.listWorkersByTenant(tenantId),
    repo.listQueueOverviewJobs(tenantId),
    repo.listQueueOverviewEvents(tenantId, since),
  ]);

  const workerNameById = new Map(
    workerRows.map((worker) => [String(worker.id), String(worker.displayName ?? worker.id)]),
  );
  const runtimeVersionCounts = new Map<string, {
    runtimeType: string;
    runtimeVersion: string;
    count: number;
  }>();
  for (const worker of workerRows) {
    const runtimeType = String(worker.runtimeType ?? "unknown");
    const runtimeVersion = String(worker.runtimeVersion ?? "unknown");
    const key = `${runtimeType}\u0000${runtimeVersion}`;
    const existing = runtimeVersionCounts.get(key) ?? { runtimeType, runtimeVersion, count: 0 };
    existing.count += 1;
    runtimeVersionCounts.set(key, existing);
  }

  let queuedJobCount = 0;
  let activeJobCount = 0;
  let stalledJobCount = 0;
  let reassignableJobCount = 0;
  let completedJobCount = 0;
  let failedJobCount = 0;
  let canceledJobCount = 0;
  let oldestQueuedAtMs: number | null = null;
  let verificationFailureCount = 0;

  for (const job of jobRows) {
    const status = String(job.status ?? "");
    if (status === "queued") {
      queuedJobCount += 1;
      const createdAtMs = toDateOrNull(job.createdAt)?.getTime() ?? null;
      if (createdAtMs !== null && (oldestQueuedAtMs === null || createdAtMs < oldestQueuedAtMs)) {
        oldestQueuedAtMs = createdAtMs;
      }
    }
    if (!TERMINAL_JOB_STATUSES.has(status) && status !== "queued") {
      activeJobCount += 1;
      const activeSinceMs = readJobAssignmentStartedAtMs(job);
      const leaseExpiresAtMs = toDateOrNull(job.leaseExpiresAt)?.getTime() ?? null;
      const activeAgeMs = activeSinceMs === null ? null : now.getTime() - activeSinceMs;
      if (
        (leaseExpiresAtMs !== null && leaseExpiresAtMs < now.getTime())
        || (activeAgeMs !== null && activeAgeMs >= WORKER_QUEUE_STALLED_THRESHOLD_MS)
      ) {
        stalledJobCount += 1;
      }
      if (activeAgeMs !== null && activeAgeMs >= WORKER_QUEUE_REASSIGNABLE_THRESHOLD_MS) {
        reassignableJobCount += 1;
      }
    }
    if (status === "completed") completedJobCount += 1;
    if (status === "failed") failedJobCount += 1;
    if (status === "canceled") canceledJobCount += 1;
    if (jobHasFailedVerification(job)) {
      verificationFailureCount += 1;
    }
  }

  let staleUploadRejectionCount = 0;
  let reassignmentCount = 0;
  const securityWarningCounts: WorkerQueueOverview["securityWarningCounts"] = {
    tokenReplay: 0,
    deviceProofMismatch: 0,
    refreshTokenReuse: 0,
    autoBlockedConnection: 0,
  };

  for (const event of eventRows) {
    if (eventIncludesAny(event, [
      "server_verification_failed",
      "verification_failed",
      "artifact_publish_failed",
    ])) {
      verificationFailureCount += 1;
    }
    if (eventIncludesAny(event, [
      "stale_assignment_attempt",
      "stale_worker_lease",
      "stale artifact upload",
      "stale upload",
    ])) {
      staleUploadRejectionCount += 1;
    }
    if (event.eventType === "job.requeued" || eventIncludesAny(event, ["worker_job_requeued", "reassign", "requeued"])) {
      reassignmentCount += 1;
    }
    if (eventIncludesAny(event, ["token_replay", "worker_token_replay", "worker_device_proof_replay"])) {
      securityWarningCounts.tokenReplay += 1;
    }
    if (eventIncludesAny(event, ["worker_device_mismatch", "device proof mismatch", "device_proof_mismatch"])) {
      securityWarningCounts.deviceProofMismatch += 1;
    }
    if (eventIncludesAny(event, ["refresh_token_reuse", "worker_refresh_reuse", "refresh token reuse"])) {
      securityWarningCounts.refreshTokenReuse += 1;
    }
    if (eventIncludesAny(event, ["worker_connection_blocked", "auto_blocked_connection", "connection blocked"])) {
      securityWarningCounts.autoBlockedConnection += 1;
    }
  }

  const oldestQueuedAt = oldestQueuedAtMs === null ? null : new Date(oldestQueuedAtMs).toISOString();
  const sortedJobs = [...jobRows].sort((left, right) => {
    const leftMs = toDateOrNull(left.createdAt)?.getTime() ?? 0;
    const rightMs = toDateOrNull(right.createdAt)?.getTime() ?? 0;
    return rightMs - leftMs;
  });

  return {
    tenantId,
    generatedAt: now.toISOString(),
    hours,
    totalJobs: jobRows.length,
    queuedJobCount,
    activeJobCount,
    stalledJobCount,
    reassignableJobCount,
    completedJobCount,
    failedJobCount,
    canceledJobCount,
    oldestQueuedAt,
    oldestQueuedAgeMs: oldestQueuedAtMs === null ? null : Math.max(0, now.getTime() - oldestQueuedAtMs),
    verificationFailureCount,
    staleUploadRejectionCount,
    reassignmentCount,
    securityWarningCounts,
    runtimeVersionDistribution: [...runtimeVersionCounts.values()].sort((left, right) =>
      left.runtimeType.localeCompare(right.runtimeType)
      || left.runtimeVersion.localeCompare(right.runtimeVersion)),
    recentJobs: sortedJobs.slice(0, 20).map((job) => ({
      id: String(job.id),
      workerId: typeof job.workerId === "string" && job.workerId.trim() ? job.workerId : null,
      workerDisplayName: typeof job.workerId === "string" && workerNameById.has(job.workerId)
        ? workerNameById.get(job.workerId)!
        : null,
      runtimeType: String(job.runtimeType ?? "unknown"),
      jobType: String(job.jobType ?? "unknown"),
      status: String(job.status ?? "unknown"),
      statusReason: typeof job.statusReason === "string" ? job.statusReason : null,
      failureReason: typeof job.failureReason === "string" ? job.failureReason : null,
      createdAt: toDateOrNull(job.createdAt)?.toISOString() ?? now.toISOString(),
      startedAt: toIsoOrNull(job.startedAt),
      finishedAt: toIsoOrNull(job.finishedAt),
      leaseExpiresAt: toIsoOrNull(job.leaseExpiresAt),
    })),
  };
}

export async function getWorkerDiagnosticsSnapshot(
  tenantId: string,
  workerId: string,
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerDiagnosticsSnapshot> {
  const repo = deps.repo ?? defaultRepo;
  const worker = await repo.getWorkerById(tenantId, workerId);
  if (!worker) {
    throw new Error(`Worker ${workerId} not found`);
  }

  const healthSummary = isPlainObject(worker.healthSummaryJson) ? worker.healthSummaryJson : {};
  const runtimeDefinition = getWorkerRuntimeDefinition(worker.runtimeType);
  const compatibility = readCompatibility(worker);
  const personaSummary = readHermesPersonaSummary(worker);
  const channelSummary = readHermesRuntimeChannelSummary(worker);
  const memorySyncSummary = readHermesRuntimeMemorySyncSummary(worker);
  const accessPolicySummary = summarizeWorkerAccessPolicy(worker);
  const providerRoutingSummary = summarizeHermesProviderRouting(
    (worker.capabilitiesJson as Record<string, unknown> | null | undefined)?.runtimeMetadata as Record<string, unknown> | null | undefined,
  );

  return {
    workerId: worker.id,
    displayName: worker.displayName,
    runtimeType: worker.runtimeType,
    runtimeLabel: runtimeDefinition.displayName,
    runtimeFamily: runtimeDefinition.familyName,
    status: worker.status,
    capturedAt: typeof healthSummary.capturedAt === "string" ? healthSummary.capturedAt : null,
    summaryJson: sanitizeWorkerPayload(isPlainObject(healthSummary.summary) ? healthSummary.summary : {}) as Record<string, unknown>,
    detailsJson: sanitizeWorkerPayload(isPlainObject(healthSummary.details) ? healthSummary.details : {}) as Record<string, unknown>,
    compatibilityState: deriveCompatibilityState(compatibility),
    compatibility,
    warningFlagsJson: sanitizeWorkerWarningFlags(worker.warningFlagsJson),
    dashboardUrl: sanitizeDashboardUrl(worker.dashboardUrl),
    revokedAt: readRevokedAt(worker),
    remoteEndpointPolicy: readRemoteEndpointPolicy(worker),
    profileName: personaSummary.profileName,
    profileLabel: personaSummary.profileLabel,
    profilePurpose: personaSummary.profilePurpose,
    personaDisplayLabel: personaSummary.displayLabel,
    personaDisplayPurpose: personaSummary.displayPurpose,
    channelStatus: channelSummary.channelStatus,
    channelDisplayLabel: channelSummary.displayLabel,
    memorySyncEnabled: memorySyncSummary.memorySyncEnabled,
    memorySyncScope: memorySyncSummary.memorySyncScope,
    memorySyncStatus: memorySyncSummary.memorySyncStatus,
    memorySyncDisplayLabel: memorySyncSummary.displayLabel,
    llmRoutingMode: providerRoutingSummary.llmRoutingMode,
    preferredProviderId: providerRoutingSummary.preferredProviderId,
    preferredProviderName: providerRoutingSummary.preferredProviderName,
    providerRoutingDisplayLabel: providerRoutingSummary.displayLabel,
    workerAccessPolicyPreset: accessPolicySummary.workerAccessPolicyPreset,
    workerAccessPolicyScopeCount: accessPolicySummary.workerAccessPolicyScopeCount,
    workerAccessPolicyQuotaDisplayLabel: accessPolicySummary.workerAccessPolicyQuotaDisplayLabel,
  };
}

export async function getWorkerMcpInsights(
  tenantId: string,
  workerId: string,
  input: {
    hours?: number;
  } = {},
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerMcpInsights> {
  const repo = deps.repo ?? defaultRepo;
  const hours = Math.min(168, Math.max(1, Math.floor(input.hours ?? 24)));
  const [worker, latestSession, auditEntries] = await Promise.all([
    repo.getWorkerById(tenantId, workerId),
    repo.getLatestDelegatedSessionForWorker(tenantId, workerId),
    getRecentMcpAuditEntriesForWorker(tenantId, workerId, hours),
  ]);

  if (!worker) {
    throw new Error(`Worker ${workerId} not found`);
  }

  const storedManifest = latestSession ? coerceManifest(latestSession.manifestJson) : null;
  let manifest: WorkerMcpInsights["manifest"] = storedManifest;
  let manifestStatus: WorkerMcpInsights["manifestStatus"] = summarizeLatestSessionManifest(latestSession).manifestStatus;
  let manifestReason: string | null = latestSession ? null : "No delegated worker session has been observed yet";

  if (latestSession && !latestSession.revokedAt && new Date(latestSession.expiresAt).getTime() > Date.now()) {
    try {
      const { getDelegatedWorkerManifestBySessionId } = await import("./workerDelegationService");
      manifest = coerceManifest(await getDelegatedWorkerManifestBySessionId({
        delegatedSessionId: String(latestSession.id),
      }));
      manifestStatus = manifest ? "ready" : "unavailable";
      manifestReason = manifest ? null : "Active delegated session does not have a readable manifest";
    } catch (error) {
      manifestStatus = storedManifest ? "stale" : "unavailable";
      manifestReason = error instanceof Error ? error.message : "Unable to rebuild delegated MCP manifest";
    }
  } else if (latestSession?.revokedAt) {
    manifestReason = "Latest delegated worker session has been revoked";
  } else if (latestSession) {
    manifestReason = "Latest delegated worker session has expired";
  }

  const totals: WorkerMcpInsightTotals = {
    sessionInitializations: 0,
    toolListCalls: 0,
    toolCalls: 0,
    successCount: 0,
    deniedCount: 0,
    budgetDeniedCount: 0,
    approvalRequiredCount: 0,
    replayHitCount: 0,
    failureCount: 0,
  };
  const familyMetrics = new Map<string, WorkerMcpFamilyMetric>();
  const toolMetrics = new Map<string, WorkerMcpToolMetric>();
  const denialReasons = new Map<string, number>();

  for (const entry of auditEntries) {
    const metadata = asRecord(entry.metadata) ?? {};
    const event = typeof metadata.event === "string" ? metadata.event : "unknown";
    const toolName = typeof metadata.toolName === "string" && metadata.toolName.trim()
      ? metadata.toolName.trim()
      : null;
    const family = deriveMcpFamily(toolName);
    const reason = typeof metadata.reason === "string" && metadata.reason.trim()
      ? metadata.reason.trim()
      : null;

    if (event === "initialize") totals.sessionInitializations += 1;
    if (event === "tools_list") totals.toolListCalls += 1;
    if (toolName) totals.toolCalls += 1;
    if (event === "execute_success") totals.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied") totals.deniedCount += 1;
    if (event === "budget_denied") totals.budgetDeniedCount += 1;
    if (event === "approval_required") totals.approvalRequiredCount += 1;
    if (event === "idempotency_replay_hit") totals.replayHitCount += 1;
    if (event === "execution_failed" || event === "tools_list_failed" || event === "idempotency_rejected") {
      totals.failureCount += 1;
    }
    if (reason && (event === "execution_denied" || event === "owner_resource_denied" || event === "budget_denied" || event === "approval_required")) {
      denialReasons.set(reason, (denialReasons.get(reason) ?? 0) + 1);
    }

    if (!toolName || !family) {
      continue;
    }

    const familyMetric = familyMetrics.get(family) ?? {
      family,
      totalCalls: 0,
      successCount: 0,
      deniedCount: 0,
      lastSeenAt: null,
    };
    familyMetric.totalCalls += 1;
    if (event === "execute_success") familyMetric.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied" || event === "budget_denied" || event === "approval_required") {
      familyMetric.deniedCount += 1;
    }
    familyMetric.lastSeenAt = familyMetric.lastSeenAt && familyMetric.lastSeenAt > entry.timestamp
      ? familyMetric.lastSeenAt
      : entry.timestamp;
    familyMetrics.set(family, familyMetric);

    const toolMetric = toolMetrics.get(toolName) ?? {
      toolName,
      family,
      totalCalls: 0,
      successCount: 0,
      deniedCount: 0,
      budgetDeniedCount: 0,
      approvalRequiredCount: 0,
      replayHitCount: 0,
      lastSeenAt: null,
    };
    toolMetric.totalCalls += 1;
    if (event === "execute_success") toolMetric.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied") toolMetric.deniedCount += 1;
    if (event === "budget_denied") toolMetric.budgetDeniedCount += 1;
    if (event === "approval_required") toolMetric.approvalRequiredCount += 1;
    if (event === "idempotency_replay_hit") toolMetric.replayHitCount += 1;
    toolMetric.lastSeenAt = toolMetric.lastSeenAt && toolMetric.lastSeenAt > entry.timestamp
      ? toolMetric.lastSeenAt
      : entry.timestamp;
    toolMetrics.set(toolName, toolMetric);
  }

  return {
    workerId: worker.id,
    displayName: worker.displayName,
    runtimeType: worker.runtimeType,
    generatedAt: new Date().toISOString(),
    hours,
    manifestStatus,
    manifestReason,
    activeDelegatedSession: latestSession
      ? {
          sessionId: String(latestSession.id),
          workerJobId: String(latestSession.workerJobId),
          scopeProfile: String(latestSession.scopeProfile),
          activeMode: coerceManifest(latestSession.manifestJson)?.activeMode
            ?? summarizeHermesTaskMode(latestSession.scopeProfile as string | null | undefined),
          createdAt: new Date(latestSession.createdAt).toISOString(),
          expiresAt: new Date(latestSession.expiresAt).toISOString(),
          revokedAt: latestSession.revokedAt ? new Date(latestSession.revokedAt).toISOString() : null,
        }
      : null,
    manifest,
    totals,
    familyMetrics: [...familyMetrics.values()].sort((left, right) =>
      right.totalCalls - left.totalCalls || left.family.localeCompare(right.family)),
    toolMetrics: [...toolMetrics.values()].sort((left, right) =>
      right.totalCalls - left.totalCalls || left.toolName.localeCompare(right.toolName)),
    denialReasons: [...denialReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    recentEvents: auditEntries.slice(0, 12).map((entry) => {
      const metadata = asRecord(entry.metadata) ?? {};
      const toolName = typeof metadata.toolName === "string" && metadata.toolName.trim()
        ? metadata.toolName.trim()
        : null;
      return {
        timestamp: entry.timestamp,
        traceId: entry.traceId,
        event: typeof metadata.event === "string" ? metadata.event : "unknown",
        toolName,
        family: deriveMcpFamily(toolName),
        reason: typeof metadata.reason === "string" && metadata.reason.trim()
          ? metadata.reason.trim()
          : null,
      };
    }),
  };
}

export async function getTenantWorkerMcpOverview(
  tenantId: string,
  input: {
    hours?: number;
  } = {},
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<TenantWorkerMcpOverview> {
  const repo = deps.repo ?? defaultRepo;
  const hours = Math.min(168, Math.max(1, Math.floor(input.hours ?? 24)));
  const workerRows = await repo.listWorkersByTenant(tenantId);
  const [latestSessions, auditEntries, operatorPolicy] = await Promise.all([
    Promise.all(workerRows.map((worker) => repo.getLatestDelegatedSessionForWorker(tenantId, worker.id))),
    getRecentMcpAuditEntriesForTenant(tenantId, hours),
    import("../_core/mcpRegistry").then((mod) => mod.getDelegatedMcpOperatorPolicySnapshot()),
  ]);

  const latestSessionByWorkerId = new Map<string, WorkerDelegatedSessionRecord | null>();
  for (let index = 0; index < workerRows.length; index += 1) {
    latestSessionByWorkerId.set(workerRows[index]!.id, latestSessions[index] ?? null);
  }

  const totals: WorkerMcpInsightTotals = {
    sessionInitializations: 0,
    toolListCalls: 0,
    toolCalls: 0,
    successCount: 0,
    deniedCount: 0,
    budgetDeniedCount: 0,
    approvalRequiredCount: 0,
    replayHitCount: 0,
    failureCount: 0,
  };
  const familyMetrics = new Map<string, WorkerMcpFamilyMetric>();
  const toolMetrics = new Map<string, WorkerMcpToolMetric>();
  const denialReasons = new Map<string, number>();
  const workerMetricMap = new Map<string, TenantWorkerMcpOverviewWorkerMetric>();
  const activeWorkerIds = new Set<string>();
  const manifestStatusCounts: TenantWorkerMcpOverview["manifestStatusCounts"] = {
    ready: 0,
    stale: 0,
    unavailable: 0,
  };

  for (const worker of workerRows) {
    const summary = summarizeLatestSessionManifest(latestSessionByWorkerId.get(worker.id) ?? null);
    const channelSummary = readHermesRuntimeChannelSummary(worker);
    const memorySyncSummary = readHermesRuntimeMemorySyncSummary(worker);
    const accessPolicySummary = summarizeWorkerAccessPolicy(worker);
    manifestStatusCounts[summary.manifestStatus] += 1;
    if (summary.activeDelegatedSession) {
      activeWorkerIds.add(worker.id);
    }
    workerMetricMap.set(worker.id, {
      workerId: worker.id,
      displayName: worker.displayName,
      runtimeType: worker.runtimeType,
      status: worker.status,
      healthState: deriveHealthState(worker),
      manifestStatus: summary.manifestStatus,
      toolCalls: 0,
      blockedCount: 0,
      lastSeenAt: worker.lastSeenAt ? new Date(worker.lastSeenAt).toISOString() : null,
      lastEventAt: null,
      channelStatus: channelSummary.channelStatus,
      memorySyncStatus: memorySyncSummary.memorySyncStatus,
      workerAccessPolicyPreset: accessPolicySummary.workerAccessPolicyPreset,
      workerAccessPolicyScopeCount: accessPolicySummary.workerAccessPolicyScopeCount,
      workerAccessPolicyQuotaDisplayLabel: accessPolicySummary.workerAccessPolicyQuotaDisplayLabel,
    });
  }

  for (const entry of auditEntries) {
    const metadata = asRecord(entry.metadata) ?? {};
    const workerId = typeof metadata.workerId === "string" && metadata.workerId.trim()
      ? metadata.workerId.trim()
      : null;
    const event = typeof metadata.event === "string" ? metadata.event : "unknown";
    const toolName = typeof metadata.toolName === "string" && metadata.toolName.trim()
      ? metadata.toolName.trim()
      : null;
    const family = deriveMcpFamily(toolName);
    const reason = typeof metadata.reason === "string" && metadata.reason.trim()
      ? metadata.reason.trim()
      : null;

    if (event === "initialize") totals.sessionInitializations += 1;
    if (event === "tools_list") totals.toolListCalls += 1;
    if (toolName) totals.toolCalls += 1;
    if (event === "execute_success") totals.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied") totals.deniedCount += 1;
    if (event === "budget_denied") totals.budgetDeniedCount += 1;
    if (event === "approval_required") totals.approvalRequiredCount += 1;
    if (event === "idempotency_replay_hit") totals.replayHitCount += 1;
    if (event === "execution_failed" || event === "tools_list_failed" || event === "idempotency_rejected") {
      totals.failureCount += 1;
    }

    if (reason && (event === "execution_denied" || event === "owner_resource_denied" || event === "budget_denied" || event === "approval_required")) {
      denialReasons.set(reason, (denialReasons.get(reason) ?? 0) + 1);
    }

    if (workerId) {
      const workerMetric = workerMetricMap.get(workerId);
      if (workerMetric) {
        if (toolName) {
          workerMetric.toolCalls += 1;
        }
        if (event === "execution_denied" || event === "owner_resource_denied" || event === "budget_denied" || event === "approval_required") {
          workerMetric.blockedCount += 1;
        }
        workerMetric.lastEventAt = workerMetric.lastEventAt && workerMetric.lastEventAt > entry.timestamp
          ? workerMetric.lastEventAt
          : entry.timestamp;
      }
    }

    if (!toolName || !family) {
      continue;
    }

    const familyMetric = familyMetrics.get(family) ?? {
      family,
      totalCalls: 0,
      successCount: 0,
      deniedCount: 0,
      lastSeenAt: null,
    };
    familyMetric.totalCalls += 1;
    if (event === "execute_success") familyMetric.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied" || event === "budget_denied" || event === "approval_required") {
      familyMetric.deniedCount += 1;
    }
    familyMetric.lastSeenAt = familyMetric.lastSeenAt && familyMetric.lastSeenAt > entry.timestamp
      ? familyMetric.lastSeenAt
      : entry.timestamp;
    familyMetrics.set(family, familyMetric);

    const toolMetric = toolMetrics.get(toolName) ?? {
      toolName,
      family,
      totalCalls: 0,
      successCount: 0,
      deniedCount: 0,
      budgetDeniedCount: 0,
      approvalRequiredCount: 0,
      replayHitCount: 0,
      lastSeenAt: null,
    };
    toolMetric.totalCalls += 1;
    if (event === "execute_success") toolMetric.successCount += 1;
    if (event === "execution_denied" || event === "owner_resource_denied") toolMetric.deniedCount += 1;
    if (event === "budget_denied") toolMetric.budgetDeniedCount += 1;
    if (event === "approval_required") toolMetric.approvalRequiredCount += 1;
    if (event === "idempotency_replay_hit") toolMetric.replayHitCount += 1;
    toolMetric.lastSeenAt = toolMetric.lastSeenAt && toolMetric.lastSeenAt > entry.timestamp
      ? toolMetric.lastSeenAt
      : entry.timestamp;
    toolMetrics.set(toolName, toolMetric);
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    hours,
    totalWorkers: workerRows.length,
    workersWithRecentMcpCalls: [...workerMetricMap.values()].filter((worker) => worker.toolCalls > 0).length,
    workersWithActiveDelegatedSessions: activeWorkerIds.size,
    manifestStatusCounts,
    operatorPolicy: {
      enabled: operatorPolicy.enabled,
      disabledFamilies: [...operatorPolicy.disabledFamilies],
      disabledToolGroups: [...operatorPolicy.disabledToolGroups],
      approvalRequiredToolGroups: [...operatorPolicy.approvalRequiredToolGroups],
    },
    totals,
    familyMetrics: [...familyMetrics.values()].sort((left, right) =>
      right.totalCalls - left.totalCalls || left.family.localeCompare(right.family)),
    toolMetrics: [...toolMetrics.values()].sort((left, right) =>
      right.totalCalls - left.totalCalls || left.toolName.localeCompare(right.toolName)),
    denialReasons: [...denialReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    workerMetrics: [...workerMetricMap.values()].sort((left, right) =>
      right.toolCalls - left.toolCalls
      || right.blockedCount - left.blockedCount
      || left.displayName.localeCompare(right.displayName)),
    recentEvents: auditEntries.slice(0, 12).map((entry) => {
      const metadata = asRecord(entry.metadata) ?? {};
      const toolName = typeof metadata.toolName === "string" && metadata.toolName.trim()
        ? metadata.toolName.trim()
        : null;
      const workerId = typeof metadata.workerId === "string" && metadata.workerId.trim()
        ? metadata.workerId.trim()
        : null;
      return {
        timestamp: entry.timestamp,
        traceId: entry.traceId,
        event: typeof metadata.event === "string" ? metadata.event : "unknown",
        toolName,
        family: deriveMcpFamily(toolName),
        reason: typeof metadata.reason === "string" && metadata.reason.trim()
          ? metadata.reason.trim()
          : null,
        workerId,
        workerDisplayName: workerId ? workerMetricMap.get(workerId)?.displayName ?? null : null,
      };
    }),
  };
}

export async function updateWorkerFleetState(
  input: {
    tenantId: string;
    workerId: string;
    action: WorkerFleetAction;
    actorUserId: number | null;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerRecord> {
  const repo = deps.repo ?? defaultRepo;
  const worker = await repo.getWorkerById(input.tenantId, input.workerId);
  if (!worker) {
    throw new Error(`Worker ${input.workerId} not found`);
  }

  const currentHealthSummary = isPlainObject(worker.healthSummaryJson) ? worker.healthSummaryJson : {};
  const currentControlPlane = isPlainObject(currentHealthSummary.controlPlane)
    ? currentHealthSummary.controlPlane
    : {};
  const nowIso = new Date().toISOString();

  if (input.action === "resume" && typeof currentControlPlane.revokedAt === "string" && currentControlPlane.revokedAt) {
    throw new Error("Revoked workers must be re-registered before they can resume");
  }

  const nextControlPlane = {
    ...currentControlPlane,
    lastActionAt: nowIso,
    lastActionByUserId: input.actorUserId ?? null,
    revokedAt:
      input.action === "revoke"
        ? nowIso
        : currentControlPlane.revokedAt ?? null,
    revokedByUserId:
      input.action === "revoke"
        ? input.actorUserId ?? null
        : currentControlPlane.revokedByUserId ?? null,
  };

  const nextStatus =
    input.action === "disable" || input.action === "revoke"
      ? "disabled"
      : input.action === "drain"
        ? "draining"
        : "online";

  const updatedWorker = await repo.updateWorker(worker.id, {
    status: nextStatus,
    healthSummaryJson: {
      ...currentHealthSummary,
      controlPlane: nextControlPlane,
    },
  });

  auditLogger.log({
    eventType: "worker_fleet_action",
    userId: input.actorUserId,
    metadata: {
      tenantId: input.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      action: input.action,
      previousStatus: worker.status,
      nextStatus,
    },
  });

  return updatedWorker;
}

export async function cleanupWorkerFleetRetention(
  input: {
    tenantId: string;
    heartbeatRetentionDays?: number;
    jobEventRetentionDays?: number;
    unpublishedArtifactRetentionDays?: number;
    staleLeaseGraceHours?: number;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerRetentionCleanupResult> {
  const repo = deps.repo ?? defaultRepo;
  const heartbeatCutoff = new Date(Date.now() - (input.heartbeatRetentionDays ?? 30) * 24 * 60 * 60 * 1000);
  const jobEventCutoff = new Date(Date.now() - (input.jobEventRetentionDays ?? 30) * 24 * 60 * 60 * 1000);
  const artifactCutoff = new Date(Date.now() - (input.unpublishedArtifactRetentionDays ?? 7) * 24 * 60 * 60 * 1000);
  const staleLeaseCutoff = new Date(Date.now() - (input.staleLeaseGraceHours ?? 24) * 60 * 60 * 1000);

  const [deletedHeartbeats, deletedJobEvents, deletedUnpublishedArtifacts, expiredJobs] = await Promise.all([
    repo.cleanupHeartbeatsBefore(input.tenantId, heartbeatCutoff),
    repo.cleanupJobEventsBefore(input.tenantId, jobEventCutoff),
    repo.cleanupUnpublishedArtifactsBefore(input.tenantId, artifactCutoff),
    repo.expireStaleJobsBefore(input.tenantId, staleLeaseCutoff),
  ]);

  return {
    deletedHeartbeats,
    deletedJobEvents,
    deletedUnpublishedArtifacts,
    expiredJobs,
  };
}

export async function redactLegacyWorkerData(
  input: {
    tenantId: string;
    actorUserId: number | null;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerLegacyRedactionResult> {
  const repo = deps.repo ?? defaultRepo;
  const [tenantWorkers, tenantArtifacts] = await Promise.all([
    repo.listWorkersByTenant(input.tenantId),
    repo.listArtifactsByTenant(input.tenantId),
  ]);

  let updatedWorkers = 0;
  let updatedArtifacts = 0;

  for (const worker of tenantWorkers) {
    const nextDashboardUrl = sanitizeDashboardUrl(worker.dashboardUrl);
    const nextCapabilitiesJson = sanitizeWorkerPayload(worker.capabilitiesJson ?? {}) as Record<string, unknown>;
    const nextHardwareJson = sanitizeWorkerPayload(worker.hardwareJson ?? {}) as Record<string, unknown>;
    const nextHealthSummaryJson = sanitizeWorkerPayload(worker.healthSummaryJson ?? {}) as Record<string, unknown>;
    const nextWarningFlagsJson = sanitizeWorkerWarningFlags(worker.warningFlagsJson);

    const hasWorkerChanges =
      JSON.stringify(worker.capabilitiesJson ?? {}) !== JSON.stringify(nextCapabilitiesJson)
      || JSON.stringify(worker.hardwareJson ?? {}) !== JSON.stringify(nextHardwareJson)
      || JSON.stringify(worker.healthSummaryJson ?? {}) !== JSON.stringify(nextHealthSummaryJson)
      || JSON.stringify(Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : []) !== JSON.stringify(nextWarningFlagsJson)
      || (worker.dashboardUrl ?? null) !== nextDashboardUrl;

    if (!hasWorkerChanges) {
      continue;
    }

    await repo.updateWorker(worker.id, {
      dashboardUrl: nextDashboardUrl,
      capabilitiesJson: nextCapabilitiesJson,
      hardwareJson: nextHardwareJson,
      healthSummaryJson: nextHealthSummaryJson,
      warningFlagsJson: nextWarningFlagsJson,
    });
    updatedWorkers += 1;
  }

  for (const artifact of tenantArtifacts) {
    const nextMetadataJson = sanitizeWorkerPayload(artifact.metadataJson ?? {}) as Record<string, unknown>;
    if (JSON.stringify(artifact.metadataJson ?? {}) === JSON.stringify(nextMetadataJson)) {
      continue;
    }

    await repo.updateArtifact(artifact.id, {
      metadataJson: nextMetadataJson,
    });
    updatedArtifacts += 1;
  }

  const result = {
    tenantId: input.tenantId,
    scannedWorkers: tenantWorkers.length,
    updatedWorkers,
    scannedArtifacts: tenantArtifacts.length,
    updatedArtifacts,
  } satisfies WorkerLegacyRedactionResult;

  auditLogger.log({
    eventType: "worker_legacy_data_redacted",
    userId: input.actorUserId,
    metadata: result,
  });

  return result;
}
