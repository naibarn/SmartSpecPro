# Synthesized implementation specification

## Objective

Deliver two connected capabilities for SmartSpecPro:

1. Make tenant identity deterministic and server-authoritative for signup, login, OAuth, protected APIs, admin authorization, storage/media access, and the authenticated dashboard.
2. Add a same-tenant, allowlisted, previewable, resumable data-transfer workflow for completed user-owned work, while preserving the existing Feature 186 job control plane and never moving credits, financial history, credentials, or active execution.

This is an implementation plan for the approved design, not permission to deploy, change production credentials, edit `.env`, or perform a live transfer.

## Product decisions

### Account and tenant identity

- An email/account is bound to exactly one tenant for this release. There is no membership table, multi-tenant switcher, or user-selected tenant context.
- The authenticated account's `users.currentTenantId` is the authority for protected data, billing, storage, job ownership, and authorization.
- The request hostname resolves a public branding tenant only. It may control theme, favicon, public pages, and domain routing; it must not override an authenticated user's tenant.
- A tenant may have no domain. Domain fields are optional branding/routing metadata.
- Existing users retain a valid active `currentTenantId`. If it is null, inactive, or not found, a uniquely matching `registeredDomain` may be used as a migration hint. Otherwise assign the configured Default/SmartAIHub tenant. The migration records a reason/audit trail and never uses the current request hostname as a silent reassignment source.
- `domain_admin` scope is derived from the current account tenant and must not rely on `registeredDomain`.
- A System Admin (`role = admin`, not `domain_admin`) may move an account to another tenant. The email/account identity remains unchanged; credits become zero immediately; old tenant rows/files remain in the old tenant and are not copied; active sessions/tokens are revoked; the confirmation UI must display a clear warning.

### Signup and cross-domain authentication

Signup tenant precedence is:

1. valid tenant-bound invite: bind to the invite's tenant even when the current host belongs to another tenant;
2. valid global invite: authorize only, then continue with host/default selection;
3. exact active host-domain match using `primaryDomain` or an approved additional domain;
4. configured Default/SmartAIHub tenant.

If a user supplies an invalid, expired, inactive, or exhausted invite code, registration rejects in both open and invite-only modes; it never silently ignores the code. Password registration and OAuth registration use the same admission policy.

Login from any supported domain resolves the existing user from the account/session and uses the database-bound tenant. A cross-root SSO handoff may be used, but it must be a short-lived, single-use one-time code protected by transaction-bound PKCE/state/nonce, exact allowlisted return origins, replay protection, and atomic consumption. It must create a local session only after validating the user and tenant state; it must not rely on cross-domain cookies.

### Transferable data

The transfer UI lets a tenant-authorized user select supported resources owned by a source user and transfer them to a target user in the same tenant. The initial registry includes:

- images and videos;
- files in supported formats, retaining managed storage references and metadata;
- Series, Presentations, Storyboards, and related projects/workflows;
- completed artifacts and results;
- every terminal resource linked to a canonical job, provided a registered handler exists.

The handler registry is the completeness authority. A job-linked type without a handler is reported explicitly as unsupported/conflicted; it is never silently omitted.

Never transfer transactions, usage history, credit balances, billing or settlement records, passwords, sessions/tokens, secrets/API keys, admin privileges, or active execution state.

### Queue and active-work policy

For every automatically enumerated source-owned `pending`, `queued`, and `retry_scheduled` job, the transfer coordinator must cancel/fence the work, cancel unpublished outbox intent, request adapter cancellation or remove transport records where supported, and mark the canonical job `cancelled` through Feature 186 guarded transitions. It retains `worker_jobs`, `worker_job_events`, dispatch references, and audit evidence. It never flushes a shared queue, requeues, clones, regenerates, or charges the work. A later redelivery must fail the claim guard as a no-op/quarantine observation. The user may issue a new job later.

`leased`, `running`, and `waiting_external` work is not transferable as active work. It blocks the item/operation and reports the required explicit handling. Ambiguous provider work must be reconciled by operation key/reference before any decision; the transfer flow must not guess that a provider operation was lost.

### Resumable operation

