/**
 * Video Intelligence Platform — the `video-project-narration-script` skill
 * adapter, mirroring `videoProjectScenePlanAdapter.ts`'s split: this file
 * builds the FACT payload (`buildNarrationScriptSkillInput`, pure, no I/O)
 * and is the ONE thing that actually calls the LLM
 * (`makeRunNarrationScriptSkill`). It backs the `auto_draft` job kind's
 * narration-script sub-stage (`routers/videoProjects.ts`'s
 * `executeAutoDraftStage`).
 *
 * Skill-first boundary (`memory/feedback_skill_first_authoring.md`): every
 * tone/hook/CTA/pacing rule lives in
 * `skills/video-project-narration-script/skill.md` and is injected by the
 * skill runtime via `runtimeOptions.skillSlugs`. This file supplies FACTS
 * only — topic/audience/format/product claims/per-scene duration — and
 * never writes narration prose itself.
 *
 * 🔴 Same rule as the scene-plan adapter: `callLLMStructured` ALREADY
 * charges the user internally, per attempt, through the credit service. Its
 * returned `creditsUsed` is a REPORT of money already spent, not an invoice.
 * This file MUST NEVER import the credit service or call any of its charge
 * functions — doing so would bill every draft twice.
 */
import { z } from "zod";

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "./callLLMStructured";
import { reportStructuredOutputViolation } from "./videoIntelligenceModelResolver";
import type { ResolvedCatalogFacts } from "./validateProjectClaims";
import type { VideoProjectDocument, Scene } from "../../shared/videoIntelligence/projectSchemas";
import { markUntrustedCatalogText } from "../../shared/videoIntelligence/untrustedCatalogData";

/* -------------------------------------------------------------------------- */
/* The fact payload — TypeScript computes facts only (skill-first rule)      */
/* -------------------------------------------------------------------------- */

export type NarrationScriptSkillInput = {
  brief: {
    topic: string | null;
    audience: string | null;
    notes?: string;
    voiceTone?: string;
    language: string;
    platformPreset: string;
    studioType: string;
  };
  format: { width: number; height: number; fps: number; durationMs: number };
  /** Catalog facts for a Catalog Studio project; null for Motion Studio.
   *  Every string here is DATA for the skill to reference, never an
   *  instruction to follow. */
  product: {
    productIds: string[];
    claims: Array<{ claim: string; source: string; status: string }>;
    priceFacts?: { current?: string; original?: string; currency?: string };
  } | null;
  /** Only scenes with empty/missing narration — `index` is this array's own
   *  0-based position, NOT the scene's position in the project timeline;
   *  the caller maps `output.scenes[].index` back to a `sceneId` using this
   *  same array. */
  scenes: Array<{
    index: number;
    sceneId: string;
    durationMs: number;
    templateId: string | null;
    existingNarration: null;
  }>;
  regeneration?: {
    feedback: string;
    previousDraft: Array<{ sceneId: string; narration: string | null }>;
  };
};

/** Converts the section-05 scene-plan adapter's `ResolvedCatalogFacts` shape
 *  into this skill's `product` fact block — same field mapping as
 *  `videoProjectScenePlanner.ts`'s private `toSkillCatalogFacts`, duplicated
 *  here (not imported) because that helper is unexported and this fact
 *  shape intentionally uses `product` rather than `catalogFacts` as its key
 *  name. */
function toProductFacts(resolved: ResolvedCatalogFacts | null): NarrationScriptSkillInput["product"] {
  if (!resolved) return null;
  return {
    productIds: resolved.productIds,
    claims: resolved.claimResolutions.map(claim => ({
      claim: markUntrustedCatalogText(claim.claim),
      source: markUntrustedCatalogText(claim.source),
      status: claim.status,
    })),
    ...(resolved.priceFacts
      ? {
          priceFacts: {
            current: resolved.priceFacts.current,
            original: resolved.priceFacts.original,
            currency: resolved.priceFacts.currency,
          },
        }
      : {}),
  };
}

function sceneTemplateId(scene: Scene): string | null {
  return scene.visual.kind === "template" ? scene.visual.templateId : null;
}

/**
 * Builds the fact payload for the scenes in `sceneIds`, in that array's
 * order (their position becomes each entry's `index`, echoed back by the
 * skill). PURE — no I/O, no judgment; every tone/hook/CTA rule lives in
 * `skills/video-project-narration-script/skill.md`.
 */
