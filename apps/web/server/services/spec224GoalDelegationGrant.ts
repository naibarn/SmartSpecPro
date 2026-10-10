import { createHash } from "node:crypto";

export const SPEC224_GOAL_DELEGATION_GRANT_VERSION =
  "spec224.goal-delegation-grant.v1" as const;

export type Spec224GoalGrantAuthorityEvidence = {
  approvalRef: string;
  tenantId: string | null;
  executionId: string | null;
  requesterId: number | null;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  currentApprovals: number;
  requiredApprovers: number;
  expiresAt: string | null;
  revokedAt?: string | null;
  payload: Record<string, unknown>;
};

export type Spec224GoalGrantBudgetHold = {
  reservationRef: string;
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
};

export type Spec224GoalGrantScope = {
  grantId: string;
  goalId: string;
  actorId: number;
  workspaceId: string;
  repositoryRef: string;
  sourceSha: string;
  allowedActions: string[];
  writeScope: string[];
  capabilities: string[];
  budgetLimitMinorUnits: number;
  currency: string;
  issuedAt: string;
  expiresAt: string;
};

/** Build an approval request payload; only the existing Approval Authority can issue it. */
export function buildSpec224GoalGrantApprovalPayload(
  scope: Spec224GoalGrantScope
): Record<string, unknown> {
  if (
    !isText(scope.grantId, 160) ||
    !isText(scope.goalId, 160) ||
    !Number.isSafeInteger(scope.actorId) ||
    scope.actorId <= 0 ||
    !isText(scope.workspaceId, 200) ||
    !isText(scope.repositoryRef, 255) ||
    !SHA.test(scope.sourceSha) ||
    !Array.isArray(scope.allowedActions) ||
    scope.allowedActions.length === 0 ||
    scope.allowedActions.some(action => !ACTIONS.has(action)) ||
    !Array.isArray(scope.writeScope) ||
    scope.writeScope.length === 0 ||
    scope.writeScope.some(path => typeof path !== "string" || !isSafeGlob(path)) ||
    !Array.isArray(scope.capabilities) ||
    scope.capabilities.length === 0 ||
    scope.capabilities.some(capability => !isText(capability, 160)) ||
    !Number.isSafeInteger(scope.budgetLimitMinorUnits) ||
    scope.budgetLimitMinorUnits <= 0 ||
    !/^[A-Za-z]{3}$/.test(scope.currency) ||
    !Number.isFinite(Date.parse(scope.issuedAt)) ||
    !Number.isFinite(Date.parse(scope.expiresAt)) ||
    Date.parse(scope.expiresAt) <= Date.parse(scope.issuedAt) ||
    new Set(scope.allowedActions).size !== scope.allowedActions.length ||
    new Set(scope.writeScope).size !== scope.writeScope.length ||
    new Set(scope.capabilities).size !== scope.capabilities.length
  )
    throw new Error("SPEC224_GOAL_GRANT_SCOPE_INVALID");

  return {
    kind: "spec224_goal_delegation_grant",
    ...scope,
    allowedActions: [...scope.allowedActions].sort(),
    writeScope: [...scope.writeScope].sort(),
    capabilities: [...scope.capabilities].sort(),
    currency: scope.currency.toUpperCase(),
  };
}

export type Spec224GoalDelegationInput = {
  now?: Date;
  /** Must be loaded from the canonical Approval Authority, never from a job payload. */
  authority: Spec224GoalGrantAuthorityEvidence;
  child: {
    goalId: string;
    tenantId: string;
    actorId: number;
    workspaceId: string;
    repositoryRef: string;
    sourceSha: string;
    action: string;
    changedPaths: string[];
    requiredCapabilities: string[];
    workerJobId: string;
    attemptId: string;
    budgetHold: Spec224GoalGrantBudgetHold | null;
  };
};

export type Spec224GoalDelegationBinding = {
  version: typeof SPEC224_GOAL_DELEGATION_GRANT_VERSION;
  grantRef: string;
  authorityRef: string;
  goalId: string;
  tenantId: string;
  actorId: number;
  workspaceId: string;
  repositoryRef: string;
  sourceSha: string;
  action: string;
  changedPaths: string[];
  capabilities: string[];
  workerJobId: string;
  attemptId: string;
  budgetReservationRef: string;
  budgetCapMinorUnits: number;
  currency: string;
  expiresAt: string;
  digest: string;
};

export type Spec224GoalDelegationResult =
  | {
      status: "READY_FOR_DELEGATION";
      reasons: [];
      binding: Spec224GoalDelegationBinding;
    }
  | {
      status: "AUTHORITY_DENIED" | "SCOPE_DENIED" | "BUDGET_DENIED";
      reasons: string[];
    };

