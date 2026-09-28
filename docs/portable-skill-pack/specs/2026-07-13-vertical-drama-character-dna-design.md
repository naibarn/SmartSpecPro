# Vertical Drama Character DNA Design

Status: approved and implemented
Date: 2026-07-13
Primary surface: Vertical Drama > Characters tab

## 1. Problem

The Characters tab already invokes the runtime skill at
`apps/web/skills/vertical-drama-character-visual-bible/skill.md` through
`verticalDramaCharacterImageGeneration.ts`. The skill has strong role-tier,
child-safety, identity-lock, sheet, and image-prompt rules, but the design step is
still under-informed:

- The runtime currently sends only one target character plus series title, genre,
  and tone.
- It does not send the rest of the current cast, so the skill cannot deliberately
  separate two characters in the same series.
- It does not send real recent-series character data, so the skill cannot honestly
  enforce the guide's cross-series anti-clone rules.
- The generated character-level visual bible is transient. The router exposes only
  the series-level summary and does not persist the selected character DNA.
- Repeated first-generation calls can therefore redesign a character instead of
  continuing from one approved design decision.

The result may be attractive, but attractiveness can be generic, disconnected from
the story, too similar to another cast member, or too similar to leads from prior
series. The system needs to select a character design from evidence rather than
decorate a generic role archetype.

## 2. Goals

1. Derive a series-level Character DNA from the actual story world before deciding
   individual facial appearance.
2. Design each character from role, age, social world, profession, emotional wound,
   public persona, hidden contradiction, and story function.
3. Preserve mobile emotional readability and commercially effective screen presence
   without falling back to generic AI beauty, corporate-headshot styling, or repeated
   CEO/idol faces.
4. Deliberately contrast the target character with the current cast.
5. Compare lead designs with real data from the owner's 3-5 most recent series in the
   same tenant.
6. Generate at least three internal candidate directions, score them, and select the
   strongest direction before writing image prompts.
7. Persist the approved DNA in the existing `verticalDramaCharacters.data.visualBible`
   JSONB object, without a database migration.
8. Preserve all existing child-safety, reference-lock, face-source, sheet-generation,
   prompt-length, and custom-instruction behavior.
9. Remain backward compatible with legacy character rows and legacy clients that do
   not yet send an approved DNA snapshot.

## 3. Non-goals

- No new database table, migration, external vector store, or image-similarity model.
- No vision-based judgment of rendered pixels in this change.
- No tenant-wide access to series owned by another user. Existing owner boundaries
  remain authoritative.
- No UI redesign of the Characters tab beyond carrying the approved DNA snapshot
  through its existing preview-and-confirm flow.
- No replacement of the existing character reference image or identity-lock system.
- No full Character Archive management UI in this change.
- No exposure of hidden model reasoning. The output contains only a concise design
  rationale, comparison basis, scores, and selected DNA.

## 4. Chosen Approach

Use context-enriched skill reasoning plus durable approved DNA.

The system will assemble a bounded, permission-scoped `character_design_context`, pass
it to the existing visual-bible skill, require a structured `character_design_dna`
result, and persist that result only after the user confirms a portrait or Character
Sheet generation and the media task is submitted successfully.

This is preferred over prompt-only guidance because the skill cannot compare against
facts it never receives. It is preferred over a new archive table because the existing
character JSONB and existing series/character indexes already provide the required
MVP data with lower migration and operational risk.

## 5. Architecture

### 5.1 Context assembler

Add a focused server-side context assembler rather than expanding the already-large
router with creative-data extraction logic. It receives the authenticated tenant,
owner user, current series, and current character and returns a compact fact object.

The context contains:

