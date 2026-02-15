# Code Review: Section 11 - Video Rendering Pipeline

This implementation has several high-severity issues and significant gaps relative to the plan.

## CRITICAL: Render Hash Mismatch Between Node.js and Python (DATA CORRECTNESS BUG)

The Node.js `computeRenderHash` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/renderHash.ts` (line 91) uses `JSON.stringify(canonical)` with default serialization (includes spaces after colons, no sorted keys). The Python `compute_render_hash` in `/home/dev/projects/SmartSpecPro/python-backend/app/video/render_hash.py` (line 91) uses `json.dumps(canonical, sort_keys=True, separators=(',', ':'))` which produces compact JSON with sorted keys. These will NEVER produce the same SHA-256 hash for the same inputs. This defeats the entire idempotency mechanism -- a render hash computed on the Node.js side will never match one computed on the Python side, meaning the Python-side idempotency check or any cross-system comparison is broken. The Node.js side must use `JSON.stringify` with sorted keys (e.g., via a custom replacer or a library like `json-stable-stringify`) AND use compact separators (no spaces), or the Python side must match the Node.js serialization format exactly.

## CRITICAL: `storageHeadObject` Does Not Exist

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (lines 394-396), the `submitRender` procedure dynamically imports `storageHeadObject` from `../storage`. However, `/home/dev/projects/SmartSpecPro/apps/web/server/storage.ts` does NOT export any function named `storageHeadObject`. The existing exports are: `storagePut`, `storageGet`, `storageDelete`, `storagePresignPut`, `storagePresignGet`, `storageResolveUrl`, `storageStreamFile`, etc. The `if (typeof storageHeadObject === 'function')` guard at line 395 makes this fail silently -- the R2 cache check is ALWAYS skipped, so renders are never served from cache on the Node.js side. This makes the entire cache-before-enqueue optimization nonfunctional.

## HIGH: Environment Variable Mutation in Async Context Is Unsafe

In `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` (lines 418-432), the fallback codepath sets `os.environ['RENDER_SPEC'] = json.dumps(render_spec)` and then spawns a background thread to call `render_main()`. This is a global process-wide mutation. If two concurrent render requests arrive, the second request will overwrite `RENDER_SPEC` before the first thread reads it, causing one render to process the wrong spec. This is a race condition that can produce corrupted output delivered to the wrong user. The entrypoint should accept the render spec as a function argument in the inline fallback path instead of relying on environment variables.

## HIGH: Background Thread Fire-and-Forget With No Error Tracking

In `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` (lines 421-422 and 431-432), daemon threads are spawned with `thread.start()` and immediately abandoned. If the thread crashes, no error is propagated to the user, no retry is attempted, and no alerting occurs. The `daemon=True` flag means the thread will be killed if the main process shuts down, potentially leaving partial files in R2 or corrupt database state. There is no mechanism to track whether these inline renders complete.

## HIGH: Input Validation Is Insufficient

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (line 371), the `renderSubmitSchema` uses `project: z.any()` which accepts literally any value, including `null`, `undefined`, numbers, or malformed objects. This means a malicious or buggy client can send garbage data that will be forwarded to the Python backend and potentially crash FFmpeg. The plan specifies this should be a `VideoEditorProject` -- at minimum, the schema should validate that `project` is an object with `timeline.tracks` and `settings` fields.

## HIGH: FFmpeg `drawtext` Filter Has Empty `fontfile` Parameter

In `/home/dev/projects/SmartSpecPro/python-backend/app/video/pipeline.py` (line 346), the drawtext filter includes `fontfile=''` which is an empty string. This will cause FFmpeg to fail on most systems because it cannot locate a font file at an empty path. The plan states fonts are installed via fontconfig in the Docker image and should be resolved by the `font=` parameter alone. The `fontfile=''` parameter should be removed entirely.

## HIGH: No Database Update After Render Completion

The plan (Section 5, step 9) explicitly requires: 'Update the database record with the R2 key and metadata (file size, duration, resolution).' The entrypoint in `/home/dev/projects/SmartSpecPro/python-backend/app/video/entrypoint.py` logs progress and uploads to R2 but never writes to the database. There is no import of any database client, no SQLAlchemy session, and no database update logic anywhere in the entrypoint. Renders complete silently with no persistent record.

## MEDIUM: Direct HTTP Fallback Has No Authentication

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (lines 452-465), the non-Cloud-Tasks fallback path sends a `fetch` POST directly to the Python backend at `/api/v1/media/tasks/process-video` with no authentication headers. The plan states this endpoint is 'protected by OIDC validation middleware (see Section 04).' Without an auth token, the Python backend should reject this request (if OIDC middleware is active). If OIDC is not yet active, this is an unauthenticated endpoint that can launch arbitrary renders.

## MEDIUM: Response From `fetch` in Fallback Path Is Never Checked

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (lines 457-465), the `await fetch(...)` call's response is completely ignored. If the Python backend returns a 400, 500, or any error, the Node.js side still returns `{ cached: false, jobId, renderHash, queueName }` to the client as if the job was successfully dispatched. The user sees a 'processing' state that will never complete.

## MEDIUM: Job Routing Tests Do Not Test the Actual TypeScript Function

The test file `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_video_job_routing.py` defines its own `_route_video_job` Python function and tests that instead of testing the actual `routeVideoJob` TypeScript function in `/home/dev/projects/SmartSpecPro/apps/web/server/services/videoJobRouter.ts`. This means the TypeScript implementation could have bugs that these tests would never catch. The plan specified these as Python tests, but the routing logic lives in TypeScript -- there should be TypeScript tests via Vitest for the actual implementation.

## MEDIUM: Idempotency Tests Are Shallow

The idempotency tests in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_render_idempotency.py` do not actually test the `entrypoint.main()` function at all. They create standalone mock objects and assert mock behavior that the test itself defines. For example, `test_existing_render_hash_skips_ffmpeg` creates a mock with `file_exists.return_value = True` and then asserts it returns True -- this tests Python's mock library, not the idempotency logic in `entrypoint.py`. The tests should patch `get_r2_client` inside the entrypoint and verify that `subprocess.run` (FFmpeg) is never called.

