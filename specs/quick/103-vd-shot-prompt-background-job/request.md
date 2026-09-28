# Request

Change Vertical Drama shot start-frame prompt generation from a long-running
HTTP mutation to a real asynchronous background job so Cloudflare 524 cannot
interrupt the subsequent image-task submission.

## Constraints

- Preserve current prompt generation, exact-cast enforcement, and persistence.
- After prompt success, automatically continue the existing image-generation
  admission flow.
- Prevent duplicate paid work on retries or repeated clicks.
- Preserve tenant/user ownership boundaries.
- Do not add a database migration or new dependency.
- Preserve unrelated dirty-worktree changes and do not deploy without a new,
  explicit production confirmation.

## Assumptions

- Redis and BullMQ are already required and initialized by the web process.
- Polling is acceptable for the existing browser workflow.
- The generated prompt remains durable in episode JSONB; Redis holds transient
  orchestration state only.
