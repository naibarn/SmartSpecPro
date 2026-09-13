# Unified Tenant Identity and Resumable Data Transfer Design

Date: 2026-09-13
Status: Approved direction, pending written-spec review
Related specification: Feature 186 — Unified Job Control Plane Adapters

## Problem

SmartAIHub currently uses the request hostname, `registeredDomain`,
`currentTenantId`, and legacy domain-admin checks in overlapping ways. That is
unsafe when a user logs in from another site, when a tenant has no dedicated
domain, or when an administrator moves a user between tenants. It also does not
yet define a safe, resumable workflow for transferring selected work products
to a replacement user without transferring billing history, credits, or active
execution.

The product needs one account-to-tenant rule, a cross-root-domain login path,
an explicit System Admin tenant-move operation, and a separate Tenant Admin
Data Transfer operation.

## Goals

- Bind one user account to exactly one active tenant at a time.
- Allow login from any registered website/domain while resolving authorization
  from the user's server-side tenant binding.
- Use the current hostname for public branding and signup tenant discovery only;
  never use it to override authenticated authorization.
- Allow only System Admin (`admin`) to move a user across tenants.
- Reset credits to zero immediately on a tenant move and revoke old sessions.
- Preserve the old tenant's files, work, jobs, audit history, and billing data.
- Provide a Tenant Admin Data Transfer UI for selected work products within the
  same tenant.
- Transfer images, videos, files, and completed/domain work linked to jobs while
  excluding transactions, usage history, credits, secrets, and active work.
- Cancel queued work during transfer without deleting its durable audit record.
- Resume an interrupted transfer from a durable checkpoint without repeating
  successful items or creating a replacement operation.
- Keep the canonical `worker_jobs.id` and Feature 186 control-plane semantics.

## Non-goals

- No multi-tenant membership table or tenant switcher in this phase.
- No new generic `jobs` table.
- No automatic merging or overwriting of conflicting records.
- No transfer of credits, payment records, usage history, passwords, sessions,
  API keys, secrets, or admin privileges.
- No automatic continuation or regeneration of queued work after transfer.
- No physical deletion of queued job history as part of the kill operation.
- No provider, Cloudflare, credential, deployment, or infrastructure migration
  in this design document.

## Options Considered

### Option A: Canonical user tenant plus Central Auth/SSO (selected)

`users.currentTenantId` is the only authenticated tenant authority. Hostnames
provide branding and signup context, while cross-root login uses a short-lived
one-time authorization code with PKCE. A separate resumable transfer workflow
handles selected records and preserves the job ledger.

This has the clearest security boundary and makes an administrator's tenant
move effective immediately without trusting stale token claims.

### Option B: Tenant claim in long-lived JWTs

This reduces database reads but makes tenant moves dependent on token expiry,
revocation lists, or an authority-version mechanism. It is more difficult to
make immediate and safe after an administrator changes the tenant binding.

### Option C: Membership table with an active tenant switcher

This supports future multi-tenant membership, but it violates the current
one-account/one-tenant requirement and introduces ambiguous ownership and
billing behavior. It remains a possible later product expansion, not a phase
one design.

## Selected Architecture

### 1. Three tenant contexts

The application must distinguish these contexts in names, types, and APIs:

| Context | Source | Allowed use |
|---|---|---|
| `publicSiteTenant` | Normalized request hostname | Branding, theme, SEO, public content, signup candidate |
| `authenticatedTenant` | Fresh server lookup of `users.currentTenantId` | All protected data, files, jobs, billing, credits, and APIs |
| `targetTenant` | Explicit System Admin request, validated in PostgreSQL | Cross-tenant administrative operations only |

`publicSiteTenant` must never become an authorization fallback. Client-supplied
tenant IDs, `registeredDomain`, queue payloads, and stale token claims cannot
override `authenticatedTenant`.

The dashboard must show the authenticated tenant/workspace name and slug as
the active workspace. If branding comes from another hostname, the UI must not
present that branding tenant as the user's authorization tenant.

### 2. Account and role rules

One account is bound to one tenant through `users.currentTenantId`.

