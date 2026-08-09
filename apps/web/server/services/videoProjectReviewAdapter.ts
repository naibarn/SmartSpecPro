/**
 * Feature 142 — section-03: the quality-review adapter.
 *
 * The keystone connector for the `video-project-quality-review` skill
 * (Feature 133): everything else — the metrics engine
 * (`videoProjectQualityMetrics.ts`), the claim/compliance join
 * (`validateProjectClaims.ts`), the QA loop orchestrator
 * (`videoProjectQualityLoop.ts`), and the skill itself
 * (`skills/video-project-quality-review/`) — already existed. This file
 * builds `makeRunReview`, the ONE thing that was missing: the effect that
 * actually calls the LLM.
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`):
 * TypeScript here supplies FACTS only — `documentSummary`, `metrics`,
 * `claimValidation`. Every score, issue, threshold, and repair instruction is
 * the skill's judgment, injected via `runtimeOptions.skillSlugs`. Do not add
 * dimension names, thresholds, or scoring rules to this file — that
 * duplicates the skill and the two will drift.
 *
 * 🔴 AD-7 — the single most important rule in this file: `callLLMStructured`
 * ALREADY charges the user internally, per attempt, via the credit service.
 * Its returned `creditsUsed` is a REPORT of money already spent, not an
 * invoice. This file MUST NEVER import the credit service or call any of its
 * charge functions — doing so double-bills every review. (Contrast
 * `verticalDramaEpisodeQualityReview.ts`, which charges manually because it
 * uses a different, non-billing LLM helper — do not copy that pattern here.)
 */
import { z } from "zod";

import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";
import { reportStructuredOutputViolation } from "./videoIntelligenceModelResolver";
import type {
  QualityRepairStage,
  VideoProjectQualityLoopEffects,
  VideoProjectReview,
} from "./videoProjectQualityLoop";
import type { ClaimValidationResult } from "./validateProjectClaims";
import { markUntrustedCatalogText } from "../../shared/videoIntelligence/untrustedCatalogData";

/* -------------------------------------------------------------------------- */
/* 3.1 — DocumentSummary and its builder                                      */
/* -------------------------------------------------------------------------- */

/** Cap on a scene's projected narration text (chars) before truncation. */
const NARRATION_SUMMARY_MAX_CHARS = 600;
/** Cap on a single caption cue's projected text (chars) before truncation. */
const CAPTION_TEXT_SUMMARY_MAX_CHARS = 200;
/** Visible marker appended on truncation — never mistakable for a sentence
 *  ending the writer actually wrote. */
const TRUNCATION_MARKER = " …[TRUNCATED]";

