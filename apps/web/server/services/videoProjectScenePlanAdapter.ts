/**
 * Feature 142 — section-05: the scene-plan adapter.
 *
 * The skill-call seam for `video-project-scene-plan`, mirroring section-03's
 * `videoProjectReviewAdapter.ts` split: `videoProjectScenePlanner.ts` stays
 * importable with zero module mocks (pure, effect-injected), and this file
 * is the ONE thing that actually calls the LLM.
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): every
 * selection rule lives in `skills/video-project-scene-plan/skill.md` and is
 * injected by the skill runtime via `runtimeOptions.skillSlugs`. This file's
 * `VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING` names no template and no
 * heuristic — naming one here would create a second, drifting source of
 * truth.
 *
 * 🔴 The single most important rule in this file: the structured-call helper
 * (`callLLMStructured`) ALREADY charges the user internally, per attempt,
 * through the credit service. Its returned `creditsUsed` is a REPORT of
 * money already spent, not an invoice. This file MUST NEVER import the
 * credit service or call any of its charge functions — doing so would bill
 * every plan twice.
 */
import { z } from "zod";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";
import { reportStructuredOutputViolation } from "./videoIntelligenceModelResolver";
import type { ScenePlanEffects, ScenePlanSkillOutput } from "./videoProjectScenePlanner";

/* -------------------------------------------------------------------------- */
/* The output schema                                                          */
/* -------------------------------------------------------------------------- */

const scenePlanOutputMotionSchema = z.object({
  intensity: z.enum(["low", "medium", "high"]),
  camera: z.string().trim().min(1),
});

/** Zod mirror of `schemas/output.schema.json`, used as `callLLMStructured`'s
 *  `zodSchema`.
 *
 *  Decision (deliberate divergence from `additionalProperties: false` in the
 *  JSON Schema, must NOT be "fixed" back to `.strict()`): both the top-level
 *  object and each scene entry use zod's default STRIP behaviour so an
 *  advisory extra key from the model is dropped rather than failing the
 *  whole plan — not worth striking an admin-recommended model over (same
 *  documented decision as `videoProjectReviewAdapter.ts`'s
 *  `videoProjectReviewSchema`). */
export const scenePlanOutputSchema: z.ZodType<ScenePlanSkillOutput, any, unknown> = z.object({
  scenes: z.array(
    z.object({
      sceneId: z.string().trim().min(1),
      templateId: z.string().trim().min(1),
      templateParams: z.record(z.string(), z.unknown()),
      startMs: z.number().int().min(0),
      endMs: z.number().int().min(0),
      motion: scenePlanOutputMotionSchema.optional(),
      rationale: z.string(),
      onScreenStatements: z.array(z.string()),
    }),
  ),
  summary: z.string(),
});

/**
 * Compile-time guarantee (mirrors the `AssertNever` idiom used throughout
 * this feature — see `videoProjectQualityLoop.ts:77-91`): if
 * `scenePlanOutputSchema` ever drifts so `z.infer<>` is no longer assignable
 * to `ScenePlanSkillOutput`, this stops compiling. Type-only, zero runtime
 * cost.
 */
type AssertNever<T extends never> = T;
type IsAssignable<A, B> = A extends B ? never : A;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertScenePlanOutputSchemaAssignableToScenePlanSkillOutput = AssertNever<
  IsAssignable<z.infer<typeof scenePlanOutputSchema>, ScenePlanSkillOutput>
>;

/* -------------------------------------------------------------------------- */
/* The system framing                                                         */
/* -------------------------------------------------------------------------- */

/** Thin platform framing ONLY. Every selection rule lives in
 *  `skills/video-project-scene-plan/skill.md` and is injected by the skill
 *  runtime via `runtimeOptions.skillSlugs`. Naming a template id or a
 *  selection heuristic here violates the skill-first rule and creates a
 *  second, drifting source of truth. Kept under ~600 characters. */
export const VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING =
  "This is the Video Intelligence platform's automated scene-planning call. " +
  "The user message is one JSON object describing the project brief, format, " +
  "the templates available to choose from, the current layer budget, the " +
  "scenes needing a visual treatment, and any catalog facts. Bind only the " +
  "real data given to you into template parameters — never invent a number, " +
  "price, or claim. Respond with ONLY a single valid JSON object matching " +
  "the expected output schema — no markdown code fences, no commentary " +
  "outside the JSON.";

