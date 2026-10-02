# Character prompt job output serialization

## Summary

Character `character-5` (ชิงเหอ) had both a prompt result settlement failure and earlier image-admission failures. The prompt job was rejected because an optional candidate field was present with JavaScript value `undefined`, which is not accepted by the worker job JSON validator. One already completed image task was subsequently linked to the character and is now the approved primary portrait; no new image was generated during recovery.

## Evidence and symptom

- `worker_jobs` row `7c0d5e65-9e1d-43ad-b244-31bf3bdee3bb` is a failed `vertical_drama.character_prompt` job for series 60 / character 269, with error `result.output: Job definition contains an unsupported value`.
- Its event history reached `STARTED` and then `FAILED` about 30 seconds later. The failure was at result settlement, after execution began; it was not a queue-admission or image-provider failure.
- Candidate task `d89c2d52-6465-4466-8a86-de47d90e6d0e` was `completed` with a result, while portrait asset link 685 remained `queued` and unlinked.
- After settlement recovery and portrait selection, asset link 685 is `primary_portrait`, approved, selected, and has a `mediaAssetId`.
- `server-debug.log` records `media.generateImageAsync: Job control plane unavailable. The task was not submitted to the provider.` at 2026-09-26 06:46:51Z and 06:50:51Z. Related stored image tasks have `celery_task_id = null`, no result, and dispatch-failure state, which confirms they were not submitted to the provider. The available log retained only `INTERNAL_SERVER_ERROR`; it does not preserve the lower-level control-plane cause.

## Root cause

The candidate prompt generator defines `negativePrompt` as optional (`string | undefined`). `previewCharacterPrompt` copied that value into every candidate output object even when absent. The canonical worker completion path validates `result.output` as bounded JSON and correctly rejects `undefined`; therefore the executed job was marked failed and its generated prompt result was not persisted. Optional `castingAgeProfile` was also emitted unconditionally in the same output path when absent.

The image-admission symptom is separate: requests made while the canonical control plane was unavailable failed before provider submission, and those older candidate rows were persisted as failed. The historical event does not identify why that control-plane request was unavailable. The batch endpoint also had a recovery gap: it terminalized all image rows when dispatch was partial or unavailable, even though image tasks are durable and the existing unclaimed-task reconciler can retry them.

## Fix and recovery

- Candidate and single-prompt responses now omit `negativePrompt` when it is undefined. Candidate responses also omit `castingAgeProfile` when absent.
- Image batch dispatch now leaves durable image tasks pending when control-plane admission fails or only partially succeeds, returns their task IDs to the caller, and lets the existing recovery loop retry. Non-image batch error handling is unchanged.
- Existing completed image task `d89c2d52-6465-4466-8a86-de47d90e6d0e` was settled through the owner-scoped portrait candidate service. No image generation was resubmitted.
- Added regression tests for absent candidate `negativePrompt` against the worker output validator, and for zero/partial batch dispatch retaining pending media tasks for recovery.

## Validation

- RED: the new regression initially failed with `result.output: Job definition contains an unsupported value`.
- GREEN: `npx vitest run server/routers/__tests__/verticalDramaCharacters.customInstruction.test.ts -t 'absent optional negative prompt from durable candidate job output' --reporter=dot` passed (1 test).
- RED: batch admission test initially reproduced HTTP 503 and terminal task failure when dispatch returned no admitted IDs.
- GREEN: `DEBUG=false uv run --project python-backend python -m pytest --no-cov python-backend/tests/unit/api/test_media_generation_worker_admission.py -k 'image_batch_dispatch_failure_keeps_tasks_pending or image_dispatch_failure_keeps_task_pending' -q` passed (4 tests, including thrown, zero, and partial dispatch).
- `git diff --check` passed for all touched source, test, and incident paths.
- Database verification confirmed the completed media task and asset 685 as approved `primary_portrait` after recovery. This confirms the configured database state; it does not prove the production web deployment has received the source patch.

## Prevention plan

1. Keep the candidate result-contract regression against the same `validateBoundedPayload` validator used by worker settlement.
2. Retain the zero/partial batch dispatch test and extend it with a recovery pass that proves an unclaimed pending task is eventually admitted once the control plane returns.
3. Add an operational alert or dashboard filter for `JOB_PAYLOAD_INVALID` failures on successful executor work, and retain the low-level cause code for dispatch failures without exposing provider payloads.
4. Deploy the source fix, then verify a new character prompt job reaches `succeeded` and a newly admitted candidate reaches a completed image state. The source patch is local and deployment was not performed in this task.
