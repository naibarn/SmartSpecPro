# TDD plan

## Red tests first

1. `verticalDramaProductReferenceResolver.test.ts`
   - resolves uploaded IDs with tenant/user scope;
   - drops expired/unowned/missing IDs;
   - merges Marketplace/direct/uploaded sources with cap and dedupe;
   - reports missing required uploads instead of silently passing.
   - normalizes managed relative URLs into provider-fetchable URLs and rejects private/unfetchable targets.
   - partial registration is cleaned up or safely recoverable and retries are idempotent.
2. `verticalDramaEpisodePipeline.productReferences.test.ts`
   - special-edition uploaded URL reaches `start_frame_render_plan` frame;
   - customized empty/product selection is preserved;
   - resulting URL list is passed to image/video generation boundaries.
   - `listProductImages` returns the same uploaded references used by generation.
3. `verticalDramaEpisodeContinuation.lineage.test.ts`
   - sequel continuation prompt includes bounded lineage context;
   - original mode remains byte-identical when context is absent;
   - deleted-parent snapshot and no-memory cases degrade honestly.
4. `verticalDramaProductionQcGate.test.ts`
   - no receipt/failed report/missing review blocks new production entry points;
   - passed report allows the next stage;
   - tie-in failure adds a blocking reason;
   - legacy/grandfather and dry-run behavior is explicit;
   - unavailable provider artifact QC is not reported as passed.
   - a changed script/storyboard/reference revision invalidates the prior pass.
   - final assembly cannot consume a gate result from an older clip/start-frame revision.
   - routing `ready` without an artifact is `planned`/`unavailable`, not `succeeded`.
5. Router integration tests
   - create payload matrix for no-preset, selected-preset, sequel, and special edition;
   - cross-tenant parent/reference rejection;
   - start-frame, video, and assembly all call the shared QC gate.
6. Story-job lifecycle tests
   - create returns a durable queued story-generation state;
   - worker failure is visible and retry is idempotent;
   - QC readiness is false until the story artifact is actually persisted.

## Regression suite

Run from `apps/web`:

```bash
pnpm exec vitest run \
  client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/CreateSeriesWizard.lineage.test.tsx \
  server/services/__tests__/verticalDramaPresetSynthesis.test.ts \
  server/services/__tests__/verticalDramaProductTieIn.test.ts \
  server/services/__tests__/verticalDramaSeriesLineage.test.ts \
  server/services/__tests__/verticalDramaQualityLoop.test.ts \
  server/routers/__tests__/verticalDramaSeries.createLineage.test.ts \
  server/routers/__tests__/verticalDramaSeries.createSpecialEdition.test.ts \
  server/routers/__tests__/verticalDramaSeries.tieInDraft.test.ts \
  server/routers/__tests__/verticalDramaSeries.deepStoryDrafts.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts
```

Then run changed-file diagnostics, `git diff --check`, and a browser pass for:

- no preset → draft QC → create;
- selected preset → look-lock → draft QC → create;
- sequel parent selection → carry-over → create;
- special edition upload → reference status → QC block/pass → start frame;
- repair/re-review → final assembly eligibility.
- story shell → queued/running/failed/retry → QC-ready state.

## Test environment notes

- Use the repository package manager (`pnpm`).
- Mock paid provider calls but retain real ownership queries and QC policy decisions.
- Keep DB-not-initialized model-registry fallback warnings separate from test failures.
- Do not accept tests that only assert UI payload collection; each mode needs at least one server-boundary assertion.
