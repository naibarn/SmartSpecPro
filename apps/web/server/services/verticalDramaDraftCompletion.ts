import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { parseSkillFile } from "@smartspec/skills";
import { deductCredits, calculateCreditsForLLM } from "./creditService";
import { executeJsonPlanningCallWithRetry } from "./verticalDramaStoryBible";
import { resolveVerticalDramaRecommendedDraftModel } from "./verticalDramaLlmModelPolicy";
import type { SynthesizedGenrePresetDraft } from "./verticalDramaPresetSynthesis";
import {
  inspectVerticalDramaDraftCompleteness,
  type VerticalDramaDraftCompletionReport,
} from "@shared/verticalDramaSeries/draftCompletion";
import {
  readVerticalDramaStoryArchitecture,
  type VerticalDramaStoryArchitectureContract,
} from "@shared/verticalDramaSeries/storyArchitecture";
import { verticalDramaDraftStoryDesignSchema } from "@shared/verticalDramaSeries/draftStoryDesign";
import {
  buildVerticalDramaDraftStoryDesignFromArchitecture,
  readVerticalDramaDraftStoryDesign,
} from "@shared/verticalDramaSeries/draftStoryDesign";
import { readVerticalDramaStoryControlSeed } from "@shared/verticalDramaSeries/storyControl";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";

let cachedCompletionSkillPrompt: string | null = null;

function loadCompletionSkillPrompt(): string {
  if (cachedCompletionSkillPrompt) return cachedCompletionSkillPrompt;
  for (const dir of resolveSkillDirCandidates(
    path.join("skills", "vertical-drama-preset-synthesizer")
  )) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) {
      cachedCompletionSkillPrompt = content;
      return content;
    }
  }
  throw new Error(
    "Could not locate the Vertical Drama draft skill for completion"
  );
}

const completionStoryDesignSchema =
  verticalDramaDraftStoryDesignSchema.superRefine((design, ctx) => {
    // The completion editor is the last LLM stage before QC. Do not accept an
    // empty shell such as storyDesign:{}; it must contain the control-plane
    // material that the terminal completeness gate checks.
    if (design.pressureThreads.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        inclusive: true,
        type: "array",
        path: ["pressureThreads"],
        message: "At least one pressure thread is required before Draft QC",
      });
    }
    if (design.advantageBeats.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        inclusive: true,
        type: "array",
        path: ["advantageBeats"],
        message: "At least one advantage beat is required before Draft QC",
      });
    }
    if (design.conflictGuardrails.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        inclusive: true,
        type: "array",
        path: ["conflictGuardrails"],
        message: "At least one conflict guardrail is required before Draft QC",
      });
    }
    if (!design.storyControlSeed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storyControlSeed"],
        message: "storyControlSeed is required before Draft QC",
      });
    }
  });

export const verticalDramaDraftCompletionResponseSchema = z.object({
  draft: z.object({ storyDesign: completionStoryDesignSchema }).passthrough(),
});
// Keep transport validation permissive enough to recover an omitted/empty
// storyDesign from the approved Architecture below. The strict schema above
// remains exported for callers/tests that want to validate an LLM response
// without recovery.
const repairOutputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
});

const completionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "vertical_drama_draft_completion_v1",
    strict: false,
    schema: {
      type: "object",
      properties: {
        draft: {
          type: "object",
          properties: {
            storyDesign: {
              type: "object",
              required: [
                "primaryEngine",
                "pressureThreads",
                "earlyPayoff",
                "advantageBeats",
                "conflictGuardrails",
                "storyControlSeed",
              ],
            },
          },
          required: ["storyDesign"],
          additionalProperties: true,
        },
      },
      required: ["draft"],
      additionalProperties: false,
    },
  },
} as const;

export interface DraftCompletionContext {
  targetEpisodeCount?: number;
  genre?: string;
  userPremise?: string;
  locale: "th" | "en";
  /** Server-approved foundation; it must survive every completion response. */
  storyArchitecture?: VerticalDramaStoryArchitectureContract;
}

