# Verification Report — Feature 142

**Spec:** 142-video-intelligence-structured-planning-qa-engine
**Version:** 1.2.0
**Date:** 2026-08-02
**Operation:** Create (v1.0.0) → Completeness review (v1.1.0) → Risk-completeness pass (v1.2.0)

---

## v1.2.0 Risk-Completeness Pass

Triggered by the question "are all the risk points actually fixed?". Answered
by searching for **uncovered** risks in the source, not by re-reading the spec.

### Three further HIGH risks found

| # | Risk | Verified against | Why v1.1.0 missed it |
|---|---|---|---|
| R1 | Planner may exceed the 40-layer cap → permanently unrenderable project | `videoProjectCompiler.ts:142` (`MAX_LAYERS_PER_CONFIG = 40`) + `queueRender`'s `VI_SEGMENTED_RENDER_NOT_SUPPORTED` | The cap was documented as an inherited limit; nobody asked what happens when the *planner* is the one exceeding it |
| R2 | Scene times may overlap / invert / overrun | `projectSchemas.ts` — `startMs`/`endMs` are `int().min(0)` with **no** `.refine`/`.superRefine` | The spec assumed the shared schema enforced ordering. It does not |
| R3 | Auto-selected model mangles nested strict JSON; long plans truncate | `callLLMStructured.ts:320-330` auto-resolves when `model` is omitted | v1.1.0 fixed the *call signature* but never specified *which model* |

Added `VI_PLAN_LAYER_BUDGET_EXCEEDED` + `VI_PLAN_TIMELINE_INVALID` (§8.1) with
normative rules in §8.4–8.6, all validated pre-write so a bad plan never
partially lands.

### §17 Risk Register added

14 risks with severity, mitigation, spec status **and code status**, plus 5
explicitly accepted risks (§17.2) — including that three studio types have no
feature sub-flag, so §12.8's rollout table is not mistaken for full coverage.

**The register's central statement (§17.3):** 1 of 14 risks is fixed in code
(R14, the deployed RenderPanel gate); 12 are specified-but-unbuilt; 1 is
partial. Documenting a risk is not fixing it, and the spec now says so in
writing rather than reading as if the work were done.

### Structural

§8 reordered to numeric order; appendix renumbered 17 → 18. Cross-reference
sweep: zero dangling internal references, zero duplicate headings.

---

## v1.1.0 Completeness Review (retained)

---

## v1.1.0 Completeness Review

A deliberate adversarial re-read of v1.0.0, checking every API the spec
asserted against the actual source rather than re-reading the spec's own prose.

**Preservation:** 100%. All 8 critical sections retained; v1.1.0 is additive
plus two corrections. Nothing was removed or simplified.

### Factual errors found and corrected (2)

| # | Error in v1.0.0 | Verified against | Consequence if shipped |
|---|---|---|---|
| E1 | `callLLMStructured` called with `input` + `schema` | `callLLMStructured.ts:25` — real params are `systemPrompt`, `userMessage`, `zodSchema`, `userId`, `tenantId` | The keystone adapter would not compile |
| E2 | Reviews persisted to `video_project_revisions` | `psql \d` — that table holds `{projectId, revision, document, createdBy, reason, createdAt}`; `video_projects.qaLedger` (jsonb, unused, marked "Phase 2" at `videoProjects.ts:1052`) is the real home | Nowhere to store the review, or an invented migration |

**Verified-correct claims (no change needed):** `MOTION_TEMPLATE_REGISTRY[id]`
really exposes `{meta, paramsSchema, build}` so §12.3's fail-closed validation
works as written; `document.qa` really is `{targetScore, maxLoops}`; the CONFLICT
paths really exist at `videoProjects.ts:799`/`:955`; rate limits are as stated.

### Gaps closed (9)

| Gap | New section | Why it mattered |
|---|---|---|
| Credit accounting for LLM stages | §9.4 | Unbilled + uncapped spend; `estimateVideoProjectQualityLoopCredits` existed but nothing charged |
| Stage job vs unsaved user draft | §6.4 | **Data loss** — a stage job could overwrite unsaved edits |
| Project status lifecycle | §6.5 | Recorded double-charge failure class in this repo |
| Automation-mode scope | §6.6 | `auto` mode would have multiplied LLM spend undesigned |
| Re-run semantics | §6.7 | Recorded "full regen wipes manual work" failure class |
| Orphan-sweep ownership | §12.5 | §10.4 promised a sweep no component owned |
| UI surfaces & required states | §12.6 | "surface it in QaPanel" was not a specification |
| i18n | §12.7 | Thai-first app; bare strings would have shipped |
| Rollout / rollback / canary | §12.8 | No way to disable a misbehaving planner |

