/**
 * Vertical Drama Series — duplicate-character identity repair
 * (`planning/vd-character-identity-repair/plan.md` Phase 3).
 *
 * Root cause this repairs (see the plan's own root-cause chain, verified
 * read-only, do not re-derive): `normalizeStoryCharacterName` dedup
 * (`verticalDramaCharacterRosterAutoRegister.ts`) is EXACT-normalized only,
 * by design (root cause #5) — a natural Thai short form (`คิริน`) and its
 * full bible name (`คิริน วัฒนเมธา`), or a per-episode spelling drift
 * (`คีริน`, `Kirin`, `กิริน`, `คิรัน`), each insert their OWN roster row
 * instead of resolving to one person. This module is the REPAIR tool for a
 * series that already has this drift baked into its durable roster.
 *
 * Two pieces, split so the shaping/derivation logic is unit-testable without
 * a database or an LLM (same "pure core + DB orchestrator" split this
 * directory already uses for `verticalDramaShotCharacterRepair.ts`/
 * `verticalDramaCharacterRosterAutoRegister.ts`):
 *
 * - **Analyze** (`analyzeCharacterDuplicates`, PROPOSAL ONLY, never writes):
 *   loads the roster + Story Bible `refinedCharacters` + this series' active
 *   deep-draft season script, computes per-roster-row occurrence FACTS in TS
 *   (per `feedback_skill_first_authoring` — TS computes facts, the LLM
 *   judges), invokes the `vertical-drama-character-identity-reconciler`
 *   skill (mirrors `verticalDramaLocationDetector.ts`'s
 *   loadSkillSystemPrompt -> buildUserPrompt -> check-credits -> resolve-
 *   model -> call (with retry) -> validate -> deduct-credits convention
 *   exactly) to decide which roster rows are the same person, then
 *   reconciles the LLM's grouping into a full partition of the roster (pure,
 *   `reconcileCharacterDuplicatePlanIntoGroups`) so every roster row gets
 *   SOME proposal even if the model's JSON is partial. **Never merges/
 *   deletes/renames anything itself** — binding user decision
 *   (`planning/vd-character-identity-repair/plan.md` "Decisions" §1): repair
 *   is propose -> user confirms each group -> then merge, never auto-apply.
 *
 * - **Merge** (`mergeCharacters`, the only piece that writes): given a
 *   user-CONFIRMED `{ keepCharacterId, mergeCharacterIds[] }` (from one
 *   proposed group), performs the merge in ONE `db.transaction` — see that
 *   function's own doc comment for the exact ordered steps. Story text is
 *   NEVER rewritten (binding decision §2): a merged row's name is recorded
 *   as an ALIAS of the surviving row, `คิริน` stays `คิริน` in all 176 shots.
 *
 * CRITICAL — why this cannot be a string-similarity threshold: `Kirin` vs
 * `คิริน` share ZERO characters; edit-distance cannot catch romanization, and
 * a low similarity score must never be treated as evidence the two are NOT
 * the same person. The full roster + bible + occurrence facts are handed to
 * the LLM UNFILTERED — no pre-filtering candidate pairs by a similarity gate
 * before the model sees them, which would silently drop exactly the cases
 * that need judgment (see `skill.md`'s own "read this first" section).
 */

import { and, eq, inArray, notInArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { db } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  verticalDramaCharacterAssets,
  verticalDramaEpisodes,
  type VerticalDramaCharacterRow,
} from "../../drizzle/schema";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { normalizeStoryCharacterName } from "./verticalDramaCharacterRosterAutoRegister";
import {
  formatStoryScriptEpisode,
  type StoryScriptEpisodeInput,
  type StoryScriptLang,
} from "@shared/verticalDramaSeries/storyScriptText";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries";

// Re-exported so callers only need to import from this one module (mirrors
// `verticalDramaLocationDetector.ts`'s own re-export convention).
export { InsufficientCreditsError, VdSchemaValidationError };

/* -------------------------------------------------------------------------- */
/* Part 1 — pure fact computation (no DB/LLM access, unit-tested directly)   */
/* -------------------------------------------------------------------------- */

export interface VdCharacterDuplicateRosterInput {
  characterId: number;
  characterKey: string;
  name: string;
  narrativeRole?: string | null;
  roleTier?: string | null;
  roleReviewStatus?: string | null;
  /** `(row.data as any)?.source`, e.g. `"auto_registered_from_story"`. */
  dataSource?: string | null;
}

/** Minimal shape this module needs from a deep-draft shot to compute name-occurrence facts — a structural subset of `VdDeepDraftShotDraft`. */
export interface VdCharacterDuplicateShotInput {
  characters?: ReadonlyArray<{ name: string }>;
  dialogueLines?: ReadonlyArray<{ speaker: string }>;
}

export interface VdCharacterDuplicateEpisodeInput {
  episodeNumber: number;
  shots: ReadonlyArray<VdCharacterDuplicateShotInput>;
}

export interface VdCharacterDuplicateOccurrenceStats {
  shotCharacterOccurrences: number;
  dialogueSpeakerOccurrences: number;
  episodeNumbersSeenIn: number[];
}

/**
 * Single pass over every drafted episode's shots, tallying occurrence counts
 * per EXACT (trimmed, case-sensitive) name string — deliberately NOT
 * normalized, since the whole point is to distinguish `คิริน` from `คีริน`
 * from `Kirin` as separate facts for the LLM to reason about (normalizing
 * them here would erase the exact drift signal the plan's own evidence table
 * is built from). Returns a lookup any roster row's own `name` can be
 * queried against directly.
 */
