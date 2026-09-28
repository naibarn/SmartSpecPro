# Vertical Drama start-frame async status

## Goal

Keep the prompt + image action visibly submitted while Kie.ai is queued or
processing, and recover the task after navigation or page reload.

## Approved design

The provider task id is persisted on the matching
`startFramePlan.frames[]` entry as `imageTask` before browser polling starts.
The client busy state is the union of local polling and durable pending task
markers. The button therefore cannot become idle merely because the admission
request returned.

The server mutation locks and re-reads the episode row before merging one frame.
Terminal writes are accepted only when their task id still matches the current
pending task, preventing a late result from an older submission from clearing
a newer task. Completed tasks are linked to the approved image and then the
marker is cleared; failures remain visible as a retryable terminal record.

## State flow

`submitted` -> `queued/processing` -> `completed` or `failed/expired`

The UI copy intentionally says “ส่งแล้ว — รอผลจาก AI” while the task is
pending. This describes both provider queueing and active generation without
claiming that the image is already complete.

## Trade-offs and boundaries

- Existing provider polling remains client-driven and reuses `media.getTask`;
  no new provider-specific polling implementation is introduced.
- Durable markers survive reload and allow the page to resume the task. A
  future server scheduler can use the same marker without changing the client
  contract.
- No database migration is required because `startFramePlan` is an existing
  JSONB document.

## Verification

- Focused client resume and prompt/image-flow tests.
- Focused server wiring test for row locking and stale-task protection.
- `git diff --check` and the repository's focused TypeScript/test commands.