## MEDIUM: `test_text_overlay_uses_drawtext` Does Not Actually Test Drawtext

In `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_ffmpeg_pipeline.py`, the test `test_text_overlay_uses_drawtext` asserts `'T1' in str(render_spec['project']['timeline']['tracks'][0]['name'])` which merely confirms the test fixture contains the string 'T1'. It does not invoke `run_final_render` or verify that drawtext filter commands are generated. The plan requires verifying that drawtext filter parameters (font, size, color, position, enable range) are correctly produced.

## MEDIUM: Missing `v2_overlay_positioning` and `audio_mixing_with_amix` Tests

The plan specifies `test_v2_overlay_positioning` and `test_audio_mixing_with_amix` tests in `TestFinalRenderStage`. Neither test exists in the implementation.

## MEDIUM: Assembly Stage Does Not Handle Audio-less Clips

In `/home/dev/projects/SmartSpecPro/python-backend/app/video/pipeline.py`, the re-encode path assumes all clips have audio streams. If a clip is an image sequence or a video without an audio track, FFmpeg will fail with 'Stream map ... matches no streams.' The existing codebase handles this with silent audio generation (`anullsrc`), but that logic was not ported here.

## MEDIUM: `run_assembly_stage` Does Not Handle Transitions (xfade)

The plan states: 'Reuse the existing trim/scale/xfade filter chain from media_job_worker.py.' The implementation does concatenation via the concat filter but does NOT implement xfade transitions between clips. The existing `XFADE_MAP` and transition logic from `media_job_worker.py` is not referenced or used. Clips will hard-cut instead of using configured transitions.

## LOW: Redundant `RenderProfile` Type Export

The `RenderProfile` type is exported from both `videoEditor.ts` and `renderHash.ts`. The server-side code should import from the shared client types file to maintain a single source of truth.

## LOW: No Render Duration/Resolution in Upload Metadata

The plan (step 9) requires updating the DB record with 'file size, duration, resolution.' While file size is captured, duration and resolution of the final output are never probed.

## LOW: Missing `media_job_worker.py` Refactoring

The plan explicitly requires modifying `media_job_worker.py` to 'extract shared helpers into reusable modules under app/video/.' The diff shows no changes to this file. The progress reporting and pipeline logic were reimplemented from scratch rather than extracted, meaning there are now two parallel implementations that can drift.
