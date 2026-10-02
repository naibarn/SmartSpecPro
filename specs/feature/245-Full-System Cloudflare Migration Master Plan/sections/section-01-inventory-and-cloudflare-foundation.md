# Section 01 — Inventory and Cloudflare Foundation

## Goal

Create the executable evidence baseline and exact Cloudflare environment contract needed to implement migration slices without waiting for full-system discovery to finish. This section can pass for the isolated cache slice while the global Redis inventory remains preliminary; it cannot certify whole-system Redis retirement.

## Scope

- Implement the Spec 245 compatibility compiler as a read-only `smartaihub-migrate` CLI with `inspect`, `classify`, `verify`, `plan`, and `report`. Place it under `apps/web/scripts/cloudflare-migration/` with a CLI entry in `apps/web/scripts/smartaihub-migrate.ts`; emit the spec's required `migration/*.json|yaml|md` artifacts. It must consume versioned evidence manifests, preserve unknowns as blocked, redact secrets, and never run install/build hooks, access production, or treat package import/bundle success as compatibility proof.
- Include candidate detection for Hyperdrive-incompatible PostgreSQL advisory-lock and `LISTEN`/`NOTIFY` session features; classify them for reconciliation instead of treating static matches as proof of a production caller.
- Reconcile the Spec 232 Redis inventory with current code, systemd/container/scheduler/process config, deployment files and the known host observations. Mark host identity/time so a local process snapshot is never mislabeled production. Keep unknown groups explicitly partial.
- Keep responsibilities grouped by cache, auth/revocation, rate limit, lock/lease, realtime/pub-sub, and queue/broker; add concrete active caller and owner for each row.
- Classify detached/in-process async execution, callback-triggered work, scheduled occurrences, startup/reconciliation tasks, and bounded work initiated by long-lived listeners. For each business operation record its owner, target, canonical `worker_jobs` record, outbox intent, and first-side-effect boundary. A waiter daemon is infrastructure; its bounded triggered operation is the job.
- Add a machine-checkable inventory rule: full-retirement verification fails closed on unknown/unowned business work or missing canonical job/outbox linkage; local, target, and production evidence remain separate.
- Record local, staging, target-account and production evidence as distinct statuses.
- Map exact Worker names, environment-specific bindings, secrets, routes, origin path, health/readiness and deployment identity. Account IDs and secrets must come from approved deployment configuration.
- Define controlled task pause: block new intake, stop relevant dispatchers/workers/schedulers, inspect canonical active jobs, reconcile unknown provider outcomes, then resume only the new executor.
- Preserve unrelated worktree edits and avoid account-wide resource cleanup.

## Relevant source surfaces

- `ops/feature-232/redis-migration-inventory.yaml`
- `apps/web/scripts/verify-cloudflare-local-readiness.ts`
- `apps/web/scripts/verify-cloudflare-target-readiness.ts`
- `apps/cloudflare/src/index.ts`, `contracts.ts`, `bindings.ts`, `wrangler.jsonc`
- `ops/feature-187/`, `ops/feature-188/` deployment/readiness contracts

## Tests before implementation

- `apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts`: exercise `inspect`, `classify`, `verify`, `plan`, and `report` with safe temporary fixtures; assert deterministic complete artifact set, unknown-to-BLOCKED behavior, no secret leakage, no command execution, and rejection of unowned async/callback/schedule/listener work. Run with `npm --workspace @smartspec/web exec vitest run scripts/__tests__/cloudflare-migration-compiler.test.ts`.
- Inventory parser/schema rejects unknown active responsibility on a full-retirement claim.
- Target readiness remains fail-closed without real target evidence and local readiness remains separate.
- Maintenance pause/resume runbook covers active job, paused scheduler and ambiguous provider result.
- Inventory verifier rejects unclassified triggers, duplicate scheduler/executor ownership, and business operations that can cause an effect before a canonical `worker_jobs` record and outbox intent exist.

## Acceptance

- Five compiler commands have deterministic local behavior and produce the required artifact schema; `verify` rejects unknown/unowned business work, missing job/outbox ownership, and unsupported compatibility claims. Local scans are explicitly marked partial where host/runtime evidence is absent.
- The selected SearchResultCache slice has a named owner/destination, key/TTL contract, enablement requirements, and next action.
- Other Redis groups are inventoried as partial/unknown with explicit follow-up; they block global retirement but do not block this closed cache slice.
- A complete local inventory accounts for detached/in-process, callback, scheduled, startup/reconciliation, and listener-triggered work. Any unknown or unowned business operation fails the global gate; runtime/host absence remains explicitly unverified until authentic evidence exists.
- Local readiness passes; target readiness reports the missing evidence exactly and is not overridden by hand-edited claims.
- No actual production route/resource is modified in this section.

## Implementation status (2026-09-26)

- `ops/feature-232/redis-migration-inventory.yaml` records user authorization for this noncritical cache slice and the maintenance-pause cutover mode. Other groups remain preliminary and are not certified.
- Local readiness passed. Target readiness correctly remains blocked on `target_evidence_file`.
- Global host/runtime and account discovery remain in progress; this is not a full-migration PASS.
- No production jobs, services, keys, DNS or Cloudflare resources were changed.
- Independent review is recorded in `implementation/code_review/section-01-review.md`; it confirms Section 01 is partial because the complete runtime caller/process ledger is still missing. SocratiCode was unavailable, so targeted shell discovery was used.

## Follow-on implementation (2026-09-28)

- The previous 1,000,000-character ceiling skipped two ordinary source files. The scanner now checks file size before reading, scans files up to 2,000,000 bytes, and reports larger or changed files as scan blockers.
- Added regression coverage for a source file above 1 MB and for a source above the 2 MB ceiling. `npm --workspace @smartspec/web exec vitest run scripts/__tests__/cloudflare-migration-compiler.test.ts` passes 16 tests.
- Current Local scan inspects 2,444 files and returns 931 candidate signals with zero scan problems. Empty example-manifest verification remains blocked with 932 findings (one empty inventory plus 931 unreconciled signals). This closes source-size scan gaps only; owner/runtime/target inventory remains open.
