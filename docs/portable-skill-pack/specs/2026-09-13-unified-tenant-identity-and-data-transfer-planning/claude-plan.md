# Implementation plan — Unified tenant identity and resumable data transfer

## 1. Delivery boundary and sequencing

This plan implements the approved tenant identity and data-transfer design in the existing SmartSpecPro web application. It does not implement a new generic jobs ledger, move production data, deploy an identity provider, provision Cloudflare resources, or modify `.env`.

The work is intentionally sequenced around one source of truth:

1. inventory and introduce contract-level tests;
2. make schema additions in one serialized conductor-owned migration step;
3. implement tenant admission and authenticated-tenant resolution;
4. migrate authorization consumers and authentication flows;
5. implement the System Admin move operation;
6. implement transfer registry, preview, approval, execution, queue cancellation, and resumability;
7. add API/UI and browser evidence;
8. run migration rehearsal, rollout gates, and rollback drills.

The existing dirty worktree must be preserved. Before each implementation wave, record the exact owned paths; do not reformat whole files or touch `apps/web/.env`.

### Dependency gates

- No transfer execution code is enabled until the tenant resolver and ownership helpers are authoritative and tested.
- No schema-dependent parallel work begins until the serialized Drizzle migration and type surface are complete.
- No System Admin tenant move is exposed until session/token revocation and audit behavior are proven.
- No transfer approval is accepted until preview has enumerated all selected resources, exclusions, queue actions, conflicts, and unsupported handlers.
- No production rollout is enabled until dry-run evidence, duplicate/idempotency tests, queue cancellation tests, and browser resume evidence pass.

## 2. Phase 0 — inventory and contract tests

### 2.1 Build the inventory

