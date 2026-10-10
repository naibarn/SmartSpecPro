import { createHash } from "node:crypto";
import type { JobDefinition } from "./jobControlPlaneTypes";

export const AUTO_TEAM_RECOVERY_EVALUATION_JOB_TYPE =
  "auto-team.recovery.evaluate";
export const AUTO_TEAM_RECOVERY_EVALUATION_CONTRACT =
  "auto-team-recovery-v1";
export const AUTO_TEAM_RECOVERY_POLL_INTERVAL_MS = 5 * 60_000;

export function fingerprintAutoTeamRecoveryState(input: {
  status: string;
  stopReason?: string | null;
  runtimeTerminalReason?: string | null;
  runtimeState?: unknown;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      status: input.status,
      stopReason: input.stopReason ?? null,
      runtimeTerminalReason: input.runtimeTerminalReason ?? null,
      runtimeState: input.runtimeState ?? null,
    }))
    .digest("hex");
}

export function buildAutoTeamRecoveryEvaluationJob(input: {
  tenantId: string;
  runId: string;
  stateFingerprint: string;
  evaluationSlot: number;
}): JobDefinition {
  const fingerprint = input.stateFingerprint;
  return {
    contractVersion: AUTO_TEAM_RECOVERY_EVALUATION_CONTRACT,
    tenantId: input.tenantId,
    jobType: AUTO_TEAM_RECOVERY_EVALUATION_JOB_TYPE,
    executionClass: "long",
    priority: 15,
    input: {
      contractVersion: AUTO_TEAM_RECOVERY_EVALUATION_CONTRACT,
      runId: input.runId,
      stateFingerprint: fingerprint,
      evaluationSlot: input.evaluationSlot,
    },
    idempotencyKey: `auto-team-recovery:${input.runId}:${fingerprint}:${input.evaluationSlot}`,
    activeDedupeKey: `auto-team-recovery:${input.runId}`,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 5_000,
      maxDelayMs: 60_000,
      jitter: "bounded",
      deadlineMs: 10 * 60_000,
      allowedErrorClasses: ["retryable", "timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 60_000, hardTimeoutMs: 8 * 60_000 },
  };
}

export function parseAutoTeamRecoveryEvaluationInput(value: unknown): {
  runId: string;
  stateFingerprint: string;
  evaluationSlot: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 4 ||
    !Object.keys(input).every(key =>
      ["contractVersion", "runId", "stateFingerprint", "evaluationSlot"].includes(key),
    ) ||
    input.contractVersion !== AUTO_TEAM_RECOVERY_EVALUATION_CONTRACT ||
    typeof input.runId !== "string" ||
    !/^[A-Za-z0-9_-]{1,36}$/.test(input.runId) ||
    typeof input.stateFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.stateFingerprint) ||
    !Number.isSafeInteger(input.evaluationSlot) ||
    Number(input.evaluationSlot) < 0
  ) {
    return null;
  }
  return {
    runId: input.runId,
    stateFingerprint: input.stateFingerprint,
    evaluationSlot: Number(input.evaluationSlot),
  };
}
