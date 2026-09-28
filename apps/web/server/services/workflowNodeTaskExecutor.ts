import type { JobResult } from "./jobControlPlaneTypes";
import { JobControlPlaneError } from "./jobControlPlaneTypes";
import type { JobExecutor } from "./jobExecutor";

export type WorkflowNodeTaskDispatchInput = {
  payload: Record<string, unknown>;
  context: Parameters<JobExecutor>[0]["context"];
  lease: Parameters<JobExecutor>[0]["lease"];
  reporter: Parameters<JobExecutor>[0]["reporter"];
  controlPlane: Parameters<JobExecutor>[0]["controlPlane"];
};

export type WorkflowNodeTaskDispatcher = (
  input: WorkflowNodeTaskDispatchInput
) => Promise<JobResult>;

let configuredDispatcher: WorkflowNodeTaskDispatcher | null = null;

export function configureWorkflowNodeTaskDispatcher(
  dispatcher: WorkflowNodeTaskDispatcher
): void {
  if (configuredDispatcher && configuredDispatcher !== dispatcher) {
    throw new JobControlPlaneError(
      "JOB_EXECUTOR_ALREADY_CONFIGURED",
      "Workflow node task dispatcher is already configured"
    );
  }
  configuredDispatcher = dispatcher;
}

export function resetWorkflowNodeTaskDispatcherForTests(): void {
  configuredDispatcher = null;
}

function requiredText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export const executeWorkflowNodeTask: JobExecutor = async input => {
  const payload = input.context.input;
  for (const field of [
    "planId",
    "workflowRunId",
    "nodeRunId",
    "attemptId",
    "nodeId",
    "typeId",
    "typeVersion",
    "manifestDigest",
    "inputSnapshotRef",
  ]) {
    if (!requiredText(payload[field])) {
      throw new JobControlPlaneError(
        "WORKFLOW_NODE_TASK_INVALID",
        `Workflow node task field ${field} is required`
      );
    }
  }
  const dispatcher = configuredDispatcher;
  if (!dispatcher) {
    throw new JobControlPlaneError(
      "JOB_EXECUTOR_UNREGISTERED",
      "Workflow node runtime adapter is not configured"
    );
  }
  return dispatcher({
    payload,
    context: input.context,
    lease: input.lease,
    reporter: input.reporter,
    controlPlane: input.controlPlane,
  });
};
