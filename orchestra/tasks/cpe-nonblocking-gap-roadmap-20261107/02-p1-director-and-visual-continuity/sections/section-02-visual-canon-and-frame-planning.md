# Section 02 — Visual Canon and Frame Planning

## Requirement IDs

CPE-03–CPE-07, CPE-16

## Objective

Make series style, lighting/color, cast identity, wardrobe, prop, scene/location and optional first/last-frame intent consistent across existing image/video prompt contracts.

## Owned paths

Shared series look-lock and continuity contracts; `verticalDramaSceneContinuityLock.ts`, `verticalDramaSceneVisualState.ts`, `verticalDramaStartFrameGeneration.ts`, image/video prompt services, reference services, and their UI/test files.

## Tasks

1. Map each required fact to one authoritative series/episode/shot value and a revision/fingerprint.
2. Use existing role-scoped character/location/object assets and enforce tenant ownership.
3. Add only missing projections to current prompts and persist additive metadata only if existing JSONB contracts are insufficient.
4. Keep storyboard-approved image distinct from an optional video-safe anchor; missing/failed last frame falls back to a supported current model mode.
5. Ignore stale optional canon and preserve direct user edits.

## Completion predicate

Round-trip tests prove current-revision facts reach the right prompt/asset role; old records and CPE-off paths remain compatible; missing optional data does not block rendering.

## Prerequisites and fallback

Requires section 01. For any missing or stale scene/style data, use existing storyboard and approved references; preserve safety, ownership and explicit approval.

## Focused tests and evidence

Test revision-bound series look/style, cast, wardrobe, prop, scene/location and start/stop-frame values through current prompt compilers for each supported modality. Cover old records, CPE-off mode, user override, stale fingerprint, missing optional frame, wrong asset role and cross-tenant reference. Verify prompt projection without new mandatory model calls.

## Unresolved assumptions

Confirm actual provider-specific first/last-frame semantics and existing supported fallback per model before changing prompts. Add persisted fields only if current JSONB/version contracts cannot represent the facts safely.
