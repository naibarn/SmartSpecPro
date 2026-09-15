# Unified Tenant Identity and Resumable Data Transfer Design

Date: 2026-09-13
Status: IMPLEMENTED LOCALLY / NOT ENABLED — additive schema, guarded identity move,
session revocation, transfer preview/execute/resume, and focused contract tests
are present locally; staging/production evidence remains required.
Feature: 189
Related specifications: Feature 186 — Unified Job Control Plane Adapters; Feature 187 — Hybrid Cloudflare Migration Preparation and Promotion Readiness; Feature 188 — Admin Platform Operations and Cloudflare Cutover

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

## Ownership and dependency boundary

Feature 186 is the accepted canonical Job Control Plane dependency boundary
used by this feature. Feature 189 consumes its existing `create`, guarded claim/lease,
heartbeat, progress, completion/failure, cancellation, outbox, settlement, and
reconciliation contracts. Feature 189 must not add a second job ledger, change
Feature 186 status/attempt/lease semantics, call a transport directly, or fork
the control-plane implementation. A required change to Feature 186 is a
separately reviewed dependency change, not a local transfer-specific variant.

Feature 189 owns `users.currentTenantId`, public-versus-authenticated tenant
resolution, signup/admission, cross-root authentication/session behavior,
System Admin tenant moves, transfer handler registration, preview/approval,
transfer item execution, transfer UI, and transfer-specific audit projections.
Feature 186 owns the execution lifecycle and transport boundary. This
specification is authoritative for identity and transfer product semantics;
Feature 186 remains authoritative for canonical job lifecycle semantics.

The transfer operation may use Feature 186's existing `tenant_data_transfer`
job type, but it must not introduce Feature 186 schema migrations or reuse its
migration number. Feature 189 schema changes use the next repository migration
number assigned after the current Feature 186 journal.

## Feature order and handoff boundary

Feature 189 is the tenant-domain prerequisite for the final migration path, but
it does not depend on Cloudflare infrastructure. Its hard dependency is the
accepted Feature 186 control-plane port needed for canonical creation,
cancellation, fencing, outbox publication, and reconciliation.

The delivery order is:

0. Feature 186 first stabilizes the accepted canonical job contract, guarded
   cancellation/fencing, outbox, settlement, and reconciliation ports used by
   transfer operations.
1. Feature 189 stabilizes server-derived tenant context, authorization, tenant
   moves, transfer fences, and transfer checkpoints.
2. Feature 187 consumes those ownership rules while preparing environment/data
   promotion and adapter readiness. Its final handoff must include tenant
   ownership validation and the `tenant_data_transfer` job-class mapping.
3. Feature 188 consumes both handoffs for Admin operations and production
   cutover. It owns platform activation and must not move identity or transfer
   data semantics into its control-center implementation.

Feature 187 and Feature 188 inventory work may start in parallel with Feature
189. Feature 189's identity and authorization gates must pass before the first
production data freeze, promotion candidate, or cutover activation. Feature
189 itself may be developed and tested on the existing mini-server/control-plane
adapters; Cloudflare, Hyperdrive, release, and cutover proof are not acceptance
criteria for this feature.

### Feature 189-owned closure requirements

For this specification, Feature 186 is treated as the accepted dependency
boundary for canonical job creation, leasing, cancellation, outbox handling,
settlement, and reconciliation. Feature 189 must prove the subset required by
the tenant-move and transfer paths, but it must not reopen or fork the generic
control-plane contract. Remaining generic adapter migration and Cloudflare
readiness are separate gates owned by Feature 186/187/188.

Feature 189 is not complete until it provides all of the following:

1. A versioned transfer-handler registry covering every selectable resource
   type, including ownership inspection, supported-format validation,
   dependency ordering, conflict-key calculation, idempotent apply, and
   post-write verification. Unregistered or unsupported resources must be
   reported explicitly and never silently skipped.
2. Durable identity and transfer records for mutation fencing, immutable
   previews, deterministic preview items, approved plans, per-item outcomes,
   checkpoints, and settlement markers. These records are projections and
   checkpoints only; `worker_jobs.id` remains the operation identity.
3. A durable `tenant_data_transfer_actions` record for every mutating transfer
   command (`approve`, `resume`, `resolveItem`, and `cancel`). Its unique action
   key, command/target hash, actor and authorization decision, expected
   operation state, effective outcome, and safe error must be persisted before
   the response. Repeating the same action returns the original outcome; reuse
   against a different command or target returns `IDEMPOTENCY_CONFLICT`.
