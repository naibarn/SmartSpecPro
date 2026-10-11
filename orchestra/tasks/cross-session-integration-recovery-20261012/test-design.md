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

## Ten requested regression scenarios

| # | Scenario | Automated evidence |
|---:|---|---|
| 1 | Two sessions edit independent files | `test_concurrent_nonoverlapping_work_can_integrate_sequentially` uses two real Git worktrees and integrates both slices. |
| 2 | Two sessions edit the same file | `test_two_sessions_with_overlapping_edits_require_conflict_reconciliation` uses two worktrees, asserts Git reports `UU`, aborts the merge, and verifies the first session's file remains. |
| 3 | Main advances during implementation | Existing `test_stale_canonical_base_requires_reconciliation`. |
| 4 | Another session merges a PR first | New unit and Git-adapter test `test_pr_merged_by_another_session_is_reconciled_without_second_merge`; canonical ancestry is required. Closed and superseded PR outcomes also have focused tests. |
| 5 | Checkout/tooling infrastructure failure | Exact PR #781 logs prove checkout succeeded and `rg` was missing. New empty-PATH scope CLI test prevents the actual gate failure from recurring. No checkout failure was observed or invented. |
| 6 | Dirty workspace preservation | Existing `test_dirty_snapshot_preserves_index_worktree_and_untracked_content_without_mutation` and `test_dirty_canonical_workspace_is_snapshotted_and_never_overwritten`. |
| 7 | Runner capacity contention | Existing canonical build tests classify SIGKILL as `RESOURCE_BLOCKED`; no live capacity contention was observed. |
| 8 | Concurrent migration attempts | New static contract tests assert the staging migration uses a transaction-scoped advisory lock with a 5-second lock timeout and that an active receipt returns `IN_PROGRESS`. No live DB migration was run. |
| 9 | Interrupted session recovery | Existing `test_failed_worker_preserves_merge_receipt_and_does_not_repeat_merge`. |
| 10 | Repeated transient CI/Git failures do not loop forever | New retry tests assert exponential backoff and a three-attempt cap; application failures are not retried. Existing no-delta lifecycle and canonical build tests remain in the gate. |

Recovery controller coverage also asserts attempt evidence is redacted, command
timeouts classify as infrastructure, and application/authority/conflict
outcomes do not trigger transport retries. GitHub CI jobs are not rerun or
bypassed by this command retry policy.

Focused command for this slice:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/development-lifecycle -p 'test_progressive_gate_scope.py' -v
```
