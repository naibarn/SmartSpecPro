/**
 * The skill-call seam for `video-project-motion-director`, mirroring
 * `videoProjectScenePlanAdapter.ts`'s split: `videoProjectMotionDirector.ts`
 * stays importable with zero module mocks (pure, effect-injected), and this
 * file is the ONE thing that actually calls the LLM.
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): every
 * variation rule lives in `skills/video-project-motion-director/skill.md`
 * and is injected by the skill runtime via `runtimeOptions.skillSlugs`.
 * This file's system framing names no template and no heuristic.
 *
 * 🔴 Same rule as every other adapter in this feature area:
 * `callLLMStructured` ALREADY charges the user internally, per attempt.
 * This file MUST NEVER import the credit service or call any of its charge
 * functions.
 */
import { z } from "zod";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";
import { reportStructuredOutputViolation } from "./videoIntelligenceModelResolver";
import type {
  MotionDirectorEffects,
  MotionDirectorSkillOutput,
} from "./videoProjectMotionDirector";

/* -------------------------------------------------------------------------- */
/* The output schema                                                          */
/* -------------------------------------------------------------------------- */

const motionCandidateOutputSchema = z.object({
  templateId: z.string().trim().min(1),
  // Keep one malformed candidate from discarding valid options in the same
  // response. The motion planner still validates every value against the
  // selected template's real paramsSchema before persistence.
  templateParams: z.record(z.string(), z.unknown()).catch({}),
  motion: z
    .object({
      intensity: z.enum(["low", "medium", "high"]),
      camera: z.string().trim().min(1),
    })
    .catch({ intensity: "medium", camera: "static" }),
  label: z.string().trim().min(1).catch("Motion option"),
  rationale: z.string().catch(""),
});

/** Zod mirror of `schemas/output.schema.json`. Same deliberate STRIP
 *  divergence from `additionalProperties: false` as
 *  `videoProjectScenePlanAdapter.ts`'s `scenePlanOutputSchema` — an
 *  advisory extra key is dropped, never worth striking a model over. */
export const motionDirectorOutputSchema: z.ZodType<MotionDirectorSkillOutput, any, unknown> = z.object({
  scenes: z.array(
    z.object({
      sceneId: z.string().trim().min(1),
      candidates: z.array(motionCandidateOutputSchema).min(1),
    }),
  ),
  summary: z.string(),
});

type AssertNever<T extends never> = T;
type IsAssignable<A, B> = A extends B ? never : A;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type AssertMotionDirectorOutputSchemaAssignableToSkillOutput = AssertNever<
  IsAssignable<z.infer<typeof motionDirectorOutputSchema>, MotionDirectorSkillOutput>
>;

/* -------------------------------------------------------------------------- */
/* The system framing                                                         */
/* -------------------------------------------------------------------------- */

export const VIDEO_PROJECT_MOTION_DIRECTOR_SYSTEM_FRAMING =
  "This is the Video Intelligence platform's automated motion-variant call. " +
  "The user message is one JSON object describing the project brief, format, " +
  "the templates available to choose from, how many variants to propose per " +
  "scene, the scenes needing motion options, and any brand kit context. " +
  "Propose genuinely different candidates per scene, bind only the real " +
  "data given to you into template parameters, and never invent a number, " +
  "price, or claim. Include one scenes entry for every requested scene and " +
  "at least the requested minimum number of candidates in each entry. Every " +
  "candidate must have a string templateId, an object templateParams, a " +
  "motion object with intensity and camera, and string label/rationale. " +
  "For procedural templates, keep events short and use relative frame numbers. " +
  "Respond with ONLY a single valid JSON object matching the expected output " +
  "schema — no markdown code fences, no commentary outside the JSON.";

/* -------------------------------------------------------------------------- */
/* The effect factory                                                         */
/* -------------------------------------------------------------------------- */

const MAX_STRIKE_ISSUE_PATHS = 8;
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/** Output-sizing heuristics only — a truncated multi-scene, multi-candidate
 *  response is a schema failure a retry simply repeats, so `maxTokens` must
 *  scale with scene count AND the requested candidate ceiling. */
const MOTION_DIRECTOR_BASE_MAX_TOKENS = 1_000;
const MOTION_DIRECTOR_TOKENS_PER_CANDIDATE = 420;
const MOTION_DIRECTOR_MAX_TOKENS_CEILING = 12_000;

function formatZodIssuePathForStrike(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") return `${accumulator}[${segment}]`;
    return accumulator ? `${accumulator}.${segment}` : String(segment);
  }, "");
}

/**
 * Build the motion director's `runMotionDirectorSkill` effect.
 *
 * TypeScript supplies FACTS only (the `MotionDirectorSkillInput` the
 * planner already built); the skill owns every variation judgment
 * (skill-first rule).
 *
 * 🔴 This function MUST NOT charge credits directly — same rule as
 * `videoProjectScenePlanAdapter.ts`'s `makeRunPlanSkill`.
 */
export function makeRunMotionDirectorSkill(deps: {
  tenantId: string;
  userId: number;
  traceId: string;
  modelId: string;
  projectId: number;
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): MotionDirectorEffects["runMotionDirectorSkill"] {
  const reportUsage = (usage: { creditsUsed: number; modelId: string | null }): void => {
    try {
      deps.onUsage(usage);
    } catch {
      // Reporting must never be able to break the planner.
    }
  };

  return async input => {
    const sceneCount = input.scenes.length;
    const candidateCeiling = sceneCount * Math.max(1, input.variantsPerScene.max);
    const maxTokens = Math.min(
      MOTION_DIRECTOR_MAX_TOKENS_CEILING,
      MOTION_DIRECTOR_BASE_MAX_TOKENS + MOTION_DIRECTOR_TOKENS_PER_CANDIDATE * candidateCeiling,
    );

    try {
      const result = await callLLMStructured({
        systemPrompt: VIDEO_PROJECT_MOTION_DIRECTOR_SYSTEM_FRAMING,
        userMessage: JSON.stringify(input),
        zodSchema: motionDirectorOutputSchema,
        maxRetries: 2,
        maxTokens,
        model: deps.modelId,
        userId: deps.userId,
        tenantId: deps.tenantId,
        runtimeOptions: {
          skillSlugs: ["video-project-motion-director"],
          originSurface: "video_edit",
          entryPoint: "system",
          requestLabel: "video-project-motion-director",
        },
        billingDescription: "video-project motion variants",
        billingMetadata: {
          skillSlug: "video-project-motion-director",
          traceId: deps.traceId,
          projectId: deps.projectId,
        },
      });

      reportUsage({ creditsUsed: result.creditsUsed, modelId: result.modelId });
      return result.data;
    } catch (error) {
      if (error instanceof LLMStructuredOutputError) {
        reportUsage({ creditsUsed: error.creditsUsed ?? 0, modelId: deps.modelId });

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

        const message =
          "VI_MOTION_VARIANT_INVALID: video-project-motion-director output failed its schema after " +
          `2 retries (paths: ${issuePaths.join(", ") || "none"})`;
        throw new Error(message.slice(0, MAX_ERROR_MESSAGE_LENGTH), { cause: error });
      }

      throw error;
    }
  };
}
