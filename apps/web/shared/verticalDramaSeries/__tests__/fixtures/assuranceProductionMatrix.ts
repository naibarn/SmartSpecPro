import { VD_SOURCE_DISCLOSURE_STATUSES, VD_SOURCE_KINDS, VD_SOURCE_RIGHTS_STATUSES } from "../../sourcePack";
import { VD_SERIES_PROFILE_IDS } from "../../seriesProfile";
import { VISUAL_AUDIO_POLICIES, VISUAL_EVIDENCE_STATUSES, VISUAL_FIT_MODES, VISUAL_MEDIA_ORIGINS, VISUAL_MEDIA_TYPES, VISUAL_SEMANTIC_ROLES } from "../../visualSource";

export const VERTICAL_DRAMA_ASSURANCE_STAGE_IDS = [
  "profile_source", "premise", "story_architecture", "full_story", "shot_contract", "start_frame", "reference_image", "video_prompt", "broll_assembly", "post_generation_qc", "final_gate",
] as const;

export const VERTICAL_DRAMA_PROFILE_ACCEPTANCE_MATRIX = Object.fromEntries(
  VD_SERIES_PROFILE_IDS.map(profileId => [profileId, {
    profileId,
    positive: { task: "story_architecture", managedMedia: true },
    blocking: { task: "profile_source", reason: "missing_required_source_or_visual_evidence" },
    crossStage: ["full_story", "start_frame", "video_prompt", "broll_assembly"],
  }]),
);

export const VERTICAL_DRAMA_VISUAL_SOURCE_COVERAGE_MATRIX = {
  sourceKinds: [...VD_SOURCE_KINDS], mediaTypes: [...VISUAL_MEDIA_TYPES], origins: [...VISUAL_MEDIA_ORIGINS], roles: [...VISUAL_SEMANTIC_ROLES], evidenceStatuses: [...VISUAL_EVIDENCE_STATUSES], rightsStatuses: [...VD_SOURCE_RIGHTS_STATUSES], disclosureStatuses: [...VD_SOURCE_DISCLOSURE_STATUSES], audioPolicies: [...VISUAL_AUDIO_POLICIES], fitModes: [...VISUAL_FIT_MODES],
} as const;

export function buildVerticalDramaAssuranceAcceptanceCases() {
  return VD_SERIES_PROFILE_IDS.map(profileId => ({
    profileId,
    stages: [...VERTICAL_DRAMA_ASSURANCE_STAGE_IDS],
    expectedNextAction: "continue",
    blockingNextAction: "retry_from_fresh_context",
    tenantId: "fixture-tenant",
    managedAssetRef: "managed://fixture/asset-1",
  }));
}
