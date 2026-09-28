# Gap audit round 1 — data and API

Checked: episode kind/sequence schema, tenant-user-series ownership, idempotency,
model compatibility, stale input versions, feature-flag gates, and normal API isolation.

Fixes applied: stable input fingerprint; retry on unique allocation conflicts; dedicated
special sequence counter and partial unique index; model catalog validation now checks
reference count, duration, aspect ratio, and dialogue capability; stale updates clear
downstream prompts and use input-version guards.

Evidence: special contract/service/model tests pass. No known implementation must-fix
remains in this audit. Production migration execution remains an operational release step,
not something proven by the local schema test.
