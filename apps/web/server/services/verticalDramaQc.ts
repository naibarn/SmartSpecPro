/**
 * Vertical Drama Series — QC report + interactive repair-queue service
 * (spec feature 131, section-08, §11.5 / §11.6 / §16).
 *
 * Produces a `VerticalDramaQcResult` per QC stage with an explicit `passed`
 * boolean + `score` so callers can gate paid generation on a hard pass/fail
 * rather than parsing issue lists. Every stage evaluates only the relevant
 * subset of the required checks (9:16 output, duration sums, sub-shot
 * decomposition, character identity/wardrobe, relationship/plot continuity,
 * memory de-dup, forced-claim guard, prompt/overlay/audio separation, provider
 * capability policy, skill-contract version, audio/subtitle timing, review
 * frame-role validity, and asset ownership/freshness).
 *
 * QC results are ACTIONABLE (spec §11.6): each `recommendedRepairs[]` entry
 * carries `action` / `instruction` / `autoRunnable` and a concrete target
 * (stage + shot/clip/artifact), and every action resolves to a reachable
 * per-target repair entry point in another section (start-frame → section-05,
 * script/character → section-04, clip/motion/sub-shot → section-06,
 * assembly → section-09). This section owns the QC-side wiring, not the
 * downstream repair implementation.
 *
 * Pure evaluators live at module scope (unit-testable without a DB); the
 * `VerticalDramaQcService` handles owner-scoped persistence to
 * `vertical_drama_qc_reports`.
 */

import { createHash } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaQcReports,
  type VerticalDramaQcReportRow,
} from "../../drizzle/schema";
import type {
  VerticalDramaQcResult,
  VerticalDramaQcStage,
  VerticalDramaPipelineStage,
  VideoRoutingDecision,
  VerticalDramaTieInUsage,
} from "@shared/verticalDramaSeries";

type QcIssue = VerticalDramaQcResult["issues"][number];
type QcRepair = VerticalDramaQcResult["recommendedRepairs"][number];
type QcRepairAction = QcRepair["action"];

/* -------------------------------------------------------------------------- */
/* Required-check catalog (spec §16)                                           */
/* -------------------------------------------------------------------------- */

export type VerticalDramaQcCheckId =
  | "aspect_ratio_9_16"
  | "duration_sums"
  | "sub_shot_decomposition"
  | "character_identity_wardrobe"
  | "relationship_plot_continuity"
  | "memory_no_duplicate_contradiction"
  | "no_forced_product_claim"
  | "prompt_overlay_audio_separation"
  | "provider_capability_policy"
  | "repair_queue_present"
  | "skill_contract_version"
  | "audio_subtitle_timing"
  | "review_frame_roles_valid"
  | "assets_tenant_owned_fresh";

/** Which required checks each QC stage evaluates (spec §16). */
export const VERTICAL_DRAMA_QC_STAGE_CHECKS: Record<
  VerticalDramaQcStage,
  VerticalDramaQcCheckId[]
> = {
  script: ["skill_contract_version", "no_forced_product_claim"],
  character_visual: ["character_identity_wardrobe", "assets_tenant_owned_fresh"],
  storyboard: ["aspect_ratio_9_16", "duration_sums", "character_identity_wardrobe"],
  start_frame_prompt: ["aspect_ratio_9_16", "prompt_overlay_audio_separation"],
  start_frame_image: ["aspect_ratio_9_16", "character_identity_wardrobe", "assets_tenant_owned_fresh"],
  video_prompt: [
    "aspect_ratio_9_16",
    "duration_sums",
    "sub_shot_decomposition",
    "prompt_overlay_audio_separation",
    "audio_subtitle_timing",
  ],
  provider_routing: [
    "aspect_ratio_9_16",
    "duration_sums",
    "sub_shot_decomposition",
    "provider_capability_policy",
    "assets_tenant_owned_fresh",
  ],
  video_clip: [
    "aspect_ratio_9_16",
    "duration_sums",
    "sub_shot_decomposition",
    "assets_tenant_owned_fresh",
  ],
  assembly: ["aspect_ratio_9_16", "duration_sums", "audio_subtitle_timing"],
  product_tie_in: ["no_forced_product_claim", "prompt_overlay_audio_separation"],
  storyboard_review_handoff: ["review_frame_roles_valid", "prompt_overlay_audio_separation"],
  episode_memory_update: ["memory_no_duplicate_contradiction", "relationship_plot_continuity"],
};

