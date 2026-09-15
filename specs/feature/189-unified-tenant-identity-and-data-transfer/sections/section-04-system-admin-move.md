# Section 04 — System Admin account tenant move

## Scope

Add a dedicated System Admin action that changes only the account's tenant binding. It is separate from Data Transfer and never moves old files/work, credits, transactions, or history.

## Files and boundaries

- Existing admin router/service boundary, with a dedicated `adminTenants.moveUserTenant` procedure rather than generic role/credit update.
- `apps/web/drizzle/schema.ts`/`0316_feature_189_tenant_identity_and_data_transfer.sql` for `tenant_identity_events` (serial schema ownership remains section 01).
- `apps/web/client/src/pages/AdminUsers.tsx` for warning, target selection, typed confirmation, pending/result states.
- Existing session/JTI/device-token revocation service and credit/ledger boundary.

## Guarded operation

Require `role = admin`; reject `domain_admin`, ordinary users, and host-based
privilege. Validate active target tenant, source/current tenant under a locked
user row, confirmation checkbox/typed text, and action idempotency key; reusing
the key with different target/reason returns `IDEMPOTENCY_CONFLICT`.

The move has two phases and must not hold a database transaction across a
control-plane or adapter call:

1. In a short PostgreSQL transaction, persist/reload the action and open the
   user-scoped identity mutation fence; lock the user, validate the
   source/target snapshot, and commit before calling Feature 186.
   Enumerate only verified canonical `pending`, `queued`, and `retry_scheduled`
   jobs, cancel/fence them through Feature 186, and persist every
   `queue_cancelled` result before continuing. Never hold the user lock across
   a control-plane or adapter call.
2. If any verified `leased`, `running`, or `waiting_external` job remains,
   return `ACTIVE_JOB_BLOCKED` and do not change the binding. Otherwise, in a
   second short transaction, re-lock/revalidate the snapshot, re-enumerate jobs,
   and commit `currentTenantId`, an idempotent credit-reset settlement,
   session/refresh/device-token revocation, and immutable
   `tenant_identity_events` together. Close the mutation fence only after this
   transaction commits.

If phase 2 fails after phase 1 partially succeeds, the old binding remains in
force and the same action key resumes from the remaining verified jobs. Never
flush a shared broker queue or infer ownership from a legacy payload/position.
Preserve email, openId, password/OAuth identity, account ID, all old tenant
rows/files, transactions, usage, and canonical job IDs. Repeated requests
return the original durable outcome.

Use this exact warning in the UI: “การย้าย Tenant จะไม่ย้ายรูปภาพ วิดีโอ ไฟล์ งาน หรือข้อมูลเดิมตาม user ไปด้วย ข้อมูลเหล่านั้นยังอยู่ใน Tenant เดิมและจะไม่สามารถเข้าถึงผ่าน Tenant ใหม่ได้ เครดิตจะถูก reset เป็น 0 ทันที งานที่ยังอยู่ในคิวจะถูกยกเลิกและไม่ process ต่อ หากต้องการส่งต่องาน ต้องใช้ Data Transfer แยกต่างหาก”.

## Tests before implementation

- Role/host authorization and concurrent move/idempotency tests.
- Final binding transaction atomically updates tenant/audit, resets credits, and revokes sessions; prior credit transactions remain intact.
- Account identity and old data/file/job preservation; no automatic transfer.
- Session/JTI/device-token revocation and new session reflects new tenant.
- Queueable-job cancellation/fencing is scoped to the affected user, never flushes a shared queue, and a partial cancellation followed by move failure resumes from the remaining canonical jobs.
- Active `leased`/`running`/`waiting_external` job blocks the move with a stable result and no tenant-binding commit.
- UI warning, checkbox/typed confirmation, pending/success/error, and separation from generic credit/role actions.

## Exit criteria

Only System Admin can perform the move, every outcome is durable/audited, credits are zero immediately without rewriting ledger history, and the later same-tenant Data Transfer flow is never triggered implicitly.

## UI/UX Contract

### Target User / JTBD

System Admin needs to move an account tenant binding while understanding that old data/files stay behind and credits reset.

### Existing Pattern Reference

Reuse `AdminUsers.tsx` privileged confirmation and pending/error patterns; section 07 owns the shared UI contract details.

### Surface Inventory

`apps/web/client/src/pages/AdminUsers.tsx` and the dedicated `TenantMoveDialog`.

### Component Map

`TenantMoveDialog` owns target selection, exact warning, checkbox, typed confirmation, mutation state, and result refresh.

### State Matrix

Pending, validation error, permission error, success, and disabled duplicate-submit states are required; browser coverage is in section 07/08.

### Responsive Matrix

The confirmation dialog must remain usable at 390x844, 768x1024, and 1440x900; use section 07's extended viewport checks.

### Accessibility Acceptance

Keyboard focus trap/restore, labelled confirmation controls, visible focus, semantic warning, contrast, and reduced motion are required.

### Copy Contract

Use the exact Thai warning in this section plus English locale equivalent; never imply data/credit transfer.

### Browser Evidence Required

Section 07/08 captures the warning and confirmation flow with fake users at required viewports.