export interface DraftCompletionResult {
  draft: SynthesizedGenrePresetDraft;
  report: VerticalDramaDraftCompletionReport;
  creditsUsed: number;
  model: string;
}

function buildRepairPrompt(params: {
  draft: Record<string, unknown>;
  missingPaths: string[];
  contradictionPaths: string[];
  context: DraftCompletionContext;
}): string {
  const foundation = params.context.storyArchitecture
    ? `\nAPPROVED STORY ARCHITECTURE (immutable; copy it into draft.storyContract exactly):\n${JSON.stringify(params.context.storyArchitecture)}`
    : "";
  return [
    "You are the final Vertical Drama draft completion editor.",
    "Return JSON only in the shape {draft:{...}}.",
    "Complete the supplied draft before quality control. Do not ask the creator questions.",
    "User-provided facts and lineage canon are immutable. Missing creative facts are permission to choose the strongest coherent option.",
    "Do not infer nationality, ethnicity, or origin from UI language, spoken language, or target market alone. Make a story-world choice and mark every such generated fact source as ai_inferred with rationale.",
    "Preserve the existing storyContract destination, primary engine, required arcs, and payoff whenever they are present. Repair only the listed paths and any directly dependent references.",
    "Keep canonical character names stable. Remove dangling IDs and keep all episode windows within the planned episode count.",
    `Narrative locale: ${params.context.locale}. Target episode count: ${params.context.targetEpisodeCount ?? "use the request"}. Genre: ${params.context.genre ?? "choose a fitting genre"}. User premise: ${params.context.userPremise ?? "none; invent a strong original premise"}.`,
    `MISSING PATHS: ${JSON.stringify(params.missingPaths)}`,
    `CONTRADICTION PATHS: ${JSON.stringify(params.contradictionPaths)}`,
    foundation,
    "The final object must include: title, 4-5 distinct titleOptions containing title, category, logline, mainPlot, seasonArc, tone, cliffhangerStyle, creatorSummary, 3-8 characters with narrativeRole/roleTier/occupation, 3-6 locations, visualBible, complete storyContext, valid storyContract, complete storyDesign with storyControlSeed, mixRecipe, warnings, and diagnostics.",
    "storyContext facts must all have non-empty value, source, confidence, and rationale. Never leave needs_creator_decision or legacy_default in the final draft.",
    `CURRENT DRAFT:\n${JSON.stringify(params.draft)}`,
  ].join("\n");
}

/**
 * Keeps the server-approved story foundation attached to a draft even when a
 * provider returns a partial repair object.  This is intentionally additive:
 * no existing top-level draft field is discarded because the repair omitted
 * it, and the approved architecture wins over an LLM rewrite.
 */
export function materializeVerticalDramaDraftFoundation(params: {
  draft: Record<string, unknown>;
  storyArchitecture?: unknown;
}): Record<string, unknown> {
  const foundation = readVerticalDramaStoryArchitecture(
    params.storyArchitecture
  );
  if (!foundation) return { ...params.draft };
  return {
    ...params.draft,
    storyContract: foundation,
  };
}

