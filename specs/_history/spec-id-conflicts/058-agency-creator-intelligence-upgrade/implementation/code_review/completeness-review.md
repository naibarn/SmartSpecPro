# Feature 058 — Agency Creator Intelligence Upgrade
## Post-Implementation Completeness Review

**Date:** 2026-03-24
**Reviewer:** SSP Reviewer Agent (CMD-8)
**Branch:** codex/feature-044-multimodal-chat-memory (contains 058 commits)
**Scope:** All 8 sections — post-implementation quality check

---

## Section-by-Section Status

| # | Section | Code Match | Tests | Known Deferred | Status |
|---|---------|------------|-------|----------------|--------|
| 01 | Discover Enhancement | MATCH | 7 tests — adequate | computer_use strips unconditionally (by design) | COMPLETE |
| 02 | Interview Replacement | MATCH | 7 tests — adequate | `_llm_design` does not receive `discover_analysis` | MOSTLY COMPLETE |
| 03 | Memory-Informed Planning | MATCH | 7 tests — adequate | Memory types differ from spec (by design, documented) | COMPLETE |
| 04 | Review Enhancement | MATCH | 5 tests — adequate | Plan/design reviews call `_llm_call` directly (bypass `_budget_llm_call`) | MOSTLY COMPLETE |
| 05 | Post-Creation Suggestions | MATCH | 16 tests — strong | None | COMPLETE |
| 06 | Template Save | MATCH | Tests in agency.test.ts — partial | Standalone `saveAsTemplate.test.ts` absent | MOSTLY COMPLETE |
| 07 | Internal API Update | MATCH | 12 tests — adequate | None | COMPLETE |
| 08 | Frontend Suggestions UI | MATCH | 5 tests — weak | `Apply` button/procedure intentionally deferred | MOSTLY COMPLETE |

---

## Detailed Section Findings

### Section 01 — Discover Enhancement

**Implementation verified:**
- `MAX_DISCOVER_CALLS = 2` at module level — present at line 32
- Budget-capped retry loop using sentinel object — present at lines 652–687
- Full JSON schema extension in system prompt (`recommended_capabilities`, `complexity_level`, `memory_recommendation`, `domain_insights`) — present at lines 611–640
- Fallback dict includes all new fields — present at lines 646–649
- Response normalization (`complexity_level` range check, missing cap defaults) — present at lines 673–685
- `_validate_spec` strips `supportsComputerUse` unconditionally — present at lines 1299–1304

**Gap identified:** The section doc says "_implement_agency can re-enable [computer_use] after an async flag check if needed" — but this re-enable path in `_implement_agency` does not exist. The comment at line 1300 is aspirational. No production code re-enables the flag. This is a **known design compromise**, documented in the section file, and the security default (strip) is safe.

**Tests:** 7 unit tests confirmed present and passing patterns verified in source.

---

### Section 02 — Interview Replacement

**Implementation verified:**
- `TECHNICAL_KEYWORDS` list — present at lines 38–41 (uses "react executor" not bare "react" — correct)
- `_filter_goal_questions()` — present at lines 44–50
- `MAX_GOAL_QUESTIONS = 3` — present at line 33
- `discover_analysis` dict built from intent in `_discover_async` — present at lines 304–308
- Discover analysis passed in all three dispatch paths (skip_interview, is_clear, awaiting_answers) — verified at lines 313–348
- Answer endpoint (`agency_creator.py` line 147) reads `_discover_analysis` from Redis status and forwards to design payload — confirmed
- `_design_async` extracts `discover_analysis` at line 398 and passes to `_llm_plan` at line 427

**Gap — `_llm_design` does not receive `discover_analysis`:**
Section 02 documents "deferred to section-04" for the `_llm_design` injection. Section 04 confirms it passes `discover_analysis` to the review functions — but the design function `_llm_design` at line 452 is called without `discover_analysis`. The LLM that creates the actual spec JSON never receives the capability context from the discover phase. Only the reviewer sees it. This is a **material gap** — the primary design pass is uninformed by capability analysis; it relies entirely on the review loop to catch missing capabilities.

---

### Section 03 — Memory-Informed Planning

