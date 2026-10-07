import { and, eq, isNull } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { runnerNodes } from "../../drizzle/schema";
import { getDb } from "../db";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { startFeature186SystemSchedule, stopFeature186SystemSchedule, utcMinuteOccurrence } from "./feature186SystemScheduler";

export const WORKSPACE_AUDIT_JOB_TYPE = "workspace.authority.audit";
const SCHEDULE_ID = "workspace-authority-audit";
const execFileAsync = promisify(execFile);

export type LocalWorkspaceAudit = {
  status: "OBSERVED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "ERROR";
  result?: Record<string, unknown>;
  reason?: string;
};

/** Execute the local registry collector only on its explicitly configured host. */
export async function collectLocalWorkspaceAudit(env: NodeJS.ProcessEnv = process.env): Promise<LocalWorkspaceAudit> {
  const repository = env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY?.trim();
  if (!repository) return { status: "NOT_CONFIGURED", reason: "repository_not_configured" };
  const root = path.resolve(repository);
  const script = path.join(root, "scripts", "development-lifecycle", "workspace_authority.py");
  try {
    const { stdout } = await execFileAsync(env.SMARTSPEC_PYTHON_EXECUTABLE?.trim() || "python3", [
      script, "collect", "--repository", root, "--mode", "AUDIT_ONLY",
    ], { timeout: 120_000, maxBuffer: 5 * 1024 * 1024, cwd: root });
    const result = JSON.parse(stdout) as Record<string, unknown>;
    if (result.status !== "WORKTREE_AUDIT_COMPLETE" || result.mode !== "AUDIT_ONLY")
      return { status: "ERROR", reason: "collector_contract_invalid" };
    return { status: "OBSERVED", result };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    return { status: code === "ENOENT" ? "UNAVAILABLE" : "ERROR", reason: code.slice(0, 80) };
  }
}

/** Safe, read-only audit over centrally stored Runner authority facts. */
export async function executeWorkspaceAuthorityAudit(input: {
  tenantId: string;
  now?: Date;
  collectLocal?: () => Promise<LocalWorkspaceAudit>;
}) {
  const now = input.now ?? new Date();
  const rows = await getDb().select({
    runnerId: runnerNodes.runnerId, trustState: runnerNodes.trustState, status: runnerNodes.status,
    snapshotExpiresAt: runnerNodes.snapshotExpiresAt, snapshotObservedAt: runnerNodes.snapshotObservedAt,
    revokedAt: runnerNodes.revokedAt, activeSessionId: runnerNodes.activeSessionId,
  }).from(runnerNodes).where(and(eq(runnerNodes.tenantId, input.tenantId), isNull(runnerNodes.revokedAt)));
  const localWorkspaceAudit = await (input.collectLocal ?? collectLocalWorkspaceAudit)();
  return {
    mode: "AUDIT_ONLY" as const,
    observedAt: now.toISOString(),
    runnerCount: rows.length,
    staleSnapshotCount: rows.filter(row => !row.snapshotExpiresAt || row.snapshotExpiresAt <= now || !row.snapshotObservedAt || row.snapshotObservedAt > now).length,
    untrustedRunnerCount: rows.filter(row => row.trustState !== "trusted").length,
    offlineRunnerCount: rows.filter(row => row.status !== "online").length,
    unboundSessionCount: rows.filter(row => Boolean(row.activeSessionId) && row.status !== "online").length,
    localWorkspaceAudit,
  };
}

/** Event producers use stable event IDs; duplicate lifecycle events converge in worker_jobs. */
export async function enqueueWorkspaceAuthorityAuditEvent(input: {
  tenantId: string;
  eventType: "SESSION_FINISH" | "OWNER_LEASE_EXPIRED" | "INTEGRATION_FINISH" |
    "CANONICAL_CONVERGENCE_SUCCESS" | "HANDOFF_COMPLETE" | "RECOVERY_ARCHIVE_COMPLETE";
  eventId: string;
}) {
  const tenantId = input.tenantId.trim();
  const eventId = input.eventId.trim();
  if (!tenantId || !eventId || eventId.length > 200) throw new Error("WORKSPACE_AUDIT_EVENT_INVALID");
  const key = `workspace-authority:${input.eventType}:${eventId}`;
  return createControlPlaneJob({
    context: { tenantId, actorType: "system", authorizationScope: "system:workspace-authority-audit", correlationId: key, idempotencyKey: key },
    definition: { contractVersion: "feature-186-v1", jobType: WORKSPACE_AUDIT_JOB_TYPE, executionClass: "short", input: { tenantId, mode: "AUDIT_ONLY", trigger: input.eventType },
      retryPolicy: { maxAttempts: 3, baseDelayMs: 5_000, maxDelayMs: 60_000, jitter: "bounded", deadlineMs: 30 * 60_000, allowedErrorClasses: ["retryable", "timeout", "unavailable"] },
      timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 60_000 } },
  });
}

export async function initializeWorkspaceAuthorityAuditJob(): Promise<void> {
  startFeature186SystemSchedule({ scheduleId: SCHEDULE_ID, jobType: WORKSPACE_AUDIT_JOB_TYPE, executionClass: "short", priority: 120,
    scheduleVersion: "1", timezone: "UTC", missedOccurrencePolicy: "coalesce", isDue: () => true,
    occurrenceKey: now => utcMinuteOccurrence(now, 15), input: { mode: "AUDIT_ONLY", trigger: "PERIODIC" }, intervalMs: 60_000 });
}

export async function shutdownWorkspaceAuthorityAuditJob(): Promise<void> { stopFeature186SystemSchedule(SCHEDULE_ID); }
