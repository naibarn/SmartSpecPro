# Vertical Drama Draft Workspace Design

## Decision

Move new-series planning from an index-owned modal into a URL-addressable Planning
surface that creates a lightweight `vertical_drama_series` shell immediately.
The shell is the only workspace identity (`seriesId`) from the first screen onward;
the existing six-step wizard and server-side draft/QC/source contracts remain the
authoritative generation pipeline.

The shell starts with `status=planning` and is promoted in-place when the user
confirms a Draft/QC selection. There is no second workspace table and no duplicate
series created at commit time. The existing draft ledger remains immutable history
and job recovery storage, not the default page payload.

## User flow

1. `New series` creates a free planning shell and navigates to
   `/drama-series/:seriesId?tab=planning&edit=1`.
2. The existing wizard renders as the Planning page surface and carries the same
   `seriesId` through all draft/source/QC work.
3. The six steps remain ordered and deep-linkable by `?step=`; transient form
   recovery continues to use the existing `draftSessionId` and ledger.
4. Confirming a Draft/QC selection updates the shell in-place and records a compact
   active snapshot (`activeDraft`, `activeQc`, revision, and current step).
5. Normal series/detail loads return only the active snapshot and live job status;
   they never return historical Draft candidates or QC rounds by default.
6. `Planning` shows the series planning dossier and links to Bible, Characters,
   Locations, Series Memory, and Sources & Media/Assets without duplicating those
   editors.

## Data and safety

- All workspace reads and writes require the existing authenticated,
  tenant-scoped Vertical Drama procedure.
- Active planning snapshots are compact JSON and use expected-revision
  compare-and-swap; stale writes are rejected and the user is told to reload the
  latest active plan.
- No paid generation runs during workspace creation or autosave.
- Existing composition/QC ledger rows remain compatible; immutable versions stay
  available for explicit history inspection and do not enter the normal detail
  payload.
- Shell creation is the identity boundary; Draft/QC confirmation is the content
  promotion boundary.

## UI contract

- Reuse the current wizard step labels, primitives, copy conventions, and source
  hub states.
- Full-page mode has a stable header, progress stepper, scrollable content, save
  status, and a return-to-series-list action.
- Mobile uses a horizontally scrollable stepper with accessible labels; desktop
  keeps the stepper visible above the content.
- Planning tab is a concise dossier, not a second copy of every existing editor.

## Acceptance criteria

- New entry creates one shell and navigates without opening a blocking overlay.
- Refreshing the series Planning route restores the same `seriesId` and active step.
- Draft/job/source/QC recovery remains owner-scoped and idempotent.
- Create success opens the Planning tab.
- Planning is directly reachable through `?tab=planning` and survives reload.
- Default Planning/detail requests do not query or serialize full Draft/QC history.
- Explicit history action loads bounded metadata first and full content only for a
  selected version.
- Existing modal callers and existing series tabs continue to work.
- Focused tests, typecheck filtering, formatting, and route/browser checks are
  recorded separately from unrelated baseline failures.
