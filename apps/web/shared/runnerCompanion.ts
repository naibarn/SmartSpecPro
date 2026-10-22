import { z } from "zod";

const nullableDateTime = z.string().datetime({ offset: true }).nullable();

export const runnerDeviceViewSchema = z.object({
  runnerId: z.string().trim().min(1).max(160),
  deviceId: z.string().trim().min(1).max(160).nullable(),
  displayName: z.string().trim().min(1).max(160),
  profile: z.string().trim().min(1).max(80),
  nodeKind: z.string().trim().min(1).max(80),
  pairing: z.enum(["pending", "paired", "revoked"]),
  connectivity: z.enum(["online", "offline", "stale", "degraded", "revoked"]),
  trustState: z.enum(["pending", "trusted", "revoked", "quarantined"]),
  session: z.object({
    active: z.boolean(),
    continuity: z.enum(["current", "stale", "missing", "not_applicable"]),
  }),
  capabilities: z.object({
    state: z.enum(["fresh", "stale", "missing"]),
    revision: z.string().trim().max(160).nullable(),
    observedAt: nullableDateTime,
    expiresAt: nullableDateTime,
    count: z.number().int().nonnegative(),
    availableCount: z.number().int().nonnegative(),
  }),
  platform: z
    .object({
      os: z.string().trim().max(40),
      architecture: z.string().trim().max(40),
      target: z.string().trim().max(80),
    })
    .nullable(),
  lastSeenAt: nullableDateTime,
});

export const runnerTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_input",
  "waiting_external",
  "cancel_requested",
  "cancelled",
  "completed",
  "failed",
  "expired",
  "unknown_outcome",
]);

export const runnerTaskViewSchema = z.object({
  jobId: z.string().trim().min(1).max(160),
  jobType: z.string().trim().min(1).max(100),
  canonicalStatus: z.string().trim().min(1).max(80),
  status: runnerTaskStatusSchema,
  runnerId: z.string().trim().max(160).nullable(),
  runnerSessionState: z.string().trim().max(80).nullable(),
  attempt: z.number().int().nonnegative().nullable(),
  maxAttempts: z.number().int().positive().nullable(),
  progress: z.object({
    percent: z.number().min(0).max(100).nullable(),
    phase: z.string().trim().max(160).nullable(),
    source: z.enum([
      "canonical_worker_job",
      "canonical_task_observability",
      "unreported",
    ]),
  }),
  attention: z.object({
    required: z.boolean(),
    reason: z.string().trim().max(300).nullable(),
  }),
  nextAction: z.enum([
    "none",
    "wait",
    "approve",
    "provide_input",
    "reconnect",
    "review_result",
    "unknown",
  ]),
  outputEvidenceIds: z.array(z.string().trim().min(1).max(200)).max(32),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const runnerApprovalViewSchema = z.object({
  approvalId: z.string().trim().min(1).max(160),
  jobId: z.string().trim().min(1).max(160),
  state: z.enum(["pending", "approved", "rejected", "unknown"]),
  actionId: z.string().trim().max(160).nullable(),
  requestedAt: nullableDateTime,
  resolvedAt: nullableDateTime,
  source: z.literal("canonical_job_external_wait"),
});

export const runnerEvidenceViewSchema = z.object({
  evidenceId: z.string().trim().min(1).max(200),
  jobId: z.string().trim().min(1).max(160),
  kind: z.string().trim().min(1).max(100),
  verificationState: z.string().trim().max(80).nullable(),
  contentHash: z.string().trim().max(128).nullable(),
  mimeType: z.string().trim().max(160).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  createdAt: nullableDateTime,
  source: z.literal("canonical_worker_output"),
});

export const runnerCompanionStateSchema = z.object({
  schemaVersion: z.literal("runner-companion.v1"),
  generatedAt: z.string().datetime({ offset: true }),
  scope: z.literal("owner"),
  devices: z.array(runnerDeviceViewSchema).max(100),
  tasks: z.array(runnerTaskViewSchema).max(50),
  approvals: z.array(runnerApprovalViewSchema).max(50),
  evidence: z.array(runnerEvidenceViewSchema).max(100),
  reconciliation: z.object({
    asOf: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    projectionToken: z.string().trim().min(1).max(2048),
    consistency: z.literal("created_at_watermark_live_state"),
    eventContinuity: z.literal("not_claimed"),
  }),
});

export type RunnerDeviceView = z.infer<typeof runnerDeviceViewSchema>;
export type RunnerTaskStatus = z.infer<typeof runnerTaskStatusSchema>;
export type RunnerTaskView = z.infer<typeof runnerTaskViewSchema>;
export type RunnerApprovalView = z.infer<typeof runnerApprovalViewSchema>;
export type RunnerEvidenceView = z.infer<typeof runnerEvidenceViewSchema>;
export type RunnerCompanionState = z.infer<typeof runnerCompanionStateSchema>;
