# Request

Stop the production MCP polling storm immediately and implement a complete,
durable fix so stale MCP tasks cannot exhaust the shared backend rate limit or
block unrelated direct Kie API image generation.

## Constraints

- Preserve direct Kie and non-MCP media behavior.
- Do not disable MCP generation globally.
- Preserve unrelated dirty-worktree changes.
- Use test-first changes for routing, polling, and authentication behavior.
- Avoid new dependencies and schema changes.

## Non-goals

- Redesigning Media History.
- Changing provider pricing, model selection, or Kie API quotas.
- Running a paid provider smoke test without a separate explicit decision.
