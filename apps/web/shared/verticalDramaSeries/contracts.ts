/**
 * Vertical Drama Series — Core shared contracts (spec §7, §11.5, §16).
 *
 * Pure field-only TypeScript contracts + small zod validators. NO server/db
 * imports so the client can import these directly. Field names and enum values
 * are copied verbatim from the feature spec §7 (Data Model) and §11.5.
 */

import { z } from "zod";
import type { VerticalDramaMemoryRetrievalPolicy } from "./memory";
import type { VerticalDramaAssemblyManifest } from "./assembly";
import { VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID } from "./assembly";
// Model-family-aware, vision-grounded video prompt quality upgrade
// (`planning/vd-video-prompt-model-family-quality/plan.md`) — type-only, the
// resolver/label map themselves live in `videoPromptModelFamily.ts` and are
// used by the server (fact block + persist stamping) and client (badge).
import type { VideoPromptModelTarget } from "./videoPromptModelFamily";
// Start-frame image-prompt two-mode switch
// (`planning/vd-start-frame-prompt-modes/plan.md`) — type-only, mirroring
// `VideoPromptModelTarget`'s import above; the resolver/skill-folder map
// live in `imagePromptModelFamily.ts` and are used by the server (fact block
// + persist stamping) and (later) the client (mode control + engine badge).
import type {
  VdImagePromptMode,
  VdImagePromptModeStamp,
} from "./imagePromptModelFamily";
import type {
  VdIdentityRisk,
  VdMotionContractStatus,
  VdMotionProfile,
} from "./motionProfile";
import type { VdSceneVisualState } from "./sceneContinuity";

/* -------------------------------------------------------------------------- */
/* Pipeline stages & warnings (spec §11.5)                                    */
/* -------------------------------------------------------------------------- */

export type VerticalDramaPipelineStage =
  | "normalize_series_input"
  | "plan_episode_script"
  | "update_character_visual_bible"
  | "generate_or_import_character_refs"
  | "storyboard_shotgrid"
  | "start_frame_render_plan"
  | "render_or_import_start_frames"
  | "approve_start_frames"
  | "dialogue_audio_plan"
  | "video_motion_prompt_pack"
  | "create_storyboard_review_project"
  | "review_generate_repair_in_storyboard_review"
  | "render_or_import_video_clips"
  | "assemble_episode_manifest"
  | "summarize_episode_to_series_memory";

export type VerticalDramaWarning = {
  code: string;
  severity: "info" | "warning" | "error" | "blocking";
  message: string;
  targetStage?: VerticalDramaPipelineStage;
  targetShotNumber?: number;
  targetClipNumber?: number;
  repairable: boolean;
};

/* -------------------------------------------------------------------------- */
/* Series bible building blocks (spec §7.3)                                   */
/* -------------------------------------------------------------------------- */

export type VerticalDramaLocation = {
  id: string;
  name: string;
  description?: string;
};

export type VerticalDramaRelationship = {
  fromCharacterId: string;
  toCharacterId: string;
  kind: string;
  notes?: string;
};

export type VerticalDramaProp = {
  id: string;
  name: string;
  recurring: boolean;
  notes?: string;
};

export type VerticalDramaCharacter = {
  characterId: string;
  name: string;
  role: string;
  narrativeRole?: import("./narrativeRole").NarrativeRole | null;
  roleTier?: import("./narrativeRole").RoleTier | null;
  occupation?: string | null;
  roleVisualIntent?: import("./narrativeRole").RoleVisualIntent | null;
  roleProvenance?: import("./narrativeRole").RoleProvenance | null;
  roleReviewStatus?: import("./narrativeRole").RoleReviewStatus | null;
  personality: string;
  backstory?: string;
  identityLock: string;
  wardrobeRules: string[];
  approvedReferenceAssetIds: string[];
  rejectedReferenceAssetIds: string[];
  visualBibleSkillRunId?: string;
  currentState: {
    emotionalState?: string;
    relationshipNotes?: string[];
    storyKnowledge?: string[];
    injuryOrWardrobeContinuity?: string[];
  };
};

export type VerticalDramaCharacterDelta = {
  characterId: string;
  episodeNumber: number;
  changedFields: string[];
  summary: string;
};

export type VerticalDramaSeriesBible = {
  logline: string;
  mainPlot: string;
  seasonArc: string;
  visualStyle: string;
  pacingStyle: string;
  cameraGrammar: string;
  locations: VerticalDramaLocation[];
  characters: VerticalDramaCharacter[];
  relationshipMap: VerticalDramaRelationship[];
  recurringProps: VerticalDramaProp[];
  continuityRules: string[];
  /**
   * Additive (2026-07-06 character-prompt quality upgrade) — the series'
   * default target-audience region/ethnicity look, injected as a DEFAULT
   * into every AI-generated person/character prompt. See
   * `./targetAudienceRegion.ts` for the value set, English descriptor map,
   * and the precedence rule (an explicit character `description` always
   * wins). Optional — absent/unknown values normalize to `"thai"` via
   * `normalizeTargetAudienceRegion`.
   */
  targetAudienceRegion?: import("./targetAudienceRegion").VerticalDramaTargetAudienceRegion;
};

/* -------------------------------------------------------------------------- */
/* Product tie-in (spec §13)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaProductTieInConfig = {
  enabled: boolean;
  productName?: string;
  productDescription?: string;
  referenceAssetIds: string[];
  productSource?: "manual" | "marketplace" | "library" | "uploaded_reference";
  disclosurePolicy:
    | "not_required"
    | "show_overlay_disclosure"
    | "caption_disclosure"
    | "manual_review";
  regulatedCategory?: "none" | "health" | "beauty" | "finance" | "medical" | "baby_kids" | "other";
  /**
   * Additive (2026-07-06 Thai ad-compliance upgrade) — broad product category
   * driving which MANDATORY disclosure line the tie-in dialogue must include
   * per Thai advertising regulation. See
   * `@shared/verticalDramaSeries/thaiAdCompliance.ts`'s
   * `VerticalDramaProductCategory` for the value set and the
   * category->required-disclosure map. Distinct from `regulatedCategory`
   * above (which governs claim-screening severity/human-review gating, not
   * disclosure text). Optional/absent on tie-ins created before this field
   * existed — treated as "no category set" (no mandated disclosure line).
   */
  productCategory?: "cosmetics" | "supplement" | "food_beverage" | "general_goods" | "service" | "other";
  allowedStoryFunctions: Array<
    "memory_trigger" | "relationship_token" | "status_symbol" | "daily_use" | "plot_clue" | "soft_cta"
  >;
  forbiddenClaims: string[];
  maxEpisodesWithTieInPerTenEpisodes: number;
  requireHumanApproval: boolean;
};

export type VerticalDramaTieInUsage = {
  enabled: boolean;
  episodeHasTieIn: boolean;
  shotNumbers: number[];
  storyFunction: string;
  placementNaturalnessScore: number;
  claimsReview: {
    unsupportedClaimsDetected: boolean;
    warnings: string[];
  };
  disclosureRequired: boolean;
  disclosureText?: string;
  approvedByUserId?: string;
  /**
   * Additive (2026-07-06 Thai ad-compliance upgrade) — the category-mandated
   * disclosure line (e.g. "อ่านคำเตือนในฉลากก่อนบริโภค" for อาหารเสริม), from
   * `resolveRequiredDisclosureForCategory`. Distinct from `disclosureText`
   * (the general tie-in disclosure policy text) — this is specifically the
   * Thai-law category warning, surfaced separately so the UI can show it even
   * when the general `disclosurePolicy` is `"not_required"`.
   */
  requiredDisclosure?: string;
};

