# Section 03 — Compiler and canonical Job admission

## Objective

Convert an exact Workflow Version and validated run intent into an approved
Feature 195-compatible plan and durable canonical Job references.

## Dependencies and ownership

- Depends on Sections 01–02, workflow definition/compiler/binding contracts,
  Feature 195 orchestration/gateway and Feature 207 economic preflight.
- Owns Spec 209 run-intent normalization, compiler acceptance, Job adapter and
  protected run/invoke mutations.
- Does not own provider submission or a new queue.

## Planned changes

1. Make compiler acceptance durable and server-authoritative. Resolve every
   node to a registered capability/job contract; unresolved nodes return
   setup-required reason codes.
2. Validate graph/schema/binding/cycle/secret/capability snapshot/policy,
   retry/timeout and estimated-cost constraints.
3. Build deterministic PlanRevision or GatewayJobDefinition with exact version
   hash, mode metadata, dependency step IDs and per-step idempotency keys.
4. Register supported workflow Job contracts through the existing
   `jobExecutorRegistry`; missing registration blocks admission.
5. Add protected `workflowStudio.run` and Marketplace `invoke` mutations. Derive
   tenant/actor/version/access from server context, create/replay Section 01
   projection, then submit via `orchestration/gateway.ts` or
   `jobControlPlaneGateway.ts`.
6. Run Feature 207 quote/reserve authorization before paid admission and release
   or void a failed reservation through the existing service.

## Worker execution contract

Every approved plan step must contain a stable `jobType`, `contractVersion`,
input/output contract and capability requirement. Register the corresponding
executor in `defaultJobExecutorRegistry`; the canonical path is outbox → job
envelope → `unifiedJobConsumer.ts` → registered executor → approved
Runner/provider adapter. The executor must use lease-safe reporter/control-plane
methods for progress, output references, retry classification and terminal
events. A plan with no executable registration is setup-required and must not
create an outbox row.

The executor boundary is an approved Runner/provider adapter, and missing
registration must fail closed before creating an outbox row.

## Run API contract

`workflowStudio.run` and Marketplace `invoke` accept the exact definition ID,
version ID/content hash, validated input, run mode, optional checkpoint/scope
selection and idempotency key. The server derives tenant/actor/access,
rechecks readiness/entitlement/economics, and returns `runId`, canonical
`jobRefs`, admission decision/reason codes and the durable status projection.
No client-supplied Job, worker, provider, tenant or cost value is trusted.

## TDD-first verification

- Valid compilation and dependency Job IDs.
- Missing capability/executor, stale snapshot, invalid schema/type/cycle/secret,
  policy/cost/budget denial produces no Job.
- Gateway receives server-derived context and deterministic idempotency.
- An admitted step reaches the registered executor through the canonical
  consumer path; an unregistered step is rejected before durable dispatch.
- Duplicate intent replays; altered version/input with same key fails.
- Reserve failure leaves no Job/orphan reservation.
- Static/import test proves no direct workflow queue/provider call.

## Acceptance

A valid saved version can produce an authoritative JobRef/run projection. Any
unready, unauthorized or unaffordable plan remains non-runnable and cannot
create execution work.

## UI/UX Contract

### Target User / JTBD

Authors and operators need a trustworthy preflight before pressing Run and a
clear explanation when capability, policy, entitlement or budget blocks
admission.

### Surface Inventory

- Existing Workflow Studio Run button and preflight panel.
- Existing Marketplace/Mini App invoke form.
- Existing Worker Jobs monitor link after canonical Job admission.

### Component Map

- Reuse current Workflow Studio shell, Marketplace filters/cards, form fields,
  modal/drawer and Job timeline patterns.
- Add a deterministic preflight checklist, reason-code list and canonical
  Job/run link; no direct provider or queue controls in the browser.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| checking | Disabled submit with labelled progress | Wait or cancel read |
| runnable | Version, capability and cost summary | Run/invoke |
| setup-required | Missing executor/capability reason | Configure or choose another version |
| denied | Authorization/policy/entitlement reason | Fix access or return |
| unaffordable | Quote and budget-safe explanation | Adjust input/budget |
| admitted | Run and canonical Job references | Open run monitor |

### Responsive Matrix

Keep the mockup hierarchy and action placement at 390x844, 768x1024,
1280x800 and 1440x900. On narrow screens the checklist stacks above the
primary action; no preflight reason may be hidden behind an inaccessible
popover.

### Accessibility Acceptance

Announce preflight completion and blocking reasons, preserve focus on the
failed field or reason, label the primary action with its exact operation, and
make disabled/loading states understandable to screen readers.

### Copy Contract

Use “ตรวจสอบก่อน Run”, “พร้อมเริ่ม”, “ต้องตั้งค่าเพิ่ม”, “ไม่มีสิทธิ์ใช้งาน”
and “งบประมาณไม่พอ” as explicit states. “Run สำเร็จ” is forbidden until the
canonical Job has admitted and later reports the corresponding state.

### Browser Evidence Required

Capture Dashboard → Workflow Studio Run and Marketplace invoke flows for each
preflight state at the four responsive sizes, including the no-Job-on-blocked
assertion in network/database evidence.
