# Implementation plan

## Objective

Offer a safe 5/7/10-day cleanup dialog for stale Draft Job Inbox rows without
loading full Draft payloads or touching created series.

## Current-codebase fit

Extend the existing Draft ledger service with shared threshold/status constants,
a count summary, and one guarded bulk archive. Expose these through the existing
`verticalDramaSeries` tRPC router. Add one focused dialog component and mount it
from `VerticalDramaShell` using the cleanup summary already returned by the list
query.

## Affected files

- `apps/web/server/services/verticalDramaDraftLedger.ts`
- `apps/web/server/services/__tests__/verticalDramaDraftLedger.test.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaShell.tsx`
- new focused dialog/helper test files if isolation keeps the shell maintainable

## Implementation approach

1. Add a fixed `5 | 7 | 10` threshold contract and pure cutoff/count helpers.
2. Query counts across every eligible unarchived owner row, independently of the
   50-row display limit.
3. Bulk archive with one `UPDATE ... WHERE` containing tenant, user, eligible
   status, unarchived, and cutoff predicates. Return the affected count.
4. Run the list and summary queries together in `listDraftJobs`; add a fixed-enum
   `archiveStaleDraftJobs` mutation.
5. Render an AlertDialog with RadioGroup choices/counts. Open once per summary
   signature, default 10 -> 7 -> 5, lock controls while pending, toast result,
   and refresh on success.

## Risks and mitigations

- Status race: update predicate rechecks status and age.
- Cross-owner access: both predicates require tenant and user.
- Created-series loss: `applied` is not in the eligible status allowlist and no
  series table is referenced.
- Prompt spam: keep handled summary signatures in component state/ref.
- Dirty worktree conflicts: inspect and preserve existing target-file hunks.

## Acceptance criteria

- Dialog appears only when a 5-day stale eligible count is positive.
- Choices show accurate 5/7/10 counts and cannot select an empty bucket.
- Confirmation archives all and only rows still eligible for that owner/cutoff.
- Active, applied, archived, other-user, and other-tenant rows remain unchanged.
- Created series and full Draft snapshot/version data are untouched.
- Focused tests, formatting, targeted diagnostics, and scoped diff checks pass.