/* -------------------------------------------------------------------------- */
/* Series memory (spec §7.3, §7.6)                                            */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesMemory = {
  canonicalFacts: string[];
  episodeSummaries: Array<{
    episodeId: string;
    episodeNumber: number;
    summary: string;
    cliffhanger?: string;
    characterDeltas: VerticalDramaCharacterDelta[];
    productTieInUsage?: VerticalDramaTieInUsage;
  }>;
  unresolvedHooks: string[];
  resolvedHooks: string[];
  continuityWarnings: string[];
  compactedMemoryText: string;
  retrievalPolicy: VerticalDramaMemoryRetrievalPolicy;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Series policy (spec §7.3)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesPolicy = {
  visibility: "private" | "tenant" | "shared_group";
  generationMode: "dry_run" | "approval_required" | "auto_after_approval";
  maxConcurrentEpisodeRuns: number;
  maxProviderSpendPerEpisodeCredits?: number;
  requireTieInApproval: boolean;
  requireCharacterAssetApproval: boolean;
  retentionPolicyId?: string;
};

/** The three generation modes, ordered least-to-most autonomous (spec §7.3). */
export const VERTICAL_DRAMA_GENERATION_MODES = [
  "dry_run",
  "approval_required",
  "auto_after_approval",
] as const;
export type VerticalDramaGenerationMode = (typeof VERTICAL_DRAMA_GENERATION_MODES)[number];

/**
 * Manual LLM model override for the ENTIRE Vertical Drama content-generation
 * chain (added 2026-07-11, originally scoped to just the "generate
 * start-frame render plan" / "generate storyboard" stages; widened the same
 * day to a single series-wide field per
 * `planning/vertical-drama-centralized-model-policy/plan.md` — see that plan
 * for the full rationale). Persisted on the series' `llmModelPolicy` jsonb
 * column. Absent/`null` = "automatic" (each call site's own auto-selector —
 * `resolveStoryBibleModel`/`resolveQualityLargeContextModelId`/etc — keeps
 * picking the model as before). A non-null `defaultModelId` overrides EVERY
 * LLM call in the Vertical Drama chain uniformly (script writing, character
 * analysis, storyboard, video prompts, etc), regardless of which auto-tier
 * that call site would otherwise use, as long as the pinned model is still
 * enabled at resolution time — see
 * `server/services/verticalDramaLlmModelPolicy.ts`'s
 * `resolveVerticalDramaSeriesModel`, the single resolver every Vertical Drama
 * LLM call site should route through.
 */
export type VerticalDramaSeriesLlmModelPolicy = {
  defaultModelId?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Minimal input contracts (spec §7.2.1)                                      */
/* -------------------------------------------------------------------------- */

/** App-facing age group — narrowed projection of the wider upstream enum. */
export type VerticalDramaAppAgeGroup = "children" | "teens" | "adults";

/** Wider upstream age group (open string for forward-compat). */
export type VerticalDramaUpstreamAgeGroup =
  | "preschool"
  | "children"
  | "tweens"
  | "teens"
  | "young_adults"
  | "adults"
  | string;

/**
 * Series-level content locale — the language the series' story bible,
 * scripts, and episode content are written in. Covers the popular languages
 * product wants from day one (same set as `VerticalDramaDialogueLanguage`,
 * which aliases this list). The DB column (`vertical_drama_series.locale`,
 * varchar(8)) already fits any of these codes; genre presets remain th/en
 * only (preset browsing follows the UI language, not the series locale).
 */
export const VERTICAL_DRAMA_SERIES_LOCALES = [
  "th",
  "en",
  "zh",
  "ja",
  "ko",
  "es",
  "pt",
  "id",
  "vi",
  "hi",
  "ar",
  "fr",
  "de",
  "tr",
  "it",
  "ru",
  "fil",
  "ms",
] as const;

export type VerticalDramaSeriesLocale = (typeof VERTICAL_DRAMA_SERIES_LOCALES)[number];

export type VerticalDramaMinimalInput = {
  locale?: VerticalDramaSeriesLocale;
  storyTitle: string;
  durationSeconds?: 60;
  storyBrief: string;
  characters: Array<{
    characterId: string;
    name: string;
    role: string;
  }>;
  episodeCount?: number;
  ageControl?: {
    targetAgeGroup: VerticalDramaAppAgeGroup;
    targetRating?: string;
  };
  tieIn?: VerticalDramaProductTieInConfig;
};

/** Raw upstream (GitHub guide) minimal episode input — stored losslessly (spec §7.2.1). */
export type VerticalDramaUpstreamMinimalEpisodeInput = {
  story_title: string;
  duration_seconds: 60;
  story_brief: string;
  characters: Array<{
    character_id: string;
    name: string;
    role: string;
  }>;
  episode_count: number;
  age_control?: {
    target_age_group: VerticalDramaUpstreamAgeGroup;
    target_rating?: string;
  };
};

export const verticalDramaMinimalInputSchema = z.object({
  locale: z.enum(VERTICAL_DRAMA_SERIES_LOCALES).optional(),
  storyTitle: z.string().min(1),
  durationSeconds: z.literal(60).optional(),
  storyBrief: z.string().min(1),
  characters: z
    .array(
      z.object({
        characterId: z.string().min(1),
        name: z.string().min(1),
        role: z.string().min(1),
      }),
    )
    .min(1),
  episodeCount: z.number().int().positive().optional(),
  ageControl: z
    .object({
      targetAgeGroup: z.enum(["children", "teens", "adults"]),
      targetRating: z.string().optional(),
    })
    .optional(),
  // tieIn intentionally left as passthrough object (validated by its own schema).
  tieIn: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Maps an upstream `target_age_group` bucket into the reduced app enum
 * (spec §7.2.1): preschool/children -> children, tweens/teens -> teens,
 * young_adults/adults -> adults. Unknown values fall back to `adults`.
 */
export function mapUpstreamAgeGroup(upstream: VerticalDramaUpstreamAgeGroup): VerticalDramaAppAgeGroup {
  switch (upstream) {
    case "preschool":
    case "children":
      return "children";
    case "tweens":
    case "teens":
      return "teens";
    case "young_adults":
    case "adults":
      return "adults";
    default:
      return "adults";
  }
}

/**
 * The persisted `input.normalized.json` artifact shape. It preserves the raw
 * upstream snake_case input losslessly alongside the app-facing camelCase shape,
 * and keeps the original brief and skill-inferred fields separate so audit and
 * repair can distinguish user-supplied text from inferred values (spec §7.2.1).
 */
export type VerticalDramaNormalizedInputArtifact = {
  app: VerticalDramaMinimalInput;
  upstream: VerticalDramaUpstreamMinimalEpisodeInput;
  /** The user's original, unmodified brief text. */
  originalBrief: string;
  /** Fields the skill chain inferred (never mixed into the user-supplied brief). */
  inferred: {
    fields: string[];
    values: Record<string, unknown>;
  };
};

/* -------------------------------------------------------------------------- */
/* Series project (spec §7.2)                                                 */
/* -------------------------------------------------------------------------- */

export type VerticalDramaSeriesProject = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  locale: VerticalDramaSeriesLocale;
  aspectRatio: "9:16";
  status: "draft" | "planning" | "active" | "paused" | "completed" | "archived";
  targetEpisodeCount: number;
  defaultEpisodeDurationSeconds: 60;
  genre: string;
  tone: string;
  targetAudience: string;
  agePolicyId?: string;
  bible: VerticalDramaSeriesBible;
  memory: VerticalDramaSeriesMemory;
  productTieIn?: VerticalDramaProductTieInConfig;
  policy: VerticalDramaSeriesPolicy;
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Episode stage output projections (spec §6.9 / §7.3)                        */
/* -------------------------------------------------------------------------- */

/** Typed projection of the `drama_script` output (spec §6.1, §6.9). */
export type VerticalDramaEpisodeScript = {
  episodeTitle: string;
  hook: string;
  structure: Array<{
    beat: string;
    description: string;
    shotNumbers?: number[];
  }>;
  sceneDialogueSummary: string;
  cliffhanger?: string;
  characterStateDeltas: VerticalDramaCharacterDelta[];
  productTieInUsage?: VerticalDramaTieInUsage;
  continuityNotes: string[];
  warnings: VerticalDramaWarning[];
};

/** Typed projection of the `storyboard_shotgrid` output (spec §6.3, §6.9). */
export type VerticalDramaShotgrid = {
  gridLayout: "3x3";
  shotCount: 9;
  shots: Array<{
    shotNumber: number;
    description: string;
    cameraSetup: string;
    characterIds: string[];
    locationId?: string;
    continuityNotes: string[];
    durationSeconds: number;
  }>;
};

/** Typed projection of `start_frame_render_plan` / `shot_start_frames` (spec §6.4, §6.9). */
export type VerticalDramaStartFramePlan = {
  mode: "single_frame_per_shot" | "contact_sheet_3x3_batch";
  selectedImageModelId: string;
  /** Additive scene-anchor compatibility revision for generated-shot provenance. */
  planRevision?: string | number;
  /**
   * Per-sub-episode start-frame image-prompt mode switch
   * (`planning/vd-start-frame-prompt-modes/plan.md`) — which of the two
   * per-shot start-frame prompt skills `generateShotStartFramePrompt`
   * authors a shot's prompt with. `"auto"` (or absent, the default for
   * every plan created before this field existed) resolves at generation
   * time from the episode's selected image model family — GPT-family ->
   * `policy_safe_rewrite`, everything else -> `cinematic_narrative` (see
   * `resolveDefaultImagePromptMode` in `imagePromptModelFamily.ts`). An
   * explicit `policy_safe_rewrite`/`cinematic_narrative` value always wins
   * over that default and is remembered per sub-episode until changed via
   * `setEpisodeImagePromptMode`. Never affects `generateShotReferenceFramePrompt`
   * (supplementary reference frames), which always uses the legacy
   * `vertical-drama-shot-start-frame-prompt` skill regardless of this field.
   */
  imagePromptMode?: VdImagePromptMode | "auto";
  /** Language used by cinematic image/start-frame prompt generation. Policy-safe synopsis mode preserves the synopsis source language. */
  imagePromptLanguage?: VerticalDramaPromptLanguage;
  /**
   * Feature 138 P1 per-scene visual locks, keyed only by `locationKey`.
   * Absent for legacy/flag-off plans. Regeneration preserves matching
   * membership, drops generated mismatches, and marks manual mismatches stale.
   */
  sceneVisualStates?: Record<string, VdSceneVisualState>;
  frames: Array<{
    shotNumber: number;
    imagePrompt: string;
    negativePrompt: string;
    /** Approved portrait references that must appear only inside a phone/video call screen. */
    screenCallerCharacterRefs?: string[];
    /** Explicit physical dialogue through a closed barrier; distinct from phone callers. */
    barrierDialogue?: import("./barrierDialogue").VerticalDramaBarrierDialogue;
    /** Two physical views for a conversation across a closed barrier. */
    barrierMultiView?: import("./barrierMultiView").VerticalDramaBarrierMultiView;
    requiredCharacterRefs: string[];
    /** True after the user explicitly assigns this shot's scene/caller references. */
    characterRefsCustomized?: boolean;
    productReferenceAssetIds: string[];
    /**
     * Additive canonical story-bible snapshot used to author this frame's
     * prompt. When present, it is the exact Overview shot summary that the
     * start-frame skill consumed; absent means this frame predates canonical
     * source tracking and keeps the legacy fallback behavior.
     */
    canonicalShotSummary?: string;
    /**
     * Additive (2026-07-06 product-reference picker) — true once the user has
     * EXPLICITLY set/edited this shot's `productReferenceAssetIds` via the
     * storyboard panel's "เปลี่ยนภาพสินค้า" picker. Distinguishes "user chose
     * zero product images for this shot" (`productReferenceAssetIds: []`,
     * `productRefsCustomized: true` — auto-resolution must NOT refill it) from
     * "never touched, still pipeline-auto-populated" (`productRefsCustomized`
     * absent/false — auto-resolution keeps merging the resolved product refs
     * in on every `start_frame_render_plan` regen, the pre-existing
     * behavior). Absent on every frame created before this field existed,
     * which is intentionally equivalent to `false` (fully backward
     * compatible — those frames keep auto-resolving exactly as before).
     */
    productRefsCustomized?: boolean;
    approvedMediaAssetId?: string;
    /** Provenance for the same-scene neighbor image attached at render/prompt time. */
    sceneAnchor?: {
      anchorShotNumber: number;
      mediaAssetId: number;
      source: "approved" | "latest_generated";
      attachedAt: string;
    };
    /**
     * Feature 138 P2 / Feature 137 shared frame-QC result. Advisory only:
     * warnings are surfaced to the shot card and never block approval or
     * paid generation. The asset/time/version stamps make a result stale
     * when the approved frame is replaced.
     */
    sceneContinuity?: {
      location_match: "match" | "minor_drift" | "different_place";
      lighting_match: "match" | "minor_drift" | "different_time";
      wardrobe_match: Array<{
        character: string;
        verdict: "match" | "changed";
      }>;
      prop_persistence: Array<{
        name: string;
        expected: boolean;
        present: boolean;
      }>;
      staging_axis_ok: boolean;
      notes: string[];
      analyzedAssetId?: string;
      analyzedAt?: string;
      skillVersion?: string;
    };
    /** Advisory device-orientation QC for phone-mediated shots. */
    deviceOrientationQc?: {
      physical_handset_view?: "rear" | "front" | "unclear" | "not_applicable";
      rear_camera_visible?: boolean;
      physical_display_visible?: boolean;
      floating_call_screen_present?: boolean;
      remote_body_outside_device?: boolean;
      notes?: string[];
      analyzedAssetId?: string;
      analyzedAt?: string;
      skillVersion?: string;
    };
    /** Feature 137 P2 — optional I2V-only anchor selected by the user. */
    videoStartMediaAssetId?: string;
    videoStartSource?: "video_safe_regen" | "angle_grid" | "manual_upload";
    /** Feature 137 P2 — video-safety analysis for the currently selected I2V anchor. */
    videoSafety?: {
      characters?: Array<{
        character?: string;
        name?: string;
        face_readable?: boolean;
        facing?: string;
        eyes_visible?: string;
        occlusion?: string;
        face_size?: string;
        overlapped_by_other_face?: boolean;
        notes?: string;
        [key: string]: unknown;
      }>;
      faces_separated?: boolean;
      face_touching_frame_edge?: boolean;
      action_matches_intent?: boolean;
      action_mismatch_note?: string | null;
      video_safe_verdict?: "safe" | "conditional" | "risky";
      reasons: string[];
      analyzedAssetId?: string;
      analyzedAt?: string;
      skillVersion?: string;
    };
    /**
     * Per-shot location override (Phase D, `planning/polished-toasting-
     * gadget.md` — location visual bible). Set via the `setShotLocation`
     * mutation (`verticalDramaEpisodes.ts`) — a pure data patch, no
     * LLM/regeneration involved, same convention as `requiredCharacterRefs`'
     * own manual-override sibling `setShotCharacterReference`. Must be a
     * `locationKey` already present in this series' `vertical_drama_locations`
     * roster (validated at write time).
     *
     * When present, takes precedence over the storyboard's own
     * `distinct_locations[].shot_numbers` grouping for THIS shot only, across
     * every location-reference resolution path that shot participates in
     * (start-frame image generation, video-prompt generation, and the actual
     * video-render provider call) — see `resolveEffectiveShotLocationKey`
     * (`server/routers/verticalDramaEpisodes.ts`) for the single shared
     * precedence function every one of those call sites runs through, so they
     * can never drift out of sync with each other. Absent on every frame
     * created before this field existed (and restored to "absent" by calling
     * `setShotLocation` with `locationKey: null`), which is intentionally
     * equivalent to "no override" — falls back to the pre-existing
     * storyboard-grouping resolution, fully backward compatible.
     */
    locationKey?: string;
    /** Persisted 3x3 multi-angle picker state (2026-07-05 fix) — the source
     *  grid image is already a completed, durable media task; this just
     *  remembers which grid to re-split client-side on reload and which of
     *  its 9 tiles the user already deleted, so a page reload doesn't wipe
     *  the remaining candidates. Written via the existing free
     *  `updateEpisodeDraft` JSONB-patch flow (this whole column is an open
     *  passthrough on that endpoint) — no schema/migration involved. */
    angleGrid?: {
      /** Present only while the grid render is in-flight (2026-07-06 fix)
       *  — persisted at SUBMIT time (before any poll observes completion),
       *  so a page reload/navigation before the client-side poll finishes
       *  can resume tracking this task instead of orphaning it forever (the
       *  only prior source of truth was in-memory poll state in
       *  `VerticalDramaEpisodePage.tsx`). Cleared (along with setting
       *  `imageUrl`) once the resumed poll (or the live poll) observes
       *  completion; cleared entirely (whole `angleGrid` dropped) if the
       *  task is observed to have failed.
       *  `imageUrl` and `pendingTaskId` are mutually exclusive in practice:
       *  a frame has one or the other, never both. */
      pendingTaskId?: string;
      /** Absent while `pendingTaskId` is still set (grid not yet complete). */
      imageUrl?: string;
      mediaTaskId?: string;
      dismissedIndexes?: number[];
    };
    /**
     * Persisted alternate-angle "backup still" media asset ids for this shot
     * (`vd-start-frame-reference-mapping/plan.md` Phase 5d) — durable,
     * user-approved single frames the reshoot/repair flow can fall back to
     * (research finding (c): "reshoot/repair assets — regenerate a drifted
     * shot's start frame from a stored alternate angle"), independent of the
     * transient `angleGrid.imageUrl` 3x3 picker state above (that field
     * tracks ONE in-flight/just-completed 9-tile grid render; this field
     * accumulates individual APPROVED tiles/stills across possibly several
     * grid renders over the shot's lifetime). Written ONLY via the
     * `recordShotAngleGridAsset` mutation (`verticalDramaEpisodes.ts`) — a
     * pure data patch, no LLM/regeneration involved, same
     * "find by shotNumber, replace one field, write the whole jsonb column
     * back" convention as `setApprovedStartFrameAsset`/
     * `setShotCharacterReference`/`setShotLocation`. Capped at the 5 MOST
     * RECENT entries (oldest dropped) — see that mutation's doc comment.
     * Absent on every frame created before this field existed, equivalent to
     * `[]` (fully backward compatible).
     */
    angleGridAssetIds?: number[];
    /**
     * Which engine authored THIS frame's current `imagePrompt` (`planning/
     * vd-start-frame-prompt-modes/plan.md`) — present only when a
     * `generateShotStartFramePrompt` call resolved and used one of the two
     * new modes; absent for a frame still carrying a legacy-skill-authored
     * or never-regenerated prompt (no false claims). Mirrors the video
     * path's `promptModelTarget` badge convention. The render path
     * (`generateStartFrameImage`'s preset-visual-identity append) reads this
     * stamp to skip its code-side positive-text append for a stamped frame —
     * the skill already wove those fragments into its own prose, per the
     * "NO CODE-SIDE PROMPT APPENDING" rule.
     */
    promptMode?: VdImagePromptModeStamp;
    /**
     * Mode 1's top-level `safety_adjustments` OR mode 2's
     * `analysis_summary.safety_adjustments` — each entry an
     * `"original → rewritten"` pair the skill applied to keep the prompt
     * policy-safe. Display/audit only; absent when the mode returned none
     * (nothing needed rewriting) or the frame predates this field.
     */
    promptSafetyAdjustments?: string[];
    /**
     * Mode 2 (`cinematic_narrative`)'s director's-notes extras, normalized
     * and trimmed to a display-only subset of its full `analysis_summary` +
     * self-check output — never required by the renderer or the reference-
     * mapping validator. Absent for mode 1 frames (no `analysis_summary`)
     * and for any frame predating this field.
     */
    promptAnalysis?: {
      storyMeaning?: string;
      primaryEmotion?: string;
      decisiveMoment?: string;
      qualityScore?: number;
      qualityFlags?: string[];
    };
  }>;
};

/**
 * One clip's dialogue line (storyboard-complete plan, Phase 3.1) — synced
 * from `dialogueAudioPlan` onto `clips[j].dialogue` when the motion-pack
 * skill output didn't already carry it. See
 * `server/services/verticalDramaVideoMotionPromptGeneration.ts`'s
 * `syncDialogueOntoMotionPromptClips` for the sync logic and
 * `server/services/verticalDramaVideoPromptFormatter.ts` for how this is
 * folded into the final model-aware video-clip prompt.
 */
export type VerticalDramaMotionPromptClipDialogueLine = {
  characterKey?: string;
  lineTh: string;
  emotion?: string;
  delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
  subtext?: string;
  /**
   * Additive (2026-07-07 unusable-dialogue fix) — set ONLY when this line was
   * auto-recovered from the script's freeform scene dialogue (never reviewed
   * by a dedicated dialogue-planning pass or a human edit). Drives a subtle
   * "from the script — check it sounds natural" hint in the storyboard
   * panel's dialogue box. `undefined` everywhere else (default).
   */
  origin?: "script_fallback";
};

/**
 * Prompt LANGUAGE options (episode-level language plan):
 *  - `startFramePlan.imagePromptLanguage`: the cinematic image-prompt
 *    language. Policy-safe synopsis mode deliberately ignores this setting
 *    and preserves the synopsis source language.
 *  - `motionPromptPack.promptLanguage`: the video motion-prompt language.
 *    Defaults to `"en"` when absent and is independent from image prompts.
 *  - `dialogueLanguage`: the language the characters SPEAK in the video
 *    (embedded verbatim for native-audio models, or routed to TTS
 *    otherwise) — a video-only concept, no image-prompt equivalent (start
 *    frames are silent stills). Defaults to the series' own locale (`"th"`)
 *    when absent — existing episodes with no explicit selection keep
 *    behaving exactly as before (Thai dialogue), this is purely additive.
 *  Image and video prompt languages are persisted through separate setters.
 *  Legacy episodes temporarily fall back from the missing image field to the
 *  existing video prompt language so changing video language cannot silently
 *  change previously established image behavior.
 */
export type VerticalDramaPromptLanguage = "en" | "th" | "zh" | "ja" | "ko";

/**
 * See `VerticalDramaPromptLanguage`'s doc comment — the SPEECH language the
 * characters speak in the video. Broader than `promptLanguage`'s set since
 * this drives the actual dialogue/TTS content, not just prompt prose: Thai
 * (default, the series' own locale), English, and the other popular
 * languages product wants covered from day one.
 */
export type VerticalDramaDialogueLanguage = VerticalDramaSeriesLocale;

/** Runtime value list for `VerticalDramaPromptLanguage` — single source of truth for the server's Zod enum and any client validation. */
export const VERTICAL_DRAMA_PROMPT_LANGUAGES = ["en", "th", "zh", "ja", "ko"] as const;

/** Runtime value list for `VerticalDramaDialogueLanguage` — aliases `VERTICAL_DRAMA_SERIES_LOCALES` (same set, single source of truth). */
export const VERTICAL_DRAMA_DIALOGUE_LANGUAGES = VERTICAL_DRAMA_SERIES_LOCALES;

/** English display name per `VerticalDramaPromptLanguage` code — drives the "write ... entirely in X" clause in the skills' instructions. */
export const VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES: Record<
  VerticalDramaPromptLanguage,
  string
> = {
  en: "English",
  th: "Thai",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

/**
 * English display name per `VerticalDramaDialogueLanguage` code — drives the
 * "spoken in X"/"speak in X" clauses in the skills' instructions and
 * `verticalDramaVideoPromptFormatter.ts`'s provider prompt, so every language
 * is named in English regardless of what language it refers to.
 */
export const VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES: Record<
  VerticalDramaDialogueLanguage,
  string
> = {
  th: "Thai",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  pt: "Portuguese",
  id: "Indonesian",
  vi: "Vietnamese",
  hi: "Hindi",
  ar: "Arabic",
  fr: "French",
  de: "German",
  tr: "Turkish",
  it: "Italian",
  ru: "Russian",
  fil: "Filipino",
  ms: "Malay",
};

/**
 * English display name for a series locale — drives "write all output in X"
 * clauses in generation prompts. Unknown/legacy values fall back to English.
 */
export function verticalDramaLocaleEnglishName(locale: string | null | undefined): string {
  return (
    VERTICAL_DRAMA_DIALOGUE_LANGUAGE_ENGLISH_NAMES[locale as VerticalDramaDialogueLanguage] ??
    "English"
  );
}

/** Normalize a stored series locale to a valid `VerticalDramaSeriesLocale`, defaulting to `"th"`. */
export function normalizeVerticalDramaSeriesLocale(
  locale: string | null | undefined,
): VerticalDramaSeriesLocale {
  return (VERTICAL_DRAMA_SERIES_LOCALES as readonly string[]).includes(locale ?? "")
    ? (locale as VerticalDramaSeriesLocale)
    : "th";
}

/**
 * Native-script display name per `VerticalDramaDialogueLanguage` code — for
 * the UI's "ภาษาเสียงพูด" select (each option shown in its own language's
 * native name, per product decision).
 */
export const VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES: Record<
  VerticalDramaDialogueLanguage,
  string
> = {
  th: "ไทย",
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  pt: "Português",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  hi: "हिन्दी",
  ar: "العربية",
  fr: "Français",
  de: "Deutsch",
  tr: "Türkçe",
  it: "Italiano",
  ru: "Русский",
  fil: "Filipino",
  ms: "Bahasa Melayu",
};

/**
 * Thai regional speech accents — a refinement of `dialogueLanguage: "th"`.
 * Selecting one injects the matching English delivery directive
 * (`VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES`) into video prompts so
 * native-audio models perform the dialogue with that accent. Ignored when the
 * dialogue language is not Thai.
 */
export const VERTICAL_DRAMA_THAI_ACCENTS = [
  "standard_central_thai",
  "bangkok_thai_accent",
  "mild_northern_thai_accent",
  "mild_isan_thai_accent",
  "mild_southern_thai_accent",
  "neutral_thai_with_light_regional_accent",
] as const;

export type VerticalDramaThaiAccent = (typeof VERTICAL_DRAMA_THAI_ACCENTS)[number];

/**
 * English dialogue-delivery directive per Thai accent — embedded verbatim in
 * video prompts (video models read English direction best). Wording is a
 * product decision; keep the "mild"/"easy to understand" guardrails so
 * regional accents stay intelligible to general Thai audiences.
 */
export const VERTICAL_DRAMA_THAI_ACCENT_DIALOGUE_DIRECTIVES: Record<
  VerticalDramaThaiAccent,
  string
> = {
  standard_central_thai:
    "Dialogue: in standard Central Thai, standard Bangkok Thai accent, clear pronunciation, natural conversational tone",
  bangkok_thai_accent:
    "Dialogue: in standard Central Thai with a clear Bangkok-style accent, natural conversational delivery, warm and easy to understand.",
  mild_northern_thai_accent:
    "Dialogue: in Thai with a mild Northern Thai / Chiang Mai accent, soft warm delivery, gentle pacing, easy to understand.",
  mild_isan_thai_accent:
    "Dialogue: in Thai with a mild Isan / Northeastern Thai accent, friendly local tone, lively but clear, easy to understand.",
  mild_southern_thai_accent:
    "Dialogue: in Thai with a mild Southern Thai accent, confident energetic delivery, clear pronunciation, not too fast.",
  neutral_thai_with_light_regional_accent:
    "Dialogue: Thai spoken naturally with a neutral central tone and a slight regional flavor. The accent should feel local and believable, but still clear, soft, and easy for general Thai audiences to understand. Avoid heavy dialect words or exaggerated regional pronunciation.",
};

/** Bilingual UI labels per Thai accent — for the storyboard panel's accent select. */
export const VERTICAL_DRAMA_THAI_ACCENT_LABELS: Record<
  VerticalDramaThaiAccent,
  { th: string; en: string }
> = {
  standard_central_thai: { th: "ไทยกลางมาตรฐาน", en: "Standard Central Thai" },
  bangkok_thai_accent: { th: "สำเนียงกรุงเทพฯ", en: "Bangkok Accent" },
  mild_northern_thai_accent: {
    th: "สำเนียงเหนืออ่อน ๆ (เชียงใหม่)",
    en: "Mild Northern (Chiang Mai) Accent",
  },
  mild_isan_thai_accent: { th: "สำเนียงอีสานอ่อน ๆ", en: "Mild Isan Accent" },
  mild_southern_thai_accent: { th: "สำเนียงใต้อ่อน ๆ", en: "Mild Southern Accent" },
  neutral_thai_with_light_regional_accent: {
    th: "ไทยกลางแตะสำเนียงท้องถิ่นเบา ๆ",
    en: "Neutral Thai, Light Regional Flavor",
  },
};

/** Typed projection of the `video_motion_prompt_pack` output (spec §6.5, §6.9). */
export type VerticalDramaMotionPromptPack = {
  selectedVideoModelId: string;
  durationProfileId: string;
  /** The language the video-clip prompt TEXT is written in — see `VerticalDramaPromptLanguage`. Defaults to `"en"` when absent. */
  promptLanguage?: VerticalDramaPromptLanguage;
  /** The language the characters SPEAK in the video — see `VerticalDramaDialogueLanguage`. Defaults to `"th"` when absent. */
  dialogueLanguage?: VerticalDramaDialogueLanguage;
  /** Thai regional speech accent — only meaningful when `dialogueLanguage` is `"th"` (or absent, which defaults to Thai). See `VerticalDramaThaiAccent`. */
  thaiAccent?: VerticalDramaThaiAccent;
  /**
   * Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt option,
   * added 2026-07-09) — the user's persisted preference for whether shot
   * video-prompt generation should request native ambient bed + SFX prompt
   * direction (see `skills/vertical-drama-shot-video-prompt/skill.md`'s
   * "NATIVE AUDIO DIRECTION" section). Only takes effect when BOTH the
   * rollout gate (`VD_NATIVE_AUDIO_PROMPTS_ROLLOUT` in
   * `@shared/verticalDramaSeries/nativeAudioPrompts`) is on AND the
   * episode's selected video model's `supportsNativeAudio` capability is
   * true — stored independently of both so a user's choice survives a
   * future model change or the rollout flag switching on. `undefined` for
   * every pre-existing pack (byte-identical default: treated as `false`).
   */
  nativeAudioEnabled?: boolean;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  clips: Array<{
    clipNumber: number;
    sourceShotNumbers: number[];
    prompt: string;
    negativeMotionPrompt?: string;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
    /**
     * Additional reference-image asset ids (beyond `startFrameAssetId`) this
     * clip's video generation should send — e.g. one portrait per additional
     * speaker in a consolidated speaker-switch clip (2026-07-11 redesign,
     * see `subShotNumber`'s doc comment below), so identity for every
     * referenced character rides the model's multi-reference-image support
     * instead of per-segment reference switching. Ordered by priority (kept
     * first when trimmed to the model's `maxReferenceImages` — see
     * `generateVideoClip`'s reference-merge step in
     * `verticalDramaEpisodes.ts`). Generic field, usable by any future
     * multi-reference clip need — not exclusive to speaker-switch clips.
    */
    extraReferenceAssetIds?: string[];
    durationSeconds: number;
    /**
     * Legacy field (pre-2026-07-11) — set only on a stale, previously-
     * persisted speaker-switch split clip (`shotNumber * 100 + subShotNumber`
     * clip numbering, N clips per shot). The 2026-07-11 redesign consolidates
     * a speaker-switch shot into exactly ONE clip (`clipNumber: shotNumber`,
     * `extraReferenceAssetIds` above instead) and never writes this field
     * again — kept only so any still-persisted legacy split clip (until the
     * user regenerates that shot, which replaces it) keeps rendering via the
     * frontend's existing "(1/N)" legacy-compat render path.
     */
    parentShotNumber?: number;
    /** Legacy field (pre-2026-07-11) — see `parentShotNumber`'s doc comment above. */
    subShotNumber?: number;
    /** Dialogue line(s) spoken during this clip (Phase 3.1) — optional, empty/omitted for silent clips. */
    dialogue?: VerticalDramaMotionPromptClipDialogueLine[];
    /**
     * Additive (2026-07-06 Thai ad-compliance upgrade) — the category-mandated
     * disclosure line for this clip's product tie-in (e.g.
     * "อ่านคำเตือนในฉลากก่อนบริโภค"), rendered as an end-of-clip spoken line
     * or caption note. Present only when the clip's shot carries a tie-in
     * whose category requires a mandated disclosure — see
     * `buildThaiAdComplianceInstruction`/`resolveRequiredDisclosureForCategory`
     * in `@shared/verticalDramaSeries/thaiAdCompliance.ts`.
     */
    requiredDisclosure?: string;
    /**
     * Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
     * option, added 2026-07-09) — this clip's model-directed ambient bed +
     * SFX cues (SFX cues tied to visible on-screen actions first, ambient
     * soundscape/atmosphere second — see the shot-video-prompt skill's
     * "NATIVE AUDIO DIRECTION" section), returned by
     * `generateVerticalDramaShotVideoPrompt` ONLY when the episode's
     * `nativeAudioEnabled` preference + rollout gate + the selected video
     * model's `supportsNativeAudio` capability were ALL true at generation
     * time. Kept as a SEPARATE field (never inlined into `prompt` at
     * generation time) — `formatVideoClipRequest`
     * (`verticalDramaVideoPromptFormatter.ts`) is the single place that
     * appends it onto the final provider-submitted prompt text, mirroring
     * how that same function (not the per-shot generator) owns folding
     * dialogue direction into the final prompt. NEVER contains speech/
     * dialogue/voices or music/melody/lyrics/score — those stay owned by
     * the TTS (Layer 2) and future BGM (Layer 3) layers respectively; see
     * `@shared/verticalDramaSeries/nativeAudioPrompts` for the full 3-layer
     * audio architecture. `undefined` when the option was off/unsupported
     * for this clip (or predates this task).
     */
    audioDirection?: string;
    /**
     * Model-family-aware, vision-grounded video prompt quality upgrade
     * (`planning/vd-video-prompt-model-family-quality/plan.md`) — which
     * video model family (grok/veo/seedance/other) this clip's `prompt` was
     * shaped for at generation time, stamped by
     * `generateVerticalDramaShotVideoPrompt`/
     * `generateVerticalDramaShotVideoPromptSpeakerSwitch`'s router callers
     * (both persist sites) so the storyboard UI can show a family badge and
     * warn when the episode's currently-selected video model no longer
     * matches. `undefined` for any clip generated before this task, or a
     * legacy clip produced by the bulk motion-prompt-pack generator (out of
     * scope for this task — see the plan's "Out of scope" section) — the
     * badge simply renders nothing in that case.
     */
    promptModelTarget?: VideoPromptModelTarget;
    /**
     * Model-family-aware, vision-grounded video prompt quality upgrade
     * (`planning/vd-video-prompt-model-family-quality/plan.md`) — the
     * compact, normalized "who is where on screen" reading the generation
     * LLM returned via the skill's `frame_analysis` output field (FRAME
     * ANALYSIS FIRST section), when this shot had an attached character
     * portrait/start-frame vision bundle.
     * `people` is trimmed to at most 6 entries (name/position each ≤80
     * chars); `positionSource` mirrors the skill's own
     * `"image" | "image_prompt_text"` value verbatim (lenient — never
     * enum-validated here, weak models may return other short strings).
     * Debugging/future-UI aid only; never required for rendering.
     * `undefined` when no portrait/start-frame bundle was attached and the
     * model returned nothing usable, or for any clip
     * generated before this task.
     */
    frameAnalysis?: {
      people: Array<{
        name: string;
        position: string;
        /** Physical image whose independent viewer-relative coordinate space owns this person. */
        viewRole?: "start_frame" | "barrier_reference";
        /** Concise visible action/pose cue observed in the attached start frame. */
        action?: string;
        facing?: string;
        eyesVisible?: string;
        occlusion?: string;
        faceSize?: string;
        overlappedByOtherFace?: boolean;
      }>;
      positionSource?: string;
      facesSeparated?: boolean;
    };
    /**
     * Feature 137 P1 motion contract. Optional for old clips and bulk-pack
     * output. `effectiveRisk` is the maximum of the skill declaration and
     * the deterministic facts-based floor; consumers must never require it.
     */
    motionProfile?: VdMotionProfile & { effectiveRisk: VdIdentityRisk };
    effectiveRisk?: VdIdentityRisk;
    /** Present only when the request-gated per-shot/sub-shot path ran. */
    motionContractStatus?: VdMotionContractStatus;
    /**
     * Feature 137 P3 post-video identity QA.  Sampling/vision is advisory and
     * fail-open: a missing sample must never make an otherwise renderable clip
     * unavailable.  While the sampler is still running, `samplingTaskId`
     * keeps the durable poll handle.  Kept optional so pre-P3 motion packs
     * round-trip unchanged.
     */
    identityQc?: {
      status: "pending" | "sampling" | "pass" | "warn" | "fail" | "samples_unavailable";
      verdict?: "consistent" | "minor_drift" | "identity_break" | "unavailable";
      characters?: Array<{
        characterKey?: string;
        name?: string;
        verdict: "consistent" | "minor_drift" | "identity_break";
        driftKind?: "face" | "hair" | "age" | "wardrobe" | "character_swap";
        worstFrameIndex?: number;
        note?: string;
      }>;
      sampleUrls?: string[];
      analyzedAssetId?: string;
      /** Celery sampling task still running; the client polls this task instead
       * of reporting a false "samples unavailable" result. */
      samplingTaskId?: string;
      analyzedAt?: string;
      skillVersion?: string;
      warning?: string;
      qcReportId?: string;
    };
    /**
     * Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
     * quality/plan.md` Phase 2) — compact record of how this clip's prompt
     * was produced: `mode` is `"judged"` (the K=2-candidates-plus-judge loop
     * ran) or `"single"` (the loop was skipped — `qualityLoop: false`, or
     * one of the 2 candidates failed to generate so its survivor shipped
     * unjudged); `candidates` is how many were generated (1 or 2); `verdict`
     * is the judge's own `"accept" | "repair"` call, omitted when the judge
     * was never reached or failed (fail-open); `repaired` is true only when
     * a repair regeneration actually shipped (mechanically beat the
     * original winner on hard facts). `undefined` for any clip generated
     * before this task.
     */
    promptQuality?: {
      mode: string;
      candidates: number;
      verdict?: string;
      repaired: boolean;
    };
    /**
     * Additive (2026-07-06 fix — completed video renders were never
     * persisted anywhere, only shown as a transient toast) — durable record
     * of this clip's paid video render, written via the existing free
     * `updateEpisodeDraft` JSONB-patch flow, same convention as
     * `startFramePlan.frames[].angleGrid`. `pendingTaskId` is persisted at
     * submit time (before polling even starts) so a reload/navigation before
     * the client poll observes completion can resume tracking the task
     * instead of losing the result forever; it is dropped once `videoUrl` is
     * persisted on completion.
     */
    videoTask?: {
      pendingTaskId?: string;
      videoUrl?: string;
      mediaTaskId?: string;
      /** Durable owner-scoped media asset identity for generated clips. */
      mediaAssetId?: string;
      /**
       * Additive (2026-07-07 upload-video-per-shot upgrade) — marks a
       * `videoUrl` that was placed by the user uploading an externally
       * generated clip (`ai.upload`'s multipart sibling,
       * `/api/media-jobs/upload`) rather than produced by
       * `generateVideoClip`. Absent/`"generated"` for the normal AI-render
       * path so existing rows are unaffected. Regenerating (`onGenerateVideoClip`)
       * always overwrites this back to the generated path.
       */
      source?: "generated" | "upload";
    };
  }>;
  warnings: VerticalDramaWarning[];
};

/** Recommended dialogue/audio/subtitle plan metadata (spec §14). */
export type VerticalDramaDialogueAudioPlan = {
  audioStrategy: "separate_tts_voiceover" | "dialogue_tts" | "native_video_audio" | "silent";
  language: "th-TH" | "en-US" | string;
  voiceContinuityMap: Array<{
    characterId: string;
    speakerName: string;
    voiceProvider?: string;
    voiceModelId?: string;
    voiceId?: string;
    fallbackVoiceId?: string;
  }>;
  shotLines: Array<{
    shotNumber: number;
    clipNumber?: number;
    speakerCharacterId?: string;
    text: string;
    targetDurationSeconds: number;
    subtitleCueId?: string;
  }>;
  subtitleSafeArea: {
    position: "bottom_safe" | "middle_safe" | "top_safe";
    maxLines: number;
    avoidFaceArea: boolean;
  };
  warnings: VerticalDramaWarning[];
};

/* -------------------------------------------------------------------------- */
/* Approval checkpoints (spec §11.2)                                          */
/* -------------------------------------------------------------------------- */

export type VerticalDramaApprovalCheckpointArtifact = {
  checkpointId: string;
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  state: "pending" | "approved" | "rejected" | "repaired" | "superseded";
  approvedByUserId?: string;
  rejectedByUserId?: string;
  sourceArtifactIds: string[];
  repairRequestIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Compact per-stage approval status projected from the durable checkpoint (spec §7.3). */
export type VerticalDramaApprovalState = Pick<
  VerticalDramaApprovalCheckpointArtifact,
  "stage" | "state" | "checkpointId"
>;

/* -------------------------------------------------------------------------- */
/* QC report (spec §16)                                                       */
/* -------------------------------------------------------------------------- */

export type VerticalDramaQcStage =
  | "script"
  | "character_visual"
  | "storyboard"
  | "start_frame_prompt"
  | "start_frame_image"
  | "video_prompt"
  | "provider_routing"
  | "video_clip"
  | "assembly"
  | "product_tie_in"
  | "storyboard_review_handoff"
  | "episode_memory_update";

/**
 * Single source of truth for QC-stage -> pipeline-stage resolution. Lives
 * here (not `server/services/verticalDramaQc.ts`) specifically so both the
 * server (QC evaluation / stale-stage computation) and the client
 * (Storyboard Review's repair-button wiring, which must resolve a
 * `recommendedRepairs[]` entry's QC stage back to a pipeline stage to call
 * `repairStageOutput`) import the exact same mapping — no duplicated,
 * driftable copy on either side.
 */
export const VERTICAL_DRAMA_QC_TO_PIPELINE_STAGE: Record<VerticalDramaQcStage, VerticalDramaPipelineStage> = {
  script: "plan_episode_script",
  character_visual: "update_character_visual_bible",
  storyboard: "storyboard_shotgrid",
  start_frame_prompt: "start_frame_render_plan",
  start_frame_image: "render_or_import_start_frames",
  video_prompt: "video_motion_prompt_pack",
  provider_routing: "render_or_import_video_clips",
  video_clip: "render_or_import_video_clips",
  assembly: "assemble_episode_manifest",
  product_tie_in: "video_motion_prompt_pack",
  storyboard_review_handoff: "create_storyboard_review_project",
  episode_memory_update: "summarize_episode_to_series_memory",
};

export type VerticalDramaQcResult = {
  qcReportId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaQcStage;
  passed: boolean;
  score: number;
  issues: Array<{
    issueId: string;
    severity: "info" | "warning" | "error" | "blocking";
    targetType:
      | "series"
      | "episode"
      | "character"
      | "shot"
      | "clip"
      | "asset"
      | "provider"
      | "audio"
      | "subtitle"
      | "tie_in";
    targetId?: string;
    message: string;
    evidence?: string;
  }>;
  recommendedRepairs: Array<{
    repairId: string;
    stage: VerticalDramaQcStage;
    action:
      | "rewrite_script"
      | "regenerate_character"
      | "repair_storyboard_shot"
      | "repair_start_frame_prompt"
      | "regenerate_start_frame"
      | "repair_motion_prompt"
      | "reroute_provider"
      | "regenerate_clip"
      | "repair_sub_shot"
      | "adjust_sub_shot_timing"
      | "adjust_audio_subtitle"
      | "remove_or_rewrite_tie_in"
      | "repair_assembly";
    instruction: string;
    autoRunnable: boolean;
  }>;
  createdAt: string;
};

/** GitHub-guide-equivalent alias (spec §11.5). */
export type QCResult = VerticalDramaQcResult;

/**
 * Persisted QC report row (spec §16 — the `vertical_drama_qc_reports` table).
 *
 * The run/stage-scoped durable projection of a `VerticalDramaQcResult` after it
 * has been written to the QC table. It carries the DB row `id` (as a string, in
 * keeping with the client-facing string-id convention used across these
 * contracts) alongside the deterministic `qcReportId`, and its field names /
 * shapes mirror the `vertical_drama_qc_reports` columns (stage, passed, score,
 * issues, recommendedRepairs, createdAt). Issue and repair shapes are reused
 * verbatim from `VerticalDramaQcResult` so the persisted row never drifts from
 * the evaluated result.
 */
export type VerticalDramaQcReport = {
  /** DB row id (bigserial) — absent until persisted. */
  id?: string;
  qcReportId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaQcStage;
  passed: boolean;
  score: number;
  issues: VerticalDramaQcResult["issues"];
  recommendedRepairs: VerticalDramaQcResult["recommendedRepairs"];
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Episode (spec §7.3)                                                        */
/* -------------------------------------------------------------------------- */

export type VerticalDramaEpisodeStatus =
  | "draft"
  | "script_planned"
  | "characters_ready"
  | "storyboard_ready"
  | "start_frames_ready"
  | "motion_prompts_ready"
  | "storyboard_review_created"
  | "rendering"
  | "completed"
  | "needs_repair";

export type VerticalDramaEpisode = {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  status: VerticalDramaEpisodeStatus;
  targetDurationSeconds: 60;
  durationProfileId: typeof VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID | string;
  script?: VerticalDramaEpisodeScript;
  storyboard?: VerticalDramaShotgrid;
  startFramePlan?: VerticalDramaStartFramePlan;
  dialogueAudioPlan?: VerticalDramaDialogueAudioPlan;
  motionPromptPack?: VerticalDramaMotionPromptPack;
  assemblyManifest?: VerticalDramaAssemblyManifest;
  storyboardReviewId?: string;
  approvals: VerticalDramaApprovalState[];
  qcReports: VerticalDramaQcResult[];
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Run artifacts (spec §7.3)                                                  */
/* -------------------------------------------------------------------------- */

export type VerticalDramaArtifactStage =
  | "input_normalized"
  | "drama_script"
  | "character_visual_bible"
  | "character_assets_manifest"
  | "storyboard_shotgrid"
  | "start_frame_render_plan"
  | "contact_sheet_batch_plan"
  | "contact_sheet_assets_manifest"
  | "candidate_frame_selection"
  | "start_frame_manifest"
  | "video_motion_prompt_pack"
  | "video_clip_manifest"
  | "assembly_manifest"
  | "qc_report"
  | "readable_summary"
  | "run_log";

export type VerticalDramaRunArtifact = {
  artifactId: string;
  seriesId: string;
  episodeId: string;
  runId: string;
  stage: VerticalDramaArtifactStage;
  storageKey?: string;
  jsonPayload?: unknown;
  mediaAssetIds?: string[];
  checksumSha256?: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Run-level contracts (spec §11.5)                                           */
/* -------------------------------------------------------------------------- */

export type NormalizedEpisodeInput = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  locale: VerticalDramaSeriesLocale;
  targetDurationSeconds: 60;
  aspectRatio: "9:16";
  storyBrief: string;
  memoryBundle: VerticalDramaSeriesMemory;
  characters: VerticalDramaCharacter[];
  tieIn?: VerticalDramaProductTieInConfig;
  ageControl?: VerticalDramaMinimalInput["ageControl"];
};

export type RunResult = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  status: "queued" | "running" | "approval_required" | "succeeded" | "failed" | "cancelled";
  next_action:
    | "approve"
    | "repair"
    | "resume_next_stage"
    | "open_storyboard_review"
    | "wait_for_provider"
    | "none";
  /** ARRAY — a stage may emit multiple artifacts. */
  artifactIds: string[];
  errors: Array<{
    code: string;
    message: string;
    targetArtifactId?: string;
    repairable: boolean;
  }>;
  warnings: VerticalDramaWarning[];
  qc?: VerticalDramaQcResult;
};

/** Episode run modes (spec §11.4). */
export const VERTICAL_DRAMA_RUN_MODES = [
  "dry_run",
  "plan_only",
  "render_images",
  "render_video",
  "full",
] as const;
export type VerticalDramaRunMode = (typeof VERTICAL_DRAMA_RUN_MODES)[number];

/** Durable episode run row projection (persisted per stage execution). */
export type VerticalDramaEpisodeRun = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  runMode: VerticalDramaRunMode;
  status: RunResult["status"];
  nextAction: RunResult["next_action"];
  artifactIds: string[];
  warnings: VerticalDramaWarning[];
  createdAt: string;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Final-prompt quality-control character caps (backend `verticalDramaPromptQc`) */
/* -------------------------------------------------------------------------- */

/**
 * Legacy/default character cap for an IMAGE prompt in the Vertical Drama flow.
 * Provider-aware callers may widen it up to the absolute 20,000-character
 * ceiling when the selected image model supports that budget. Enforced
 * server-side by `verticalDramaPromptQc.ts`'s `ensurePromptWithinLimit`.
 */
export const VD_IMAGE_PROMPT_MAX = 3800;

/**
 * Hard character cap for any VIDEO prompt (motion prompt, formatted
 * provider-ready clip prompt including embedded dialogue/direction text)
 * persisted/displayed/sent to a provider in the Vertical Drama flow. Same
 * enforcement point as `VD_IMAGE_PROMPT_MAX` above.
 */
export const VD_VIDEO_PROMPT_MAX = 2000;
