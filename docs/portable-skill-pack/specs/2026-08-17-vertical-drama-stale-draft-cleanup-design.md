# Vertical Drama stale Draft cleanup design

## Goal

Reduce Draft Job Inbox loading and clutter by offering an owner-scoped cleanup
when inactive pre-series Draft jobs are older than 5, 7, or 10 days. Existing
series data and Draft jobs already applied to a series must never be changed.

## Considered approaches

1. Client-only filtering plus one archive request per visible row. This is the
   smallest UI change, but it misses stale jobs beyond the 50-row list limit,
   creates many requests, and can race with jobs that become active.
2. Server-calculated counts plus one guarded bulk-archive mutation. This adds a
   small server contract but covers all matching rows and rechecks ownership,
   status, and age atomically. This is the selected approach.
3. Hard-delete ledger rows and immutable versions. This saves more storage, but
   permanently destroys recovery history and is not justified by the inbox-load
   goal.

## Eligibility and safety contract

- Inactivity is measured from the server-owned `updatedAt` timestamp.
- Allowed thresholds are exactly `5 | 7 | 10` days.
- Active states `queued`, `composing`, and `qc_running` are excluded.
- `applied` and `archived` are excluded. In particular, cleanup cannot affect a
  Draft that has already been used to create a series.
- Eligible terminal/pre-series states are `ready_for_qc`, `passed`, `failed`,
  and `cancelled`.
- Every count and update is scoped by both `tenantId` and `userId`.
- The mutation re-evaluates the cutoff and eligible states in its database
  predicate, so a row updated or reactivated after the dialog opened is skipped.
- Cleanup archives matching Draft jobs by setting `jobStatus = "archived"` and
  `archivedAt`; it does not delete ledger rows, immutable versions, storage
  snapshots, or any `vertical_drama_series` row.

## Server contract

`listDraftJobs` returns its existing metadata-only `jobs` array plus a cleanup
summary containing counts for 5, 7, and 10 days. Counts are calculated across
all eligible unarchived jobs, not only the first 50 visible rows.

A new authenticated `archiveStaleDraftJobs` mutation accepts a threshold from
the fixed enum, performs one owner-scoped guarded update, and returns the actual
number archived. No schema migration or new dependency is required.

## User experience

After the Draft Inbox metadata loads successfully on `/drama-series`, the UI
opens one accessible alert dialog when at least one eligible job is older than
5 days. The dialog:

- explains that only inactive Draft jobs are being removed from the inbox;
- states that created series are unaffected;
- offers 5, 7, and 10 day choices with the current matching count for each;
- requires an explicit destructive confirmation;
- disables dismissal/actions while the archive mutation is pending;
- shows a success or error toast, then refreshes the inbox on success.

The prompt opens at most once per mounted page for a given cleanup-summary
signature, so background polling/refetches do not repeatedly interrupt a user
who declines. A manual reload may offer cleanup again while eligible jobs remain.

## Data flow and failure handling

1. The index route loads the existing metadata-only Draft list and cleanup
   summary.
2. The client derives whether the dialog should be offered and defaults to the
   least destructive 10-day threshold when that bucket is non-empty; otherwise
   it uses the oldest available bucket.
3. The user may select any non-empty 5/7/10-day bucket and confirm.
4. The server archives only rows that still satisfy owner, state, and cutoff
   predicates.
5. Success closes the dialog and refreshes the list/counts. A zero-row result is
   treated as a safe race outcome. Failure leaves the dialog available and
   reports the error without changing client data optimistically.

## Verification

- Service tests prove threshold validation/counting and guarded bulk archive:
  owner isolation, exact cutoff, active exclusion, `applied` exclusion, and no
  dependence on the 50-row display limit.
- Router tests or contract-level tests prove the fixed threshold input and
  owner-scoped call.
- UI tests prove automatic offer, 5/7/10 counts, default threshold, decline
  suppression during refetch, pending state, success refresh, and failure state.
- Run focused Vitest suites, targeted TypeScript diagnostics, Prettier check,
  and scoped `git diff --check`. Browser evidence is reported separately if an
  authenticated browser session is unavailable.

## Deployment

No migration, environment variable, dependency, or background worker is added.
The frontend and backend must be deployed together because the list response
and mutation are consumed by the updated UI.
