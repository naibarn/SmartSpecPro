import { defaultJobExecutorRegistry, type JobExecutorRegistry } from "../services/jobExecutorRegistry";
import { JobOutboxRunner } from "../services/jobOutboxRunner";
import { CloudflareQueueHttpJobTransportAdapter, PostgresPullJobTransportAdapter, type JobTransportAdapter } from "../services/jobTransportAdapters";
import { isPostgresNodeJobType, POSTGRES_NODE_JOB_TYPES } from "./feature186JobTypes";
import { assertFeature186RuntimeConfigured, assertGoogleRuntimeDisabled, feature186RuntimeReadiness, isCloudflareHardCutoverEnabled, isPostgresPullHarnessEnabled } from "../services/cloudflareRuntimeTarget";

/**
 * Feature 186 hard-cutover runtime.
 *
 * The web process only publishes durable PostgreSQL outbox intents. The
 * Cloudflare target consumes the canonical envelope through the Hyperdrive /
 * Queue boundary. Redis, BullMQ, Celery and retired hosted runtimes are not initialized by
 * this runtime, even when an old environment still contains their settings.
 */
export const FEATURE_186_UNIFIED_QUEUE = "cloudflare-canonical-job-queue";

let outboxRunner: JobOutboxRunner | null = null;
let runtimeActive = false;

export async function initializeUnifiedJobControlPlaneRuntime(
  _executorRegistry: JobExecutorRegistry = defaultJobExecutorRegistry,
): Promise<void> {
  if (!isCloudflareHardCutoverEnabled() || runtimeActive) return;
  assertGoogleRuntimeDisabled();
  assertFeature186RuntimeConfigured();
  runtimeActive = true;

  const cloudflareRuntimeUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim();
  const cloudflareAdapter = cloudflareRuntimeUrl
    ? new CloudflareQueueHttpJobTransportAdapter(
      cloudflareRuntimeUrl,
      process.env.CLOUDFLARE_RUNTIME_TOKEN ?? "",
    )
    : new PostgresPullJobTransportAdapter();
  const adapters = new Map<string, JobTransportAdapter>([
    ["node_job_worker", cloudflareAdapter],
    ["python_job_worker", cloudflareAdapter],
    ["external_runtime", cloudflareAdapter],
    ["cloudflare", cloudflareAdapter],
    ["default", cloudflareAdapter],
  ]);

  outboxRunner = new JobOutboxRunner({
    adapters,
    resolveAdapter: row => isPostgresNodeJobType(row.jobType)
      ? cloudflareAdapter
      : adapters.get(row.runtimeType) ?? cloudflareAdapter,
    onError: error => {
      console.error("[Feature186] outbox publisher tick failed", {
        runtime: feature186RuntimeReadiness(),
        harness: isPostgresPullHarnessEnabled(),
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
    },
  });
  outboxRunner.start();
  console.info(
    `[Feature186] Cloudflare hard-cutover runtime active node=${[...POSTGRES_NODE_JOB_TYPES].join(",")} adapter=${cloudflareAdapter.name}`,
  );
}

export async function shutdownUnifiedJobControlPlaneRuntime(): Promise<void> {
  outboxRunner?.stop();
  outboxRunner = null;
  runtimeActive = false;
}
