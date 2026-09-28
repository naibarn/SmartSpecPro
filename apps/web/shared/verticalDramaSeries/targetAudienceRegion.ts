/**
 * Vertical Drama Series — target-audience region (spec feature 131 follow-up,
 * 2026-07-06 character-prompt quality upgrade).
 *
 * Additive series-level setting controlling the default ethnicity/regional
 * styling look for every AI-generated character/person image (portraits,
 * turnarounds, character sheets, start frames, angle-grid variations, image
 * repairs). Stored inside the EXISTING `verticalDramaSeries.bible` jsonb
 * column (`VerticalDramaSeriesBible.targetAudienceRegion`) — no new DB
 * column, no migration.
 *
 * IMPORTANT — precedence rule: this is only a DEFAULT. Whenever an
 * individual character's own `description` states an explicit
 * ethnicity/nationality/region, THAT description always wins over the
 * series-level region default. Every prompt-building call site that injects
 * the region descriptor must phrase it as a default/fallback, never as an
 * override instruction.
 */

export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS = [
  "thai",
  "east_asian",
  "southeast_asian",
  "south_asian",
  "western",
  "latin",
  "middle_eastern",
  "african",
  "global_mixed",
] as const;

export type VerticalDramaTargetAudienceRegion =
  (typeof VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS)[number];

export const VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION: VerticalDramaTargetAudienceRegion =
  "thai";

/**
 * English descriptor phrases injected verbatim into LLM prompts (system/user
 * prompts are English-language internally even for Thai-facing UI copy — see
 * every other `*PromptGeneration.ts`/`*Formatter.ts` module in this feature).
 * Kept short and concrete so it fits comfortably inside the shared 3500-char
 * image-prompt budget across every call site.
 */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "Thai/Southeast Asian features and styling appropriate for Thai audiences",
  east_asian: "East Asian (Chinese/Korean/Japanese) features and styling",
  southeast_asian: "Southeast Asian (e.g. Thai, Vietnamese, Filipino, Indonesian, Malaysian) features and styling",
  south_asian: "South Asian (e.g. Indian, Pakistani, Bangladeshi, Sri Lankan) features and styling",
  western: "Western/Caucasian features and styling",
  latin: "Latin American/Hispanic features and styling",
  middle_eastern: "Middle Eastern/Arab features and styling",
  african: "African/Black features and styling",
  global_mixed: "a globally mixed/multiracial look with no single dominant ethnicity",
};

/** Thai UI labels for the series-settings region picker. */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "ไทย",
  east_asian: "เอเชียตะวันออก (จีน/เกาหลี/ญี่ปุ่น)",
  southeast_asian: "เอเชียตะวันออกเฉียงใต้",
  south_asian: "เอเชียใต้",
  western: "ตะวันตก",
  latin: "ลาตินอเมริกา",
  middle_eastern: "ตะวันออกกลาง",
  african: "แอฟริกา",
  global_mixed: "หลากหลายเชื้อชาติ (ผสมทั่วโลก)",
};

/** English UI labels for the series-settings region picker. */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "Thai",
  east_asian: "East Asian (Chinese/Korean/Japanese)",
  southeast_asian: "Southeast Asian",
  south_asian: "South Asian",
  western: "Western",
  latin: "Latin American",
  middle_eastern: "Middle Eastern",
  african: "African",
  global_mixed: "Global mixed",
};

/** Type guard / safe parser — falls back to the default for unknown/missing values. */
export function normalizeTargetAudienceRegion(
  value: unknown,
): VerticalDramaTargetAudienceRegion {
  if (
    typeof value === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(value)
  ) {
    return value as VerticalDramaTargetAudienceRegion;
  }
  return VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION;
}

/**
 * Build the concise, English, DEFAULT-only instruction sentence to append to
 * a person-generating prompt's user-instruction payload. Always phrased as a
 * fallback default so an explicit character `description` (ethnicity/
 * nationality) remains authoritative — callers must place any character
 * `description` text so the LLM/image model sees it as the more specific,
 * overriding source.
 */
