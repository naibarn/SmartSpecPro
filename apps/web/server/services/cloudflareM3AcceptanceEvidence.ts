import { z } from "zod";

/** Validate records retrieved by an authorized canonical registry reader.
 * This validator does not establish provenance and MUST NOT receive caller-
 * supplied jobs or receipts as an authority to mark a gate accepted. */
const identity = z.object({ tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36),
  candidateJobId: z.string().uuid(), actorUserId: z.number().int().positive() }).strict();
const checks = {
  credit_billing_acceptance: ["syntheticBalance", "reservation", "settlement", "unusedRelease", "cancelBeforeSettlement", "duplicateSubmission", "transientRetry", "concurrentReservation", "balanceConservation", "crossTenantIsolation", "duplicateSettlement", "interruptionReconciliation"],
  queue_recovery_acceptance: ["canonicalAdmission", "outboxDispatch", "cloudflareDelivery", "workerClaimLease", "execution", "progressHeartbeat", "completion", "controlledFailure", "retrySameIdentity", "duplicateDelivery", "idempotency", "cancelBeforeExecution", "cancelDuringExecution", "leaseExpiryReclaim", "interruptionRecovery", "deadLetter", "uncertainDeliveryReconciliation", "compensation", "syntheticCleanup"],
} as const;
export type M3ParityOperation = keyof typeof checks;
export function verifyM3ParityEvidence(input: { scope: z.infer<typeof identity>; operation: M3ParityOperation; job: unknown; receipt: unknown }) {
  const scope = identity.parse(input.scope);
  const jobSchema = z.object({ id: z.string().uuid(), status: z.literal("succeeded"), tenantId: z.literal(scope.tenantId),
    requestedByUserId: z.literal(scope.actorUserId), projectId: z.literal(scope.projectId), candidateJobId: z.literal(scope.candidateJobId),
    operation: z.literal(input.operation), planDigest: z.string().regex(/^[a-f0-9]{64}$/), finishedAt: z.string().datetime({ offset: true }) }).strict();
  const receiptSchema = z.object({ schemaVersion: z.literal("cloudflare-m3-parity-acceptance-v1"), jobId: z.string().uuid(),
    tenantId: z.literal(scope.tenantId), projectId: z.literal(scope.projectId), candidateJobId: z.literal(scope.candidateJobId),
    actorUserId: z.literal(scope.actorUserId), operation: z.literal(input.operation), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    provider: z.literal("cloudflare"), liveExecution: z.literal(true), syntheticOnly: z.literal(true), realCharges: z.literal(false),
    trafficMutation: z.literal(false), compensated: z.literal(true), checks: z.record(z.string(), z.boolean()),
    providerReceipt: z.object({ deploymentId: z.string().uuid(), versionId: z.string().uuid(), colo: z.string().regex(/^[A-Z]{3}$/) }).strict() }).strict();
  const job = jobSchema.safeParse(input.job), receipt = receiptSchema.safeParse(input.receipt);
  if (!job.success || !receipt.success || job.data.id !== receipt.data.jobId || job.data.planDigest !== receipt.data.planDigest ||
      !checks[input.operation].every(name => receipt.data.checks[name] === true)) return { accepted: false as const, reason: "M3_PARITY_EVIDENCE_INCOMPLETE" };
  return { accepted: true as const, jobId: job.data.id, operation: input.operation, planDigest: job.data.planDigest };
}
