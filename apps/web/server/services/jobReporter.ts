import type { JobControlPlane } from "./jobControlPlane";
import type {
  ClassifiedJobError,
  ExternalWait,
  JobReporter as JobReporterContract,
  JobResult,
  LeaseContext,
  ProgressUpdate,
} from "./jobControlPlaneTypes";

/** Thin runtime-neutral reporter. Business executors receive this port rather than a broker client. */
export function createJobReporter(controlPlane: Pick<JobControlPlane, "heartbeat" | "progress" | "waitForExternal" | "complete" | "fail" | "assertActive">): JobReporterContract {
  return {
    heartbeat: (lease: LeaseContext) => controlPlane.heartbeat(lease),
    progress: (lease: LeaseContext, input: ProgressUpdate) => controlPlane.progress(lease, input),
    waitForExternal: (lease: LeaseContext, input: ExternalWait) => controlPlane.waitForExternal(lease, input),
    complete: (lease: LeaseContext, result: JobResult) => controlPlane.complete(lease, result),
    fail: (lease: LeaseContext, error: ClassifiedJobError) => controlPlane.fail(lease, error),
    assertActive: (lease: LeaseContext) => controlPlane.assertActive(lease),
  };
}
