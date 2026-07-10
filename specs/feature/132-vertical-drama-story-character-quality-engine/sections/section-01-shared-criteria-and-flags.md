# Section 01: Shared Quality Criteria Module + Feature Flags

## Goal
Establish the foundational, flag-gated infrastructure that every other Feature 132 section builds on: (1) a single shared quality-criteria module (`server/services/verticalDramaQualityCriteria.ts` + `shared/verticalDramaSeries/qualityCriteria.ts`) that is the one source of dialogue rules text, scene-contract requirements, dramaturgy rules, clue-budget constants, anchor-line cadence, scorecard dimension definitions, and severity taxonomy — versioned via `criteriaVersion` — and (2) the 8 new F132 feature flags (F132A–H), registered in `shared/featureFlags.ts` and the tenant admin UI, all defaulting OFF so the entire feature ships dark until explicitly enabled per tenant. This section produces no user-visible behavior change by itself; it exists purely so later sections have a stable contract to import against and a version marker to stamp, enforced by an agreement test that greps every one of the 11 real consumer entry points for the criteria fragment/version.

## Dependencies
- **Depends on:** nothing new — reads existing Feature 131 code as reference only (`shared/featureFlags.ts`, `client/src/components/admin/tenantFeatureFlagGroups.ts`, `shared/verticalDramaSeries/createSeriesFieldLimits.ts` + its two test files, `shared/verticalDramaSeries/dialogueQuality.ts`, `server/services/verticalDramaStoryBible.ts`, `server/services/verticalDramaEpisodeQualityReview.ts`, `server/services/verticalDramaQc.ts`, `server/routers/verticalDramaSeries.ts`, `server/services/verticalDramaCharacterImageGeneration.ts`, `server/services/verticalDramaScriptGeneration.ts`, `server/services/verticalDramaPresetSynthesis.ts`, `server/services/verticalDramaQualityReviewApply.ts`/`verticalDramaQualityLoop.ts`, dialogue-audio-planner service/skill — exact filename to be confirmed, referenced in spec §11 as "dialogue-audio-planner prompt").
- **Depended on by:** every other Feature 132 section (F132A user premise, F132B ledgers, F132C scene contracts, F132D multi-pass QC/scorecard v3, F132E targeted revision, F132F character profiles, F132G character visual quality, F132H continuity contracts). All of them (a) gate their code paths behind the flag this section defines, and (b) render their prompt fragments through the criteria module this section defines and stamp `criteriaVersion` on their outputs. No later section should hardcode dialogue rules, clue-budget numbers, or scorecard dimension names — they must import from this module.

## Files to create
- `apps/web/shared/verticalDramaSeries/qualityCriteria.ts` — pure-TS, provider-free single source of truth: `CRITERIA_VERSION` (number, starts at `1`), `QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT` (max 2), `QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS` (3), severity taxonomy `QUALITY_FINDING_SEVERITIES = ["minor","moderate","major","structural"] as const`, scorecard dimension name constants for v3 (`clarity`, `character_consistency`, `evidence_payoff`, `threat_escalation` — additive to existing v1/v2 dims, not redefining them), and the raw prompt-fragment text blocks for dialogue rules v2 (§7.1), scene-contract requirement text (§6.1), and dramaturgy rules (want/obstacle/choice/cost, escalation, activation) as exported string constants/template functions. **(post-completeness-audit addition — confirmed sole ownership + full content checklist)**: this section is the confirmed sole author of the §7.1 dialogue-rules-v2 fragment's text content (Section 05 supplies check logic and consumption wiring only, never edits this file — resolves an ownership ambiguity the audit found). The fragment MUST cover, verbatim in substance: mystery-grounding incl. the `storyFunction`-ritual-exemption clause; pressure-not-summary; clue budget incl. "minimal context per clue"; anchor-line cadence; read-aloud one-idea-per-line; and Thai spoken-register rules (particles, contractions, no written-essay connectives, formality matching, narration-is-a-violation). See Section 05's Goal section for the full itemized list this section's test #6 below must assert against. No LLM calls, no DB access — this file must be importable from both server and (theoretically) client code without pulling in server-only deps, matching the `createSeriesFieldLimits.ts` idiom.
- `apps/web/shared/verticalDramaSeries/qualityCriteria.test.ts` — unit tests for the pure exports (constants exist, are the documented values, prompt-fragment builders produce deterministic strings containing the version marker).
- `apps/web/server/services/verticalDramaQualityCriteria.ts` — server-side wrapper: `getVerticalDramaQualityCriteriaBundle(): { version: number; dialogueRulesV2: string; sceneContractRequirements: string; dramaturgyRules: string; severityTaxonomy: readonly string[] }` (thin composition over the shared module, this is the one function every consumer service imports), plus `renderCriteriaVersionMarker(): string` returning a fixed, greppable literal (e.g. `"<!-- VD_QUALITY_CRITERIA_V${CRITERIA_VERSION} -->"`) that consumer prompts must embed and consumer outputs must stamp as `criteriaVersion`.
- `apps/web/server/services/__tests__/verticalDramaQualityCriteria.test.ts` — unit tests for the server wrapper (bundle shape, version marker format, marker changes only when `CRITERIA_VERSION` changes).
- `apps/web/server/services/__tests__/verticalDramaQualityCriteria.agreement.test.ts` — the cross-cutting agreement test (see Test-first plan below) asserting all 11 spec §11 consumer entry points reference the criteria version marker.

