/**
 * Vertical Drama Series — season-wide character variant/twin planning
 * (`planning/vertical-drama-character-variants/plan.md` Phase B).
 *
 * Invokes the `vertical-drama-character-variant-planner` skill
 * (`apps/web/skills/vertical-drama-character-variant-planner/`) via a direct
 * `executeWithFallback` LLM call (through `executeJsonPlanningCallWithRetry`,
 * the same shared retry/validation helper every other Vertical Drama planning
 * stage uses) to decide, for the WHOLE season at once, which characters need
 * a distinct visual variant (a recurring different outfit, or a different
 * life-stage appearance) and whether the story establishes any
 * twins/lookalikes.
 *
 * Mirrors `verticalDramaShotImageAction.ts`'s
 * loadSkillSystemPrompt -> buildUserPrompt -> check-credits -> resolve-model
 * -> call (with retry) -> validate -> deduct-credits convention exactly.
 * `buildCharacterVariantPlannerUserPrompt` does ONLY fact assembly (character
 * roster + the whole season's episode content, as labeled plain-text lines) —
 * every creative/instructional decision (which characters need a variant,
 * what the variant looks like, twin detection) is authored entirely by the
 * skill itself.
 *
 * This is the ONLY new file this phase adds besides the skill folder — the
 * job-level wiring (calling `generateCharacterVariantPlan` then
 * `reconcileCharacterVariantPlan` as the final, best-effort phase of
 * `runImproveScriptJob`) lives in `verticalDramaImproveScript.ts`, not here;
 * this file never touches `bible`/DB rows outside `vertical_drama_characters`
 * itself and never throws a `TRPCError` (mirrors `verticalDramaStoryBible.ts`'s
 * "service stays DB-light / error-plain" convention — the one exception is
 * `reconcileCharacterVariantPlan`, which DOES read/write
 * `vertical_drama_characters` directly, the same durable-roster table
 * `server/routers/verticalDramaCharacters.ts`'s `createCharacter` mutation
 * writes to, using the exact same insert shape).
 *
 * Circular import note: `generateCharacterVariantPlan` imports
 * `resolveQualityLargeContextModelId` from `./verticalDramaImproveScript`,
 * which in turn imports `generateCharacterVariantPlan`/
 * `reconcileCharacterVariantPlan` from THIS file for its final-phase wiring.
 * This mirrors the already-established, documented-safe circular pair
 * `verticalDramaStoryBible.ts` <-> `verticalDramaPresetSynthesis.ts`
 * (`resolveStoryBibleModel`) — safe because every cross-reference here is
 * only ever called from inside a function body, never at module-evaluation
 * time, so the cycle resolves fine at runtime.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import { debugError } from "../_core/logger";
import { db } from "../db";
import { verticalDramaCharacters, type VerticalDramaCharacterRow } from "../../drizzle/schema";
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
// Circular import (safe — see this file's doc comment): only referenced
// inside `generateCharacterVariantPlan`'s function body, never at
// module-evaluation time.
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-character-variant-planner");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-character-variant-planner` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder the same way `skillRegistry.ts` does —
 * byte-identical convention to `verticalDramaShotImageAction.ts`'s
 * `loadSkillSystemPrompt`.
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
    `Could not locate skill.md for "vertical-drama-character-variant-planner" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema                                                              */
/* -------------------------------------------------------------------------- */

const characterVariantEntrySchema = z.object({
  variant_label: z.string().trim().min(1),
  variant_type: z.enum(["outfit", "age_stage"]),
  description: z.string().trim().min(1),
  applies_to_episodes: z.array(z.number().int()).optional().default([]),
  // W3 stable-ID reconcile
  // (`planning/vertical-drama-twin-variant-completeness/plan.md` W3): when
  // the skill recognizes this variant as the SAME one a roster entry already
  // carries (`existing_parent_character_key`/`existing_variant_label` on the
  // input roster), it echoes that roster entry's own `character_key` here
  // instead of re-describing a fresh-sounding proposal.
  // `reconcileCharacterVariantPlan` consults this FIRST (stable-ID lookup)
  // before falling back to its old `(parentCharacterId, variantLabel)` text
  // match.
  existing_character_key: z.string().trim().min(1).optional(),
});

const characterPlanEntrySchema = z.object({
  character_key: z.string().trim().min(1),
  variants: z.array(characterVariantEntrySchema).min(1),
});

