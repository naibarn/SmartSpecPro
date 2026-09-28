# Implementation planning brief — Unified tenant identity and resumable data transfer

## Normative source

This brief extracts the implementation scope for planning; the canonical product specification is `../spec.md`.

## Goal

Implement tenant identity hardening and a same-tenant, resumable data-transfer workflow without creating a second generic jobs ledger and without changing `.env` or deploying infrastructure.

## Tenant identity rules

- One email/account belongs to exactly one tenant. There is no membership list or tenant switcher in this release.
- Login from any supported domain resolves the authenticated user's tenant from `users.currentTenantId`; hostname branding is separate and must never override authorization or billing scope.
- A tenant does not need to own a domain. Domains are public branding/routing metadata only.
- Signup precedence: valid tenant-bound invite, then exact active host-domain match, then Default/SmartAIHub tenant. Global invites authorize signup but do not bind a tenant. A supplied invalid/expired invite is rejected.
- Existing users preserve a valid active `currentTenantId`; otherwise a uniquely matching `registeredDomain` may assign a tenant; otherwise assign Default with an auditable reason. Never infer migration from the current hostname.
- `domain_admin` authorization is derived from `currentTenantId`, not `registeredDomain`.
- System Admin may move an account across tenants. Email/account identity stays unchanged; credits reset to zero immediately; old tenant data/files remain in the old tenant and do not move; warn clearly and revoke sessions/tokens.
- Cross-root login should use a one-time-code + PKCE/state/nonce SSO handoff with per-domain local sessions. No cross-domain cookie assumption.
- Authenticated dashboard must clearly show the active workspace from the account tenant, separately from hostname branding.

## Transfer scope and exclusions

Transfer only selected, allowlisted resources owned by the source tenant: images, videos, files in supported formats, Series, Presentations, Storyboards, projects/workflows, completed artifacts/results, and every terminal job-linked resource type that has a registered transfer handler. Unsupported job-linked types must be reported explicitly, never silently skipped.

Do not transfer transactions, usage history, credits, billing/settlement records, passwords, sessions, secrets, admin privileges, or active execution state.

All source-owned queued `pending`, `queued`, or `retry_scheduled` jobs are automatically enumerated and killed/cancelled before transfer: fence/cancel the attempt, cancel unpublished outbox work, remove transport work where supported, mark the canonical job cancelled, retain `worker_jobs` and `worker_job_events` plus references/audit evidence, and never flush a shared queue, requeue, or regenerate automatically. A later redelivery is a fenced no-op/quarantine observation. The user can issue a new job later. Leased/running/waiting-external work blocks approval and requires explicit handling; it is not copied as active work.

The initial transfer workflow is same-tenant only, with preview/dry-run, explicit approval, no overwrite/merge, per-record conflict stop, ownership/resource-constraint checks, and no credit side effects.

## Resumability and control plane

The transfer operation must be durable, batchable, idempotent, and resumable after process/database/transport errors. Represent the operation as canonical Feature 186 job type `tenant_data_transfer` with companion item records; do not create a new generic jobs table.

Operation states: `previewed`, `approved`, `running`, `paused_on_error`, `resuming`, `completed`, `completed_with_conflicts`, `failed`, `cancelled`.

Item states: `pending`, `transferred`, `retryable_error`, `permanent_error`, `conflict`, `skipped`.

Resume rules: successful items are skipped; only bounded retryable errors retry automatically; conflicts/permanent errors require resolution or skip; system failures pause with a visible “ดำเนินการต่อ” action; no replacement operation or duplicate side effect is created. Every pause/resume/operator action is audited and idempotent.

## Expected implementation areas

Research and plan the smallest safe changes across the existing Drizzle schema, auth/tenant context and invite services, OAuth/session admission, server routers/middleware, tenant authorization and storage/media paths, dashboard/auth UI, transfer service/API/UI, worker-job cancellation/reconciliation, migrations, tests, observability, and rollout/rollback evidence. Preserve unrelated dirty worktree changes and do not implement code in the planning phase.
