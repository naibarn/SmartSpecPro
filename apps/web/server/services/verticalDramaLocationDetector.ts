/**
 * Vertical Drama Series — Location Visual Bible whole-series location
 * detection.
 *
 * Location-side companion to `verticalDramaCharacterVariantPlanner.ts`'s
 * whole-season character variant/twin planning: invokes the
 * `vertical-drama-location-detector` skill
 * (`apps/web/skills/vertical-drama-location-detector/`) via a direct
 * `executeWithFallback` LLM call (through `executeJsonPlanningCallWithRetry`,
 * the same shared retry/validation helper every other Vertical Drama
 * planning stage uses) to decide, for the WHOLE season at once, every
 * distinct physical setting the story establishes — then reconciles the
 * result into the existing `vertical_drama_locations` roster.
 *
 * Mirrors `verticalDramaCharacterVariantPlanner.ts`'s
 * loadSkillSystemPrompt -> buildUserPrompt -> check-credits -> resolve-model
 * -> call (with retry) -> validate -> deduct-credits convention exactly,
 * minus all variant/twin branching — locations are a flat roster with no
 * variant/twin relationship concept (already decided; see
 * `verticalDramaLocationReconciliation.ts`'s own doc comment). The skill
 * simply echoes back an existing `location_key` verbatim when it recognizes
 * an already-known location, instead of the `existing*CharacterKey`-style
 * marker scheme the character planner needs for its richer variant/twin
 * relationships.
 *
 * `buildLocationDetectionPlannerUserPrompt` does ONLY fact assembly (the
 * current location roster + the whole season's episode content, as labeled
 * plain-text lines, via the shared `formatStoryScriptEpisode` formatter —
 * reused byte-identically, not reinvented) — every creative/instructional
 * decision (which settings are genuinely distinct, what key to assign, what
 * to write for `description`) is authored entirely by the skill itself.
 *
 * `reconcileLocationDetectionPlan` is a THIN adapter only — it never
 * reimplements stable-key matching/upsert logic itself. It maps this plan's
 * `locations[]` onto the exact camelCase `VerticalDramaStoryboardLocationGroup[]`
 * contract shape and delegates entirely to the EXISTING, already-proven
 * `reconcileEpisodeLocations` (`verticalDramaLocationReconciliation.ts`,
 * already used by the per-episode storyboard pipeline) — the single place
 * that owns stable-key matching / unique-key generation / insert for
 * `vertical_drama_locations`. Loaded via a DYNAMIC `import()` (never a
 * static top-level import) so a caller that only needs
 * `generateLocationDetectionPlan` (prompt planning only, no DB write) never
 * eagerly pulls in the reconciliation module's own `../db`/schema import
 * surface — same "dynamic import, never static" convention
 * `verticalDramaCharacters.ts`'s `detectCharacterVariantsNow` documents for
 * its own sibling service imports.
 *
 * Unlike `verticalDramaCharacterVariantPlanner.ts`, this module has no
 * circular relationship with `verticalDramaImproveScript.ts` — it is only
 * ever invoked on demand from `verticalDramaLocations.ts`'s
 * `detectLocationsNow` procedure (a direct user action), never from inside
 * the improve-script job pipeline — so `resolveQualityLargeContextModelId`
 * is imported statically below with no circular-import caveat needed.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import {
  formatStoryScriptEpisode,
  type StoryScriptEpisodeInput,
  type StoryScriptLang,
} from "@shared/verticalDramaSeries/storyScriptText";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
// Type-only — erased at compile time, no runtime module load (the RUNTIME
// `reconcileEpisodeLocations` function is loaded via a DYNAMIC `import()`
// inside `reconcileLocationDetectionPlan` only, see that function's own doc
// comment).
import type { LocationReconciliationSummary } from "./verticalDramaLocationReconciliation";
import type { VerticalDramaStoryboardLocationGroup } from "@shared/verticalDramaSeries/storyboardLocations";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-location-detector");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-location-detector` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM
 * system prompt. Resolves the skill folder the same way `skillRegistry.ts`
 * does — byte-identical convention to
 * `verticalDramaCharacterVariantPlanner.ts`'s own `loadSkillSystemPrompt`.
 */
function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-location-detector" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema                                                              */
/* -------------------------------------------------------------------------- */

const locationDetectionEntrySchema = z.object({
  location_key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  applies_to_episodes: z.array(z.number().int()).optional().default([]),
});

