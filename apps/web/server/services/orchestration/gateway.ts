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
  const jobIdsByStepId = new Map<string, string>();
  for (const definition of definitions) {
    const orchestration = definition.input.orchestration;
    const stepId =
      orchestration &&
      typeof orchestration === "object" &&
      !Array.isArray(orchestration)
        ? (orchestration as { stepId?: unknown }).stepId
        : undefined;
    const dependencyStepIds =
      orchestration &&
      typeof orchestration === "object" &&
      !Array.isArray(orchestration)
        ? (orchestration as { dependsOnStepIds?: unknown }).dependsOnStepIds
        : undefined;
    if (
      typeof stepId !== "string" ||
      !Array.isArray(dependencyStepIds) ||
      dependencyStepIds.some(id => typeof id !== "string")
    ) {
      throw new JobControlPlaneError(
        "ORCHESTRATION_PLAN_INVALID",
        "Plan step dependency metadata is invalid"
      );
    }
    const dependsOnJobIds: string[] = [];
    for (const dependencyStepId of dependencyStepIds) {
      const dependencyJobId = jobIdsByStepId.get(dependencyStepId);
      if (!dependencyJobId) {
        throw new JobControlPlaneError(
          "ORCHESTRATION_PLAN_INVALID",
          "Plan step dependency was not submitted before its dependent step"
        );
      }
      dependsOnJobIds.push(dependencyJobId);
    }
    const definitionWithDependencies = {
      ...definition,
      input: {
        ...definition.input,
        orchestration: {
          ...(orchestration as Record<string, unknown>),
          dependsOnJobIds,
        },
      },
    };
    refs.push(
      await createControlPlaneJob({
        context: {
          ...input.context,
          // Each plan step must be independently idempotent. Reusing the
          // request key for every step would collapse a multi-step plan into
          // the first Job during a retry.
          idempotencyKey: definition.idempotencyKey,
        },
        definition: {
          ...definitionWithDependencies,
          // The gateway derives the tenant and actor from context; this field is
          // kept only in the internal definition for hash/provenance parity.
          input: {
            ...definitionWithDependencies.input,
            orchestrationActorId: input.approval.actorId,
          },
        },
        controlPlane: input.controlPlane,
        executorRegistry: input.executorRegistry,
      })
    );
    jobIdsByStepId.set(stepId, refs.at(-1)!.jobId);
  }
  return refs;
}
