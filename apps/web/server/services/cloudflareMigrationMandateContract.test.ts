import { describe, expect, it } from "vitest";
import { cloudflareCanonicalJson, cloudflareMigrationMandateEnrollmentPayload, cloudflareMigrationMissionId,
  cloudflarePlanDigest, verifyCloudflareMigrationMandateEnvelope } from "./cloudflareMigrationMandateContract";

const scope = { tenantId: "tenant-a", projectId: "project-a", ownerUserId: 17 };
const envelope = {
  schemaVersion: "cloudflare.first-migration-mandate.v1",
  missionId: cloudflareMigrationMissionId(scope.tenantId, scope.projectId),
  tenantId: scope.tenantId, ownerUserId: scope.ownerUserId, projectId: scope.projectId,
  environment: "production", targetId: "smartspec-cloudflare-runtime", accountRef: "a".repeat(32),
  zoneId: "b".repeat(32), routePattern: "smartaihub.app/*",
  resourceIds: { queueId: "c".repeat(32), deadLetterQueueId: "d".repeat(32), vpcServiceId: "vpc-1",
    hyperdriveId: "e".repeat(32), nodeApplicationId: "node-app-1", pythonApplicationId: "python-app-1" },
  actions: ["rotate_origin_configuration", "deploy_worker", "worker_canary", "synthetic_credit_billing",
    "synthetic_queue_recovery", "native_runtime_activation", "rollback"],
  resourceBudget: { maxProviderWrites: 20, maxWorkerDeployments: 2, maxContainerStarts: 4,
    maxContainerReservedSeconds: 1800, maxQueueMessages: 100, maxSyntheticCredits: 60, syntheticFinancialMinorUnits: 0 },
  rollbackPolicy: { preserveM2Ingress: true, preserveLinuxFallback: true, containersOnDemand: true,
    rollbackOnFailedAcceptance: true, requireOwnerForOutOfScopeAction: true },
};

describe("FIRST_MIGRATION mandate contract", () => {
  it("accepts only the exact mission, owner, production target and bounded envelope", () => {
    expect(verifyCloudflareMigrationMandateEnvelope(envelope, scope)).toEqual(envelope);
  });

  it.each([
    [{ ...envelope, tenantId: "tenant-b" }, scope],
    [envelope, { ...scope, ownerUserId: 18 }],
    [{ ...envelope, projectId: "project-b" }, scope],
    [{ ...envelope, targetId: "another-worker" }, scope],
    [{ ...envelope, resourceBudget: { ...envelope.resourceBudget, maxContainerReservedSeconds: 3601 } }, scope],
    [{ ...envelope, resourceBudget: { ...envelope.resourceBudget, syntheticFinancialMinorUnits: 1 } }, scope],
    [{ ...envelope, rollbackPolicy: { ...envelope.rollbackPolicy, preserveM2Ingress: false } }, scope],
    [{ ...envelope, actions: ["delete_customer_data"] }, scope],
  ] as const)("rejects altered identity, unbounded budget or out-of-envelope action", (candidate, expected) => {
    expect(() => verifyCloudflareMigrationMandateEnvelope(candidate, expected)).toThrow();
  });

  it("submits the exact reviewed envelope without approval-service storage metadata", () => {
    const payload = cloudflareMigrationMandateEnrollmentPayload(envelope as never, "owner-mandate-v1");
    expect(payload).toMatchObject({ idempotencyKey: "owner-mandate-v1", missionId: envelope.missionId });
    expect(payload).not.toHaveProperty("revokedAt");
  });

  it("computes the same immutable digest regardless of object property order", () => {
    const reviewed = { artifact: { digest: "a".repeat(64), sourceSha: "b".repeat(40) },
      rollout: { canaryPercent: 1, route: "smartaihub.app/*" } };
    const reordered = { rollout: { route: "smartaihub.app/*", canaryPercent: 1 },
      artifact: { sourceSha: "b".repeat(40), digest: "a".repeat(64) } };
    expect(cloudflareCanonicalJson(reviewed)).toBe(cloudflareCanonicalJson(reordered));
    expect(cloudflarePlanDigest(reviewed)).toBe(cloudflarePlanDigest(reordered));
  });
});