The operation supports preview/dry-run, explicit approval, same-tenant validation, no overwrite/merge, per-record conflict detection, ownership/resource-constraint checks, bounded batches, and an auditable result summary. Use a Feature 186 canonical `worker_jobs` row with `jobType = tenant_data_transfer`; `operationId` is that `worker_jobs.id`. Add only the minimum transfer preview/preview-item, plan, and execution-item companion tables needed for durable coordination; the immutable preview-item snapshot supports cursor review before approval.

Operation states: `previewed`, `approved`, `running`, `paused_on_error`, `resuming`, `completed`, `completed_with_conflicts`, `failed`, `cancelled`.

Item states: `pending`, `transferred`, `retryable_error`, `permanent_error`, `conflict`, `skipped`.

Resume behavior is deterministic: transferred items are skipped; only bounded retryable system errors are retried; conflicts and permanent errors require resolution or skip; a system/database/transport failure pauses the operation and exposes “ดำเนินการต่อ”. The operation ID is the canonical `worker_jobs.id`; resume uses that same ID and per-item idempotency keys, never creates a replacement operation, and never repeats a paid or irreversible side effect.

## Existing implementation constraints

- Extend `apps/web/drizzle/schema.ts` and `apps/web/drizzle/*.sql` using Drizzle's existing patterns. Feature 186 already provides the canonical worker-job, event, attempt, dispatch, outbox, and settlement foundation.
- Schema and migration changes are conductor-owned and serialized; no parallel task may edit schema files.
- Reuse the existing Express/tRPC auth middleware, session/JTI revocation, invite service, tenant middleware, storage ownership checks, admin authorization, i18n, Vitest, database integration tests, and Playwright setup.
- Do not infer tenant from queue position, transport state, a client-provided tenant ID, or the current hostname for protected operations.
- Preserve unrelated dirty worktree changes and do not modify `.env`.

## Required implementation deliverables

1. A single tenant-admission resolver shared by password/OAuth signup and invite validation with the stated precedence and conflict errors.
2. Authenticated-tenant context helpers and a migration of protected authorization paths so host branding and account tenant cannot disagree silently.
3. Safe System Admin tenant move action with credit reset, session/token revocation, audit evidence, and warning UI.
4. Cross-root login handoff contract and tests, implemented behind a rollout flag if existing identity-provider constraints require staged enablement.
5. Transfer schema, handler registry, preview/approval/execution/resume service, cancel/fence queued jobs, conflict and unsupported-type reporting, and protected artifact copy/link behavior.
6. Transfer API/router and UI with preview, approval, progress, pause/error, conflict resolution/skip, and resume states.
7. Migration/backfill and rollout runbooks with dry-run evidence, rollback rules, concurrency/idempotency tests, authorization tests, and browser proof.

## Acceptance criteria

- A user authenticated on any supported domain sees and accesses only the tenant from `currentTenantId`; hostname branding remains separately observable.
- No client or host value can override tenant scope for protected reads, writes, billing, storage, jobs, or admin actions.
- Signup precedence, global-vs-tenant invite semantics, invalid supplied invite rejection, OAuth parity, and existing-user Default migration are covered by tests.
- Only System Admin can move a user across tenants; the move preserves account identity, zeros credits, leaves old tenant data in place, revokes sessions/tokens, and is audited.
- Transfer preview lists selected supported resources, automatically enumerated queue cancellations, excluded financial/security resources, active-work blockers, unsupported handlers, and estimated conflicts before approval; active blockers return `ACTIVE_JOB_BLOCKED` at approval with no partial transfer.
- Queued jobs are cancelled/fenced and retained in the canonical ledger; no duplicate dispatch, provider call, credit charge, or artifact publication occurs.
- Running/leased/external work is blocked or explicitly reconciled, never copied as active work.
- A transfer that stops due to transient failure can resume from the same operation and skips completed items. Conflicts/permanent errors remain visible and do not disappear or overwrite target data.
- The transfer operation is observable from canonical `worker_jobs` and `worker_job_events`, with item-level evidence and operator audit.
- Unit, repository/database, adapter/control-plane, and browser tests prove the above without real paid provider calls or production data mutation.