Create `docs/portable-skill-pack/specs/2026-09-13-unified-tenant-identity-and-data-transfer-planning/rollout-manifest.md` as the implementation/rollout manifest (and copy its operationally required contents to the repository's normal runbook location only if a later release process requires it) containing:

- protected routes/services that currently use request hostname tenant context;
- all password, OAuth, Python OAuth exchange, device-login, and session refresh/admission paths;
- all `domain_admin` checks and any use of `registeredDomain` for authorization;
- all client-provided `tenantId` inputs accepted by protected routes;
- data tables and storage handlers that are candidates for transfer;
- every job type and domain row that can be linked to `worker_jobs`;
- current queue/dispatch cancellation capabilities and provider ambiguity behavior;
- test files and commands covering each path.

Use targeted searches around `apps/web/server/_core`, `apps/web/server/services`, `apps/web/server/routers`, `apps/web/client/src/contexts`, `apps/web/client/src/pages`, `apps/web/client/src/components`, `apps/web/drizzle`, and Feature 186 scripts. The inventory is a required artifact, not a reason to make speculative changes to every tenant reference in the repository.

### 2.2 Establish shared contracts first

Add shared types/constants in the owning existing module locations for:

- `TenantResolutionSource`: authenticated account, exact host branding, invite binding, default fallback;
- stable tenant errors such as missing tenant, tenant mismatch, invalid supplied invite, and idempotency conflict;
- transfer resource kinds, handler capabilities, operation/item states, exclusion reasons, conflict categories, and resume outcomes;
- a redacted transfer preview/result shape that never includes secrets, credentials, signed URLs, transaction history, or raw provider responses.

The contracts must distinguish `accountTenantId` from `brandingTenantId` at the type and naming level. A resolver returning one ambiguous `tenantId` for both concerns is not acceptable.

### 2.3 Test-first baseline

Before behavior changes, add failing focused tests for the agreed rules. Use Vitest and the existing mock/database conventions. Tests should cover behavior and authorization rather than snapshots of implementation details.

## 3. Phase 1 — serialized schema and migration foundation

Only the conductor edits `apps/web/drizzle/schema.ts` and the associated SQL migration, serially and before dependent implementation waves. Do not ask parallel agents to edit schema files.

### 3.1 Tenant identity audit fields

Prefer the existing `users.currentTenantId` as the authoritative binding. Add the bounded `tenantIdentityMigrationReason` and `tenantIdentityMigratedAt` fields plus an immutable database-backed `tenant_identity_events` table for automatic repair and System Admin moves, because the current `auditLogger` writes buffered JSONL asynchronously and cannot by itself prove a transactionally committed security event. Do not add a membership table or a second current-tenant column.

The schema must support:

- valid active-tenant foreign-key verification;
- explicit Default tenant identification/configuration without relying on “first active row” in a migration;
- audit of old/new tenant, actor, reason, credit reset, and session-revocation outcome for System Admin moves;
- immutable `tenant_identity_events` rows with old/new tenant, actor, reason, credit-reset result, session-revocation result, action idempotency key, and a unique move/backfill event key;
- indexes for current-tenant user lookup and domain-admin scope where absent.

`tenant_identity_events` must record the affected user, actor, old/new tenant, action (`backfill` or `system_admin_move`), reason, prior/current credit balance, session-revocation result, idempotency key, and server timestamps. The System Admin move updates `users` and inserts this event in one transaction; the existing credit service/ledger boundary records the zeroing reason without deleting or rewriting prior credit transactions.

The service may additionally emit the existing `auditLogger` event for operational search, but the database audit row is the authoritative evidence for a tenant move/backfill and must be committed in the same transaction as the identity change.

### 3.2 Transfer coordination tables

Extend Drizzle with the minimum companion model, linked to `worker_jobs.id`:

- `tenant_data_transfer_items`: immutable `operationId` equal to the canonical `worker_jobs.id`, source tenant, target tenant (same tenant in v1), `sourceUserId`, `targetUserId`, resource kind, source resource identifier, optional destination identifier, item state, handler version, content/definition hash, idempotency key, conflict/error code, bounded error detail, timestamps, and causal job ID. Do not generate a second operation identity.
- `tenant_data_transfer_previews`: immutable, expiring pre-approval snapshot with preview ID/fingerprint, source/target users and tenant, selected resource references, handler/version snapshot, counts, and request idempotency key. It is not a job ledger and cannot own a lease or retry counter.
- `tenant_data_transfer_preview_items`: immutable one-row-per-discovered-resource snapshot linked to a preview, with resource kind/source ID, handler/version, bounded classification/reason, content hash, and redacted metadata. It supports cursor pagination for large previews and is not an execution/item ledger.
- `tenant_data_transfer_plans`: exactly one immutable approved plan snapshot per transfer operation, linked one-to-one to the canonical transfer job; it stores the source/target users and tenant, approved selection, handler/version snapshot, preview fingerprint, and bounded policy metadata. Operation state, progress, item outcomes, and result/conflict summary are read from `worker_jobs` plus transfer items, not mutated on this immutable plan row. It is not a job ledger and cannot own a lease or retry counter.
- Transfer audit/outcome records use the new immutable transfer audit fields/table or the canonical job event ledger as appropriate; the existing buffered `auditLogger` may be a secondary operational emission only. Do not store financial transaction history in transfer tables.

Use unique constraints to protect `(previewId, resourceKind, sourceResourceId)` for preview items, `(operationId, resourceKind, sourceResourceId)` for execution items, per-item idempotency, and any destination ownership key needed to prevent duplicate copy/link. Foreign keys must preserve transfer evidence while respecting the existing cascade/privacy policies. The preview and approval input must include both source and target user; both must belong to the same active tenant, and the target user must be eligible to receive work under the tenant-admin policy. The preview fingerprint covers the complete immutable preview-item snapshot, not only the first cursor page.

The transfer operation state is a domain projection mapped to the canonical job: `previewed`/`approved` are pre-dispatch phases, `running`/`resuming` map to an active canonical execution state, `paused_on_error` maps to canonical `retry_scheduled` with `operatorReviewRequired = true` and no automatic outbox dispatch until resume, `completed`/`completed_with_conflicts` map to canonical success with the conflict summary retained, and `failed`/`cancelled` map to terminal canonical outcomes. The projection is derived from the canonical job and item rows; it is not a mutable status on the immutable plan and does not create an independent execution lease, retry counter, or source of truth.

### 3.3 Migration order and backfill

Use expand/validate/backfill/contract stages:

1. add nullable/additive audit and transfer fields/tables;
2. deploy code that can read both old and new representations;
3. run a dry-run migration report for users with null/inactive/invalid `currentTenantId` and domain candidates;
4. assign valid current tenants, then uniquely matched registered domains, then the explicit Default tenant, recording the reason;
5. validate no user remains without a permitted tenant unless an explicit system account policy allows it;
6. only then tighten constraints or remove obsolete assumptions, after reader migration and rollback window.

The backfill must use a fixed configured Default tenant ID/name resolved from the database, be idempotent, and never use the request hostname. It must not change credits, transactions, media ownership, or historical domain rows.

After migration, run Drizzle schema validation/typecheck and database integration tests before allowing later waves to depend on the new fields.

## 4. Phase 2 — tenant admission, auth, and SSO

### 4.1 Canonical tenant admission service

Implement one server-side admission service under `apps/web/server/services` that accepts trusted inputs: normalized host, optional supplied invite code, registration mode, and an explicit default-tenant policy. It returns tenant binding, public branding tenant, invite authorization metadata, and an auditable resolution source.

The service must apply this exact order:

1. valid tenant-bound invite binds to that tenant;
2. valid global invite authorizes but does not bind;
3. exact active host match against primary/additional domains;
4. explicit Default tenant.

The service must reject any supplied invalid, inactive, expired, or exhausted invite in open and invite-only modes. Tenant-bound invite validation must not be weakened by the host tenant. Normalize invite codes using the existing service convention and keep definition/decision data bounded.

### 4.2 Authenticated tenant resolver

Split `apps/web/server/services/tenantContext.ts` into clearly named responsibilities:

- public branding resolution: request/host tenant, safe for theme and public content;
- authenticated workspace resolution: reload the user or trusted context and use `users.currentTenantId`, with active-tenant verification;
- explicit system/admin resolution: only for authorized cross-tenant operations and never from arbitrary client input.

Protected service helpers should require an account tenant rather than silently falling back to branding. They should fail closed when no active tenant exists. Update context/procedure helpers so protected routes do not need to remember the distinction manually.

### 4.3 Password and OAuth signup/login

Update `apps/web/server/routers.ts`, `apps/web/server/_core/oauth.ts`, and related auth services so:

- registration calls the canonical admission service;
- password login returns the persisted account tenant, regardless of host;
- OAuth new-user creation and OAuth exchange use the same invite/host/default precedence;
- an existing OAuth account never has `currentTenantId` overwritten by the current host;
- users created by an upstream/Python OAuth path are admitted or held for explicit onboarding rather than silently assigned from a host;
- account-disabled and missing-tenant checks happen before issuing a new session.

Preserve existing email verification, 2FA, rate limiting, and fraud controls. Add regression tests for host mismatch, tenant-bound invite on another host, global invite, invalid supplied invite, existing account login on another domain, and OAuth parity.

### 4.4 Cross-root SSO handoff

Implement the smallest provider-neutral internal handoff compatible with the current auth system:

- initiating domain creates a short-lived, single-use handoff transaction bound to the browser state, destination origin, source session/user, PKCE challenge, and OIDC nonce where applicable;
- destination origin is selected from an exact server allowlist, not a query-string URL;
- callback exchanges the one-time code with the verifier/state/nonce, atomically consumes the code, reloads the user and `currentTenantId`, and creates a local session;
- replay, expired, wrong-origin, wrong-verifier, wrong-nonce, disabled-user, and missing-tenant cases fail closed and leave bounded audit evidence;
- no token or password is placed in a URL, log, or durable transfer payload.

Follow RFC 9700/RFC 7636 requirements: authorization code + PKCE `S256`, transaction-specific state/nonce, exact redirect/origin matching, no open redirect, and downgrade protection. Keep this behind a feature flag if the existing identity provider cannot satisfy the contract in the first rollout.

## 5. Phase 3 — authorization and workspace projection migration

### 5.1 Server authorization wave

Update protected paths in bounded groups, starting with high-risk data/credit/storage routes:

- replace `resolveTenantIdVarchar(ctx.tenantId, user.currentTenantId)` in protected operations with an authenticated-account helper that ignores host tenant;
- reject client `tenantId` fields unless the operation is an explicit, authorized System Admin action with a separate input contract;
- update `apps/web/server/_core/index.ts` routes that currently prefer `validatedBody.tenantId`;
- replace `domain_admin` checks in `apps/web/server/routers/tenant.ts` that compare `registeredDomain` with current-tenant scope checks;
- audit media, library, production, billing, storage, groups, worker, workflow, notification, and artifact services for cross-tenant joins or user-derived tenant fallback.

Each wave must have a static call-site list and tests proving a mismatched host cannot read, write, bill, dispatch, or administer another tenant's data. Public pages and branding endpoints retain host resolution explicitly and are labeled as such.

### 5.2 Authenticated dashboard projection

Expose both values where needed:

- `brandingTenant`: the host-derived public theme/brand;
- `workspaceTenant`: the authenticated user's database-bound tenant.

Update `TenantContext.tsx`, `AuthContext.tsx`, `DashboardLayout.tsx`, and `Dashboard.tsx` to show the workspace tenant clearly for signed-in users while retaining host branding for presentation. If the values differ, the UI should communicate that branding and workspace are separate without implying a tenant switcher. Do not allow client state to choose the server workspace.

## 6. Phase 4 — System Admin tenant move

### 6.1 Guarded service operation

Add a dedicated `adminTenants.moveUserTenant` service/procedure under existing admin service/router ownership. It must:

- require `role = admin` and reject `domain_admin` even if the request host matches the target tenant;
- load the target user and target active tenant under a transaction;
- validate an explicit confirmation token/idempotency key and warning acknowledgment;
- lock/recheck the user row, update only `currentTenantId` and the approved audit fields, and set credits to zero immediately through the existing credit/ledger boundary without deleting or rewriting prior transactions;
- preserve email, openId, password/OAuth identity, and account ID;
- leave old tenant-owned data/files and transaction/usage history in the old tenant;
- before committing the new account tenant, enumerate only this user's verified canonical `pending`, `queued`, and `retry_scheduled` jobs and cancel/fence them through the control plane; never flush a shared broker queue. Any `leased`, `running`, or `waiting_external` job blocks the move until resolved or explicitly reviewed under the same guarded policy. If queue cancellation partially succeeds but the move cannot commit, retain the cancellation evidence and make a repeat of the same idempotent action continue from the remaining jobs;
- revoke all active sessions/tokens through the centralized revocation path;
- append an auditable action with actor, old/new tenant, reason, credit reset, and revocation result;
- return a stable idempotent outcome on repeat requests.

Do not copy media, projects, jobs, files, credits, or billing rows as part of this operation. A subsequent data transfer is a separate, explicit, same-tenant workflow and must not be automatically triggered by the move.

### 6.2 Admin UI

Add a distinct action in `apps/web/client/src/pages/AdminUsers.tsx`. Before confirmation it must display: “การย้าย Tenant จะไม่ย้ายรูปภาพ วิดีโอ ไฟล์ งาน หรือข้อมูลเดิมตาม user ไปด้วย ข้อมูลเหล่านั้นยังอยู่ใน Tenant เดิมและจะไม่สามารถเข้าถึงผ่าน Tenant ใหม่ได้ เครดิตจะถูก reset เป็น 0 ทันที งานที่ยังอยู่ในคิวจะถูกยกเลิกและไม่ process ต่อ หากต้องการส่งต่องาน ต้องใช้ Data Transfer แยกต่างหาก”. Require an explicit checkbox and typed confirmation, show pending/success/error states, and refresh the user from the server. Generic role/credit update controls must not accidentally invoke the move operation.

## 7. Phase 5 — transfer registry, preview, and approval

### 7.1 Registered handler model

Create a transfer-handler registry in `apps/web/server/services` with a stable resource kind, handler version, explicit allowlisted supported-format set where applicable, source ownership query, dependency/reference validation, preview metadata, copy/link strategy, target-user ownership/access mutation, conflict key, and terminal-job eligibility policy. Handlers must be allowlisted in code/configuration; arbitrary table names or user-supplied queries are forbidden.

Initial handlers cover media assets/files, completed video/image artifacts, Series, Presentations, Storyboards, projects/workflows, and terminal job-linked domain resources. The registry must inspect all discovered terminal job-linked types and return an explicit unsupported result when no handler exists.

Handlers must distinguish:

- data that can be copied or linked without changing ownership semantics;
- data that has immutable managed storage references and needs a new ownership binding;
- data with dependencies that must be transferred in deterministic parent-before-child order;
- records that conflict on a target unique key and therefore stop rather than overwrite/merge;
- active/queued job records that require cancellation/blocking rather than copying.

For a successful transfer, the handler changes only the approved target-user ownership/access fields. It preserves immutable primary keys, tenant ID, original creator/execution actors, canonical job ID, event history, and billing/usage references. If a resource cannot safely separate current access ownership from historical authorship, the handler reports a conflict rather than rewriting audit meaning.

### 7.2 Preview/dry-run

The preview operation accepts a distinct source user and target user and validates that both belong to the same active tenant for v1. The caller must be an authorized `domain_admin`/Tenant Admin for that tenant; a System Admin may inspect but does not bypass the same transfer policy without an explicit audited system operation. `clientRequestId` is tenant-scoped and idempotent for the canonicalized source/target/selection; reusing it with different input returns `IDEMPOTENCY_CONFLICT`. The preview then validates selected resource IDs, handlers, storage ownership, foreign-key/dependency constraints, conflict keys, and active-job state. It automatically enumerates every source-owned canonical job in `pending`, `queued`, or `retry_scheduled` state covered by the registered job binding; queue cancellation is not an optional resource checkbox. If any `leased`, `running`, or `waiting_external` job is found, approval returns stable `ACTIVE_JOB_BLOCKED` and no partial transfer begins. Approval also re-enumerates queueable jobs and returns `PREVIEW_STALE` when resources, queue candidates, handlers, or policy changed since preview. It returns counts and bounded per-item reasons for:

- transferable;
- excluded by policy (transactions, usage, credits, secrets, sessions, admin privileges);
- queued work requiring kill/cancel;
- running/leased/waiting-external work that blocks;
- conflicts;
- unsupported handler types;
- invalid ownership or missing managed artifact.

Preview must not mutate source/target data, cancel jobs, charge credits, or publish artifacts. Persist an immutable preview fingerprint/selection snapshot so approval cannot silently change the resource set.

### 7.3 Approval contract

Approval verifies the preview fingerprint, source/target user and tenant scope, confirmation text/token, and operation idempotency key. It creates exactly one canonical `worker_jobs` row with `jobType = tenant_data_transfer`, persisted contract/version/policy, and a durable transfer plan/items/outbox intent in the same transaction. Approval must refuse if the preview is stale or the selected source/target differs.

## 8. Phase 6 — execution, queue kill, and resume

### 8.1 Canonical transfer job

Use Feature 186 control-plane operations for claim, lease, heartbeat, progress, completion, failure, cancellation, and reconciliation. The transfer executor consumes only the canonical job ID, reloads the approved plan, and processes bounded batches of item records.

The worker job remains the canonical operation identity. The transfer item table is coordination metadata only; it cannot define a separate retry budget or lifecycle truth for the job as a whole.

### 8.2 Queue kill before item transfer

For each selected resource and every automatically enumerated source-owned pending/queued/retry-scheduled job-linked item:

- re-read canonical job state under a guarded transaction;
- request/finalize cancellation and fence the current attempt if present;
- mark any unpublished outbox intent cancelled before it can publish;
- call the selected adapter's cancellation/removal capability where supported;
- retain canonical job, events, attempts, dispatch references, and safe operator evidence;
- mark the transfer item as `skipped` with a machine-readable `queue_cancelled` disposition (and count it separately from copied work), never as a copied active execution;
- never flush a shared queue, requeue, clone, regenerate, or issue a provider call as a side effect of transfer.

If adapter removal is unavailable or the transport message was already published, canonical cancellation/fencing is still authoritative: a later redelivery must fail the claim guard and complete as a no-op/quarantine observation without executing the business operation. A legacy queue item without a verified canonical binding is not inferred from queue position or payload; it is quarantined or killed under the legacy drain policy and reported separately from transferred work.

For leased/running/waiting-external items, record a blocking conflict and stop that item/operation according to policy. If a provider result is ambiguous, reconcile by persisted operation key/reference or leave operator review required; do not assume cancellation or loss.

### 8.3 Idempotent item execution

Each handler operation has a deterministic item idempotency key derived from canonical operation ID, tenant, source user, target user, resource kind, source ID, handler version, and logical action. The executor checks item state and durable destination marker before side effects. A retry after process loss returns the existing destination/result for `transferred` items and skips them. It never overwrites/merges a target record or generates a new paid operation.

Process items in deterministic dependency order and bounded batches. After each batch, persist item outcomes, progress, and a resume cursor/checkpoint through guarded transactions. A database/transport/system error moves the operation to `paused_on_error`, releases/fences the execution lease as appropriate, and leaves the next resumable item durable.

### 8.4 Resume and conflict handling

Expose guarded `resume`, `retryItem`, `skipItem`, and `resolveItem` commands with action idempotency keys. `resolveItem` accepts only an explicit `retry` after the operator has repaired the declared conflict or an explicit `skip`; it never means overwrite or merge. Resume may transition only `paused_on_error` or an approved resumable state to `resuming`/`running`. It must:

- skip `transferred` and intentionally `skipped` items;
- retry only bounded `retryable_error` items within the operation policy/deadline;
- leave `conflict` and `permanent_error` items visible until an authorized resolution/skip command;
- recompute ownership/dependency guards before retry;
- preserve the same canonical operation/job ID and item keys;
- append `OPERATOR_ACTION`/recovery events and update the audit trail once per effective command.

After all eligible items settle, mark `completed` when every selected item transferred/skipped by policy, or `completed_with_conflicts` when unresolved conflicts/unsupported/permanent exclusions remain. Mark `failed` only for an unrecoverable operation-level error with operator-review evidence; mark `cancelled` only through the guarded cancellation path.

Cancelling the transfer operation fences its active attempt, marks the canonical job `cancelled`, and marks only unsettled transfer items `skipped` with `operator_cancelled`. Already transferred items remain intact and are not rolled back automatically; cancellation is terminal and cannot be resumed as a hidden retry.

### 8.5 Reconciliation

Extend the existing Feature 186 reconciler/verification path to find paused transfer jobs, stale transfer leases, incomplete item batches, queued jobs whose cancellation evidence is missing, and transfer plans with unresolved storage/domain projection work. Reconciliation must be bounded, tenant-scoped, idempotent, and safe when transport is unavailable. It may resume only according to the persisted operation policy; it must not automatically bypass conflicts or create a replacement operation.

## 9. Phase 7 — API and UI delivery

Expose a dedicated `tenantDataTransfer` tRPC router, mounted from `apps/web/server/routers.ts`, with service methods under `apps/web/server/services/tenantDataTransfer.ts`. The API contract is:

- `preview`: input `{ sourceUserId, targetUserId, resourceSelections, clientRequestId? }`; output `{ previewId, previewFingerprint, sourceUserId, targetUserId, tenantId, counts, items, nextCursor, queueActions, exclusions, generatedAt, expiresAt }`.
- `listPreviewItems`: input `{ previewId, cursor?, classification?, resourceKind? }`; output cursor-paginated redacted immutable preview items. It is read-only and cannot change the approval fingerprint.
- `approve`: input `{ previewId, previewFingerprint, confirmation, actionIdempotencyKey }`; output `{ operationJobId, operationState, acceptedAt }`.
- `getOperation`: input `{ operationJobId }`; output `{ operationJobId, canonicalJobStatus, operationState, progress, counts, lastError, resumable, auditSummary }`.
- `listItems`: input `{ operationJobId, cursor?, state?, resourceKind? }`; output cursor-paginated redacted item records.
- `resume`, `retryItem`, `skipItem`, `resolveItem`, and `cancel`: each accepts the operation/item identifier as applicable plus an action idempotency key and returns the original or newly applied guarded outcome. `resolveItem` accepts only `retry` after the declared conflict is repaired or `skip`; it cannot overwrite or merge.

Mount the router using the repository's existing protected/admin procedure boundary. The API should additionally include:

- preview with selected resource IDs, source user, target user, and server-derived tenant context;
- approve with preview fingerprint, confirmation, and idempotency key;
- operation status/timeline with paginated item results;
- resume/retry-resolvable-item/skip-conflict/cancel actions, each authorized and idempotent;
- redacted item error and audit evidence.

Never accept tenant scope from the client as authority; the server derives source-user/account tenant and validates the target user against the same-tenant v1 policy.

### UI/UX Contract

#### Target User / JTBD

- Role: tenant-authorized admin/operator transferring completed creative work from one user to another within the current tenant; System Admin additionally manages account tenant binding.
- Goal: preview exactly what will move, understand what will be excluded or killed, approve safely, and continue a paused transfer from the last durable checkpoint.
- Entry point: tenant data-management/admin surface for transfer; admin user detail surface for System Admin tenant move.
- Success outcome: selected transferable assets/projects/artifacts are available under the allowed destination ownership, excluded financial/security/active data is clearly reported, and a failed run can resume without duplicates.

#### Existing Pattern Reference

- Searched with targeted `rg` in `apps/web/client/src/pages`, `components`, and `contexts` for transfer, migration, preview, conflict, resume, confirmation, upload, job progress, and admin user actions.
- Found patterns: `AdminUsers.tsx` for privileged user actions and confirmation states; `RenderJobsPage.tsx`/job surfaces for async status; media/library and presentation/storyboard pages for asset/project selection; existing settings/admin panels for loading/error/toast conventions.
- Decision: reuse the existing admin confirmation, async job-status, table/card, and i18n patterns. Diverge only by adding an explicit preview-first and per-item conflict/resume model because no existing data-transfer surface was found.

#### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Authenticated workspace badge | `DashboardLayout.tsx`, `Dashboard.tsx`, `AuthContext.tsx`, `TenantContext.tsx` | Show account workspace separately from host branding. |
| System Admin move | `AdminUsers.tsx` and admin user router | Add distinct move action, warning, confirmation, and result. |
| Transfer entry | New tenant/admin transfer route following existing page routing | Select source/target users, supported resources, and start preview. |
| Preview dialog/page | New transfer UI component(s) | Show included/excluded/kill/block/conflict/unsupported counts and records. |
| Operation monitor | New transfer operation surface | Show operation state, item progress, event/error summary, and audit-safe details. |
| Resume/conflict actions | Operation monitor | “ดำเนินการต่อ”, resolve/skip conflict, retry retryable item, cancel. |

#### Component Map

| Component | Ownership | Consumes |
|---|---|---|
| `WorkspaceIdentityBadge` | Authenticated shell | server-authenticated workspace tenant; branding tenant only for context. |
| `TenantMoveDialog` | Admin user management | target tenant list, warning, mutation state, audit outcome. |
| `TransferResourceSelector` | Transfer page | source/target user selection and allowlisted handler registry/preview API. |
| `TransferPreviewPanel` | Transfer flow | immutable preview fingerprint, categorized item rows, counts. |
| `TransferOperationMonitor` | Transfer flow | operation status, progress, item cursor/page, event/error summary. |
| `TransferConflictPanel` | Transfer flow | conflict/permanent/unsupported items and authorized resolution actions. |
| `TransferResumeAction` | Transfer monitor | guarded resume mutation and idempotency outcome. |

#### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeleton/disabled controls with no false completion | Vitest component test and browser wait assertion. |
| empty | Explain no transferable selected/available resources and how to select them | Component test. |
| preview success | Categorized counts and bounded item details; approval enabled only for valid preview | Component/API test. |
| preview error | Inline safe error with retry; no mutation implied | Component/API test. |
| approval pending | Disable duplicate submit and show operation creation state | Idempotency test + component test. |
| running | Progress, current batch, safe last event, cancel action where allowed | Browser/E2E evidence. |
| paused_on_error | Prominent “ดำเนินการต่อ”, reason, completed count, retryable/conflict counts | Browser/E2E evidence. |
| partial success/conflicts | Completed items retained; unresolved rows actionable; no overwrite language | Component/browser test. |
| completed | Summary and links to transferred resources; no claim that excluded financial/history data moved | Browser evidence. |
| disabled/focus/hover/selected | Accessible states and no action while unauthorized/stale | Accessibility/component tests. |

#### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Single-column flow; preview categories stack; tables become cards/scroll region; resume remains visible. | Playwright screenshot/manual review. |
| tablet 768x1024 | Two-column summary where space permits; item list remains readable without horizontal page overflow. | Playwright screenshot. |
| laptop 1024x768 | Preview and monitor panels may be split; actions remain above fold or sticky. | Playwright screenshot. |
| desktop 1440x900 | Dense summary + paginated item table with clear hierarchy and audit details. | Playwright screenshot. |
| small-mobile 360x800 | Extended risk check for confirmation and action buttons. | Playwright/manual review. |
| wide-desktop 1280x800 | Extended check for data-dense item tables and no clipped status/action columns. | Playwright screenshot. |

#### Accessibility Acceptance

- Keyboard path: selector → preview → approval confirmation → monitor → resume/conflict actions in logical order; no pointer-only controls.
- Focus visibility: dialogs trap focus and return focus to the invoking control; disabled actions explain why.
- Labels/semantics: use real headings, buttons, form labels, table headers or card equivalents, live-region updates for async state, and status text not conveyed by color alone.
- Contrast: meet the existing product accessibility baseline for text, warning, error, success, and disabled states.
- Reduced motion: progress/status animation is restrained and honors `prefers-reduced-motion`.

#### Copy Contract

- Tone: calm, explicit, safety-first; never imply that credits, transactions, usage history, passwords, or queued work were transferred.
- Primary languages: Thai and English through existing locale files; Thai action text must include `ดำเนินการต่อ` for resume.
- Required labels: “พื้นที่ทำงานปัจจุบัน”, “ตัวอย่างก่อนโอนย้าย”, “ยืนยันการโอนย้าย”, “ดำเนินการต่อ”, “งานในคิวจะถูกยกเลิก”, “ไม่โอนเครดิต/ประวัติธุรกรรม”, “ขัดแย้ง”, “ไม่รองรับ”, “กำลังดำเนินการ”, “เสร็จสมบูรณ์พร้อมรายการที่ต้องตรวจสอบ”.
- Validation/error copy: distinguish invalid invite, tenant mismatch, stale preview, permission denied, active job blocked, conflict/no overwrite, unsupported handler, and transient pause. Never expose raw provider/database errors.
- Empty/loading/success copy: state what is happening and what will not happen; success must include counts for transferred, skipped/excluded, cancelled queued jobs, conflicts, and unsupported items.
- Localization/fallback notes: add keys to existing `en`/`th` namespaces, preserve safe English fallback when a translation key is missing, and keep server error codes stable for clients.

#### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`: capture route-level evidence at canonical mobile 390x844, tablet 768x1024, and desktop 1440x900; include a mismatched branding/workspace case, preview, approval, paused-on-error, resume, conflict, and System Admin warning. Browser tests must use fixtures and mocked/fake control-plane operations, never real paid providers or destructive production data.

## 10. Verification and rollout

### 10.1 Unit and contract tests

Cover tenant normalization/admission precedence, invite validity, default fallback, public-vs-authenticated resolution, role scope, origin allowlist, PKCE/state/nonce/replay, item state transitions, conflict classification, handler registration, deterministic idempotency keys, queue-state classification, and redaction.

### 10.2 Repository/database integration tests

Cover concurrent signup/idempotency, existing-user migration, System Admin move transaction, credit reset, session revocation, preview immutability, approval creates one canonical job, duplicate item execution, target conflict no-overwrite, ownership/reference constraints, batch checkpoint, failure pause, and resume skipping transferred items.

Run DB tests only with the repository's test database configuration and test secrets. No production `DATABASE_URL`, provider credentials, or `.env` mutation belongs in verification.

### 10.3 Feature 186/control-plane tests

Use fake adapters to prove queued job cancellation/fencing, retained canonical event history, ambiguous provider result review, duplicate transport delivery, stale worker rejection, outbox retry, and transfer job reconciliation. Extend `verify-feature-186.ts` or add a focused sibling only after inspecting its existing output contract.

### 10.4 Browser tests

Add focused component tests and Playwright coverage for workspace identity, System Admin move warning, preview categories, approval guard, operation progress, paused-on-error resume, conflict actions, unauthorized controls, and responsive overflow. Assert that no UI claims transactions/credits/history or active queued work was moved.

### 10.5 Migration and rollout gates

Each wave publishes a manifest with schema version, owned call sites, feature flag, source/target policy, handler versions, queue cancellation policy, backfill report, rollback flag, and evidence links. The reconciler must skip transfer jobs with `operatorReviewRequired = true`, even when `nextRetryAt` is due; only an authorized resume/resolve action may create the next outbox dispatch. Rollout sequence:

1. observe-only tenant mismatch and transfer inventory;
2. run user tenant backfill dry-run and review counts;
3. enable authenticated-tenant reads with compatibility projection;
4. enable signup/OAuth admission;
5. enable System Admin move behind explicit permission;
6. enable transfer preview only;
7. enable approval/execution for a small same-tenant canary;
8. enable resume/reconciliation and monitor conflicts/outbox/lease age;
9. expand by resource handler after evidence passes.

Rollback disables new writes/approvals and returns new auth/transfer requests to the prior safe path while retaining audit and canonical job history. It must not restore a moved user's credits, reopen cancelled queued jobs, delete transferred artifacts, or mutate committed terminal history. A failed transfer is resumed or manually reconciled from the same operation; it is not rerun by creating a replacement job.

## 11. Operational and security safeguards

- Log canonical operation/job ID, item ID, tenant IDs, handler/version, state transition, and safe error code; never log invite secrets, PKCE verifiers, session tokens, credentials, signed URLs, or raw prompts.
- Rate-limit preview, approval, resume, conflict resolution, and System Admin move actions using existing boundaries.
- Bound selection size, preview payload, item error text, event frequency, batch size, and resume attempts.
- Enforce same-tenant transfer in v1 server-side even if a client submits another target.
- Treat storage copy/link and domain projection as durable side effects with settlement markers; reconcile partial writes by operation/item key.
- Keep transfer audit/history long enough for rollback and compliance; apply tenant deletion/export redaction policy without retaining secret material.
- Surface capacity/backpressure truthfully; never create an unbounded transfer queue or consume credits speculatively.

## 12. Suggested implementation file ownership

The implementation ownership is:

```text
apps/web/drizzle/schema.ts                         # conductor-only schema additions
apps/web/drizzle/0306_feature_186_tenant_identity_and_transfer.sql # conductor-only migration
apps/web/server/services/tenantAdmission.ts      # canonical signup resolution
apps/web/server/services/tenantContext.ts         # public/account tenant split
apps/web/server/services/tenantDataTransfer.ts    # operation/handler orchestration
apps/web/server/services/tenantTransferHandlers.ts# registry and resource handlers
apps/web/server/routers.ts                         # auth/login/register projections
apps/web/server/_core/oauth.ts                    # OAuth admission/SSO callback
apps/web/server/_core/index.ts                    # protected route tenant guards
apps/web/server/routers/tenant.ts                 # domain-admin scope fixes
apps/web/server/routers/adminTenants.ts           # System Admin move boundary
apps/web/client/src/contexts/AuthContext.tsx      # account tenant projection
apps/web/client/src/contexts/TenantContext.tsx    # branding/account distinction
apps/web/client/src/layouts/DashboardLayout.tsx   # workspace identity badge
apps/web/client/src/pages/AdminUsers.tsx          # move warning/action
apps/web/client/src/pages/TenantDataTransfer.tsx    # preview/monitor/resume UI
apps/web/client/src/components/tenant-transfer/    # selector, preview, monitor, conflict UI
apps/web/client/src/locales/{en,th}/             # copy contract
apps/web/server/**/__tests__ and client tests     # focused proof
apps/web/tests/e2e/                               # browser evidence
```

No section may silently add a new schema surface in `control-plane/prisma` or Python Alembic models unless inventory proves the transfer data is owned there; any cross-ORM model must be mapped and edited serially by the conductor.