/**
 * Validates + narrows the LLM response. `locations` defaults to `[]` — a
 * season that hasn't yet established any distinct physical setting is a
 * valid, expected result (see `skill.md`'s edge-case worked example), not an
 * error.
 */
export const locationDetectionPlanOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    locations: z.array(locationDetectionEntrySchema).optional().default([]),
  })
  .passthrough();

export type LocationDetectionPlan = z.infer<typeof locationDetectionPlanOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Input types + prompt building                                             */
/* -------------------------------------------------------------------------- */

export interface LocationDetectionPlannerLocationInput {
  locationKey: string;
  name: string;
  description: string;
}

export interface GenerateLocationDetectionPlanParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  lang?: StoryScriptLang;
  existingLocations: LocationDetectionPlannerLocationInput[];
  episodes: StoryScriptEpisodeInput[];
  idempotencyKey?: string;
}

/**
 * Assembles ONLY structured ground-truth facts as labeled plain-text lines —
 * the same "labeled data lines, no authored instruction prose" convention
 * `buildCharacterVariantPlannerUserPrompt` already uses. Every
 * creative/instructional sentence (which settings are genuinely distinct,
 * what to name/describe them) is authored by the skill itself — never here.
 * Episode content is rendered via the shared `formatStoryScriptEpisode`
 * formatter (reused byte-identically from
 * `@shared/verticalDramaSeries/storyScriptText`, not reinvented).
 */
export function buildLocationDetectionPlannerUserPrompt(
  params: GenerateLocationDetectionPlanParams,
): string {
  const lang: StoryScriptLang = params.lang ?? "th";

  const locationLines = params.existingLocations
    .map(
      (location) =>
        `- location_key=${location.locationKey} name=${location.name} description=${location.description || "(none)"}`,
    )
    .join("\n");

  const episodesText = params.episodes
    .map((episode) => formatStoryScriptEpisode(lang, episode))
    .join("\n\n");

  return [
    `contract_version: 1`,
    `locale: ${lang}`,
    `location_roster:\n${locationLines || "(none)"}`,
    `season_script:\n${episodesText || "(no drafted episodes)"}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Author the season-wide location detection plan via the
 * `vertical-drama-location-detector` skill. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — same
 * contract as `generateCharacterVariantPlan`.
 *
 * Model resolution mirrors `generateCharacterVariantPlan`'s own whole-season
 * calls: prefers the cheapest eligible large-context THINKING-capable model
 * (the whole season's text can be large), falling back to
 * `resolveStoryBibleModel()` when none is eligible (handled inside
 * `resolveVerticalDramaSeriesModel` itself).
 */
export async function generateLocationDetectionPlan(
  params: GenerateLocationDetectionPlanParams,
): Promise<{
  plan: LocationDetectionPlan;
  creditsUsed: number;
  model: string;
}> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId,
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildLocationDetectionPlannerUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    userId: params.userId,
    maxTokens: 6000,
    schema: locationDetectionPlanOutputSchema,
    label: "Location detector (whole-season)",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — location detection (whole-season)",
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:location-detector`
      : undefined,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      operation: "location_detector",
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { plan: validatedData, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Idempotent reconciliation — thin adapter over the existing per-episode    */
/* reconciler                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Materializes `plan` (from `generateLocationDetectionPlan`) into durable
 * `vertical_drama_locations` rows for `owner.seriesId` — a THIN adapter, not
 * a reimplementation: maps `plan.locations[]` onto the exact camelCase
 * `VerticalDramaStoryboardLocationGroup[]` contract shape (`shotNumbers: []`,
 * since a whole-series detection pass has no specific shot numbers to
 * attach) and delegates entirely to the existing, proven
 * `reconcileEpisodeLocations` — the single place that owns stable-key
 * matching / unique-key generation / insert for `vertical_drama_locations`
 * (already used by the per-episode storyboard pipeline). See this file's own
 * top-of-file doc comment for why the import is dynamic.
 */
export async function reconcileLocationDetectionPlan(
  owner: { tenantId: string; userId: number; seriesId: number },
  plan: LocationDetectionPlan,
): Promise<LocationReconciliationSummary> {
  const { reconcileEpisodeLocations } = await import("./verticalDramaLocationReconciliation");

  const groups: VerticalDramaStoryboardLocationGroup[] = plan.locations.map((location) => ({
    locationKey: location.location_key,
    locationName: location.name,
    description: location.description,
    shotNumbers: [],
  }));

  return reconcileEpisodeLocations(owner, groups);
}
