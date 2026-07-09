# Production-Grade Upgrade Audit — 2026-07-07

Scope: the 2026-07-07 upgrade of spec 131 (v0.3 → v0.4) against the five
production-feedback requirements. This is the completeness audit referenced
from `spec.md` header and §23.

## Requirements Audited

- **R1** Dialogue per shot too thin → silent gaps; per-shot fixes insufficient;
  reform story planning top-down (series arc → episode → shots) with safe
  propagation into subsequent episodes.
- **R2** Wizard so users don't memorize step order; spot/custom fixes must
  still work without redoing the whole flow.
- **R3** Story intensity up together with dialogue; QC quality up; automatic
  post-QC improvement up.
- **R4** Product tie-in seamless at true production grade, with QC that
  MEASURES script/placement quality.
- **R5** (added mid-audit with 5 reference images) Presets that reproduce the
  sci-fi/mecha aesthetic end-to-end + preset mixing that verifiably blends
  every selected preset.

## Method

1. Implementation survey agent mapped the SHIPPED system first (router
   procedures, `dialogueQuality.ts` constants, quality-review loop v1,
   tie-in machinery, preset synthesis) so every spec claim is grounded in
   real names — no invented estimator, no renamed procedures.
2. Spec upgrade authored: §7.7, §8.2.2, §8.8, §13.1, §14.1, §16.1, §17, §23;
   section-13/14/15 created; section-02/04/07/08/12 + index.md reconciled.
3. TWO independent read-only auditors (not trusting the author):
   - requirement-coverage auditor (R1-R4 sub-point verdicts);
   - internal-consistency + implementation-grounding auditor (cross-refs,
     numeric consistency, exact code-name grep verification, markdown
     integrity).
4. Structural tooling: `check-sections.py`, `check-ui-contracts.py`.
5. All findings fixed, then re-verified by grep.

## Auditor Findings And Resolutions

| # | Severity | Finding | Resolution (all applied 2026-07-07) |
|---|---|---|---|
| 1 | HIGH | Circular gate: wizard step 3 `script_qc` + Gate 0 required the tie-in/scorecard report BEFORE the storyboard, but the shipped review skill scores script + storyboard together (§6.8.1) and tie-in checks count storyboard shots — unsatisfiable for any tie-in episode | Step order fixed: script → storyboard → script QC → start frames. Gate 0 (storyboard) is deterministic-density only (§7.7.2); new Gate 0b holds the FIRST PAID stage (start frames) on scorecard/tie-in floors. §8.8, §16.1 gate semantics, §13.1 timing note, section-12 (steps, gates, stepId order, tests, evidence) all updated |
| 2 | HIGH | Spec cited this audit file before it existed | This file. Written after fixes, as the final step |
| 3 | MEDIUM | §13.1 and §16.1 each called their own addition "a third repair group" (contradiction), loop order omitted `tie_in` | Canonical order declared ONCE in §16.1: `plan_episode_script → storyboard_shotgrid → dialogue_audio_plan → tie_in`; §13.1/section-08/section-14 now reference it (tie_in = fourth, active only with tie-in QC on) |
| 4 | MEDIUM | section-02 not reconciled: memory-kind enum still 9 kinds (test asserted "all 9"), `breakdownVersions[]`/`activeBreakdownVersionId`/`contentBudget` unpinned, `VerticalDramaQualityPolicy` had no storage location | section-02 updated: 11-kind enum + arc-replan semantics, new "Series Bible Breakdown Versioning And Quality Policy" contract block (`qualityPolicy` jsonb on `vertical_drama_series`, resolution series → tenant → defaults; preset copy stamps at create/apply), tests updated to 11 kinds + versioning/policy round-trip |
| 5 | MEDIUM | `verticalDramaSeriesTieInQc` did not require `verticalDramaSeriesQualityLoopV2`, but its only repair path is the §16.1 loop → blocked states with no unblock | §17 + section-08: TieInQc now requires SpeechBudget AND QualityLoopV2 |
| 6 | MEDIUM | §23 claimed "section-04/07 interplay" that did not exist in those files (an implementer following section-07 alone would violate the source-of-truth rule) | section-04 gained "Arc Re-Plan Interplay" (drift hooks ×3, 11 kinds, procedures on `verticalDramaSeries` beside retcon, bundle item 9); section-07 gained "Dialogue Source Of Truth And Density" (distribute/enrich only, `script_fallback` warning, canonical module, TTS drift >15% repair) |
| 7 | MEDIUM | No rule for enabling flags mid-series (risked retro-locking in-flight episodes — the exact "redo everything" failure R2 forbids) | §17 grandfathering rule: gates evaluate only stage runs STARTED after enablement; completed stages/artifacts stay valid. Section-12 acceptance + resolver test + section-14 test + §20 test added |
| 8 | MEDIUM | Orphaned §22 bullet ("Tests prove …") stranded at EOF after §23, reading as a fake 4th invariant | Moved back into §22 list; §23 ends with its 3 real invariants |
| 9 | LOW | `naturalnessScore` "capped by deterministic failures" undefined → telemetry averages could mask violations | Formula pinned in §13.1: `round(mean(3 qualitative)/5*100)`, capped at `min(score, 69)` when ANY deterministic violation exists |
| 10 | LOW | Arc-replan mutations placed on `verticalDramaEpisodes` while the retcon pattern they mirror lives on `verticalDramaSeries` | section-13 moved `approveArcReplanProposal`/`rejectArcReplanProposal` to `verticalDramaSeries.ts` beside retcon procedures |
| 11 | LOW | No rule that repairing an already-approved script re-triggers drift detection | §7.7.3 + section-13 + section-04: drift check re-runs on re-approval of a repaired script |
| 12 | LOW | Legacy series could never adopt Layer-1 density planning (no re-conception path) | §7.7.2 + section-13: "Regenerate story" appends a `contentBudget`-bearing breakdown as a new approval-gated version; produced episodes untouched |
| 13 | LOW | section-08 flag stated mid-paragraph instead of the `Feature flag:` convention | Normalized to the convention |

