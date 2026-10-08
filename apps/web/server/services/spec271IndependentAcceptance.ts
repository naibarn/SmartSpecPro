import { digestSpec224EvidenceManifest } from "./spec224VerificationProvenance";

const REQUIREMENT_ID = /^REQ-[A-F0-9]{12}$/;
const SOURCE_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export type Spec271AcceptanceScope = Readonly<{
  requirementId: string;
  sourceSha: string;
  tenantId: string;
  projectId: string;
}>;

export type Spec271OracleBinding = Readonly<{
  oracleId: string;
  requirementId: string;
  sourceSha: string;
  tenantId: string;
  projectId: string;
  kind: "deterministic" | "human" | "domain";
  approved: boolean;
  producerId: string;
  evaluatorId: string;
  dependsOnRequirementIds: readonly string[];
  expectedValue?: unknown;
  expectationRef?: string;
  approvalRequired?: boolean;
  approvalRef?: string;
}>;

export type Spec271ApprovalReceipt = Readonly<{
  receiptId: string;
  decision: "approved" | "rejected";
  approverId: string;
  authorized: boolean;
  requirementId: string;
  sourceSha: string;
  tenantId: string;
  projectId: string;
  expiresAt: string;
}>;

export type Spec271AcceptanceEvidence = Readonly<{
  requirementId: string;
  sourceSha: string;
  tenantId: string;
  projectId: string;
  oracleId: string | null;
  testOutcome: "PASS" | "FAIL" | "NOT_RUN";
  oracleOutcome: "PASS" | "FAIL" | "NOT_RUN";
  acceptanceOutcome: "ACCEPTED" | "REJECTED" | "BLOCKED";
  reasons: readonly string[];
  approvalReceiptId?: string;
  testEvidenceRef?: string;
  observationRef?: string;
  expectationRef?: string;
  observationDigest?: string;
  expectationDigest?: string;
  evidenceDigest: string;
}>;

export type Spec271AcceptanceDependencies = Readonly<{
  /** Adapter over the existing approved oracle registry/domain-owner authority. */
  listApprovedBindings(
    scope: Spec271AcceptanceScope
  ): Promise<readonly Spec271OracleBinding[]>;
  /** Adapter over the existing approval authority; it must resolve, not trust, a caller-supplied receipt. */
  resolveApproval?(
    approvalRef: string,
    scope: Spec271AcceptanceScope
  ): Promise<Spec271ApprovalReceipt | null>;
}>;

function sameScope(
  left: Spec271OracleBinding,
  right: Spec271AcceptanceScope
): boolean {
  return (
    left.requirementId === right.requirementId &&
    left.sourceSha === right.sourceSha &&
    left.tenantId === right.tenantId &&
    left.projectId === right.projectId
  );
}

function digestValue(value: unknown): string {
  return digestSpec224EvidenceManifest({
    present: value !== undefined,
    value: value ?? null,
  });
}

