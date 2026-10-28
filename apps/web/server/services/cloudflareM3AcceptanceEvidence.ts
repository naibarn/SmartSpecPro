import { z } from "zod";

/** Validate only receipts read back from the canonical registry. */
const identity = z
  .object({
    tenantId: z.string().min(1).max(36),
    projectId: z.string().min(1).max(36),
    candidateJobId: z.string().uuid(),
    actorUserId: z.number().int().positive(),
  })
  .strict();

export const M3_PARITY_REQUIRED_CHECKS = {
  credit_billing_acceptance: [
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
  ],
  queue_recovery_acceptance: [
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
  ],
} as const;

export type M3ParityOperation = keyof typeof M3_PARITY_REQUIRED_CHECKS;

export function verifyM3ParityEvidence(input: {
  scope: z.infer<typeof identity>;
  operation: M3ParityOperation;
  job: unknown;
  receipt: unknown;
}) {
  const scope = identity.parse(input.scope);
  const jobSchema = z
    .object({
      id: z.string().uuid(),
      status: z.literal("succeeded"),
      tenantId: z.literal(scope.tenantId),
      requestedByUserId: z.literal(scope.actorUserId),
      projectId: z.literal(scope.projectId),
      candidateJobId: z.literal(scope.candidateJobId),
      operation: z.literal(input.operation),
      planDigest: z.string().regex(/^[a-f0-9]{64}$/),
      finishedAt: z.string().datetime({ offset: true }),
    })
    .strict();
  const receiptSchema = z
    .object({
      schemaVersion: z.literal("cloudflare-m3-parity-acceptance-v1"),
      jobId: z.string().uuid(),
      tenantId: z.literal(scope.tenantId),
      projectId: z.literal(scope.projectId),
      candidateJobId: z.literal(scope.candidateJobId),
      actorUserId: z.literal(scope.actorUserId),
      operation: z.literal(input.operation),
      planDigest: z.string().regex(/^[a-f0-9]{64}$/),
      provider: z.literal("cloudflare"),
      liveExecution: z.literal(true),
      syntheticOnly: z.literal(true),
      realCharges: z.literal(false),
      trafficMutation: z.literal(false),
      compensated: z.literal(true),
      checks: z.record(z.string(), z.boolean()),
      providerReceipt: z
        .object({
          queueName: z.literal("smartspec-canonical-job-queue-production"),
          queueId: z.string().regex(/^[a-f0-9]{32}$/),
          deadLetterQueueName: z.literal(
            "smartspec-canonical-job-queue-production-dlq"
          ),
          deadLetterQueueId: z.string().regex(/^[a-f0-9]{32}$/),
          workerScript: z.literal("smartspec-cloudflare-runtime"),
          messageId: z.string().min(1).max(200),
          dispatchId: z.string().min(1).max(128),
          dedupeKey: z.string().min(1).max(200),
          receivedAt: z.string().datetime({ offset: true }),
        })
        .strict(),
      syntheticFixture: z
        .object({
          userId: z.number().int().positive(),
          tenantId: z.literal(scope.tenantId),
          finalBalance: z.literal(0),
          disabled: z.literal(true),
        })
        .strict()
        .optional(),
    })
    .strict();
  const job = jobSchema.safeParse(input.job),
    receipt = receiptSchema.safeParse(input.receipt);
  if (
    !job.success ||
    !receipt.success ||
    job.data.id !== receipt.data.jobId ||
    job.data.planDigest !== receipt.data.planDigest ||
    (input.operation === "credit_billing_acceptance" &&
      !receipt.data.syntheticFixture) ||
    !M3_PARITY_REQUIRED_CHECKS[input.operation].every(
      name => receipt.data.checks[name] === true
    )
  ) {
    return {
      accepted: false as const,
      reason: "M3_PARITY_EVIDENCE_INCOMPLETE",
    };
  }
  return {
    accepted: true as const,
    jobId: job.data.id,
    operation: input.operation,
    planDigest: job.data.planDigest,
  };
}