const ACTIONS = new Set([
  "repair",
  "test",
  "commit",
  "push",
  "create_pr",
  "merge",
  "verify",
  "cleanup",
]);
const WRITE_ACTIONS = new Set(["repair", "commit", "push"]);
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const SECRET_KEY =
  /(?:access[_-]?token|api[_-]?key|authorization|credential|password|private[_-]?key|refresh[_-]?token|secret|token)/i;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safePayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safePayload);
  if (!record(value)) return true;
  return Object.entries(value).every(
    ([key, child]) => !SECRET_KEY.test(key) && safePayload(child)
  );
}

function isText(value: unknown, max = 255): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function parseGrant(input: Spec224GoalDelegationInput, now: Date) {
  const authority = input.authority;
  const payload = authority.payload;
  const expiresAt =
    typeof payload.expiresAt === "string"
      ? payload.expiresAt
      : authority.expiresAt;
  const issuedAt =
    typeof payload.issuedAt === "string" ? payload.issuedAt : null;
  if (
    !safePayload(payload) ||
    payload.kind !== "spec224_goal_delegation_grant" ||
    !isText(payload.grantId, 160) ||
    !isText(payload.goalId, 160) ||
    !isText(payload.workspaceId, 200) ||
    !isText(payload.repositoryRef, 255) ||
    typeof payload.sourceSha !== "string" ||
    !SHA.test(payload.sourceSha) ||
    !Number.isSafeInteger(payload.actorId) ||
    (payload.actorId as number) <= 0 ||
    !Array.isArray(payload.allowedActions) ||
    payload.allowedActions.length === 0 ||
    payload.allowedActions.length > ACTIONS.size ||
    !payload.allowedActions.every(
      action => typeof action === "string" && ACTIONS.has(action)
    ) ||
    new Set(payload.allowedActions).size !== payload.allowedActions.length ||
    !Array.isArray(payload.writeScope) ||
    payload.writeScope.length === 0 ||
    payload.writeScope.length > 256 ||
    !payload.writeScope.every(
      path => typeof path === "string" && isSafeGlob(path)
    ) ||
    new Set(payload.writeScope).size !== payload.writeScope.length ||
    !Array.isArray(payload.capabilities) ||
    payload.capabilities.length > 128 ||
    !payload.capabilities.every(capability => isText(capability, 160)) ||
    new Set(payload.capabilities).size !== payload.capabilities.length ||
    !Number.isSafeInteger(payload.budgetLimitMinorUnits) ||
    (payload.budgetLimitMinorUnits as number) <= 0 ||
    typeof payload.currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(payload.currency) ||
    !issuedAt ||
    !Number.isFinite(Date.parse(issuedAt)) ||
    Date.parse(issuedAt) > now.getTime() ||
    !expiresAt ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= now.getTime() ||
    (typeof payload.revokedAt === "string" && payload.revokedAt.length > 0)
  )
    return null;

  if (
    authority.status !== "approved" ||
    (typeof authority.revokedAt === "string" &&
      authority.revokedAt.length > 0) ||
    !isText(authority.approvalRef, 160) ||
    !Number.isSafeInteger(authority.requiredApprovers) ||
    authority.requiredApprovers < 1 ||
    !Number.isSafeInteger(authority.currentApprovals) ||
    authority.currentApprovals < authority.requiredApprovers ||
    !isText(authority.tenantId, 36) ||
    authority.executionId !== payload.goalId ||
    authority.requesterId !== payload.actorId ||
    (authority.expiresAt !== null &&
      (!Number.isFinite(Date.parse(authority.expiresAt)) ||
        Date.parse(authority.expiresAt) <= now.getTime()))
  )
    return null;

  return {
    grantId: payload.grantId,
    goalId: payload.goalId,
    tenantId: authority.tenantId,
    actorId: payload.actorId as number,
    workspaceId: payload.workspaceId,
    repositoryRef: payload.repositoryRef,
    sourceSha: payload.sourceSha,
    allowedActions: payload.allowedActions as string[],
    writeScope: payload.writeScope as string[],
    capabilities: payload.capabilities as string[],
    budgetLimitMinorUnits: payload.budgetLimitMinorUnits as number,
    currency: (payload.currency as string).toUpperCase(),
    expiresAt,
  };
}

function isSafeGlob(value: string): boolean {
  return (
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").some(part => !part || part === "." || part === "..") &&
    /^[A-Za-z0-9*?._/-]+$/.test(value)
  );
}