const twinNewCharacterSchema = z.object({
  character_key_suggestion: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  role: z.string().trim().optional().default(""),
  shares_face_with: z.string().trim().min(1).nullable().optional(),
  distinguishing_notes: z.string().trim().optional().default(""),
  // W3 stable-ID reconcile — same contract as
  // `characterVariantEntrySchema.existing_character_key` above, applied to
  // twin detections: echoes an already-known twin roster entry's
  // `character_key` back instead of re-describing it.
  existing_character_key: z.string().trim().min(1).optional(),
});

const twinDetectionEntrySchema = z
  .object({
    description: z.string().trim().optional().default(""),
    source_character_key: z.string().trim().min(1),
    new_characters: z.array(twinNewCharacterSchema).min(1),
  })
  .superRefine((val, ctx) => {
    val.new_characters.forEach((newCharacter, index) => {
      if (newCharacter.shares_face_with && newCharacter.shares_face_with !== val.source_character_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `new_characters[${index}].shares_face_with must equal source_character_key ("${val.source_character_key}") when set`,
          path: ["new_characters", index, "shares_face_with"],
        });
      }
    });
  });

/**
 * Validates + narrows the LLM response. `character_plans`/`twin_detections`
 * both default to `[]` — an empty plan (the season genuinely needs no
 * variants/twins) is a valid, common, non-error result (see `skill.md`'s
 * "Omit everything when nothing qualifies" section).
 */
export const characterVariantPlanOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    character_plans: z.array(characterPlanEntrySchema).optional().default([]),
    twin_detections: z.array(twinDetectionEntrySchema).optional().default([]),
  })
  .passthrough();

export type CharacterVariantPlan = z.infer<typeof characterVariantPlanOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Input types + prompt building                                             */
/* -------------------------------------------------------------------------- */

export interface CharacterVariantPlannerCharacterInput {
  characterKey: string;
  name: string;
  role: string;
  description: string;
  /**
   * W3 stable-ID reconcile
   * (`planning/vertical-drama-twin-variant-completeness/plan.md` W3): set
   * ONLY when this roster entry is itself an existing VARIANT row
   * (`parentCharacterId` set on the DB row) — the parent's own
   * `characterKey`. Omitted for base characters and twin rows.
   */
  existingParentCharacterKey?: string;
  /** Companion to `existingParentCharacterKey` — the variant row's own `variantLabel`. */
  existingVariantLabel?: string;
  /**
   * Set ONLY when this roster entry is itself an existing TWIN row
   * (`sharesFaceWithCharacterId` set on the DB row) — the face-source
   * character's own `characterKey`. Omitted for base characters and variant
   * rows.
   */
  existingSharesFaceWithCharacterKey?: string;
}

export interface GenerateCharacterVariantPlanParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  lang?: StoryScriptLang;
  characters: CharacterVariantPlannerCharacterInput[];
  episodes: StoryScriptEpisodeInput[];
  idempotencyKey?: string;
}

/**
 * Assembles ONLY structured ground-truth facts as labeled plain-text lines —
 * the same "labeled data lines, no authored instruction prose" convention
 * `buildShotImageActionUserPrompt` already uses. Every creative/instructional
 * sentence (which characters need a variant, what a variant looks like, twin
 * detection) is authored by the skill itself — never here. Episode content is
 * rendered via the shared `formatStoryScriptEpisode` formatter (reused
 * byte-identically from `@shared/verticalDramaSeries/storyScriptText`, not
 * reinvented) — the same per-episode text block
 * `verticalDramaImproveScript.ts`'s whole-block pass sends as the
 * `drama-script-evaluate-improve` skill's `original_script`.
 */