**Implementation verified:**
- `_fetch_relevant_memories()` — present at lines 148–228
- Dual-scope filter (tenantId + userId) — confirmed at lines 175–176
- Memory sanitization via `sanitize_llm_input(content, max_length=500)` — confirmed at line 192
- `<historical_data>` tags with "REFERENCE DATA ONLY" framing — confirmed at lines 219–224
- Secondary `agency_improvement_history` query with try/except fallback — confirmed at lines 196–214
- Memory injection in `_llm_plan` — confirmed at lines 792–796
- `tenant_id` parameter added to `_llm_plan` signature — confirmed at line 736

**Gap — Memory types remain mismatched from master spec:**
The spec.md and original plan described memory types `strategy_success`, `strategy_failure`, `process`, `insight`. Implementation queries `constraint`, `preference`, `fact`, `skill` (the actual DB schema types). Section 03 docs this explicitly as a known deviation with rationale. The code comment at line 169 confirms awareness. Acceptable.

**Gap — `user_id` not forwarded in `_llm_plan` call when tenant_id is empty:**
In `_design_async` at line 427, `user_id` is passed to `_llm_plan` only as part of positional args. When `tenant_id` is empty, `_fetch_relevant_memories` returns early (line 156) without any DB call — correct. No issue.

---

### Section 04 — Review Enhancement

**Implementation verified:**
- INTELLIGENCE CHECKS 9–12 added to `_llm_review_plan` system prompt — confirmed at lines 856–861
- INTELLIGENCE CHECKS 11–16 added to `_llm_review_design` system prompt — confirmed at lines 914–924
- "IMPORTANT: If you find issues, fix them" instruction in both reviewers — confirmed at lines 863, 927
- `discover_analysis` parameter added to both review functions — confirmed at signatures (lines 830, 886)
- Capability hint injected into both prompts from discover_analysis — confirmed at lines 833–842, 890–898
- Both review call sites in `_design_async` pass `discover_analysis=discover_analysis` — confirmed at lines 439, 464

**Gap — Review functions call `_llm_call` directly, not `_budget_llm_call`:**
`_llm_review_plan` and `_llm_review_design` each call `_llm_call` directly at lines 872 and 941. The budget guard in `_design_async` only checks `if llm_call_count >= MAX_LLM_CALLS:` before each review loop iteration — but these calls do not increment `llm_call_count`. With up to 3 plan review iterations + 3 design review iterations = up to 6 review calls are untracked against MAX_LLM_CALLS=18. The section 04 doc notes "Budget bypass concern for review calls was pre-existing (not introduced by this section)." This is an acknowledged gap, not a regression.

---

### Section 05 — Post-Creation Suggestions

**Implementation verified:**
- `SUGGEST_SYSTEM_PROMPT` module-level constant — confirmed at line 1437
- `_validate_suggestion_change()` per-category validation — confirmed at lines 1475–1480
- `_CHANGE_KEYS` dict mapping categories to required fields — confirmed at lines 1468–1472
- `_llm_suggest_improvements` with `llm_fn` parameter — confirmed at lines 1483–1540
- Uses `_budget_llm_call` closure when called from `_design_async` at line 529 — confirmed
- `store_suggestions` / `get_suggestions` with separate Redis keys — confirmed at lines 104–124
- `check_rate_limit` atomic INCR pattern with TTL set only on count==1 — confirmed at lines 127–141
- Completed status includes `hasSuggestions` flag only (not raw array) — confirmed at line 542
- Phase 9 SUGGEST runs after DOCUMENT phase (order note: phase markers say "Phase 9" for VERIFY at line 500 AND "Phase 9" for SUGGEST at line 519 — minor label inconsistency, not functional)
- `change` field stripped in Python endpoint before Node.js sees it — confirmed at `agency_creator.py` lines 113–117

**Note on phase label inconsistency:**
Both the VERIFY status update (line 500) and the SUGGEST status update (line 519) are labeled "Phase 9" in comments. VERIFY should be Phase 8 per the 10-phase pipeline. The status `phase` field correctly uses "verify" and "suggest" strings respectively, so this is only a code comment issue — no functional impact.

---

### Section 06 — Template Save

