# TDD Plan

## Red tests first

1. Shared cover tests:
   - legacy single state reads as slot 1;
   - variant envelope returns four independent slots;
   - slot-specific projection preserves other slots;
   - seeded reference selection is stable for the same key and differs for a new key;
   - requested one/two/three counts are capped after logo capacity.
2. Preview-state tests:
   - `coverSlotId` parses and round-trips;
   - missing `coverSlotId` remains valid for legacy previews;
   - assignment prefers unused ready covers and reuses only available covers when necessary.
3. Remotion tests:
   - a protected clip and cover are transformed to broker URLs in both template layers and manifest sources;
   - server-side staging still calls `storageStreamFile` for managed keys.
4. Router/service tests:
   - generation writes only the requested cover slot;
   - status polling finalizes only that slot;
   - preview submission persists the chosen cover slot.
5. UI tests:
   - four cover slots render;
   - clicking one slot sends its slot ID;
   - generating one slot does not disable the other three.

## Green implementation order

1. Implement shared state/selection helpers and make shared tests pass.
2. Extend preview state and add assignment helper tests.
3. Add broker URL resolution at the Remotion preview input boundary and make worker tests pass.
4. Update router per-slot persistence/status/upload and router tests.
5. Update the cover panel UI and component tests.
6. Run the combined focused suites and changed-file diagnostics.

## Regression checks

- Existing `verticalDramaEpisodeCover.test.ts` remains green.
- Existing preview state/reconciliation tests remain green.
- Existing `verticalDramaEpisodeVideoAssembly.test.ts` managed-storage download tests remain green.
- Existing media broker tests remain green.
- No direct protected `/api/storage/files` URL remains in worker-facing preview template/manifest fixtures.
