/**
 * Vertical Drama Series — Feature 132 shared quality-criteria module
 * (spec `specs/feature/132-vertical-drama-story-character-quality-engine/spec.md`
 * §7 dialogue rules v2, §6.1 scene contracts, §8 dramaturgy/scorecard v3,
 * §11 "Unified Criteria Application"; plan
 * `sections/section-01-shared-criteria-and-flags.md`).
 *
 * This is the SINGLE source of dialogue-rules text, scene-contract
 * requirement text, dramaturgy rules text, clue-budget constants,
 * anchor-line cadence, scorecard dimension name constants, and the finding
 * severity taxonomy for the whole Feature 132 quality engine. Every later
 * Feature 132 section (dialogue/QC/revision/character/continuity) MUST
 * import from this module rather than re-declaring any of these rules,
 * numbers, or dimension names — this is what makes "one criteria set
 * everywhere" (spec §1.1 goal 6 / §11) actually true instead of aspirational.
 *
 * Pure TS, provider-free, no server/db imports — safe to import from both
 * server code and (in principle) client code, mirroring the
 * `createSeriesFieldLimits.ts` idiom (single source of truth + agreement
 * test elsewhere guards drift).
 *
 * Ownership note (post-completeness-audit addition, confirmed in Section
 * 01's plan file and cross-confirmed by Section 05's Goal section): this
 * file is the CONFIRMED SOLE AUTHOR of the §7.1 dialogue-rules-v2 fragment
 * TEXT. Section 05 supplies check logic (deterministic metrics, the
 * name-blind voice-distinctness check) and consumption wiring only — it
 * never edits this file's fragment text. The fragment below covers, per
 * Section 05's full content checklist, verbatim in substance: mystery
 * grounding incl. the `storyFunction`-ritual-exemption clause;
 * pressure-not-summary; clue budget incl. "minimal context per clue";
 * anchor-line cadence; read-aloud one-idea-per-line; and Thai
 * spoken-register rules (particles, contractions, no written-essay
 * connectives, formality matching, narration-is-a-violation).
 *
 * `CRITERIA_VERSION` is a manual, deliberate integer bump (not a content
 * hash) — scorecards and run artifacts stamp the version used so
 * mixed-version seasons are auditable (spec §11 "Version note").
 */

/* -------------------------------------------------------------------------- */
/* Version                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Current version of the unified quality criteria. Bump this manually
 * whenever the dialogue-rules/scene-contract/dramaturgy text below changes
 * in a way that should invalidate prior scorecards' comparability. Starts at
 * `1` — no prior versioned criteria exist.
 */
export const CRITERIA_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Constants (spec §7.1 / §7.2)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Clue budget: at most this many NEW important names/objects/dates/lore
 * terms may be introduced per shot (spec §7.1 "Clue budget").
 */
export const QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT = 2;

/**
 * Anchor lines must appear at least once every this-many shots (spec §7.1
 * "Anchor lines: at least one per 2-3 shots" — the deterministic gap check
 * (`anchor_line_gap`, spec §7.2) treats a gap strictly greater than this
 * value as a `missing_anchor_line` finding).
 */
export const QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS = 3;

/* -------------------------------------------------------------------------- */
/* Severity taxonomy (spec §8.3)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Severity taxonomy attached to every Feature 132 QC finding (spec §8.3),
 * used by the targeted revision engine (§9) to decide what may escalate
 * revision scope. Order is meaningful (ascending severity) and MUST NOT be
 * reordered — later sections may rely on array index for comparisons.
 */
export const QUALITY_FINDING_SEVERITIES = [
  "minor",
  "moderate",
  "major",
  "structural",
] as const;

export type VerticalDramaQualityFindingSeverity =
  (typeof QUALITY_FINDING_SEVERITIES)[number];

/* -------------------------------------------------------------------------- */
/* Scorecard v3 dimension names (spec §8.3) — additive to existing v1/v2     */
/* -------------------------------------------------------------------------- */

/**
 * The four NEW scorecard v3 dimensions (spec §8.3): additive to the existing
 * v1 (`verticalDramaEpisodeQualityReview.ts` contract_version 1) and v2
 * dimensions — this module does not redefine or re-export the existing
 * dimension names, only the new ones scorecard v3 introduces.
 */
export const QUALITY_CRITERIA_V3_SCORECARD_DIMENSIONS = [
  "clarity",
  "character_consistency",
  "evidence_payoff",
  "threat_escalation",
] as const;

export type VerticalDramaQualityV3ScorecardDimension =
  (typeof QUALITY_CRITERIA_V3_SCORECARD_DIMENSIONS)[number];

/* -------------------------------------------------------------------------- */
/* Prompt fragment: dialogue rules v2 (spec §7.1)                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns the §7.1 dialogue-rules-v2 prompt fragment, stamped with the
 * criteria version marker so consuming prompts/outputs are greppable by the
 * agreement test (`verticalDramaQualityCriteria.agreement.test.ts`).
 *
 * Content checklist this fragment MUST cover (per Section 05's Goal
 * section, verbatim in substance, not a subset):
 * - mystery-grounding, incl. the `storyFunction` ritual/dreamlike exemption
 *   clause (verbatim, not just the density cap)
 * - pressure-not-summary
 * - clue budget, incl. "minimal context per clue"
 * - anchor-line cadence
 * - read-aloud one-idea-per-line
 * - Thai spoken-register rules (particles, contractions, no written-essay
 *   connectives, formality matching, narration-is-a-violation)
 * - distinct voices / speech-profile consistency
 */
