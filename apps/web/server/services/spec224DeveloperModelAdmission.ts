import { createHash } from "node:crypto";

import type { JobReporter, LeaseContext } from "./jobControlPlaneTypes";
import type {
  CodexModelAdmissionRepository,
  CodexModelCallInput,
  CodexModelUsage,
} from "./providerSchedulerService";

/** Payload accepted from the local Python model caller. Lease authority stays in this server closure. */
export type DeveloperModelAdmissionRequest = Omit<CodexModelCallInput, "lease" | "now">;

export type DeveloperModelAdmissionTransport = {
  reserve(request: DeveloperModelAdmissionRequest): Promise<Record<string, unknown>>;
  dispatching(operationKey: string): Promise<Record<string, unknown>>;
  threadCreated(operationKey: string, threadId: string): Promise<Record<string, unknown>>;
  turnStarted(operationKey: string, threadId: string, turnId: string): Promise<Record<string, unknown>>;
  settle(operationKey: string, usage: CodexModelUsage | null, reconcile?: boolean): Promise<Record<string, unknown>>;
  providerCapacity(operationKey: string, evidence: Record<string, unknown>): Promise<Record<string, unknown>>;
  wait(operationKey: string, reason: "budget" | "provider_capacity", nextEligibleAt: string): Promise<void>;
};

function stableWaitKey(jobId: string, runId: string, modelCallId: string) {
  const hash = createHash("sha256").update(`${jobId}\0${runId}\0${modelCallId}`).digest("hex");
  return `spec224-codex-turn:${hash}`;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("DEVELOPER_MODEL_ADMISSION_INVALID");
  return value.trim();
}

function integer(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error("DEVELOPER_MODEL_ADMISSION_INVALID");
  return Number(value);
}

/** Builds the narrow adapter an authenticated Developer Executor gives to Python over its local transport. */
export function createSpec224DeveloperModelAdmissionTransport(input: {
  lease: LeaseContext;
  runId: string;
  reporter: Pick<JobReporter, "assertActive" | "waitForExternal">;
  repository: CodexModelAdmissionRepository;
  now?: () => Date;
}): DeveloperModelAdmissionTransport {
  const operations = new Map<string, { waiting?: { reason: "budget" | "provider_capacity"; nextEligibleAt: string }; dispatched?: boolean; reconciling?: boolean }>();
  const now = input.now ?? (() => new Date());

  return {
    async reserve(request) {
      await input.reporter.assertActive(input.lease);
      const call = {
        lease: input.lease,
        runId: text(request.runId, 160),
        modelCallId: text(request.modelCallId, 160),
        phase: text(request.phase, 40),
        role: text(request.role, 64),
        requestedModel: text(request.requestedModel, 120),
        reasoningEffort: text(request.reasoningEffort, 24),
        promptBytes: integer(request.promptBytes, 1_000_000),
        threadId: request.threadId == null ? null : text(request.threadId, 160),
        selection: request.selection,
        now: now(),
      } satisfies CodexModelCallInput;
      if (call.runId !== input.runId) return { kind: "denied", reason: "run_binding" };
      const operationKey = stableWaitKey(input.lease.jobId, call.runId, call.modelCallId);
      const operation = operations.get(operationKey) ?? {};
      delete operation.waiting;
      operation.dispatched = false;
      operations.set(operationKey, operation);
      const result = await input.repository.reserveCodexModelCall(call);
      operation.reconciling = result.kind === "reconcile_required";
      if (result.kind === "waiting_budget") {
        operation.waiting = { reason: "budget", nextEligibleAt: result.nextEligibleAt.toISOString() };
        return { ...result, operationKey, nextEligibleAt: result.nextEligibleAt.toISOString() };
      }
      return result;
    },
    async dispatching(operationKey) {
      await input.reporter.assertActive(input.lease);
      if (!operations.has(operationKey)) return { kind: "denied", reason: "reservation_missing" };
      const result = await input.repository.markCodexModelCallDispatching({ lease: input.lease, operationKey, now: now() });
      if (result.kind === "marked" || result.kind === "duplicate") operations.get(operationKey)!.dispatched = true;
      return result;
    },
    async threadCreated(operationKey, threadId) {
      await input.reporter.assertActive(input.lease);
      if (!operations.has(operationKey)) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.recordCodexModelThreadIdentity({ lease: input.lease, operationKey, threadId: text(threadId, 160), reconcile: operations.get(operationKey)?.reconciling, now: now() });
    },
    async turnStarted(operationKey, threadId, turnId) {
      await input.reporter.assertActive(input.lease);
      if (!operations.has(operationKey)) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.recordCodexModelTurnIdentity({ lease: input.lease, operationKey, threadId: text(threadId, 160), turnId: text(turnId, 160), reconcile: operations.get(operationKey)?.reconciling, now: now() });
    },
    async settle(operationKey, usage, reconcile = false) {
      await input.reporter.assertActive(input.lease);
      if (!operations.has(operationKey)) return { kind: "denied", reason: "reservation_missing" };
      const result = await input.repository.settleCodexModelCall({ lease: input.lease, runId: input.runId, operationKey, usage, reconcile, now: now() });
      if ((result.kind === "settled" || result.kind === "duplicate" || result.kind === "unknown") && !operations.get(operationKey)?.waiting) operations.delete(operationKey);
      return result;
    },
    async providerCapacity(operationKey, evidence) {
      await input.reporter.assertActive(input.lease);
      const operation = operations.get(operationKey);
      const status = Number(evidence.statusCode);
      if (!operation?.dispatched || status !== 429) return { kind: "denied", reason: "capacity_evidence_invalid" };
      const retryAfterSeconds = Number(evidence.retryAfterSeconds);
      // Preserve provider supplied reset windows, including multi-day waits.
      // Capping this at 15 minutes made the scheduler dispatch again before
      // the provider's confirmed capacity reset time.
      const delaySeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.max(30, Math.ceil(retryAfterSeconds))
        : 60;
      const nextEligibleAt = new Date(now().getTime() + delaySeconds * 1_000).toISOString();
      operation.waiting = { reason: "provider_capacity", nextEligibleAt };
      return { kind: "waiting_capacity", nextEligibleAt, evidence: { statusCode: 429, retryAfterSeconds: delaySeconds } };
    },
    async wait(operationKey, reason, nextEligibleAt) {
      await input.reporter.assertActive(input.lease);
      const operation = operations.get(operationKey);
      if (!operation?.waiting || reason !== operation.waiting.reason || nextEligibleAt !== operation.waiting.nextEligibleAt) {
        throw new Error("DEVELOPER_MODEL_WAIT_BINDING_INVALID");
      }
      await input.reporter.waitForExternal(input.lease, {
        operationKey,
        reason,
        resumeAfter: nextEligibleAt,
        metadata: {
          schemaVersion: "spec224.developer-model-wait.v1",
          runId: input.runId,
          reservationState: operation.dispatched ? "unknown_after_dispatch" : reason === "budget" ? "not_reserved" : "reserved_not_dispatched",
        },
      });
      operations.delete(operationKey);
    },
  };
}
