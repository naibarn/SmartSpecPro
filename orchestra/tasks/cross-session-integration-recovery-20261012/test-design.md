# Test design: progressive gate scope and recovery

| Requirement | Current proof / added test | Residual boundary |
|---|---|---|
| Affected lifecycle paths must run the gate | `test_lifecycle_policy_changes_require_the_gate` | Unit proof of path classification |
| Unrelated changes may skip the gate | `test_unrelated_changes_do_not_require_the_gate` | Does not validate GitHub event payload |
| Missing runner tools cannot silently skip checks | `test_cli_reports_run_and_skip_for_valid_path_lists` runs with `PATH=/nonexistent`; workflow test rejects the old `rg -q` dependency | GitHub hosted runner still supplies Python as configured by setup-python |
| Scope input errors fail closed | `test_scope_cli_fails_closed_when_changed_paths_cannot_be_read` expects exit 2, never `skip` | Workflow job behavior is established by shell command substitution under Actions' `bash -e` |
| Checkout infrastructure failures | PR #781 exact log shows checkout succeeded; no checkout-failure claim is made. This slice tests the actual missing-tool failure. | A separate exact checkout failure log is needed before adding retry policy for that failure class |
| Independent slices / stale canonical base / interrupted worker / merge-lock contention | Existing `test_progressive_integration.py` and `test_progressive_execution.py` cases | Existing local Git adapter tests do not prove live GitHub authority |
| Dirty worktree preservation / runner resource admission | Existing workspace-authority preservation and heavy-resource gate contracts | Live runner/memory contention is environmental evidence, not unit-test evidence |
| Overlapping edits / PR merged by another session / concurrent migration | Not covered by this gate-scope repair; inspect existing domain tests before a follow-up slice | Must be added only to the owning existing controller or migration contract, not a new orchestration framework |
| Repeated no-progress retries | Existing `test_handoff_only_no_delta_loop_stops_blind_retry` and canonical build retry tests | A live CI incident history is not simulated |

Focused command for this slice:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/development-lifecycle -p 'test_progressive_gate_scope.py' -v
```
