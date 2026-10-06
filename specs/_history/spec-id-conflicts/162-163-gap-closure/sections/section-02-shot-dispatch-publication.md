# Section 02 — Shot Dispatch and Publication

## Goal

Connect a Web storyboard shot to a real Worker `shot_video_generation` job.

## Owned files

- vertical-drama episode/series server router or focused shot-generation route
- `apps/web/server/services/verticalDramaMediaJobService.ts`
- shared shot request/projection contracts
- route/service tests
- the episode workspace parent that owns storyboard callbacks

## Implementation

Add a typed mutation that loads the active tenant-owned Series/episode/shot,
checks the expected shot and binding revisions, resolves policy/capabilities,
accepts exactly one approved start frame plus ordered references, creates an
idempotent pinned Worker job, and returns a safe status projection. Reuse the
existing publication proof and index lifecycle, adding shot lineage without
altering old B-roll/provider assets.

## TDD acceptance

Valid admission, stale shot/binding, missing/invalid frames, disallowed
workflow, replay, revoke, and publication proof tests pass.
