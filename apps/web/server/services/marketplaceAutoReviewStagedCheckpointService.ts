import {
  isCheckpointApprovalMatch,
  type HumanApprovalCheckpointV1,
  type StagedCheckpointApprovalExpectationV1,
  type StagedCheckpointKind,
  type StagedSafeReasonCode,
} from "@shared/marketplaceAutoReview/stagedContracts";

export type StagedCheckpointMutation =
  | {
      type: "approve";
      expected: StagedCheckpointApprovalExpectationV1;
      userId: number;
      approvedAt: string;
    }
  | {
      type: "reject";
      reasonCode: string;
    }
  | {
      type: "consume";
      operationId: string;
      consumedAt: string;
    }
  | {
      type: "supersede";
      reasonCode?: string;
    };

export type StagedCheckpointResult =
  | { ok: true; checkpoint: HumanApprovalCheckpointV1 }
  | { ok: false; reasonCode: StagedSafeReasonCode };

export type StagedProviderSpendResult =
  | { ok: true; checkpoint: HumanApprovalCheckpointV1 }
  | { ok: false; reasonCode: StagedSafeReasonCode };

export type StagedOperationEnvelope = {
  operationId: string;
  runId: string;
  stateDigest: string;
  planRevision: number;
  status: "queued" | "completed" | "rejected";
};

function reject(reasonCode: StagedSafeReasonCode): StagedCheckpointResult {
  return { ok: false, reasonCode };
}

export function transitionStagedCheckpoint(
  checkpoint: HumanApprovalCheckpointV1,
  mutation: StagedCheckpointMutation
): StagedCheckpointResult {
  if (mutation.type === "approve") {
    if (checkpoint.state !== "awaiting")
      return reject("checkpoint_not_awaiting");
    if (checkpoint.revision !== mutation.expected.revision) {
      return reject("checkpoint_revision_mismatch");
    }
    if (checkpoint.contentHash !== mutation.expected.contentHash) {
      return reject("checkpoint_hash_mismatch");
    }
    return {
      ok: true,
      checkpoint: {
        ...checkpoint,
        state: "approved",
        approvedHash: mutation.expected.contentHash,
        approvedByUserId: mutation.userId,
        approvedAt: mutation.approvedAt,
        approvedModel: mutation.expected.model,
        approvedProvider: mutation.expected.provider,
        approvedSafetyVerdict: mutation.expected.safetyVerdict,
        approvedReferenceManifestHash: mutation.expected.referenceManifestHash,
        estimatedCredits: mutation.expected.estimatedCredits,
        rejectionReasonCode: null,
      },
    };
  }

  if (mutation.type === "reject") {
    if (checkpoint.state !== "awaiting")
      return reject("checkpoint_not_awaiting");
    return {
      ok: true,
      checkpoint: {
        ...checkpoint,
        state: "rejected",
        rejectionReasonCode: mutation.reasonCode,
      },
    };
  }

  if (mutation.type === "supersede") {
    if (checkpoint.state === "superseded")
      return reject("checkpoint_superseded");
    return {
      ok: true,
      checkpoint: {
        ...checkpoint,
        state: "superseded",
        rejectionReasonCode: mutation.reasonCode ?? null,
      },
    };
  }

  if (checkpoint.state !== "approved") return reject("checkpoint_not_ready");
  if (checkpoint.consumedAt || checkpoint.consumedByOperationId) {
    return reject("checkpoint_consumed");
  }
  return {
    ok: true,
    checkpoint: {
      ...checkpoint,
      consumedAt: mutation.consumedAt,
      consumedByOperationId: mutation.operationId,
    },
  };
}

export function assertStagedProviderSpendAllowed(
  checkpoint: HumanApprovalCheckpointV1,
  expected: StagedCheckpointApprovalExpectationV1
): StagedProviderSpendResult {
  if (checkpoint.state !== "approved") {
    return {
      ok: false,
      reasonCode:
        checkpoint.state === "rejected"
          ? "checkpoint_rejected"
          : checkpoint.state === "superseded"
            ? "checkpoint_superseded"
            : "checkpoint_not_ready",
    };
  }
  if (checkpoint.consumedAt || checkpoint.consumedByOperationId) {
    return { ok: false, reasonCode: "checkpoint_consumed" };
  }
  if (checkpoint.revision !== expected.revision) {
    return { ok: false, reasonCode: "checkpoint_revision_mismatch" };
  }
  if (
    checkpoint.contentHash !== expected.contentHash ||
    checkpoint.approvedHash !== expected.contentHash
  ) {
    return { ok: false, reasonCode: "checkpoint_hash_mismatch" };
  }
  if (checkpoint.approvedModel !== expected.model) {
    return { ok: false, reasonCode: "checkpoint_model_mismatch" };
  }
  if (checkpoint.approvedProvider !== expected.provider) {
    return { ok: false, reasonCode: "checkpoint_provider_mismatch" };
  }
  if (
    checkpoint.approvedReferenceManifestHash !== expected.referenceManifestHash
  ) {
    return { ok: false, reasonCode: "checkpoint_reference_mismatch" };
  }
  if (checkpoint.approvedSafetyVerdict !== expected.safetyVerdict) {
    return { ok: false, reasonCode: "checkpoint_safety_mismatch" };
  }
  if (checkpoint.estimatedCredits !== expected.estimatedCredits) {
    return { ok: false, reasonCode: "checkpoint_cost_mismatch" };
  }
  return isCheckpointApprovalMatch(checkpoint, expected)
    ? { ok: true, checkpoint }
    : { ok: false, reasonCode: "checkpoint_hash_mismatch" };
}

export function updateStagedCheckpointById(
  checkpoints: HumanApprovalCheckpointV1[],
  checkpointId: string,
  mutation: StagedCheckpointMutation
):
  | {
      ok: true;
      checkpoints: HumanApprovalCheckpointV1[];
      checkpoint: HumanApprovalCheckpointV1;
    }
  | {
      ok: false;
      reasonCode: StagedSafeReasonCode;
    } {
  const index = checkpoints.findIndex(
    item => item.checkpointId === checkpointId
  );
  if (index < 0) return { ok: false, reasonCode: "invalid_checkpoint" };
  const result = transitionStagedCheckpoint(checkpoints[index], mutation);
  if (!result.ok) return result;
  const next = checkpoints.slice();
  next[index] = result.checkpoint;
  return { ok: true, checkpoints: next, checkpoint: result.checkpoint };
}

export function buildStagedOperationEnvelope(input: {
  operationId: string;
  runId: string;
  stateDigest: string;
  planRevision: number;
  status?: StagedOperationEnvelope["status"];
}): StagedOperationEnvelope {
  return {
    operationId: input.operationId,
    runId: input.runId,
    stateDigest: input.stateDigest,
    planRevision: input.planRevision,
    status: input.status ?? "queued",
  };
}

export function isShotScopedCheckpointKind(
  kind: StagedCheckpointKind
): boolean {
  return (
    kind === "image_prompt" ||
    kind === "image_result" ||
    kind === "video_prompt" ||
    kind === "video_result"
  );
}
