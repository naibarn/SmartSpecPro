import { parseCanonicalEnvelope } from "./queueConsumer";
import type {
  CanonicalControlPlaneRepository,
  CanonicalJobEnvelope,
  CanonicalJobHandler,
  CanonicalWorkerExecution,
  CloudflareEnvironment,
} from "./contracts";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "canceled", "expired"]);

function safeReason(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : "CANONICAL_HANDLER_FAILED";
}

function assertAuthoritativeEnvelope(job: {
  jobId: string;
  contractVersion: string;
  businessAttempt: number;
}, envelope: CanonicalJobEnvelope): void {
  if (job.jobId !== envelope.job_id) throw new Error("CANONICAL_JOB_ID_MISMATCH");
  if (job.contractVersion !== envelope.contract_version) throw new Error("CANONICAL_CONTRACT_VERSION_MISMATCH");
  if (job.businessAttempt !== envelope.business_attempt) throw new Error("CANONICAL_ATTEMPT_MISMATCH");
}

/**
 * Builds the local/production-neutral handler used after Queue claim. Every
 * database operation is delegated to the injected canonical repository. The
 * executor is deliberately outside repository transactions so a provider or
 * artifact network call can never hold a PostgreSQL/Hyperdrive transaction.
 */
export function createCanonicalControlPlaneHandler(input: {
  repository: CanonicalControlPlaneRepository;
  execute: CanonicalWorkerExecution;
}): CanonicalJobHandler {
  return async (rawEnvelope, env) => {
    const envelope = parseCanonicalEnvelope(rawEnvelope);
    const job = await input.repository.loadJob({ jobId: envelope.job_id, cache: "no-store" });
    if (!job) throw new Error("CANONICAL_JOB_NOT_FOUND");
    assertAuthoritativeEnvelope(job, envelope);

    if (TERMINAL_STATUSES.has(job.status) || job.operatorReviewRequired) {
      return "completed";
    }

    const dispatch = await input.repository.recordDispatch({
      jobId: job.jobId,
      businessAttempt: job.businessAttempt,
      dispatchId: envelope.dispatch_id,
      dedupeKey: envelope.dedupe_key,
    });
    if (dispatch === "duplicate" && job.status === "succeeded") return "completed";

    const claim = await input.repository.claim({ job, envelope });
    if (claim === "already_terminal") return "completed";
    if (claim === "quarantine") return "quarantined";
    if (claim === "retry") return "retry";

    try {
      const execution = await input.execute({ job, envelope, claim, env });
      if (execution === "retry") {
        return await input.repository.retry({
          job,
          envelope,
          claim,
          reason: "EXECUTOR_REQUESTED_RETRY",
        });
      }
      const completed = await input.repository.complete({ job, envelope, claim });
      if (completed === "completed" || completed === "duplicate") return "completed";
      if (completed === "quarantine") return "quarantined";
      return "retry";
    } catch (error) {
      return await input.repository.retry({ job, envelope, claim, reason: safeReason(error) });
    }
  };
}
