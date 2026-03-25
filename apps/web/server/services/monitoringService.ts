/**
 * Monitoring Service — records agent activity events, captures snapshots,
 * and detects stuck/looping agents.
 */

import { eq, and, sql, desc, count, gte, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentActivityEvents,
  agentRunSummaries,
  runSnapshots,
  teamRuns,
  teamRooms,
  assistantProfiles,
  monitoringChecks,
  monitoringAlerts,
  systemMetricsHistory,
  type AgentActivityEvent,
  type InsertAgentActivityEvent,
  type RunSnapshot,
  type BudgetSnapshot,
  type MonitoringCheck,
  type MonitoringAlert,
  type SystemMetricsHistory,
  type InsertMonitoringCheck,
  type InsertMonitoringAlert,
  type InsertSystemMetricsHistory,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecordEventInput {
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  assistantId?: string;
  eventType: string;
  eventCategory: "status_change" | "communication" | "tool_use" | "memory_op" | "artifact_op" | "handoff" | "approval" | "error";
  visibility?: "transparent" | "milestone" | "summary_only" | "private_internal";
  summary?: string;
  detailJson?: Record<string, unknown>;
  tokenUsageSnapshot?: number;
  costSnapshot?: number;
  durationMs?: number;
}

export interface StuckAgentCheck {
  isStuck: boolean;
  agentId: string | null;
  reason: string | null;
  lastActivityAge: number | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STUCK_THRESHOLD_MS = 120_000; // 2 minutes without activity
export const SNAPSHOT_INTERVAL_MS = 15_000; // every 15 seconds

// ─── Event Recording ────────────────────────────────────────────────────────

export async function recordEvent(
  input: RecordEventInput,
): Promise<AgentActivityEvent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db
    .insert(agentActivityEvents)
    .values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      teamId: input.teamId,
      roomId: input.roomId,
      runId: input.runId,
      assistantId: input.assistantId ?? null,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      visibility: (input.visibility as any) ?? "transparent",
      summary: input.summary ?? null,
      detailJson: input.detailJson ?? null,
      tokenUsageSnapshot: input.tokenUsageSnapshot ?? null,
      costSnapshot: input.costSnapshot ? String(input.costSnapshot) : null,
      durationMs: input.durationMs ?? null,
    })
    .returning();

  return event;
}

// ─── Snapshot Capture ───────────────────────────────────────────────────────

export async function captureSnapshot(
  runId: string,
  tenantId: string,
): Promise<RunSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows.map((r) => r.run));

  if (!run) throw new Error(`Run ${runId} not found`);

  const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? { totalCreditsUsed: 0, perAgent: {} };
  const perAgent = budget.perAgent ?? {};

  // Build agent statuses
  const agentStatuses: Record<string, string> = {};
  for (const [agentId] of Object.entries(perAgent)) {
    agentStatuses[agentId] = agentId === run.activeAssistantId ? "active" : "idle";
  }

  const [snapshot] = await db
    .insert(runSnapshots)
    .values({
      runId,
      activeAssistantId: run.activeAssistantId,
      agentStatusesJson: agentStatuses,
      tokenUsageJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [
          id,
          { inputTokens: d.inputTokens, outputTokens: d.outputTokens },
        ]),
      ),
      costJson: Object.fromEntries(
        Object.entries(perAgent).map(([id, d]) => [id, d.creditsUsed]),
      ),
    })
    .returning();

  return snapshot;
}

// ─── Stuck Detection ────────────────────────────────────────────────────────

export async function checkStuckAgent(
  runId: string,
  tenantId: string,
): Promise<StuckAgentCheck> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [run] = await db
    .select({ run: teamRuns })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows.map((r) => r.run));

  if (!run || run.status !== "running") {
    return { isStuck: false, agentId: null, reason: null, lastActivityAge: null };
  }

  // Get last activity event
  const [lastEvent] = await db
    .select()
    .from(agentActivityEvents)
    .where(eq(agentActivityEvents.runId, runId))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(1);

  const lastActivityTime = lastEvent?.createdAt ?? run.startedAt;
  const ageMs = lastActivityTime ? Date.now() - new Date(lastActivityTime).getTime() : 0;

  if (ageMs > STUCK_THRESHOLD_MS) {
    return {
      isStuck: true,
      agentId: run.activeAssistantId,
      reason: `No activity for ${Math.round(ageMs / 1000)}s`,
      lastActivityAge: ageMs,
    };
  }

  return { isStuck: false, agentId: null, reason: null, lastActivityAge: ageMs };
}

