import { describe, expect, it } from "vitest";
import { digestM3ParityPlan, m3ParityPlanSchema } from "./cloudflareM3ParityContract";
const plan = { schemaVersion: "cloudflare-m3-parity-plan-v1", operation: "credit_billing_acceptance", tenantId: "tenant-a", projectId: "project-a",
  actorUserId: 7, candidateJobId: "22222222-2222-4222-8222-222222222222", applicationJobId: "11111111-1111-4111-8111-111111111111",
  sourceSha: "a".repeat(40), artifactRef: `sha256:${"b".repeat(64)}`, queueId: "c".repeat(32),
  queueName: "smartspec-canonical-job-queue-production", deadLetterQueueId: "d".repeat(32),
  deadLetterQueueName: "smartspec-canonical-job-queue-production-dlq",
  workerDeploymentId: "33333333-3333-4333-8333-333333333333",
  workerVersions: [{ versionId: "44444444-4444-4444-8444-444444444444", percentage: 100,
    sourceSha: "e".repeat(40), buildDigest: "f".repeat(64), configurationDigest: "1".repeat(64), artifactRef: `sha256:${"f".repeat(64)}` }],
  queueConsumerId: "2".repeat(32), syntheticOnly: true, realCharges: false,
  providerCalls: false, trafficMutation: false, maxSyntheticCredits: 20, maxSyntheticJobs: 10, maxDurationSeconds: 600, maxContainerStarts: 2,
  compensationRequired: true };
describe("bounded M3 parity plan", () => {
  it("binds the exact reviewed operation and budget to an immutable digest", () => {
    expect(digestM3ParityPlan(plan).digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digestM3ParityPlan({ ...plan, operation: "queue_recovery_acceptance" }).digest).not.toBe(digestM3ParityPlan(plan).digest);
    expect(m3ParityPlanSchema.safeParse({ ...plan, queueId: undefined }).success).toBe(false);
    expect(m3ParityPlanSchema.safeParse({ ...plan, queueName: "another-queue" }).success).toBe(false);
    expect(m3ParityPlanSchema.safeParse({ ...plan, deadLetterQueueName: "another-dlq" }).success).toBe(false);
  });
  it.each([{ realCharges: true }, { syntheticOnly: false }, { trafficMutation: true }, { providerCalls: true }, { maxSyntheticCredits: 101 },
    { maxSyntheticJobs: 21 }, { maxContainerStarts: 3 }, { compensationRequired: false }, { extra: "unexpected" }])("rejects unbounded or unrelated authority %o", value => {
    expect(m3ParityPlanSchema.safeParse({ ...plan, ...value }).success).toBe(false);
  });
});
