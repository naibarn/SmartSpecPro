# Implementation Plan

## Objective

Provide a durable, URL-addressable Draft Workspace for creating Vertical Drama
series and a post-create Planning tab, while preserving the existing wizard,
source-pack, composition, QC, and series creation contracts.

## Work sections

1. Series identity and active-plan contracts: create an owner-scoped planning
   shell, promote it in-place, and persist only a compact active snapshot with a
   revision guard.
2. Wizard surface: add a page presentation mode, pass the shell `seriesId`
   through finalization, preserve modal/recovery compatibility, and avoid loading
   history in the default status request.
3. Route integration: navigate New to the existing Series route with
   `?tab=planning&edit=1`; no static draft workspace route or duplicate identity.
4. Planning tab: add a concise active-plan dossier, sync tab state to `?tab=`, and
   make history a separate explicit/lazy action.
5. Proof: focused unit/UI tests, filtered typecheck, format/diff checks, and
   browser evidence for mobile/tablet/desktop when runtime access is available.

## Security and data boundaries

- Use `verticalDramaProcedure` and `requireTenantId` for all mutations/queries.
- Every planning lookup/update uses both tenant and user ownership.
- Enforce owner identity, bounded JSON size, and expected-revision CAS.
- Never create paid jobs from shell creation/autosave; attach the selected Source
  Pack only during in-place finalization.

## Acceptance criteria

- New button creates one shell and opens its full-page Planning route.
- Refresh/resume preserves the same Series identity and active step.
- Modal fallback still opens and creates series.
- Existing draft jobs remain selectable and recoverable.
- Planning tab is linkable, reload-safe, and points to canonical documents.
- Default Series/Planning/status responses contain no historical Draft/QC arrays.
- Explicit history returns bounded metadata and full content only on version select.
- No new feature-owned typecheck errors or focused test failures.
