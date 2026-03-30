---
name: Spec 058 Agency Creator Intelligence Upgrade — Plan Completeness Review
description: Review of claude-plan.md, claude-plan-tdd.md, and all 8 section files for spec 058
type: project
---

# Spec 058 — AI Agency Creator Intelligence Upgrade
## Plan Completeness Review — Verdict: APPROVE_WITH_FIXES
## Date: 2026-03-23

**Key findings:**

### CRITICAL
- **C-1 — `objective` + `sharedInstructions` silently dropped by internal API**: `_implement_agency` sends these in `body_json` but the Node.js Zod schema (`agencyCreateSchema`, line 954-978) does NOT include `objective` or `sharedInstructions`. They are stripped by Zod before insert. Section 07 correctly identifies this fix — but also notes that the agent `modelRequirements` field is missing from the schema. The agencies table INSERT (line 1052-1065) doesn't read `objective` or `sharedInstructions` even when present. Both are missing.

### HIGH
- **H-1 — `AsyncSessionLocal` import path unspecified in Section 03**: Section 03 says "Use `AsyncSessionLocal` to query tables" but doesn't specify the import path. The correct path is `from app.core.database import AsyncSessionLocal`. Missing this causes an ImportError in the Celery worker context.
- **H-2 — Section 06 `saveAsTemplate` has no tenant isolation on the agent read**: The read-agency step does not explicitly check `agencies.tenantId = ctx.tenantId`. A user who guesses a UUID for another tenant's agency can save it as their own template.
- **H-3 — Section 08 `handleApplySuggestion` is a stub with no implementation**: The section explicitly notes "For now, mark as applied — actual implementation depends on suggestion type" but the Apply button is supposed to call `saveBuilder` with modifications. This means suggestions are cosmetic only — no actual changes are applied. No section defines how the `change` payload from the suggestion maps to a `saveBuilder` call.
- **H-4 — Section 05 budget increase race condition**: Section 05 increases MAX_LLM_CALLS to 18 (line 242 of the design task), but Section 01's discover task uses `_llm_call` directly (not `_budget_llm_call`). The budget counter is only tracked inside `_design_async`; the discover task has no budget guard.

### MEDIUM
- **M-1 — Section 02 `_discover_analysis` not read from the design task**: Section 02 says to store `_discover_analysis` in Redis and have the design task read it. But `create_agency_design_task` reads from `payload` (not the Redis status dict), and `_payload` stored in Redis does not include the discover analysis. The design task would need to re-read the status key to get `_discover_analysis` — this coordination mechanism is unspecified.
- **M-2 — Section 03 `agency_improvement_history` table existence unverified**: The plan references this table, but no grep confirmation is shown. The memory models only confirm `agency_agent_memories` exists. `agency_improvement_history` may not have been created by spec 056.
- **M-3 — Section 04 `_llm_review_plan` does not receive `discover_analysis`**: The intelligence checks added in Section 04 check for capability alignment, but `_llm_review_plan()` only receives `plan, model, user_id` — no capability recommendations from discover. The reviewer has no context about what capabilities were expected.
- **M-4 — Phase numbering mismatch between spec and plan**: The spec.md flow has 7 phases (1=DISCOVER, 2=LLM PLANNING, 3=DESIGN, 4=SELF-REVIEW LOOP, 5=VALIDATE, 6=IMPLEMENT, 7=SUGGEST). The claude-plan.md sections map differently (plan.md §3 = Phase 1 DISCOVER, §4 = Phase 3 PLAN, §5 = Phase 4+6 REVIEW). This numbering confusion may mislead implementers about which function to modify.
- **M-5 — Section 06 `agencyTemplates` schema fields unverified**: Section 06 assumes fields like `sourceAgencyId`, `agentDefinitions`, `communicationFlows`, `status` exist on `agencyTemplates`. These should be confirmed against `drizzle/schema.ts` before implementation.
- **M-6 — Section 05 suggestion `change` field structure is underspecified**: Each suggestion has a `change: { ... specific changes to apply ... }` but no concrete schema is defined. Without this, the frontend's Apply button (Section 08) cannot implement it.

### LOW
- **L-1 — Section 07 line references may be stale**: The plan cites lines 954-978 and 1051-1108 for `index.ts`. These are confirmed correct as of this review, but are fragile if surrounding code changes before Section 07 is implemented.
- **L-2 — TDD plan has no negative/failure-path tests for Section 07**: All 4 tests are happy-path. No test for: invalid agencyId, wrong tenant, Zod rejection of malformed modelRequirements.
- **L-3 — Section 08 phase stepper says remove "interview" but interview may still be needed**: The plan says LLM-only for technical decisions, but goal-clarification questions can still trigger `awaiting_answers`. The stepper removal of "interview" would confuse users who do see the interview form.
