# Section 02 — Audio QC, Editing and Assembly

## Requirement IDs

CPE-12, CPE-13, NB-04, NB-07

## Objective

Complete the user-valued audio QC, repair, mix/master and timeline integration that is absent after Feature 175 reconciliation.

## Owned paths

`verticalDramaAudioPipelineCoordinator.ts`, `verticalDramaAudioQc.ts`, `verticalDramaAudioRepair.ts`, `verticalDramaAudioMastering.ts`, `verticalDramaEpisodeVideoAssembly.ts`, durable media workers and targeted tests.

## Tasks

1. Preserve native/original audio master and make derivative outputs versioned/non-destructive.
2. Add only confirmed QC measures and surgical repair paths; each paid call is idempotent and budgeted.
3. Run long audio jobs via `worker_jobs` plus outbox and the approved isolated compute boundary where heavy execution requires it.
4. Keep audio failure, unavailable QC and repair warning on the audio result; preserve video and prior valid audio.
5. Ensure assembly accurately records which audio segments were included and why a segment is absent.

## Completion predicate

Fault tests show successful video remains accessible after audio failure; audio/user settings, manifest lineage and billing remain correct.

## Prerequisites and fallback

Requires section 01. Keep original/native track and current supported assembly path when an optional enhancement fails.

## Focused tests and evidence

Inject TTS/provider timeout, missing sample, QC malformed output, stem-repair failure, mastering failure, worker restart and assembly audio-track failure. Assert video and prior valid audio remain accessible, only the optional audio component is degraded, task/credit idempotency holds, and the assembly manifest names included/missing tracks accurately.

## Unresolved assumptions

Confirm Feature 175's actual accepted scope and whether the current deployment has the approved isolated compute boundary and required codecs. Heavy work must use existing approved execution; do not assume always-on infrastructure or add a new queue.
