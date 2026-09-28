# Deep-plan self-review round 1

## Status

**Issues Found — fixed in the plan and section files.**

## Findings and fixes

1. The product reference ceiling was described as 50 but had no runtime key.
   Added `VD_MAX_REFERENCE_ITEMS_PER_SHOT` to plan, TDD, and section 01.
2. Model capability cache invalidation was not explicit. Added profile
   version/hash persistence and invalidation before readiness/prompt/dispatch.
3. The UI plan did not state how users choose a video subrange. Added whole-file
   default, bounded video segment selection, and version-1 whole-file audio.
4. UI validator required a UI/UX block in every section. Added explicit N/A
   contracts to backend/provider/skill/integration sections and the full UI
   contract to section 05.
5. Current Omni Flash app validation conflicts with current provider guidance.
   Updated research/spec/plan to require a runtime contract reconciliation
   rather than blindly preserving or removing the restriction.

## Scorecard

| Category | Result |
| --- | --- |
| Structural integrity | PASS |
| Completeness vs spec | PASS after fixes |
| Implementability | PASS after config/cache/segment additions |
| Internal consistency | PASS after section/TDD synchronization |
| Edge cases | PASS after stale, upload, prompt-injection, and subset additions |

## Regression check

Re-read the changed plan/TDD/section excerpts. Terminology, config key,
video-segment policy, and UI validator requirements are aligned.
