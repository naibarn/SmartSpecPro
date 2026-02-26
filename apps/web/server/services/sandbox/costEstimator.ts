/**
 * Cost estimation and credit integration for sandbox jobs.
 */

import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../creditService";

interface ProfileResourceEstimate {
  cpuLimit: string;
  memoryLimitMb: number;
  timeoutSeconds: number;
}

// Internal rates: credits per resource-minute
const CPU_RATE = 1; // 1 credit per CPU-core per minute
const MEM_RATE = 0.5; // 0.5 credits per GB per minute

function parseCpuMillicores(cpuLimit: string): number {
  const match = cpuLimit.match(/^(\d+)m$/);
  if (match) return parseInt(match[1], 10) / 1000;
  return parseFloat(cpuLimit) || 1;
}

/**
 * Estimate the credit cost of a sandbox job before execution.
 */
export function estimateCost(profile: ProfileResourceEstimate): number {
  const cpuCores = parseCpuMillicores(profile.cpuLimit);
  const memoryGb = profile.memoryLimitMb / 1024;
  const timeoutMinutes = profile.timeoutSeconds / 60;

  const cost =
    cpuCores * timeoutMinutes * CPU_RATE +
    memoryGb * timeoutMinutes * MEM_RATE;

  return Math.ceil(cost);
}

/**
 * Reserve credits before sandbox dispatch.
 */
export async function reserveCredits(params: {
  userId: number;
  estimatedCost: number;
  jobId: string;
  tenantId: string;
}): Promise<{ transactionId: number }> {
  const canAfford = await hasEnoughCredits(params.userId, params.estimatedCost);
  if (!canAfford) {
    throw new Error("Insufficient credits for sandbox execution");
  }

  const tx = await deductCredits({
    userId: params.userId,
    amount: params.estimatedCost,
    description: `Sandbox job reservation: ${params.jobId}`,
    tenantId: params.tenantId,
    sourceType: "other",
    metadata: {
      sandboxJobId: params.jobId,
      type: "sandbox_reservation",
    },
  });

  return { transactionId: tx.id };
}

/**
 * Reconcile credits after job completion.
 */
export async function reconcileCredits(params: {
  userId: number;
  jobId: string;
  estimatedCost: number;
  actualCost: number;
}): Promise<void> {
  const diff = params.estimatedCost - params.actualCost;

  if (diff > 0) {
    // Overpaid: refund the difference
    await refundCredits({
      userId: params.userId,
      amount: diff,
      description: `Sandbox cost reconciliation refund: ${params.jobId}`,
      sourceType: "other",
      metadata: {
        sandboxJobId: params.jobId,
        type: "sandbox_reconciliation",
      },
    });
  } else if (diff < 0) {
    // Underpaid: deduct the additional amount
    await deductCredits({
      userId: params.userId,
      amount: Math.abs(diff),
      description: `Sandbox cost reconciliation charge: ${params.jobId}`,
      sourceType: "other",
      metadata: {
        sandboxJobId: params.jobId,
        type: "sandbox_reconciliation",
      },
    });
  }
  // If diff === 0, no action needed
}

/**
 * Refund all reserved credits on job failure.
 */
export async function refundReservedCredits(params: {
  userId: number;
  jobId: string;
  reservedAmount: number;
}): Promise<void> {
  await refundCredits({
    userId: params.userId,
    amount: params.reservedAmount,
    description: `Sandbox job failed, refunding reservation: ${params.jobId}`,
    sourceType: "other",
    metadata: {
      sandboxJobId: params.jobId,
      reason: "sandbox_job_failed",
    },
  });
}
