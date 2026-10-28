import { createHash } from "node:crypto";
import { z } from "zod";

/** Reviewed synthetic parity work is a distinct authority from application
 * acceptance. The schema alone neither admits a job nor grants execution. */
export const m3ParityOperationSchema = z.enum(["credit_billing_acceptance", "queue_recovery_acceptance"]);
export const m3ParityPlanSchema = z.object({
  schemaVersion: z.literal("cloudflare-m3-parity-plan-v1"), operation: m3ParityOperationSchema,
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), actorUserId: z.number().int().positive(),
  candidateJobId: z.string().uuid(), applicationJobId: z.string().uuid(), sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  artifactRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  queueId: z.string().regex(/^[a-f0-9]{32}$/),
  queueName: z.literal("smartspec-canonical-job-queue-production"),
  deadLetterQueueId: z.string().regex(/^[a-f0-9]{32}$/),
  deadLetterQueueName: z.literal("smartspec-canonical-job-queue-production-dlq"),
  workerDeploymentId: z.string().uuid(),
  workerVersions: z.array(z.object({
    versionId: z.string().uuid(),
    percentage: z.number().min(0.0001).max(100),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    buildDigest: z.string().regex(/^[a-f0-9]{64}$/),
    configurationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    artifactRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict()).min(1).max(2),
  queueConsumerId: z.string().regex(/^[a-f0-9]{32}$/),
  syntheticOnly: z.literal(true), realCharges: z.literal(false), providerCalls: z.literal(false), trafficMutation: z.literal(false),
  maxSyntheticCredits: z.number().int().min(1).max(100), maxSyntheticJobs: z.number().int().min(1).max(20),
  maxDurationSeconds: z.number().int().min(1).max(1200), maxContainerStarts: z.number().int().min(0).max(2),
  compensationRequired: z.literal(true),
}).strict();

/** The digest is an immutable exact-plan binding, not an authorization. */
export function digestM3ParityPlan(value: unknown) {
  const plan = m3ParityPlanSchema.parse(value);
  return { plan, digest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}
