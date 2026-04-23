import * as monitoringService from "./monitoringService";
import type { ContextEngineMetricDetails } from "./monitoringService";

export interface ContextEngineEvaluationExportQuery {
  tenantId: string;
  surface?: string | null;
  intent?: string | null;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  userId?: number | null;
  skillId?: string | null;
  since?: string | null;
  limit?: number;
}

export interface ContextEngineEvaluationRecord {
  id: number;
  checkType: string;
  status: string;
  source: string;
  createdAt: string;
  details: ContextEngineMetricDetails;
}

export interface ContextEngineParitySummary {
  surface: string;
  total: number;
  ok: number;
  warning: number;
  critical: number;
  averageHealthScore: number | null;
  averageGroundingScore: number | null;
  averageRetrievalCoverage: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function listContextEngineEvaluations(
  query: ContextEngineEvaluationExportQuery,
): Promise<ContextEngineEvaluationRecord[]> {
  const result = await monitoringService.getChecks({
    page: 1,
    limit: Math.max(1, Math.min(query.limit ?? 100, 200)),
    checkType: "context_engine_eval",
    since: query.since ?? undefined,
  });

  return result.checks
    .map((check) => ({
      id: check.id,
      checkType: check.checkType,
      status: check.status,
      source: check.source,
      createdAt: check.createdAt.toISOString(),
      details: check.details as unknown as ContextEngineMetricDetails,
    }))
    .filter((record) => {
      const d = record.details;
      if (d.tenantId && d.tenantId !== query.tenantId) return false;
      if (query.surface && d.surface !== query.surface) return false;
      if (query.intent && d.intent !== query.intent) return false;
      if (query.teamId && d.teamId !== query.teamId) return false;
      if (query.roomId && d.roomId !== query.roomId) return false;
      if (query.runId && d.runId !== query.runId) return false;
      if (query.projectId && d.projectId !== query.projectId) return false;
      if (query.userId != null && d.userId !== query.userId) return false;
      if (query.skillId && d.skillId !== query.skillId) return false;
      return true;
    })
    .slice(0, query.limit ?? 100);
}

export async function buildContextEngineParitySummary(
  query: ContextEngineEvaluationExportQuery,
): Promise<ContextEngineParitySummary[]> {
  const evaluations = await listContextEngineEvaluations(query);
  const grouped = new Map<string, ContextEngineEvaluationRecord[]>();
  for (const record of evaluations) {
    const surface = record.details.surface ?? "unknown";
    const existing = grouped.get(surface) ?? [];
    existing.push(record);
    grouped.set(surface, existing);
  }

  return Array.from(grouped.entries())
    .map(([surface, records]) => {
      const totals = {
        ok: 0,
        warning: 0,
        critical: 0,
      };
      const healthScores: number[] = [];
      const groundingScores: number[] = [];
      const retrievalCoverage: number[] = [];
      for (const record of records) {
        if (record.status === "ok") totals.ok += 1;
        else if (record.status === "warning") totals.warning += 1;
        else if (record.status === "critical") totals.critical += 1;
        if (typeof record.details.healthScore === "number") healthScores.push(record.details.healthScore);
        if (typeof record.details.groundingScore === "number") groundingScores.push(record.details.groundingScore);
        if (typeof record.details.retrievalCoverage === "number") retrievalCoverage.push(record.details.retrievalCoverage);
      }
      return {
        surface,
        total: records.length,
        ok: totals.ok,
        warning: totals.warning,
        critical: totals.critical,
        averageHealthScore: average(healthScores),
        averageGroundingScore: average(groundingScores),
        averageRetrievalCoverage: average(retrievalCoverage),
      };
    })
    .sort((a, b) => a.surface.localeCompare(b.surface));
}

export function buildContextEngineTrendSeries(
  evaluations: ContextEngineEvaluationRecord[],
): Array<{
  bucket: string;
  surface: string;
  averageHealthScore: number | null;
  averageGroundingScore: number | null;
  averageRetrievalCoverage: number | null;
  averageLatencyMs: number | null;
}> {
  const grouped = new Map<string, ContextEngineEvaluationRecord[]>();
  for (const record of evaluations) {
    const bucket = new Date(record.createdAt).toISOString().slice(0, 13);
    const key = `${record.details.surface ?? "unknown"}:${bucket}`;
    const existing = grouped.get(key) ?? [];
    existing.push(record);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .map(([key, records]) => {
      const [surface, bucket] = key.split(":");
      const healthScores: number[] = [];
      const groundingScores: number[] = [];
      const retrievalCoverage: number[] = [];
      const latencyMs: number[] = [];
      for (const record of records) {
        if (typeof record.details.healthScore === "number") healthScores.push(record.details.healthScore);
        if (typeof record.details.groundingScore === "number") groundingScores.push(record.details.groundingScore);
        if (typeof record.details.retrievalCoverage === "number") retrievalCoverage.push(record.details.retrievalCoverage);
        if (typeof record.details.latencyMs === "number") latencyMs.push(record.details.latencyMs);
      }
      return {
        bucket,
        surface,
        averageHealthScore: average(healthScores),
        averageGroundingScore: average(groundingScores),
        averageRetrievalCoverage: average(retrievalCoverage),
        averageLatencyMs: average(latencyMs),
      };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.surface.localeCompare(b.surface));
}
