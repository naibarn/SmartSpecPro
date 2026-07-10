# Deep Plan: Feature 132 — Vertical Drama Story & Character Quality Engine

Version: 0.2 (post-review-round-1, post-completeness-audit-round-2)
Date: 2026-07-09
Spec: [spec.md](spec.md) v0.3
Model: all planning + audit agents ran on Sonnet 5 (no Fable 5 used, per explicit user instruction)

## What this is

A TDD-oriented, sectioned implementation plan for Feature 132, produced by 9
parallel section-writer agents (one per major spec area) grounded against the
real codebase, then hardened by two independent verification passes:

1. **Self-review round 1** — one cross-section consistency review found and
   fixed 11 coordination issues (1 blocking, the rest should-fix/note-only).
   See [reviews/self-review-round-1.md](reviews/self-review-round-1.md).
2. **Completeness audit round 2** — 9 independent agents each compared one
   plan section directly against its source spec range (not against each
   other), plus 1 cross-cutting agent checking the gap table, acceptance
   criteria, flags, persistence, and skills list. Found and fixed 2
   significant gaps (an unenforced criteria-module adoption claim covering
   only 7/12 consumers; an undocumented second skill) plus a genuine
   production bug (a miscounted required-field check that would have
   rejected most shots) and a schema omission that broke the plan's own
   §10.7 requirement. See [reviews/completeness-audit-vs-spec-round-2.md](reviews/completeness-audit-vs-spec-round-2.md).

All fixes from both rounds are applied directly in the section files below —
they reflect the current, corrected state of the plan, not the original
drafts.

This plan covers **planning only** — no source code has been written yet.
Each section below is implementation-ready (file-level anchors, test-first
plans, risk/rollback) but requires a separate implementation pass (e.g.
`/deep-implement` or direct agent dispatch) to execute.

## Sections

| # | Title | Flags | File |
|---|---|---|---|
| 01 | Shared Quality Criteria Module + Feature Flags | (foundation for F132A–H) | [section-01-shared-criteria-and-flags.md](sections/section-01-shared-criteria-and-flags.md) |
| 02 | User Premise & Premise-Primary Preset Mix | F132A | [section-02-user-premise-preset-mix.md](sections/section-02-user-premise-preset-mix.md) |
| 03 | Ledgers & Story State | F132B | [section-03-ledgers-and-story-state.md](sections/section-03-ledgers-and-story-state.md) |
| 04 | Scene Contracts | F132C | [section-04-scene-contracts.md](sections/section-04-scene-contracts.md) |
| 05 | Dialogue Quality Rules v2 + Character Speech Profiles | F132D (dialogue) + F132F (speech) | [section-05-dialogue-rules-and-speech-profiles.md](sections/section-05-dialogue-rules-and-speech-profiles.md) |
| 06 | Multi-Pass QC & Scorecard v3 | F132D (QC) + F132H | [section-06-multipass-qc-and-scorecard-v3.md](sections/section-06-multipass-qc-and-scorecard-v3.md) |
| 07 | Targeted Revision Engine v2 | F132E | [section-07-targeted-revision-engine.md](sections/section-07-targeted-revision-engine.md) |
| 08 | Character Personality & Persisted Visual Bible | F132F (personality) + F132G (bible/expression) | [section-08-character-personality-and-visual-bible.md](sections/section-08-character-personality-and-visual-bible.md) |
| 09 | Character Image QC & Cast-Level Contrast | F132G (image QC/ledger/contrast) | [section-09-character-image-qc-and-cast-contrast.md](sections/section-09-character-image-qc-and-cast-contrast.md) |
| 10 | Camera Angle Set Quality (Nine-Angle Cinematic Grid) | F132I | [section-10-camera-angle-grid-quality.md](sections/section-10-camera-angle-grid-quality.md) |

Section 10 (added in spec v0.4, deep-planned separately) upgrades a
different, already-shipped pipeline stage (the multi-angle "3x3" camera-grid
feature) and shares zero files with Sections 01-09 — it has no build-order
dependency on the rest of this plan.

## Binding build order

