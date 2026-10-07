# Safe-action idempotency contract — 94e2cd2eb95c

Integrated on `refs/heads/main` at `94e2cd2eb95c63a078cf81b01250bc3ba4adf003` via [PR #129](https://github.com/naibarn/SmartSpecPro/pull/129), following [PR #128](https://github.com/naibarn/SmartSpecPro/pull/128).

- Removed the parallel SQLite action ledger and kept the dispatcher on an injected persistence port for canonical Spec-224/`worker_jobs` binding.
- Idempotency request hashes use normalized keys and canonical JSON. Exact retry returns `REPLAY_SAFE` and the original receipt; changed payload returns `IDEMPOTENCY_CONFLICT`; non-JSON numeric data is rejected.
- Focused Python suite: 41 passed; Python bytecode compilation and whitespace checks passed.
- These are contract-level improvements only. Authenticated project/role API, job/Runner dispatch, execution receipts and complete seven-action behavior remain unimplemented. Mission Control aggregation and persistent cross-host facts also remain partial. P0 remains `PARTIAL`; next workunit `P0_INTERNAL_GAP_CLOSURE`.
