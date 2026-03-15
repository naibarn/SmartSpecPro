import { TRPCError } from "@trpc/server";

import type { TenantFeatureFlags } from "../../shared/featureFlags";
import {
  filterWorkflowNodeTypeSpecs,
  workflowContainsBrowserSessionNodes,
} from "../../shared/workflowBrowserSessionNodeTypes";

export function assertWorkflowBrowserSessionNodesAllowed(
  flags: Pick<TenantFeatureFlags, "workflowBrowserSessionNodes">,
  nodes: readonly unknown[],
): void {
  if (flags.workflowBrowserSessionNodes) {
    return;
  }

  if (workflowContainsBrowserSessionNodes(nodes)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Workflow Browser Session nodes are disabled for this tenant",
    });
  }
}

export function filterWorkflowNodeRegistryForFlags<T extends { type: string }>(
  nodeTypes: readonly T[],
  flags: Pick<TenantFeatureFlags, "workflowBrowserSessionNodes">,
): T[] {
  return filterWorkflowNodeTypeSpecs(nodeTypes, flags.workflowBrowserSessionNodes);
}
