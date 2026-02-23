# Code Review Interview — Section 07: General Subagent Agents

**Date:** 2026-02-22
**Review verdict:** REQUEST_CHANGES → APPROVE (after fixes)

---

## Triage Decision

All 6 findings were **auto-fixed** — no user interview required. Rationale:

| # | Severity | Finding | Decision | Reason |
|---|----------|---------|----------|--------|
| 1 | MEDIUM | `research.md` missing CONTRACT row | Auto-fix | Obvious compliance gap — identical fix applied by 12 other files |
| 2 | MEDIUM | `error-detective.md` had 9 sections (spec requires 8) | Auto-fix | Clear template violation; content merged into Capabilities section |
| 3 | MEDIUM | `infrastructure.md` had 9 sections (spec requires 8) | Auto-fix | Same structural defect; Service Map merged into Capabilities |
| 4 | LOW | `docs-release.md` secrets prohibition only in checklist | Auto-fix | Align with pattern used by python.md and other agents |
| 5 | LOW | `debugger.md` missing `pytest` from full test suite constraint | Auto-fix | One-line addition, no tradeoff |
| 6 | LOW | `test-qa.md` "mock database" narrower than spec's "mock network calls" | Auto-fix | Broaden to match spec intent with no behavior change |

---

## Fixes Applied

### Fix 1: research.md — Added CONTRACT row to Input Contract table

Added: `| CONTRACT | N/A — research does not implement contracts, only analyzes existing ones |`

### Fix 2: error-detective.md — Merged section 6 into section 2 (Capabilities)

Moved the entire "Known SmartSpecPro Audit Log Schema" content (log path, key fields, event types, query patterns, DB correlation) into section 2 (Capabilities) as embedded reference material. Renumbered sections 7→6, 8→7, 9→8. File now has correct 8-section structure.

### Fix 3: infrastructure.md — Merged Service Map into section 2 (Capabilities)

Moved the "SmartSpecPro Service Map" table into section 2 (Capabilities) as embedded reference material. Removed the standalone `## 3. SmartSpecPro Service Map` section. Renumbered sections 4→3, 5→4, 6→5, 7→6, 8→7, 9→8. File now has correct 8-section structure.

### Fix 4: docs-release.md — Added hard Constraint for secrets prohibition

Added to Constraints: `**Must NOT include secrets, API keys, environment variable values, or connection strings** in any documentation — even for example purposes`

### Fix 5: debugger.md — Added pytest to Phase 3 full test suite instruction

Updated Phase 3 step 11 from: `cd apps/web && pnpm test` to: `cd apps/web && pnpm test (TypeScript) or cd python-backend && pytest (Python) — based on where the bug is`

### Fix 6: test-qa.md — Broadened mock constraint to match spec intent

Updated constraint from: `Must NOT mock the database in integration tests` to: `Must NOT mock network calls in integration tests — use actual test DB, Redis, and real service boundaries; mocking a database or external HTTP dependency in an integration test is not permitted`

---

## Post-Fix Validation

- All 13 files have exactly 8 sections: ✓
- All TDD validation checks pass: ✓
- All contract field references correct: ✓
- Re-staged with `git add deep_plan/skills/sub-agents/agents/`
