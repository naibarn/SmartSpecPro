import {
  buildAgentJobDefinition,
  type AgentProvider,
  type AgentRuntime,
  type AgentTaskPolicyBinding,
  type AgentTaskManifest,
} from "./agentControlPlaneContracts";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { createJobControlPlane } from "./jobControlPlane";
import type { JobRef } from "./jobControlPlaneTypes";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";

export const SPEC_224_RUN_CONTRACT_VERSION = "spec-224-v1" as const;

export type DevelopmentRunState =
  | "DISCOVERY"
  | "PLANNING"
  | "PLAN_VERIFY"
  | "IMPLEMENT"
  | "BUILD"
  | "TEST"
  | "DEBUG_REPAIR"
  | "REVIEW"
  | "FIX_REVIEW_FINDINGS"
  | "VERIFY"
  | "RECOVERY"
  | "REGRESSION"
  | "FINAL_VERIFY"
  | "WAITING_HUMAN_DECISION"
  | "PAUSED_POLICY"
  | "BLOCKED_RECOVERABLE"
  | "RECOVERY_EXHAUSTED_PENDING_DECISION"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED_TERMINAL";

export type DevelopmentRun = {
  contractVersion: typeof SPEC_224_RUN_CONTRACT_VERSION;
  runId: string;
  tenantId: string;
  actorId: number;
  goal: string;
  repositoryRef: string;
  baseRevision: string;
  contextPackHash: string;
  workspaceId: string;
  state: DevelopmentRunState;
  phaseAttempt: number;
  maxPhaseAttempts: number;
  workerJobId: string | null;
  resumeState: DevelopmentRunState | null;
  decisionEpoch: number;
  fencingVersion: number;
  evidenceRefs: string[];
  eventSequence: number;
  eventIdempotencyKeys: string[];
  events: DevelopmentEvent[];
  metadata?: Record<string, unknown>;
};

export type DevelopmentEventType =
  | "RUN_CREATED"
  | "PHASE_STARTED"
  | "PHASE_COMPLETED"
  | "PHASE_FAILED"
  | "RECOVERY_SCHEDULED"
  | "DECISION_REQUIRED"
  | "EVIDENCE_RECORDED"
  | "DEFERRED_TEST_OBLIGATION_RECORDED"
  | "DEFERRED_TEST_OBLIGATION_INVALIDATED"
  | "RUN_PAUSED"
  | "RUN_RESUMED"
  | "RUN_CANCELLED"
  | "RUN_COMPLETED";