/** The two DISTINCT QC stages added by section 08 (spec §16). */
export const VERTICAL_DRAMA_SERIES_CONTINUITY_QC_STAGE: VerticalDramaQcStage = "episode_memory_update";
export const VERTICAL_DRAMA_PRODUCT_TIE_IN_QC_STAGE: VerticalDramaQcStage = "product_tie_in";

/* -------------------------------------------------------------------------- */
/* Repair reachability (spec §11.6 — every recommended repair resolves)        */
/* -------------------------------------------------------------------------- */

export type VerticalDramaRepairSection =
  | "section-04-series-memory-and-episode-pipeline"
  | "section-05-character-stock-and-start-frames"
  | "section-06-clip-generation-motion"
  | "section-09-assembly-export";

/** Map a QC repair action to the concrete per-target repair entry point. */
export const VERTICAL_DRAMA_REPAIR_REACHABILITY: Record<QcRepairAction, VerticalDramaRepairSection> = {
  rewrite_script: "section-04-series-memory-and-episode-pipeline",
  regenerate_character: "section-04-series-memory-and-episode-pipeline",
  repair_storyboard_shot: "section-04-series-memory-and-episode-pipeline",
  repair_start_frame_prompt: "section-05-character-stock-and-start-frames",
  regenerate_start_frame: "section-05-character-stock-and-start-frames",
  repair_motion_prompt: "section-06-clip-generation-motion",
  reroute_provider: "section-06-clip-generation-motion",
  regenerate_clip: "section-06-clip-generation-motion",
  repair_sub_shot: "section-06-clip-generation-motion",
  adjust_sub_shot_timing: "section-06-clip-generation-motion",
  adjust_audio_subtitle: "section-06-clip-generation-motion",
  remove_or_rewrite_tie_in: "section-04-series-memory-and-episode-pipeline",
  repair_assembly: "section-09-assembly-export",
};

/** Repair actions that trigger PAID re-generation (credit-gated — spec §11.6). */
export const VERTICAL_DRAMA_PAID_REPAIR_ACTIONS: ReadonlySet<QcRepairAction> = new Set<QcRepairAction>([
  "regenerate_character",
  "regenerate_start_frame",
  "regenerate_clip",
]);

/** True when a repair action requires a credit-estimate confirmation. */
export function repairRequiresCreditConfirmation(action: QcRepairAction): boolean {
  return VERTICAL_DRAMA_PAID_REPAIR_ACTIONS.has(action);
}

/** Resolve the reachable repair section for a recommended action. */
export function repairEntryPointSection(action: QcRepairAction): VerticalDramaRepairSection {
  return VERTICAL_DRAMA_REPAIR_REACHABILITY[action];
}

/* -------------------------------------------------------------------------- */
/* QC stage → pipeline stage staleness (spec §11.2 immutable repair)           */
/* -------------------------------------------------------------------------- */

/** Map a QC stage to the pipeline stage a repair there invalidates. */
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

const PIPELINE_ORDER: VerticalDramaPipelineStage[] = [
  "normalize_series_input",
  "plan_episode_script",
  "update_character_visual_bible",
  "generate_or_import_character_refs",
  "storyboard_shotgrid",
  "start_frame_render_plan",
  "render_or_import_start_frames",
  "approve_start_frames",
  "dialogue_audio_plan",
  "video_motion_prompt_pack",
  "create_storyboard_review_project",
  "review_generate_repair_in_storyboard_review",
  "render_or_import_video_clips",
  "assemble_episode_manifest",
  "summarize_episode_to_series_memory",
];

/** Downstream pipeline stages made stale by a repair at a QC stage. */
export function stagesMadeStaleByRepair(qcStage: VerticalDramaQcStage): VerticalDramaPipelineStage[] {
  const pipelineStage = VERTICAL_DRAMA_QC_TO_PIPELINE_STAGE[qcStage];
  const i = PIPELINE_ORDER.indexOf(pipelineStage);
  return i < 0 ? [] : PIPELINE_ORDER.slice(i + 1);
}