## Files to change
- `apps/web/shared/featureFlags.ts`:
  - Add 8 new fields to the `TenantFeatureFlags` interface (immediately after the existing `verticalDramaSeriesNativeAudioPrompts: boolean; // F131AC ...` line, i.e. inside the interface block ending at line 192), each following the exact one-line comment convention:
    ```
    verticalDramaUserPremise: boolean; // F132A — spec 132 §4 user premise field + premise-primary synthesis (fail-closed)
    verticalDramaQualityLedgers: boolean; // F132B — spec 132 §5 ledgers + story state + deterministic checks (fail-closed)
    verticalDramaSceneContracts: boolean; // F132C — spec 132 §6 scene contracts in drafts/pipeline validation (fail-closed)
    verticalDramaMultiPassQc: boolean; // F132D — spec 132 §7-8 dialogue rules v2 + multi-pass critique + scorecard v3 (fail-closed)
    verticalDramaTargetedRevisionV2: boolean; // F132E — spec 132 §9 shot-scoped revision + revision plan (fail-closed)
    verticalDramaCharacterProfiles: boolean; // F132F — spec 132 §7.3/§10.1 structured personality/speech profiles (fail-closed)
    verticalDramaCharacterVisualQuality: boolean; // F132G — spec 132 §10.2-10.7 persisted bible, expression set, image QC, consistency ledger (fail-closed)
    verticalDramaContinuityContracts: boolean; // F132H — spec 132 §8.2 causal chain / hook-to-opening enforcement (fail-closed)
    ```
  - Add the same 8 keys as string literals to the `ALLOWED_FEATURE_FLAGS` set (near line 383, appended after `"verticalDramaSeriesNativeAudioPrompts"`).
  - Add the same 8 keys with `: false` to `FEATURE_FLAG_DEFAULTS` (near line 575, appended after `verticalDramaSeriesNativeAudioPrompts: false`).
  - Add a new canonical-keys block mirroring the existing `VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS` idiom (after line 680): `VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS` (the 8 F132 keys as a `const satisfies readonly TenantFeatureFlagKey[]` array), its derived `VerticalDramaQualityEngineFeatureFlagKey` type, and `areVerticalDramaQualityEngineFeatureFlagsRegistered(): boolean` (same shape as `areVerticalDramaSeriesFeatureFlagsRegistered`) — this becomes the assertion surface for the flag-default snapshot test. No alias map is needed (no legacy names exist for these 8 new flags).
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`: in the vertical-drama flag group array (the block containing lines 167–196), append 8 new entries after the `verticalDramaSeriesNativeAudioPrompts` entry, following the exact `{ key, label, description }` shape:
  ```
  { key: "verticalDramaUserPremise", label: "User Premise", description: "User-defined premise field + premise-primary preset synthesis (spec 132 §4)" },
  { key: "verticalDramaQualityLedgers", label: "Quality Ledgers", description: "Evidence/activation/threat/consequence/thread/world-rule ledgers + story state (spec 132 §5)" },
  { key: "verticalDramaSceneContracts", label: "Scene Contracts", description: "Per-shot scene contracts in drafts + pipeline validation (spec 132 §6)" },
  { key: "verticalDramaMultiPassQc", label: "Multi-Pass QC v3", description: "Dialogue rules v2 + six-pass season critique + scorecard v3 (spec 132 §7-8)" },
  { key: "verticalDramaTargetedRevisionV2", label: "Targeted Revision v2", description: "Shot-scoped revision plan + splice repair (spec 132 §9)" },
  { key: "verticalDramaCharacterProfiles", label: "Character Profiles", description: "Structured personality + speech/voice profiles per character (spec 132 §7.3, §10.1)" },
  { key: "verticalDramaCharacterVisualQuality", label: "Character Visual Quality", description: "Persisted visual bible, expression set, image QC gate, consistency ledger (spec 132 §10.2-10.7)" },
  { key: "verticalDramaContinuityContracts", label: "Continuity Contracts", description: "Causal chain map + hook-to-opening enforcement (spec 132 §8.2)" },
  ```

## Test-first plan
1. `apps/web/shared/verticalDramaSeries/qualityCriteria.test.ts`
   - `it("CRITERIA_VERSION is a positive integer")`
   - `it("QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT equals 2")`
   - `it("QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS equals 3")`
   - `it("QUALITY_FINDING_SEVERITIES contains exactly minor, moderate, major, structural in that order")`
   - `it("dialogue rules v2 fragment text includes the clue-budget, anchor-line, and spoken-register rules")`
   - `it("scene-contract requirement fragment lists all required contract fields from spec §6.1")`
2. `apps/web/server/services/__tests__/verticalDramaQualityCriteria.test.ts`
   - `it("getVerticalDramaQualityCriteriaBundle returns a bundle stamped with the current CRITERIA_VERSION")`
   - `it("renderCriteriaVersionMarker returns a stable, greppable string containing the version number")`
   - `it("bundle.severityTaxonomy matches shared QUALITY_FINDING_SEVERITIES exactly")`
3. `apps/web/server/services/__tests__/verticalDramaQualityCriteria.agreement.test.ts` (mirrors the `createSeriesFieldLimits.agreement.test.ts` "mock the whole module graph" convention):
   - `it.each(CONSUMER_ENTRY_POINTS)("consumer %s builds a prompt/output that contains the criteria version marker", ...)` where `CONSUMER_ENTRY_POINTS` is a literal array of the 11 spec §11 rows (`synthesizeVerticalDramaPreset[V2]`, `generateStoryBible`, `generateStoryBibleDeep`, `extendStoryDraftHorizon`, `critiqueSeasonDrafts`/`applySeasonCritique`, `runVerticalDramaQualityLoop`, `generateEpisodeScript` stage functions, `generateNextEpisodesViaLlm`, `updateEpisodeDraft`/`updateEpisodeDraftDialogue`, `runVerticalDramaEpisodeQualityReview`, `generateCharacterVisualPrompts`/start-frame assembly, dialogue-audio-planner prompt) — for section 01 this test SHOULD initially assert only that `getVerticalDramaQualityCriteriaBundle`/`renderCriteriaVersionMarker` exist and are importable, with each real consumer's `it` marked `.todo()` or `.skip()` and a comment pointing to the section that implements that consumer's wiring (sections 2–9 flip each `.todo` to a real assertion as they land — this test file is the single place that tracks "has every path adopted the criteria module yet"). This mirrors the spec's explicit instruction that this is "enforced by an agreement test."
4. `apps/web/shared/featureFlags.test.ts` (extend existing file, or create `apps/web/shared/__tests__/featureFlags.f132.test.ts` if the existing file is large) —
   - `it("all 8 F132 flags are present in TenantFeatureFlags/ALLOWED_FEATURE_FLAGS/FEATURE_FLAG_DEFAULTS")`
   - `it("all 8 F132 flags default to false")` — snapshot-style assertion iterating `VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS`
   - `it("areVerticalDramaQualityEngineFeatureFlagsRegistered() returns true")`
5. Admin UI test (extend existing `tenantFeatureFlagGroups` test file if one exists, else add one) —
   - `it("vertical drama flag group includes all 8 F132 keys with non-empty label/description")`
6. Flag-off snapshot/regression guard (placed here since it's foundational, exercised further by later sections):
   - `it("with all F132 flags false, no F132 code path is reachable")` — a lightweight smoke assertion that `VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS.every(k => FEATURE_FLAG_DEFAULTS[k] === false)` (duplicate of the registered-check, kept as an explicit named test per spec §16.5 "Flag-off = current behavior").

## Implementation steps (in order)
1. Read current `apps/web/shared/featureFlags.ts` in full around the vertical-drama block to get exact current line numbers (they shift as the file changes) before editing.
2. Write `apps/web/shared/verticalDramaSeries/qualityCriteria.ts` (tests-first: write `qualityCriteria.test.ts`, watch it fail, then implement).
3. Write `apps/web/server/services/verticalDramaQualityCriteria.ts` (tests-first similarly), importing only from the shared module.
4. Add the 8 flags to `TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS`, and the new `VERTICAL_DRAMA_QUALITY_ENGINE_FEATURE_FLAG_KEYS` + `areVerticalDramaQualityEngineFeatureFlagsRegistered` block in `shared/featureFlags.ts`.
5. Write the flag-default/registered tests for `featureFlags.ts`, confirm green.
6. Add the 8 entries to `tenantFeatureFlagGroups.ts`, write/extend the admin-UI grouping test, confirm green.
7. Write `verticalDramaQualityCriteria.agreement.test.ts` with the full 11-entry `CONSUMER_ENTRY_POINTS` list, all but the "module exists and exports the marker" assertions marked `.todo`/`.skip` with a section-number comment; run it to confirm the non-todo assertions pass and todos are visibly listed in test output (so later sections know exactly what to flip).
8. Run `pnpm typecheck` (or `pnpm check` inside `apps/web`) and `pnpm test` scoped to the new/changed files to confirm no regressions in existing vertical-drama flag tests (`server/routers/__tests__/tenantFeatureFlags.test.ts`, `server/services/__tests__/mcpFeatureFlags.test.ts`, and any existing `featureFlags.test.ts`).

## Schema / migration notes
None. `tenants.featureFlags` is a `json("featureFlags").$type<Record<string, boolean>>()` column on the existing `tenants` table (`apps/web/drizzle/schema.ts:1384`) — a per-tenant sparse override map, not one column per flag. `FEATURE_FLAG_DEFAULTS` is a static TypeScript config object (`shared/featureFlags.ts`), and the effective flag value at runtime is `tenant.featureFlags?.[key] ?? FEATURE_FLAG_DEFAULTS[key]` (per `tenantFeatureFlagService.ts` / `requireFeatureFlag` middleware). Adding 8 new keys to `TenantFeatureFlags`/`FEATURE_FLAG_DEFAULTS` requires **no Drizzle migration** — it's a new set of keys the JSON column can already hold. The quality-criteria module itself is pure TS with no persisted state at all in this section (later sections persist ledgers/visual bibles into existing jsonb columns per spec §13, not here).

## Risk & rollback
- All 8 flags default `false`; `areVerticalDramaQualityEngineFeatureFlagsRegistered()` is the automated guard that this holds (fails CI if any flag is missing or defaults `true`).
- The criteria module and its wrapper are pure additive files with zero call sites until later sections wire them in — merging this section changes zero runtime behavior for zero existing requests. Verify via: `git diff` on `featureFlags.ts`/`tenantFeatureFlagGroups.ts` should show only additive lines (no existing lines touched), and a full `pnpm test` run should show identical pass/fail counts to `main` aside from the new test files.
- Rollback is trivial: revert the two changed files and delete the new files — no DB state, no migration, no queued jobs reference these flags yet.
- Primary ongoing risk carried forward to later sections: the agreement test's `.todo` entries must actually get flipped to real assertions as each consumer section lands, or "unified criteria" silently becomes aspirational. This section's job is to make that omission visible (a `.todo` test prints in test output) rather than prevent it outright — later sections' plans must explicitly reference flipping their entry in `verticalDramaQualityCriteria.agreement.test.ts`.

## Acceptance criteria
Maps to spec.md §16.5 "System":
- "All §11 paths stamp `criteriaVersion`; agreement test fails if any consumer drops the criteria fragment" → satisfied incrementally: this section creates the agreement test scaffold with all 11 consumers enumerated (as `.todo` initially); it becomes a hard failure once each consuming section flips its entry, and CI will fail from that point forward if any consumer stops embedding `renderCriteriaVersionMarker()`'s output.
- "Flag-off = current behavior for every path (snapshot tests on built prompts and schemas)" → satisfied for this section's scope by the flag-default test (`FEATURE_FLAG_DEFAULTS[key] === false` for all 8 keys) and by the fact that no existing prompt-building or schema code is modified in this section (nothing to snapshot yet — later sections add their own flag-off snapshot tests when they touch real prompts/schemas, per the pattern established here).

## Open questions / assumptions
- Assumed the dialogue-audio-planner service/skill file referenced only as "dialogue-audio-planner prompt" in spec §11 is `server/services/verticalDramaDialogueAudioPlanner.ts` or the skill `vertical-drama-dialogue-audio-planner`; the exact file must be confirmed (via Grep/SocratiCode) by whichever section actually wires the criteria marker into it — not blocking for this foundational section since that entry stays `.todo` here.
- Assumed `CRITERIA_VERSION` starts at `1` (no prior versioned criteria exist) and that a version bump is a manual, deliberate act (not auto-derived from a hash) — consistent with the spec's "scorecards and run artifacts stamp the version used, so mixed-version seasons are auditable" language, which implies a human-readable integer rather than a content hash.
- Assumed the existing `apps/web/shared/featureFlags.ts` does not already have a dedicated `featureFlags.test.ts`; if it does, this section extends it in place rather than creating a new test file (implementer should re-check via Glob before creating).
