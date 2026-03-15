import type { TenantFeatureFlags } from "@shared/featureFlags";
import {
  WORKFLOW_BROWSER_SESSION_NODE_TYPES,
  filterWorkflowNodeTypeSpecs,
} from "@shared/workflowBrowserSessionNodeTypes";

import type { NodeTypeSpec } from "./useNodeRegistry";

export function filterWorkflowNodeTypes(
  nodeTypes: NodeTypeSpec[],
  flags: Pick<TenantFeatureFlags, "workflowBrowserSessionNodes">,
): NodeTypeSpec[] {
  return filterWorkflowNodeTypeSpecs(nodeTypes, flags.workflowBrowserSessionNodes);
}

export { WORKFLOW_BROWSER_SESSION_NODE_TYPES };