/* -------------------------------------------------------------------------- */
/* QC evaluation input + evaluators                                            */
/* -------------------------------------------------------------------------- */

export interface QcEvaluationInput {
  stage: VerticalDramaQcStage;
  seriesId: string;
  episodeId: string;
  runId: string;
  aspectRatio?: string;
  clipDurationsSeconds?: number[];
  expectedTotalSeconds?: number;
  subShots?: {
    flagOn: boolean;
    maxPerShot: number;
    minSubShotSeconds: number;
    shots: Array<{
      parentShotNumber: number;
      mainShotDurationSeconds: number;
      subShots: Array<{ durationSeconds: number }>;
      /** Cut rhythm / identity / continuity preserved across the cuts. */
      cutRhythmOk?: boolean;
      identityContinuityOk?: boolean;
    }>;
  };
  characterIdentityConsistent?: boolean;
  wardrobeConsistent?: boolean;
  relationshipContinuityOk?: boolean;
  duplicateMemoryDetected?: boolean;
  forcedProductClaim?: boolean;
  promptOverlayAudioSeparated?: boolean;
  providerRouting?: VideoRoutingDecision;
  skillContractVersionMatches?: boolean;
  audioWithinDuration?: boolean;
  reviewFrameRolesValid?: boolean;
  assetsTenantOwnedAndFresh?: boolean;
  tieInUsage?: VerticalDramaTieInUsage;
  /** For the repair-queue check: does a repair queue exist for failed stages? */
  repairQueuePresent?: boolean;
}

interface CheckResult {
  issues: QcIssue[];
  repairs: QcRepair[];
}

let _issueSeq = 0;
function issueId(prefix: string): string {
  _issueSeq += 1;
  return `${prefix}-${_issueSeq}`;
}

function makeRepair(
  stage: VerticalDramaQcStage,
  action: QcRepairAction,
  instruction: string,
  autoRunnable: boolean,
): QcRepair {
  return { repairId: issueId("repair"), stage, action, instruction, autoRunnable };
}