// ─── Event Queries ──────────────────────────────────────────────────────────

export async function getRunEvents(
  runId: string,
  tenantId: string,
  limit: number = 100,
): Promise<AgentActivityEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(agentActivityEvents)
    .where(and(eq(agentActivityEvents.runId, runId), eq(agentActivityEvents.tenantId, tenantId)))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(limit);
}

// ─── System Monitoring (Celery Push) ─────────────────────────────────────────

export interface PushMetricsInput {
  checkType: string;
  status: "ok" | "warning" | "critical" | "error";
  source: string;
  details: Record<string, unknown>;
  alert?: {
    severity: string;
    title: string;
    message: string;
    channel: string;
  } | null;
}

/**
 * Persist a health check push from Python Celery.
 * Inserts a monitoring_check row, optionally a monitoring_alert, and a
 * system_metrics_history row when memory/cpu/disk fields are present.
 */
export async function pushMetrics(input: PushMetricsInput): Promise<{ checkId: number }> {
  const db = await getDb();

  // 1. Insert the check row
  const [check] = await db
    .insert(monitoringChecks)
    .values({
      checkType: input.checkType,
      status: input.status,
      source: input.source,
      details: input.details,
    } satisfies InsertMonitoringCheck)
    .returning({ id: monitoringChecks.id });

  const checkId = check.id;

  // 2. Insert alert if present
  if (input.alert) {
    await db.insert(monitoringAlerts).values({
      severity: input.alert.severity,
      title: input.alert.title,
      message: input.alert.message,
      channel: input.alert.channel,
      metadata: { checkId },
    });
  }

  // 3. Insert metrics history if memory/cpu/disk fields are present
  const d = input.details;
  const hasMetrics =
    typeof d.memoryPercent === "number" ||
    typeof d.cpuPercent === "number";

  if (hasMetrics) {
    await db.insert(systemMetricsHistory).values({
      memoryUsedMb: typeof d.memoryUsedMb === "number" ? d.memoryUsedMb : 0,
      memoryTotalMb: typeof d.memoryTotalMb === "number" ? d.memoryTotalMb : 0,
      memoryPercent: typeof d.memoryPercent === "number" ? d.memoryPercent : 0,
      cpuPercent: typeof d.cpuPercent === "number" ? d.cpuPercent : null,
      diskUsedGb: typeof d.diskUsedGb === "number" ? d.diskUsedGb : null,
      diskTotalGb: typeof d.diskTotalGb === "number" ? d.diskTotalGb : null,
      serviceStatuses: d.services != null ? (d.services as Record<string, string>) : null,
      processRestartCounts: d.processRestartCounts != null ? (d.processRestartCounts as Record<string, number>) : null,
    });
  }

  return { checkId };
}

/**
 * Paginated list of monitoring checks with optional filters.
 */