| Role | Authority |
|---|---|
| User | Own permitted records inside authenticated tenant |
| `domain_admin` / Tenant Admin | Current tenant's users and approved same-tenant data transfer |
| `admin` / System Admin | Global administration, including cross-tenant user move |
| Anonymous | Public branding/content only |

`domain_admin` checks must use `currentTenantId` and tenant role scope. They
must not compare `registeredDomain` with the request hostname because a tenant
may have no domain or may have multiple domains.

### 3. Signup tenant resolution

The server performs resolution before creating the user binding:

1. A supplied invite code is validated first.
2. A valid tenant-bound invite selects that invite's tenant, regardless of the
   signup hostname.
3. With no invite code, an exact match against an active normalized hostname
   selects the current domain's tenant.
4. With no match, the Default/SmartAIHub tenant is selected.
5. If an invite code was supplied but is invalid, expired, exhausted, or not
   allowed, signup is rejected with no silent fallback.

A global invite code (`tenantId = null`) authorizes signup but does not bind a
tenant. It therefore falls through to exact hostname matching and then the
Default tenant.

Hostname matching must normalize case, ports, trailing dots, and the existing
domain representation consistently. A client cannot submit a different
tenant ID to change the result.

User creation, tenant binding, definition/audit metadata, and any invite usage
record must be committed atomically. No authenticated session is issued until
the existing email-verification/admission policy allows it.

### 4. Login and cross-root SSO

Password or OAuth login first identifies the account, then loads the current
tenant from PostgreSQL. The login hostname is branding context only.

For different root domains:

```text
site A -> Central Auth (state + PKCE + nonce)
        -> short-lived one-time authorization code
site B -> code exchange with Central Auth
        -> local site-B session cookie
```

The code is bound to the user, target client, registered redirect URI, state,
PKCE verifier, and short expiry. It is single-use and cannot carry an
administrator-selected tenant. Each site receives its own secure, HttpOnly
session cookie; cookies are not shared between unrelated root domains.

Protected requests resolve the tenant from the authenticated user binding. A
tenant move revokes all sessions, refresh tokens, and device tokens so the new
tenant is effective immediately.

### 5. System Admin tenant move

The move is a guarded transaction available only to global System Admin:

- validate source and active target tenant from PostgreSQL;
- lock the user row and verify the current source tenant;
- update `users.currentTenantId`;
- reset credits to zero through the existing credit/ledger boundary;
- revoke sessions and refresh/device tokens;
- append an auditable move event with actor, reason, old tenant, new tenant,
  credit reset, and timestamp;
- leave all tenant-owned data rows and job IDs unchanged.

The UI must show this warning before confirmation:

> การย้าย Tenant จะไม่ย้ายรูปภาพ วิดีโอ ไฟล์ งาน หรือข้อมูลเดิมตาม user ไปด้วย ข้อมูลเหล่านั้นยังอยู่ใน Tenant เดิมและจะไม่สามารถเข้าถึงผ่าน Tenant ใหม่ได้ เครดิตจะถูก reset เป็น 0 ทันที งานที่ยังอยู่ในคิวจะถูกยกเลิกและไม่ process ต่อ หากต้องการส่งต่องาน ต้องใช้ Data Transfer แยกต่างหาก

The confirmation requires an explicit checkbox and typed confirmation. The
request has an action idempotency key, so retries cannot apply the move or
credit reset twice.

The old records remain in the old tenant. A later, explicit Data Transfer
operation may transfer selected eligible work to another user in that old
tenant.

### 6. Tenant Admin Data Transfer

Tenant Admin transfer is limited to a source and target user in the same
tenant. It changes only allowlisted ownership fields and never changes the
tenant or primary keys.

Eligible data includes:

- images and videos;
- managed files in supported formats;
- Series, Presentations, Storyboards, Projects, and other domain work;
- completed artifacts and result references;
- every terminal job-linked work type in the system, provided its registered
  ownership handler passes the same-tenant preflight. A type without a safe
  handler remains excluded until its handler is implemented and tested.

