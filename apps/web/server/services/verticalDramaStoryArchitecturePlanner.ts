import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
import {
  buildVerticalDramaStoryArchitecturePrompt,
  evaluateVerticalDramaStoryArchitecture,
  verticalDramaStoryArchitectureContractSchema,
  type VerticalDramaStoryArchitectureContract,
  type VerticalDramaStoryArchitectureDiagnostic,
} from "@shared/verticalDramaSeries/storyArchitecture";
import {
  renderAudienceAgeRatingBlock,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import { buildVerticalDramaDraftLanguageContractPrompt } from "@shared/verticalDramaSeries/draftLanguageContract";
import {
  buildVerticalDramaDialogueLanguageProfilePrompt,
  type VerticalDramaDialogueLanguageProfile,
} from "@shared/verticalDramaSeries/dialogueLanguageProfile";
import type { VerticalDramaSeriesLineage } from "@shared/verticalDramaSeries/lineage";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveVerticalDramaRecommendedDraftModel } from "./verticalDramaLlmModelPolicy";
import { chargeVerticalDramaLlmCall } from "./verticalDramaLlmBilling";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-story-architecture-planner"
);
const MAX_REPAIR_ROUNDS = 2;
const MAX_PROMPT_BYTES = 120_000;

export interface VerticalDramaStoryArchitecturePlannerInput {
  userId: number;
  tenantId?: string;
  seriesId?: number;
  /** Production callers provide this so every successful physical call is billed separately. */
  billingRunKey?: string;
  /** Server-approved LLM Recommend model for the Draft pipeline. */
  model?: string;
  locale: "th" | "en";
  userPremise?: string;
  genreHint?: string;
  seriesTitleHint?: string;
  toneHint?: string;
  selectedCategories: string[];
  selectedPresets: Array<{
    id: string;
    title: string;
    category: string;
    logline: string;
    mainPlot: string;
    seasonArc: string;
  }>;
  targetEpisodeCount?: number;
  audienceAgeRating?: AudienceAgeRating;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile;
  lineageContext?: VerticalDramaSeriesLineage;
  /** Existing contract to repair before create-time persistence. */
  existingContract?: unknown;
}

export interface VerticalDramaStoryArchitecturePlannerResult {
  contract: VerticalDramaStoryArchitectureContract | null;
  diagnostics: VerticalDramaStoryArchitectureDiagnostic[];
  repairRounds: number;
  promptTokens: number;
  completionTokens: number;
  creditsUsed: number;
  model: string;
}

let cachedSystemPrompt: string | null = null;
let cachedOutputSchema: Record<string, unknown> | null = null;

function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) {
      cachedSystemPrompt = content;
      return content;
    }
  }
  throw new Error(
    "Could not locate vertical-drama-story-architecture-planner skill"
  );
}

function loadSkillOutputSchema(): Record<string, unknown> {
  if (cachedOutputSchema) return cachedOutputSchema;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const schemaPath = path.join(dir, "output.schema.json");
    if (!fs.existsSync(schemaPath)) continue;
    const parsed = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        "vertical-drama-story-architecture-planner output schema must be a JSON object"
      );
    }
    cachedOutputSchema = parsed as Record<string, unknown>;
    return cachedOutputSchema;
  }
  throw new Error(
    "Could not locate vertical-drama-story-architecture-planner output schema"
  );
}