**Implementation verified:**
- Schema migration `0117_modern_patriot.sql` lines 182–187: adds `tenantId`, `createdBy`, `sourceAgencyId`, `status`, `agentDefinitions`, `communicationFlows` to `agency_templates` — confirmed
- `schema.ts` `agencyTemplates` table includes all new columns — confirmed at lines 4996–5034
- `saveAsTemplate` tRPC procedure — present at lines 4890–5001
- Ownership check: agency.createdBy === userId OR admin/domain_admin — confirmed at lines 4916–4921
- Tenant isolation: agency looked up with `AND tenantId = tenantId` — confirmed at lines 4904–4909
- UUIDs stripped, array indices used for flows — confirmed at lines 4976–4983
- SECURITY comment explicitly enumerating whitelisted fields (no spread) — confirmed at lines 4959–4965
- `mcpServers` / `mcpServerTokensEncrypted` not included — confirmed (only whitelisted fields mapped)

**Gap — Migration bundles social DDL with agency_templates ALTER:**
`0117_modern_patriot.sql` creates 11 social-channel tables (lines 1–181) then runs the `agency_templates` ALTER statements (lines 182–237). This was flagged in section-06 review but the migration is committed and presumably already applied. The risk (a failure in social DDL rolling back the `agency_templates` fix) was accepted at commit time.

**Gap — Standalone saveAsTemplate test file absent:**
Section 06 spec lists 5 tests including "template agentDefinitions strips UUIDs" and "template preserves nodeConfig and modelRequirements". These tests exist in `apps/web/server/routers/__tests__/agency.test.ts` (confirmed 3 test cases for `saveAsTemplate`), but the section spec implied a dedicated test file. The test for "strips UUIDs" is not directly confirmed — the existing test in `agency.test.ts` creates a template and checks `templateId` is returned but does not assert `agentDefinitions[0].id === undefined`. This assertion is **missing**.

---

### Section 07 — Internal API Update

**Implementation verified:**
- `agencyCreateSchema` Zod schema in `_core/index.ts` includes `objective`, `sharedInstructions`, `modelRequirements` — confirmed in `internalAgencyCreate.test.ts` (mirrors live schema)
- `objective` persisted with `null` default (not empty string) — confirmed in test at line 178
- `sharedInstructions` with max 10000 chars — confirmed
- `modelRequirements` per-agent with full capability flags and strategy enum — confirmed
- Length enforcement via `.slice()` at insert point — confirmed
- Error sanitization: generic "Internal server error" returned — confirmed

**Tests:** 12 unit tests confirmed in `internalAgencyCreate.test.ts`. All test against the Zod schema directly (unit level) — no integration test hitting the actual Express endpoint exists. This is acceptable for a type-safety-focused section.

---

### Section 08 — Frontend Suggestions UI

**Implementation verified:**
- `suggestions`, `dismissedSuggestions`, `showTemplateDialog`, `templateName`, `templateDesc`, `createdAgencyId` state variables — in `AutoCreateAgencyModal.tsx`
- Suggestions fetched from `autoCreateStatus` response on completion — polling integration confirmed
- `change` field stripping at Python layer (not tRPC) — confirmed in `agency_creator.py` lines 113–117
- `tRPC autoCreateStatus` return type includes `hasSuggestions` and `suggestions` — confirmed at lines 2931–2938
- Save as Template dialog with name + description, calls `saveAsTemplate.mutateAsync` — confirmed at line 555
- Phase stepper updated (includes "suggest", excludes "interview") — confirmed in section docs
- `onCreated` user-triggered via "Open in Agency Editor" button — confirmed at line 587

**Gap — `Apply` button intentionally absent:**
The spec §4 (F03) described a `handleApplySuggestion` flow. Section 08 explicitly defers this — suggestions are read-only. The `applySuggestion` tRPC procedure does not exist. This is documented as a deliberate conservative choice per security requirement F03 (whitelist-only apply path). Acceptable, but must be tracked as deferred work.

**Gap — Test quality is weak:**
5 tests in `AutoCreateSuggestions.test.tsx`. Three tests render the component in idle state and make structural assertions (not behavioral). The phase stepper test is vacuous — it only asserts `container` is defined, not that "suggest" is in the PHASES constant or "interview" is absent. No test exercises the completed state with suggestions rendered. No test exercises the template dialog submission flow. This is the weakest test coverage in the entire feature.

