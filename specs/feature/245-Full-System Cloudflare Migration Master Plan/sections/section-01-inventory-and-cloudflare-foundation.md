# Section 01 — Inventory and Cloudflare Foundation

## Goal

Create the executable evidence baseline and exact Cloudflare environment contract needed to implement migration slices without waiting for full-system discovery to finish. This section can pass for the isolated cache slice while the global Redis inventory remains preliminary; it cannot certify whole-system Redis retirement.

## Scope

- Reconcile the Spec 232 Redis inventory with current code, systemd/container/scheduler/process config, deployment files and the known host observations. Mark host identity/time so a local process snapshot is never mislabeled production. Keep unknown groups explicitly partial.
- Keep responsibilities grouped by cache, auth/revocation, rate limit, lock/lease, realtime/pub-sub, and queue/broker; add concrete active caller and owner for each row.
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

- Inventory parser/schema rejects unknown active responsibility on a full-retirement claim.
- Target readiness remains fail-closed without real target evidence and local readiness remains separate.
- Maintenance pause/resume runbook covers active job, paused scheduler and ambiguous provider result.

## Acceptance

- The selected SearchResultCache slice has a named owner/destination, key/TTL contract, enablement requirements, and next action.
- Other Redis groups are inventoried as partial/unknown with explicit follow-up; they block global retirement but do not block this closed cache slice.
- Local readiness passes; target readiness reports the missing evidence exactly and is not overridden by hand-edited claims.
- No actual production route/resource is modified in this section.

## Implementation status (2026-09-26)

- `ops/feature-232/redis-migration-inventory.yaml` records user authorization for this noncritical cache slice and the maintenance-pause cutover mode. Other groups remain preliminary and are not certified.
- Local readiness passed. Target readiness correctly remains blocked on `target_evidence_file`.
- Global host/runtime and account discovery remain in progress; this is not a full-migration PASS.
- No production jobs, services, keys, DNS or Cloudflare resources were changed.
- Independent review is recorded in `implementation/code_review/section-01-review.md`; it confirms Section 01 is partial because the complete runtime caller/process ledger is still missing. SocratiCode was unavailable, so targeted shell discovery was used.