/* -------------------------------------------------------------------------- */
/* The effect factory                                                         */
/* -------------------------------------------------------------------------- */

/** Bound on the joined zodIssuePaths list carried in both the strike report
 *  and the rethrown error message (an unbounded list bloats the
 *  Redis-stored job record). */
const MAX_STRIKE_ISSUE_PATHS = 8;
/** Bound on the rethrown error's message length — the executor stores only
 *  this string on the job record. */
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/** Output-sizing heuristics only — NOT credit constants. A truncated
 *  multi-scene plan is a schema failure a retry simply repeats, so
 *  `maxTokens` must scale with how many scenes are being planned. */
const SCENE_PLAN_BASE_MAX_TOKENS = 800;
const SCENE_PLAN_TOKENS_PER_SCENE = 220;
const SCENE_PLAN_MAX_TOKENS_CEILING = 8000;

function formatZodIssuePathForStrike(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") return `${accumulator}[${segment}]`;
    return accumulator ? `${accumulator}.${segment}` : String(segment);
  }, "");
}

/**
 * Build the planner's `runPlanSkill` effect.
 *
 * TypeScript supplies FACTS only (the `ScenePlanSkillInput` the planner
 * already built); the skill owns every template-selection judgment
 * (skill-first rule).
 *
 * 🔴 This function MUST NOT charge credits directly. The structured-call
 * helper already bills per attempt internally; `creditsUsed` is a REPORT of
 * money already spent and is handed to `onUsage` for the job result and the
 * UI only (same decision as the quality-review adapter).
 */
export function makeRunPlanSkill(deps: {
  tenantId: string;
  userId: number;
  /** Joins this call to its provider_usage_log row. */
  traceId: string;
  /** Resolved ONCE at dispatch by section-02 and carried in the job payload;
   *  the adapter never re-resolves it (passed as `callLLMStructured`'s plain
   *  `model` string; `preferredProviderId` stays unset). */
  modelId: string;
  projectId: number;
  /** Reports spend that ALREADY happened — on success and on schema failure
   *  alike. Never a charge. */
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): ScenePlanEffects["runPlanSkill"] {
  const reportUsage = (usage: { creditsUsed: number; modelId: string | null }): void => {
    try {
      deps.onUsage(usage);
    } catch {
      // Reporting must never be able to break the planner.
    }
  };

  return async input => {
    const plannableSceneCount = input.plannableScenes.length;
    const maxTokens = Math.min(
      SCENE_PLAN_MAX_TOKENS_CEILING,
      SCENE_PLAN_BASE_MAX_TOKENS + SCENE_PLAN_TOKENS_PER_SCENE * plannableSceneCount,
    );

    try {
      const result = await callLLMStructured({
        systemPrompt: VIDEO_PROJECT_SCENE_PLAN_SYSTEM_FRAMING,
        userMessage: JSON.stringify(input),
        zodSchema: scenePlanOutputSchema,
        maxRetries: 2,
        maxTokens,
        model: deps.modelId,
        userId: deps.userId,
        tenantId: deps.tenantId,
        runtimeOptions: {
          skillSlugs: ["video-project-scene-plan"],
          originSurface: "video_edit",
          entryPoint: "system",
          requestLabel: "video-project-scene-plan",
        },
        billingDescription: "video-project scene plan",
        billingMetadata: {
          skillSlug: "video-project-scene-plan",
          traceId: deps.traceId,
          projectId: deps.projectId,
        },
      });

      reportUsage({ creditsUsed: result.creditsUsed, modelId: result.modelId });
      return result.data;
    } catch (error) {
      if (error instanceof LLMStructuredOutputError) {
        // 1. A provider call that succeeded and then failed validation has
        //    already been billed — report the spend before anything else.
        reportUsage({ creditsUsed: error.creditsUsed ?? 0, modelId: deps.modelId });

        // 2. Fire-and-forget strike — contract_violation only.
        const issuePaths = error.zodErrors
          ? Array.from(
              new Set(error.zodErrors.issues.map(issue => formatZodIssuePathForStrike(issue.path))),
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
          "VI_PLAN_PARAMS_INVALID: video-project-scene-plan output failed its schema after " +
          `2 retries (paths: ${issuePaths.join(", ") || "none"})`;
        throw new Error(message.slice(0, MAX_ERROR_MESSAGE_LENGTH), { cause: error });
      }

      // Transport/provider/timeout/credit errors are not the model's fault:
      // no strike, rethrow unchanged.
      throw error;
    }
  };
}
