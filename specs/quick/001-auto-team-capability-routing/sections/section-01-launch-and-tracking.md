# Section 01: Launch And Tracking

## Ownership

- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- request idempotency migration/schema

## Goal

Make create/start reliable and visible. A user should know where the work went and be able to open the linked Team room/run.

## Acceptance

- Create/start is idempotent.
- User can select a Team or use auto selection.
- Existing active launch is reused.
- Missing/stale/failed kickoff is not treated as success.
- My Requests resolves linked run/work item even when case primary task is delayed.
- Final managed media URL is generated for the authenticated viewer only.

## Verification

- WorkRequest tests
- MyRequests tests
- workOs router tests
- workOsService tests
