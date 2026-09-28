import type { BrowserPolicyDecisionEnvelope } from "../../shared/browserPolicy";

export const P213_CERTIFICATION_MARKER = {
  purpose: "p213_certification",
  fixture: "approval_required",
  riskClass: "explicit_approval_test",
  issuedBy: "server",
} as const;

export type P213CertificationDescriptor = typeof P213_CERTIFICATION_MARKER & {
  tenantId: string;
  requesterId: number;
  projectRef: string;
};

function requiredTenant(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("P213_CERTIFICATION_TENANT_REQUIRED");
  return value.trim();
}

function requiredRequester(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error("P213_CERTIFICATION_REQUESTER_REQUIRED");
  return Number(value);
}

function certificationModeEnabled(): boolean {
  return process.env.P213_CERTIFICATION_MODE === "true";
}

function configuredApproverId(requesterId: number): number {
  const value = Number.parseInt(process.env.P213_CERTIFICATION_APPROVER_USER_ID ?? "", 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("P213_CERTIFICATION_APPROVER_NOT_CONFIGURED");
  }
  if (value === requesterId) {
    throw new Error("P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT");
  }
  return value;
}

export function assertP213CertificationAdmission(input: {
  tenantId: string;
  requesterId: number;
  projectRef?: string;
}): { approverId: number; projectRef: string } {
  const tenantId = requiredTenant(input.tenantId);
  const requesterId = requiredRequester(input.requesterId);
  if (!certificationModeEnabled()) throw new Error("P213_CERTIFICATION_MODE_DISABLED");
  if (process.env.P213_CERTIFICATION_TENANT_ID !== tenantId) throw new Error("P213_CERTIFICATION_TENANT_MISMATCH");
  if (process.env.P213_CERTIFICATION_REQUESTER_USER_ID !== String(requesterId)) throw new Error("P213_CERTIFICATION_REQUESTER_MISMATCH");
  const projectRef = typeof input.projectRef === "string" ? input.projectRef.trim() : "";
  if (!projectRef) throw new Error("P213_CERTIFICATION_PROJECT_REQUIRED");
  if (process.env.P213_CERTIFICATION_PROJECT_REF !== projectRef) throw new Error("P213_CERTIFICATION_PROJECT_MISMATCH");
  return { approverId: configuredApproverId(requesterId), projectRef };
}

/**
 * Returns whether the authenticated identity matches the certification-only
 * requester grant. This deliberately includes the complete server-side
 * admission guard (including distinct approver configuration) and never
 * grants ordinary product authorization.
 */
export function isP213CertificationRequester(input: {
  tenantId: string;
  requesterId: number;
  projectRef?: string;
}): boolean {
  try {
    assertP213CertificationAdmission(input);
    return true;
  } catch {
    return false;
  }
}

export function isP213CertificationDescriptor(value: unknown): value is P213CertificationDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.purpose === P213_CERTIFICATION_MARKER.purpose
    && candidate.fixture === P213_CERTIFICATION_MARKER.fixture
    && candidate.riskClass === P213_CERTIFICATION_MARKER.riskClass
    && candidate.issuedBy === P213_CERTIFICATION_MARKER.issuedBy
    && typeof candidate.tenantId === "string"
    && Number.isSafeInteger(candidate.requesterId)
    && Number(candidate.requesterId) > 0
    && typeof candidate.projectRef === "string"
    && candidate.projectRef.trim().length > 0;
}

/**
 * The only constructor for the certification marker. It is intentionally
 * server-side and checks deployment-scoped identity before returning a value
 * that can influence the semantic approval seam.
 */
export function buildP213CertificationDescriptor(input: {
  tenantId: string;
  requesterId: number;
  projectRef?: string;
}): P213CertificationDescriptor {
  const { projectRef } = assertP213CertificationAdmission(input);
  const tenantId = requiredTenant(input.tenantId);
  const requesterId = requiredRequester(input.requesterId);
  return { ...P213_CERTIFICATION_MARKER, tenantId, requesterId, projectRef };
}

/**
 * Applies the certification seam only after the normal policy evaluator has
 * produced an actionable allow. It never turns a deny or an untrusted marker
 * into an executable or approval-required action.
 */
export function classifyP213ApprovalDecision(
  decision: BrowserPolicyDecisionEnvelope,
  descriptor: unknown,
): BrowserPolicyDecisionEnvelope {
  if (descriptor === null || descriptor === undefined) return decision;
  if (!isP213CertificationDescriptor(descriptor)) throw new Error("P213_CERTIFICATION_DESCRIPTOR_INVALID");
  if (decision.decision !== "allow" && decision.decision !== "allow_with_redaction") return decision;
  if (decision.tenantId !== descriptor.tenantId || decision.userId !== descriptor.requesterId) {
    throw new Error("P213_CERTIFICATION_DECISION_BINDING_MISMATCH");
  }
  return {
    ...decision,
    decision: "require_approval",
    reasonCodes: ["P213_CERTIFICATION_APPROVAL_REQUIRED"],
    approval: { required: true, approvalTtlSeconds: 300 },
  };
}

export function assertP213CertificationDescriptor(
  value: unknown,
  expected: { tenantId: string; requesterId: number },
): P213CertificationDescriptor {
  if (!isP213CertificationDescriptor(value)) throw new Error("P213_CERTIFICATION_DESCRIPTOR_INVALID");
  if (value.tenantId !== expected.tenantId || value.requesterId !== expected.requesterId) {
    throw new Error("P213_CERTIFICATION_DESCRIPTOR_BINDING_MISMATCH");
  }
  assertP213CertificationAdmission(value);
  return value;
}
