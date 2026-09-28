# Implementation plan

## Objective

Add an asynchronous `repairEpisode` capability for one episode, covering synopsis, dialogue and exactly nine storyboard shots, with previous-memory and bounded next-episode continuity context. Add deterministic story safety analysis to initial and repair generation so high-risk child/vulnerability, sexual, nudity, gore, and abuse combinations are blocked before downstream paid media.

## Server

1. Add a tenant/user/series/episode-scoped revision table and migration. Store source fingerprint, context fingerprints, candidate script/storyboard, safety findings, status, promoted timestamp, and failure metadata. Index active episode revisions and idempotency.
2. Add `verticalDramaEpisodeRepair.ts` to load owned context, construct a bounded future constraint, invoke the existing script-builder and storyboard-shotgrid skills, run safety and continuity gates, persist a candidate, and promote it transactionally. Promotion updates only the episode's text/storyboard and clears stale downstream plans; it never deletes media.
3. Extend story job kinds/executor/router with `episode_repair`, enqueue/status wiring, progress phases, idempotency, and safe error redaction. Re-check ownership and source revision in the worker.
4. Add story safety analysis and prompt context. Initial generation receives safety constraints and rejects high-risk output before credit deduction/persistence. Repair generation receives the same constraints and stores explainable findings.
5. Add router procedures to submit repair, read repair status/revision, and promote/reject a ready candidate if automatic promotion was not possible.

## Client

Add an episode workspace action shown for policy/provider failures or explicit repair. Show queued/running/ready/needs-review/failed states, context used, safety findings, and the fact that old media is retained while downstream plans are stale until regenerated. Poll using the existing story-job status contract and invalidate episode data on completion.

## Safety and failure handling

Missing tenant/user ownership fails closed. No paid image/video call occurs in the repair job. Provider errors are redacted at the shared boundary. A stale source revision cannot promote over newer user edits. A failed LLM/schema/safety/continuity step persists an inspectable failed revision and releases the series job pointer.

## Acceptance criteria

- One repair request targets exactly one episode and is idempotent.
- The generated candidate contains a non-empty synopsis/script and exactly nine numbered shots with dialogue aligned to the shots.
- Previous memory and next-episode constraint are visibly recorded by hashes/metadata, while future facts are not added to episode memory.
- High-risk output is not promoted and cannot trigger start-frame/video generation.
- Successful promotion preserves the old episode/media and clears only stale downstream plans.
- Initial story generation runs the same safety preflight before paid downstream stages.
- Focused server/service/router/client tests cover happy path, ownership, stale revision, unsafe output, malformed output, dedupe, promotion, and UI states.
