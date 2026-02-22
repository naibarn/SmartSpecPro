# Section 07: Playback and Export Pipeline

## Objective
Implement slideshow playback payload resolution and export triggers for PNG/MP4 with strict contract validation, dedupe, and throttling safeguards.

## Dependencies
- `section-03-backend-api-and-services`
- `section-05-frontend-editor-and-document-integration`

## Implementation Scope
- Build deterministic slideshow payload from ordered slides and default timings.
- Implement PNG export trigger and status handling.
- Implement MP4 export trigger using existing media job pipeline adapter.
- Enforce transition whitelist (`cut`, `fade`) and normalized render-spec timing.
- Include `schema_version` in render spec and strict worker-side compatibility handling.
- Enforce export-trigger dedupe/idempotency window and per-user/per-deck throttles.

## Test-First Stubs (Write Before Implementation)
- Test: slideshow payload resolution is deterministic for slide order and durations.
- Test: unsupported transition values are rejected before enqueue.
- Test: render-spec includes `schema_version`; unknown schema versions fail with explicit error.
- Test: duplicate export requests in dedupe window produce one queued job outcome.
- Test: enqueue throttles enforce per-user/per-deck limits and return stable retry semantics.
- Test: frontend surfaces actionable export status/failure messages.

## Implementation Tasks
1. Add slideshow payload builder and normalization helpers.
2. Add PNG and MP4 export trigger endpoints and enqueue adapter.
3. Add render-spec version field and validation guards at enqueue boundary.
4. Add dedupe/throttle checks and stable error mapping.
5. Wire frontend play/export actions and status polling indicators.

## Acceptance Criteria
- Valid decks can trigger PNG and MP4 exports with expected defaults.
- Export path blocks invalid transitions and contract mismatches.
- Duplicate-click/retry bursts do not flood queue.
- User sees deterministic status/error outputs in UI.

## Risks and Mitigations
- Risk: queue overload from repeated export triggers.
- Mitigation: idempotent enqueue behavior + throttling + telemetry.

## Out of Scope
- Advanced transitions, narration, or audio-sync editing.

## As-Built Implementation Notes
- status: `implemented`
- implemented_on: `2026-02-22`

### Files Changed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

### Deviations From Plan
- The enqueue adapter currently generates deterministic export job records in-process and does not dispatch to an external worker transport; this keeps contract/throttle/dedupe behavior testable for MVP while preserving the render-spec boundary for later queue integration.

### Tests Added/Updated
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- validated regression compatibility with:
  - `apps/web/server/routers/presentation.test.ts`

### Known Follow-Ups
- Replace in-process export state with durable multi-instance storage/queue status.
- Add background polling integration to reflect real worker progress transitions (`processing`/`done`/`error`).
