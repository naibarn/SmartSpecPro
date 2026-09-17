import { defaultJobExecutorRegistry, type JobExecutorRegistry } from "../services/jobExecutorRegistry";
import { JobOutboxRunner } from "../services/jobOutboxRunner";
import { type JobTransportAdapter } from "../services/jobTransportAdapters";
import { createFeature186RuntimeAdapter } from "../services/feature186RuntimeAdapter";
import { isPostgresNodeJobType, POSTGRES_NODE_JOB_TYPES } from "./feature186JobTypes";
import { assertGoogleRuntimeDisabled, feature186RuntimeReadiness, isFeature186HardCutoverEnabled, isPostgresPullHarnessEnabled } from "../services/cloudflareRuntimeTarget";

/**
 * Feature 186 canonical runtime.
 *
 * The web process only publishes durable PostgreSQL outbox intents. The
 * default transport is PostgreSQL-pull for the separately supervised Node
 * worker. Cloudflare can consume the same canonical envelope after the
 * explicit target-account activation flag is enabled. Redis, BullMQ, Celery
 * and retired hosted runtimes are not initialized by this runtime.
 */
export const FEATURE_186_UNIFIED_QUEUE = "cloudflare-canonical-job-queue";

let outboxRunner: JobOutboxRunner | null = null;
let runtimeActive = false;

export async function initializeUnifiedJobControlPlaneRuntime(
  _executorRegistry: JobExecutorRegistry = defaultJobExecutorRegistry,
): Promise<void> {
  if (!isFeature186HardCutoverEnabled() || runtimeActive) return;
  assertGoogleRuntimeDisabled();
  const activeAdapter = createFeature186RuntimeAdapter();
  runtimeActive = true;
  const adapters = new Map<string, JobTransportAdapter>([
    ["node_job_worker", activeAdapter],
    ["python_job_worker", activeAdapter],
    ["external_runtime", activeAdapter],
    ["cloudflare", activeAdapter],
    ["default", activeAdapter],
  ]);

  outboxRunner = new JobOutboxRunner({
    adapters,
    resolveAdapter: row => isPostgresNodeJobType(row.jobType)
      ? activeAdapter
      : adapters.get(row.runtimeType) ?? activeAdapter,
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
    `[Feature186] canonical runtime active mode=${feature186RuntimeReadiness().mode} node=${[...POSTGRES_NODE_JOB_TYPES].join(",")} adapter=${activeAdapter.name}`,
  );
}

export async function shutdownUnifiedJobControlPlaneRuntime(): Promise<void> {
  outboxRunner?.stop();
  outboxRunner = null;
  runtimeActive = false;
}
