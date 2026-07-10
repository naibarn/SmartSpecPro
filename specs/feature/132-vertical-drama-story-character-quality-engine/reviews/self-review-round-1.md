# Feature 132 Deep-Plan — Self-Review Round 1

## Summary verdict

The nine sections are well-researched individually — each cites real line numbers, proposes flag-gated additive changes, and includes serious flag-off regression testing. However, read together, the plan is **not yet safe to start Phase 1 implementation as literally written**. There is one genuinely blocking cross-section conflict (Section 05 and Section 08 both independently define a `personality` schema and both independently plan to rewrite the same `extractCharacterDescription` function with different implementations), one systemic process gap that undermines a stated hard acceptance criterion (§16.5's criteria-agreement-test enforcement is scaffolded by Section 01 but never picked up by any of sections 02–09), and a real build-order contradiction (Section 06, spec Phase 3, has a hard dependency on Section 09/08, spec Phase 5, via `cast_visually_similar`). In addition, four sections (02, 04, 05, 08) redundantly re-plan flag-group registrations that Section 01 already owns, which is a straightforward but real merge-conflict generator if not corrected before implementation starts. None of this requires re-architecting the feature — every issue below is fixable with a short coordination pass (reassigning ownership, adding a handful of "already done by Section X" corrections, and adding 2-3 explicit hand-off steps) — but that pass needs to happen before Section 05/06/08/09 work is dispatched, not discovered mid-implementation.

**Disposition (2026-07-09, post-review pass by conductor)**: all 11 findings below were resolved by direct edits to the affected section files immediately after this review — see the end of each finding for the applied fix. No re-planning agents were re-dispatched; corrections were mechanical (reassign ownership, add hand-off steps, fix mislabeled references) and applied directly.

## Topological build order

Derived from each section's own "Dependencies" text (not spec.md's rollout-phase table, which does not match this graph — see Finding 4):

1. **Section 01** — no dependencies; foundation (flags + criteria module).
2. **Section 02** — depends only on Section 01 (implicitly — see Finding 9); otherwise fully independent. Can run in parallel with 03/04.
3. **Section 03** — depends on Section 01.
4. **Section 04** — depends on Section 01; soft (non-blocking, stub-tolerant) dependency on Section 03.
5. **Section 05** — depends on Section 01; soft dependency on Section 04 (degrades to text-only heuristics if absent); hard dependency on Section 08 for personality schema ownership (post-fix — see Finding 1), soft/stub dependency on Section 08 for `characterProfilesFromBible` output.
6. **Section 08** — depends on Section 01; hard dependency on Section 05 (imports the real `speechProfile` type — must land after 05, see Finding 7); soft dependency on Section 03 (shared skill directory scaffold); soft dependency on Section 04 (`contract.emotionalBeat` for §10.7 — see Finding 6); read-only dependency on Section 02.
7. **Section 09** — **hard** build-order dependency on Section 08 (explicitly stated: "must NOT be scheduled/implemented before Section 08 lands").
8. **Section 06** — depends on Sections 01, 03, 04, 05 (hard); depends on Section 09 only for the FINAL wiring of `cast_visually_similar` into its Character Pass dispatch table, which is now a stubbed `.todo` hook per Finding 4's resolution — so Section 06's OWN implementation is no longer blocked on 08/09 landing first.
9. **Section 07** — depends on Sections 03, 04, 06 (hard, for the severity taxonomy and finding/issue shapes).

This is a valid DAG (no hard cycles) once the 05↔08 relationship is resolved by sequencing (05 before 08 — see Finding 7 for why the "soft mutual dependency" as currently written is not actually circular, just under-specified). With Finding 4's `.todo`-hook resolution applied, Section 06 can now genuinely ship in Phase 3 as spec.md §15 intends, with Section 09 responsible for flipping the `cast_visually_similar` hook live once Phase 5 lands.

## Findings