export function buildTargetAudienceRegionInstruction(
  region: VerticalDramaTargetAudienceRegion | null | undefined,
): string {
  const resolved = normalizeTargetAudienceRegion(region);
  const descriptor = VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[resolved];
  return (
    `Default region/ethnicity (series-level target audience setting): ${descriptor}. ` +
    "Apply this ONLY as a default when the character's own description does not already " +
    "state an ethnicity/nationality/region — an explicit ethnicity/nationality in the " +
    "character's description always takes precedence over this default."
  );
}

/** Read `targetAudienceRegion` off a loosely-typed series `bible` jsonb payload. */
export function readTargetAudienceRegionFromBible(
  bible: Record<string, unknown> | null | undefined,
): VerticalDramaTargetAudienceRegion {
  return normalizeTargetAudienceRegion(bible?.targetAudienceRegion);
}

/**
 * Was `targetAudienceRegion` ACTUALLY chosen by the series owner (a valid
 * enum value stored on `bible.targetAudienceRegion`), as opposed to a series
 * that never set it — where `readTargetAudienceRegionFromBible` above still
 * returns a value, but only because `normalizeTargetAudienceRegion` silently
 * falls back to the hardcoded global default (`"thai"`)?
 *
 * `readTargetAudienceRegionFromBible`'s return value alone cannot answer this
 * — it always collapses "series set it" and "series never touched it" into
 * one normalized region. This function is the missing distinction
 * (`planning/vd-character-prompt-followups/plan.md` Item 1): it lets callers
 * enforce the D1 (validator-retry)/D2 (anchor-prepend) deterministic guards
 * for a series-level default the owner actually picked, WITHOUT also
 * deterministically stamping a region nobody chose onto every series that
 * never touched this setting.
 */
