# Request

Convert Vertical Drama `generateShotVideoPrompt` from a synchronous HTTP/LLM
mutation into a queued background job so Cloudflare 524 responses no longer
interrupt the user flow. Users must be able to submit multiple shots in one
episode consecutively; those jobs must run FIFO one at a time per episode,
while unrelated episodes may run concurrently. The UI must immediately show
that work was accepted, survive reloads, and prevent duplicate active work.

Constraints:

- Implement from the approved design at
  `docs/portable-skill-pack/specs/2026-08-12-vertical-drama-shot-video-prompt-async-queue-design.md`.
- Preserve the existing prompt-generation executor, prompt contracts, quality
  loop, and atomic motion-pack persistence behavior.
- Reuse existing BullMQ/Redis and Vertical Drama async-job patterns.
- No new database migration in the first rollout.
- Preserve unrelated dirty worktree changes.

Success means submit returns within the edge timeout, queued/running state is
durable and visible, duplicate requests are deduplicated or rejected clearly,
same-episode jobs execute in FIFO order, and focused server/client tests pass.
