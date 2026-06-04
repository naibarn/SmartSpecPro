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
- Test every extracted storyboard cell and every start/stop frame queues required shot frame vision QA before downstream use.
- Test failed start frame QA resubmits only that shot's start frame and preserves other accepted frames.
- Test failed stop frame QA resubmits only that shot's stop frame and rechecks dependent video payloads only.
- Test new provider outputs start as candidate media acceptance state and cannot route to user-visible surfaces before QA acceptance.
- Test repaired media supersedes failed media and stale failed refs are blocked from downstream routing.
- Test image/video/thumbnail provider payloads can use only approved product reference asset pack refs.
- Test provider prompt payloads cannot include quarantined marketplace instruction text or raw unescaped DOM/OCR/review/seller instructions.
- Test low-confidence or missing product reference asset pack blocks paid visual provider dispatch before reservation/submit.
- Test missing, blocked, no-consent, or conflicting character identity asset pack blocks recurring face/voice provider dispatch before reservation/submit.
- Test back-facing/no-face shots with `mustNeverRevealFace` cannot submit turn-around or face-reveal video payloads.
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
- Test provider success alone cannot mark `image_generation`, `video_generation`, or `audio_generation` complete without stage completion evidence covering media acceptance, QA, credit, lineage, and storage refs.

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
- shot frame vision QA refs for accepted/failed storyboard cells, start frames, stop frames, video keyframes, thumbnails, and final render samples.
- targeted media unit repair refs when a generated unit fails QA.
- generated media acceptance refs for every provider output and repaired output.
- product reference asset pack refs used by every product-dependent image, video, thumbnail, or visual repair payload.
- character identity asset pack refs used by every recurring person, hand-model, visible-face, lip-sync, native-audio character, or voice persona payload.
- stage completion evidence refs for each direct execution stage transition.

Reconciliation rules:

- check existing task by idempotency key before submit;
- poll/reconcile provider status through existing media task status mechanisms;
- if provider succeeds, attach output to the correct shot;
- after image provider success, create or queue `ShotFrameVisionQaEnvelope` before the frame can be consumed by Storyboard Review or video generation;
- before image/video/thumbnail provider submit, verify each product-dependent payload references an approved `ProductReferenceAssetPack` and not raw marketplace URLs, rejected refs, quarantined generated media, or stale product images;
- before any provider submit, verify prompt/text inputs contain no refs quarantined or blocked by `MarketplaceEvidenceInstructionFirewall`;
- before any person/voice-dependent provider submit, verify the payload references an approved `CharacterIdentityAssetPack`, respects face-visibility and voice-use policy, and does not use raw marketplace/customer/reviewer/private-seller/failed-generated identity refs;
- block turn/reveal, profile-to-front, face re-entry, lip-sync, or native-audio character payloads when the pack requires no-face, hands-only, single-shot, generic-person, product-only, or separate-TTS fallback;
- mark provider outputs as `candidate` or `qa_pending` until required QA finishes;
- if provider fails, create targeted repair/retry detail;
- if provider succeeds, keep the stage active or QA-pending until stage completion evidence proves required outputs, acceptance, QA, credit, storage, and lineage refs are present;
- if vision QA fails, create `TargetedMediaUnitRepairPlan` for the exact failed `shotId + mediaUnit` and resubmit only that unit;
- mark failed QA outputs as `quarantined_failed_qa`, and mark repaired replacements as superseding the failed artifact;
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
- generated media refs must be accepted or approved-warning accepted before user-visible output surfaces consume them.
- product reference refs must be platform-hosted/proxy-approved and pack-approved before provider payloads consume them.
- character/voice reference refs must be consent-approved, policy-approved, and pack-approved before provider payloads consume them.
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
- Direct media execution stages cannot complete from provider success status alone.
- Product-dependent provider dispatch cannot start from raw, rejected, unhosted, stale, or rights-blocked product image refs.
- Generated storyboard cells and start/stop frames cannot be accepted for downstream video generation until required vision QA passes.
- Targeted frame repair resubmits only failed units and keeps passed frames stable.
- Candidate, failed, policy-blocked, superseded, or discarded generated media cannot route to Storyboard Review, Video Editor, Library, publishable package, or future references.
- Provider safety refusals do not create runaway retry/spend loops.
- Provider callback/polling events are trusted, deduped, replay-safe, and bound to the expected run/stage/task before state changes.
- Oversized provider payloads cannot corrupt durable stage output or UI projections.
