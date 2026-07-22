# Request

The Grok via Hermes connection stays on "Connecting" for several minutes and
opens a blank Windows terminal. Repair the flow end-to-end and release a fixed
Worker App.

Constraints:

- Preserve `env_clear()` and per-connection credential isolation.
- Never log or persist raw device codes outside the existing structured event.
- Do not create duplicate connection attempts during verification.
- Preserve unrelated dirty-worktree changes.
- Release as Worker App 0.1.133 and verify the production artifact.

Non-goals:

- Replacing Hermes OAuth with a username/password form.
- Replacing the Hermes CLI with its web server.
- Changing the Grok account-sharing model.