The execution/audit ledger remains authoritative and is not rewritten as new
user usage. Original creator, execution actors, job ID, event history, credit
settlement, transaction history, and audit records remain preserved. The target
user receives access to the transferred work product, not ownership of the
historical billing or usage event.

Excluded data includes transactions, payment/refund/invoice records, credit
balance and usage, password/session/API-key/secret data, admin roles, and any
record with an active provider or settlement side effect.

### 7. Queue handling during transfer

Queued execution is not transferable:

| Job state | Transfer behavior |
|---|---|
| `pending`, `queued`, `retry_scheduled` | Cancel/fence, remove from transport where possible, retain DB history |
| `leased`, `running`, `waiting_external` | Block transfer and report requires separate handling |
| `succeeded`, terminal `failed`, `cancelled`, `expired` | Transfer eligible domain output/work only |

"Kill" means cancel the control-plane execution, fence the attempt, cancel
the outbox/transport message, and append `CANCEL_REQUESTED`/`CANCELLED` with a
transfer reason. It does not physically delete `worker_jobs`,
`worker_job_events`, provider references, or audit evidence. No automatic
retry, provider regeneration, or credit consumption follows.

The UI must show the number of queued jobs that will be cancelled and tell the
new owner that continuation requires a new user-initiated job later.

### 8. Conflict and ownership model

The preflight checks primary keys, foreign keys, composite unique keys, slugs,
names, parent-child ownership, and domain-specific invariants. A primary-key
non-collision is not sufficient; for example, `(tenantId, userId, slug)` may
still conflict.

Each transfer item records its source and target ownership, resource type,
conflict reason, and operation ID. On conflict:

- do not overwrite;
- do not merge automatically;
- stop or skip only that item according to the operation policy;
- show the conflict in the report;
- allow the administrator to resolve or explicitly skip it.

`tenantId` remains unchanged for same-tenant transfer. A resource's immutable
canonical ID and job ID remain unchanged.

### 9. Resumability and idempotency

The transfer operation uses a canonical Feature 186 job with type
`tenant_data_transfer` plus a companion item record for each selected resource.
The operation and items are durable before processing starts.

Operation states:

```text
previewed -> approved -> running -> completed
                         |-> paused_on_error
paused_on_error -> resuming -> completed_with_conflicts
```

Item states:

```text
pending | transferred | retryable_error | permanent_error | conflict | skipped
```

Every batch is guarded by operation ID, item ID, source/target user, tenant,
and idempotency key. A restart or resume:

- skips `transferred` items;
- retries only bounded `retryable_error` items;
- requires resolution or explicit skip for `conflict` and permanent errors;
- preserves the checkpoint and progress;
- never creates a replacement operation;
- never repeats a credit, transaction, provider, or notification side effect.

Transient failures use bounded backoff. Systemic failures pause the operation
and expose `ดำเนินการต่อ`; permanent record-level failures remain visible in
the report instead of causing silent data loss.

## UI and audit surfaces

### System Admin move page

The page shows account identity, old/new tenant, credit reset, session revoke,
old-data counts, queued-job cancellation count, the full warning, and the
typed confirmation. It must not offer a checkbox implying that old files can
be moved as part of the tenant change.

### Tenant Admin transfer page

The page is a wizard:

1. choose source and same-tenant target user;
2. choose resource categories and individual records;
3. run Preview/Dry-run;
4. review transfer, cancel, excluded, and conflict lists;
5. confirm the operation;
6. monitor batches and resume after failure.

The dashboard and user menu show the authenticated current workspace distinctly
from public site branding.

## Failure behavior

- Database failure before a move commit: no tenant, credit, or session change.
- Failure after a transfer batch commit: committed items remain transferred;
  later resume continues from the next item.
- Database serialization/deadlock: bounded transaction retry with the same
  idempotency key.
- Missing source/target or authorization mismatch: fail closed.
- Provider or active-job ambiguity: exclude from transfer and require separate
  handling; do not guess or resubmit.
- Transport cancellation failure: retain `CANCEL_REQUESTED`, expose the
  failure, and reconcile without deleting the job ledger.
