# Section 07 - Media Studio and History UI

## Objective

Deliver user-facing Add-to-Library and Search Library experiences in Media Studio and Media History.

## Scope

- Media Studio action/button and library search panel.
- Media History action/button and added-state indicators.
- Index status display (`indexing|ready|failed`) with clear UX state handling.

## Primary Files

- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/client/src/components/` (new shared library UI components)
- `apps/web/client/src/lib/trpc` hooks/types as needed

## Implementation Steps

1. Add Add-to-Library action to completed media cards/rows.
2. Add optimistic UI and server-confirmed status updates.
3. Add Search Library panel component in Media Studio.
4. Render item readiness/indexing/failure states with retry affordance.
5. Add “already in library” indication in Media History.

## Test-First Checklist

- Test: Add-to-Library action appears only when media item is eligible.
- Test: success and failure toasts/state updates match API outcome.
- Test: Search panel renders results and selected item callback works.
- Test: already-added state renders correctly after refetch.

## Verification

- Run frontend component/unit tests and key UI integration tests.

## Exit Criteria

- Users can add and find reusable assets directly from Media Studio and Media History.