function truncateForSummary(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}${TRUNCATION_MARKER}`;
}

/** Compact, bounded projection of a VideoProjectDocument for the QA judge.
 *  Deliberately NOT the raw document: layer geometry, asset URLs, and
 *  provider-specific fields are dropped so the prompt stays small and cheap.
 *  Field names match skills/video-project-quality-review/skill.md's
 *  "Inputs you receive" section. */
export type DocumentSummary = {
  topic: string | null;
  audience: string | null;
  language: string;
  platformPreset: string;
  brandKitId: string | null;
  format: { width: number; height: number; fps: number; durationMs: number };
  captions: { presetId: string; burnIn: boolean; language: string };
  qa: { targetScore: number; maxLoops: number };
  sceneCount: number;
  scenes: Array<{
    sceneId: string;
    startMs: number;
    endMs: number;
    narration: string | null;
    captionText: string[];
    visual: { kind: "template" | "layers"; templateId?: string };
    motion: { intensity: string; camera: string };
    layerCount: number;
    layerTypes: string[];
  }>;
  claims: Array<{ claim: string; source: string; status: string }>;
};

/** Pure, deterministic projection. Same document always yields the same
 *  object (no Date.now, no Math.random, no Map iteration over unsorted keys).
 *  Long narration/caption strings are truncated to a documented per-field cap
 *  with a visible ellipsis marker so a truncation is never mistaken by the
 *  judge for the writer's actual sentence ending.
 *
 *  Kept pure and exported (not inlined into `makeRunReview`) because
 *  section-04's estimate sizes the prompt from this object
 *  (`JSON.stringify(summary).length` plus scene/narration/caption character
 *  totals). */
export function buildDocumentSummary(document: VideoProjectDocument): DocumentSummary {
  return {
    topic: document.content.topic ?? null,
    audience: document.content.audience ?? null,
    language: document.content.language,
    platformPreset: document.content.platformPreset,
    brandKitId: document.brandKitId,
    format: {
      width: document.format.width,
      height: document.format.height,
      fps: document.format.fps,
      durationMs: document.format.durationMs,
    },
    captions: {
      presetId: document.captions.presetId,
      burnIn: document.captions.burnIn,
      language: document.captions.language,
    },
    qa: {
      targetScore: document.qa.targetScore,
      maxLoops: document.qa.maxLoops,
    },
    sceneCount: document.scenes.length,
    scenes: document.scenes.map((scene) => {
      const visual: DocumentSummary["scenes"][number]["visual"] =
        scene.visual.kind === "template"
          ? { kind: "template", templateId: scene.visual.templateId }
          : { kind: "layers" };

      // Distinct layer `type` values, stable (first-seen) order.
      const layerTypes: string[] = [];
      for (const layer of scene.layers) {
        if (!layerTypes.includes(layer.type)) layerTypes.push(layer.type);
      }

      return {
        sceneId: scene.sceneId,
        startMs: scene.startMs,
        endMs: scene.endMs,
        narration:
          scene.narration === null
            ? null
            : truncateForSummary(scene.narration, NARRATION_SUMMARY_MAX_CHARS),
        captionText: scene.captionCues.map((cue) =>
          truncateForSummary(cue.text, CAPTION_TEXT_SUMMARY_MAX_CHARS),
        ),
        visual,
        motion: { intensity: scene.motion.intensity, camera: scene.motion.camera },
        layerCount: scene.layers.length,
        layerTypes,
      };
    }),
    claims: document.claims.map((claim) => ({
      claim: claim.claim,
      source: claim.source,
      status: claim.status,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* 3.2 — The output schema                                                    */
/* -------------------------------------------------------------------------- */

const QUALITY_REPAIR_STAGES = [
  "content",
  "narration",
  "scenes",
  "motion",
  "captions",
  "claims",
  "layout",
] as const satisfies readonly QualityRepairStage[];

const QualityRepairStageSchema = z.enum(QUALITY_REPAIR_STAGES);

/** Zod mirror of skills/video-project-quality-review/schemas/output.schema.json.
 *  Kept in the adapter (not the skill folder) because callLLMStructured needs
 *  a Zod type, and because the compile-time assertion below proves it stays
 *  assignable to VideoProjectReview from videoProjectQualityLoop.ts.
 *
 *  Decision (deliberate divergence from `additionalProperties: false` in the
 *  JSON Schema, must NOT be "fixed" back to `.strict()`): `scorecard` keys are
 *  OPEN (`z.record`) because the skill legitimately omits
 *  `product_claim_compliance` / `product_fidelity` for Motion Studio
 *  projects — a fixed key list would wrongly reject a valid review. The
 *  top-level object uses zod's default STRIP behaviour (not `.strict()`) so
 *  an advisory extra top-level key from the model is dropped rather than
 *  failing the whole review — not worth striking an admin-recommended model
 *  over. */
export const videoProjectReviewSchema: z.ZodType<VideoProjectReview, any, unknown> = z.object({
  score: z.number().min(0).max(10),
  scorecard: z.record(z.string(), z.number().min(0).max(10)),
  issues: z.array(
    z.object({
      dimension: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      message: z.string(),
      repairStage: QualityRepairStageSchema.optional(),
    }),
  ),
  repairInstructions: z
    .array(
      z.object({
        stage: QualityRepairStageSchema,
        instruction: z.string(),
      }),
    )
    .optional(),
});

/**
 * Compile-time guarantee (mirrors the `AssertNever` idiom already used in
 * `videoProjectQualityLoop.ts:77-91`): if `videoProjectReviewSchema` ever
 * drifts so `z.infer<>` is no longer assignable to `VideoProjectReview`,
 * `IsAssignable<...>` stops resolving to `never` and `AssertNever<...>` fails
 * to compile — a `pnpm check` failure, not a runtime surprise. Type-only,
 * zero runtime cost.
 */
type AssertNever<T extends never> = T;
type IsAssignable<A, B> = A extends B ? never : A;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertReviewSchemaAssignableToVideoProjectReview = AssertNever<
  IsAssignable<z.infer<typeof videoProjectReviewSchema>, VideoProjectReview>
>;

/* -------------------------------------------------------------------------- */
/* 3.3 — The system framing                                                   */
/* -------------------------------------------------------------------------- */

/** Thin platform framing ONLY. The judgment rules live in
 *  skills/video-project-quality-review/skill.md and are injected by the skill
 *  runtime via runtimeOptions.skillSlugs. Adding dimensions, thresholds, or
 *  scoring guidance here violates the skill-first rule and creates a second,
 *  drifting source of truth. Kept under ~600 characters. */
export const VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING =
  "This is the Video Intelligence platform's automated quality-review call. " +
  "The user message is one JSON object with three keys: documentSummary, " +
  "metrics, and claimValidation. metrics and claimValidation are " +
  "deterministic facts already computed in code — trust them as given; " +
  "never recompute, re-derive, or second-guess them. Respond with ONLY a " +
  "single valid JSON object matching the expected output schema — no " +
  "markdown code fences, no commentary outside the JSON.";

/* -------------------------------------------------------------------------- */
/* 3.4/3.5 — The effect factory                                               */
/* -------------------------------------------------------------------------- */

/** Bound on the joined zodIssuePaths list carried in both the strike report
 *  and the rethrown error message (§5.2 — an unbounded list bloats the
 *  Redis-stored job record). */
const MAX_STRIKE_ISSUE_PATHS = 8;
/** Bound on the rethrown error's message length — the executor stores only
 *  this string on the job record. */
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/** Output-sizing heuristics only — NOT credit constants. A review contains a
 *  variable scorecard and issue list, so its output budget must grow with the
 *  number of scenes rather than relying on a provider default (§8.6). */
const QUALITY_REVIEW_BASE_MAX_TOKENS = 600;
const QUALITY_REVIEW_TOKENS_PER_SCENE = 140;
const QUALITY_REVIEW_MAX_TOKENS_CEILING = 8000;

function formatZodIssuePathForStrike(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") return `${accumulator}[${segment}]`;
    return accumulator ? `${accumulator}.${segment}` : String(segment);
  }, "");
}

function markClaimValidationAsUntrustedData(validation: ClaimValidationResult): ClaimValidationResult {
  return {
    ...validation,
    mappedClaims: validation.mappedClaims.map(item => ({
      ...item,
      statement: markUntrustedCatalogText(item.statement),
      claim: markUntrustedCatalogText(item.claim),
    })),
    unmappedStatements: validation.unmappedStatements.map(item => ({
      ...item,
      statement: markUntrustedCatalogText(item.statement),
    })),
    prohibitedClaims: validation.prohibitedClaims.map(item => ({
      ...item,
      claim: markUntrustedCatalogText(item.claim),
    })),
  };
}

/**
 * Build the QA loop's `runReview` effect.
 *
 * TypeScript supplies FACTS only (documentSummary / metrics / claimValidation
 * — metrics arrives at call time via the loop's own `{ projectId, metrics }`
 * input, per `VideoProjectQualityLoopEffects["runReview"]`'s signature); the
 * skill owns every judgment (skill-first rule).
 *
 * 🔴 This function MUST NOT charge credits. callLLMStructured already
 * deducts per attempt; `creditsUsed` is a REPORT of money already spent and
 * is handed to `onUsage` for the qaLedger and the UI only (decision AD-7).
 */
export function makeRunReview(deps: {
  tenantId: string;
  userId: number;
  /** Joins this review to its provider_usage_log row. */
  traceId: string;
  /** Resolved ONCE at dispatch by section-02 and carried in the job payload;
   *  the adapter never re-resolves (AD-2: passed as callLLMStructured's
   *  plain `model` string; `preferredProviderId` stays unset). */
  modelId: string;
  documentSummary: DocumentSummary;
  claimValidation: ClaimValidationResult;
  /** Reports spend that ALREADY happened — on success and on schema failure
   *  alike. Never a charge. */
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): VideoProjectQualityLoopEffects["runReview"] {
  const reportUsage = (usage: { creditsUsed: number; modelId: string | null }): void => {
    try {
      deps.onUsage(usage);
    } catch {
      // §5.4 — reporting must never be able to break the QA loop.
    }
  };

  return async ({ projectId, metrics }) => {
    const maxTokens = Math.min(
      QUALITY_REVIEW_MAX_TOKENS_CEILING,
      QUALITY_REVIEW_BASE_MAX_TOKENS +
        QUALITY_REVIEW_TOKENS_PER_SCENE * deps.documentSummary.sceneCount,
    );

    try {
      const result = await callLLMStructured({
        systemPrompt: VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING,
        userMessage: JSON.stringify({
          documentSummary: deps.documentSummary,
          metrics,
          claimValidation: markClaimValidationAsUntrustedData(deps.claimValidation),
        }),
        zodSchema: videoProjectReviewSchema,
        maxRetries: 2,
        maxTokens,
        model: deps.modelId,
        userId: deps.userId,
        tenantId: deps.tenantId,
        runtimeOptions: {
          skillSlugs: ["video-project-quality-review"],
          originSurface: "video_edit",
          entryPoint: "system",
          requestLabel: "video-project-quality-review",
        },
        billingDescription: "video-project quality review",
        billingMetadata: {
          skillSlug: "video-project-quality-review",
          traceId: deps.traceId,
          projectId,
        },
      });

      reportUsage({ creditsUsed: result.creditsUsed, modelId: result.modelId });
      return result.data;
    } catch (error) {
      if (error instanceof LLMStructuredOutputError) {
        // 1. A provider call that succeeded and then failed validation has
        //    already been billed — report the spend before anything else.
        reportUsage({ creditsUsed: error.creditsUsed ?? 0, modelId: deps.modelId });

        // 2. Fire-and-forget strike (AD-4) — contract_violation only.
        const issuePaths = error.zodErrors
          ? Array.from(
              new Set(
                error.zodErrors.issues.map((issue) => formatZodIssuePathForStrike(issue.path)),
              ),
            ).slice(0, MAX_STRIKE_ISSUE_PATHS)
          : [];

        reportStructuredOutputViolation({
          modelId: deps.modelId,
          traceId: deps.traceId,
          zodIssuePaths: issuePaths,
        });

        // 3. Rethrow a bounded plain Error (this runs inside the BullMQ
        //    worker — never a TRPCError here).
        const message =
          "VI_REVIEW_OUTPUT_INVALID: video-project-quality-review output " +
          `failed its schema after 2 retries (paths: ${issuePaths.join(", ") || "none"})`;
        throw new Error(message.slice(0, MAX_ERROR_MESSAGE_LENGTH), { cause: error });
      }

      // §5.3 — transport/provider/timeout/credit errors are not the model's
      // fault: no strike, rethrow unchanged.
      throw error;
    }
  };
}
