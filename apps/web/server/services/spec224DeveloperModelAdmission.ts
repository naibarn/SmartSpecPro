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
  let lastOperationKey: string | null = null;
  let lastWait: { operationKey: string; reason: "budget"; nextEligibleAt: string } | null = null;
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
      lastOperationKey = operationKey;
      lastWait = null;
      const result = await input.repository.reserveCodexModelCall(call);
      if (result.kind === "waiting_budget") {
        lastWait = { operationKey, reason: "budget", nextEligibleAt: result.nextEligibleAt.toISOString() };
        return { ...result, operationKey, nextEligibleAt: result.nextEligibleAt.toISOString() };
      }
      return result;
    },
    async dispatching(operationKey) {
      await input.reporter.assertActive(input.lease);
      if (operationKey !== lastOperationKey) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.markCodexModelCallDispatching({ lease: input.lease, operationKey, now: now() });
    },
    async threadCreated(operationKey, threadId) {
      await input.reporter.assertActive(input.lease);
      if (operationKey !== lastOperationKey) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.recordCodexModelThreadIdentity({ lease: input.lease, operationKey, threadId: text(threadId, 160), now: now() });
    },
    async turnStarted(operationKey, threadId, turnId) {
      await input.reporter.assertActive(input.lease);
      if (operationKey !== lastOperationKey) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.recordCodexModelTurnIdentity({ lease: input.lease, operationKey, threadId: text(threadId, 160), turnId: text(turnId, 160), now: now() });
    },
    async settle(operationKey, usage, reconcile = false) {
      await input.reporter.assertActive(input.lease);
      if (operationKey !== lastOperationKey) return { kind: "denied", reason: "reservation_missing" };
      return input.repository.settleCodexModelCall({ lease: input.lease, runId: input.runId, operationKey, usage, reconcile, now: now() });
    },
    async wait(operationKey, reason, nextEligibleAt) {
      await input.reporter.assertActive(input.lease);
      if (!lastWait || operationKey !== lastWait.operationKey || reason !== lastWait.reason || nextEligibleAt !== lastWait.nextEligibleAt) {
        throw new Error("DEVELOPER_MODEL_WAIT_BINDING_INVALID");
      }
      await input.reporter.waitForExternal(input.lease, {
        operationKey,
        reason,
        resumeAfter: nextEligibleAt,
        metadata: { schemaVersion: "spec224.developer-model-wait.v1", runId: input.runId, reservationState: "not_dispatched" },
      });
      lastWait = null;
      lastOperationKey = null;
    },
  };
}
