# P2 Section 02 — Successful Asset Version Preservation

## Outcome

Generated image tasks are bound to the exact start/stop prompt hash that was
submitted. A durable artifact can replace an approved frame only when its task
id is still attached to the shot and that hash matches the current prompt.
Stale completed artifacts clear only their own pending marker; they do not
change the approved asset id. New image selection is committed under an
episode row lock from the freshly-read plan and rechecks candidate ownership,
readiness, and image MIME inside the transaction.

The existing last-good image stays current through provider submission and
artifact/QC failure. The existing `repairShotImage` endpoint remains
submit-only; linking a repair result is an explicit user action through
`setApprovedStartFrameAsset`.

## Changes

- Added `promptHash` to the start/stop image task metadata in the shared
  storyboard contract and persisted it with pending and failed task states.
- Bound task polling/recovery and candidate promotion to that task hash. A
  stale terminal callback can clear only its matching task marker, preserving
  any approved frame and any newer task.
- Made durable artifact recovery require a matching prompt hash. It discards
  unbound legacy or mismatched task markers rather than promoting an output
  whose source revision cannot be established.
- Stamped hashes on user-edited start prompts so an in-flight render becomes
  stale as soon as its source prompt changes.
- Moved asset promotion into a locked transaction that merges the latest plan,
  verifies the selected asset is still owner-scoped and ready, and commits
  prompt/task validation and pointer activation together. Failed activation
  leaves the prior pointer unchanged.
- Added fault-injection coverage for stale task completion, database activation
  failure, provider submission failure, durable artifact mismatch, and edited
  prompt hash binding.

No SQL migration was needed; the source revision binding is additive JSON data
on the existing plan. Promotion also requires the task artifact's R2 key to
match the owner-scoped ready image's storage key and rejects malformed asset
checksum metadata when present. `media_task_artifacts` has no independent
checksum column, so an independent ledger-to-object checksum comparison is not
representable without a schema change; media ingestion records a checksum on
assets when it downloads and stores provider output.

## Focused Verification

- `pnpm exec vitest run server/services/__tests__/verticalDramaStartFrameReconciliation.test.ts --reporter=dot` — 9 passed.
- `pnpm exec vitest run server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts --reporter=dot -t 'setApprovedStartFrameAsset|persistStartFrameImageTask|refunds credits when generation submission fails'` — 12 passed, 175 skipped.
- `pnpm exec vitest run server/routers/__tests__/verticalDramaEpisodes.updateEpisodeDraftContractPreservation.test.ts --reporter=dot` — 4 passed.
- `pnpm exec vitest run server/__tests__/verticalDramaStartFrameTaskDurability.test.ts --reporter=dot` — 2 passed.
- `pnpm exec vitest run server/routers/__tests__/verticalDramaEpisodes.startFrameAdmissionSafety.test.ts --reporter=dot` — 1 passed.
- `pnpm exec vitest run client/src/pages/__tests__/VerticalDramaEpisodePage.startFrameTaskResume.test.ts --reporter=dot` — 5 passed.
- `pnpm exec vitest run client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx --reporter=dot` — 14 passed.
- `git diff --check` — passed.

The broader source-string suite `VerticalDramaEpisodePage.promptAndImageFlow.test.ts`
reported 4 assertions about unrelated existing copy/source extraction (all-shot
button text, a missing-frame phrase, video-stage source extraction, and a cast
field). Its asserted regions were not changed here. Repository-wide TypeScript
checking was not run, per the shared-workspace RAM restriction. ESLint could
not run because this checkout resolves ESLint 6.4 without a project config.