### Finding 1: Duplicate `personality` schema + duplicate rewrite of `extractCharacterDescription`
- **Severity**: blocking
- **Sections involved**: 05, 08
- **Description**: Section 05 stated it owned a `characterPersonalitySchema` inside `shared/verticalDramaSeries/speechProfile.ts`. Section 08 independently defined its own `personalitySchema` with the identical field shape inside `shared/verticalDramaSeries/characterProfile.ts`, with no cross-reference. Both sections also independently planned to rewrite the same function — `extractCharacterDescription` in `server/routers/verticalDramaCharacters.ts` — with two different approaches.
- **Recommended resolution**: Single ownership of `personality` assigned to Section 08 (spec §10.1 places it alongside `visualBible`/`consistencyLedger` under Section 08's typed-data object). Section 05 corrected to drop its schema and import Section 08's. The single edit of `extractCharacterDescription` assigned to Section 08 (lands later in build order); Section 05 provides only the "Voice:" block content as a pure function Section 08's edit calls.
- **Applied fix**: Edited section-05 to remove `characterPersonalitySchema` ownership and import Section 08's `personalitySchema` instead; removed Section 05's `extractCharacterDescription` edit, replacing it with a pure `renderVoiceCardBlock(speechProfile)` helper Section 08 calls. Edited section-08 to be the sole owner of the `extractCharacterDescription` rewrite, importing Section 05's voice-card helper.

### Finding 2: Duplicate append of 3 finding kinds to `VD_SEASON_CRITIQUE_FINDING_KINDS`, plus a kind-count inconsistency
- **Severity**: should-fix-before-implementation
- **Sections involved**: 05, 06
- **Description**: Section 05 planned to append `clue_overload`/`missing_anchor_line`/`voices_too_similar`; Section 06 independently planned to append a list including those same 3 kinds, plus 12-13 more, with an internal 15-vs-16 count mismatch in its own prose.
- **Recommended resolution**: Section 06 becomes sole owner of the entire array-append (all kinds); Section 05 implements only the check *logic*, never touches the array — mirroring how Section 09 already correctly disclaims touching the array for `cast_visually_similar`.
- **Applied fix**: Edited section-05 to remove its `VD_SEASON_CRITIQUE_FINDING_KINDS` edit; it now hands its 3 check-logic functions to Section 06 for registration. Edited section-06 to be sole owner of the full 16-kind append (count corrected), with an explicit note on which Section-03 check produces `decision_without_consequence` vs `thread_stalled`.

### Finding 3: Flag-group registration duplicated across four sections despite Section 01's stated sole ownership
- **Severity**: should-fix-before-implementation
- **Sections involved**: 01 (owner), 02, 04, 05, 08
- **Description**: Sections 02, 04, 05, 08 all independently re-planned adding flag-group entries Section 01 already owns, risking a guaranteed merge conflict on the same array insertion point.
- **Recommended resolution**: Replace each of 02/04/05/08's registration steps with "already registered by Section 01 — confirm entry exists, no edit needed," matching Sections 03/06/07/09's pattern.
- **Applied fix**: Edited sections 02, 04, 05, 08 accordingly.

### Finding 4: Build-order contradicts spec's stated rollout phases (Section 06 hard-depends on Section 09/08)
- **Severity**: should-fix-before-implementation
- **Sections involved**: 06, 08, 09; spec.md §15
- **Description**: Section 06's Character Pass wiring for `cast_visually_similar` had a hard, non-stubbed dependency on Section 09, which itself hard-depends on Section 08 — contradicting spec §15's Phase 3 (Section 06) before Phase 5 (Sections 08/09) ordering.
- **Recommended resolution**: Ship Section 06 with `cast_visually_similar` as a `.todo`/no-op hook in the Character Pass dispatch table; Section 09 wires it live once 08/09 land.
- **Applied fix**: Edited section-06 to add the `.todo` hook pattern explicitly, unblocking its own implementation from 08/09. Edited section-09 to add an explicit final step: "flip Section 06's `cast_visually_similar` `.todo` hook to call `findCastVisuallySimilarPairs`."

### Finding 5: Stale cross-section reference — "Section 2 (async job UI)" does not match the actual Section 02
- **Severity**: should-fix-before-implementation
- **Sections involved**: 03 (stale reference)
- **Description**: Section 03 referenced a non-existent "Section 2 (async job UI)" for wiring the new `"ledger"` job-progress phase's label/handling — the actual Section 02 (User Premise) has no such content.
- **Recommended resolution**: Reassign to Section 03 itself, since it already owns the type.
- **Applied fix**: Edited section-03 to add the job-progress label/handling step to its own Implementation steps (touching `VerticalDramaDeepStoryDraftsPanel.tsx`'s phase-label rendering), removing the stale reference.

### Finding 6: `contract.emotionalBeat` mislabeled as "Section 06's Scene Contract field" — actually Section 04's
- **Severity**: note-only (documentation), but reveals a missing dependency declaration
- **Sections involved**: 08 (error), 04 (actual owner)
- **Applied fix**: Corrected the attribution in section-08 from "Section 06" to "Section 04," and added Section 04 as a soft dependency in Section 08's Dependencies list.

### Finding 7: Section 05 ↔ Section 08 mutual soft dependency lacks an explicit "flip the stub" step
- **Severity**: should-fix-before-implementation
- **Sections involved**: 05, 08
- **Applied fix**: Added an explicit implementation step to Section 08 (lands second): "swap the placeholder `speechProfile?: unknown` field in `characterTypedDataSchema` for the real import from Section 05's `speechProfile.ts`" — mirroring Section 09's existing pattern for `consistencyLedger`.

### Finding 8: §16.5's criteria-agreement-test acceptance criterion is scaffolded but never completed — orphaned in practice
- **Severity**: should-fix-before-implementation (borderline blocking — it's a stated hard acceptance criterion)
- **Sections involved**: 01 (scaffold), 02–09 (none committed to finishing it)
- **Applied fix**: Added an explicit step to Sections 02 (preset synthesis), 05 (script-builder/dialogue-audio-planner), 06 (season critique/quality-loop/episode-review), and 08/09 (character-prompt consumers) instructing each to embed `renderCriteriaVersionMarker()` into its touched prompt-builders and flip its corresponding `.todo` entry in `verticalDramaQualityCriteria.agreement.test.ts` to a real assertion.

### Finding 9: `premise_drifted` detection logic is untethered
- **Severity**: should-fix
- **Sections involved**: 02, 06
- **Applied fix**: Added an implementation note to Section 06 describing `premise_drifted` detection as reusing/extending Section 02's `evaluatePremiseCoverage`, applied against later-drafted episode content rather than just the synthesis-time draft.

### Finding 10: Section 02's Dependencies section omits Section 01 despite hard reliance on its flag
- **Severity**: note-only
- **Applied fix**: Added Section 01 to Section 02's Dependencies list.

### Finding 11: `vertical-drama-ledger-planner` skill directory race resolved only by an informal "whichever lands first" heuristic
- **Severity**: should-fix (mitigated but not firmly resolved)
- **Sections involved**: 03, 08
- **Applied fix**: Made the build order binding (Section 03 scaffolds the skill directory first, including `schemas/output.schema.json`'s base wrapper shape; Section 08 extends it) — added `schemas/output.schema.json` to Section 03's "Files to create" list, and removed the conditional "if Section 03 lands first" hedge from Section 08.

## Coverage check results

- **§16 acceptance criteria**: All bullets across §16.1–§16.5 are claimed by at least one section. §16.5 bullet 1 (criteria-agreement enforcement) is now actually completed per Finding 8's fix, not just scaffolded.
- **§3 gap table**: All of G1–G24 are claimed by at least one section. G24 ("Unified criteria across generate AND update") is now genuinely wired end-to-end per Finding 8's fix.

## Flag registration audit (post-fix)

Single-owner: **Section 01** registers all 8 F132A–H flags in both `shared/featureFlags.ts` and `tenantFeatureFlagGroups.ts`. Sections 02, 03, 04, 05, 06, 07, 08, 09 all defer to Section 01 with a "confirm entry exists, no edit" note — no redundant edits remain.
