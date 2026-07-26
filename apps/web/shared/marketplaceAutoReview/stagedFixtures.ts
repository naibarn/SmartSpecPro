import type {
  HumanApprovalCheckpointV1,
  StagedSequentialStoryboardMetadataV1,
} from "./stagedContracts";

export function buildStagedCheckpointFixture(
  overrides: Partial<HumanApprovalCheckpointV1> = {}
): HumanApprovalCheckpointV1 {
  return {
    checkpointId: "cp_story_1",
    kind: "story_plan",
    scope: "run",
    shotId: null,
    state: "awaiting",
    revision: 1,
    contentHash: "hash_story_1",
    approvedHash: null,
    approvedByUserId: null,
    approvedAt: null,
    consumedAt: null,
    consumedByOperationId: null,
    rejectionReasonCode: null,
    estimatedCredits: 0,
    approvedModel: null,
    approvedProvider: null,
    approvedSafetyVerdict: null,
    approvedReferenceManifestHash: null,
    ...overrides,
  };
}

export function buildNineShotStoryboardFixture(
  overrides: Partial<StagedSequentialStoryboardMetadataV1> = {}
): StagedSequentialStoryboardMetadataV1 {
  const shots = Array.from({ length: 9 }, (_, index) => ({
    shotId: index + 1,
    revision: 1,
    state: "awaiting_image_prompt_review",
    storySummary: `Shot ${index + 1} product story`,
    dialogue: `บทพูดช็อตที่ ${index + 1}`,
    imagePromptHash: null,
    imageArtifactHash: null,
    videoPromptHash: null,
    videoArtifactHash: null,
  }));

  return {
    planningArchitecture: "staged_two_skill_v2",
    planningArchitectureVersion: 1,
    humanApprovalPolicy: "all_checkpoints_required",
    planReview: {
      required: true,
      status: "awaiting",
      planRevision: 1,
      approvedRevision: null,
      redraftCount: 0,
      lastOperationId: null,
    },
    stagedSequentialStoryboard: {
      storyPlanStatus: "awaiting",
      planRevision: 1,
      storyPlanHash: "hash_story_1",
      referenceManifestHash: "hash_refs_1",
      shots,
      reviewCheckpoints: [buildStagedCheckpointFixture()],
    },
    ...overrides,
  };
}