/** Evaluate a single required check against the input. Pure. */
export function evaluateCheck(
  check: VerticalDramaQcCheckId,
  input: QcEvaluationInput,
): CheckResult {
  const stage = input.stage;
  const issues: QcIssue[] = [];
  const repairs: QcRepair[] = [];

  switch (check) {
    case "aspect_ratio_9_16": {
      if (input.aspectRatio && input.aspectRatio !== "9:16") {
        issues.push({
          issueId: issueId("aspect"),
          severity: "blocking",
          targetType: "episode",
          message: `Output aspect ratio ${input.aspectRatio} is not 9:16.`,
        });
        repairs.push(makeRepair(stage, stageRepairAction(stage), "Re-plan at 9:16 aspect ratio.", false));
      }
      break;
    }
    case "duration_sums": {
      const durations = input.clipDurationsSeconds ?? [];
      const total = durations.reduce((a, b) => a + b, 0);
      const expected = input.expectedTotalSeconds ?? 60;
      if (durations.length > 0 && Math.abs(total - expected) > 1e-6) {
        issues.push({
          issueId: issueId("duration"),
          severity: "error",
          targetType: "episode",
          message: `Clip durations sum to ${total}s but the episode target is ${expected}s.`,
        });
        repairs.push(makeRepair(stage, "adjust_sub_shot_timing", "Rebalance clip/sub-shot durations to sum to the episode target.", true));
      }
      break;
    }
    case "sub_shot_decomposition": {
      if (input.subShots?.flagOn) {
        for (const ps of input.subShots.shots) {
          const sum = ps.subShots.reduce((a, s) => a + s.durationSeconds, 0);
          if (Math.abs(sum - ps.mainShotDurationSeconds) > 1e-6) {
            issues.push({
              issueId: issueId("subsum"),
              severity: "error",
              targetType: "shot",
              targetId: String(ps.parentShotNumber),
              message: `Shot ${ps.parentShotNumber} sub-shots sum to ${sum}s but parent is ${ps.mainShotDurationSeconds}s.`,
            });
            repairs.push(makeRepair(stage, "adjust_sub_shot_timing", `Rebalance shot ${ps.parentShotNumber} sub-shot durations to sum to the parent.`, true));
          }
          for (const ss of ps.subShots) {
            if (ss.durationSeconds < input.subShots.minSubShotSeconds) {
              issues.push({
                issueId: issueId("subfloor"),
                severity: "warning",
                targetType: "shot",
                targetId: String(ps.parentShotNumber),
                message: `Shot ${ps.parentShotNumber} has a sub-shot below minSubShotSeconds (${ss.durationSeconds}s < ${input.subShots.minSubShotSeconds}s).`,
              });
              repairs.push(makeRepair(stage, "adjust_sub_shot_timing", `Raise shot ${ps.parentShotNumber} sub-shot durations to the minimum.`, true));
            }
          }
          if (ps.subShots.length > input.subShots.maxPerShot) {
            issues.push({
              issueId: issueId("subcount"),
              severity: "warning",
              targetType: "shot",
              targetId: String(ps.parentShotNumber),
              message: `Shot ${ps.parentShotNumber} has ${ps.subShots.length} sub-shots (> maxPerShot ${input.subShots.maxPerShot}).`,
            });
            repairs.push(makeRepair(stage, "repair_sub_shot", `Reduce shot ${ps.parentShotNumber} sub-shot count to at most maxPerShot.`, false));
          }
          if (ps.cutRhythmOk === false || ps.identityContinuityOk === false) {
            issues.push({
              issueId: issueId("subrhythm"),
              severity: "warning",
              targetType: "shot",
              targetId: String(ps.parentShotNumber),
              message: `Shot ${ps.parentShotNumber} cut rhythm / identity / continuity is choppy or stretched across cuts.`,
            });
            repairs.push(makeRepair(stage, "repair_sub_shot", `Repair shot ${ps.parentShotNumber} sub-shot camera setup / motion / transition for smooth continuity.`, false));
          }
        }
      }
      break;
    }
    case "character_identity_wardrobe": {
      if (input.characterIdentityConsistent === false || input.wardrobeConsistent === false) {
        issues.push({
          issueId: issueId("identity"),
          severity: "error",
          targetType: "character",
          message: "Character identity or wardrobe is inconsistent.",
        });
        repairs.push(makeRepair(stage, "regenerate_character", "Regenerate the character reference to restore identity/wardrobe consistency.", false));
      }
      break;
    }
    case "relationship_plot_continuity": {
      if (input.relationshipContinuityOk === false) {
        issues.push({
          issueId: issueId("continuity"),
          severity: "error",
          targetType: "series",
          message: "Relationship / plot continuity is broken across episodes.",
        });
        repairs.push(makeRepair(stage, "rewrite_script", "Rewrite the episode to restore relationship/plot continuity.", false));
      }
      break;
    }
    case "memory_no_duplicate_contradiction": {
      if (input.duplicateMemoryDetected) {
        issues.push({
          issueId: issueId("memory"),
          severity: "warning",
          targetType: "series",
          message: "Duplicate or contradictory episode memory detected.",
        });
        repairs.push(makeRepair(stage, "rewrite_script", "Reconcile the episode memory to remove the duplicate/contradiction.", false));
      }
      break;
    }
    case "no_forced_product_claim": {
      if (input.forcedProductClaim || input.tieInUsage?.claimsReview.unsupportedClaimsDetected) {
        issues.push({
          issueId: issueId("claim"),
          severity: "blocking",
          targetType: "tie_in",
          message: "A forced or unsupported product claim was detected.",
        });
        repairs.push(makeRepair(stage, "remove_or_rewrite_tie_in", "Remove or rewrite the tie-in to drop unsupported claims.", false));
      }
      break;
    }
    case "prompt_overlay_audio_separation": {
      if (input.promptOverlayAudioSeparated === false) {
        issues.push({
          issueId: issueId("separation"),
          severity: "blocking",
          targetType: "clip",
          message: "Prompt / overlay / audio content is not separated (disclosure or subtitle leaked into the prompt).",
        });
        repairs.push(makeRepair(stage, "repair_motion_prompt", "Move overlay/disclosure/audio copy out of the motion prompt payload.", false));
      }
      break;
    }
    case "provider_capability_policy": {
      const routing = input.providerRouting;
      if (routing && (routing.normalizedStatus === "blocked" || routing.blockingReasons.length > 0)) {
        issues.push({
          issueId: issueId("provider"),
          severity: routing.normalizedStatus === "blocked" ? "blocking" : "warning",
          targetType: "provider",
          message: `Provider capability/policy not honored: ${routing.blockingReasons.join("; ") || routing.normalizedStatus}.`,
        });
        repairs.push(makeRepair(stage, "reroute_provider", "Reroute to a capable provider or an allowed fallback.", false));
      }
      break;
    }
    case "repair_queue_present": {
      if (input.repairQueuePresent === false) {
        issues.push({
          issueId: issueId("queue"),
          severity: "warning",
          targetType: "episode",
          message: "A failed stage has no repair queue entry.",
        });
      }
      break;
    }
    case "skill_contract_version": {
      if (input.skillContractVersionMatches === false) {
        issues.push({
          issueId: issueId("contract"),
          severity: "error",
          targetType: "episode",
          message: "Skill contract version does not match the persisted episode run.",
        });
        repairs.push(makeRepair(stage, "rewrite_script", "Re-run the stage against the persisted skill contract version.", false));
      }
      break;
    }
    case "audio_subtitle_timing": {
      if (input.audioWithinDuration === false) {
        issues.push({
          issueId: issueId("audio"),
          severity: "warning",
          targetType: "audio",
          message: "Audio / subtitle timing exceeds the episode duration.",
        });
        repairs.push(makeRepair(stage, "adjust_audio_subtitle", "Trim or retime audio/subtitles to fit the episode duration.", true));
      }
      break;
    }
    case "review_frame_roles_valid": {
      if (input.reviewFrameRolesValid === false) {
        issues.push({
          issueId: issueId("frameroles"),
          severity: "error",
          targetType: "asset",
          message: "Storyboard Review start/stop frame roles are invalid.",
        });
        repairs.push(makeRepair(stage, "repair_start_frame_prompt", "Fix the start/stop frame role assignment before handoff.", false));
      }
      break;
    }
    case "assets_tenant_owned_fresh": {
      if (input.assetsTenantOwnedAndFresh === false) {
        issues.push({
          issueId: issueId("asset"),
          severity: "blocking",
          targetType: "asset",
          message: "A generated/provider asset is not tenant-owned or is stale/deleted.",
        });
        repairs.push(makeRepair(stage, "regenerate_start_frame", "Re-stage a fresh, tenant-owned asset.", false));
      }
      break;
    }
  }

  return { issues, repairs };
}

