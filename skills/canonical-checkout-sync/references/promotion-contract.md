# Canonical Source and Promotion Contract

- A repository's configured canonical Git ref is the allowed history for build/test/package/deploy source selection. The ref is policy data; core scripts do not assume `main`.
- A source request identifies repository, canonical ref, exact source revision, optional required integrated revision, and purpose.
- Preparation fetches the configured ref, resolves the exact revision, checks canonical ancestry and required-change inclusion, and creates/reuses a clean isolated source worktree.
- Shared developer checkouts are never normalized for builds. Dirty, detached, or feature-branch state does not block an exact integrated source request.
- A source lease carries a unique ID, monotonically increasing fencing generation, exact SHA, isolated workspace, purpose, and verified flag. Execution checks that lease immediately before running and renews it while the process is active.
- Leases/workspaces are namespaced by stable repository ID, revision, and purpose so projects and concurrent revisions cannot collide.
- Heavy execution still uses `worker_jobs` plus outbox when required. Source leasing supplies exact Git input and execution isolation; it is not a second queue or task ledger.
- `.development-repository.toml` is repository configuration, not lifecycle authority. Handoff, work ownership, validation obligations, and user-facing status remain with their established owners.