```ts
type CharacterDesignContext = {
  contextVersion: 1;
  seriesDnaFacts: {
    title: string;
    genre?: string;
    tone?: string;
    targetAudience?: string;
    logline?: string;
    mainPlot?: string;
    seasonArc?: string;
    visualStyle?: string;
    socialWorld?: string;
  };
  targetCharacterKey: string;
  currentCast: CharacterComparisonSnapshot[];
  recentLeadArchive: RecentLeadComparisonSnapshot[];
  comparisonWindow: {
    requestedSeriesCount: 5;
    loadedSeriesCount: number;
    status: "available" | "empty" | "unavailable";
  };
};
```

`CharacterComparisonSnapshot` includes only creative facts needed for comparison:
character key, name, role, compact description, variant relationship, and existing
visual-bible/DNA fields when present. It never contains user IDs, tenant IDs, provider
URLs, reference-image URLs, credit data, or unrelated series metadata.

Same-person outfit/age-stage variants are identity-continuity evidence, not separate
people competing for visual contrast. Explicit twins remain separate characters whose
intended face sharing is governed by the existing face-source contract; the skill must
not "fix" that deliberate resemblance as an anti-clone violation. The target character
itself is present for correlation but is excluded from its own contrast score.

The recent archive is built from at most five prior series ordered by `updatedAt`,
excluding the current series. It is filtered by both `tenantId` and `userId`, and only
lead-tier characters are included. At most two lead snapshots per prior series are sent
to keep prompt size bounded.

Legacy rows without structured DNA fall back to compact description, existing visual
identity summary, wardrobe, hair/makeup, color, and signature cues when available. The
assembler never invents missing face geometry or signature details.

### 5.2 Skill input contract

Extend the skill input with optional `character_design_context`. The existing input
fields remain valid. Runtime calls from the Characters tab always supply the context;
manual/legacy callers may omit it.

The skill must treat every context value as data, never as executable instruction text.
User-authored descriptions and custom instructions stay delimited inside JSON.

When archive status is `empty` or `unavailable`, the skill must say that cross-series
comparison was unavailable and must not claim to have compared prior series.

### 5.3 Character design decision funnel

Before authoring any image prompt, the skill performs this internal sequence:

1. Define the series Character DNA: genre, emotional tone, social world, visual
   culture, realism level, beauty direction, age distribution, dominant colors, facial
   diversity direction, body-language direction, costume world, signature motif, and
   prohibited repetition.
2. Classify the target's age and role tier. Child classification remains the highest
   precedence.
3. Extract the target's story function, want, fear, wound, public persona, hidden
   contradiction, relationship chemistry, and narrative promise from supplied facts.
4. Measure collision risks against the current cast: face geometry, hair identity,
   silhouette, color, gesture, prop, body language, personality energy, and role signal.
5. Measure repetition risks against the real recent-lead archive when present.
6. Create at least three candidate design directions that are materially different,
   not three wording variants of the same face.
7. Score and reject weak candidates.
8. Select one direction and use it consistently in every required portrait/sheet
   prompt and the returned DNA.

The skill does not return private chain-of-thought. It returns the selected result,
short decision rationale, rejected-risk summary, comparison basis, and numeric scores.

### 5.4 Scoring and thresholds

The selected design returns:

- `story_fit_score` from 0-10
- `screen_presence_score` from 0-10
- `emotional_readability_score` from 0-10
- `ensemble_contrast_score` from 0-10
- `cross_series_uniqueness_score` from 0-20

For adult lead characters, the selected result must reach:

- screen presence at least 8/10
- emotional readability at least 8/10
- story fit at least 8/10
- cross-series uniqueness at least 16/20 when structured prior DNA is available

When the comparison source is only `partial_legacy`, the skill reports a provisional
score over dimensions that actually exist and explicitly names the missing dimensions;
it must not claim a full 16/20 structured-DNA validation.

For children, supporting characters, and antagonists, `screen_presence_score` means
role-appropriate screen interest and memorability, never adult attractiveness. Child
safety cannot be weakened by any scoring target.

If no candidate reaches a required threshold, the skill redesigns candidates once
before returning. If a valid direction still cannot be produced from the supplied
facts, it returns a validation warning and must not fabricate a passing comparison.