/** Default stage-appropriate repair action for aspect-ratio failures. */
function stageRepairAction(stage: VerticalDramaQcStage): QcRepairAction {
  switch (stage) {
    case "storyboard":
      return "repair_storyboard_shot";
    case "start_frame_prompt":
    case "start_frame_image":
      return "repair_start_frame_prompt";
    case "video_prompt":
    case "provider_routing":
    case "video_clip":
      return "repair_motion_prompt";
    case "assembly":
      return "repair_assembly";
    default:
      return "repair_motion_prompt";
  }
}

/* -------------------------------------------------------------------------- */
/* Score + report assembly (spec §16)                                          */
/* -------------------------------------------------------------------------- */

const SEVERITY_PENALTY: Record<QcIssue["severity"], number> = {
  info: 0,
  warning: 0.1,
  error: 0.3,
  blocking: 1,
};

/** Score in [0,1] from the issue list; blocking issues drive it toward 0. */
export function computeQcScore(issues: QcIssue[]): number {
  const penalty = issues.reduce((acc, i) => acc + SEVERITY_PENALTY[i.severity], 0);
  return Math.max(0, Math.min(1, 1 - penalty));
}

/** A QC stage passes only when it has no error/blocking issue. */
export function qcPassed(issues: QcIssue[]): boolean {
  return !issues.some((i) => i.severity === "error" || i.severity === "blocking");
}

