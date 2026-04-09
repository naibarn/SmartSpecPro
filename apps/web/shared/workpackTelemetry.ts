import { z } from "zod";

export const workpackTelemetryEventNameValues = [
  "draft_created",
  "clarification_requested",
  "simulation_passed",
  "simulation_failed",
  "run_started",
  "run_blocked",
  "run_succeeded",
  "exception_opened",
  "exception_resolved",
  "promotion_candidate",
  "promotion_approved",
  "promotion_blocked",
  "promotion_reverted",
  "rollout_opened",
  "rollout_closed",
  "incident_paused",
  "incident_quarantined",
  "incident_resumed",
] as const;

export const workpackRolloutPhaseValues = ["draft_only", "supervised", "autonomous_pilot", "autonomous_general"] as const;
export const workpackGateResultValues = ["ready", "blocked", "review_required", "staged", "unknown"] as const;
export const workpackIncidentActionValues = ["pause", "quarantine", "cancel_queued", "freeze_promotion", "resume"] as const;
export const workpackIncidentStatusValues = ["active", "resolved"] as const;

export const workpackTelemetryEventNameSchema = z.enum(workpackTelemetryEventNameValues);
export const workpackRolloutPhaseSchema = z.enum(workpackRolloutPhaseValues);
export const workpackGateResultSchema = z.enum(workpackGateResultValues);
export const workpackIncidentActionSchema = z.enum(workpackIncidentActionValues);
export const workpackIncidentStatusSchema = z.enum(workpackIncidentStatusValues);

export const workpackTelemetryEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().nullable().optional(),
  eventName: workpackTelemetryEventNameSchema,
  detail: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const workpackReadinessSummarySchema = z.object({
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  rolloutPhase: workpackRolloutPhaseSchema,
  gateResult: workpackGateResultSchema,
  reasonCode: z.string().min(1),
  evidenceCompleteness: z.number().min(0).max(1),
  exceptionSeverity: z.enum(["none", "low", "medium", "high", "critical"]),
  trustStatus: z.enum(["verified", "tainted", "restricted"]),
  connectorHealth: z.enum(["healthy", "stale", "blocked"]),
  benchmarkAvailable: z.boolean(),
  rollbackAvailable: z.boolean(),
  nextAction: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export const workpackIncidentRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workpackId: z.string().nullable().optional(),
  versionId: z.string().nullable().optional(),
  action: workpackIncidentActionSchema,
  status: workpackIncidentStatusSchema,
  reason: z.string().min(1),
  affectedRunIds: z.array(z.string()).default([]),
  safeResumeRequired: z.boolean().default(false),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export type WorkpackTelemetryEvent = z.infer<typeof workpackTelemetryEventSchema>;
export type WorkpackReadinessSummary = z.infer<typeof workpackReadinessSummarySchema>;
export type WorkpackIncidentRecord = z.infer<typeof workpackIncidentRecordSchema>;
export type WorkpackRolloutPhase = z.infer<typeof workpackRolloutPhaseSchema>;
export type WorkpackGateResult = z.infer<typeof workpackGateResultSchema>;

export function severityFromGateResult(
  gateResult: WorkpackGateResult,
): "healthy" | "warning" | "critical" {
  if (gateResult === "ready") return "healthy";
  if (gateResult === "staged" || gateResult === "review_required") return "warning";
  return "critical";
}
