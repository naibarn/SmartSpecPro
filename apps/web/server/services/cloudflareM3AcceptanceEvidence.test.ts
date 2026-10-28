import { describe, expect, it } from "vitest";
import { verifyM3ParityEvidence } from "./cloudflareM3AcceptanceEvidence";
import { getM3QueueRecoveryMissingLifecycleChecks } from "./cloudflareM3QueueRecoveryExecutor";

const scope = {
  tenantId: "tenant-fixture",
  projectId: "project-fixture",
  candidateJobId: "22222222-2222-4222-8caf-9db1297ebbe3",
  actorUserId: 7,
};
const jobId = "11111111-1111-4111-8111-111111111111",
  digest = "a".repeat(64);
const creditChecks = [
  "syntheticBalance",
  "reservation",
  "settlement",
  "duplicateReplay",
  "refund",
  "cancellation",
  "balanceConservation",
  "crossTenantIsolation",
  "billingTestMode",
  "syntheticCleanup",
];
const queueChecks = [
  "canonicalAdmission",
  "outboxDispatch",
  "cloudflareDelivery",
  "workerClaimLease",
  "execution",
  "progressHeartbeat",
  "completion",
  "controlledFailure",
  "retrySameIdentity",
  "duplicateDelivery",
  "idempotency",
  "cancelBeforeExecution",
  "cancelDuringExecution",
  "leaseExpiryReclaim",
  "interruptionRecovery",
  "deadLetter",
  "uncertainDeliveryReconciliation",
  "compensation",
  "syntheticCleanup",
];
const job = (
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance"
) => ({
  id: jobId,
  status: "succeeded",
  tenantId: scope.tenantId,
  requestedByUserId: scope.actorUserId,
  projectId: scope.projectId,
  candidateJobId: scope.candidateJobId,
  operation,
  planDigest: digest,
  finishedAt: "2026-10-27T00:00:00.000Z",
});
const receipt = (
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance",
  names: string[]
) => ({
  schemaVersion: "cloudflare-m3-parity-acceptance-v1",
  jobId,
  ...scope,
  operation,
  planDigest: digest,
  provider: "cloudflare",
  liveExecution: true,
  syntheticOnly: true,
  realCharges: false,
  trafficMutation: false,
  compensated: true,
  checks: Object.fromEntries(names.map(name => [name, true])),
  providerReceipt: {
    queueName: "smartspec-canonical-job-queue-production",
    queueId: "c".repeat(32),
    deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq",
    deadLetterQueueId: "d".repeat(32),
    workerScript: "smartspec-cloudflare-runtime",
    messageId: "message-1",
    dispatchId: "dispatch-1",
    dedupeKey: `job:${jobId}:attempt:1`,
    receivedAt: "2026-10-27T00:00:00.000Z",
  },
  ...(operation === "credit_billing_acceptance"
    ? {
        syntheticFixture: {
          userId: 999,
          tenantId: scope.tenantId,
          finalBalance: 0,
          disabled: true,
        },
      }
    : {}),
});

describe("M3 parity evidence", () => {
  it("accepts only a complete scoped live Credit/Billing receipt", () => {
    expect(
      verifyM3ParityEvidence({
        scope,
        operation: "credit_billing_acceptance",
        job: job("credit_billing_acceptance"),
        receipt: receipt("credit_billing_acceptance", creditChecks),
      }).accepted
    ).toBe(true);
  });
  it("rejects an incomplete Queue/Recovery lifecycle even when live Queue delivery succeeded", () => {
    const evidence = receipt("queue_recovery_acceptance", queueChecks);
    evidence.checks.deadLetter = false;
    expect(
      verifyM3ParityEvidence({
        scope,
        operation: "queue_recovery_acceptance",
        job: job("queue_recovery_acceptance"),
        receipt: evidence,
      })
    ).toMatchObject({ accepted: false });
  });
  it("keeps Queue/Recovery preflight blocked while real lifecycle receipts are missing", () => {
    expect(getM3QueueRecoveryMissingLifecycleChecks()).toEqual([
      "controlledFailure",
      "retrySameIdentity",
      "duplicateDelivery",
      "idempotency",
      "cancelBeforeExecution",
      "cancelDuringExecution",
      "leaseExpiryReclaim",
      "interruptionRecovery",
      "deadLetter",
      "uncertainDeliveryReconciliation",
      "compensation",
      "syntheticCleanup",
    ]);
  });
  it.each([
    "foreign",
    "missing",
    "local",
    "charged",
    "uncompensated",
    "digest",
    "pending",
    "wrongQueue",
    "noFixture",
  ])("rejects %s evidence", scenario => {
    const altered: any = structuredClone(
        receipt("credit_billing_acceptance", creditChecks)
      ),
      record: any = job("credit_billing_acceptance");
    if (scenario === "foreign") altered.tenantId = "other";
    if (scenario === "missing") altered.checks.settlement = false;
    if (scenario === "local") altered.liveExecution = false;
    if (scenario === "charged") altered.realCharges = true;
    if (scenario === "uncompensated") altered.compensated = false;
    if (scenario === "digest") altered.planDigest = "b".repeat(64);
    if (scenario === "pending") record.status = "running";
    if (scenario === "wrongQueue")
      altered.providerReceipt.queueName = "other-queue";
    if (scenario === "noFixture") delete altered.syntheticFixture;
    expect(
      verifyM3ParityEvidence({
        scope,
        operation: "credit_billing_acceptance",
        job: record,
        receipt: altered,
      }).accepted
    ).toBe(false);
  });
});