export function normalizeVerticalDramaStoryArchitectureTransport(
  value: unknown
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  let candidate = value as Record<string, unknown>;
  // Some providers still wrap a structured response even when the prompt says
  // to return one top-level contract. Unwrap transport envelopes only; never
  // invent missing story content.
  for (const key of [
    "storyArchitecture",
    "story_architecture",
    "architecture",
    "contract",
    "data",
    "result",
  ]) {
    const nested = candidate[key];
    if (
      nested &&
      typeof nested === "object" &&
      !Array.isArray(nested) &&
      !("contractVersion" in candidate) &&
      !("premiseAnchor" in candidate)
    ) {
      candidate = nested as Record<string, unknown>;
      break;
    }
  }

  const copyAliases = (
    value: unknown,
    aliases: Record<string, string>
  ): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const result = { ...(value as Record<string, unknown>) };
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (!(canonical in result) && alias in result) {
        result[canonical] = result[alias];
      }
    }
    return result;
  };
  const normalizeArray = (
    value: unknown,
    aliases: Record<string, string>
  ): unknown[] =>
    Array.isArray(value) ? value.map(item => copyAliases(item, aliases)) : [];

  candidate = copyAliases(candidate, {
    contract_version: "contractVersion",
    premise_anchor: "premiseAnchor",
    required_arc_types: "requiredArcTypes",
    audience_promise: "audiencePromise",
    protagonist_arc: "protagonistArc",
    primary_engine: "primaryEngine",
    arc_bundles: "arcBundles",
    reality_failure_model: "realityFailureModel",
    promise_payoff_map: "promisePayoffMap",
    story_guardrails: "storyGuardrails",
  });
  if ("audiencePromise" in candidate) {
    candidate.audiencePromise = copyAliases(candidate.audiencePromise, {
      genre_promise: "genrePromise",
      emotional_promise: "emotionalPromise",
      core_question: "coreQuestion",
    });
  }
  if ("protagonistArc" in candidate) {
    const protagonistArc = copyAliases(candidate.protagonistArc, {
      starting_state: "startingState",
      short_term_goal: "shortTermGoal",
      internal_need: "internalNeed",
      long_term_destination: "longTermDestination",
      transformation_stages: "transformationStages",
      end_state: "endState",
    });
    if ("transformationStages" in protagonistArc) {
      protagonistArc.transformationStages = normalizeArray(
        protagonistArc.transformationStages,
        { belief_before: "beliefBefore", episode_window: "episodeWindow" }
      );
    }
    candidate.protagonistArc = protagonistArc;
  }
  if ("primaryEngine" in candidate) {
    const primaryEngine = copyAliases(candidate.primaryEngine, {
      repeatable_episode_mechanism: "repeatableEpisodeMechanism",
      escalation_ladder: "escalationLadder",
    });
    if ("escalationLadder" in primaryEngine) {
      primaryEngine.escalationLadder = normalizeArray(
        primaryEngine.escalationLadder,
        { turning_point: "turningPoint", episode_window: "episodeWindow" }
      );
    }
    candidate.primaryEngine = primaryEngine;
  }
  if ("arcBundles" in candidate) {
    candidate.arcBundles = normalizeArray(candidate.arcBundles, {
      starting_state: "startingState",
      turning_points: "turningPoints",
      failure_or_cost: "failureOrCost",
      end_state: "endState",
      episode_window: "episodeWindow",
    });
  }
  if ("realityFailureModel" in candidate) {
    candidate.realityFailureModel = copyAliases(candidate.realityFailureModel, {
      real_world_constraints: "realWorldConstraints",
      failed_attempts: "failedAttempts",
      lessons_learned: "lessonsLearned",
    });
  }
  if ("destination" in candidate) {
    candidate.destination = copyAliases(candidate.destination, {
      season_endpoint: "seasonEndpoint",
      long_term_endpoint: "longTermEndpoint",
      final_image: "finalImage",
    });
  }
  if ("promisePayoffMap" in candidate) {
    candidate.promisePayoffMap = normalizeArray(candidate.promisePayoffMap, {
      promise_id: "promiseId",
      payoff_window: "payoffWindow",
    });
  }

  if (candidate.contractVersion === "1" || candidate.contractVersion === "v1") {
    return { ...candidate, contractVersion: 1 };
  }
  return candidate;
}

const architectureResponseSchema = {
  safeParse(value: unknown) {
    return verticalDramaStoryArchitectureContractSchema.safeParse(
      normalizeVerticalDramaStoryArchitectureTransport(value)
    );
  },
};

