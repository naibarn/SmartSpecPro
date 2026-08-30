# Plan self-review round 4 — security, migration, and recovery

Status: PASS.

- Profile, permission, policy, workflow, binding, and projection revisions are
  carried through job admission and execution provenance.
- Migration is explicitly additive, nullable/defaulted, idempotent, dry-run
  verified, and non-destructive for legacy jobs/settings/artifacts.
- Local paths/secrets are confined to the Worker; server projections are
  redacted; missing identity, stale revision, SSRF, traversal, and unsafe
  output fail closed.
- Submit/reconnect/restart/publication behavior is defined around the immutable
  execution reference and idempotent event/upload ledgers.
