# Section 04 Review - Conflict and Concurrency Hardening

## Scope Reviewed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/presentation.test.ts`

## Findings
1. Conflict preconditions are now explicit: mutating routes require `expectedVersion` and stale requests produce deterministic conflict responses.
2. `409` contract stability is covered by shared schema (`presentation_conflict_v1`) and test assertions for both service and router layers.
3. Manual and autosave slide writes share the same stale-version detection path, preventing silent divergence in conflict behavior.

## Risks / Follow-ups
- Some write paths still rely on pre-check + mutate sequencing rather than strict DB-level compare-and-swap in one statement; add deeper race stress/integration checks in section 09.
- Frontend conflict UX consumption of `cause.conflict` is pending in section 05.

## Fixes Applied During Review
- Added explicit `CONFLICT` router mapping with conflict payload passthrough.
- Added typed shared conflict schema and reason-code catalog for parser compatibility.