export function buildCharacterVariantPlannerUserPrompt(
  params: GenerateCharacterVariantPlanParams,
): string {
  const lang: StoryScriptLang = params.lang ?? "th";

  const characterLines = params.characters
    .map((character) => {
      const base = `- character_key=${character.characterKey} name=${character.name} role=${character.role || "(unspecified)"} description=${character.description || "(none)"}`;
      // W3 stable-ID reconcile — append markers, when present, telling the
      // skill this roster entry is ITSELF an already-known variant/twin (see
      // `CharacterVariantPlannerCharacterInput`'s doc comments). Omitted
      // entirely for base characters (no trailing noise on the common case).
      const extras: string[] = [];
      if (character.existingParentCharacterKey) {
        extras.push(`existing_parent_character_key=${character.existingParentCharacterKey}`);
      }
      if (character.existingVariantLabel) {
        extras.push(`existing_variant_label=${character.existingVariantLabel}`);
      }
      if (character.existingSharesFaceWithCharacterKey) {
        extras.push(
          `existing_shares_face_with_character_key=${character.existingSharesFaceWithCharacterKey}`,
        );
      }
      return extras.length > 0 ? `${base} ${extras.join(" ")}` : base;
    })
    .join("\n");

  const episodesText = params.episodes
    .map((episode) => formatStoryScriptEpisode(lang, episode))
    .join("\n\n");

  return [
    `contract_version: 1`,
    `locale: ${lang}`,
    `character_roster:\n${characterLines || "(none)"}`,
    `season_script:\n${episodesText || "(no drafted episodes)"}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Author the season-wide character variant/twin plan via the
 * `vertical-drama-character-variant-planner` skill. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated (throws
 * `VdSchemaValidationError` on a malformed LLM response) — same contract as
 * `generateShotImageAction`. Callers (`runImproveScriptJob`) are expected to
 * treat BOTH of these as best-effort/non-fatal for this phase (catch, log,
 * continue) — this function itself does not swallow errors.
 *
 * Model resolution mirrors `verticalDramaImproveScript.ts`'s own whole-season
 * calls: prefers the cheapest eligible large-context THINKING-capable model
 * (the whole season's text can be large), falling back to
 * `resolveStoryBibleModel()` when none is eligible.
 */
export async function generateCharacterVariantPlan(
  params: GenerateCharacterVariantPlanParams,
): Promise<{
  plan: CharacterVariantPlan;
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
  const userPrompt = buildCharacterVariantPlannerUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    userId: params.userId,
    maxTokens: 6000,
    schema: characterVariantPlanOutputSchema,
    label: "Character variant planner (whole-season)",
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
    description: "Vertical Drama — character variant planning (whole-season)",
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:character-variant-planner`
      : undefined,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      operation: "character_variant_planner",
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { plan: validatedData, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Idempotent reconciliation — materialize the plan into durable character   */
/* rows                                                                       */
/* -------------------------------------------------------------------------- */

export interface CharacterVariantReconciliationSummary {
  createdCharacters: Array<{ name: string; variantLabel: string | null }>;
  updatedCharacters: Array<{ name: string; variantLabel: string | null }>;
}

/**
 * Slugify a variant label / suggested name into a `characterKey` suffix
 * candidate (lowercase, non-alphanumeric collapsed to `-`, trimmed). Falls
 * back to `"variant"` for labels that are entirely non-alphanumeric (e.g.
 * Thai-only text, which this app's labels usually are) — the caller's own
 * dedup loop (`generateUniqueCharacterKey`) then appends `-2`, `-3`, ... as
 * needed. Byte-identical convention to `verticalDramaSeries.ts`'s own
 * `slugifyCharacterName` (duplicated here rather than imported — that
 * function is private to its router file, and this codebase's own
 * established convention is a small local slugify per file, not a shared
 * util; see this file's brief).
 */
function slugifyForCharacterKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "variant";
}

/** Appends `-2`, `-3`, ... until `baseKey` is not already present in `usedKeys`; mutates nothing, caller adds the result to `usedKeys` itself. */
function generateUniqueCharacterKey(baseKey: string, usedKeys: Set<string>): string {
  const base = baseKey.trim() || "character";
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  return key;
}

/**
 * Best-effort character description drawn from `verticalDramaCharacters.data`
 * — mirrors `server/routers/verticalDramaCharacters.ts`'s
 * `extractCharacterDescription` in spirit (same `data.description`/
 * `data.wardrobeRules` fields), but re-implemented locally rather than
 * imported: that function lives in a ROUTER file, and services in this
 * codebase never import from routers (routers import services, never the
 * reverse) — see this file's doc comment on the established DB/error-plain
 * service convention.
 */
export function extractCharacterRosterDescription(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const parts: string[] = [];
  if (typeof data.description === "string" && data.description.trim()) {
    parts.push(data.description.trim());
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = (data.wardrobeRules as unknown[]).filter(
      (rule): rule is string => typeof rule === "string" && rule.trim().length > 0,
    );
    if (rules.length > 0) parts.push(`Wardrobe: ${rules.join("; ")}`);
  }
  return parts.join(" | ");
}

/**
 * Idempotently materializes `plan` (from `generateCharacterVariantPlan`) into
 * durable `vertical_drama_characters` rows for `owner.seriesId`. Re-running
 * this on a series that already has variant/twin rows from a prior run
 * reconciles rather than duplicates:
 *
 *  - **Stable-ID match first** (W3,
 *    `planning/vertical-drama-twin-variant-completeness/plan.md`) — every
 *    variant/twin entry MAY carry `existing_character_key` (the skill's echo
 *    of a roster entry it recognized as already-known — see
 *    `CharacterVariantPlannerCharacterInput`'s doc comment and `skill.md`).
 *    When present, it is looked up directly via `rowsByCharacterKey` (built
 *    below); a hit is treated as the match immediately, and the old
 *    text-comparison match below is skipped entirely for that entry. A MISS
 *    (an `existing_character_key` that doesn't resolve to any row in the
 *    current roster — e.g. stale/best-effort) falls through gracefully to
 *    the text-match path rather than erroring. Absent entirely (older-shaped
 *    output, or the model didn't comply), the text-match path runs exactly
 *    as before — this is a pure backward-compatible ADDITION, not a
 *    replacement.
 *  - **Variants** (`plan.character_plans[].variants[]`) — text-match
 *    fallback: matched against an EXISTING row by `(parentCharacterId,
 *    variantLabel)` (exact, case-sensitive label match). A match (by either
 *    path) is UPDATED (its `data`/`variantType` refreshed to the plan) —
 *    its `characterKey` is NEVER touched once created, since downstream
 *    shots/assets address it directly. No match -> INSERT a new row:
 *    `characterKey = ${parentCharacterKey}-${slugify(variantLabel)}`
 *    (deduplicated against every characterKey already in the series),
 *    `name`/`role` copied from the parent (same person, different look),
 *    `parentCharacterId`/`variantLabel`/`variantType` set from the plan,
 *    `data.description` (and, for `"outfit"` variants, also
 *    `data.wardrobeRules`) populated from the variant's own `description`.
 *  - **Twins** (`plan.twin_detections[].new_characters[]`) — text-match
 *    fallback: an IDENTICAL twin (`shares_face_with` set) is matched against
 *    an existing row by `(sharesFaceWithCharacterId = source row id, name)`;
 *    a FRATERNAL sibling (`shares_face_with` unset) has no natural cross-run
 *    stable key via text alone, so it is matched by `name` among the
 *    series' other independent (non-variant, non-face-sharing) rows,
 *    excluding the source itself. A match (by either path) is left
 *    completely as-is (never re-created, never overwritten). No match ->
 *    INSERT a new independent character row: `characterKey` from
 *    `character_key_suggestion` when given (else `${sourceCharacterKey}-twin`),
 *    deduplicated; `sharesFaceWithCharacterId` set to the source row's id ONLY
 *    for an identical twin (null for a fraternal one); `data.description` set
 *    from `distinguishing_notes` when present.
 *  - Any `character_key`/`source_character_key` in the plan that doesn't
 *    match a row in the CURRENT roster is silently skipped (best-effort — the
 *    skill is not guaranteed to see the exact same roster snapshot the
 *    caller re-queries here).
 *
 * Never throws for a "plan references an unknown character" case (skips it);
 * DOES propagate a genuine DB error, since the caller (`runImproveScriptJob`)
 * already wraps this whole phase in its own best-effort try/catch.
 */
export async function reconcileCharacterVariantPlan(
  owner: { tenantId: string; userId: number; seriesId: number },
  plan: CharacterVariantPlan,
): Promise<CharacterVariantReconciliationSummary> {
  const createdCharacters: CharacterVariantReconciliationSummary["createdCharacters"] = [];
  const updatedCharacters: CharacterVariantReconciliationSummary["updatedCharacters"] = [];

  const rows: VerticalDramaCharacterRow[] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, owner.seriesId),
      ),
    );

  const rowsById = new Map<number, VerticalDramaCharacterRow>(rows.map((row) => [row.id, row]));
  const rowsByCharacterKey = new Map<string, VerticalDramaCharacterRow>(
    rows.map((row) => [row.characterKey, row]),
  );
  const usedKeys = new Set<string>(rows.map((row) => row.characterKey));

  function trackNewRow(row: VerticalDramaCharacterRow | undefined): void {
    if (!row) return;
    rowsById.set(row.id, row);
    rowsByCharacterKey.set(row.characterKey, row);
    usedKeys.add(row.characterKey);
  }

  /* ------------------------------ Variants ------------------------------ */

  for (const characterPlan of plan.character_plans) {
    const parentRow = rowsByCharacterKey.get(characterPlan.character_key);
    if (!parentRow) continue; // Unknown character_key — best-effort skip.

    for (const variant of characterPlan.variants) {
      // Stable-ID match first (W3) — falls through to the text-match below
      // when absent or unresolvable. See this function's doc comment.
      let existing = variant.existing_character_key
        ? rowsByCharacterKey.get(variant.existing_character_key)
        : undefined;
      if (!existing) {
        existing = [...rowsById.values()].find(
          (row) => row.parentCharacterId === parentRow.id && row.variantLabel === variant.variant_label,
        );
      }

      const dataPatch: Record<string, unknown> = { description: variant.description };
      if (variant.variant_type === "outfit") {
        dataPatch.wardrobeRules = [variant.description];
      }

      if (existing) {
        const mergedData = { ...((existing.data as Record<string, unknown> | null) ?? {}), ...dataPatch };
        await db
          .update(verticalDramaCharacters)
          .set({ data: mergedData, variantType: variant.variant_type, updatedAt: new Date() })
          .where(eq(verticalDramaCharacters.id, existing.id));
        updatedCharacters.push({ name: existing.name, variantLabel: variant.variant_label });
        continue;
      }

      const characterKey = generateUniqueCharacterKey(
        `${parentRow.characterKey}-${slugifyForCharacterKey(variant.variant_label)}`,
        usedKeys,
      );

      const [insertedRow] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          characterKey,
          name: parentRow.name,
          role: parentRow.role,
          parentCharacterId: parentRow.id,
          variantLabel: variant.variant_label,
          variantType: variant.variant_type,
          data: dataPatch,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      trackNewRow(insertedRow as VerticalDramaCharacterRow | undefined);
      createdCharacters.push({ name: parentRow.name, variantLabel: variant.variant_label });
    }
  }

  /* -------------------------------- Twins -------------------------------- */

  for (const twin of plan.twin_detections) {
    const sourceRow = rowsByCharacterKey.get(twin.source_character_key);
    if (!sourceRow) continue; // Unknown character_key — best-effort skip.

    for (const newCharacter of twin.new_characters) {
      const isIdentical = Boolean(newCharacter.shares_face_with);

      // Stable-ID match first (W3) — falls through to the text-match below
      // when absent or unresolvable. See this function's doc comment.
      let existing = newCharacter.existing_character_key
        ? rowsByCharacterKey.get(newCharacter.existing_character_key)
        : undefined;
      if (!existing) {
        existing = isIdentical
          ? [...rowsById.values()].find(
              (row) => row.sharesFaceWithCharacterId === sourceRow.id && row.name === newCharacter.name,
            )
          : [...rowsById.values()].find(
              (row) =>
                row.name === newCharacter.name &&
                row.id !== sourceRow.id &&
                row.parentCharacterId == null &&
                row.sharesFaceWithCharacterId == null,
            );
      }

      if (existing) {
        // Leave as-is — per contract, a matched twin row is never re-created
        // or overwritten (only "never re-creating" is guaranteed, not a data
        // refresh).
        continue;
      }

      const suggestedBase = newCharacter.character_key_suggestion?.trim() || `${sourceRow.characterKey}-twin`;
      const characterKey = generateUniqueCharacterKey(slugifyForCharacterKey(suggestedBase), usedKeys);

      const dataPatch: Record<string, unknown> = {};
      if (newCharacter.distinguishing_notes) {
        dataPatch.description = newCharacter.distinguishing_notes;
      }

      const [insertedRow] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          characterKey,
          name: newCharacter.name,
          role: newCharacter.role || sourceRow.role,
          sharesFaceWithCharacterId: isIdentical ? sourceRow.id : null,
          data: Object.keys(dataPatch).length > 0 ? dataPatch : null,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      trackNewRow(insertedRow as VerticalDramaCharacterRow | undefined);
      createdCharacters.push({ name: newCharacter.name, variantLabel: null });
    }
  }

  return { createdCharacters, updatedCharacters };
}

/** Logs a best-effort phase failure without ever throwing — the one shared log line `runImproveScriptJob`'s catch block calls into, so the exact message format only needs to be maintained in one place. */
export function logCharacterVariantPlanningFailure(seriesId: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  debugError(
    "vd_character_variant_planner",
    `Character variant planning phase failed for series ${seriesId} — best-effort, does not fail the improve-script job: ${message}`,
    { seriesId },
  );
}