function buildArchitectureOutputChecklist(): string {
  return [
    "ARCHITECTURE OUTPUT CONTRACT (MANDATORY):",
    "Return exactly one top-level JSON object; never wrap it in storyArchitecture, contract, data, result, markdown, or commentary.",
    "Top-level required keys: contractVersion, premiseAnchor, requiredArcTypes, audiencePromise, protagonistArc, primaryEngine, arcBundles, realityFailureModel, destination, promisePayoffMap, storyGuardrails.",
    'contractVersion must be the number 1 (not "1", not "v1").',
    "requiredArcTypes must be an array containing only: romance, academic, professional_innovation, underdog_identity, mystery, family, survival, revenge, comedy, other.",
    "audiencePromise requires genrePromise, emotionalPromise, coreQuestion.",
    "protagonistArc requires startingState, shortTermGoal, internalNeed, longTermDestination, transformationStages, endState; transformationStages must contain at least 3 objects with phase, beliefBefore, change, evidence.",
    "primaryEngine requires statement, repeatableEpisodeMechanism, escalationLadder; escalationLadder must contain at least 3 objects with phase, pressure, cost, turningPoint.",
    "arcBundles must contain at least 1 object with id, label, required, startingState, turningPoints (at least 2 strings), failureOrCost, payoff, endState.",
    "realityFailureModel requires realWorldConstraints, failedAttempts, lessonsLearned; destination requires seasonEndpoint, longTermEndpoint, horizon (season|series|epilogue), finalImage, meaning.",
    "promisePayoffMap requires at least 1 object with promiseId, setup, payoff; storyGuardrails requires at least 1 non-empty string.",
    "Keep the JSON compact: concise creator-readable strings, no duplicate alternatives, no prose outside JSON.",
  ].join("\n");
}

export function assertStoryArchitecturePlannerSkillSupportsContract(
  systemPrompt: string
): void {
  const required = [
    "STORY ARCHITECTURE CONTRACT",
    "long-term destination",
    "transformation stages",
    "promise-to-payoff",
  ];
  const missing = required.filter(marker => !systemPrompt.includes(marker));
  if (missing.length > 0) {
    throw new Error(
      `vertical-drama-story-architecture-planner skill is missing contract markers: ${missing.join(", ")}`
    );
  }
}

function bounded(value: string | undefined, max = 900): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function buildArchitecturePrompt(
  input: VerticalDramaStoryArchitecturePlannerInput,
  mode: "plan" | "repair",
  currentContract?: unknown,
  diagnostics: VerticalDramaStoryArchitectureDiagnostic[] = []
): string {
  const payload = {
    locale: input.locale,
    narrativeLanguage: input.locale === "th" ? "Thai" : "English",
    userPremise: bounded(input.userPremise, 12_000),
    genreHint: bounded(input.genreHint, 500),
    seriesTitleHint: bounded(input.seriesTitleHint, 180),
    toneHint: bounded(input.toneHint, 300),
    selectedCategories: input.selectedCategories.slice(0, 8),
    selectedPresets: input.selectedPresets.slice(0, 5).map(preset => ({
      id: preset.id,
      title: preset.title,
      category: preset.category,
      logline: preset.logline.slice(0, 900),
      mainPlot: preset.mainPlot.slice(0, 1400),
      seasonArc: preset.seasonArc.slice(0, 1000),
    })),
    targetEpisodeCount: input.targetEpisodeCount ?? 10,
    lineageContext: input.lineageContext,
  };
  const repairBlock =
    mode === "repair"
      ? [
          "ARCHITECTURE REPAIR MODE:",
          "Return a complete replacement contract, not a patch.",
          "Preserve every explicit user premise, canon, setting, character identity, language, market, and episode-count constraint.",
          "Repair only the listed foundation gaps and keep the primary story promise dominant.",
          `CURRENT CONTRACT: ${JSON.stringify(currentContract)}`,
          `FOUNDATION DIAGNOSTICS: ${JSON.stringify(diagnostics)}`,
        ].join("\n")
      : "PLAN MODE: create the first complete Story Architecture Contract from the input.";

  const prompt = [
    buildVerticalDramaStoryArchitecturePrompt(),
    buildVerticalDramaDraftLanguageContractPrompt({
      narrativeLocale: input.locale,
      dialogueLanguageProfile: input.dialogueLanguageProfile,
    }),
    buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: input.locale,
      profile: input.dialogueLanguageProfile,
    }),
    input.audienceAgeRating
      ? renderAudienceAgeRatingBlock(input.audienceAgeRating)
      : "",
    repairBlock,
    buildArchitectureOutputChecklist(),
    "INPUT PAYLOAD:",
    JSON.stringify(payload),
    "Return the complete Story Architecture Contract as compact JSON only.",
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
  if (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new Error("Story Architecture prompt exceeds its bounded input size");
  }
  return prompt;
}