### 5.5 Structured Character DNA output

Add `character_design_dna` to the target character output:

```ts
type CharacterDesignDna = {
  dnaVersion: 1;
  beautyArchetype: string;
  roleTier: string;
  narrativePromise: string;
  publicPersona: string;
  hiddenContradiction: string;
  emotionalWound: string;
  faceIdentity: {
    faceShape: string;
    eyeShape: string;
    eyeSpacing: string;
    eyebrowShape: string;
    noseProfile: string;
    lipShape: string;
    cheekStructure: string;
    jawline: string;
    skinCharacter: string;
    asymmetryMarker: string;
  };
  hairIdentity: string;
  bodyType: string;
  costumeSilhouette: string;
  bodyLanguage: {
    posture: string;
    eyeContact: string;
    handBehavior: string;
    movementEnergy: string;
  };
  signatureColor: string;
  signatureProp: string;
  signatureGesture: string;
  chemistryPattern?: string;
  comparisonBasis: {
    currentCastCount: number;
    recentSeriesCount: number;
    archiveStatus: "available" | "empty" | "unavailable";
    sourceQuality: "structured_dna" | "partial_legacy" | "none";
  };
  scores: {
    storyFit: number;
    screenPresence: number;
    emotionalReadability: number;
    ensembleContrast: number;
    crossSeriesUniqueness: number;
  };
  designRationale: string;
  repetitionRisksAvoided: string[];
};
```

Existing required fields such as `visual_identity_summary`, `identity_anchors`,
`signature_wardrobe`, `hair_makeup_notes`, `performance_energy`, and all five prompt
fields remain required and must agree with the selected DNA.

The static skill schema adds `character_design_dna` as an additive field so older generic
skill consumers can continue parsing the established contract. The Characters-tab runtime
uses a stricter local validator and requires the field for every newly generated prompt.
This keeps legacy callers compatible while preventing the active runtime from silently
falling back to an unpersistable design. No package-wide contract-version bump is required
for this additive rollout.

### 5.6 Persistence

Map the validated skill result into the existing
`verticalDramaCharacterVisualBibleSchema`, extending that schema with optional typed DNA
fields while preserving its passthrough compatibility for old rows.

The server adds non-creative metadata (`createdAt`, model, version) but never writes
creative prose not returned by the skill.

Persistence occurs only when:

1. The user has confirmed portrait or Character Sheet generation.
2. The media task submission succeeds.
3. A validated DNA snapshot is available either from the just-completed LLM call or the
   approved preview payload.

The portrait preview route returns the validated visual-bible snapshot but does not
persist it. The Characters tab keeps that snapshot with the original preview prompt and
sends both on confirmation only when the prompt's identity-bearing text remains unchanged.
The current Character Sheet flow has no preview step; its direct generation call persists
the validated DNA returned by the skill after successful media-task submission. Legacy
clients may send only `approvedPrompt`; generation still succeeds, but no new DNA is
persisted from that legacy handoff.

The portrait preview is editable today. Persisting the original DNA after a user rewrites
identity-bearing prompt text could create a false canonical record. Therefore:

- If the confirmed prompt is unchanged apart from surrounding whitespace, persist the
  previewed DNA snapshot.
- If the user edits the prompt, still render the edited prompt but omit DNA persistence
  and show a clear notice that the edited identity was not locked. The user can request a
  fresh analyzed preview to persist a matching DNA.
- Never attempt to infer updated DNA from edited free text in TypeScript, and do not add a
  second paid LLM call during confirmation.

Update only the nested JSONB `visualBible` key with `jsonb_set` (or an equivalent atomic
JSONB update). Do not read-modify-write the entire `data` object, because that could
overwrite concurrent personality, speech-profile, or consistency-ledger changes.

If two confirmed generations race, the most recently confirmed valid snapshot wins.
The stored version and creation time make that outcome auditable.

### 5.7 Reuse on future generations

