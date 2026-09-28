# Request

## Original request

Fix the `marketplaceCapture.startAutoStoryboardReview` 524 failure by using the
approved durable background-job design in
`docs/portable-skill-pack/specs/2026-07-24-marketplace-auto-storyboard-durable-start-design.md`.

## Task summary

- Return a durable queued Marketplace Auto Review run without waiting for LLM
  storyboard planning.
- Initialize the run through the existing outbox worker.
- Preserve idempotency, tenant/auth boundaries, retry safety, and credit safety.
- Keep client polling active when the start response loses its proxy connection.
- Repair one incomplete sequential prompt-plan response before persisting a
  structured terminal failure.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Reuse the existing PostgreSQL outbox and worker; add no queue dependency.
- Add no database migration unless implementation proves the existing JSONB
  payload and indexes insufficient.
- Do not persist bearer tokens or secrets.
- Do not deploy, commit, push, or mutate production data in this task.

## Non-goals

- Reworking later image/video generation stages.
- Replacing polling with WebSockets.
- Changing storyboard quality policy beyond the bounded missing-prompt repair.