export async function planVerticalDramaStoryArchitecture(
  input: VerticalDramaStoryArchitecturePlannerInput
): Promise<VerticalDramaStoryArchitecturePlannerResult> {
  let model =
    input.model ?? (await resolveVerticalDramaRecommendedDraftModel());
  const systemPrompt = loadSkillSystemPrompt();
  assertStoryArchitecturePlannerSkillSupportsContract(systemPrompt);
  const initialEvaluation =
    input.existingContract !== undefined
      ? evaluateVerticalDramaStoryArchitecture({
          contract: input.existingContract,
          genre: input.genreHint,
          userPremise: input.userPremise,
          targetEpisodeCount: input.targetEpisodeCount,
        })
      : null;
  if (initialEvaluation?.ready && initialEvaluation.contract) {
    return {
      contract: initialEvaluation.contract,
      diagnostics: [],
      repairRounds: 0,
      promptTokens: 0,
      completionTokens: 0,
      creditsUsed: 0,
      model,
    };
  }
  let contract = initialEvaluation?.contract ?? null;
  let diagnostics = initialEvaluation?.diagnostics ?? [];
  let repairRounds = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let creditsUsed = 0;

  // A seeded contract is already a creator-visible draft. Repair it directly
  // instead of spending a fresh plan call first. Keep the same two-repair
  // bound used by the initial composition pipeline.
  const hasRepairSeed = Boolean(initialEvaluation?.contract);
  const maxAttempts = hasRepairSeed ? MAX_REPAIR_ROUNDS : MAX_REPAIR_ROUNDS + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const mode = hasRepairSeed || attempt > 0 ? "repair" : "plan";
    const result: {
      data: VerticalDramaStoryArchitectureContract;
      response: {
        usage?: {
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
        } | null;
      };
      model: string;
    } =
      await executeJsonPlanningCallWithRetry<VerticalDramaStoryArchitectureContract>(
        {
          model,
          systemPrompt,
          userPrompt: buildArchitecturePrompt(
            input,
            mode,
            contract,
            diagnostics
          ),
          temperature: mode === "plan" ? 0.55 : 0.35,
          userId: input.userId,
          maxTokens: 9000,
          retryMaxTokens: 16000,
          schema: architectureResponseSchema,
          extraBodyParams: {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "vertical_drama_story_architecture_v1",
                schema: loadSkillOutputSchema(),
                strict: false,
              },
            },
          },
          disableProviderFallbacks: true,
          maxTransientRetries: 0,
          maxSchemaRetries: 2,
          schemaRetryContract: buildArchitectureOutputChecklist(),
          label:
            mode === "plan"
              ? "Vertical Drama story architecture"
              : `Vertical Drama story architecture repair ${attempt}`,
        }
      );
    promptTokens += result.response.usage?.prompt_tokens ?? 0;
    completionTokens += result.response.usage?.completion_tokens ?? 0;
    model = result.model ?? model;
    if (input.billingRunKey) {
      const call = await chargeVerticalDramaLlmCall({
        userId: input.userId,
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        runId: input.billingRunKey,
        attemptKey: `${input.billingRunKey}:architecture:${attempt}`,
        skillSlug: "vertical-drama-story-architecture-planner",
        stage: mode === "plan" ? "foundation" : "foundation_repair",
        round: mode === "plan" ? 0 : repairRounds + 1,
        attempt,
        model,
        inputTokens: result.response.usage?.prompt_tokens ?? 0,
        outputTokens: result.response.usage?.completion_tokens ?? 0,
        metadata: { feature: "vertical_drama_story_architecture" },
      });
      creditsUsed += call.creditsUsed;
    }
    contract = result.data;
    const evaluated = evaluateVerticalDramaStoryArchitecture({
      contract,
      genre: input.genreHint,
      userPremise: input.userPremise,
      targetEpisodeCount: input.targetEpisodeCount,
    });
    diagnostics = evaluated.diagnostics;
    if (evaluated.ready) break;
    if (mode === "repair") repairRounds += 1;
  }

  return {
    contract,
    diagnostics,
    repairRounds,
    promptTokens,
    completionTokens,
    creditsUsed,
    model,
  };
}
