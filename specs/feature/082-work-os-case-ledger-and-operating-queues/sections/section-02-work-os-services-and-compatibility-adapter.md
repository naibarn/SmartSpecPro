# Section 02 - Work OS Services And Compatibility Adapter

## Goal

Build the server-side Work OS service boundary and the legacy adapter that preserves compatibility while writing through the canonical model.

## Scope

- Add service methods for request creation, case creation/linking, task creation/update, assignment changes, SLA evaluation, exception management, and outcome capture.
- Add a compatibility adapter so legacy team-work-item routes call into the new Work OS service boundary.
- Ensure every mutation remains tenant-checked and event-logged.
- Keep the API surface server-canonical.

## Implementation Notes

- Reuse existing tenant resolution helpers and event logging patterns.
- The adapter should be read/write safe so legacy mutations still produce canonical Work OS events.
- This section should not add new UI screens.
- This section should not invent a parallel workflow engine.

## Likely Files

- `apps/web/server/services/workItemService.ts`
- `apps/web/server/services/workOsService.ts` or equivalent
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/server/routers/__tests__/teamWorkItem.test.ts`

## Tests First

- Assert request creation returns linked request and case records.
- Assert task updates through a legacy surface update the same canonical work identity.
- Assert tenant mismatch on any read/write path fails closed.
- Assert each successful mutation emits a machine-readable lifecycle event with actor and state transition data.

## Acceptance Notes

- Legacy routes keep working, but they no longer own the source of truth.
- The service boundary becomes the only place that mutates ownership, SLA, approval, and exception state.

## Implemented Files

- `apps/web/server/services/workOsService.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/routers/__tests__/workOs.test.ts`

## Deviation

- The compatibility adapter is implemented as a thin server-side service boundary around the existing work-item service rather than a full standalone module split.