export function isTargetAudienceRegionExplicitlySetInBible(
  bible: Record<string, unknown> | null | undefined,
): boolean {
  const value = bible?.targetAudienceRegion;
  return (
    typeof value === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Per-character region/ethnicity override (planning/vd-per-character-        */
/* ethnicity/plan.md, 2026-07-17)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Short, lowercase keyword(s) that plausibly appear in prose honoring this
 * region's descriptor above — used ONLY for the deterministic containment
 * check (`promptContainsRegionEthnicityAnchor`) and to guarantee the
 * deterministic fallback prepend (`ensureRegionEthnicityAnchorPresent`)
 * always leaves a detectable anchor behind (every keyword here is a
 * substring of its region's own `VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS`
 * entry, lowercased — so prepending the descriptor is always
 * self-verifying). Deliberately NOT used to author prompt prose — the skill
 * remains the sole author of wording; this list only lets TS verify a fact
 * landed in the string, same "TS computes/guards facts, the skill owns
 * creative prose" convention as `feedback_skill_first_authoring`.
 */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS: Record<
  VerticalDramaTargetAudienceRegion,
  readonly string[]
> = {
  thai: ["thai", "southeast asian"],
  east_asian: ["east asian", "chinese", "korean", "japanese"],
  southeast_asian: ["southeast asian", "thai", "vietnamese", "filipino", "indonesian", "malaysian"],
  south_asian: ["south asian", "indian", "pakistani", "bangladeshi", "sri lankan"],
  western: ["western", "caucasian"],
  latin: ["latin american", "hispanic", "latino", "latina"],
  middle_eastern: ["middle eastern", "arab"],
  african: ["african", "black"],
  global_mixed: ["mixed", "multiracial"],
};

/**
 * Per-character override input — the two new `verticalDramaCharacters.data`
 * keys (`region`/`ethnicityText`), read straight off a character row's
 * jsonb `data` column by `readCharacterRegionOverrideFromData` below. Kept
 * as a standalone input type (rather than accepting the whole `data` blob)
 * so `resolveCharacterTargetAudienceRegion` stays decoupled from the
 * character row shape and is trivially unit-testable.
 */
export interface VerticalDramaCharacterRegionOverrideInput {
  /** Dropdown override (`character.data.region`) — one of the 9 preset keys. */
  region?: VerticalDramaTargetAudienceRegion | string | null;
  /** Free-text override (`character.data.ethnicityText`) — wins over `region` when both are set (user decision, 2026-07-17). */
  ethnicityText?: string | null;
}

/**
 * Where a resolved character region/ethnicity came from — `"character_free_text"`
 * and `"character_region"` are the two NEW explicit per-character sources
 * (precedence levels 1–2 in the plan); `"series_default"` covers BOTH
 * pre-existing precedence levels 4 (series `targetAudienceRegion`) and 5
 * (global `"thai"` default) — the caller always passes
 * `readTargetAudienceRegionFromBible`'s result as `seriesDefaultRegion`,
 * which already collapses "series bible has a region" vs "series bible has
 * none" into one normalized region value, so this resolver alone cannot
 * distinguish between those two levels from `seriesDefaultRegion` alone.
 *
 * `planning/vd-character-prompt-followups/plan.md` Item 1 (2026-07-31) adds
 * that missing distinction via the SEPARATE `seriesRegionIsExplicit`
 * parameter below (sourced from `isTargetAudienceRegionExplicitlySetInBible`)
 * — see `enforceDeterministically`'s doc comment on the return type.
 *
 * Precedence level 3 ("explicit ethnicity already in the character's own
 * `description`") is DELIBERATELY NOT modeled here — it was, and remains,
 * the skill's own responsibility (skill.md's pre-existing "explicit
 * ethnicity in the character's own description always wins" rule), since
 * this resolver never receives/parses free-form description text. What
 * DOES change: when this resolver returns `isExplicit: true` (levels 1–2),
 * the injected instruction (`buildCharacterRegionEthnicityInstruction`)
 * explicitly tells the skill that fact now OUTRANKS level 3 too — see that
 * function's own doc comment.
 */
export type VerticalDramaCharacterRegionSource =
  | "character_free_text"
  | "character_region"
  | "series_default";

export interface VerticalDramaResolvedCharacterRegion {
  source: VerticalDramaCharacterRegionSource;
  /** `true` only for `"character_free_text"`/`"character_region"` — the two
   *  PER-CHARACTER sources. Gates the character-specific payload fact
   *  (`region_ethnicity` on the character object) and the additional
   *  `buildCharacterRegionEthnicityInstruction` override instruction line
   *  (both phrased as "the user picked this fact for THIS character in the
   *  character editor" — wording that would be FALSE for a series-level
   *  default, so it must stay gated on this flag, not on
   *  `enforceDeterministically` below). `false` for `"series_default"` —
   *  unchanged from before Item 1, so an unset character's payload/prompt
   *  stays byte-identical to pre-existing behavior. */
  isExplicit: boolean;
  /** `true` whenever the deterministic D1 (validator corrective-retry) and
   *  D2 (`ensureRegionEthnicityAnchorPresent` fallback-prepend) enforcement
   *  layers should run (`planning/vd-character-prompt-followups/plan.md`
   *  Item 1, 2026-07-31). `true` for both per-character explicit sources
   *  (`isExplicit`) AND for `"series_default"` when the series owner
   *  actually chose a region (`seriesRegionIsExplicit: true` passed into
   *  `resolveCharacterTargetAudienceRegion`). `false` only when the region
   *  is the un-set global fallback that nobody selected — deliberately NOT
   *  deterministically enforced, so a series whose owner never touched this
   *  setting is never silently stamped with "Thai/Southeast Asian features"
   *  as if that were a user choice. */
  enforceDeterministically: boolean;
  /** Nearest preset region — always a valid enum value, even for a free-text
   *  override (best-effort normalized from the character's own `region`
   *  field or the series default), so callers needing the enum (e.g. legacy
   *  `buildTargetAudienceRegionInstruction` call sites) always have one. */
  region: VerticalDramaTargetAudienceRegion;
  /** Full descriptor sentence — used both inside the injected LLM
   *  instruction and as the literal text `ensureRegionEthnicityAnchorPresent`
   *  prepends. */
  descriptor: string;
  /** Lowercase keyword(s) `promptContainsRegionEthnicityAnchor` checks for
   *  (case-insensitive substring match) — for a free-text override this is
   *  just the trimmed free text itself, lowercased. */
  anchorKeywords: readonly string[];
}

/**
 * Resolves a character's explicit `{region?, ethnicityText?}` override
 * (from `verticalDramaCharacters.data`) plus the series-level default region
 * (`readTargetAudienceRegionFromBible`'s result) into ONE authoritative
 * descriptor + short anchor-keyword list. Precedence (2026-07-17 decision):
 *   1. `ethnicityText` (free text) — wins over `region` when both are set.
 *   2. `region` (dropdown).
 *   3. (not modeled here — see `VerticalDramaCharacterRegionSource` doc
 *      comment) explicit ethnicity in the character's own `description`.
 *   4/5. `seriesDefaultRegion` (already collapses the series default and the
 *      global `"thai"` default into one normalized value).
 *
 * @param seriesRegionIsExplicit — (`planning/vd-character-prompt-followups/
 *   plan.md` Item 1, 2026-07-31, additive/optional — defaults to `false` so
 *   every pre-existing call site that doesn't pass it stays byte-identical)
 *   the result of `isTargetAudienceRegionExplicitlySetInBible` on the SAME
 *   series `bible` the caller derived `seriesDefaultRegion` from. Only
 *   affects the `"series_default"` branch's `enforceDeterministically` flag
 *   — never `isExplicit`, which keeps its exact pre-existing per-character-only
 *   meaning (see that field's own doc comment on the return type).
 *
 * Pure and side-effect-free — never touches the DB, matching the
 * `resolveEffectiveCharacterFacts`/`extractCharacterDescription` convention
 * in `verticalDramaCharacters.ts`.
 */
export function resolveCharacterTargetAudienceRegion(
  characterOverride: VerticalDramaCharacterRegionOverrideInput | null | undefined,
  seriesDefaultRegion: VerticalDramaTargetAudienceRegion | null | undefined,
  seriesRegionIsExplicit = false,
): VerticalDramaResolvedCharacterRegion {
  const freeText =
    typeof characterOverride?.ethnicityText === "string"
      ? characterOverride.ethnicityText.trim()
      : "";
  if (freeText) {
    return {
      source: "character_free_text",
      isExplicit: true,
      enforceDeterministically: true,
      region: normalizeTargetAudienceRegion(characterOverride?.region ?? seriesDefaultRegion),
      descriptor: `${freeText} ethnicity/appearance (explicitly specified by the user for this character)`,
      anchorKeywords: [freeText.toLowerCase()],
    };
  }

  const rawRegion = characterOverride?.region;
  if (
    typeof rawRegion === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(rawRegion)
  ) {
    const region = rawRegion as VerticalDramaTargetAudienceRegion;
    return {
      source: "character_region",
      isExplicit: true,
      enforceDeterministically: true,
      region,
      descriptor: VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[region],
      anchorKeywords: VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS[region],
    };
  }

  const resolvedDefault = normalizeTargetAudienceRegion(seriesDefaultRegion);
  return {
    source: "series_default",
    isExplicit: false,
    // Item 1: enforce D1/D2 for a series-level region the owner actually
    // chose; leave the un-set global fallback un-enforced (nobody picked it).
    enforceDeterministically: Boolean(seriesRegionIsExplicit),
    region: resolvedDefault,
    descriptor: VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[resolvedDefault],
    anchorKeywords: VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS[resolvedDefault],
  };
}

/**
 * Reads the two new per-character override keys off a character row's
 * loosely-typed jsonb `data` column — mirrors `extractCharacterDescription`'s
 * "tolerant, never throws on a malformed value" convention (a non-string
 * `region`/`ethnicityText` — e.g. legacy garbage data — is silently treated
 * as absent, never crashes). Callers pass the result straight into
 * `resolveCharacterTargetAudienceRegion` as `characterOverride`.
 */
export function readCharacterRegionOverrideFromData(
  data: Record<string, unknown> | null | undefined,
): VerticalDramaCharacterRegionOverrideInput {
  return {
    region: typeof data?.region === "string" ? data.region : undefined,
    ethnicityText: typeof data?.ethnicityText === "string" ? data.ethnicityText : undefined,
  };
}

/**
 * Builds the instruction line for an EXPLICIT per-character region/ethnicity
 * (`resolved.isExplicit === true` — precedence levels 1–2 only). Unlike
 * `buildTargetAudienceRegionInstruction` (which is always phrased as a
 * DEFAULT a character's own description can override), this is phrased as an
 * OVERRIDE: the user picked this fact for THIS character specifically, in
 * the character editor, so it must outrank BOTH the series-level default AND
 * any ethnicity/nationality implied elsewhere in the character's own
 * `description`/backstory (precedence level 3) — the opposite precedence
 * `buildTargetAudienceRegionInstruction` documents for the series default.
 * Callers must ALSO keep sending `buildTargetAudienceRegionInstruction` for
 * back-compat (this is an ADDITIONAL line, not a replacement) — see
 * `verticalDramaCharacterImageGeneration.ts`'s prompt builders.
 *
 * For a non-explicit `resolved` (an unset character), returns the byte-
 * identical `buildTargetAudienceRegionInstruction(resolved.region)` line —
 * callers should simply not call this function at all for an unset
 * character (this branch exists only so the function is total/safe to call
 * unconditionally in tests).
 */
export function buildCharacterRegionEthnicityInstruction(
  resolved: VerticalDramaResolvedCharacterRegion,
): string {
  if (!resolved.isExplicit) {
    return buildTargetAudienceRegionInstruction(resolved.region);
  }
  return (
    `Character-specific ethnicity/region requirement (explicitly set by the user for THIS ` +
    `character in the character editor — NOT merely the series-level default): ${resolved.descriptor}. ` +
    `This is MORE SPECIFIC than, and OVERRIDES, both the series-level default region AND any ` +
    `ethnicity/nationality implied elsewhere in this character's own description/backstory. ` +
    `You MUST make this look unmistakably present, in-line, in the prose of primary_portrait_prompt ` +
    `(not only as a separate note) — a downstream image model only ever sees that one string.`
  );
}

/**
 * Deterministic (never LLM-dependent) case-insensitive substring check —
 * does the assembled prompt text already contain SOME plausible token of
 * `resolved`'s required look? Used by both the validator-retry (D1) and the
 * fallback-prepend guard (D2, via `ensureRegionEthnicityAnchorPresent`).
 */
export function promptContainsRegionEthnicityAnchor(
  promptText: string | null | undefined,
  resolved: VerticalDramaResolvedCharacterRegion,
): boolean {
  if (!promptText) return false;
  const haystack = promptText.toLowerCase();
  return resolved.anchorKeywords.some(
    (keyword) => keyword.length > 0 && haystack.includes(keyword),
  );
}

/**
 * Last-resort DETERMINISTIC guarantee (D2, `planning/vd-per-character-
 * ethnicity/plan.md`): if `promptText` does not already contain one of
 * `resolved`'s anchor keywords, prepend `resolved.descriptor` as a leading
 * sentence. Idempotent — re-running this on its own output is a no-op,
 * because `resolved.descriptor` always contains at least one of its own
 * `anchorKeywords` (see that field's doc comment), so the containment check
 * above finds the anchor already present on the second call.
 *
 * This enforces a USER-STATED FACT (the character's own explicit
 * region/ethnicity choice) — the SAME class of deterministic guard as the
 * DNA face-fingerprint check and the fail-closed model-selection guards
 * already in this codebase (`project_vd_dna_fingerprint_wardrobe_and_
 * occupation_fallback`) — NOT a rewrite of the LLM's creative prose: it only
 * ever prepends, never edits/reorders the model's own sentence. Consistent
 * with `feedback_skill_first_authoring`: TS enforces the FACT, the skill
 * still owns 100% of the creative prose that follows it.
 */
export function ensureRegionEthnicityAnchorPresent(
  promptText: string,
  resolved: VerticalDramaResolvedCharacterRegion,
): string {
  if (promptContainsRegionEthnicityAnchor(promptText, resolved)) {
    return promptText;
  }
  return `${resolved.descriptor}. ${promptText}`;
}