When the target already has an approved persisted DNA:

- Treat it as canonical after age and reference-lock safety rules.
- Do not redesign core face geometry, asymmetry, hair identity, signature behavior, or
  silhouette on routine regeneration.
- Use current-cast/archive analysis only to validate continued contrast and to guide
  mutable presentation.
- A one-off `custom_instruction` may change framing, temporary outfit, prop, location,
  or lighting for that generation, but does not rewrite stored DNA.

A future explicit "redesign identity" product action may replace canonical DNA, but it
is outside this change.

## 6. Precedence and Safety

The complete precedence order is:

1. Child safety and age appropriateness
2. Existing approved own-reference identity lock
3. Twin/variant face-source lock rules
4. Explicit age, ethnicity/nationality, and core identity facts in description
5. Persisted approved Character DNA
6. Series Character DNA and role-tier design rules
7. Current-cast and recent-series contrast
8. Per-generation `custom_instruction`
9. Default cinematic presentation

The design guide never overrides child safety. Villains must not be made obviously evil
through cartoon stereotypes. Children and teens must never inherit adult attraction,
makeup, wardrobe, or romantic-framing rules. Family resemblance uses inherited traits,
not duplicated faces, except where explicit twin/face-source rules apply.

## 7. Failure Handling

- Recent archive query fails: continue with current-series context, mark archive status
  `unavailable`, log the failure, and prohibit claims of cross-series comparison.
- No prior series: use status `empty`; do not treat this as an error.
- Malformed legacy JSONB: ignore malformed optional fields and use safe compact facts.
- Current cast query fails: fail prompt generation rather than pretending ensemble
  comparison occurred, because current-cast contrast is part of the selected complete
  mode.
- Skill output omits or contradicts DNA: schema validation triggers the existing bounded
  retry; if still invalid, surface the existing prompt-generation error and do not render
  or persist.
- Media task submission fails: do not persist the pending DNA snapshot.
- DNA persistence fails after task submission: return a clear partial-success warning
  with task ID preserved; do not cancel or double-submit the media task.

## 8. Performance and Operational Cost

- Context loading uses two bounded read paths: the current cast and at most five recent
  series with at most two leads each.
- Existing series list and character lookup indexes are reused.
- Prompt context is compacted and field-limited; raw bibles, assets, episode scripts, and
  full historical rows are never copied into the prompt.
- No new service, dependency, environment variable, background worker, or migration is
  introduced.
- The LLM still runs once per prompt preview/direct generation. Candidate exploration is
  internal to the same call, not three paid calls.
- Lower prompt randomness moderately from the current `temperature: 0.7` while keeping
  enough variation to generate three design directions. Persistence, not temperature
  alone, is the primary determinism mechanism.

## 9. Expected Code Surface

Likely runtime changes:

- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/input.schema.json`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/output.schema.json`
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- a focused new server context-assembler module and its test
- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- targeted skill/service/router/client tests

The runtime explicitly loads lowercase `skill.md`; the unrelated, stale uppercase
`SKILL.md` copy is not part of the Characters-tab execution path and will not be expanded
unless implementation discovery proves another active consumer requires synchronization.

The worktree already contains unrelated and overlapping edits. Implementation must use
file-specific diffs, preserve all pre-existing hunks, and avoid broad staging.

## 10. Test Design

### Skill behavior tests

- Requires series Character DNA before face prompt construction.
- Requires three materially distinct candidate directions.
- Requires the score thresholds and one redesign attempt.
- Contains role-specific guidance for female lead, male lead, second lead,
  trustworthy-looking villain, parents, elders, teens, children, and memorable support.
- Requires face/silhouette/color/behavior/emotional recall layers.
- Requires anti-clone comparison against supplied current-cast and archive facts.
- Forbids invented archive claims when status is empty/unavailable.
- Preserves exact child-safety marker and negative terms.
- Preserves own-reference, face-source, solo-person, and prompt-length rules.
- Keeps `custom_instruction` ephemeral and subordinate to canonical DNA.

