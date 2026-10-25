import type { JobDefinition } from "./jobControlPlaneTypes";
import type { JobExecutor } from "./jobExecutor";

export const MINI_APP_FACTORY_RUN_ANCHOR_JOB_TYPE =
  "mini_app_factory.run_anchor";
export const MINI_APP_FACTORY_RUN_ANCHOR_CONTRACT =
  "mini-app-factory-run-anchor-v1";

/**
 * The canonical DevelopmentRun projection lives on a worker_jobs row. This
 * short no-op anchor is created in the same transaction as RUN_CREATED; the
 * actual app work is still performed by mini_app_factory.stage jobs.
 */
export function buildMiniAppFactoryRunAnchorDefinition(input: {
  runId: string;
}): Omit<JobDefinition, "tenantId" | "requestedByUserId"> {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.runId))
    throw new Error("FACTORY_RUN_ANCHOR_ID_INVALID");
  return {
    contractVersion: MINI_APP_FACTORY_RUN_ANCHOR_CONTRACT,
    jobType: MINI_APP_FACTORY_RUN_ANCHOR_JOB_TYPE,
    executionClass: "short",
    input: {
      contractVersion: MINI_APP_FACTORY_RUN_ANCHOR_CONTRACT,
      runId: input.runId,
      spec224Run: { runId: input.runId },
    },
    idempotencyKey: `mini-app-factory-run-anchor:${input.runId}`,
    activeDedupeKey: `mini-app-factory-run-anchor:${input.runId}`,
    retryPolicy: {
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      jitter: "bounded",
      deadlineMs: 60_000,
      allowedErrorClasses: [],
    },
    timeoutPolicy: { softTimeoutMs: 5_000, hardTimeoutMs: 10_000 },
    requiredCapabilities: {},
  };
}

export const executeMiniAppFactoryRunAnchor: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  const input = context.input as Record<string, unknown>;
  if (
    input.contractVersion !== MINI_APP_FACTORY_RUN_ANCHOR_CONTRACT ||
    typeof input.runId !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.runId) ||
    !input.spec224Run ||
    typeof input.spec224Run !== "object" ||
    (input.spec224Run as Record<string, unknown>).runId !== input.runId
  )
    throw new Error("FACTORY_RUN_ANCHOR_INPUT_INVALID");
  await reporter.assertActive(lease);
  return { output: { runId: input.runId, state: "PERSISTED" } };
};
