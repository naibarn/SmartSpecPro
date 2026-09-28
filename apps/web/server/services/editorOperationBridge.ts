import {
  mediaOperationClaimCapability,
  type MediaOperation,
} from "@smartspec/shared";

export function bridgeEditorOperation(input: {
  operation: MediaOperation;
  revisionId: string;
  snapshotId: string;
}): {
  operation: MediaOperation;
  revisionId: string;
  snapshotId: string;
  runtime: "node" | "windows";
  claim: string;
  requiresReview: boolean;
} {
  if (!input.revisionId || !input.snapshotId)
    throw new Error("EDITOR_OPERATION_BINDING_INVALID");
  return {
    ...input,
    runtime: input.operation === "media.composition_scan" ? "node" : "windows",
    claim: mediaOperationClaimCapability(input.operation),
    requiresReview: input.operation === "media.composition_scan",
  };
}

export function projectEditorOperationStatus(
  jobStatus: string,
  evidenceStatus: string | null
): {
  machineState:
    | "queued"
    | "waiting_agent"
    | "running"
    | "degraded"
    | "completed"
    | "failed"
    | "canceled";
  label?: "waiting-agent" | "review-required";
} {
  if (evidenceStatus === "degraded")
    return { machineState: "degraded", label: "review-required" };
  if (jobStatus === "waiting_external")
    return { machineState: "waiting_agent", label: "waiting-agent" };
  if (jobStatus === "queued" || jobStatus === "pending")
    return { machineState: "queued" };
  if (jobStatus === "completed" || jobStatus === "succeeded")
    return { machineState: "completed" };
  if (jobStatus === "canceled" || jobStatus === "cancelled")
    return { machineState: "canceled" };
  if (jobStatus === "failed" || jobStatus === "expired")
    return { machineState: "failed" };
  return { machineState: "running" };
}
