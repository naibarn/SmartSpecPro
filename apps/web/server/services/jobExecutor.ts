import { classifyJobError } from "./jobControlPlane";
import type { JobControlPlane } from "./jobControlPlane";
import { createJobReporter } from "./jobReporter";
import type { JobResult, LeaseContext } from "./jobControlPlaneTypes";

export type JobExecutorContext = NonNullable<Awaited<ReturnType<JobControlPlane["getContext"]>>>;
export type JobExecutor = (input: {
  context: JobExecutorContext;
  lease: LeaseContext;
  reporter: ReturnType<typeof createJobReporter>;
  controlPlane: JobControlPlane;
}) => Promise<JobResult>;

export type CanonicalExecutionResult =
  | { state: "ignored"; jobId: string }
  | { state: "succeeded"; jobId: string; attemptId: string }
  | { state: "deferred"; jobId: string; attemptId: string };

/** Claims one canonical delivery and delegates all lifecycle writes to the shared reporter. */
export async function executeCanonicalJob(
  input: { jobId: string; runnerId: string; adapter: string; attemptId?: string },
  dependencies: { controlPlane: JobControlPlane; executor: JobExecutor },
): Promise<CanonicalExecutionResult> {
  const lease = await dependencies.controlPlane.claim(input);
  if (!lease) return { state: "ignored", jobId: input.jobId };
  const context = await dependencies.controlPlane.getContext(input.jobId);
  if (!context) return { state: "ignored", jobId: input.jobId };
  const reporter = createJobReporter(dependencies.controlPlane);
  await dependencies.controlPlane.start(lease);
  try {
    await reporter.assertActive(lease);
    const result = await dependencies.executor({ context, lease, reporter, controlPlane: dependencies.controlPlane });
    if (result.deferred) {
      return { state: "deferred", jobId: input.jobId, attemptId: lease.attemptId };
    }
    await reporter.complete(lease, result);
  } catch (error) {
    const errorClass = classifyJobError(error);
    const diagnosticError = error as {
      diagnosticCode?: unknown;
      diagnosticStage?: unknown;
      diagnosticFingerprint?: unknown;
    } | null;
    const diagnosticCode = typeof diagnosticError?.diagnosticCode === "string"
      ? diagnosticError.diagnosticCode.slice(0, 100)
      : undefined;
    const diagnosticMetadata = Object.fromEntries(
      Object.entries({
        diagnosticCode,
        diagnosticStage:
          typeof diagnosticError?.diagnosticStage === "string"
            ? diagnosticError.diagnosticStage.slice(0, 100)
            : undefined,
        diagnosticFingerprint:
          typeof diagnosticError?.diagnosticFingerprint === "string"
            ? diagnosticError.diagnosticFingerprint.slice(0, 128)
            : undefined,
      }).filter(([, value]) => value !== undefined),
    );
    await reporter.fail(lease, {
      code: diagnosticCode ?? (error instanceof Error ? error.name.slice(0, 100) : "JOB_EXECUTOR_ERROR"),
      message: error instanceof Error ? error.message.slice(0, 2000) : "Job executor failed",
      class: errorClass,
      operatorReviewRequired: errorClass === "unknown",
      ...(Object.keys(diagnosticMetadata).length > 0
        ? { metadata: diagnosticMetadata }
        : {}),
    });
    throw error;
  }
  return { state: "succeeded", jobId: input.jobId, attemptId: lease.attemptId };
}
