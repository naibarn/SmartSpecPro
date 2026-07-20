# Research Notes

## Runtime evidence

- The direct image request failed at Python `POST /api/v1/media/async/image`
  with an internal 429 before any outbound Kie request.
- The limiter key was `ip:127.0.0.1`, `is_authenticated=true`,
  `user_id=null`, limit 120/minute, burst 180.
- A stale task `mcp_815c37bf01582291e6bb200d7b9960a1` generated 354
  `fetch-result` calls in about 100 seconds. Python returned 404 because the
  task exists in `mcp_media_tasks`, not `media_tasks`.
- The Media History effect calls `tick()` immediately on effect setup. Its
  dependencies change after mutation state and task-query updates, allowing
  rerenders to bypass the nominal 15-second interval.
- After backing up and marking the only pending MCP row failed, the next
  observation window had zero MCP fetches, zero limiter events, and zero 429s.

## Existing code

- `media.getTask` and `media.cancelTask` already resolve MCP tasks before
  forwarding to Python; `media.fetchTaskResult` does not.
- `refreshMcpMediaTaskStatus` and the stale-task reconciler already exist.
- MCP hard timeout defaults to 24 hours for all media types. The incident image
  task was still just inside that window, which is excessive for images.
- Python `get_current_user` accepts `sub`, `openId`, then legacy `user_id`.
  `RateLimitMiddleware` accepts only `sub` and `user_id`.
- Existing router contract tests cover upstream 404/429 mapping.
- Existing MCP reconciler tests cover provider failures and the global hard
  timeout.

## Worktree

`mcpMediaAdapter.ts` and its main test contain unrelated uncommitted auth-error
classification changes. New edits must avoid those hunks. The router,
MediaHistory, and Python middleware are otherwise clean at research time.

## Discovery fallback

SocratiCode transport was unavailable (`Transport closed`), so discovery used
targeted `rg`, narrow file reads, runtime logs, and database rows.
