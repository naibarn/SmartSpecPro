# Request

Add detailed local diagnostics to the Smart AI Hub Worker App because the app
closes on all machines, and make the logs easy to download from the app UI.

## Constraints

- Do not require direct `.env` editing.
- Never persist private keys or bearer/refresh tokens in logs.
- Keep the existing Worker App/runtime release flow and Windows-only build
  availability.
- Preserve unrelated dirty worktree changes.

## Assumptions

- Existing `worker-diagnostics.jsonl` and rotated files are the source of truth.
- A native save dialog is preferable to asking users to find AppData paths.
- Existing diagnostics level settings can be wired without a schema migration.