4. System Admin tenant-move fencing and queue cancellation integration through
   Feature 186 ports: only verified canonical jobs are cancelled, active jobs
   block the move, unpublished work is marked cancelled, published references
   are retained, and late delivery becomes a fenced no-op or quarantine
   observation. No shared queue flush, provider resubmission, regeneration, or
   credit charge is allowed.
5. A transfer executor that receives only the canonical transfer job ID,
   reloads the approved plan, processes bounded deterministic batches, and
   resumes the same operation from durable item state without duplicating a
   successful ownership or storage side effect.
6. Protected API and UI flows for preview, cursor-paginated review, typed
   approval, operation status, item outcomes, resume, conflict resolution, and
   terminal cancellation, including tenant authorization, redaction, rate
   limits, and explicit active-job/unsupported/conflict results.
7. Focused schema, handler, command-idempotency, queue-fencing, crash/resume,
   conflict, authorization, redaction, and browser verification before each
   corresponding rollout flag is enabled.

The following findings are explicitly reclassified as outside Feature 189:

- Generic `worker_job_actions` and `worker_job_callbacks` are not copied into
  the transfer schema. Transfer commands use `tenant_data_transfer_actions`;
  provider callback authentication and replay handling remain the owning
  adapter/domain boundary.
- The remaining generic BullMQ/Celery producer migration, Cloudflare adapters,
  Hyperdrive connectivity, and control-plane operational budgets remain
  Feature 186/188 deployment or adapter work. Feature 189 consumes those
  ports and does not call transports directly.

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

Every protected request must carry a server-derived context containing the
authenticated user, authenticated tenant, actor type/ID, authorization scope,
correlation ID, and request/action idempotency key where applicable. Missing,
ambiguous, or mismatched tenant context fails closed. System jobs use an
explicit system actor and tenant policy; they never impersonate an ordinary
user.

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

The authorization code is stored only as a hash and expires within the
configured short replay window. The exchange requires PKCE S256, exact
registered redirect URI matching, client/audience/issuer validation, nonce and
state validation, one-time consumption under a uniqueness guard, and session
rotation. Authorization codes, PKCE verifiers, refresh tokens, and session
identifiers are never written to ordinary logs or job payloads. Rate limits
apply separately to authorization start, code exchange, and failed replay or
state-mismatch attempts.

Protected requests resolve the tenant from the authenticated user binding. A
tenant move revokes all sessions, refresh tokens, and device tokens so the new
tenant is effective immediately.

### 5. System Admin tenant move

The move is a two-phase guarded operation available only to global System
Admin. It must not hold a database transaction across a queue or adapter call:

1. Create or reload the durable action record and, in a short PostgreSQL
   transaction, lock the user row and validate the source and active target
   tenants. Commit this snapshot before calling Feature 186 or any transport
   adapter; the lock must never be held across an external call.
2. Enumerate only verified source-user canonical jobs in `pending`, `queued`,
   and `retry_scheduled`. Cancel/fence them through Feature 186 and persist
   `queue_cancelled` evidence. `leased`, `running`, and `waiting_external`
   jobs return stable `ACTIVE_JOB_BLOCKED`; the account binding is not changed.
3. After all queueable jobs have durable cancellation markers and no active
   blocker remains, re-lock and revalidate the user and tenant snapshot in a
   second short transaction. Commit the binding change, an idempotent
   credit-reset settlement, session/refresh/device-token revocation, and the
   audit event together.

If phase 3 fails after phase 2 partially succeeds, the old binding remains in
force, cancellation evidence is retained, and a retry with the same action key
continues from the remaining verified jobs. It never flushes a shared queue or
silently reopens cancelled work. All tenant-owned rows and canonical job IDs
remain unchanged.

The UI must show this warning before confirmation:

> การย้าย Tenant จะไม่ย้ายรูปภาพ วิดีโอ ไฟล์ งาน หรือข้อมูลเดิมตาม user ไปด้วย ข้อมูลเหล่านั้นยังอยู่ใน Tenant เดิมและจะไม่สามารถเข้าถึงผ่าน Tenant ใหม่ได้ เครดิตจะถูก reset เป็น 0 ทันที งานที่ยังอยู่ในคิวจะถูกยกเลิกและไม่ process ต่อ หากต้องการส่งต่องาน ต้องใช้ Data Transfer แยกต่างหาก