export function computeCharacterNameOccurrenceStats(
  episodes: ReadonlyArray<VdCharacterDuplicateEpisodeInput>,
): Map<string, VdCharacterDuplicateOccurrenceStats> {
  const statsByExactName = new Map<
    string,
    { shotCharacterOccurrences: number; dialogueSpeakerOccurrences: number; episodeNumbers: Set<number> }
  >();

  function bump(
    rawName: string,
    episodeNumber: number,
    field: "shotCharacterOccurrences" | "dialogueSpeakerOccurrences",
  ): void {
    const name = rawName.trim();
    if (!name) return;
    let entry = statsByExactName.get(name);
    if (!entry) {
      entry = { shotCharacterOccurrences: 0, dialogueSpeakerOccurrences: 0, episodeNumbers: new Set() };
      statsByExactName.set(name, entry);
    }
    entry[field] += 1;
    entry.episodeNumbers.add(episodeNumber);
  }

  for (const episode of episodes) {
    for (const shot of episode.shots) {
      for (const character of shot.characters ?? []) {
        if (character?.name) bump(character.name, episode.episodeNumber, "shotCharacterOccurrences");
      }
      for (const line of shot.dialogueLines ?? []) {
        if (line?.speaker) bump(line.speaker, episode.episodeNumber, "dialogueSpeakerOccurrences");
      }
    }
  }

  const result = new Map<string, VdCharacterDuplicateOccurrenceStats>();
  for (const [name, entry] of statsByExactName) {
    result.set(name, {
      shotCharacterOccurrences: entry.shotCharacterOccurrences,
      dialogueSpeakerOccurrences: entry.dialogueSpeakerOccurrences,
      episodeNumbersSeenIn: Array.from(entry.episodeNumbers).sort((a, b) => a - b),
    });
  }
  return result;
}

export interface VdCharacterDuplicateEvidence {
  characterId: number;
  characterKey: string;
  name: string;
  narrativeRole: string | null;
  roleTier: string | null;
  roleReviewStatus: string | null;
  dataSource: string | null;
  /** Exact (trimmed) match against a `bible.refinedCharacters[].name` — the plan's own preferred canonical-selection signal. */
  matchesBibleCharacterExactly: boolean;
  shotCharacterOccurrences: number;
  dialogueSpeakerOccurrences: number;
  episodeNumbersSeenIn: number[];
  /** Alias strings already recorded for this character (any `source`). */
  existingAliases: string[];
}

/**
 * Per-roster-row evidence — pure, given already-loaded roster rows, bible
 * character names, precomputed occurrence stats, and existing alias rows.
 * Every roster row gets an entry, even one with zero occurrences (a
 * brand-new/never-drafted-against character still needs a "no evidence"
 * evidence row, not an omission).
 */
