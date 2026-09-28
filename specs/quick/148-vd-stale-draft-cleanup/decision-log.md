# Decision log

- Planning depth: standard. The change is medium scope across service, router,
  UI, and focused tests, with no schema or architecture migration.
- Selected server summary plus guarded bulk archive over client-only per-row
  requests because the visible list is limited to 50 and status can race.
- Selected archive over hard delete to reduce inbox loading while keeping Draft
  recovery history and immutable snapshots intact.
- Counts are returned with `listDraftJobs` so the prompt needs no extra client
  round trip. Server implementation may use parallel list/summary queries.
- Default selection is the oldest non-empty bucket: 10, then 7, then 5 days.
- Prompt suppression is per mounted page and summary signature; a full reload
  may prompt again while stale Draft jobs remain.

## Self-review record

1. Coverage: added the list-limit requirement and explicit series non-goal.
2. Contradictions: aligned “delete” UX wording with recoverable archive behavior.
3. Security: added tenant and user scoping for both summary and mutation.
4. Race handling: required mutation-time status/cutoff revalidation.
5. UX/testing: added pending, error, refetch suppression, bilingual copy, and
   keyboard accessibility. No further meaningful auto-fix found.
6. Final consistency pass: two consecutive rounds found no contract drift or
   unresolved product decision.
