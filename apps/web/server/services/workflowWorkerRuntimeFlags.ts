import { TRPCError } from "@trpc/server";

import type { TenantFeatureFlags } from "../../shared/featureFlags";
import {
  filterWorkflowWorkerRuntimeNodeTypeSpecs,
  workflowContainsWorkerRuntimeNodes,
} from "../../shared/workflowWorkerRuntimeNodeTypes";

type WorkerRuntimeWorkflowFlagState = Pick<
  TenantFeatureFlags,
  | "openClawExternalRuntime"
  | "desktopZeroClawWorker"
  | "nemoClawSecureWorkerPool"
  | "hiClawClusterRuntime"
>;

function workerRuntimeWorkflowNodesEnabled(
  flags: WorkerRuntimeWorkflowFlagState,
): boolean {
  return Boolean(
    flags.openClawExternalRuntime
    || flags.desktopZeroClawWorker
    || flags.nemoClawSecureWorkerPool
    || flags.hiClawClusterRuntime,
  );
}

export function assertWorkflowWorkerRuntimeNodesAllowed(
  flags: WorkerRuntimeWorkflowFlagState,
  nodes: readonly unknown[],
): void {
  if (workerRuntimeWorkflowNodesEnabled(flags)) {
    return;
  }

  if (workflowContainsWorkerRuntimeNodes(nodes)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Workflow worker-runtime nodes are disabled for this tenant",
    });
  }
}

export function filterWorkflowWorkerRuntimeRegistryForFlags<T extends { type: string }>(
  nodeTypes: readonly T[],
  flags: WorkerRuntimeWorkflowFlagState,
): T[] {
  return filterWorkflowWorkerRuntimeNodeTypeSpecs(
    nodeTypes,
    workerRuntimeWorkflowNodesEnabled(flags),
  );
}