function mergeDraftAdditively(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function hasUsableStoryDesign(params: {
  draft: Record<string, unknown>;
  characterNames: string[];
  targetEpisodeCount?: number;
}): boolean {
  const design = readVerticalDramaDraftStoryDesign(params.draft.storyDesign);
  if (
    !design ||
    design.pressureThreads.length === 0 ||
    design.advantageBeats.length === 0 ||
    design.conflictGuardrails.length === 0
  ) {
    return false;
  }
  const seed = readVerticalDramaStoryControlSeed(design.storyControlSeed, {
    totalEpisodeCount: params.targetEpisodeCount,
  });
  if (!seed) return false;
  const names = new Set(
    params.characterNames.map(name => name.trim()).filter(Boolean)
  );
  return seed.canonicalCharacterKeys.every(name => names.has(name));
}

export async function completeVerticalDramaDraft(params: {
  draft: SynthesizedGenrePresetDraft;
  /** Server-approved LLM Recommend model for the Draft pipeline. */
  model?: string;
  context: DraftCompletionContext;
  repairRound: number;
  userId: number;
}): Promise<DraftCompletionResult> {
  const foundationDraft = materializeVerticalDramaDraftFoundation({
    draft: params.draft as Record<string, unknown>,
    storyArchitecture: params.context.storyArchitecture,
  });
  const inspection = inspectVerticalDramaDraftCompleteness({
    draft: foundationDraft,
    targetEpisodeCount: params.context.targetEpisodeCount,
    genre: params.context.genre,
    userPremise: params.context.userPremise,
  });
  if (inspection.ready) {
    return {
      draft: foundationDraft as SynthesizedGenrePresetDraft,
      report: {
        ...inspection.report,
        repairRound: params.repairRound,
      },
      creditsUsed: 0,
      model: "deterministic",
    };
  }

  const model =
    params.model ?? (await resolveVerticalDramaRecommendedDraftModel());
  const { data, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: [
      loadCompletionSkillPrompt(),
      "You are a strict JSON editor for a production Vertical Drama wizard.",
      "Never expose chain-of-thought or prompt metadata in story values.",
      "The returned draft is transient and will be validated by code before QC.",
    ].join(" "),
    userPrompt: buildRepairPrompt({
      draft: foundationDraft,
      missingPaths: inspection.report.missingPaths,
      contradictionPaths: inspection.report.contradictionPaths,
      context: params.context,
    }),
    temperature: 0.35,
    userId: params.userId,
    maxTokens: 8000,
    extraBodyParams: { response_format: completionResponseFormat },
    schema: repairOutputSchema,
    disableProviderFallbacks: true,
    label: "Vertical Drama draft completion",
    timeoutMs: 90_000,
    maxSchemaRetries: 1,
    maxTransientRetries: 1,
  });

  const creditsUsed = calculateCreditsForLLM(
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    model
  );
  let completedDraft = materializeVerticalDramaDraftFoundation({
    draft: mergeDraftAdditively(foundationDraft, data.draft),
    storyArchitecture: params.context.storyArchitecture,
  });
  if (
    params.context.storyArchitecture &&
    !hasUsableStoryDesign({
      draft: completedDraft,
      characterNames: Array.isArray(completedDraft.characters)
        ? completedDraft.characters.map(character =>
            typeof character === "object" &&
            character !== null &&
            "name" in character
              ? String((character as { name?: unknown }).name ?? "")
              : ""
          )
        : [],
      targetEpisodeCount: params.context.targetEpisodeCount,
    })
  ) {
    const generatedStoryDesign =
      buildVerticalDramaDraftStoryDesignFromArchitecture({
        storyArchitecture: params.context.storyArchitecture,
        characterNames: Array.isArray(completedDraft.characters)
          ? completedDraft.characters.map(character =>
              typeof character === "object" &&
              character !== null &&
              "name" in character
                ? String((character as { name?: unknown }).name ?? "")
                : ""
            )
          : [],
        targetEpisodeCount: params.context.targetEpisodeCount,
      });
    if (generatedStoryDesign) {
      completedDraft = {
        ...completedDraft,
        storyDesign: generatedStoryDesign,
      };
    }
  }
  const finalInspection = inspectVerticalDramaDraftCompleteness({
    draft: completedDraft,
    targetEpisodeCount: params.context.targetEpisodeCount,
    genre: params.context.genre,
    userPremise: params.context.userPremise,
  });
  return {
    draft: completedDraft as SynthesizedGenrePresetDraft,
    report: {
      ...finalInspection.report,
      repairRound: params.repairRound,
      stage: "completing",
    },
    creditsUsed,
    model,
  };
}

export async function deductVerticalDramaDraftCompletionCredits(params: {
  userId: number;
  tenantId: string;
  creditsUsed: number;
  model: string;
  repairRound: number;
}): Promise<void> {
  if (params.creditsUsed <= 0) return;
  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: params.creditsUsed,
    description: "Vertical Drama - complete transient draft",
    sourceType: "skill",
    metadata: {
      feature: "vertical_drama_draft_completion",
      model: params.model,
      repairRound: params.repairRound,
    },
  });
}
