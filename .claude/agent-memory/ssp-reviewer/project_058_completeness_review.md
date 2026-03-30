---
name: Spec 058 — Agency Creator Intelligence Upgrade — Full Completeness Review
description: Post-implementation completeness review of all 8 sections of spec-058. Verdict MOSTLY COMPLETE with 3 blocking gaps.
type: project
---

Verdict: MOSTLY COMPLETE (2026-03-24)
Review file: `specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/completeness-review.md`

**Sections confirmed complete:** S01 (Discover), S03 (Memory Planning), S05 (Suggestions), S07 (Internal API)
**Sections mostly complete with gaps:** S02, S04, S06, S08

**Key gaps preventing COMPLETE:**

1. **D-04 HIGH — Help docs absent**: `agencies.md` (en + th) contains no mention of AI Creator modal, improvement suggestions, or Save as Template. User has no documentation for the central new UX.

2. **D-03 MEDIUM — `_llm_design` does not receive `discover_analysis`**: Phase 5 (the actual spec JSON creation) is uninformed by capability recommendations from discover phase. S02 deferred injection "to S04" but S04 only added it to the review functions, not `_llm_design` (line 452 in agency_creator_task.py). One-line fix: add `discover_analysis` param to `_llm_design`.

3. **D-07 MEDIUM — Review functions bypass budget tracking**: `_llm_review_plan` and `_llm_review_design` call `_llm_call` directly (untracked). Up to 6 review calls per run are invisible to `llm_call_count`. Fix: pass `_budget_llm_call` as `llm_fn` param (same pattern as suggestions already use).

**Other deferred items (lower priority):**
- D-01: `applySuggestion` tRPC procedure (Apply button) — intentionally deferred, F03 concern
- D-02: `computer_use` re-enable path after feature flag check — documented design compromise
- D-05: `agentDefinitions strips UUIDs` assertion missing in agency.test.ts
- D-06: Phase comment label "Phase 9" appears twice in `_design_async` (cosmetic)
- D-08: AI Creator not behind tenant feature flag (pre-existing design)

**Why:** All F01–F10 security requirements from the code review series are confirmed implemented. Schema migration (0117_modern_patriot.sql) is applied. The pipeline is functionally coherent. The `objective`/`sharedInstructions` CRITICAL fix from plan review is confirmed.