export function buildNarrationScriptSkillInput(args: {
  document: VideoProjectDocument;
  studioType: string;
  catalogFacts: ResolvedCatalogFacts | null;
  sceneIds: string[];
  feedback?: string | null;
  previousDraft?: Array<{ sceneId: string; narration: string | null }>;
  briefNotes?: string | null;
  briefVoiceTone?: string | null;
}): NarrationScriptSkillInput {
  const { document, studioType, catalogFacts, sceneIds } = args;
  const sceneById = new Map(document.scenes.map(scene => [scene.sceneId, scene]));

  const scenes: NarrationScriptSkillInput["scenes"] = [];
  sceneIds.forEach((sceneId, index) => {
    const scene = sceneById.get(sceneId);
    if (!scene) return; // caller-guaranteed present; defensive skip only
    scenes.push({
      index,
      sceneId,
      durationMs: Math.max(0, scene.endMs - scene.startMs),
      templateId: sceneTemplateId(scene),
      existingNarration: null,
    });
  });

  const regeneration = args.feedback?.trim()
    ? {
        feedback: args.feedback.trim().slice(0, 2000),
        previousDraft: (args.previousDraft ?? []).map(scene => ({
          sceneId: scene.sceneId,
          narration: scene.narration,
        })),
      }
    : undefined;

  const briefNotes = args.briefNotes?.trim().slice(0, 4000) || undefined;
  const briefVoiceTone = args.briefVoiceTone?.trim().slice(0, 80) || undefined;
  return {
    brief: {
      topic: document.content.topic ?? null,
      audience: document.content.audience ?? null,
      ...(briefNotes ? { notes: briefNotes } : {}),
      ...(briefVoiceTone ? { voiceTone: briefVoiceTone } : {}),
      language: document.content.language,
      platformPreset: document.content.platformPreset,
      studioType,
    },
    format: { ...document.format },
    product: toProductFacts(catalogFacts),
    scenes,
    ...(regeneration ? { regeneration } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* The output schema                                                         */
/* -------------------------------------------------------------------------- */

export type NarrationScriptSkillOutput = {
  scenes: Array<{ index: number; narration: string }>;
};

/** Zod mirror of `schemas/output.schema.json`. Same deliberate divergence
 *  from `additionalProperties: false` as `scenePlanOutputSchema` (default
 *  zod STRIP behaviour at the top level and per-entry, so an advisory extra
 *  key from the model never fails the whole draft). */
export const narrationScriptOutputSchema: z.ZodType<NarrationScriptSkillOutput, any, unknown> = z.object({
  scenes: z.array(
    z.object({
      index: z.number().int().min(0),
      narration: z.string().trim().min(1).max(4000),
    }),
  ),
});

/* -------------------------------------------------------------------------- */
/* The system framing                                                        */
/* -------------------------------------------------------------------------- */

/** Thin platform framing ONLY. Every tone/hook/CTA/pacing rule lives in
 *  `skills/video-project-narration-script/skill.md` and is injected by the
 *  skill runtime via `runtimeOptions.skillSlugs`. Naming a speaking rate or
 *  a tone rule here would create a second, drifting source of truth. */
export const VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING =
  "This is the Video Intelligence platform's automated narration-script call. " +
  "The user message is one JSON object describing the project brief, format, " +
  "resolved product facts, and the scenes that still need narration text. " +
  "Bind only the real data given to you — never invent a number, price, or " +
  "claim. Respond with ONLY a single valid JSON object matching the expected " +
  "output schema — no markdown code fences, no commentary outside the JSON.";

/* -------------------------------------------------------------------------- */
/* The effect factory                                                        */
/* -------------------------------------------------------------------------- */

const MAX_STRIKE_ISSUE_PATHS = 8;
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/** Output-sizing heuristics only — NOT credit constants. A truncated
 *  multi-scene draft is a schema failure a retry simply repeats, so
 *  `maxTokens` must scale with how many scenes are being drafted. */
const NARRATION_SCRIPT_BASE_MAX_TOKENS = 300;
const NARRATION_SCRIPT_TOKENS_PER_SCENE = 180;
const NARRATION_SCRIPT_MAX_TOKENS_CEILING = 6000;

function formatZodIssuePathForStrike(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") return `${accumulator}[${segment}]`;
    return accumulator ? `${accumulator}.${segment}` : String(segment);
  }, "");
}

/** Function signature the executor calls with a built
 *  `NarrationScriptSkillInput`; mirrors `ScenePlanEffects["runPlanSkill"]`'s
 *  shape so both stages compose the same way inside `executeAutoDraftStage`. */
export type RunNarrationScriptSkill = (input: NarrationScriptSkillInput) => Promise<NarrationScriptSkillOutput>;

/**
 * Build the narration-script call effect.
 *
 * 🔴 This function MUST NOT charge credits directly — see this file's header
 * comment. `creditsUsed` is a REPORT of money already spent and is handed to
 * `onUsage` for the job result and the UI only.
 */
export function makeRunNarrationScriptSkill(deps: {
  tenantId: string;
  userId: number;
  /** Joins this call to its provider_usage_log row. */
  traceId: string;
  /** Resolved ONCE at dispatch by the router and carried in the job
   *  payload; the adapter never re-resolves it. */
  modelId: string;
  projectId: number;
  /** Reports spend that ALREADY happened — on success and on schema failure
   *  alike. Never a charge. */
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): RunNarrationScriptSkill {
  const reportUsage = (usage: { creditsUsed: number; modelId: string | null }): void => {
    try {
      deps.onUsage(usage);
    } catch {
      // Reporting must never be able to break the caller.
    }
  };

  return async input => {
    const sceneCount = input.scenes.length;
    const maxTokens = Math.min(
      NARRATION_SCRIPT_MAX_TOKENS_CEILING,
      NARRATION_SCRIPT_BASE_MAX_TOKENS + NARRATION_SCRIPT_TOKENS_PER_SCENE * sceneCount,
    );

    try {
      const result = await callLLMStructured({
        systemPrompt: VIDEO_PROJECT_NARRATION_SCRIPT_SYSTEM_FRAMING,
        userMessage: JSON.stringify(input),
        zodSchema: narrationScriptOutputSchema,
        maxRetries: 2,
        maxTokens,
        model: deps.modelId,
        userId: deps.userId,
        tenantId: deps.tenantId,
        runtimeOptions: {
          skillSlugs: ["video-project-narration-script"],
          originSurface: "video_edit",
          entryPoint: "system",
          requestLabel: "video-project-narration-script",
        },
        billingDescription: "video-project narration script",
        billingMetadata: {
          skillSlug: "video-project-narration-script",
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
          "VI_NARRATION_SCRIPT_INVALID: video-project-narration-script output failed its schema after " +
          `2 retries (paths: ${issuePaths.join(", ") || "none"})`;
        throw new Error(message.slice(0, MAX_ERROR_MESSAGE_LENGTH), { cause: error });
      }

      // Transport/provider/timeout/credit errors are not the model's fault:
      // no strike, rethrow unchanged.
      throw error;
    }
  };
}