The confirmation requires an explicit checkbox and typed confirmation. The
request has an action idempotency key, so retries cannot apply the move or
credit reset twice.

The move creates a durable, user-scoped mutation fence before queue
cancellation begins. The fence records the action key, source/target tenant
snapshot, phase, fencing version, and safe outcome. Protected job admission
and dispatch for that source user must reject or defer with
`TENANT_MOVE_IN_PROGRESS` while the fence is open; no new transport side
effect may be created. Before the final binding transaction, the service
re-enumerates queueable and active canonical jobs under the same fence. A
process loss leaves the fence recoverable by the same action key; successful
commit closes it, while a failed commit keeps the old binding and an explicit
retry path.

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

Each resource handler must expose a versioned, server-side contract with
ownership inspection, supported-format validation, dependency ordering,
conflict-key calculation, destination/reference validation, an idempotent apply
operation, and post-write verification. The handler may update only the
allowlisted target-user ownership/access fields. Handler version and policy
version are frozen into the preview and approval fingerprint; a handler change
invalidates an existing preview.

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

Feature 186 remains the sole authority for the cancellation transition. A
transport message that arrives after cancellation is a fenced no-op or bounded
quarantine observation according to the adapter capability; it cannot claim,
execute, charge, publish, or alter the transfer operation.

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

Approval also opens a source-user transfer fence in the same transaction as
the canonical operation/plan. New queueable job admission for that source user
must reject or defer with `TRANSFER_IN_PROGRESS` until the operation reaches a
terminal state, so the approved queue-candidate snapshot cannot be bypassed by
new work. The fence is released only by the guarded terminal success, explicit
terminal cancellation, or operator-reviewed terminal failure path.

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

### 9.1 Canonical state mapping and durable transfer records

Transfer operation and item states are projections/checkpoints, not a second
job lifecycle. The canonical mapping is:

| Transfer projection | Canonical job rule |
|---|---|
| `previewed` | No execution job is created by preview. |
| `approved` | One queued `tenant_data_transfer` job is created transactionally with the immutable plan. |
| `running`, `resuming` | Feature 186 canonical state is `running`; the active attempt/lease is required. |
| `paused_on_error` | Feature 186 state is `retry_scheduled` with `operatorReviewRequired = true`; automatic dispatch is forbidden. |
| `completed` | Canonical job is `succeeded` only after every item is transferred or explicitly approved-skipped. |
| `completed_with_conflicts` | Canonical job is `succeeded` only when unresolved conflict/unsupported/permanent items are explicitly settled by policy; otherwise it remains review-gated. |
| `cancelled` | Canonical job is `cancelled`; it cannot be resumed. |
| operation-level failure | Canonical job is `failed` with a safe error and operator review when recovery is ambiguous. |

The logical transfer records are:

- `tenant_identity_events`: immutable account ID, actor, source/target tenant,
  reason, action key, correlation ID, credit-reset marker, session-revocation
  marker, and server timestamps.
- `tenant_identity_actions`: durable mutable phase record for an identity move
  fence, keyed by action idempotency key and user. It records the source/target
  snapshot, phase, fencing version, authorization decision, safe outcome, and
  timestamps; it is coordination metadata, not the tenant binding or a job
  lifecycle source.
- `tenant_data_transfer_actions`: one durable command record for each transfer
  mutation, keyed by action idempotency key and scoped to the preview or
  canonical operation. It records the command/target hash, actor, authorization
  decision, expected state, effective outcome, safe error, and timestamps; it
  prevents duplicate approval, resume, item-resolution, or cancellation effects.
- `tenant_data_transfer_previews`: tenant, source/target user, canonical
  selection hash, complete snapshot fingerprint, handler registry version,
  policy/schema versions, expiry, creator, and immutable counts.
- `tenant_data_transfer_preview_items`: deterministic item key, resource kind
  and ID, source/target scope, dependency order, disposition, conflict/error
  code, handler version, and redacted metadata.
- `tenant_data_transfer_plans` and `tenant_data_transfer_items`: immutable
  approved snapshot linkage plus guarded execution state, settlement marker,
  checkpoint/batch cursor, attempt/action keys, and bounded outcome metadata.