export async function getChecks(opts: {
  page: number;
  limit: number;
  status?: string;
  checkType?: string;
  since?: string;
}): Promise<{ checks: MonitoringCheck[]; total: number; page: number }> {
  const db = await getDb();
  const offset = (opts.page - 1) * opts.limit;

  const conditions = [];
  if (opts.status) conditions.push(eq(monitoringChecks.status, opts.status));
  if (opts.checkType) conditions.push(eq(monitoringChecks.checkType, opts.checkType));
  if (opts.since) {
    conditions.push(gte(monitoringChecks.createdAt, new Date(opts.since)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db
      .select()
      .from(monitoringChecks)
      .where(where)
      .orderBy(desc(monitoringChecks.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db
      .select({ cnt: count() })
      .from(monitoringChecks)
      .where(where),
  ]);

  return { checks: rows, total: Number(cnt), page: opts.page };
}

/**
 * Paginated list of monitoring alerts with optional filters.
 */
export async function getAlerts(opts: {
  page: number;
  limit: number;
  severity?: string;
  acknowledged?: boolean;
}): Promise<{ alerts: MonitoringAlert[]; total: number }> {
  const db = await getDb();
  const offset = (opts.page - 1) * opts.limit;

  const conditions = [];
  if (opts.severity) conditions.push(eq(monitoringAlerts.severity, opts.severity));
  if (opts.acknowledged !== undefined) {
    conditions.push(eq(monitoringAlerts.acknowledged, opts.acknowledged));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db
      .select()
      .from(monitoringAlerts)
      .where(where)
      .orderBy(desc(monitoringAlerts.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db
      .select({ cnt: count() })
      .from(monitoringAlerts)
      .where(where),
  ]);

  return { alerts: rows, total: Number(cnt) };
}

/**
 * Acknowledge an alert by ID.
 */
export async function acknowledgeAlert(alertId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(monitoringAlerts)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(eq(monitoringAlerts.id, alertId));
}

export interface MetricPoint {
  id: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  cpuPercent: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  serviceStatuses: Record<string, string> | null;
  processRestartCounts: Record<string, number> | null;
  createdAt: Date;
}

/**
 * Returns system_metrics_history rows from the last N hours.
 */
export async function getMetricsHistory(hours: number): Promise<{
  metrics: MetricPoint[];
  latestMemoryPercent: number;
  latestCpuPercent: number | null;
}> {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(systemMetricsHistory)
    .where(gte(systemMetricsHistory.createdAt, since))
    .orderBy(desc(systemMetricsHistory.createdAt))
    .limit(500);

  const latest = rows[0];
  return {
    metrics: rows as MetricPoint[],
    latestMemoryPercent: latest?.memoryPercent ?? 0,
    latestCpuPercent: latest?.cpuPercent ?? null,
  };
}

export interface ServiceStatus {
  name: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Aggregate current system status from latest metrics row + unacknowledged alerts.
 */
export async function getCurrentStatus(): Promise<{
  services: ServiceStatus[];
  alerts: { critical: number; warning: number };
  lastCheck: string | null;
}> {
  const db = await getDb();

  // Latest metrics row
  const [latestMetrics] = await db
    .select()
    .from(systemMetricsHistory)
    .orderBy(desc(systemMetricsHistory.createdAt))
    .limit(1);

  // Latest check timestamp
  const [latestCheck] = await db
    .select({ checkedAt: monitoringChecks.createdAt })
    .from(monitoringChecks)
    .orderBy(desc(monitoringChecks.createdAt))
    .limit(1);

  // Count unacknowledged alerts by severity
  const alertCounts = await db
    .select({ severity: monitoringAlerts.severity, cnt: count() })
    .from(monitoringAlerts)
    .where(eq(monitoringAlerts.acknowledged, false))
    .groupBy(monitoringAlerts.severity);

  let critical = 0;
  let warning = 0;
  for (const row of alertCounts) {
    if (row.severity === "critical") critical = Number(row.cnt);
    if (row.severity === "warning") warning = Number(row.cnt);
  }

  // Extract service statuses from latest metrics
  let services: ServiceStatus[] = [];
  if (latestMetrics?.serviceStatuses && typeof latestMetrics.serviceStatuses === "object") {
    const ss = latestMetrics.serviceStatuses as Record<string, unknown>;
    services = Object.entries(ss).map(([name, val]) => ({
      name,
      status: typeof val === "string" ? val : "unknown",
      ...(typeof val === "object" && val !== null ? (val as Record<string, unknown>) : {}),
    }));
  }

  return {
    services,
    alerts: { critical, warning },
    lastCheck: latestCheck?.checkedAt ? new Date(latestCheck.checkedAt).toISOString() : null,
  };
}
