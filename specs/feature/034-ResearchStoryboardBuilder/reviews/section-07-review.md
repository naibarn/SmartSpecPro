# Section 07 Review

## Scope reviewed

- `apps/web/server/services/agencyBridge.test.ts`
- `python-backend/tests/unit/test_agency_scope_runtime.py`
- `python-backend/tests/unit/migrations/test_agency_structured_results_migration.py`
- `specs/feature/034-ResearchStoryboardBuilder/sections/section-07-regression-tests-and-migration-verification.md`

## Findings

- No blocking correctness or security findings in the Section 07 slice.

## Checks performed

- Verified the Node bridge test now covers both presence and absence of `retrieval_scope` in the Python request body.
- Verified the Python runtime regression test is stable against invalid ambient `DEBUG` shell values.
- Verified the new migration contract test asserts the additive `agency_runs` columns, `agency_run_artifacts` table, indexes, and downgrade cleanup for migration 012.
- Verified the section notes accurately record the targeted Node/Python verification commands and the broader Python-suite instability encountered during closeout.

## Residual risk

- Broader Python agency unit suites still have unrelated failures and hangs in this environment, so section-level verification remains targeted rather than full-stack.
- Retrieval scope enforcement is still prompt-level runtime guidance rather than a hard backend tool-execution gate.
