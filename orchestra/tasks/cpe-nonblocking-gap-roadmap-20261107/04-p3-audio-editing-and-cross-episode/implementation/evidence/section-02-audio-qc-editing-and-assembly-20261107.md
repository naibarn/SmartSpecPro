# P3 Section 02 — Audio QC, Editing and Assembly

## Integrated slice

Code checkpoint: `017916574fe175490357a7d816af27a08af25cad` on `origin/main`.

- Shot manifests now read persisted rows only. Mix edits append a version under a per-shot transaction lock; rollback appends a new version copied from the selected take, preserving the prior records.
- Shot QC now validates episode ownership and returns stored measurements only. Missing reports are `UNAVAILABLE`; the API and inspector no longer invent transcripts, scores, sync values, LUFS or peak measurements.
- Dialogue mix gain is read from the latest manifest version and applied to separately generated TTS during final assembly. It does not alter native audio baked into source clips.
- Missing or expired optional TTS downloads are skipped per segment. Video assembly continues with the source clip audio as its base and records requested, included and missing segment counts/reasons in `assemblyManifest.finalRender`.
- Foley and ambience controls are disabled because the current final-render graph cannot mix separate stems. The sidechain and mastering meters are presented as unavailable instead of completed behavior.
- Surgical repair no longer queues a GPU job with no source/TTS inputs or reports a nonexistent 5-credit charge. The action is unavailable until the source-bound canonical job, idempotent billing and artifact writeback are implemented. This does not affect image or video generation.
- The audio inspector now receives the persisted episode ID, reads manifest/QC records, and saves one version when a fader interaction is committed rather than for every slider movement.

## Verification

- Profile: `package`; revision under test: `017916574fe175490357a7d816af27a08af25cad` plus uncommitted evidence/HandOff updates.
- Focused command:
  `pnpm --filter @smartspec/web exec vitest run server/routers/__tests__/verticalDramaEpisodes.textOverlayPlan.test.ts server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaAudioInspector.test.tsx -t 'Feature 175 audio record truthfulness|keeps the video render available|applies the persisted dialogue mix delta|VerticalDramaAudioInspector component'`
- Result: 15 passed, 104 skipped; all 3 files passed.
- Full selected suites: 117 passed, 2 pre-existing failures. The assembly capacity assertion expects `/tmp` while this host reports `/mnt/SmartSpecDev`; the episode-detail flag-off assertion expects 3 DB reads but observes 4. Neither concerns this audio slice.
- `git diff --check`: passed before the code commit.
- Not run: repository-wide TypeScript check, per repository memory limits.

## Remaining Section 02 gaps

- Surgical repair still needs a validated source clip and matching TTS asset, a canonical `worker_jobs` plus outbox submission, idempotent credit reservation, and completion artifact persistence into the active episode/manifest.
- Foley/ambience stem generation and mixing, mastering worker execution, and persisted QC measurement generation are not implemented. QC remains unavailable until real worker measurements exist.
- Fault coverage for worker restart, malformed QC output, mastering failure, and repair artifact writeback remains pending with those worker paths.

The section checkpoint records this integrated non-blocking slice; it does not mark Section 02 or P3 as accepted.