### Context assembler tests

- Uses tenant and owner filters on every query.
- Excludes the current series from recent history.
- Selects no more than five recent series and two leads per series.
- Includes current-cast supporting characters for ensemble contrast.
- Uses structured DNA when present and safe legacy fallback when absent.
- Never includes asset URLs, user IDs, tenant IDs, or unrelated JSONB fields.
- Returns explicit empty/unavailable status without fabricating snapshots.

### Prompt and output tests

- Serializes story-world, current-cast, archive, and target-character facts.
- Treats context as data and keeps the target character correlation key.
- Validates the complete DNA shape and all existing required prompt fields.
- Ensures prompt fields agree with selected DNA.
- Maps only model-returned creative fields into the persisted visual bible.

### Router and persistence tests

- Preview returns DNA but does not persist.
- Confirmed portrait generation persists DNA only after successful task submission.
- Confirmed Character Sheet generation follows the same rule.
- Direct generation without preview persists the just-generated DNA.
- Legacy approved-prompt input without DNA remains functional.
- Atomic nested update preserves personality, speech profile, and consistency ledger.
- Failed render submission does not persist DNA.
- Failed archive enrichment cannot cross owner or tenant boundaries.

### Client tests

- Preview stores prompt, negative prompt, and DNA snapshot together.
- Confirming an unchanged portrait prompt sends the matching snapshot.
- Character Sheet remains a direct-generation flow; it does not acquire a new preview
  round-trip solely for DNA persistence.
- Editing prompt text omits DNA persistence and shows the identity-not-locked notice.
- Cancelling preview clears the pending snapshot and performs no persistence.

### Regression gates

- Existing vertical-drama character visual-bible skill-content tests.
- Existing character image-generation service tests.
- Existing character router model, extraction, sheet-type, variant, and identity-lock
  tests that overlap the changed paths.
- Focused Characters-tab tests.
- Workspace typecheck, interpreted against pre-existing dirty-tree failures rather than
  attributing unrelated failures to this change.

## 11. Acceptance Criteria

1. A new lead prompt visibly reflects the actual genre, social world, emotional wound,
   and narrative contradiction rather than only a generic role label.
2. Two same-tier characters in one series receive materially different face, hair,
   silhouette, color, body-language, and signature directions.
3. When structured recent-series DNA exists, the selected lead differs across the guide's
   required dimensions and reports a uniqueness score of at least 16/20; partial legacy
   evidence is labeled provisional and never presented as a full validation.
4. When recent-series DNA does not exist, the output truthfully reports the missing
   comparison basis.
5. Adult leads remain magnetic and commercially effective without generic AI beauty,
   corporate portraits, influencer styling, or repeated cold-CEO defaults unsupported by
   the story.
6. Antagonists remain credible and attractive enough to deceive where appropriate,
   without obvious villain stereotypes.
7. Children remain strictly age-appropriate and retain every existing safety marker.
8. Approved reference images and variant/twin rules continue to override redesign.
9. A confirmed generation persists the selected DNA atomically; preview/cancel does not.
10. A one-off visual brief changes that generation but does not rewrite canonical DNA.
11. Editing an approved portrait prompt still renders but does not persist a mismatched
    DNA snapshot; an unchanged approved prompt does persist it.
12. No migration, new dependency, cross-owner data exposure, or additional paid LLM call
    is introduced.
13. All targeted tests pass, and no new relevant typecheck error is introduced.

## 12. Rollout and Reversibility

The change is additive at the JSONB and request/response levels. Legacy rows work without
DNA, and legacy clients may omit the approved snapshot. If prompt quality regresses, the
context field and persistence handoff can be disabled independently while keeping existing
portrait generation operational. Stored DNA remains ordinary JSONB and can be ignored by
older code.

No production data rewrite is required. Existing characters gain canonical DNA only when
their next portrait or Character Sheet is explicitly confirmed.