Resolved by the review (see reviews/self-review-round-1.md "Topological build
order"), corrected from the initial independent drafts:

```
01 (foundation)
├─→ 02 (independent after 01)
├─→ 03 (independent after 01)
├─→ 04 (soft dep on 03; independent otherwise)
└─→ 05 (soft dep on 04; must land BEFORE 08 — hard dep for speechProfile type)
     └─→ 08 (hard dep on 05; soft dep on 03 for shared skill scaffold — 03 lands
              first; soft dep on 04 for contract.emotionalBeat; hard dep on 01)
          └─→ 09 (hard dep on 08)
06 (depends on 01, 03, 04, 05 — NOT blocked on 08/09 after the .todo-hook fix;
    ships cast_visually_similar as a stub, 09 flips it live once it lands)
   └─→ 07 (depends on 03, 04, 06)
```

Practical sequencing for implementation waves:
- **Wave 1**: Section 01 (must land first — everything else references its flags/criteria module)
- **Wave 2** (parallel, all depend only on 01): Sections 02, 03, 04, 05
- **Wave 3** (parallel where possible): Section 06 (depends on 03/04/05), Section 08 (depends on 05, soft on 03/04)
- **Wave 4**: Section 09 (hard dep on 08)
- **Wave 5**: Section 07 (depends on 03/04/06); final hand-off step in Section 09 flips Section 06's `cast_visually_similar` stub live

This differs slightly from spec §15's phase numbering (which places multi-pass
QC in Phase 3 and character visual quality in Phase 5) — the divergence is
deliberate and resolved via the `.todo`-hook pattern (Finding 4): Section 06
ships fully within Phase 3 as spec'd, with only the `cast_visually_similar`
detail wired live later by Section 09, consistent with "each phase
independently shippable" (spec §15).

## Cross-cutting ownership (post-review, binding)

To prevent the coordination issues the review caught from recurring during
implementation:

- **Feature flags** (all 8 F132A–H): Section 01 is the sole owner of
  `shared/featureFlags.ts` and `tenantFeatureFlagGroups.ts` edits for this
  feature. No other section edits either file — they only confirm entries
  exist.
- **`VD_SEASON_CRITIQUE_FINDING_KINDS`** (`verticalDramaStoryBible.ts`):
  Section 06 is the sole owner of this array (all 16 new kinds, including the
  3 Section 05's checks produce and the 1 Section 09's check produces).
  Sections 03, 05, 09 supply check *functions* only.
- **`personality` schema**: Section 08 is the sole owner
  (`shared/verticalDramaSeries/characterProfile.ts`). Section 05 owns
  `speechProfile` only and imports Section 08's `personality` type where
  needed.
- **`extractCharacterDescription`** (`verticalDramaCharacters.ts`): Section 08
  is the sole editor. Section 05 supplies the pure `renderVoiceCardBlock`
  helper Section 08 calls.
- **`vertical-drama-ledger-planner` skill directory**: Section 03 scaffolds
  first (including the base `schemas/output.schema.json` wrapper); Section 08
  extends it with the `character_profiles[]` key only.
- **Criteria-module adoption** (spec §11, the "unified criteria" acceptance
  bar): each section that touches one of the 11 spec §11 consumer entry
  points now has an explicit step to embed `renderCriteriaVersionMarker()`
  and flip its `.todo` entry in
  `verticalDramaQualityCriteria.agreement.test.ts` — this was the one
  systemic gap the review found (Finding 8) where Section 01 scaffolded
  enforcement but no downstream section had committed to finishing it.

## Quality gates for this deep-plan (not the future implementation)

This deep-plan run produced planning documents only — no source/test files
changed. The gate for *this* run was the Wave 4 consistency review
(`reviews/self-review-round-1.md`) plus this conductor's direct-edit
resolution of all 11 findings, verified by grep sweeps for residual stale
references (redundant flag edits, kind-count mismatches, mislabeled
cross-references) after the fixes. Code-level quality gates (typecheck,
lint, tests, security review) apply once implementation begins per each
section's own "Test-first plan" / "Implementation steps".

## What's next

Implementation, in the build-order above, via `/deep-implement` per section
or direct agent dispatch — each section file is self-contained enough to
hand to an implementation agent directly (file anchors, test-first plan,
schema notes, risk/rollback, acceptance criteria all included).
