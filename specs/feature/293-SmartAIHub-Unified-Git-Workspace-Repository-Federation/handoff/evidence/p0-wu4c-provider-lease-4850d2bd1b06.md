# Provider precedence and owner lease event checkpoint — 4850d2bd1b06

Integrated on `refs/heads/main` at `4850d2bd1b067f9f9c2a292099c6d8233ad39ba8` via [PR #132](https://github.com/naibarn/SmartSpecPro/pull/132), following [PR #131](https://github.com/naibarn/SmartSpecPro/pull/131).

- Mission Control no longer treats Runner execution profile (`local_device` / `shared_container`) as an agent provider. Provider is identified only from an active session and a unique, fresh, authenticated, busy, trusted Agent tool inventory item; otherwise it is `UNKNOWN` with an explicit reason. Provider/workspace-name guessing is not used.
- Local AUDIT_ONLY receipts now surface known-owner lease expiry and the periodic scheduler enqueues an idempotent `OWNER_LEASE_EXPIRED` evaluation. No retirement occurs in the event path.
- Executable scenario matrix is 68 cases after replacing stale tests for the removed SQLite idempotency ledger. Tests: Mission Control projection 3/3; owner lease/local authority 40/40; scheduler 8/8.
- Remaining: authenticated tenant/project/role safe-action API, canonical worker_jobs/Runner execution for all seven actions, complete Mission Control aggregation and production evidence projection, persistent cross-host authority bindings, session-finish/integration/handoff/convergence/recovery event producers, and end-to-end safe-action receipts. P0 remains `PARTIAL`; next workunit `P0_INTERNAL_GAP_CLOSURE`.
