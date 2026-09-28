import { executeCanonicalJob, type CanonicalExecutionResult } from "../services/jobExecutor";
import type { JobControlPlane } from "../services/jobControlPlane";
import type { JobExecutorRegistry } from "../services/jobExecutorRegistry";

export type CanonicalJobEnvelope = {
  jobId: string;
  contractVersion: string;
  businessAttempt: number;
  attemptId?: string | null;
};

export function validateCanonicalJobEnvelope(value: unknown): CanonicalJobEnvelope {
  if (!value || typeof value !== "object") throw new Error("INVALID_JOB_ENVELOPE");
  const input = value as Record<string, unknown>;
  if (typeof input.jobId !== "string" || !/^[A-Za-z0-9_-]{1,36}$/.test(input.jobId)) throw new Error("INVALID_JOB_ENVELOPE");
  if (typeof input.contractVersion !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(input.contractVersion)) throw new Error("INVALID_JOB_ENVELOPE");
  if (!Number.isInteger(input.businessAttempt) || Number(input.businessAttempt) < 1 || Number(input.businessAttempt) > 100) throw new Error("INVALID_JOB_ENVELOPE");
  if (input.attemptId !== undefined && input.attemptId !== null && (typeof input.attemptId !== "string" || !/^[A-Za-z0-9_-]{1,36}$/.test(input.attemptId))) throw new Error("INVALID_JOB_ENVELOPE");
  return {
    jobId: input.jobId,
    contractVersion: input.contractVersion,
    businessAttempt: Number(input.businessAttempt),
    attemptId: input.attemptId == null ? undefined : input.attemptId,
  };
}

/**
 * Common consumer path for BullMQ, Celery, and future at-least-once runtimes.
 * It rejects contract/attempt mismatches before claim and delegates lifecycle
 * writes to the existing fenced executor.
 */
export async function executeCanonicalJobEnvelope(
  rawEnvelope: unknown,
  dependencies: { controlPlane: JobControlPlane; executorRegistry: JobExecutorRegistry; runnerId: string; adapter: string },
): Promise<CanonicalExecutionResult | { state: "rejected" | "ignored"; jobId: string }> {
  const envelope = validateCanonicalJobEnvelope(rawEnvelope);
  const context = await dependencies.controlPlane.getContext(envelope.jobId);
  if (!context) return { state: "rejected", jobId: envelope.jobId };
  if (context.contractVersion !== envelope.contractVersion) {
    await dependencies.controlPlane.rejectUnsupportedDelivery({
      jobId: envelope.jobId,
      reason: "contract_version_mismatch",
      contractVersion: envelope.contractVersion,
    });
    return { state: "rejected", jobId: envelope.jobId };
  }
  if (context.attempt !== envelope.businessAttempt) return { state: "ignored", jobId: envelope.jobId };
  const registration = dependencies.executorRegistry.resolve(context.jobType, context.contractVersion);
  if (!registration) {
    await dependencies.controlPlane.rejectUnsupportedDelivery({
      jobId: envelope.jobId,
      reason: `unregistered_job_type:${context.jobType}`,
      contractVersion: envelope.contractVersion,
    });
    return { state: "rejected", jobId: envelope.jobId };
  }
  return executeCanonicalJob(
    { jobId: envelope.jobId, runnerId: dependencies.runnerId, adapter: dependencies.adapter, attemptId: envelope.attemptId ?? undefined },
    { controlPlane: dependencies.controlPlane, executor: registration.executor },
  );
}
