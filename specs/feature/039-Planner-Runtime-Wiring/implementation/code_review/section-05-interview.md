# Section 05 Code Review Interview

## Review Findings Summary

Code reviewer found 2 HIGH, 2 MEDIUM, 2 LOW, 2 NITPICK findings.

---

## Item 1 — `plannerLatencyMs` not persisted to DB

**Severity:** HIGH
**Finding:** `plannerLatencyMs` is computed and returned in `PlannerResult` but no call site passes it to `recordStepAttempt` or otherwise stores it. Monitoring SLO (p95 <50ms) is unenforceable.

**Decision (user):** Keep `plannerLatencyMs` in `PlannerResult` struct only for this section. Do NOT add a DB column or schema change.

**Rationale:** The metric is observational/debug-oriented for now. No downstream reader depends on persisted queryability. Promoting it to `task_step_attempts` would expand scope into migration/backfill/contract updates. Can be promoted later if analytics/SLO audit is needed.

**Action taken (auto-fix):**
- Added JSDoc comment to `PlannerResult.plannerLatencyMs` clarifying it is returned for caller logging/telemetry only, and that it should be promoted to a stored column if p95 SLO enforcement is needed.
- Strengthened test: added `typeof ... === 'number'` and `isFinite()` assertions alongside `>= 0`.

---

## Item 2 — `aiPresentationService.ts` not in diff

**Severity:** HIGH
**Finding:** Spec lists `aiPresentationService.ts` as a file to update.

**Investigation result:** The file calls `runPlanner()` only to obtain `taskRunId`, `plan`, and `snapshot` for task tracking. It never applies `plannerResult.resolvedModel` to drive model selection (uses `DEFAULT_TEXT_MODEL` directly). No `shadowMode` guard existed there.

**Decision:** No action — the presentation service intentionally uses planner for task accounting only, not model routing. This is correct by design.

---

## Item 3 — `memoryService.ts` not in diff

**Severity:** HIGH
**Finding:** Spec lists `memoryService.ts` as a file to update.

**Investigation result:** `memoryService.ts` has zero `plannerResult`/`shadowMode`/`runPlanner` references. Spec reference was aspirational (planner wiring for memory was not implemented in earlier sections).

**Decision:** No action.

---

## Item 4 — `TASK_PLANNER_SHADOW_MODE` still in feature flag registry

**Severity:** MEDIUM
**Investigation result:** Grep of entire `apps/web/` confirms zero occurrences of `TASK_PLANNER_SHADOW_MODE`. Flag was never registered as a typed constant — only passed as a string literal to `getTenantFeatureFlag`. Nothing to clean up.

**Decision:** No action.

---

## Item 5 — `channelGateway.ts` agency planner call sites

**Severity:** MEDIUM
**Finding:** Two agency `runPlanner` call sites in `channelGateway.ts` don't pass `conversationModel`.

**Investigation result:** These sites use planner exclusively for task tracking (`taskRunId`/`plan`/`snapshot`) — they don't use `plannerResult.resolvedModel` for model selection. The missing `conversationModel` is fine because model resolution isn't the purpose there.

**Decision:** Let go — not relevant to shadow mode cutover.

---

## Item 6 — No code-level rollout gate

**Severity:** MEDIUM
**Decision:** Let go — rollout prerequisites are operational decisions documented in the spec rollout checklist. Code-level enforcement is out of scope for this section.

---

## Items 7-10 (LOW/NITPICK)

- `startMs` measurement window comment: addressed by JSDoc on `plannerLatencyMs` field
- Test strength: auto-fixed (typeof + isFinite assertions added)
- Redundant comment before `not.toHaveProperty`: removed (assertion is self-documenting)
- `startMs` outside try block: correct, no change needed
