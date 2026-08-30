# Section 03 — QC and credit history

## Ownership

Per-call QC billing, auto repair/re-evaluate orchestration, credit API display metadata, and UI tests.

## Target areas

- `apps/web/server/services/verticalDramaDraftQualityQc.ts`
- `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts`
- `apps/web/server/routers/credits.ts`
- `apps/web/server/services/creditService.ts`
- `apps/web/client/src/pages/Credits.tsx`

## TDD expectations

Prove independent rows for evaluate/revise/repair and exact skill/model/stage/round values.

## Acceptance checks

The Credits page shows every call in chronological stable order with no missing skill name and no generic “other” label when a slug exists.

## Risks

Reservations may still be needed for preflight; they must not collapse or hide actual call charges. Do not double-charge worker redelivery.
