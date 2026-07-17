# Plan Self-Review — Round 1

| Category | Result | Findings |
|---|---|---|
| Structural integrity | pass after fix | End-to-end flow is defined across Skill, stock, router, and UI. |
| Completeness vs spec | pass after fix | All approved requirements and non-goals are represented. |
| Implementability | pass after fix | File paths, contracts, ordering, and focused gates are explicit. |
| Internal consistency | pass after fix | Candidate/batch/primary terminology is consistent. |
| Edge cases | pass after fix | Partial failure, zero-cost models, manual primary, reload, and concurrency are covered. |

## Material issue found

The initial plan returned strict candidate snapshots to the browser and accepted them back at
submission, which contradicted the approved requirement that candidate DNA be server-authored
and not replaceable by the client.

## Fix applied

Candidate preview now persists draft candidate rows with strict snapshots and returns only
display-safe prompt metadata plus server-issued IDs. Submission atomically claims the stored
batch. Expiry/supersession and duplicate-submission behavior are defined.

Result: all Phase A checklist categories pass after the fix.

