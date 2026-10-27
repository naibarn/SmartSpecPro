import { describe, expect, it } from "vitest";
import { verifyM3ParityEvidence } from "./cloudflareM3AcceptanceEvidence";

const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", candidateJobId: "22222222-2222-4222-8222-222222222222", actorUserId: 7 };
const jobId = "11111111-1111-4111-8111-111111111111", digest = "a".repeat(64);
const names = ["syntheticBalance", "reservation", "settlement", "unusedRelease", "cancelBeforeSettlement", "duplicateSubmission", "transientRetry", "concurrentReservation", "balanceConservation", "crossTenantIsolation", "duplicateSettlement", "interruptionReconciliation"];
const job = { id: jobId, status: "succeeded", tenantId: scope.tenantId, requestedByUserId: scope.actorUserId, projectId: scope.projectId,
  candidateJobId: scope.candidateJobId, operation: "credit_billing_acceptance", planDigest: digest, finishedAt: "2026-10-27T00:00:00.000Z" };
const receipt = { schemaVersion: "cloudflare-m3-parity-acceptance-v1", jobId, ...scope, operation: "credit_billing_acceptance", planDigest: digest,
  provider: "cloudflare", liveExecution: true, syntheticOnly: true, realCharges: false, trafficMutation: false, compensated: true,
  checks: Object.fromEntries(names.map(name => [name, true])), providerReceipt: { deploymentId: jobId, versionId: scope.candidateJobId, colo: "NRT" } };
describe("M3 parity evidence", () => {
  it("accepts only exact scoped live receipt with every invariant", () => {
    expect(verifyM3ParityEvidence({ scope, operation: "credit_billing_acceptance", job, receipt }).accepted).toBe(true);
  });
  it.each(["foreign", "missing", "local", "charged", "uncompensated", "digest", "pending"])("rejects %s evidence", scenario => {
    const altered = structuredClone(receipt), record = structuredClone(job);
    if (scenario === "foreign") altered.tenantId = "other";
    if (scenario === "missing") altered.checks.settlement = false;
    if (scenario === "local") altered.liveExecution = false;
    if (scenario === "charged") altered.realCharges = true;
    if (scenario === "uncompensated") altered.compensated = false;
    if (scenario === "digest") altered.planDigest = "b".repeat(64);
    if (scenario === "pending") record.status = "running";
    expect(verifyM3ParityEvidence({ scope, operation: "credit_billing_acceptance", job: record, receipt: altered }).accepted).toBe(false);
  });
});
