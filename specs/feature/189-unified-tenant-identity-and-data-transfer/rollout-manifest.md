# Feature 189 Tenant Identity and Data Transfer Rollout Manifest

This manifest is the required per-wave record for implementation and release review. It keeps account-tenant identity changes, same-tenant data transfer, queue cancellation, and resumable execution independently observable and reversible.

Current status: `IMPLEMENTED LOCALLY / NOT_ENABLED`. This repository snapshot
contains the additive `0316`/`0317` identity-transfer schema, `0319` session
revocation migration, guarded identity-move and transfer runtime, and focused
local contract evidence. No staging/production migration, transfer execution,
browser, or deployment evidence is accepted as complete here.
Every wave remains blocked until its evidence fields contain immutable links to
the actual migration/test/rehearsal artifact. This manifest is not an
authorization to execute a tenant transfer or enable a Feature 189 flag.

## Required entry fields

Every wave records the exact call sites and resource kinds in scope, owning team, schema and handler versions, feature flag, backfill or drain rule, queue-cancellation rule, canary limit, rollback flag, start/end timestamps, operator, and links to test, migration, browser, and production evidence. Empty evidence fields are not an accepted rollout state.

## Initial numeric safety budgets

These are conservative release-gate defaults for the first canary. The owning
team must record any approved change in the wave row before enabling its flag;
an omitted value never means unlimited.

| Budget | Initial value | Applies to |
|---|---:|---|
| Maximum selected/preview items | 10,000 | One preview/approved plan |
| Preview TTL | 24 hours | Preview fingerprint validity |
| Preview page size | 100 items | API response |
| Transfer batch size | 100 items | One database checkpoint transaction |
| Item metadata/error limit | 16 KiB | One persisted item/outcome |
| Operation deadline | 24 hours | One transfer operation |
| Maximum resume attempts | 20 | One operation after pause |
| Preview rate | 10/minute/admin | Tenant Admin/API boundary |
| Approval/move rate | 5/minute/admin | Mutating admin actions |
| Resume/resolve rate | 30/minute/admin | Transfer recovery actions |
| Database transaction duration | 5 seconds | Transfer transaction budget |
| Database query duration | 10 seconds | Transfer query budget |
| First execution canary | 10 operations | Fake/no-paid-side-effect gate |

The budgets are operational limits, not a substitute for admission control.
When a limit is reached, the API returns `BACKPRESSURE` or a bounded validation
error and does not start a provider, billing, notification, or artifact side
effect.

## Initial wave sequence

| Wave | Scope / owner | Schema or handler gate | Feature flag | Backfill / drain rule | Queue policy | Rollback gate | Required evidence |
|---|---|---|---|---|---|---|---|
| 0 | Inventory and compatibility contract / Feature 189 owner | Existing schema and call-site inventory reviewed | `feature189_identity_transfer_inventory` | Observe only; no data mutation | Do not delete or drain transport records | Disable flag; no runtime behavior change | Inventory, status projection, ownership map |
| 1 | Identity schema and repeat-safe backfill / Web platform | `0316_feature_189_tenant_identity_and_data_transfer.sql`, `0317_feature_189_tenant_identity_backfill_completion.sql`, and `0319_feature_189_session_revocation.sql` rehearsed on local non-production database | `feature189_identity_schema` | Idempotent backfill; preserve existing `currentTenantId`; unresolved users remain review-gated | No queue action | Stop before enabling reads if migration evidence fails | [Migration rehearsal](reviews/migration-rehearsal-2026-09-14.md); staging/production evidence still required |
| 2 | Account tenant admission and authenticated workspace / Auth team | Central admission and account-tenant resolver tests pass | `feature189_account_tenant_resolution` | New requests only; existing users retain valid binding | No transfer execution | Return to prior resolver only before protected-route cutover | Signup, invite, OAuth, SSO, workspace/branding evidence |
| 3 | System Admin tenant move / Admin team | Durable identity event, mutation-fence, credit reset boundary, and session revocation pass | `feature189_system_admin_move` | Explicit action only; never bulk move | Open user fence; cancel/fence verified `pending`, `queued`, and `retry_scheduled`; block active work; retain evidence | Disable action; do not reverse committed moves automatically | Authorization, warning, queue-cancellation, fence/re-enumeration, audit, zero-credit, revocation tests; local contract evidence present |
| 4 | Transfer registry and preview / Data platform team | Handler registry, preview fingerprint, and durable transfer-action record pass | `feature189_transfer_preview` | Preview only; no ownership or queue mutation | Report eligible queued jobs as `queue_cancelled` candidates | Disable approval; previews expire normally | Registry coverage, exclusions, conflicts, stale preview, action-idempotency evidence |
| 5 | Bounded same-tenant execution / Data platform team | Canonical `tenant_data_transfer` job, item markers, transfer-action records, and queue/user fencing pass | `feature189_transfer_execute` | Approved plan only; no new generic job ledger | Open source-user fence; cancel/fence `pending`, `queued`, `retry_scheduled`; block `leased`, `running`, `waiting_external` | Disable new approvals; preserve committed item/job history | Fake adapter, duplicate delivery, admission-fence, side-effect, queue-kill, duplicate-command evidence |
| 6 | Pause, resume, and reconciliation / Control-plane owner | `paused_on_error` to canonical `retry_scheduled` mapping and resume idempotency pass | `feature189_transfer_resume` | Resume same operation/job from durable cursor | Never requeue killed work or regenerate paid work | Disable resume action; operator review remains visible | Failure injection, stale lease, resume, conflict, reconciler evidence |
| 7 | Handler expansion and migration waves / Domain owners | Each job-linked resource has a versioned handler or explicit unsupported result | Per-domain rollout flag | One active side-effecting producer per job type | Apply the same queue-kill policy per registered handler | Return new work to prior adapter; retain canonical IDs/history | Per-domain manifest, canary, browser, reconciliation, rollback |

## Rollback invariants

- Rollback disables new side-effecting approvals or the affected flag; it does not delete previews, item results, worker jobs, events, dispatch references, or audit evidence.
- A paused transfer resumes using the same canonical operation/job and item idempotency keys after the fault is resolved.
- Rollback never restores credits, reopens cancelled queue work, rewrites transactions, changes original authorship, or creates a replacement job to hide a partial transfer.
- Any active or ambiguous provider execution remains blocked for operator review until its persisted operation key/reference is reconciled.
