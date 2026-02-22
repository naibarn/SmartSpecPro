# Section 06: Export Degradation and Warning Contract

## Objective
Guarantee PNG/MP4 export compatibility for v2 payloads by applying deterministic degradation precedence and stable slide-level warning codes instead of hard export failure for unsupported constructs.

## Dependencies
- `section-02-v2-schema-and-contracts`
- `section-03-desktop-interactions-and-command-model`

## Scope
- Define deterministic degradation precedence rules for unsupported constructs.
- Keep export trigger/status endpoints stable for existing clients.
- Emit stable warning codes and slide references in export result metadata.
- Surface warning summaries in editor/export UX with accessible semantics.
- Add snapshot fixtures to lock degradation behavior across changes.

## Out of Scope
- New export formats (for example PDF).
- Re-architecture of background export workers.

## Files to Add or Modify
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/shared/presentation/exportWarnings.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/components/presentation/ExportStatusPanel.tsx`
- `apps/web/server/services/__fixtures__/export-degradation/*.json`

## Test-First Stubs (Write Before Implementation)
- Test: unsupported constructs degrade according to precedence table, not implementation order.
- Test: warning output contains stable warning codes and slide references.
- Test: repeated export for same payload yields deterministic degradation snapshots.
- Test: export status job state transitions remain backward compatible for PNG/MP4 flows.
- Test: warning summary UI placement/persistence/dismissibility behavior is deterministic and accessible.

## Implementation Tasks
1. Create degradation decision module with explicit precedence table and stable warning-code map.
2. Integrate degradation module into export payload preparation before render execution.
3. Preserve existing job trigger and polling contract while extending warning metadata.
4. Add warning summary rendering in client export status flow with keyboard-readable semantics.
5. Add fixture-based snapshot tests for representative unsupported payload cases.
6. Add contract tests for warning-code stability to prevent accidental renaming.

## Acceptance Criteria
- Export continues for degradable payloads with deterministic, user-visible warnings.
- Warning codes are stable and validated by fixtures/snapshots.
- Existing PNG/MP4 export invocation and status workflows remain compatible.

## Risk Controls
- Separate degradation rule table from renderer internals to keep behavior reviewable.
- Fail closed for truly non-renderable/unsafe payloads with explicit error code when degradation is impossible.
- Add canary alerting for warning-rate spikes and export failure drift (implemented fully in Section 08).

## As-Built

### Actual Files Changed
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/__fixtures__/export-degradation/unsupported-constructs.input.json`
- `apps/web/server/services/__fixtures__/export-degradation/unsupported-constructs.expected.json`
- `apps/web/shared/presentation/exportWarnings.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `specs/feature/021-CanvasEditor/reviews/section-06-review.md`

### Deviations From Plan
- Warning UI was integrated directly in `PresentationEditor` header status area instead of introducing a new `ExportStatusPanel` component.
- Unsupported transition handling now degrades to `cut` with warning code instead of hard validation failure, preserving export queue behavior.

### Tests Added or Updated
- Added:
  - `apps/web/server/services/presentationExportDegradation.test.ts`
  - fixture snapshots under `apps/web/server/services/__fixtures__/export-degradation/`
- Updated:
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/shared/presentation/contracts.ts` (schema contract extension)
- Targeted run:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- shared/presentation/contracts.test.ts server/services/presentationExportDegradation.test.ts server/services/presentationPlaybackExport.test.ts client/src/pages/PresentationEditor.test.tsx"`

### Known Follow-Ups
- Wire export warning counts/code distributions to rollout dashboards and alert thresholds in Section 08.
