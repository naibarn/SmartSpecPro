# Request

Make Grok via Hermes genuinely usable in production for central tenant
accounts, per-user personal accounts on the server worker, and per-user private
Worker App accounts. Install missing server/runtime prerequisites, correct the
connection UI, publish the required Windows runtime and Worker App installer,
and verify the complete flow without exposing credentials.

## Constraints

- Preserve tenant and connection ownership boundaries.
- Never print, log, or commit worker refresh tokens or Grok session material.
- Keep the Feature 135 media worker separate from the legacy Hermes gateway.
- Preserve unrelated dirty-worktree changes.
- Human xAI authorization remains an explicit account-owner action.

## Non-goals

- Sharing a personal connection with other users.
- Enabling macOS private-worker runtime before a verified macOS build exists.
- Replacing the existing worker control plane.
