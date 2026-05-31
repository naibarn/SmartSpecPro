# Section 06: Direct Media Execution

## Purpose

Schedule image, video, and audio generation from validated shot payloads without creating or using node canvas, `ProductionSpace`, or `flowNodes` for Feature 117 runs.

## Depends On

- section-01-contracts-and-schema.
- section-03-node-runtime-client-and-preflight.
- section-04-creative-planning-contracts.
- section-08-credit-billing-idempotency.

## Blocks

- generated media QA.
- render/library finalize.

## Files Owned By This Section

- new direct execution service such as `apps/web/server/services/marketplaceAutoReviewExecution.ts`.
- `apps/web/server/services/marketplaceAutoReviewService.ts` integration.
- existing media generation service calls only where needed.
- focused direct execution tests.

## Tests First

- Test Feature 117 image scheduling does not call `getProductionSpace`.
- Test Feature 117 image scheduling does not call `scheduleProductionExecution`.
- Test Feature 117 reconciliation does not call `reconcileProductionExecution`.
- Test direct image task stores media task IDs and provider task IDs.
- Test direct `storyboard_3x3_split` extracts 9 frame URLs.
- Test direct `video_shot_start_stop` stores start/stop/storyboard frame URLs.
- Test video clips are scheduled only from accepted shot payloads.
- Test shot payloads carry selected variant hash when variant context affects visuals or claims.
- Test retry resubmits only failed targeted outputs.
- Test provider status mapping handles queued, running, succeeded, failed, cancelled, expired, and unknown.
- Test provider callback with failed signature/authentication cannot advance a run.
- Test duplicate, stale, and out-of-order provider callbacks are idempotent no-ops with audit.
- Test provider event binding rejects tenant/run/stage/media-task mismatches.
- Test provider payload over budget is redacted/linked or blocked before further spend.
- Test provider moderation/content-policy refusal is treated as non-retryable for the same payload.
- Test cancellation during provider wait cancels supported jobs and records non-cancellable jobs.
- Test provider outputs are re-hosted/proxied when policy requires and signed provider URLs are not canonical final refs.

## Implementation Requirements

Create `DirectShotMediaExecutionPlan` and execution APIs for:

- storyboard grid image;
- per-shot start/stop frames;
- per-shot video clips;
- separate TTS voiceover;
- native video audio prompt payloads;
- silent video prompt payloads.

Reuse existing provider/media generation routers/services when possible, but call them from direct payloads instead of canvas nodes.

Persist:

- media task IDs;
- provider task IDs;
- frame URLs;
- clip URLs;
- audio URL;
- provider/model metadata;
- provider event envelope refs;
- attempt IDs;
- idempotency keys;
- credit reservation IDs.
- selected variant hash where applicable;
- artifact lineage refs for every generated frame/clip/audio output.

Reconciliation rules:

- check existing task by idempotency key before submit;
- poll/reconcile provider status through existing media task status mechanisms;
- if provider succeeds, attach output to the correct shot;
- if provider fails, create targeted repair/retry detail;
- if provider refuses for content policy, moderation, prohibited/disallowed content, NSFW/sensitive content, invalid prompt, or invalid voice parameter, do not retry the same payload and map to sanitized policy blocker;
- verify every provider callback/polling result against `MarketplaceAutoReviewProviderEventEnvelope` before it can advance state;
- reject or DLQ events with failed signature/authentication, unknown task ID, tenant/run/stage mismatch, duplicate fingerprint, stale sequence, or out-of-order terminal transition;
- never store raw over-budget provider payloads in stage output or UI-facing run metadata;
- if provider is stale, block or retry according to policy.

Provider and asset hardening:

- persist requested provider/model, selected provider/model, and fallback reason on each task group;
- never silently downgrade required media generation to text-only output;
- store provider status using normalized lifecycle values;
- attach retention metadata to intermediate frames, clips, audio, QA crops, OCR crops, and final output refs;
- sanitize provider errors before timeline/UI exposure;
- cancellation must stop future scheduling and reconcile already submitted jobs.
- generated media refs must become platform-hosted/proxy-approved refs before user-visible output surfaces consume them.
- retry/DLQ policy must be failure-class based so transient provider errors, provider refusals, payload-budget blockers, and quota blockers behave differently.

## UI/UX Contract

### Target User / JTBD
N/A - backend media execution section only. User-facing behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - provider/waiting states are emitted for later UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no user-facing copy created in this section.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Feature 117 media generation can run without any `ProductionSpace` record.
- Existing downstream Storyboard Review, Video Editor, render, and Library can still receive artifacts.
- Provider retries and callbacks remain idempotent.
- Provider/model fallback, cancellation, and asset URL hygiene are auditable.
- Generated artifacts preserve selected variant and lineage context for downstream QA/finalization.
- Provider safety refusals do not create runaway retry/spend loops.
- Provider callback/polling events are trusted, deduped, replay-safe, and bound to the expected run/stage/task before state changes.
- Oversized provider payloads cannot corrupt durable stage output or UI projections.
