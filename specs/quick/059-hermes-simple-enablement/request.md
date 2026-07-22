# Request

Make Grok via Hermes ready to use. Simplify the many settings, confirm the real
setting names, make the UI explain exactly where and how to configure the
feature, and render English or Thai according to the selected application
language.

## Constraints

- Preserve tenant isolation and admin authorization.
- Keep the global kill switch.
- Use a safe private-worker production preset.
- Do not enable unprovisioned shared-worker modes or the development drainer.
- Preserve unrelated changes in the dirty worktree.

## Non-goals

- Provisioning a shared Hermes worker.
- Completing a user's xAI/Grok device authorization.
- Replacing the existing application language switcher.