function hasDependencyCycle(
  bindings: readonly Spec271OracleBinding[]
): boolean {
  const graph = new Map(
    bindings.map(binding => [
      binding.requirementId,
      binding.dependsOnRequirementIds,
    ])
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (requirementId: string): boolean => {
    if (visiting.has(requirementId)) return true;
    if (visited.has(requirementId)) return false;
    visiting.add(requirementId);
    for (const dependency of graph.get(requirementId) ?? []) {
      if (graph.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(requirementId);
    visited.add(requirementId);
    return false;
  };
  return [...graph.keys()].some(visit);
}

function makeEvidence(input: {
  scope: Spec271AcceptanceScope;
  oracleId: string | null;
  testOutcome: Spec271AcceptanceEvidence["testOutcome"];
  oracleOutcome: Spec271AcceptanceEvidence["oracleOutcome"];
  acceptanceOutcome: Spec271AcceptanceEvidence["acceptanceOutcome"];
  reasons: string[];
  approvalReceiptId?: string;
  testEvidenceRef?: string;
  observationRef?: string;
  expectationRef?: string;
  observationDigest?: string;
  expectationDigest?: string;
}): Spec271AcceptanceEvidence {
  const evidenceBody = {
    requirementId: input.scope.requirementId,
    sourceSha: input.scope.sourceSha,
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    oracleId: input.oracleId,
    testOutcome: input.testOutcome,
    oracleOutcome: input.oracleOutcome,
    acceptanceOutcome: input.acceptanceOutcome,
    reasons: [...input.reasons].sort(),
    ...(input.approvalReceiptId
      ? { approvalReceiptId: input.approvalReceiptId }
      : {}),
    ...(input.testEvidenceRef
      ? { testEvidenceRef: input.testEvidenceRef }
      : {}),
    ...(input.observationRef ? { observationRef: input.observationRef } : {}),
    ...(input.expectationRef ? { expectationRef: input.expectationRef } : {}),
    ...(input.observationDigest
      ? { observationDigest: input.observationDigest }
      : {}),
    ...(input.expectationDigest
      ? { expectationDigest: input.expectationDigest }
      : {}),
  };
  return {
    ...evidenceBody,
    evidenceDigest: digestSpec224EvidenceManifest(evidenceBody),
  };
}

/**
 * Deterministic SPEC-271 acceptance evaluator. Registry and approval adapters
 * remain the authorities; this function checks their returned records against
 * the exact requirement, source, tenant, and project scope before accepting.
 */
export async function evaluateSpec271Acceptance(
  input: {
    scope: Spec271AcceptanceScope;
    testOutcome: "PASS" | "FAIL" | "NOT_RUN";
    actualValue?: unknown;
    testEvidenceRef?: string;
    observationRef?: string;
    now: string;
  },
  dependencies: Spec271AcceptanceDependencies
): Promise<Spec271AcceptanceEvidence> {
  const { scope } = input;
  if (
    !REQUIREMENT_ID.test(scope.requirementId) ||
    !SOURCE_SHA.test(scope.sourceSha) ||
    !scope.tenantId ||
    !scope.projectId
  ) {
    return makeEvidence({
      scope,
      oracleId: null,
      testOutcome: input.testOutcome,
      oracleOutcome: "NOT_RUN",
      acceptanceOutcome: "BLOCKED",
      reasons: ["INVALID_ACCEPTANCE_SCOPE"],
    });
  }

  let listed: readonly Spec271OracleBinding[];
  try {
    listed = await dependencies.listApprovedBindings(scope);
  } catch {
    return makeEvidence({
      scope,
      oracleId: null,
      testOutcome: input.testOutcome,
      oracleOutcome: "NOT_RUN",
      acceptanceOutcome: "BLOCKED",
      reasons: ["ORACLE_REGISTRY_UNAVAILABLE"],
    });
  }
  const matches = listed.filter(
    binding => binding.requirementId === scope.requirementId
  );
  if (matches.length === 0) {
    return makeEvidence({
      scope,
      oracleId: null,
      testOutcome: input.testOutcome,
      oracleOutcome: "NOT_RUN",
      acceptanceOutcome: "BLOCKED",
      reasons: ["ORACLE_MISSING"],
    });
  }
  if (matches.length !== 1) {
    return makeEvidence({
      scope,
      oracleId: null,
      testOutcome: input.testOutcome,
      oracleOutcome: "NOT_RUN",
      acceptanceOutcome: "BLOCKED",
      reasons: ["ORACLE_BINDING_AMBIGUOUS"],
    });
  }

  const binding = matches[0];
  const oracleEvidence = {
    observationDigest: digestValue(input.actualValue),
    expectationDigest: digestValue(binding.expectedValue),
  };
  const invalid: string[] = [];
  if (!sameScope(binding, scope)) invalid.push("ORACLE_SCOPE_MISMATCH");
  if (!binding.approved) invalid.push("ORACLE_NOT_APPROVED");
  if (!binding.oracleId || !binding.producerId || !binding.evaluatorId)
    invalid.push("ORACLE_IDENTITY_INCOMPLETE");
  if (binding.producerId === binding.evaluatorId)
    invalid.push("ORACLE_SELF_REFERENTIAL");
  if (binding.dependsOnRequirementIds.includes(scope.requirementId))
    invalid.push("ORACLE_SELF_REFERENTIAL");
  if (binding.kind === "deterministic" && binding.expectedValue === undefined)
    invalid.push("ORACLE_EXPECTATION_MISSING");
  if (binding.kind === "deterministic" && input.actualValue === undefined)
    invalid.push("OBSERVATION_MISSING");
  if (!input.testEvidenceRef) invalid.push("TEST_EVIDENCE_MISSING");
  if (binding.kind === "deterministic" && !binding.expectationRef)
    invalid.push("ORACLE_EXPECTATION_REF_MISSING");
  if (binding.kind === "deterministic" && !input.observationRef)
    invalid.push("OBSERVATION_REF_MISSING");
  const scopedBindings = listed.filter(
    candidate =>
      candidate.sourceSha === scope.sourceSha &&
      candidate.tenantId === scope.tenantId &&
      candidate.projectId === scope.projectId
  );
  const scopedRequirementIds = new Set(
    scopedBindings.map(candidate => candidate.requirementId)
  );
  if (
    binding.dependsOnRequirementIds.some(
      dependency => !scopedRequirementIds.has(dependency)
    )
  ) {
    invalid.push("ORACLE_DEPENDENCY_MISSING");
  }
  if (hasDependencyCycle(scopedBindings))
    invalid.push("ORACLE_DEPENDENCY_CYCLE");
  if (invalid.length) {
    return makeEvidence({
      scope,
      oracleId: binding.oracleId || null,
      testOutcome: input.testOutcome,
      oracleOutcome: "NOT_RUN",
      acceptanceOutcome: "BLOCKED",
      reasons: invalid,
      testEvidenceRef: input.testEvidenceRef,
      observationRef: input.observationRef,
      expectationRef: binding.expectationRef,
      ...oracleEvidence,
    });
  }

  let oracleOutcome: Spec271AcceptanceEvidence["oracleOutcome"] =
    binding.kind === "deterministic"
      ? oracleEvidence.observationDigest === oracleEvidence.expectationDigest
        ? "PASS"
        : "FAIL"
      : "NOT_RUN";
  const approvalRequired =
    binding.approvalRequired ?? binding.kind !== "deterministic";
  let approvalReceiptId: string | undefined;
  if (approvalRequired) {
    if (!binding.approvalRef || !dependencies.resolveApproval) {
      return makeEvidence({
        scope,
        oracleId: binding.oracleId,
        testOutcome: input.testOutcome,
        oracleOutcome,
        acceptanceOutcome: "BLOCKED",
        reasons: ["APPROVAL_REQUIRED"],
        testEvidenceRef: input.testEvidenceRef,
        observationRef: input.observationRef,
        expectationRef: binding.expectationRef,
        ...oracleEvidence,
      });
    }
    let approval: Spec271ApprovalReceipt | null;
    try {
      approval = await dependencies.resolveApproval(binding.approvalRef, scope);
    } catch {
      return makeEvidence({
        scope,
        oracleId: binding.oracleId,
        testOutcome: input.testOutcome,
        oracleOutcome,
        acceptanceOutcome: "BLOCKED",
        reasons: ["APPROVAL_AUTHORITY_UNAVAILABLE"],
        testEvidenceRef: input.testEvidenceRef,
        observationRef: input.observationRef,
        expectationRef: binding.expectationRef,
        ...oracleEvidence,
      });
    }
    if (!approval)
      return makeEvidence({
        scope,
        oracleId: binding.oracleId,
        testOutcome: input.testOutcome,
        oracleOutcome,
        acceptanceOutcome: "BLOCKED",
        reasons: ["APPROVAL_NOT_FOUND"],
        testEvidenceRef: input.testEvidenceRef,
        observationRef: input.observationRef,
        expectationRef: binding.expectationRef,
        ...oracleEvidence,
      });
    approvalReceiptId = approval.receiptId;
    const stale =
      !Number.isFinite(Date.parse(input.now)) ||
      !Number.isFinite(Date.parse(approval.expiresAt)) ||
      Date.parse(approval.expiresAt) <= Date.parse(input.now);
    const matching =
      approval.requirementId === scope.requirementId &&
      approval.sourceSha === scope.sourceSha &&
      approval.tenantId === scope.tenantId &&
      approval.projectId === scope.projectId;
    if (!approval.authorized) invalid.push("APPROVAL_UNAUTHORIZED");
    if (stale) invalid.push("APPROVAL_STALE");
    if (!matching) invalid.push("APPROVAL_SCOPE_MISMATCH");
    if (!approval.receiptId || !approval.approverId)
      invalid.push("APPROVAL_RECEIPT_INCOMPLETE");
    if (!invalid.length)
      oracleOutcome = approval.decision === "approved" ? "PASS" : "FAIL";
  }
  if (invalid.length) {
    return makeEvidence({
      scope,
      oracleId: binding.oracleId,
      testOutcome: input.testOutcome,
      oracleOutcome,
      acceptanceOutcome: "BLOCKED",
      reasons: invalid,
      approvalReceiptId,
      testEvidenceRef: input.testEvidenceRef,
      observationRef: input.observationRef,
      expectationRef: binding.expectationRef,
      ...oracleEvidence,
    });
  }

  const outcome =
    oracleOutcome === "FAIL" || input.testOutcome === "FAIL"
      ? "REJECTED"
      : oracleOutcome === "PASS" && input.testOutcome === "PASS"
        ? "ACCEPTED"
        : "BLOCKED";
  const reasons =
    outcome === "BLOCKED"
      ? [
          input.testOutcome !== "PASS"
            ? "TEST_NOT_PASS"
            : "INDEPENDENT_ORACLE_NOT_PASS",
        ]
      : outcome === "REJECTED"
        ? [oracleOutcome === "FAIL" ? "ORACLE_ASSERTION_FAILED" : "TEST_FAILED"]
        : [];
  return makeEvidence({
    scope,
    oracleId: binding.oracleId,
    testOutcome: input.testOutcome,
    oracleOutcome,
    acceptanceOutcome: outcome,
    reasons,
    approvalReceiptId,
    testEvidenceRef: input.testEvidenceRef,
    observationRef: input.observationRef,
    expectationRef: binding.expectationRef,
    ...oracleEvidence,
  });
}