- Resource conflict: preserve both records and report the exact constraint.
- Invalid or expired invite code: reject signup before user/session creation.

## Data and implementation boundaries

The design must be applied after an inventory of the existing code paths,
including:

- `apps/web/drizzle/schema.ts` for `users`, `tenants`, invite codes, credits,
  and job/domain ownership;
- `apps/web/server/_core/tenant.ts` and context construction for hostname
  branding versus authenticated tenant;
- authentication, registration, OAuth, invite-code, and tenant routers;
- `tenantContext` and all services using `registeredDomain` or
  `currentTenantId`;
- storage/media authorization and every resource selected for transfer;
- dashboard tenant display and admin authorization UI.

The first implementation should normalize tenant IDs as strings at the API
boundary because the tenant primary key is varchar-based. It must preserve
existing compatibility projections while migrating readers and writers.

## Migration order

1. Inventory all tenant readers/writers, domain-admin checks, signup paths,
   invite-code paths, OAuth paths, storage/media authorization, credits, and
   resource ownership constraints.
2. Add explicit public-branding and authenticated-tenant context boundaries.
3. Implement signup precedence and invalid-invite rejection with focused tests.
4. Implement Central Auth/SSO code exchange and session revocation semantics.
5. Migrate authorization from `registeredDomain`/hostname to
   `currentTenantId`.
6. Add System Admin tenant move preview, warning, guarded transaction, credit
   reset, and session revocation.
7. Build the same-tenant Data Transfer allowlist and dry-run preflight.
8. Add queued-job cancellation, item checkpoints, resumability, and conflict
   reports.
9. Migrate resource types in bounded waves; keep unmapped resources excluded.
10. Remove compatibility checks only after all readers, retention, and rollback
    windows are complete.

## Verification plan

- Unit-test hostname normalization, invite precedence, global invite fallback,
  invalid invite rejection, tenant resolution, role checks, and warning copy.
- Test login from same-root and cross-root domains, one-time code replay,
  PKCE/state mismatch, revoked sessions, and tenant move visibility.
- Test that hostname and client tenant payloads cannot override
  `currentTenantId`.
- Test System Admin-only move, Tenant Admin denial, immediate credit reset,
  unchanged old data, and complete audit metadata.
- Test resource allowlist, same-tenant enforcement, composite unique conflicts,
  parent-child ownership, redaction, and no transaction/credit transfer.
- Test queued job cancellation and retention of `worker_jobs`/events.
- Test running/external job exclusion and ambiguous-provider fail-closed paths.
- Test process crash, worker restart, database contention, batch retry, resume,
  duplicate resume, and no duplicate successful item transfer.
- Test UI warning, preview counts, conflict report, progress checkpoint, and
  active workspace display on desktop and mobile.
- Run focused typechecks/tests, static call-site checks for direct hostname or
  `registeredDomain` authorization, and `git diff --check`.
- Do not claim cross-domain production SSO, provider recovery, deployment, or
  Cloudflare proof without environment-specific evidence.

## Acceptance criteria

- A user has one authoritative `currentTenantId`.
- No protected authorization path uses hostname as an override.
- Signup without an invite uses only the current signup hostname's exact active
  tenant match, then Default fallback.
- Invalid supplied invite codes reject signup without silent fallback.
- System Admin tenant move resets credits to zero, revokes sessions, preserves
  old data, and displays the explicit warning.
- Tenant Admin cannot move users across tenants.
- Tenant Admin can transfer only selected allowlisted work within one tenant.
- Images, videos, files, and eligible job-linked terminal work are transferable.
- Every job-linked terminal work type is covered by a registered transfer
  handler or is explicitly reported as unsupported; no type is silently skipped.
- Transactions, usage history, credits, secrets, and active execution are not.
- Queued work is cancelled and retained for audit, not deleted or regenerated.
- Conflicts are reported without overwrite or automatic merge.
- An interrupted transfer resumes to completion from durable item state without
  repeating successful items or creating a replacement operation.
- Dashboard clearly distinguishes authenticated workspace from site branding.
