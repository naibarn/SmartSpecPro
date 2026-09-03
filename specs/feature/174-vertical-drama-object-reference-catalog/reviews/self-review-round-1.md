# Plan Self-Review — Round 1

## Scorecard

| Category | Score | Result |
|---|---:|---|
| Structural integrity | 4/5 | Procedure names and UI ownership needed to be more explicit |
| Completeness vs spec | 5/6 | Core requirements covered; API boundary was too broad |
| Implementability | 5/6 | Shared lifecycle and typed response shape needed a concrete contract |
| Internal consistency | 4/4 | One catalog and two modes are consistent |
| Edge cases/failure modes | 4/4 | Non-blocking, ownership, retry, and provider failure rules covered |
| **Total** | **22/25** | **Needs fixes** |

## Findings and fixes

1. “Add typed procedures” could be implemented with inconsistent names or
   silent no-ops. Fixed by listing exact catalog and episode procedure names,
   required revision/idempotency inputs, and response metadata in section 4.
2. The UI plan did not state which component owns route, adapter, shot, and
   picker behavior. Fixed by adding explicit route/component ownership and
   browser state evidence in section 9.
3. The UI state contract needed a direct browser acceptance list. Fixed by
   adding the state matrix cases and keyboard-equivalent acceptance.

Round 1 is closed after applying these fixes.
