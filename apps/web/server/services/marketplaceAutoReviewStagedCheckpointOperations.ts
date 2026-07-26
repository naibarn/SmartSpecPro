import {
  buildProductionStableHash,
} from "../../shared/mediaProduction";
import {
  STAGED_PLANNING_ARCHITECTURE,
  type HumanApprovalCheckpointV1,
  type StagedCheckpointApprovalExpectationV1,
  type StagedSequentialStoryboardMetadataV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import {
  buildStagedOperationEnvelope,
  transitionStagedCheckpoint,
  updateStagedCheckpointById,
  type StagedCheckpointMutation,
} from "./marketplaceAutoReviewStagedCheckpointService";

export type StagedCheckpointSafeProjection = Pick<
  HumanApprovalCheckpointV1,
  | "checkpointId"
  | "kind"
  | "scope"
  | "shotId"
  | "state"
  | "revision"
  | "contentHash"
  | "approvedHash"
  | "approvedByUserId"
  | "approvedAt"
  | "consumedAt"
  | "rejectionReasonCode"
  | "estimatedCredits"
  | "approvedModel"
  | "approvedProvider"
  | "approvedSafetyVerdict"
  | "approvedReferenceManifestHash"
> & { consumed: boolean };

export type StagedCheckpointMutationResult =
  | {
      ok: true;
      metadata: StagedSequentialStoryboardMetadataV1;
      checkpoint: HumanApprovalCheckpointV1;
      operation: ReturnType<typeof buildStagedOperationEnvelope>;
    }
  | { ok: false; reasonCode: string };

export function stagedMetadataStateDigest(
  metadata: StagedSequentialStoryboardMetadataV1
): string {
  return buildProductionStableHash({
    planningArchitecture: metadata.planningArchitecture,
    planningArchitectureVersion: metadata.planningArchitectureVersion,
    planReview: metadata.planReview,
    stagedSequentialStoryboard: metadata.stagedSequentialStoryboard,
  });
}

export function projectStagedCheckpoints(
  checkpoints: HumanApprovalCheckpointV1[]
): StagedCheckpointSafeProjection[] {
  return checkpoints.map(checkpoint => ({
    checkpointId: checkpoint.checkpointId,
    kind: checkpoint.kind,
    scope: checkpoint.scope,
    shotId: checkpoint.shotId,
    state: checkpoint.state,
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    approvedHash: checkpoint.approvedHash,
    approvedByUserId: checkpoint.approvedByUserId,
    approvedAt: checkpoint.approvedAt,
    consumedAt: checkpoint.consumedAt,
    rejectionReasonCode: checkpoint.rejectionReasonCode,
    estimatedCredits: checkpoint.estimatedCredits,
    approvedModel: checkpoint.approvedModel,
    approvedProvider: checkpoint.approvedProvider,
    approvedSafetyVerdict: checkpoint.approvedSafetyVerdict,
    approvedReferenceManifestHash: checkpoint.approvedReferenceManifestHash,
    consumed: Boolean(checkpoint.consumedAt || checkpoint.consumedByOperationId),
  }));
}

export function mutateStagedCheckpointMetadata(input: {
  metadata: StagedSequentialStoryboardMetadataV1;
  checkpointId: string;
  expectedStateDigest: string;
  operationId: string;
  mutation: StagedCheckpointMutation;
}): StagedCheckpointMutationResult {
  if (input.metadata.planningArchitecture !== STAGED_PLANNING_ARCHITECTURE) {
    return { ok: false, reasonCode: "staged_wrong_architecture" };
  }
  const currentDigest = stagedMetadataStateDigest(input.metadata);
  if (currentDigest !== input.expectedStateDigest) {
    return { ok: false, reasonCode: "staged_state_drift" };
  }
  const result = updateStagedCheckpointById(
    input.metadata.stagedSequentialStoryboard.reviewCheckpoints,
    input.checkpointId,
    input.mutation
  );
  if (!result.ok) return result;
  const metadata: StagedSequentialStoryboardMetadataV1 = {
    ...input.metadata,
    planReview: {
      ...input.metadata.planReview,
      lastOperationId: input.operationId,
    },
    stagedSequentialStoryboard: {
      ...input.metadata.stagedSequentialStoryboard,
      reviewCheckpoints: result.checkpoints,
    },
  };
  return {
    ok: true,
    metadata,
    checkpoint: result.checkpoint,
    operation: buildStagedOperationEnvelope({
      operationId: input.operationId,
      runId: "metadata-only",
      stateDigest: stagedMetadataStateDigest(metadata),
      planRevision: metadata.stagedSequentialStoryboard.planRevision,
    }),
  };
}

export function buildCheckpointApprovalMutation(input: {
  expected: StagedCheckpointApprovalExpectationV1;
  userId: number;
  approvedAt: string;
}): StagedCheckpointMutation {
  return {
    type: "approve",
    expected: input.expected,
    userId: input.userId,
    approvedAt: input.approvedAt,
  };
}