/** True when a stage blocks paid generation (any blocking issue present). */
export function stageBlocksPaidGeneration(issues: QcIssue[]): boolean {
  return issues.some((i) => i.severity === "blocking");
}

/**
 * Evaluate a QC stage and assemble a full `VerticalDramaQcResult` (issues +
 * recommendedRepairs + passed + score). Pure — no DB. The `qcReportId` is a
 * deterministic hash so re-evaluating the same input is idempotent.
 */
export function runQcForStage(input: QcEvaluationInput): VerticalDramaQcResult {
  const checks = VERTICAL_DRAMA_QC_STAGE_CHECKS[input.stage] ?? [];
  const issues: QcIssue[] = [];
  const repairs: QcRepair[] = [];
  for (const check of checks) {
    const r = evaluateCheck(check, input);
    issues.push(...r.issues);
    repairs.push(...r.repairs);
  }

  const passed = qcPassed(issues);
  const score = computeQcScore(issues);
  const qcReportId = `qc-${input.stage}-${createHash("sha256")
    .update(`${input.seriesId}:${input.episodeId}:${input.runId}:${input.stage}:${issues.length}`)
    .digest("hex")
    .slice(0, 16)}`;

  return {
    qcReportId,
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    runId: input.runId,
    stage: input.stage,
    passed,
    score,
    issues,
    recommendedRepairs: repairs,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build a pre-filled repair descriptor for a recommended repair so the UI can
 * open a scoped repair dialog (or one-click run an autoRunnable repair) without
 * re-entering context (spec §11.6). Resolves the reachable section + whether a
 * credit-estimate confirmation is required.
 */
export interface PrefilledRepair {
  repairId: string;
  action: QcRepairAction;
  instruction: string;
  autoRunnable: boolean;
  targetStage: VerticalDramaQcStage;
  targetSection: VerticalDramaRepairSection;
  requiresCreditConfirmation: boolean;
  target: { artifactId?: string; shot?: number; clip?: number };
}

export function buildPrefilledRepair(
  repair: QcRepair,
  target: { artifactId?: string; shot?: number; clip?: number } = {},
): PrefilledRepair {
  return {
    repairId: repair.repairId,
    action: repair.action,
    instruction: repair.instruction,
    autoRunnable: repair.autoRunnable,
    targetStage: repair.stage,
    targetSection: repairEntryPointSection(repair.action),
    requiresCreditConfirmation: repairRequiresCreditConfirmation(repair.action),
    target,
  };
}

/* -------------------------------------------------------------------------- */
/* Owner-scoped persistence                                                    */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaQcOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  runId: number;
}

export class VerticalDramaQcService {
  /** Persist a QC report row (owner-stamped) to the searchable QC table. */
  async persistReport(
    owner: VerticalDramaQcOwner,
    result: VerticalDramaQcResult,
  ): Promise<VerticalDramaQcReportRow> {
    const [row] = await db
      .insert(verticalDramaQcReports)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: owner.runId,
        stage: result.stage,
        passed: result.passed,
        score: result.score,
        issues: result.issues,
        recommendedRepairs: result.recommendedRepairs,
      } as typeof verticalDramaQcReports.$inferInsert)
      .returning();
    return row as VerticalDramaQcReportRow;
  }

  /** List QC reports for an episode (owner-scoped, chronological). */
  async listReports(owner: Omit<VerticalDramaQcOwner, "runId">): Promise<VerticalDramaQcReportRow[]> {
    return db
      .select()
      .from(verticalDramaQcReports)
      .where(
        and(
          eq(verticalDramaQcReports.tenantId, owner.tenantId),
          eq(verticalDramaQcReports.userId, owner.userId),
          eq(verticalDramaQcReports.seriesId, owner.seriesId),
          eq(verticalDramaQcReports.episodeId, owner.episodeId),
        ),
      )
      .orderBy(asc(verticalDramaQcReports.createdAt), asc(verticalDramaQcReports.id));
  }
}

export const verticalDramaQcService = new VerticalDramaQcService();