---

## Cross-Cutting Concerns

### Feature Flags

| Concern | Status |
|---------|--------|
| AI Creator feature guarded by feature flag? | NO — `autoCreate` endpoint uses `protectedProcedure` only; no `requireFeatureFlag` guard. The existing `assertAgencyEnabled` is not applied to `autoCreate`. This is consistent with pre-existing behavior but new capability (suggestions, memory-informed planning) is not separately flaggable. |
| `computer_use` guardrail active | YES — strips unconditionally in `_validate_spec` |
| Rate limiting on creation | YES — `check_rate_limit` (Python, 5/hr per user) + tRPC middleware (5 per 60s) — dual layer |

**Finding:** The AI Creator does not sit behind a tenant feature flag. Large organizations with restrictive tenant configs cannot disable the AI Creator independently from Agency use. This is a pre-existing design decision, not a regression from spec-058, but worth tracking.

### Database Migrations

| Schema Change | Migration | Status |
|---|---|---|
| `agencyTemplates`: +tenantId, +createdBy, +sourceAgencyId, +status, +agentDefinitions, +communicationFlows | `0117_modern_patriot.sql` lines 182–187 | APPLIED (confirmed in drizzle/schema.ts) |
| FK constraints + indexes | Same migration lines 233–237 | APPLIED |
| No Python-side schema changes (Redis only for suggestions) | N/A | N/A |

All schema changes are migrated. No pending drift.

### Help Documentation

| Doc | Status | Gap |
|-----|--------|-----|
| `apps/web/docs/help/en/agencies.md` | NOT UPDATED | No mention of AI Creator, improvement suggestions, or Save as Template |
| `apps/web/docs/help/th/agencies.md` | NOT UPDATED | Same gap |

The `agencies.md` help doc describes only pre-existing templates and the agency marketplace. The new AI Creator flow (the central user-facing feature of spec-058) is entirely absent from user documentation. Users have no help content explaining the new "AI Agency Creator" modal, what the phases mean, or what "Save as Template" does.

### Error Handling Consistency

| Surface | Error UX | Status |
|---------|----------|--------|
| Rate limit exceeded (Python) | `"status": "failed", "error": "Rate limit exceeded..."` | User-visible via polling |
| Rate limit exceeded (tRPC) | tRPC throws `TOO_MANY_REQUESTS` — handled by frontend | Consistent |
| Agency implementation failure | `"status": "failed", "error": "Agency creation failed..."` | Generic, appropriate |
| Redis failures in `store_suggestions` / `get_suggestions` | Logged, returns empty / continues — non-fatal | Good |
| `_fetch_relevant_memories` DB failure | Returns empty string silently | Good |
| `saveAsTemplate` auth failure | TRPCError FORBIDDEN / UNAUTHORIZED | Correct |
| Internal API token missing | Returns `None`, status set to failed | Correct |

Error handling is consistent and defensive across all surfaces. Non-critical failures (suggestions, memories) degrade gracefully. Critical failures (agency creation) surface to frontend.

### Integration Coherence (Section-to-Section)

The 8 sections form a coherent pipeline:

```
discover (S01) → filter questions (S02) → plan with memories (S03)
→ review_plan (S04) → design → review_design (S04) → validate (S01)
→ implement (S07) → suggest (S05) → UI (S08) → save template (S06)
```

**Integration gap — `_llm_design` not receiving `discover_analysis`:**
Sections 02 and 04 pass `discover_analysis` to `_llm_plan` and both review functions. But `_llm_design` (Phase 5, called at line 452) does not accept a `discover_analysis` parameter. The design LLM produces the final spec JSON without explicit capability recommendations from the discover phase. The review loop (S04) compensates by checking the output, but this means the design LLM must infer capabilities from the requirement text alone and rely on the reviewer to correct omissions. This is a **design gap** — the compensating review loop is the mitigation, but it costs additional LLM calls that count against the budget.

**Integration gap — `onCreated` contract change:**
Section 08 changes `onCreated` from auto-invoked on completion to user-triggered via button. Callers in `AgencyBuilder.tsx` that relied on the auto-call behavior should be audited. The section doc acknowledges this. A caller that expected immediate navigation on completion will now show a stale suggestion panel.