function isSafeRelativePath(value: string): boolean {
  return isSafeGlob(value) && !value.includes("*") && !value.includes("?");
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern
    .split("**")
    .map(part =>
      part
        .split("*")
        .map(piece =>
          piece
            .split("?")
            .map(char => char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
            .join(".")
        )
        .join("[^/]*")
    )
    .join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function denial(
  status: "AUTHORITY_DENIED" | "SCOPE_DENIED" | "BUDGET_DENIED",
  reason: string
): Spec224GoalDelegationResult {
  return { status, reasons: [reason] };
}

/**
 * Derive a child job/attempt binding from a currently approved Goal grant.
 * The caller must re-read the source approval and create the economic hold
 * through the canonical service before treating this binding as dispatchable.
 * This function never issues or persists approval authority itself.
 */
export function evaluateSpec224GoalDelegation(
  input: Spec224GoalDelegationInput
): Spec224GoalDelegationResult {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime()))
    return denial("AUTHORITY_DENIED", "AUTHORITY_CLOCK_INVALID");
  const grant = parseGrant(input, now);
  if (!grant)
    return denial("AUTHORITY_DENIED", "GOAL_GRANT_NOT_ACTIVE_OR_APPROVED");

  const child = input.child;
  if (
    !Array.isArray(child.changedPaths) ||
    !Array.isArray(child.requiredCapabilities) ||
    child.requiredCapabilities.some(capability => !isText(capability, 160))
  ) return denial("SCOPE_DENIED", "CHILD_SCOPE_MALFORMED");
  if (
    child.goalId !== grant.goalId ||
    child.tenantId !== grant.tenantId ||
    child.actorId !== grant.actorId ||
    child.workspaceId !== grant.workspaceId ||
    child.repositoryRef !== grant.repositoryRef ||
    child.sourceSha !== grant.sourceSha ||
    !SHA.test(child.sourceSha) ||
    !ACTIONS.has(child.action) ||
    !grant.allowedActions.includes(child.action) ||
    !isText(child.workerJobId, 160) ||
    !isText(child.attemptId, 160) ||
    (WRITE_ACTIONS.has(child.action) && child.changedPaths.length === 0) ||
    child.changedPaths.length > 256 ||
    child.changedPaths.some(
      path =>
        typeof path !== "string" ||
        !isSafeRelativePath(path) ||
        !grant.writeScope.some(pattern => globMatches(pattern, path))
    ) ||
    child.requiredCapabilities.some(
      capability => !grant.capabilities.includes(capability)
    )
  )
    return denial("SCOPE_DENIED", "CHILD_SCOPE_EXCEEDS_GOAL_GRANT");

  const hold = child.budgetHold;
  if (
    !hold ||
    !isText(hold.tenantId, 36) ||
    hold.tenantId !== grant.tenantId ||
    hold.workerJobId !== child.workerJobId ||
    hold.attemptId !== child.attemptId ||
    hold.status !== "held" ||
    !isText(hold.reservationRef, 160) ||
    !Number.isSafeInteger(hold.amountMinorUnits) ||
    hold.amountMinorUnits <= 0 ||
    hold.amountMinorUnits > grant.budgetLimitMinorUnits ||
    !isText(hold.currency, 3) ||
    hold.currency.trim().toUpperCase() !== grant.currency
  )
    return denial("BUDGET_DENIED", "EXACT_CHILD_BUDGET_HOLD_REQUIRED");

  const bindingBase = {
    version: SPEC224_GOAL_DELEGATION_GRANT_VERSION,
    grantRef: grant.grantId,
    authorityRef: input.authority.approvalRef,
    goalId: grant.goalId,
    tenantId: grant.tenantId,
    actorId: grant.actorId,
    workspaceId: grant.workspaceId,
    repositoryRef: grant.repositoryRef,
    sourceSha: grant.sourceSha,
    action: child.action,
    changedPaths: [...child.changedPaths].sort(),
    capabilities: [...child.requiredCapabilities].sort(),
    workerJobId: child.workerJobId,
    attemptId: child.attemptId,
    budgetReservationRef: hold.reservationRef,
    budgetCapMinorUnits: hold.amountMinorUnits,
    currency: hold.currency.trim().toUpperCase(),
    expiresAt: grant.expiresAt,
  } as const;
  const digest = createHash("sha256")
    .update(JSON.stringify(bindingBase))
    .digest("hex");
  return {
    status: "READY_FOR_DELEGATION",
    reasons: [],
    binding: { ...bindingBase, digest },
  };
}
