import { mediaCapabilityProbeSchema } from "../../shared/verticalDramaMedia/contracts";
import { readVerticalDramaWorkflowPolicy, resolveMediaWorkflow } from "../../shared/verticalDramaMedia/workflow";

export function resolveVerticalDramaWorkflow(input: { requestedWorkflowId: string | null; policy: unknown; probe: unknown; resolutionId: string; workflowFamily?: string | null; startFrame?: unknown; referenceFrames?: unknown }) {
  return resolveMediaWorkflow({ requestedWorkflowId: input.requestedWorkflowId, policy: readVerticalDramaWorkflowPolicy(input.policy), probe: mediaCapabilityProbeSchema.parse(input.probe), resolutionId: input.resolutionId, workflowFamily: input.workflowFamily, startFrame: input.startFrame, referenceFrames: input.referenceFrames });
}
