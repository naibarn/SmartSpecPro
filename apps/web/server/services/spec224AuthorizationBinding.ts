import type {
  RunnerCapabilitySnapshot,
  RunnerToolInventoryEntry,
} from "./runnerContracts";

export const SPEC224_AUTHORIZATION_BINDING_VERSION =
  "spec-224-authorization-binding-v1" as const;

export type Spec224AuthorizationStatus =
  | "NOT_CONFIGURED"
  | "AUTHENTICATION_REQUIRED"
  | "RUNNER_BINDING_REQUIRED"
  | "WORKSPACE_APPROVAL_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "BUDGET_REQUIRED"
  | "READY_FOR_LIVE"
  | "REVOKED"
  | "EXPIRED";

export type Spec224AuthorizationRun = {
  runId: string;
  tenantId: string;
  actorId: number;
  workerJobId: string | null;
  attemptId: string | null;
  workspaceId: string;
  provider: "codex" | "claude_code";
  deadline: string;
};

export type Spec224AuthorizationRunner = {
  runnerId: string;
  tenantId: string;
  ownerUserId: number | null;
  trustState: "pending" | "trusted" | "revoked" | "quarantined";
  status: "offline" | "online" | "degraded" | "revoked";
  activeSessionId: string | null;
  snapshot: RunnerCapabilitySnapshot | null;
};

export type Spec224ApprovalEvidence = {
  approvalRef: string;
  tenantId: string | null;
  executionId: string | null;
  requesterId: number | null;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  currentApprovals: number;
  requiredApprovers: number;
  expiresAt: string | null;
  payload: Record<string, unknown>;
};

export type Spec224BudgetEvidence = {
  budgetReservationRef: string;
  tenantId: string;
  workerJobId: string;
  attemptId: string;
  status:
    | "held"
    | "partially_captured"
    | "captured"
    | "released"
    | "reconciliation_required";
  amountMinorUnits: number;
  currency: string;
  expiresAt: string | null;
};

export type Spec224AuthorizationInput = {
  now?: Date;
  run: Spec224AuthorizationRun;
  runner: Spec224AuthorizationRunner | null;
  approval: Spec224ApprovalEvidence | null;
  budget: Spec224BudgetEvidence | null;
};

export type Spec224PolicyBinding = {
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  authorizationGrantRef: string;
  approvalRef: string;
  budgetReservationRef: string;
  spendCeilingMicros: number;
  workspaceRef: string;
  deadline: string;
};

export type Spec224AuthorizationResult = {
  version: typeof SPEC224_AUTHORIZATION_BINDING_VERSION;
  status: Spec224AuthorizationStatus;
  reasons: string[];
  references?: {
    runnerId?: string;
    approvalRef?: string;
    budgetReservationRef?: string;
  };
  binding?: Spec224PolicyBinding;
};

function hasRawSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRawSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => {
      const isOpaqueReference = /(?:ref|id)$/i.test(key);
      const isSecretKey =
        /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|private[_-]?key|cookie)/i.test(
          key
        );
      return (!isOpaqueReference && isSecretKey) || hasRawSecret(child);
    }
  );
}

function isExpired(value: string | null | undefined, now: Date): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime());
}

function codexTool(
  snapshot: RunnerCapabilitySnapshot
): RunnerToolInventoryEntry | null {
  return (
    snapshot.toolInventory?.find(
      tool => tool.toolId === "codex" || tool.adapterId === "codex.v1"
    ) ?? null
  );
}

function result(
  status: Spec224AuthorizationStatus,
  reasons: string[],
  binding?: Spec224PolicyBinding
): Spec224AuthorizationResult {
  return {
    version: SPEC224_AUTHORIZATION_BINDING_VERSION,
    status,
    reasons: [...new Set(reasons)],
    ...(binding ? { binding } : {}),
  };
}

/**
 * Pure fail-closed readiness gate. The evidence objects must be read from the
 * existing Runner, approval and economic authorities by the caller; this
 * function never treats a client-supplied reference as proof.
 */