---

## Deferred Items Tracker

| ID | Description | Section | Priority | Status |
|----|-------------|---------|----------|--------|
| D-01 | `applySuggestion` tRPC procedure (Apply button for suggestions) | S08 | MEDIUM | Explicitly deferred — requires whitelisted mutation backend |
| D-02 | `computer_use` re-enable path in `_implement_agency` after async feature flag check | S01 | LOW | Documented design compromise — sync/async boundary |
| D-03 | `_llm_design` should receive `discover_analysis` parameter | S02/S04 | MEDIUM | Section 02 deferred to S04 but S04 only added it to reviewers |
| D-04 | AI Creator help documentation (en + th) | S08 | HIGH | Missing entirely from `agencies.md` |
| D-05 | Test: `agentDefinitions strips UUIDs` assertion | S06 | LOW | Listed in section spec, not confirmed in `agency.test.ts` |
| D-06 | Phase comment label inconsistency (Phase 9 appears twice in `_design_async`) | S05 | LOW | Code quality — no functional impact |
| D-07 | `_llm_review_plan` / `_llm_review_design` call `_llm_call` directly (untracked budget) | S04 | MEDIUM | Acknowledged pre-existing issue |
| D-08 | AI Creator feature flag (tenant-level enable/disable for new capabilities) | N/A | LOW | Pre-existing design decision |

---

## Contract Compliance Checklist

| Contract | Status | Notes |
|----------|--------|-------|
| F01 — Memories sanitized before LLM injection | PASS | `sanitize_llm_input` on every memory item |
| F02 — Memory query scoped by tenantId AND userId | PASS | Dual WHERE clause confirmed |
| F03 — `change` field stripped from client response | PASS | Stripped in Python endpoint, not tRPC |
| F04 — `agencyTemplates` schema migration blocking pre-condition | PASS | `0117_modern_patriot.sql` applied |
| F04 — Template ownership check | PASS | createdBy OR admin/domain_admin |
| F05 — Error message sanitization in internal API | PASS | Generic error returned to client |
| F08 — Length enforcement on objective/sharedInstructions | PASS | `.slice()` at insert point |
| F09 — Suggestions stored in separate Redis key | PASS | `agency-creator:{task_id}:suggestions` |
| F10 — Rate limit is atomic (no TOCTOU) | PASS | Atomic INCR, TTL set only on count==1 |
| tRPC auth guard on all new procedures | PASS | `protectedProcedure` on autoCreate, autoCreateStatus, saveAsTemplate |
| Tenant isolation on saveAsTemplate | PASS | Agency verified against tenantId before insert |
| `modelRequirements` passed through internal API | PASS | Verified in schema and `_implement_agency` |
| `objective` and `sharedInstructions` persisted via internal API | PASS | Critical CRITICAL fix from plan review confirmed |

---

## Overall Verdict: MOSTLY COMPLETE

The implementation delivers the core intelligence upgrade goals from the spec: LLM-driven capability decisions, technical question suppression, memory-informed planning, self-review loops, improvement suggestions, template save, and internal API fixes. All security requirements from the code review series (F01–F10) are addressed.

**Three items prevent COMPLETE status:**

1. **D-04 (HIGH) — Help documentation absent.** The AI Creator, improvement suggestions, and Save as Template are entirely undocumented in user-facing help content. This is a usability gap.

2. **D-03 (MEDIUM) — `_llm_design` does not receive `discover_analysis`.** The phase that produces the final spec JSON is uninformed by the discover analysis. The review loop compensates but this is less reliable than direct injection. Completing the original section-02 intent would close this gap in one function signature change.

3. **D-07 (MEDIUM) — Review functions bypass budget tracking.** `_llm_review_plan` and `_llm_review_design` call `_llm_call` directly. With up to 6 review calls per run, actual LLM usage can exceed MAX_LLM_CALLS=18 by up to 6 additional untracked calls. The fix is to pass `_budget_llm_call` into both review functions the same way suggestions already use `llm_fn`.

The remaining deferred items (D-01, D-02, D-05, D-06, D-08) are low-priority or explicitly acknowledged design decisions with appropriate mitigations.
