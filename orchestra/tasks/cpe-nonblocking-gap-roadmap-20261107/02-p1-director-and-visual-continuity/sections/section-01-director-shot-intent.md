# Section 01 — Director and Shot Intent

## Requirement IDs

CPE-01, CPE-02, NB-02, NB-05

## Objective

Complete the optional director/shot-intent path at `VerticalDramaEpisodePipeline.generateRealStoryboard`.

## Owned paths

`verticalDramaEpisodePipeline.ts`, `verticalDramaShotSceneIntent.ts`, related shared shot/storyboard contracts and existing pipeline tests.

## Tasks

1. Reconcile current scene-intent output against storyboard schema and current shot facts.
2. Validate output IDs, facts and source revision; merge only allowed fields and never overwrite a newer user edit.
3. Preserve base storyboard on timeout, provider failure, schema failure, stale result or exhausted bounded call budget; log safe diagnostics.
4. Project intent into existing camera/composition/motion prompt input without new required model calls for CPE-off users.

## Completion predicate

Tests show accepted suggestions reach prompt inputs; every failure path leaves the original storyboard and normal image/video action available.

## Prerequisites and fallback

Requires P0. If current implementation already covers an intent, close that requirement with new evidence instead of refactoring it. Base storyboard remains the fallback.

## Focused tests and evidence

Add focused pipeline/contract tests for accepted intent projection and for timeout, provider error, schema error, stale revision, duplicate/unknown shot IDs and bounded-call exhaustion. Assert the original storyboard and image/video actions remain available in every failure case.

## Unresolved assumptions

Confirm which storyboard fields are user-authored and immutable after preview; derive merge permissions from existing approval/edit contracts instead of introducing a second ownership model.
