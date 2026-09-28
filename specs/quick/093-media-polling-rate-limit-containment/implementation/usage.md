# Usage and Operations

## Runtime behavior

- Direct media tasks continue to use Python
  `/api/v1/media/tasks/{taskId}/fetch-result`.
- MCP media tasks are refreshed by `getMcpMediaTask` in the Node service.
- Media History polls at most one task at a time and no more than once per
  15-second cooldown, with additional 429 backoff.
- Authenticated Python rate limits are isolated by verified user identity.

## Configuration

- `MCP_MEDIA_IMAGE_TASK_HARD_TIMEOUT_MS` — default 2 hours, minimum 1 hour.
- `MCP_MEDIA_AUDIO_TASK_HARD_TIMEOUT_MS` — default 2 hours, minimum 1 hour.
- `MCP_MEDIA_TASK_HARD_TIMEOUT_MS` — video/default timeout, 24 hours.

## Verification

Run the focused tests documented in
`implementation-plan-tdd.md`. Inspect production logs for
`Rate limit exceeded`, `/fetch-result`, and `429 Too Many Requests` after
deployment.

## Incident recovery

If a future task storm occurs, first identify the task ID and transport from the
database and logs. Do not raise the global limit before stopping the request
loop. Back up any affected task rows before changing terminal state.