export type DevelopmentEvent = {
  eventId: string;
  runId: string;
  sequence: number;
  idempotencyKey: string;
  type: DevelopmentEventType;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type DevelopmentCommand =
  | { command: "RUN_PHASE"; phase: DevelopmentRunState }
  | { command: "RECOVER_PHASE"; phase: DevelopmentRunState }
  | { command: "WAIT_FOR_HUMAN_DECISION"; reason: string }
  | { command: "STOP"; reason: "COMPLETED" | "CANCELLED" | "FAILED_TERMINAL" };

export class DevelopmentRunContractError extends Error {
  constructor(
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "DevelopmentRunContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_./:@#-]{1,191}$/;
const HASH = /^[a-f0-9]{64}$/;
const TERMINAL_STATES = new Set<DevelopmentRunState>([
  "COMPLETED",
  "CANCELLED",
  "FAILED_TERMINAL",
]);
const RAW_SECRET_KEY =
  /(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)/i;

const NEXT_STATES: Record<DevelopmentRunState, readonly DevelopmentRunState[]> =
  {
    DISCOVERY: ["PLANNING", "WAITING_HUMAN_DECISION", "CANCELLED"],
    PLANNING: [
      "PLAN_VERIFY",
      "WAITING_HUMAN_DECISION",
      "PAUSED_POLICY",
      "CANCELLED",
    ],
    PLAN_VERIFY: [
      "IMPLEMENT",
      "PLANNING",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    IMPLEMENT: [
      "BUILD",
      "DEBUG_REPAIR",
      "WAITING_HUMAN_DECISION",
      "PAUSED_POLICY",
      "CANCELLED",
    ],
    BUILD: ["TEST", "DEBUG_REPAIR", "WAITING_HUMAN_DECISION", "CANCELLED"],
    TEST: ["REVIEW", "DEBUG_REPAIR", "WAITING_HUMAN_DECISION", "CANCELLED"],
    DEBUG_REPAIR: [
      "BUILD",
      "TEST",
      "REVIEW",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    REVIEW: [
      "FIX_REVIEW_FINDINGS",
      "VERIFY",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    FIX_REVIEW_FINDINGS: [
      "REVIEW",
      "BUILD",
      "TEST",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    VERIFY: [
      "REGRESSION",
      "DEBUG_REPAIR",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    RECOVERY: [
      "DISCOVERY",
      "PLANNING",
      "IMPLEMENT",
      "BUILD",
      "TEST",
      "REVIEW",
      "VERIFY",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    REGRESSION: [
      "FINAL_VERIFY",
      "DEBUG_REPAIR",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    FINAL_VERIFY: [
      "COMPLETED",
      "DEBUG_REPAIR",
      "FIX_REVIEW_FINDINGS",
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    WAITING_HUMAN_DECISION: [
      "PLANNING",
      "IMPLEMENT",
      "VERIFY",
      "RECOVERY",
      "CANCELLED",
    ],
    PAUSED_POLICY: ["PLANNING", "WAITING_HUMAN_DECISION", "CANCELLED"],
    BLOCKED_RECOVERABLE: ["RECOVERY", "WAITING_HUMAN_DECISION", "CANCELLED"],
    RECOVERY_EXHAUSTED_PENDING_DECISION: [
      "WAITING_HUMAN_DECISION",
      "CANCELLED",
    ],
    COMPLETED: [],
    CANCELLED: [],
    FAILED_TERMINAL: [],
  };

function text(value: unknown, code: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new DevelopmentRunContractError(code);
  }
  return value.trim();
}

function id(value: unknown, code: string): string {
  const normalized = text(value, code);
  if (!ID.test(normalized)) throw new DevelopmentRunContractError(code);
  return normalized;
}

function ref(value: unknown, code: string): string {
  const normalized = text(value, code);
  if (!REF.test(normalized)) throw new DevelopmentRunContractError(code);
  return normalized;
}

function hash(value: unknown, code: string): string {
  const normalized = text(value, code, 64);
  if (!HASH.test(normalized)) throw new DevelopmentRunContractError(code);
  return normalized;
}

function containsRawSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => RAW_SECRET_KEY.test(key) || containsRawSecret(child)
  );
}

function assertPayload(payload: Record<string, unknown>): void {
  if (containsRawSecret(payload))
    throw new DevelopmentRunContractError("RAW_SECRET_FORBIDDEN");
  if (Object.keys(payload).length > 64)
    throw new DevelopmentRunContractError("EVENT_PAYLOAD_TOO_LARGE");
}

export function buildDevelopmentRun(input: {
  runId: string;
  tenantId: string;
  actorId: number;
  goal: string;
  repositoryRef: string;
  baseRevision: string;
  contextPackHash: string;
  workspaceId: string;
  maxPhaseAttempts?: number;
  metadata?: Record<string, unknown>;
}): DevelopmentRun {
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0) {
    throw new DevelopmentRunContractError("ACTOR_ID_INVALID");
  }
  const maxPhaseAttempts = input.maxPhaseAttempts ?? 3;
  if (
    !Number.isSafeInteger(maxPhaseAttempts) ||
    maxPhaseAttempts < 1 ||
    maxPhaseAttempts > 10
  ) {
    throw new DevelopmentRunContractError("MAX_PHASE_ATTEMPTS_INVALID");
  }
  if (input.metadata && containsRawSecret(input.metadata)) {
    throw new DevelopmentRunContractError("RAW_SECRET_FORBIDDEN");
  }
  return {
    contractVersion: SPEC_224_RUN_CONTRACT_VERSION,
    runId: id(input.runId, "RUN_ID_INVALID"),
    tenantId: id(input.tenantId, "TENANT_ID_INVALID"),
    actorId: input.actorId,
    goal: text(input.goal, "GOAL_INVALID", 4_000),
    repositoryRef: ref(input.repositoryRef, "REPOSITORY_REF_INVALID"),
    baseRevision: ref(input.baseRevision, "BASE_REVISION_INVALID"),
    contextPackHash: hash(input.contextPackHash, "CONTEXT_HASH_INVALID"),
    workspaceId: ref(input.workspaceId, "WORKSPACE_REF_INVALID"),
    state: "DISCOVERY",
    phaseAttempt: 0,
    maxPhaseAttempts,
    workerJobId: null,
    resumeState: null,
    decisionEpoch: 0,
    fencingVersion: 0,
    evidenceRefs: [],
    eventSequence: 0,
    eventIdempotencyKeys: [],
    events: [],
    ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
  };
}

export function transitionDevelopmentRun(
  run: DevelopmentRun,
  nextState: DevelopmentRunState
): DevelopmentRun {
  if (TERMINAL_STATES.has(run.state))
    throw new DevelopmentRunContractError("RUN_TERMINAL");
  if (!NEXT_STATES[run.state].includes(nextState)) {
    throw new DevelopmentRunContractError("RUN_TRANSITION_INVALID");
  }
  if (
    nextState === "COMPLETED" &&
    !run.evidenceRefs.some(refValue => /^evidence:final[-:]/.test(refValue))
  ) {
    throw new DevelopmentRunContractError("FINAL_VERIFY_EVIDENCE_REQUIRED");
  }
  const isNewPhase = ![
    "RECOVERY",
    "WAITING_HUMAN_DECISION",
    "PAUSED_POLICY",
    "BLOCKED_RECOVERABLE",
    "RECOVERY_EXHAUSTED_PENDING_DECISION",
  ].includes(nextState);
  return {
    ...run,
    state: nextState,
    phaseAttempt: isNewPhase && nextState !== run.state ? 0 : run.phaseAttempt,
    decisionEpoch:
      nextState === "WAITING_HUMAN_DECISION"
        ? run.decisionEpoch + 1
        : run.decisionEpoch,
    resumeState:
      nextState === "RECOVERY" || nextState === "WAITING_HUMAN_DECISION"
        ? run.state
        : run.resumeState,
  };
}

export function recordDevelopmentEvent(
  run: DevelopmentRun,
  input: {
    eventId: string;
    idempotencyKey: string;
    type: DevelopmentEventType;
    payload: Record<string, unknown>;
    occurredAt?: string;
  }
): { run: DevelopmentRun; event: DevelopmentEvent | null; accepted: boolean } {
  const eventId = id(input.eventId, "EVENT_ID_INVALID");
  const idempotencyKey = text(
    input.idempotencyKey,
    "EVENT_IDEMPOTENCY_INVALID",
    200
  );
  assertPayload(input.payload);
  if (run.eventIdempotencyKeys.includes(idempotencyKey)) {
    return { run, event: null, accepted: false };
  }
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new DevelopmentRunContractError("EVENT_TIMESTAMP_INVALID");
  }
  const event: DevelopmentEvent = {
    eventId,
    runId: run.runId,
    sequence: run.eventSequence + 1,
    idempotencyKey,
    type: input.type,
    payload: structuredClone(input.payload),
    occurredAt,
  };
  return {
    run: {
      ...run,
      eventSequence: event.sequence,
      eventIdempotencyKeys: [...run.eventIdempotencyKeys, idempotencyKey],
      events: [...run.events, event],
    },
    event,
    accepted: true,
  };
}

export function decideNextSafeAction(run: DevelopmentRun): DevelopmentCommand {
  if (
    run.state === "COMPLETED" ||
    run.state === "CANCELLED" ||
    run.state === "FAILED_TERMINAL"
  ) {
    return { command: "STOP", reason: run.state };
  }
  if (run.state === "RECOVERY") {
    return { command: "RECOVER_PHASE", phase: run.resumeState ?? "DISCOVERY" };
  }
  if (
    [
      "WAITING_HUMAN_DECISION",
      "PAUSED_POLICY",
      "BLOCKED_RECOVERABLE",
      "RECOVERY_EXHAUSTED_PENDING_DECISION",
    ].includes(run.state)
  ) {
    return { command: "WAIT_FOR_HUMAN_DECISION", reason: run.state };
  }
  return { command: "RUN_PHASE", phase: run.state };
}

export function bindWorkerJob(
  run: DevelopmentRun,
  workerJobId: string
): DevelopmentRun {
  const normalized = id(workerJobId, "WORKER_JOB_ID_INVALID");
  if (run.workerJobId && run.workerJobId !== normalized) {
    throw new DevelopmentRunContractError("WORKER_JOB_REBIND_FORBIDDEN");
  }
  return {
    ...run,
    workerJobId: normalized,
    fencingVersion: run.fencingVersion + 1,
  };
}

export function classifyDevelopmentFailure(input: {
  phase: DevelopmentRunState;
  errorClass: "retryable" | "policy" | "permanent" | "unknown";
  attempt: number;
  maxAttempts: number;
}):
  | { outcome: "RETRY_PHASE"; nextState: "RECOVERY" }
  | { outcome: "PAUSED_POLICY"; nextState: "PAUSED_POLICY" }
  | { outcome: "WAITING_HUMAN_DECISION"; nextState: "WAITING_HUMAN_DECISION" }
  | { outcome: "FAILED_TERMINAL"; nextState: "FAILED_TERMINAL" } {
  if (
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1 ||
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new DevelopmentRunContractError("FAILURE_ATTEMPT_INVALID");
  }
  if (input.errorClass === "policy")
    return { outcome: "PAUSED_POLICY", nextState: "PAUSED_POLICY" };
  if (input.errorClass === "retryable" && input.attempt < input.maxAttempts) {
    return { outcome: "RETRY_PHASE", nextState: "RECOVERY" };
  }
  if (input.errorClass === "retryable" || input.errorClass === "unknown") {
    return {
      outcome: "WAITING_HUMAN_DECISION",
      nextState: "WAITING_HUMAN_DECISION",
    };
  }
  return { outcome: "FAILED_TERMINAL", nextState: "FAILED_TERMINAL" };
}

export function buildDevelopmentHarnessJob(input: {
  run: DevelopmentRun;
  provider: Extract<AgentProvider, "codex" | "claude_code">;
  runtime: AgentRuntime;
  planId: string;
  planRevision: number;
  skillIds: string[];
  requestedCapabilities: string[];
  policyBinding?: AgentTaskPolicyBinding;
}): {
  manifest: AgentTaskManifest;
  definition: ReturnType<typeof buildAgentJobDefinition>;
} {
  const manifest: AgentTaskManifest = {
    taskId: input.run.runId,
    tenantId: input.run.tenantId,
    actorId: input.run.actorId,
    goalId: `goal:${input.run.runId}`,
    planId: id(input.planId, "PLAN_ID_INVALID"),
    planRevision: input.planRevision,
    provider: input.provider,
    runtime: input.runtime,
    workspaceId: input.run.workspaceId,
    contextPackageIds: [`context:${input.run.contextPackHash}`],
    skillIds: input.skillIds.map(skillId => id(skillId, "SKILL_ID_INVALID")),
    mcpGrantIds: [],
    requestedCapabilities: input.requestedCapabilities.map(capability =>
      id(capability, "CAPABILITY_ID_INVALID")
    ),
    ...(input.policyBinding ? { policyBinding: input.policyBinding } : {}),
  };
  return { manifest, definition: buildAgentJobDefinition(manifest) };
}

export async function enqueueDevelopmentHarnessJob(input: {
  run: DevelopmentRun;
  provider: Extract<AgentProvider, "codex" | "claude_code">;
  runtime: AgentRuntime;
  planId: string;
  planRevision: number;
  skillIds: string[];
  requestedCapabilities: string[];
  policyBinding?: AgentTaskPolicyBinding;
  authorizationScope: string;
  correlationId?: string;
  controlPlane?: ReturnType<typeof createJobControlPlane>;
  executorRegistry?: JobExecutorRegistry;
}): Promise<{
  jobRef: JobRef;
  manifest: AgentTaskManifest;
  definition: ReturnType<typeof buildAgentJobDefinition>;
}> {
  const prepared = buildDevelopmentHarnessJob(input);
  const jobRef = await createControlPlaneJob({
    context: {
      tenantId: input.run.tenantId,
      actorType: "user",
      actorId: input.run.actorId,
      authorizationScope: text(
        input.authorizationScope,
        "AUTHORIZATION_SCOPE_INVALID",
        160
      ),
      correlationId:
        input.correlationId ?? `development-run:${input.run.runId}`,
      idempotencyKey: prepared.definition.idempotencyKey,
    },
    definition: prepared.definition,
    controlPlane: input.controlPlane,
    executorRegistry: input.executorRegistry,
  });
  return { ...prepared, jobRef, run: bindWorkerJob(input.run, jobRef.jobId) };
}
