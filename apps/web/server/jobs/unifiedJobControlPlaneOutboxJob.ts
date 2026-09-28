import { JobOutboxRunner } from "../services/jobOutboxRunner";
import type { JobAdapterResolver } from "../services/jobOutboxPublisher";
import type { JobTransportAdapter } from "../services/jobTransportAdapters";

let runner: JobOutboxRunner | null = null;

export function initializeUnifiedJobControlPlaneOutboxJob(options: {
  adapters: ReadonlyMap<string, JobTransportAdapter>;
  resolveAdapter?: JobAdapterResolver;
  batchSize?: number;
  intervalMs?: number;
}): void {
  if (process.env.FEATURE_186_OUTBOX_PUBLISHER !== "true" || runner) return;
  runner = new JobOutboxRunner(options);
  runner.start();
}

export function shutdownUnifiedJobControlPlaneOutboxJob(): void {
  runner?.stop();
  runner = null;
}

export function getUnifiedJobControlPlaneOutboxRunner(): JobOutboxRunner | null {
  return runner;
}