Rejected/not-a-gap (verified): files listed as "Create" in section-13/14/15
not existing yet (forward-looking spec work, correct); the stale "NOT wired
into any router yet" header comment in `verticalDramaEpisodeQualityReview.ts`
(already tracked for removal in section-14).

## Requirement Verdicts (post-fix)

| Req | Verdict | Where |
|---|---|---|
| R1 density reform + season-safe propagation | PASS | §7.7 (4-layer ladder on the canonical `dialogueQuality.ts` budget; `contentBudget`; persisted beat attribution; duration-aware first-pass prompts; arc drift → append-only re-plan; produced episodes immutable), §14.1, section-13, section-02/04/07 reconciled |
| R2 wizard + spot fixes | PASS | §8.8 + section-12 (11 ordered steps, one CTA, gates as visible steps, stale-propagation spot repair, expert surface, grandfathering, resume-safe derived state) |
| R3 intensity + QC + auto-improve | PASS | §16.1 (shipped v1 recorded; v2 scorecard superset + deterministic metrics unified; policy floors; bounded loop with canonical 4-group order, regression guard, escalation; LLM-only; credit-tracked), section-14 |
| R4 production-grade measured tie-in | PASS | §13.1 (hybrid report, pinned 0-100 formula with violation cap, ≥70 gate post-storyboard/pre-paid, loop membership, defer fallback with fatigue/arc-replan bookkeeping, visual grounding QC, telemetry, override rules), section-08 |
| R5 aesthetic presets + real blending | PASS | §8.2.2 + section-15 (`VerticalDramaPresetVisualIdentity` + flow-through-to-pixels rule, `sci_fi_mecha` seed family ×4 from the reference images, mix v2: weights, facet pre-pass, deterministic identity merge, blendReport provenance, deterministic blend QC gate with one corrective retry) |

Cross-cutting invariants verified: every new gate flag-layered and additive
(flags-off = shipped behavior, incl. explicit flag dependency chain +
grandfathering); every automated rewrite append-only/audited/credit-tracked/
LLM-only; every blocking state names its unblock repair.

## Verification

| Check | Result |
|---|---|
| `check-sections.py` | state `complete`, progress `15/15`, manifest valid, no missing |
| `check-ui-contracts.py` | 15 files checked; sections 12/13/14/15 PASS full UI/UX contract; only pre-existing failures remain: section-10 (shipped implementation record) and section-11 (predates convention enforcement; out of this upgrade's scope) — accepted exceptions |
| Grep re-verify of fixes | no `autoRunReviewAfterScript` remains (renamed `autoRunReviewAfterStoryboard`); no "as a third repair group" contradiction remains; arc-replan text present in section-02 (3 hits) and section-04 (2 hits); `script_fallback` rules present in section-07; spec.md EOF ends with §23's 3 invariants |
| Implementation grounding (consistency auditor, all grep-verified) | every cited export/constant/table/skill exact-matches the codebase: `dialogueQuality.ts` 8 constants + 4 functions + 6 `VD_DIALOGUE_*` codes; scorecard v1 keys; apply-service exports; `runEpisodeQualityReview`/`applyQualityReviewSuggestions`; stage tag `episode_quality_review`; tie-in helpers incl. `sanitizeBrandMentionsInPrompt` location; `vertical_drama_memory_events`/`vertical_drama_genre_presets`; 11 skill folders |
| Numeric consistency (consistency auditor) | 0.68/0.45/0.25/0.58/0.33, 2.5s, 35-50s, floor 70, rounds 2, beats 5-7, reversals ≥2, visual-only ≤2/9, fatigue 10, mentions ≤2, tie-in shots ≤3, ref cap 3 — identical at every occurrence |
| Markdown integrity | code fences balanced in every edited file |

## Verdict

**PASS** — all five requirements are covered with enforceable contracts
(typed shapes, pinned thresholds, stable reason codes, acceptance criteria,
test-first lists), both independent auditors' findings (2 HIGH, 6 MEDIUM,
5 LOW) are closed and re-verified, and shipped behavior remains the intact
flags-off baseline. Spec version 0.4 is implementation-ready; suggested
implementation order: section-13 → section-14 → section-08 (task 10) →
section-12, with section-15 in parallel after 02/10/11.