export function buildDialogueRulesV2Fragment(): string {
  return `<!-- VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->
DIALOGUE QUALITY RULES v2 (criteria v${CRITERIA_VERSION}):
- Mystery must be understandable, not merely vague. Every abstract/poetic/
  symbolic line must be grounded by a clear line before or after it. Max 1
  poetic/mysterious key line per shot, UNLESS the scene contract's
  storyFunction explicitly requires ritual/dreamlike speech — in that case
  the density cap does not apply to that shot.
- Dialogue reveals pressure, not plot summary. A line carrying information
  must also carry emotion, fear, doubt, urgency, resistance, or intention.
  Never merely describe what the visual already shows.
- Clue budget: at most ${QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT} new important
  names/objects/dates/lore terms per shot; every new clue gets minimal context
  per clue — what it is, why it matters, what to remember. New clues must
  map to the shot's contract.newClueIds.
- Anchor lines: at least one every ${QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS} shots at most
  (roughly one per 2-3 shots) — a simple, direct, speakable line that
  consolidates what the audience should understand so far (who the clues
  point to / what changed / how the threat grew / what to follow next).
- Read-aloud: one main idea per spoken line; split long/dense/explanatory
  lines (extends the existing speakability HARD RULE).
- Spoken register (ภาษาพูด ไม่ใช่ภาษาเขียน): dialogue must use the natural
  spoken register of the series locale — for Thai: natural particles
  (สิ/นะ/ล่ะ/เหรอ) where the character's speech profile allows, contractions
  and ellipsis as real speakers use them, no written-essay connectives
  (อย่างไรก็ตาม, ดังนั้น, เนื่องจาก) in casual speech, and formality level
  matched to the relationship between speakers. A line that reads like
  narration or a news report is a violation even if it is short and clear.
- Distinct voices: every line must be consistent with the speaker's speech
  profile; with names removed, major characters should remain identifiable
  by rhythm, word choice, and attitude.
<!-- /VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->`;
}

/* -------------------------------------------------------------------------- */
/* Prompt fragment: scene-contract requirements (spec §6.1)                   */
/* -------------------------------------------------------------------------- */

/**
 * Required field names of the per-shot scene `contract` object (spec §6.1),
 * exported so tests and consumers can validate against a single list rather
 * than re-typing field names.
 */
export const QUALITY_CRITERIA_SCENE_CONTRACT_REQUIRED_FIELDS = [
  "storyFunction",
  "emotionalBeat",
  "audienceTakeaway",
  "tensionSource",
  "newClueIds",
  "dialoguePurpose",
] as const;

/**
 * Optional field names of the per-shot scene `contract` object (spec §6.1)
 * — present only when applicable to the shot.
 */
export const QUALITY_CRITERIA_SCENE_CONTRACT_OPTIONAL_FIELDS = [
  "characterDecision",
  "continuityDependency",
  "anchorLine",
] as const;

/**
 * Returns the §6.1 scene-contract requirement prompt fragment, stamped with
 * the criteria version marker.
 */
export function buildSceneContractRequirementsFragment(): string {
  return `<!-- VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->
SCENE CONTRACT REQUIREMENTS (criteria v${CRITERIA_VERSION}):
Every shot must emit a "contract" object with these required fields:
- storyFunction — one clear function for this shot
- emotionalBeat — one beat
- audienceTakeaway — what the viewer must retain
- tensionSource — the conflict/pressure present in this shot
- newClueIds[] — references into the evidence ledger; at most
  ${QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT} per shot
- dialoguePurpose — what the dialogue in this shot is for
And these optional fields, present only when applicable:
- characterDecision — set when a decision happens in this shot
- continuityDependency — the earlier fact this shot relies on, if any
- anchorLine — true when this shot carries an anchor line (see dialogue
  rules v2)
<!-- /VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->`;
}

/* -------------------------------------------------------------------------- */
/* Prompt fragment: dramaturgy rules (want/obstacle/choice/cost, etc.)       */
/* -------------------------------------------------------------------------- */

/**
 * Returns the episode dramaturgy rules prompt fragment (want/obstacle/
 * choice/cost, escalation, activation — spec §8.1 Structure/Character/Threat
 * pass concerns), stamped with the criteria version marker.
 */
export function buildDramaturgyRulesFragment(): string {
  return `<!-- VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->
DRAMATURGY RULES (criteria v${CRITERIA_VERSION}):
- Every episode must have a derivable want/obstacle/choice/cost for its
  protagonist; a reader must be able to point at which shots carry each.
- Threat or consequence must increase every episode (non-decreasing
  escalation intent) — no stretch of more than 2 episodes without escalation.
- Major characters must be activated (mentioned, appear, act, and cause
  plot impact) before the season's midpoint, or be flagged as weak/dormant.
- A decision a character makes must have a traceable consequence later in
  the season; consequences must not be silently dropped.
- World rules, once introduced, must be used again and must create a
  meaningful character choice, or they are flagged for revision.
<!-- /VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->`;
}

/**
 * Returns the fixed, greppable criteria version marker literal that
 * consumer prompts must embed and consumer outputs must stamp as
 * `criteriaVersion`. Shared low-level primitive; the server-side wrapper
 * (`server/services/verticalDramaQualityCriteria.ts`) re-exports this as
 * `renderCriteriaVersionMarker()` for consumer convenience.
 */
export function buildCriteriaVersionMarker(): string {
  return `<!-- VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->`;
}