export function evaluateSpec224Authorization(
  input: Spec224AuthorizationInput
): Spec224AuthorizationResult {
  const now = input.now ?? new Date();
  const { run, runner, approval, budget } = input;
  const reasons: string[] = [];

  if (
    run.provider !== "codex" ||
    !run.workerJobId ||
    !run.attemptId ||
    !run.workspaceId.trim() ||
    !Number.isFinite(Date.parse(run.deadline))
  ) {
    return result("NOT_CONFIGURED", ["RUN_CONFIGURATION_INCOMPLETE"]);
  }
  if (isExpired(run.deadline, now)) return result("EXPIRED", ["RUN_DEADLINE_EXPIRED"]);

  if (!runner) return result("RUNNER_BINDING_REQUIRED", ["RUNNER_NOT_SELECTED"]);
  if (runner.tenantId !== run.tenantId || runner.ownerUserId !== run.actorId) {
    return result("RUNNER_BINDING_REQUIRED", ["RUNNER_SCOPE_MISMATCH"]);
  }
  if (runner.trustState === "revoked" || runner.status === "revoked") {
    return result("REVOKED", ["RUNNER_REVOKED"]);
  }
  if (!runner.snapshot || !runner.activeSessionId) {
    return result("RUNNER_BINDING_REQUIRED", ["RUNNER_SESSION_OR_SNAPSHOT_MISSING"]);
  }
  const snapshot = runner.snapshot;
  if (
    snapshot.tenantId !== run.tenantId ||
    snapshot.runnerId !== runner.runnerId ||
    snapshot.runnerSessionId !== runner.activeSessionId ||
    !snapshot.capabilitySnapshotId
  ) {
    return result("RUNNER_BINDING_REQUIRED", ["RUNNER_SESSION_OR_SNAPSHOT_MISMATCH"]);
  }
  if (isExpired(snapshot.expiresAt, now)) {
    return result("EXPIRED", ["CAPABILITY_SNAPSHOT_EXPIRED"]);
  }
  if (runner.status !== "online") {
    return result("RUNNER_BINDING_REQUIRED", ["RUNNER_NOT_ONLINE"]);
  }

  const tool = codexTool(snapshot);
  if (
    !tool ||
    tool.authState !== "authenticated" ||
    tool.installState !== "installed" ||
    tool.configurationState !== "configured" ||
    tool.healthState !== "healthy" ||
    !tool.authorizationEvidenceRef
  ) {
    return result("AUTHENTICATION_REQUIRED", ["CODEX_RUNNER_AUTHENTICATION_MISSING"]);
  }
  if (!snapshot.capabilities.includes("agent.external_task")) {
    return result("RUNNER_BINDING_REQUIRED", ["EXTERNAL_AGENT_CAPABILITY_MISSING"]);
  }
  if (!snapshot.workspaceIds.includes(run.workspaceId)) {
    return result("WORKSPACE_APPROVAL_REQUIRED", ["WORKSPACE_BINDING_MISMATCH"]);
  }

  if (!approval) return result("APPROVAL_REQUIRED", ["APPROVAL_NOT_FOUND"]);
  if (hasRawSecret(approval.payload)) {
    return result("APPROVAL_REQUIRED", ["APPROVAL_PAYLOAD_SECRET"]);
  }
  if (approval.tenantId !== run.tenantId) reasons.push("APPROVAL_TENANT_MISMATCH");
  if (approval.executionId !== run.workerJobId) reasons.push("APPROVAL_EXECUTION_MISMATCH");
  if (approval.requesterId !== run.actorId) reasons.push("APPROVAL_REQUESTER_MISMATCH");
  if (
    approval.payload.runId !== run.runId ||
    approval.payload.provider !== run.provider ||
    approval.payload.workspaceId !== run.workspaceId ||
    approval.payload.authorizationGrantRef !== tool.authorizationEvidenceRef
  ) {
    reasons.push("APPROVAL_BINDING_MISMATCH");
  }
  if (isExpired(approval.expiresAt, now) || approval.status === "expired") {
    return result("EXPIRED", ["APPROVAL_EXPIRED", ...reasons]);
  }
  if (approval.status !== "approved" || approval.currentApprovals < approval.requiredApprovers) {
    return result("APPROVAL_REQUIRED", [
      approval.status === "rejected" ? "APPROVAL_REJECTED" : "APPROVAL_PENDING",
      ...reasons,
    ]);
  }
  if (reasons.length > 0) return result("APPROVAL_REQUIRED", reasons);

  if (!budget) return result("BUDGET_REQUIRED", ["BUDGET_RESERVATION_NOT_FOUND"]);
  if (
    budget.tenantId !== run.tenantId ||
    budget.workerJobId !== run.workerJobId ||
    budget.attemptId !== run.attemptId ||
    budget.status !== "held" ||
    budget.amountMinorUnits <= 0
  ) {
    return result("BUDGET_REQUIRED", ["BUDGET_BINDING_MISMATCH"]);
  }
  if (isExpired(budget.expiresAt, now)) return result("EXPIRED", ["BUDGET_RESERVATION_EXPIRED"]);

  const binding: Spec224PolicyBinding = {
    runnerId: runner.runnerId,
    runnerSessionId: runner.activeSessionId,
    capabilitySnapshotId: snapshot.capabilitySnapshotId,
    capabilitySnapshotRevision: snapshot.revision,
    authorizationGrantRef: tool.authorizationEvidenceRef,
    approvalRef: approval.approvalRef,
    budgetReservationRef: budget.budgetReservationRef,
    spendCeilingMicros: budget.amountMinorUnits,
    workspaceRef: run.workspaceId,
    deadline: run.deadline,
  };
  return result("READY_FOR_LIVE", [], binding);
}
