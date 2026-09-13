# Feature 186 Tenant Identity and Data Transfer Rollout Manifest

This manifest is the required per-wave record for implementation and release review. It keeps account-tenant identity changes, same-tenant data transfer, queue cancellation, and resumable execution independently observable and reversible.

## Required entry fields

Every wave records the exact call sites and resource kinds in scope, owning team, schema and handler versions, feature flag, backfill or drain rule, queue-cancellation rule, canary limit, rollback flag, start/end timestamps, operator, and links to test, migration, browser, and production evidence. Empty evidence fields are not an accepted rollout state.

## Initial wave sequence

| Wave | Scope / owner | Schema or handler gate | Feature flag | Backfill / drain rule | Queue policy | Rollback gate | Required evidence |
|---|---|---|---|---|---|---|---|
| 0 | Inventory and compatibility contract / Feature 186 owner | Existing schema and call-site inventory reviewed | `feature186_identity_transfer_inventory` | Observe only; no data mutation | Do not delete or drain transport records | Disable flag; no runtime behavior change | Inventory, status projection, ownership map |
| 1 | Identity schema and repeat-safe backfill / Web platform | `0306_feature_186_tenant_identity_and_transfer.sql` applied to test database | `feature186_identity_schema` | Idempotent backfill; preserve existing `currentTenantId` | No queue action | Stop before enabling reads if migration evidence fails | Migration rehearsal, constraints, backfill rerun |
| 2 | Account tenant admission and authenticated workspace / Auth team | Central admission and account-tenant resolver tests pass | `feature186_account_tenant_resolution` | New requests only; existing users retain valid binding | No transfer execution | Return to prior resolver only before protected-route cutover | Signup, invite, OAuth, SSO, workspace/branding evidence |
| 3 | System Admin tenant move / Admin team | Durable identity event, credit reset boundary, and session revocation pass | `feature186_system_admin_move` | Explicit action only; never bulk move | Existing queued jobs remain in old tenant and are not transferred | Disable action; do not reverse committed moves automatically | Authorization, warning, audit, zero-credit, revocation tests |
| 4 | Transfer registry and preview / Data platform team | Handler registry and preview fingerprint pass | `feature186_transfer_preview` | Preview only; no ownership or queue mutation | Report eligible queued jobs as `queue_cancelled` candidates | Disable approval; previews expire normally | Registry coverage, exclusions, conflicts, stale preview |
| 5 | Bounded same-tenant execution / Data platform team | Canonical `tenant_data_transfer` job, item markers, and queue fencing pass | `feature186_transfer_execute` | Approved plan only; no new generic job ledger | Cancel/fence `pending`, `queued`, `retry_scheduled`; block `leased`, `running`, `waiting_external` | Disable new approvals; preserve committed item/job history | Fake adapter, duplicate delivery, side-effect, queue-kill evidence |
| 6 | Pause, resume, and reconciliation / Control-plane owner | `paused_on_error` to canonical `retry_scheduled` mapping and resume idempotency pass | `feature186_transfer_resume` | Resume same operation/job from durable cursor | Never requeue killed work or regenerate paid work | Disable resume action; operator review remains visible | Failure injection, stale lease, resume, conflict, reconciler evidence |
| 7 | Handler expansion and migration waves / Domain owners | Each job-linked resource has a versioned handler or explicit unsupported result | Per-domain rollout flag | One active side-effecting producer per job type | Apply the same queue-kill policy per registered handler | Return new work to prior adapter; retain canonical IDs/history | Per-domain manifest, canary, browser, reconciliation, rollback |

## Rollback invariants

- Rollback disables new side-effecting approvals or the affected flag; it does not delete previews, item results, worker jobs, events, dispatch references, or audit evidence.
- A paused transfer resumes using the same canonical operation/job and item idempotency keys after the fault is resolved.
- Rollback never restores credits, reopens cancelled queue work, rewrites transactions, changes original authorship, or creates a replacement job to hide a partial transfer.
- Any active or ambiguous provider execution remains blocked for operator review until its persisted operation key/reference is reconciled.
