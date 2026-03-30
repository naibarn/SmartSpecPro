---
name: Spec 053 — Agency Agentic Intelligence Layer — Review
description: Spec quality review findings for 053, covering spec gaps, section-02 orchestrator agentic mode implementation findings, DB schema issues, missing test strategy, and architectural concerns
type: project
---

Spec 053 reviewed 2026-03-22. Verdict: APPROVE_WITH_FIXES.

Key findings:

**MUST FIX:**
- `agency_agent_memories` schema uses `INTEGER` for `tenant_id` but existing agency tables use `varchar(36)`. The SQL as written creates a FK type mismatch.
- Feature flags defined as bare strings (no TenantFeatureFlags interface entries). Prior specs (049, 051) were flagged for the same omission. Must add `agencyAgenticModeEnabled`, `agencyReactExecutorEnabled`, `agencyAutonomousAgentEnabled`, `agencyLongTermMemoryEnabled` to the `TenantFeatureFlags` interface in `shared/featureFlags.ts` and `ALLOWED_FEATURE_FLAGS` / `FEATURE_FLAG_DEFAULTS`.
- Level 1 `_is_complete()` / `_extract_final_answer()` parsing logic entirely unspecified. The magic marker approach (`[FINAL ANSWER]`, `[COMPLETE]`, JSON `{"status":"complete"}`) is referenced but no implementation spec given. This is a load-bearing correctness function.
- No tRPC procedure changes listed for Level 3 memory CRUD but `agency.ts` router modifications are listed in the file list. Input/output Zod schemas, auth guards, and pagination shape are not defined.

**SHOULD FIX:**
- `agency_run_traces` already exists in the schema. Spec 053 says it integrates with this table but does not specify the span schema extension needed for agentic sub-spans (cycle_number, iteration, planning_output fields). Implementers will have to guess.
- `autonomous_agent` as a new node type registered in ReactFlow requires updating the `nodeType` varchar(30) check constraint in `agencyAgents` and the discriminated union in the Drizzle `nodeConfig` `$type<>`. Not mentioned.
- Credit tracking for ReAct iterations is described at a system level but the concrete hook into `creditService.ts` / `agency_swarm_adapter.py` is absent. The adapter's existing `extract_usage_from_run_result()` is per-run, not per-iteration.
- Test strategy is entirely absent. No unit test list, no integration test requirements, no contract test spec. All prior specs in this codebase include at minimum a TDD test list.
- `ReActExecutor._call_llm()` is not specified. The existing adapter creates full Agency objects per call; calling it in a 10-iteration loop creates 10 Agency objects. The spec does not resolve how the ReAct loop calls the LLM without the full agency-swarm overhead.
- Open Question 3 (streaming + agentic mode) is acknowledged but not resolved. Section 9 (SSE streaming backend) is listed as a Level 3 dependency, yet Level 2 says "each ReAct iteration can emit SSE events" with no protocol definition.

**NICE TO HAVE:**
- Long-term memory keyword retrieval is the only retrieval mode specified, with vector search deferred to Open Question 2. Given spec 050 (pgvector) is already referenced, at minimum a note on which embedding model and table to use when upgrading should be included.
- Migration rollback plan is missing. The `agency_agent_memories` table migration has no `DROP TABLE IF EXISTS` downgrade path mentioned.
- Success metric "task completion rate +10% vs single_shot" has no measurement methodology defined.

**Why / How to apply:**
- Type mismatch on tenantId is a FK violation that will prevent the migration from running.
- Missing TenantFeatureFlags entries means the flags will be env-var-only, bypassing per-tenant rollout and audit trail — the exact pattern flagged in 049 reviews.
- Missing `_is_complete()` spec means each implementer will ship a different heuristic, making the spec not self-contained.

---

## Section-03 — Frontend Level 1 Intelligence UI — Implementation Review (2026-03-23)

Verdict: APPROVE_WITH_FIXES. 2 HIGH, 3 MEDIUM, 3 LOW findings.
Review file: `specs/feature/053-agency-agentic-intelligence/implementation/code_review/section-03-review.md`

Key findings:
- **HIGH-1 — `agencyAgenticModeEnabled` feature flag gate absent**: Intelligence collapsible section always visible regardless of flag state. Section-04 confirms the flag (`default: true`) must gate this UI path.
- **HIGH-2 — No write-path test assertions**: All 5 tests verify display correctness only; no test asserts `onChange` is called with the correct `ncSet` payload when a control is changed.
- **MEDIUM-1 — Backend `maxReflectionCycles` validation accepts string "3" as integer**: `Number(maxCycles)` converts the string; should add `typeof maxCycles !== "number"` to reject non-numeric inputs at the type level, not just after conversion.
- **MEDIUM-2 — `getByText("Intelligence")` is fragile**: Matches the `<span>` child, not the `<button>`. Should use `getByRole("button", { name: /intelligence/i })`.
- **MEDIUM-3 — `<button>` toggle missing `aria-expanded`**: No accessible state announcement for screen readers.
- Positive: `ncGet`/`ncSet` helpers used correctly for all 4 fields, superRefine validation placed correctly inside existing block, Separator added between sections, all 5 spec-required test cases implemented, Brain icon import correct.

---

## Section-02 — Orchestrator Agentic Mode — Implementation Review (2026-03-23)

Verdict: APPROVE_WITH_FIXES. 3 HIGH, 3 MEDIUM, 3 LOW findings.
Review file: `specs/feature/053-agency-agentic-intelligence/implementation/code_review/section-02-review.md`

Key findings:
- **HIGH-1 — Guardrails bypassed in agentic mode**: The `if execution_mode == "agentic": return await self._execute_agent_node_agentic(...)` dispatch in `_execute_agent_node()` fires before the input guardrail checkpoint (line 612) and output guardrail checkpoint (line 809). Agents with configured guardrails run without any sanitisation, blocking, or redaction. Spec Design Decision 5 explicitly requires input guardrails once before the loop and output guardrails on the final answer.
- **HIGH-2 — `get_planning_prompt()` ValueError propagates uncaught**: The call at line 519 is outside the `try/except Exception` block at line 586. An unknown `planningStrategy` string causes an unhandled exception that terminates the entire agency run.
- **HIGH-3 — Inline import inside reflection loop**: `from app.services.agency_swarm_adapter import ...` executes inside the `for cycle` loop at line 526. Not a correctness bug due to Python import caching, but defeats mypy type-checking and is a maintenance hazard.
- **MEDIUM-1 — `showReasoning` config field silently no-op**: Spec §4 lists it as a config field; implementation never reads it. No comment deferring it.
- **MEDIUM-2 — No message size cap across cycles**: Prior cycle response is injected into the next cycle's message with no character/token limit guard. With up to 10 cycles and large responses, final messages can far exceed model context limits.
- **MEDIUM-3 — `test_max_cycles_zero_returns_immediately` misplaced in detection test file and vacuous**: Tests `clamp_to_limit(0, 10) == 0`, not orchestrator behaviour. The actual invariant (agentic returns "" when cycles=0) has no test.
