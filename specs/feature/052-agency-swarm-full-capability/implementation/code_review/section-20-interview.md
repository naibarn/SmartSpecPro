# Section 20 — Code Review Interview

## Triage Summary

| Finding | Severity | Decision | Rationale |
|---------|----------|----------|-----------|
| Wrong env var `INTERNAL_API_TOKEN` | HIGH | Auto-fix | Obvious bug — silently breaks all discovery calls |
| Limit cap mismatch (5 vs 10) | HIGH | Auto-fix | Plan specifies max 10; endpoint needs update |
| Missing TS tests | HIGH | Auto-fix | Spec-required deliverable |
| `previous_output` dict order | HIGH | Let go | Python 3.7+ dicts preserve insertion order; orchestrator adds results sequentially |
| SkillInputMapper not wired | MEDIUM | Deferred | Needs `getInputSchema` query integration; component is ready for section-22 wiring |
| Chain badge | MEDIUM | Deferred | Nice-to-have UI enhancement; chainTo metadata is stored correctly in context |
| ExportAsSkillDialog no-op | MEDIUM | Deferred | Plan §10 explicitly says "lower priority, can be deferred" |
| httpx client per call | LOW | Let go | Discovery calls are low-frequency; premature optimization |
| Source change drops values | LOW | Auto-fix | Simple spread fix |
| Missing previous_output test | LOW | Auto-fix | Added test for coverage |

## Fixes Applied

1. **ENV VAR FIX**: Changed `INTERNAL_API_TOKEN` → `SMARTSPEC_WEB_GATEWAY_TOKEN` in `agency_skill_discovery.py`
2. **LIMIT CAP FIX**: Raised `skillDiscoveryTool.ts` limit from `max(5)` to `max(10)` to match plan spec
3. **TS TESTS**: Created `agencySkillIntegration.test.ts` with 8 Vitest tests covering all validation paths
4. **PREVIOUS_OUTPUT TEST**: Added `test_discovery_previous_output_task_source` to Python test suite
5. **SOURCE CHANGE FIX**: `SkillInputMapper.tsx` now spreads existing mapping when changing source type

## Deferred Items

- `SkillInputMapper` wiring into `SkillCallForm` — component is ready, needs `getInputSchema` query
- Chain badge rendering — backend stores chainTo metadata correctly
- `ExportAsSkillDialog` tRPC mutation — dialog UI ready, backend mutation deferred per plan
