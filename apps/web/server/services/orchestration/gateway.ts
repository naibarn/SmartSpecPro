import { JobControlPlaneError, type JobRef } from "../jobControlPlaneTypes";
import {
  createControlPlaneJob,
  type CreateControlPlaneJobInput,
} from "../jobControlPlaneGateway";
import { assertApprovedPlan } from "./policy";
import {
  buildJobDefinitions,
  type Approval,
  type PlanRevision,
} from "./contracts";

export type SubmitApprovedPlanInput = {
  plan: PlanRevision;
  approval: Approval;
  context: CreateControlPlaneJobInput["context"];
  controlPlane?: CreateControlPlaneJobInput["controlPlane"];
  executorRegistry?: CreateControlPlaneJobInput["executorRegistry"];
};

/**
 * The single orchestration-to-execution handoff. It creates canonical Jobs
 * through Feature 195 and intentionally has no provider submission branch.
 */
export async function submitApprovedPlan(
  input: SubmitApprovedPlanInput
): Promise<JobRef[]> {
  assertApprovedPlan({ plan: input.plan, approval: input.approval });
  if (
    input.context.tenantId !== input.plan.tenantId ||
    input.context.actorId !== input.approval.actorId
  ) {
    throw new JobControlPlaneError(
      "ORCHESTRATION_SCOPE_INVALID",
      "Plan approval is outside the execution tenant or actor scope"
    );
  }
  const definitions = buildJobDefinitions(input.plan);
  const refs: JobRef[] = [];
  for (const definition of definitions) {
    refs.push(
      await createControlPlaneJob({
        context: input.context,
        definition: {
          ...definition,
          // The gateway derives the tenant and actor from context; this field is
          // kept only in the internal definition for hash/provenance parity.
          input: {
            ...definition.input,
            orchestrationActorId: input.approval.actorId,
          },
        },
        controlPlane: input.controlPlane,
        executorRegistry: input.executorRegistry,
      })
    );
  }
  return refs;
}