export function computeCharacterDuplicateEvidence(params: {
  roster: ReadonlyArray<VdCharacterDuplicateRosterInput>;
  bibleCharacterNames: ReadonlyArray<string>;
  occurrenceStatsByExactName: ReadonlyMap<string, VdCharacterDuplicateOccurrenceStats>;
  aliasesByCharacterId: ReadonlyMap<number, ReadonlyArray<string>>;
}): VdCharacterDuplicateEvidence[] {
  const bibleNameSet = new Set(params.bibleCharacterNames.map(n => n.trim()));
  return params.roster.map(row => {
    const stats = params.occurrenceStatsByExactName.get(row.name.trim());
    return {
      characterId: row.characterId,
      characterKey: row.characterKey,
      name: row.name,
      narrativeRole: row.narrativeRole ?? null,
      roleTier: row.roleTier ?? null,
      roleReviewStatus: row.roleReviewStatus ?? null,
      dataSource: row.dataSource ?? null,
      matchesBibleCharacterExactly: bibleNameSet.has(row.name.trim()),
      shotCharacterOccurrences: stats?.shotCharacterOccurrences ?? 0,
      dialogueSpeakerOccurrences: stats?.dialogueSpeakerOccurrences ?? 0,
      episodeNumbersSeenIn: stats?.episodeNumbersSeenIn ?? [],
      existingAliases: Array.from(params.aliasesByCharacterId.get(row.characterId) ?? []),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Part 2 — skill invocation (LLM judgment)                                   */
/* -------------------------------------------------------------------------- */

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-character-identity-reconciler");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-character-identity-reconciler` skill's markdown
 * body verbatim, to use as the LLM system prompt. Byte-identical convention
 * to `verticalDramaLocationDetector.ts`'s own `loadSkillSystemPrompt`.
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
    `Could not locate skill.md for "vertical-drama-character-identity-reconciler" under any known skills directory`,
  );
}

const duplicateGroupEntrySchema = z.object({
  canonical_character_key: z.string().trim().min(1),
  duplicate_character_keys: z.array(z.string().trim().min(1)).optional().default([]),
  reasoning: z.string().trim().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

/**
 * Validates + narrows the LLM response. `groups` requires at least one entry
 * — a roster always has at least one character to report on (the caller
 * never invokes this with an empty roster, see `analyzeCharacterDuplicates`'s
 * own precondition).
 */
export const characterDuplicateAnalysisOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    groups: z.array(duplicateGroupEntrySchema).min(1),
  })
  .passthrough();

export type CharacterDuplicateAnalysisPlan = z.infer<typeof characterDuplicateAnalysisOutputSchema>;

/**
 * Assembles ONLY structured ground-truth facts as labeled plain-text lines —
 * same "labeled data lines, no authored instruction prose" convention
 * `buildCharacterVariantPlannerUserPrompt`/`buildLocationDetectionPlannerUserPrompt`
 * already use. Every creative/instructional decision (which rows are the
 * same person, which survives) is authored entirely by the skill — never
 * here. Episode content is rendered via the shared `formatStoryScriptEpisode`
 * formatter (reused byte-identically), so the model can read actual scene/
 * dialogue text — the plan's own worked evidence (episode 12's in-scene
 * address-by-name) requires the real script, not just occurrence counts.
 */
export function buildCharacterDuplicateAnalyzerUserPrompt(params: {
  lang?: StoryScriptLang;
  bibleCharacters: ReadonlyArray<{
    name: string;
    narrativeRole?: string | null;
    roleTier?: string | null;
    occupation?: string | null;
  }>;
  evidence: ReadonlyArray<VdCharacterDuplicateEvidence>;
  episodes: StoryScriptEpisodeInput[];
}): string {
  const lang: StoryScriptLang = params.lang ?? "th";

  const bibleLines = params.bibleCharacters
    .map(
      c =>
        `- name=${c.name} narrative_role=${c.narrativeRole || "(unspecified)"} role_tier=${c.roleTier || "(unspecified)"} occupation=${c.occupation || "(unspecified)"}`,
    )
    .join("\n");

  const rosterLines = params.evidence
    .map(e => {
      const episodesText = e.episodeNumbersSeenIn.length > 0 ? `[${e.episodeNumbersSeenIn.join(",")}]` : "[]";
      const aliasesText = e.existingAliases.length > 0 ? `[${e.existingAliases.join(", ")}]` : "[]";
      return `- character_key=${e.characterKey} name=${e.name} narrative_role=${e.narrativeRole || "(unspecified)"} role_tier=${e.roleTier || "(unspecified)"} role_review_status=${e.roleReviewStatus || "(unspecified)"} data_source=${e.dataSource || "(unspecified)"} shot_character_occurrences=${e.shotCharacterOccurrences} dialogue_speaker_occurrences=${e.dialogueSpeakerOccurrences} episodes_seen_in=${episodesText} existing_aliases=${aliasesText}`;
    })
    .join("\n");

  const episodesText = params.episodes.map(episode => formatStoryScriptEpisode(lang, episode)).join("\n\n");

  return [
    `contract_version: 1`,
    `locale: ${lang}`,
    `bible_characters:\n${bibleLines || "(none)"}`,
    `roster:\n${rosterLines || "(none)"}`,
    `season_script:\n${episodesText || "(no drafted episodes)"}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n\n");
}

export interface GenerateCharacterDuplicateAnalysisParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  lang?: StoryScriptLang;
  bibleCharacters: ReadonlyArray<{
    name: string;
    narrativeRole?: string | null;
    roleTier?: string | null;
    occupation?: string | null;
  }>;
  evidence: ReadonlyArray<VdCharacterDuplicateEvidence>;
  episodes: StoryScriptEpisodeInput[];
  idempotencyKey?: string;
}

/**
 * Author the duplicate-grouping proposal via the
 * `vertical-drama-character-identity-reconciler` skill. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed response) — same contract
 * as `generateLocationDetectionPlan`/`generateCharacterVariantPlan`.
 *
 * Model resolution mirrors those siblings' own whole-season calls: prefers
 * the cheapest eligible large-context THINKING-capable model, falling back
 * to `resolveStoryBibleModel()` when none is eligible.
 */
export async function generateCharacterDuplicateAnalysis(
  params: GenerateCharacterDuplicateAnalysisParams,
): Promise<{ plan: CharacterDuplicateAnalysisPlan; creditsUsed: number; model: string }> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(params.seriesId, resolveQualityLargeContextModelId);
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildCharacterDuplicateAnalyzerUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    userId: params.userId,
    maxTokens: 6000,
    schema: characterDuplicateAnalysisOutputSchema,
    label: "Character identity reconciler (duplicate analysis)",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, model);

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: "Vertical Drama — character identity reconciliation (duplicate analysis)",
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:character-identity-reconciler` : undefined,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      operation: "character_identity_reconciler",
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { plan: validatedData, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Part 3 — reconcile the LLM plan into a full roster partition (pure)       */
/* -------------------------------------------------------------------------- */

export interface VdCharacterDuplicateGroupProposal {
  canonicalCharacterId: number;
  canonicalCharacterKey: string;
  canonicalName: string;
  canonicalMatchesBibleCharacter: boolean;
  duplicateCharacterIds: number[];
  duplicates: Array<{ characterId: number; characterKey: string; name: string }>;
  /** Merged-row names to record as aliases of the canonical row — deduped, excludes the canonical's own name and anything already an existing alias. */
  aliasesToRecord: string[];
  /** Canonical's evidence first, then each duplicate's — full transparency for the UI to render occurrence counts per row. */
  evidence: VdCharacterDuplicateEvidence[];
  reasoning: string;
  confidence: number;
  /** True when this roster row was judged NOT a duplicate of anything (its own single-row group). */
  isSingleton: boolean;
  /** True when the LLM's output didn't cover this roster row at all — a safety-net proposal, not a model judgment. See `reconcileCharacterDuplicatePlanIntoGroups`'s own doc comment. */
  autoFallback: boolean;
}

/**
 * Merged-row names to record as aliases of the surviving canonical row for
 * one proposed group — deduped by `normalizeStoryCharacterName`, excludes
 * the canonical's own name, and excludes anything already recorded as an
 * alias (of the canonical OR of any duplicate — the alias table's UNIQUE
 * index is per-SERIES, not per-character, so a name already aliased
 * anywhere in this series must not be proposed again).
 */
export function deriveAliasesToRecordForGroup(
  canonical: VdCharacterDuplicateEvidence,
  duplicates: ReadonlyArray<VdCharacterDuplicateEvidence>,
): string[] {
  const alreadyAliasedNormalized = new Set(
    [...canonical.existingAliases, ...duplicates.flatMap(d => d.existingAliases)].map(normalizeStoryCharacterName),
  );
  const seen = new Set<string>([normalizeStoryCharacterName(canonical.name)]);
  const result: string[] = [];
  for (const duplicate of duplicates) {
    const normalized = normalizeStoryCharacterName(duplicate.name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (alreadyAliasedNormalized.has(normalized)) continue;
    result.push(duplicate.name.trim());
  }
  return result;
}

/**
 * Reconciles the LLM's `groups[]` into a FULL PARTITION of the roster — every
 * `character_key` in `evidence` ends up in exactly one returned group, even
 * when the model's JSON is incomplete/malformed for some rows. Pure (no DB/
 * LLM access), unit-tested directly.
 *
 * Processing, in order, per plan `groups[]` entry:
 * 1. Collect this entry's candidate keys (`canonical_character_key` +
 *    `duplicate_character_keys`), deduped within the entry, dropping any key
 *    that doesn't resolve to a roster row in `evidence` (unknown/hallucinated
 *    key — best-effort skip, same tolerance `reconcileCharacterVariantPlan`
 *    already applies) AND dropping any key already `claimed` by an earlier
 *    entry in this same plan (a model that double-lists a key across two
 *    groups must not produce two conflicting proposals for it — first
 *    occurrence wins).
 * 2. If nothing is left, skip this entry entirely.
 * 3. Pick the CANONICAL member: prefer whichever candidate's own evidence
 *    has `matchesBibleCharacterExactly` (the plan's own explicit tie-break
 *    rule — "prefer the row whose name exactly matches a bible
 *    `refinedCharacters` name"), else the model's own designated canonical
 *    when it survived filtering, else the first remaining candidate.
 * 4. Every remaining candidate becomes a duplicate of the canonical.
 *
 * After every plan entry is processed, any roster row in `evidence` still
 * unclaimed (the model omitted it, or every entry referencing it got
 * dropped) gets its OWN singleton group (`autoFallback: true`) — the UI's
 * "every character has some proposal" contract must hold even when the
 * model's output is partial; this is pure insurance, never a judgment call.
 */
export function reconcileCharacterDuplicatePlanIntoGroups(
  plan: CharacterDuplicateAnalysisPlan,
  evidence: ReadonlyArray<VdCharacterDuplicateEvidence>,
): VdCharacterDuplicateGroupProposal[] {
  const evidenceByKey = new Map(evidence.map(e => [e.characterKey, e]));
  const claimed = new Set<string>();
  const groups: VdCharacterDuplicateGroupProposal[] = [];

  for (const llmGroup of plan.groups) {
    const rawKeys = [llmGroup.canonical_character_key, ...llmGroup.duplicate_character_keys];
    const candidateKeys: string[] = [];
    const seenInEntry = new Set<string>();
    for (const rawKey of rawKeys) {
      const key = rawKey.trim();
      if (!key || seenInEntry.has(key)) continue;
      seenInEntry.add(key);
      if (!evidenceByKey.has(key)) continue; // Unknown character_key — best-effort skip.
      if (claimed.has(key)) continue; // Already accounted for by an earlier group entry.
      candidateKeys.push(key);
    }
    if (candidateKeys.length === 0) continue;

    const modelCanonicalKey = llmGroup.canonical_character_key.trim();
    const canonicalKey =
      candidateKeys.find(key => evidenceByKey.get(key)!.matchesBibleCharacterExactly) ??
      (candidateKeys.includes(modelCanonicalKey) ? modelCanonicalKey : candidateKeys[0]);

    const duplicateKeys = candidateKeys.filter(key => key !== canonicalKey);
    for (const key of candidateKeys) claimed.add(key);

    const canonicalEvidence = evidenceByKey.get(canonicalKey)!;
    const duplicateEvidence = duplicateKeys.map(key => evidenceByKey.get(key)!);

    groups.push({
      canonicalCharacterId: canonicalEvidence.characterId,
      canonicalCharacterKey: canonicalEvidence.characterKey,
      canonicalName: canonicalEvidence.name,
      canonicalMatchesBibleCharacter: canonicalEvidence.matchesBibleCharacterExactly,
      duplicateCharacterIds: duplicateEvidence.map(e => e.characterId),
      duplicates: duplicateEvidence.map(e => ({ characterId: e.characterId, characterKey: e.characterKey, name: e.name })),
      aliasesToRecord: deriveAliasesToRecordForGroup(canonicalEvidence, duplicateEvidence),
      evidence: [canonicalEvidence, ...duplicateEvidence],
      reasoning: llmGroup.reasoning,
      confidence: llmGroup.confidence,
      isSingleton: duplicateEvidence.length === 0,
      autoFallback: false,
    });
  }

  for (const e of evidence) {
    if (claimed.has(e.characterKey)) continue;
    groups.push({
      canonicalCharacterId: e.characterId,
      canonicalCharacterKey: e.characterKey,
      canonicalName: e.name,
      canonicalMatchesBibleCharacter: e.matchesBibleCharacterExactly,
      duplicateCharacterIds: [],
      duplicates: [],
      aliasesToRecord: [],
      evidence: [e],
      reasoning:
        "ระบบ AI ไม่ได้จัดกลุ่มตัวละครนี้ในผลลัพธ์ — เพิ่มเป็นข้อเสนอเดี่ยวเพื่อความปลอดภัย (ยังไม่มีการเปลี่ยนแปลงใด ๆ จนกว่าจะยืนยัน)",
      confidence: 0,
      isSingleton: true,
      autoFallback: true,
    });
    claimed.add(e.characterKey);
  }

  return groups;
}

/* -------------------------------------------------------------------------- */
/* Part 4 — analyze (DB + LLM orchestrator, PROPOSAL ONLY, never writes)     */
/* -------------------------------------------------------------------------- */

export interface VdCharacterDuplicateAnalysisResult {
  seriesId: number;
  model: string;
  creditsUsed: number;
  groups: VdCharacterDuplicateGroupProposal[];
}

/**
 * Loads this series' roster + Story Bible cast + active deep-draft season
 * script + existing aliases, computes occurrence facts, invokes the
 * `vertical-drama-character-identity-reconciler` skill, and reconciles the
 * result into a full roster partition. **Read-only — this function never
 * inserts, updates, or deletes any row.** The caller (router) is expected to
 * present `groups` for user confirmation; only a subsequent, explicit
 * `mergeCharacters` call (never this one) writes anything.
 *
 * Throws `Error("no_characters")` when the roster is empty — the router
 * translates this into a `PRECONDITION_FAILED`, same convention as
 * `detectCharacterVariantsNow`'s "no characters in the roster" guard.
 */
export async function analyzeCharacterDuplicates(
  owner: { tenantId: string; userId: number; seriesId: number },
  params: {
    lang?: StoryScriptLang;
    bibleCharacters: ReadonlyArray<{
      name: string;
      narrativeRole?: string | null;
      roleTier?: string | null;
      occupation?: string | null;
    }>;
    episodes: StoryScriptEpisodeInput[];
    idempotencyKey?: string;
  },
): Promise<VdCharacterDuplicateAnalysisResult> {
  const rosterRows = (await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, owner.seriesId),
      ),
    )) as VerticalDramaCharacterRow[];

  if (rosterRows.length === 0) {
    throw new Error("no_characters");
  }

  const aliasRows = await db
    .select({
      characterId: verticalDramaCharacterAliases.characterId,
      alias: verticalDramaCharacterAliases.alias,
    })
    .from(verticalDramaCharacterAliases)
    .where(
      and(
        eq(verticalDramaCharacterAliases.tenantId, owner.tenantId),
        eq(verticalDramaCharacterAliases.seriesId, owner.seriesId),
      ),
    );
  const aliasesByCharacterId = new Map<number, string[]>();
  for (const row of aliasRows) {
    const list = aliasesByCharacterId.get(row.characterId) ?? [];
    list.push(row.alias);
    aliasesByCharacterId.set(row.characterId, list);
  }

  const roster: VdCharacterDuplicateRosterInput[] = rosterRows.map(row => ({
    characterId: row.id,
    characterKey: row.characterKey,
    name: row.name,
    narrativeRole: row.narrativeRole,
    roleTier: row.roleTier,
    roleReviewStatus: row.roleReviewStatus,
    dataSource:
      typeof (row.data as Record<string, unknown> | null)?.source === "string"
        ? ((row.data as Record<string, unknown>).source as string)
        : null,
  }));

  const occurrenceEpisodes: VdCharacterDuplicateEpisodeInput[] = params.episodes.map(episode => ({
    episodeNumber: episode.episodeNumber,
    shots: (episode.shotDrafts ?? []).map(shot => ({
      characters: (shot as { characters?: ReadonlyArray<{ name: string }> }).characters,
      dialogueLines: shot.dialogue_lines?.map(line => ({ speaker: line.speaker })),
    })),
  }));
  const occurrenceStatsByExactName = computeCharacterNameOccurrenceStats(occurrenceEpisodes);

  const evidence = computeCharacterDuplicateEvidence({
    roster,
    bibleCharacterNames: params.bibleCharacters.map(c => c.name),
    occurrenceStatsByExactName,
    aliasesByCharacterId,
  });

  const { plan, creditsUsed, model } = await generateCharacterDuplicateAnalysis({
    userId: owner.userId,
    tenantId: owner.tenantId,
    seriesId: owner.seriesId,
    lang: params.lang,
    bibleCharacters: params.bibleCharacters,
    evidence,
    episodes: params.episodes,
    idempotencyKey: params.idempotencyKey,
  });

  const groups = reconcileCharacterDuplicatePlanIntoGroups(plan, evidence);

  return { seriesId: owner.seriesId, model, creditsUsed, groups };
}

/* -------------------------------------------------------------------------- */
/* Part 5 — merge (the only piece that writes; user-confirmed input only)   */
/* -------------------------------------------------------------------------- */

export type VdCharacterMergeErrorReason =
  | "empty_merge_list"
  | "keep_in_merge_list"
  | "row_not_found";

export class VdCharacterMergeError extends Error {
  constructor(
    public readonly reason: VdCharacterMergeErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "VdCharacterMergeError";
  }
}

/** Backing unique index for `(seriesId, normalizedAlias)` — see `drizzle/schema.ts`'s `verticalDramaCharacterAliases`. */
const CHARACTER_ALIAS_UNIQUE_CONSTRAINT = "vds_character_alias_unique";

/**
 * True only for an actual Postgres unique-violation (SQLSTATE 23505) on the
 * alias table's `(seriesId, normalizedAlias)` index — anything else
 * (connection drop, a totally unrelated constraint) must propagate to the
 * caller instead of being silently swallowed. Mirrors
 * `hermesConnectionJobs.ts`'s own `isHermesJobIdempotencyKeyConflict` shape,
 * including the `.cause` check for drizzle-orm-wrapped query errors (the real
 * postgres `.code`/`.constraint` live under `.cause`, not on the error
 * itself).
 */
function isCharacterAliasUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = (error as { cause?: unknown }).cause;
  const causeRecord =
    cause && typeof cause === "object" ? (cause as Record<string, unknown>) : undefined;
  const code = (error as { code?: unknown }).code ?? causeRecord?.code;
  if (code === "23505") return true;
  const constraint = (error as { constraint?: unknown }).constraint ?? causeRecord?.constraint;
  if (typeof constraint === "string" && constraint.includes(CHARACTER_ALIAS_UNIQUE_CONSTRAINT)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes(CHARACTER_ALIAS_UNIQUE_CONSTRAINT);
}

/**
 * Pure per-shot key-swap core, mirroring `verticalDramaShotCharacterRepair.ts`'s
 * `computeRepairedStartFramePlan` pure/DB split. Maps every entry of `refs`
 * through `keySwapMap` (a merged character's `characterKey` -> the surviving
 * canonical's own `characterKey`), then de-duplicates the result — UNLIKE the
 * repair tool's own "never remove an existing ref" rule, a merge's whole
 * point is that two previously-distinct ref slots now name the SAME person,
 * so collapsing them is correct here, not a data-loss bug.
 *
 * `changed` is `true` whenever ANY entry was actually remapped to a
 * different key — even a plain rename with no de-dup collision (array
 * length unchanged, same position) counts as changed. See
 * `computeCharacterKeySwapStartFramePlan`'s own doc comment for why this
 * still requires clearing the shot's baked prompt.
 */
export function computeCharacterKeySwapForShotRefs(
  refs: ReadonlyArray<string>,
  keySwapMap: ReadonlyMap<string, string>,
): { refs: string[]; changed: boolean } {
  let anyRemapped = false;
  const mapped = refs.map(ref => {
    const swapped = keySwapMap.get(ref);
    if (swapped !== undefined && swapped !== ref) anyRemapped = true;
    return swapped ?? ref;
  });
  if (!anyRemapped) {
    return { refs: refs.slice(), changed: false };
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const key of mapped) {
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(key);
  }
  return { refs: deduped, changed: true };
}

export interface VdCharacterKeySwapShotChange {
  shotNumber: number;
  beforeRefs: string[];
  afterRefs: string[];
  /** True when this shot's `imagePrompt` had non-empty content that was cleared — mirrors `VdShotCharacterRepairAddition.promptReset`. */
  promptReset: boolean;
}

/**
 * Pure merge core for `startFramePlan.frames[].requiredCharacterRefs`
 * rewriting (no DB access) — mirrors
 * `verticalDramaShotCharacterRepair.ts`'s `computeRepairedStartFramePlan`
 * shape exactly (pure core, re-read-before-write happens in the DB
 * orchestrator below).
 *
 * **Design decision — a KEY SWAP (not an addition) DOES clear the baked
 * `imagePrompt`, same as the repair tool's own addition case, for a
 * DIFFERENT but equally load-bearing reason:** `computeRepairedStartFramePlan`
 * clears the prompt because ADDING a ref shifts every later ref's positional
 * index, invalidating an explicit "Image N = character" mapping baked into
 * the prompt text. A pure rename-in-place does NOT shift position — but the
 * prompt text itself was authored when that slot named the OLD (now-merged)
 * character: any per-character description/likeness text the start-frame
 * skill embedded for that slot was written against the merged row's own
 * identity, which may include a different photo reference, wardrobe rule,
 * or name string than the surviving canonical row. Leaving the prompt
 * intact risks a stale "Image N = <old name>" label surviving a merge that
 * is specifically ABOUT that name being wrong. When de-duplication ALSO
 * collapses the array (two refs turned out to be the same merged pair in
 * one shot), the addition tool's own position-shift concern applies too.
 * Net: invalidate on ANY effective change (rename OR dedup-shrink) — more
 * conservative than the addition-only rule, deliberately, because identity
 * (not just position) changed underneath an existing slot.
 */
export function computeCharacterKeySwapStartFramePlan(params: {
  existingPlan: VerticalDramaStartFramePlan | null;
  keySwapMap: ReadonlyMap<string, string>;
}): { updatedPlan: VerticalDramaStartFramePlan; changedShots: VdCharacterKeySwapShotChange[] } {
  const { existingPlan, keySwapMap } = params;
  const emptyPlan: VerticalDramaStartFramePlan = {
    mode: "single_frame_per_shot",
    selectedImageModelId: "",
    frames: [],
  };
  if (!existingPlan || !Array.isArray(existingPlan.frames) || existingPlan.frames.length === 0 || keySwapMap.size === 0) {
    return { updatedPlan: existingPlan ?? emptyPlan, changedShots: [] };
  }

  const changedShots: VdCharacterKeySwapShotChange[] = [];
  let framesChanged = false;
  const frames = existingPlan.frames.map(frame => {
    const before = frame.requiredCharacterRefs ?? [];
    const { refs: after, changed } = computeCharacterKeySwapForShotRefs(before, keySwapMap);
    if (!changed) return frame;
    framesChanged = true;
    const promptReset = (frame.imagePrompt ?? "").trim().length > 0;
    changedShots.push({ shotNumber: frame.shotNumber, beforeRefs: before, afterRefs: after, promptReset });
    return {
      ...frame,
      requiredCharacterRefs: after,
      ...(promptReset ? { imagePrompt: "", negativePrompt: "" } : {}),
    };
  });

  if (!framesChanged) {
    return { updatedPlan: existingPlan, changedShots: [] };
  }
  return { updatedPlan: { ...existingPlan, frames }, changedShots };
}

export interface VdCharacterMergeSummary {
  keptCharacterId: number;
  mergedCharacterIds: number[];
  aliasesRecorded: string[];
  /** Count of pre-existing alias rows (that pointed at a now-merged character) successfully repointed to the surviving row. */
  aliasesCarriedOver: number;
  /** Count of surviving rows (including possibly the keep row itself) whose `parentCharacterId`/`sharesFaceWithCharacterId` were repointed away from a merged row. */
  dependentsRepointed: number;
  /** Count of `vertical_drama_character_assets` rows repointed to the surviving row. */
  assetsRepointed: number;
  episodesRewritten: Array<{
    episodeId: number;
    episodeNumber: number;
    shotsChanged: VdCharacterKeySwapShotChange[];
  }>;
}

/**
 * Merges `mergeCharacterIds` INTO `keepCharacterId` for one series, in ONE
 * `db.transaction`, in this exact order (see the plan's own risk table for
 * why the order matters — the self-FK repoint MUST happen before the
 * delete, or the delete hits the same PRECONDITION_FAILED-worthy FK wall
 * `deleteCharacter` (`verticalDramaCharacters.ts`) already guards against):
 *
 * (a) Re-read + owner-scope-verify EVERY row (tenantId+userId+seriesId) —
 *     never trust a client-supplied id's existence/ownership. Rejects when
 *     `keepCharacterId` is itself in `mergeCharacterIds`, or any row is
 *     missing/not owned/in a different series (all such rows would simply
 *     fail the single scoped `SELECT ... WHERE id IN (...)` count check).
 * (b) Records each merged row's own `name` as an alias of `keepCharacterId`
 *     (`source: "merge_recorded"`), normalized via `normalizeStoryCharacterName`
 *     — tolerates a 23505 unique violation (already an alias in this
 *     series) without aborting the merge. Also carries over any EXISTING
 *     alias rows that pointed at a merged character (repoints their
 *     `characterId` to `keepCharacterId`); a 23505 there means the keep row
 *     already owns an equivalent alias, so the stale row is left as-is —
 *     it cascade-deletes automatically in step (f) when its old
 *     `characterId` FK target is deleted.
 * (c) Repoints self-FKs (`parentCharacterId`/`sharesFaceWithCharacterId`) on
 *     every SURVIVING row (including the keep row itself) that pointed at a
 *     merged row — this MUST run before (f)'s delete. The keep row is
 *     handled as a special case: if the KEEP row's own `parentCharacterId`/
 *     `sharesFaceWithCharacterId` pointed at a merged row, it is set to
 *     `null` rather than to its own id (a self-referential FK would be
 *     nonsensical) — every OTHER surviving row gets repointed to
 *     `keepCharacterId` directly.
 * (d) Repoints `vertical_drama_character_assets.characterId` from any
 *     merged id to `keepCharacterId`.
 * (e) Rewrites `requiredCharacterRefs` in every episode's `startFramePlan`
 *     for this series: any merged row's `characterKey` -> the keep row's
 *     own `characterKey`, de-duplicated per shot. Re-reads the freshest
 *     `startFramePlan` per episode with `.for("update")` immediately before
 *     writing — same 2026-07-11 lost-update-race-fix shape
 *     `repairEpisodeShotCharacterReferences` already uses for concurrent
 *     writes to this same jsonb column.
 * (f) Deletes the merged rows. Story text (`bible.breakdownVersions[]`
 *     shot/dialogue content) is NEVER rewritten — binding user decision, see
 *     this file's own top-of-file doc comment.
 *
 * Throws `VdCharacterMergeError` for every precondition violation in (a) —
 * the router maps these to the correct `TRPCError` code.
 */
export async function mergeCharacters(
  owner: { tenantId: string; userId: number; seriesId: number },
  input: { keepCharacterId: number; mergeCharacterIds: number[] },
): Promise<VdCharacterMergeSummary> {
  const mergeIds = Array.from(new Set(input.mergeCharacterIds));
  if (mergeIds.length === 0) {
    throw new VdCharacterMergeError("empty_merge_list", "mergeCharacterIds must contain at least one character id");
  }
  if (mergeIds.includes(input.keepCharacterId)) {
    throw new VdCharacterMergeError(
      "keep_in_merge_list",
      "keepCharacterId cannot also appear in mergeCharacterIds",
    );
  }

  return db.transaction(async tx => {
    /* ---- (a) re-read + owner-scope-verify ---- */
    const allIds = [input.keepCharacterId, ...mergeIds];
    const rows = (await tx
      .select()
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.userId, owner.userId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId),
          inArray(verticalDramaCharacters.id, allIds),
        ),
      )) as VerticalDramaCharacterRow[];
    if (rows.length !== allIds.length) {
      throw new VdCharacterMergeError(
        "row_not_found",
        "One or more characters were not found for this tenant/user/series",
      );
    }
    const rowsById = new Map(rows.map(row => [row.id, row]));
    const keepRow = rowsById.get(input.keepCharacterId)!;
    const mergeRows = mergeIds.map(id => rowsById.get(id)!);

    /* ---- (b) alias recording + carry-over ---- */
    const aliasesRecorded: string[] = [];
    for (const mergeRow of mergeRows) {
      const alias = mergeRow.name.trim();
      const normalizedAlias = normalizeStoryCharacterName(mergeRow.name);
      try {
        await tx.insert(verticalDramaCharacterAliases).values({
          tenantId: owner.tenantId,
          seriesId: owner.seriesId,
          characterId: keepRow.id,
          alias,
          normalizedAlias,
          source: "merge_recorded",
        });
        aliasesRecorded.push(alias);
      } catch (error) {
        if (!isCharacterAliasUniqueViolation(error)) throw error;
        // Already an alias (of `keepRow` or of another character) in this
        // series — tolerated, does not abort the merge.
      }
    }

    const staleAliasRows = await tx
      .select({ id: verticalDramaCharacterAliases.id })
      .from(verticalDramaCharacterAliases)
      .where(
        and(
          eq(verticalDramaCharacterAliases.seriesId, owner.seriesId),
          inArray(verticalDramaCharacterAliases.characterId, mergeIds),
        ),
      );
    let aliasesCarriedOver = 0;
    for (const staleAliasRow of staleAliasRows) {
      try {
        await tx
          .update(verticalDramaCharacterAliases)
          .set({ characterId: keepRow.id })
          .where(eq(verticalDramaCharacterAliases.id, staleAliasRow.id));
        aliasesCarriedOver += 1;
      } catch (error) {
        if (!isCharacterAliasUniqueViolation(error)) throw error;
        // `keepRow` already owns an alias with the same normalizedAlias —
        // leave this stale row pointing at the merged character; it
        // cascade-deletes in step (f).
      }
    }

    /* ---- (c) repoint self-FKs on surviving rows (before delete) ---- */
    const parentRepointed = await tx
      .update(verticalDramaCharacters)
      .set({ parentCharacterId: keepRow.id, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.userId, owner.userId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId),
          inArray(verticalDramaCharacters.parentCharacterId, mergeIds),
          notInArray(verticalDramaCharacters.id, allIds),
        ),
      )
      .returning({ id: verticalDramaCharacters.id });
    const sharesFaceRepointed = await tx
      .update(verticalDramaCharacters)
      .set({ sharesFaceWithCharacterId: keepRow.id, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.userId, owner.userId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId),
          inArray(verticalDramaCharacters.sharesFaceWithCharacterId, mergeIds),
          notInArray(verticalDramaCharacters.id, allIds),
        ),
      )
      .returning({ id: verticalDramaCharacters.id });

    // The keep row itself: cannot repoint to its OWN id (self-reference),
    // so a merged-row FK on the keep row is cleared to `null` instead. See
    // this function's own doc comment step (c).
    let keepRowSelfRepointed = false;
    if (keepRow.parentCharacterId != null && mergeIds.includes(keepRow.parentCharacterId)) {
      await tx
        .update(verticalDramaCharacters)
        .set({ parentCharacterId: null, updatedAt: new Date() })
        .where(eq(verticalDramaCharacters.id, keepRow.id));
      keepRowSelfRepointed = true;
    }
    if (keepRow.sharesFaceWithCharacterId != null && mergeIds.includes(keepRow.sharesFaceWithCharacterId)) {
      await tx
        .update(verticalDramaCharacters)
        .set({ sharesFaceWithCharacterId: null, updatedAt: new Date() })
        .where(eq(verticalDramaCharacters.id, keepRow.id));
      keepRowSelfRepointed = true;
    }
    const dependentsRepointed =
      parentRepointed.length + sharesFaceRepointed.length + (keepRowSelfRepointed ? 1 : 0);

    /* ---- (d) repoint character asset links ---- */
    const assetsRepointedRows = await tx
      .update(verticalDramaCharacterAssets)
      .set({ characterId: keepRow.id, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
          inArray(verticalDramaCharacterAssets.characterId, mergeIds),
        ),
      )
      .returning({ id: verticalDramaCharacterAssets.id });

    /* ---- (e) rewrite startFramePlan character-key refs across episodes ---- */
    const keySwapMap = new Map<string, string>(mergeRows.map(row => [row.characterKey, keepRow.characterKey]));
    const episodeRows = await tx
      .select({ id: verticalDramaEpisodes.id, episodeNumber: verticalDramaEpisodes.episodeNumber })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        ),
      );

    const episodesRewritten: VdCharacterMergeSummary["episodesRewritten"] = [];
    for (const episodeRow of episodeRows) {
      const episodeFilter = and(
        eq(verticalDramaEpisodes.id, episodeRow.id),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
      );
      // Re-read the freshest plan under a row lock immediately before
      // computing/writing — same lost-update-race-fix shape
      // `repairEpisodeShotCharacterReferences` already uses for this same
      // jsonb column.
      const [freshRow] = await tx
        .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
        .from(verticalDramaEpisodes)
        .where(episodeFilter)
        .for("update")
        .limit(1);
      const existingPlan = (freshRow?.startFramePlan as VerticalDramaStartFramePlan | null) ?? null;
      if (!existingPlan) continue;

      const { updatedPlan, changedShots } = computeCharacterKeySwapStartFramePlan({
        existingPlan,
        keySwapMap,
      });
      if (changedShots.length === 0) continue;

      await tx.update(verticalDramaEpisodes).set({ startFramePlan: updatedPlan, updatedAt: new Date() }).where(episodeFilter);
      episodesRewritten.push({ episodeId: episodeRow.id, episodeNumber: episodeRow.episodeNumber, shotsChanged: changedShots });
    }

    /* ---- (f) delete the merged rows ---- */
    await tx
      .delete(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.userId, owner.userId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId),
          inArray(verticalDramaCharacters.id, mergeIds),
        ),
      );

    /* ---- (g) summary ---- */
    return {
      keptCharacterId: keepRow.id,
      mergedCharacterIds: mergeIds,
      aliasesRecorded,
      aliasesCarriedOver,
      dependentsRepointed,
      assetsRepointed: assetsRepointedRows.length,
      episodesRewritten,
    };
  });
}
