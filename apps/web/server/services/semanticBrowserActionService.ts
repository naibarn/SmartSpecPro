export type SemanticTarget = {
  targetId: string;
  domVersion: string;
  visible: boolean;
  occluded: boolean;
  annotation?: string;
};
export type SemanticActionPlan = {
  actionId: string;
  sessionId: string;
  idempotencyKey: string;
  action: "click" | "type" | "submit";
  target: SemanticTarget;
  targetHint?: string;
  status: "preview" | "committed" | "duplicate";
};

export class SemanticBrowserActionError extends Error {
  readonly code: "APPROVAL_REQUIRED" | "TARGET_STALE" | "TARGET_NOT_ACTIONABLE";
  constructor(code: SemanticBrowserActionError["code"], message = code) {
    super(message);
    this.name = "SemanticBrowserActionError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const committedActions = new Set<string>();

export function createSemanticActionPlan(input: {
  sessionId: string;
  idempotencyKey: string;
  action: SemanticActionPlan["action"];
  target: SemanticTarget;
  approvalRequired: boolean;
}): SemanticActionPlan {
  return {
    actionId: `${input.sessionId}:${input.idempotencyKey}`,
    sessionId: input.sessionId,
    idempotencyKey: input.idempotencyKey,
    action: input.action,
    target: input.target,
    ...(input.target.annotation ? { targetHint: input.target.annotation } : {}),
    status: "preview",
  };
}

export function commitSemanticAction(
  plan: SemanticActionPlan,
  input: { approved: boolean; currentTarget: SemanticTarget }
): SemanticActionPlan {
  if (committedActions.has(plan.actionId))
    return { ...plan, status: "duplicate" };
  if (!input.approved)
    throw new SemanticBrowserActionError("APPROVAL_REQUIRED");
  if (
    input.currentTarget.targetId !== plan.target.targetId ||
    input.currentTarget.domVersion !== plan.target.domVersion
  )
    throw new SemanticBrowserActionError("TARGET_STALE");
  if (!input.currentTarget.visible || input.currentTarget.occluded)
    throw new SemanticBrowserActionError("TARGET_NOT_ACTIONABLE");
  committedActions.add(plan.actionId);
  return { ...plan, status: "committed" };
}

export function verifySemanticOutcome(input: {
  expected: { url?: string; text?: string };
  actual: { url?: string; text?: string };
}): { verified: boolean; reasonCode: "OUTCOME_VERIFIED" | "OUTCOME_MISMATCH" } {
  const urlOk =
    input.expected.url === undefined || input.expected.url === input.actual.url;
  const textOk =
    input.expected.text === undefined ||
    input.actual.text?.includes(input.expected.text) === true;
  return urlOk && textOk
    ? { verified: true, reasonCode: "OUTCOME_VERIFIED" }
    : { verified: false, reasonCode: "OUTCOME_MISMATCH" };
}
