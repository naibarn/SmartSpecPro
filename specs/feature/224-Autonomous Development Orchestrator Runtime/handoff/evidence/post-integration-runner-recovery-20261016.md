# SPEC-224 post-integration Runner and recovery checks — 2026-10-16

Canonical source SHA: `21ab41c5f9421306a51458591741f60645af8263` (`origin/main`). All checks below were run after PR #972 and its handoff receipt PR #973 were integrated.

## Isolated PostgreSQL runtime

- Created per-run disposable runtime `d74e9b30`: PostgreSQL 15.17 (`pgvector/pgvector:pg15`), private Docker network with ownership labels, no published PostgreSQL port, new bind directory under `/tmp`, and database `spec224_d385_test`.
- The test role `spec224_d385_runtime` was verified non-superuser. The supported SPEC-224 baseline migrations applied successfully.
- Registered Runner integration used a loopback-only proxy to the private container. The previous `spec224-d385-pg` and the collision-discovered `a1b2c3d4` container/network were not used or modified.
- After verification, only run `d74e9b30`'s proxy, container, network, and temporary database files were removed. No shared/production database was touched.

## Exact-SHA test evidence

Each command ran through the existing SPEC-224 `quick` verification profile with one Vitest worker. Resource samples were fresh, with no OOM signal.

- `spec224RunnerContinuationPostgres.integration.test.ts`: 5/5 passed, 2026-10-15 17:07:31.800–17:07:39.796 UTC, 24,204 MiB available. Exercises child-process restart and projection recovery after canonical settlement, duplicate receipt replay, concurrent reconciliation, unknown provider outcome, revoked Runner authorization, and the process boundary before receipt persistence.
- `spec224RegisteredRunnerE2E.integration.test.ts`: 1/1 passed, 2026-10-15 17:07:45.044–17:08:13.292 UTC, 23,945 MiB available. Starts the registered Rust Runner against the ephemeral local control server and PostgreSQL repositories; deterministic loopback provider only. Confirms protected dispatch remains fail-closed without canonical admission. It does not constitute Live Codex/Agents SDK dispatch.
- `spec224DeveloperFastLaneE2E.integration.test.ts`: 4/4 passed, 2026-10-15 17:08:47.411–17:09:23.665 UTC, 23,532 MiB available. Includes a three-day injected-clock provider-capacity wait and resume of the same WorkUnit with a distinct call ID, a budget wait/eligibility resume, usage settlement, and a fencing change between reservation and dispatch. This suite uses the deterministic provider fixture; it does not prove a real Codex quota reset.

## Acceptance boundary

The installed Runner 0.2.23 observation and current-source zero-ready-capability test are recorded in `runner-readiness-remediation-20261015.md`. No service restart, production access, or authority change was made.

No owner-authorized isolated protected-start grant or SPEC-224 non-production Runner profile/token was present in the process environment. No real provider turn, protected remote Runner receipt, Live quota reset, final independent verification, or live durable settlement was claimed. Resume only after those exact authority bindings are provisioned through the existing authorized control plane; do not widen scope or bypass the fail-closed gate.