Every companion record is tenant-scoped, foreign-keyed to the canonical
operation where applicable, and protected by uniqueness on action keys,
preview fingerprints, item keys, and per-item settlement keys. No companion
record may define an independent job status, retry counter, lease, or operation
identity.

Preview fingerprints and request hashes use one specified canonicalization:
UTF-8 RFC 8785-style JSON canonicalization, NFC Unicode normalization, sorted
set-like IDs, explicit default values, and rejection of non-finite numbers,
duplicate IDs, unbounded strings, and unknown selection fields. The complete
sorted snapshot item-key list, source/target users, tenant, handler/policy
versions, and schema version participate in the approval fingerprint; IDs,
timestamps, and cursors generated after the snapshot do not.

### 9.2 API and command contract

The protected `tenantDataTransfer` API exposes only these operations:

| Operation | Required input | Result/guard |
|---|---|---|
| `preview` | source user, target user, selection, request idempotency key | Immutable preview or stable validation/conflict result; no mutation outside preview records. |
| `listPreviewItems` | preview ID, signed cursor, bounded filters | Redacted cursor-paginated snapshot items. |
| `approve` | preview fingerprint, source/target, typed confirmation, action key | Exactly one canonical job/plan/outbox or the original durable outcome. |
| `getOperation` | operation/job ID | Canonical job state plus transfer projection, counts, review gate, and audit-safe summary. |
| `listItems` | operation ID, signed cursor, bounded filters | Redacted item outcomes and dispositions. |
| `resume` | operation ID, action key | Clears only the authorized review gate and dispatches the same canonical job. |
| `resolveItem` | operation/item ID, `retry` or `skip`, action key | Guarded resolution; never overwrite/merge. |
| `cancel` | operation ID, action key | Terminal cancellation of the operation and unsettled items only. |

Stable errors include `TENANT_MISMATCH`, `FORBIDDEN`, `PREVIEW_STALE`,
`PREVIEW_EXPIRED`, `IDEMPOTENCY_CONFLICT`, `ACTIVE_JOB_BLOCKED`,
`TENANT_MOVE_IN_PROGRESS`, `TRANSFER_IN_PROGRESS`,
`UNSUPPORTED_RESOURCE`, `RESOURCE_CONFLICT`, `JOB_STATE_CONFLICT`,
`OPERATOR_REVIEW_REQUIRED`, `BACKPRESSURE`, and `TRANSFER_CANCELLED`.
Responses must distinguish validation failure, an existing idempotent outcome,
and a newly accepted operation; they must never imply that excluded financial,
security, or active execution data was transferred.

### 9.3 Side-effect and recovery contract

The transfer executor receives only the canonical job ID from the Feature 186
adapter, reloads the approved plan, and processes bounded deterministic item
batches. Every item mutation and storage/domain write is guarded by tenant,
operation, item key, current attempt/lease context, and a durable settlement
marker. A partial storage or domain write is reconciled by item key and result
digest; it is never repaired by creating another operation.

Feature 189 must not call BullMQ, Celery, Beat, Redis, provider APIs, or
transport cancellation directly. Queue cancellation, lease fencing, outbox
publication, and reconciliation use Feature 186 ports. External provider work
or active execution blocks approval; an ambiguous provider result is retained
for operator review and is never guessed lost or resubmitted with a new key.

Selection size, preview TTL, batch size, item error size, operation deadline,
resume count, and API rate limits are deployment-configured numeric budgets.
The rollout manifest must contain a value for each before the corresponding
flag is enabled; empty or implicit limits are a release failure.

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
- Every mutating transfer command has a durable action record; repeated action
  requests return the original outcome and a reused key with a different
  command or target returns `IDEMPOTENCY_CONFLICT`.
- Images, videos, files, and eligible job-linked terminal work are transferable.
- Every job-linked terminal work type is covered by a registered transfer
  handler or is explicitly reported as unsupported; no type is silently skipped.
- Transactions, usage history, credits, secrets, and active execution are not.
- Queued work is cancelled and retained for audit, not deleted or regenerated.
- Conflicts are reported without overwrite or automatic merge.
- An interrupted transfer resumes to completion from durable item state without
  repeating successful items or creating a replacement operation.
- Dashboard clearly distinguishes authenticated workspace from site branding.