Tests for all nine added in §14.5. Effort revised 4.5 → **5.5 days**
(new Step 5, §13), with an explicit note that Step 5's rules must land *with*
the stage that introduces them, not afterwards.

### Structural fixes

- §6 subsections physically reordered into reading order (6.1→6.7).
- Duplicate `### 14.6` resolved (Baseline discipline → 14.7).
- Cross-reference sweep: zero dangling internal `§` references; the single
  external reference is explicitly qualified as "Feature 133 §8.6".

---

## Original v1.0.0 Verification

---

## Checklist Results: 30/30 Points

**Total Score:** 30/30 (100%) ✅ PASS
**Minimum Required:** 28/30 (93%)

### Category Breakdown

| Category | Score | Status |
|---|---|---|
| A. Metadata & Structure | 5/5 | ✅ |
| B. Critical Sections | 8/8 | ✅ (must be 8/8) |
| C. Content Completeness | 9/9 | ✅ |
| D. Skill-Ready Structure | 8/8 | ✅ |

---

## Critical Sections Status (8/8 Required)

| # | Section | Status | Location |
|---|---|---|---|
| 1 | Dependency Injection Pattern | ✅ | §5.3 — existing `VideoProjectQualityLoopEffects` preserved verbatim + new `ScenePlanEffects` with the same compile-time guard |
| 2 | Performance Requirements (complete) | ✅ | §10.1–10.5 — 5 subsections: Response Time, Throughput, Resource Utilization, Availability, Scalability |
| 3 | Rate Limiting Specifications | ✅ | §9.1 — 20 rpm (`video-projects-gen`), ≤6 rpm render, 1 concurrent job/project |
| 4 | Audit Logging Integration | ✅ | §9.2 — `logStage`/`auditLogger` code example + required event/field table |
| 5 | STRIDE Threat Model | ✅ | §9.3 — complete 6-category table |
| 6 | Internal API Specifications | ✅ | §7.2 — documented as the real service-to-service boundary (BullMQ job envelope + Remotion worker contract) |
| 7 | Implementation Details | ✅ | §12 — startup wiring, middleware chain, fail-closed validation, adapter code |
| 8 | Role Terminology Standards | ✅ | §12.5 — 12-row convention table |

---

## Notes and Deviations

**1. Header format — deliberate hybrid.**
The user asked for "spec ต่อจากเดิม" (a continuation of the existing chain).
The repo's chain (Features 127–141) uses `# Feature NNN: Title` with
`Depends-on`/`Owner` fields, while this skill's template specifies
`# SPEC-XXX`. Resolution: the repo's chain convention was kept as the primary
format (one field per line, as the skill requires) and the skill's mandatory
8 critical sections were added on top. Chain continuity was judged more
valuable than template uniformity; the quality bar is unchanged.

**2. §7.2 Internal API — documented honestly, not fabricated.**
This platform exposes no `/internal/v1` REST surface. Rather than invent one to
satisfy the checklist, §7.2 documents the genuine service-to-service boundary:
the `video_intelligence_jobs` BullMQ envelope (with its auth/ownership model
and dedupe pointer) and the version-gated Remotion worker contract.

**3. Ground truth is audited, not assumed.**
Every claim in §3 was verified on 2026-08-02 by reading the source, running the
suites (59/59 green), querying the live database, and reading `journalctl` —
not inferred from the Feature 133 spec text. §3.3 records a bug found and fixed
during the audit so the baseline is stated accurately rather than flattered.

**4. Scope discipline.**
No new tables, no new dependency, no worker-contract change. The spec is
deliberately scoped as "wiring + one new skill" because the audit showed the
engines already exist. Estimated ~4.5 days.

**5. Enforceable differentiation.**
The user's central requirement — do not duplicate Marketplace Auto Review — is
written as a normative contract (§2.3) backed by compile-time assertions and
tests (§14.4), not as prose guidance.

---

## Status

**Overall:** ✅ APPROVED
**Ready for Implementation:** YES — recommended entry point is §13 Step 0 (≈30 min, unblocks all three stages)

**Recommended next artifact:** `plan.md` via `/deep-plan`, sectioned along the
four Implementation Guide steps.
