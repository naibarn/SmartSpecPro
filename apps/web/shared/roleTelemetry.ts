import { z } from "zod";

import { roleAutonomyTierSchema, rolePromotionDecisionSchema } from "./roleAgentContracts";

export const roleRolloutPhaseValues = [
  "draft_only",
  "guided",
  "supervised",
  "autonomous_pilot",
  "autonomous_general",
] as const;

export const roleGateResultValues = [
  "ready",
  "blocked",
  "review_required",
  "staged",
  "unknown",
] as const;

export const roleIncidentActionValues = [
  "pause_role",
  "pause_routine",
  "quarantine_role",
  "quarantine_routine",
  "stop_org_slice",
  "resume",
] as const;

export const roleIncidentStatusValues = ["active", "resolved"] as const;

export const roleTelemetryEventNameValues = [
  "role_activated",
  "routine_enqueued",
  "routine_started",
  "routine_blocked",
  "routine_succeeded",
  "checkpoint_stale",
  "promotion_review_required",
  "autonomy_downgraded",
  "incident_opened",
  "incident_resolved",
] as const;

export const roleRolloutPhaseSchema = z.enum(roleRolloutPhaseValues);
export const roleGateResultSchema = z.enum(roleGateResultValues);
export const roleIncidentActionSchema = z.enum(roleIncidentActionValues);
export const roleIncidentStatusSchema = z.enum(roleIncidentStatusValues);
export const roleTelemetryEventNameSchema = z.enum(roleTelemetryEventNameValues);

export const roleTelemetryEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  eventName: roleTelemetryEventNameSchema,
  detail: z.string().min(1),
  operatorUserId: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const roleTelemetrySnapshotSchema = z.object({
  roleId: z.string().min(1),
  tenantId: z.string().min(1),
  departmentLabel: z.string().min(1),
  routineId: z.string().nullable().optional(),
  throughput: z.number().nonnegative(),
  interventionRate: z.number().min(0).max(1),
  exceptionRate: z.number().min(0).max(1),
  backlogDepth: z.number().int().nonnegative(),
  backlogAgeMinutes: z.number().nonnegative(),
  slaHitRate: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  replayPassRate: z.number().min(0).max(1),
  improvementVelocity: z.number().nonnegative(),
  autonomyTier: roleAutonomyTierSchema,
  promotionDecision: rolePromotionDecisionSchema,
  rolloutPhase: roleRolloutPhaseSchema,
  gateResult: roleGateResultSchema,
  checkpointFreshnessMinutes: z.number().nonnegative(),
  recoveryChurn: z.number().int().nonnegative(),
  budgetBurn: z.number().nonnegative(),
  riskTier: z.enum(["low", "medium", "high", "critical"]),
  connectorFamilies: z.array(z.string()).default([]),
  runtimeFamilies: z.array(z.string()).default([]),
  blockerCodes: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});

export const roleRolloutGateDecisionSchema = z.object({
  tenantId: z.string().min(1),
  roleId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  rolloutPhase: roleRolloutPhaseSchema,
  gateResult: roleGateResultSchema,
  reasonCode: z.string().min(1),
  nextAction: z.string().min(1),
  blockers: z.array(z.string()).default([]),
  currentAutonomyTier: roleAutonomyTierSchema,
});

export const roleIncidentRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roleId: z.string().nullable().optional(),
  routineId: z.string().nullable().optional(),
  action: roleIncidentActionSchema,
  status: roleIncidentStatusSchema,
  reason: z.string().min(1),
  affectedRoutineRunIds: z.array(z.string()).default([]),
  linkedWorkpackIds: z.array(z.string()).default([]),
  safeResumeRequired: z.boolean().default(false),
  operatorUserId: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export type RoleTelemetryEvent = z.infer<typeof roleTelemetryEventSchema>;
export type RoleTelemetrySnapshot = z.infer<typeof roleTelemetrySnapshotSchema>;
export type RoleRolloutGateDecision = z.infer<typeof roleRolloutGateDecisionSchema>;
export type RoleIncidentRecord = z.infer<typeof roleIncidentRecordSchema>;
export type RoleGateResult = z.infer<typeof roleGateResultSchema>;
export type RoleRolloutPhase = z.infer<typeof roleRolloutPhaseSchema>;
