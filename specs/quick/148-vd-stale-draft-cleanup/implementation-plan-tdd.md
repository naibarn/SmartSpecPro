# TDD plan

1. Extend the ledger unit suite first with failing tests for fixed thresholds,
   exact cutoff behavior, nested 7/10 counts, eligible statuses, and exclusion
   of active/applied/archived rows.
2. Add a focused dialog/helper suite first with failing cases for explicit open,
   default selection, count labels, no automatic interruption, pending lock, success
   refresh, and error reporting. Prefer pure exported selection/signature helpers
   if full shell rendering requires unrelated provider setup.
3. Implement the service helpers and guarded DB functions.
4. Wire the router response and fixed-enum mutation.
5. Implement the dialog and mount it from the shell.
6. Run focused Vitest files, format only touched paths, run targeted TypeScript
   diagnostics, and finish with scoped `git diff --check`.
