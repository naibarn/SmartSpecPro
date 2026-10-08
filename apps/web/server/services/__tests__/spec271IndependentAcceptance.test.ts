import { describe, expect, it } from "vitest";
import {
  evaluateSpec271Acceptance,
  type Spec271AcceptanceDependencies,
  type Spec271AcceptanceScope,
  type Spec271ApprovalReceipt,
  type Spec271OracleBinding,
} from "../spec271IndependentAcceptance";
import { validateSpec224VerificationProvenance } from "../spec224VerificationProvenance";

const scope: Spec271AcceptanceScope = {
  requirementId: "REQ-962CDCE30AEF",
  sourceSha: "a".repeat(40),
  tenantId: "tenant-a",
  projectId: "project-a",
};

const deterministicOracle: Spec271OracleBinding = {
  oracleId: "oracle-total-v1",
  ...scope,
  kind: "deterministic",
  approved: true,
  producerId: "implementation-harness",
  evaluatorId: "independent-total-check",
  dependsOnRequirementIds: [],
  expectedValue: { total: 7 },
  expectationRef: "oracle-expectation:total-v1",
};

const validApproval: Spec271ApprovalReceipt = {
  receiptId: "approval-receipt-1",
  decision: "approved",
  approverId: "domain-owner-1",
  authorized: true,
  ...scope,
  expiresAt: "2026-10-09T00:00:00.000Z",
};

function dependencies(
  bindings: readonly Spec271OracleBinding[] = [deterministicOracle],
  approval?: Spec271ApprovalReceipt | null
): Spec271AcceptanceDependencies {
  return {
    listApprovedBindings: async () => bindings,
    resolveApproval: approval === undefined ? undefined : async () => approval,
  };
}

async function evaluate(
  deps: Spec271AcceptanceDependencies = dependencies(),
  overrides: Partial<Parameters<typeof evaluateSpec271Acceptance>[0]> = {}
) {
  return evaluateSpec271Acceptance(
    {
      scope,
      testOutcome: "PASS",
      actualValue: { total: 7 },
      testEvidenceRef: "test-evidence:run-1",
      observationRef: "observation:run-1",
      now: "2026-10-08T12:00:00.000Z",
      ...overrides,
    },
    deps
  );
}

describe("SPEC-271 independent acceptance", () => {
  it("binds the requirement to its approved independent oracle", async () => {
    const receipt = await evaluate();
    expect(receipt).toMatchObject({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      oracleId: deterministicOracle.oracleId,
      oracleOutcome: "PASS",
      acceptanceOutcome: "ACCEPTED",
    });
  });

  it("blocks a missing oracle", async () => {
    const receipt = await evaluate(dependencies([]));
    expect(receipt.acceptanceOutcome).toBe("BLOCKED");
    expect(receipt.reasons).toContain("ORACLE_MISSING");
  });

  it("rejects self-referential and circular oracle bindings", async () => {
    const self = {
      ...deterministicOracle,
      evaluatorId: deterministicOracle.producerId,
    };
    const selfReceipt = await evaluate(dependencies([self]));
    expect(selfReceipt.reasons).toContain("ORACLE_SELF_REFERENTIAL");

    const cycle = [
      { ...deterministicOracle, dependsOnRequirementIds: ["REQ-A40BF6AB31EB"] },
      {
        ...deterministicOracle,
        oracleId: "oracle-other",
        requirementId: "REQ-A40BF6AB31EB",
        dependsOnRequirementIds: [scope.requirementId],
      },
    ];
    const cycleReceipt = await evaluate(dependencies(cycle));
    expect(cycleReceipt.reasons).toContain("ORACLE_DEPENDENCY_CYCLE");
  });

  it("does not accept from test PASS without an independent oracle PASS", async () => {
    const receipt = await evaluate(dependencies([]));
    expect(receipt.testOutcome).toBe("PASS");
    expect(receipt.oracleOutcome).toBe("NOT_RUN");
    expect(receipt.acceptanceOutcome).toBe("BLOCKED");
  });

  it.each([
    ["unauthorized", { ...validApproval, authorized: false }],
    ["stale", { ...validApproval, expiresAt: "2026-10-08T11:59:59.000Z" }],
  ])("does not let %s approval grant acceptance", async (_name, approval) => {
    const binding = {
      ...deterministicOracle,
      kind: "human" as const,
      approvalRequired: true,
      approvalRef: "owner-approval-1",
    };
    const receipt = await evaluate(dependencies([binding], approval));
    expect(receipt.acceptanceOutcome).toBe("BLOCKED");
  });

  it("preserves the exact source SHA and stable requirement identity", async () => {
    const receipt = await evaluate();
    expect(receipt.sourceSha).toBe(scope.sourceSha);
    expect(receipt.requirementId).toBe(scope.requirementId);
  });

  it("produces the same evidence digest for repeated evaluation", async () => {
    const first = await evaluate();
    const second = await evaluate();
    expect(second).toEqual(first);
  });

  it("enforces tenant and project boundaries for oracle and approval records", async () => {
    const wrongOracle = { ...deterministicOracle, tenantId: "tenant-b" };
    const oracleReceipt = await evaluate(dependencies([wrongOracle]));
    expect(oracleReceipt.reasons).toContain("ORACLE_SCOPE_MISMATCH");

    const binding = {
      ...deterministicOracle,
      kind: "domain" as const,
      approvalRequired: true,
      approvalRef: "owner-approval-1",
    };
    const wrongProject = { ...validApproval, projectId: "project-b" };
    const approvalReceipt = await evaluate(
      dependencies([binding], wrongProject)
    );
    expect(approvalReceipt.reasons).toContain("APPROVAL_SCOPE_MISMATCH");
  });

  it("keeps the existing SPEC-224 provenance interface compatible", () => {
    const hash = "b".repeat(64);
    const verified = validateSpec224VerificationProvenance({
      expectedSpecDigest: hash,
      provenance: {
        candidateSha: hash,
        verifiedBaseSha: hash,
        specDigest: hash,
        policySnapshotDigest: hash,
        verificationProfileVersion: "quick-v1",
        evidenceBundleDigest: hash,
      },
    });
    expect(verified.providerExecutionProofRequired).toBe(true);
    expect(verified.provenance.candidateSha).toBe(hash);
  });

  it("keeps failure evidence inspectable and bound to observed and expected data", async () => {
    const receipt = await evaluate(dependencies([deterministicOracle]), {
      actualValue: { total: 6 },
    });
    expect(receipt).toMatchObject({
      acceptanceOutcome: "REJECTED",
      reasons: ["ORACLE_ASSERTION_FAILED"],
      oracleId: deterministicOracle.oracleId,
      testEvidenceRef: "test-evidence:run-1",
      observationRef: "observation:run-1",
      expectationRef: deterministicOracle.expectationRef,
    });
    expect(receipt.observationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.expectationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts an authorized, current human oracle decision separately from test PASS", async () => {
    const binding = {
      ...deterministicOracle,
      kind: "human" as const,
      approvalRequired: true,
      approvalRef: "owner-approval-1",
    };
    const receipt = await evaluate(dependencies([binding], validApproval));
    expect(receipt).toMatchObject({
      testOutcome: "PASS",
      oracleOutcome: "PASS",
      acceptanceOutcome: "ACCEPTED",
      approvalReceiptId: validApproval.receiptId,
    });
  });
});
