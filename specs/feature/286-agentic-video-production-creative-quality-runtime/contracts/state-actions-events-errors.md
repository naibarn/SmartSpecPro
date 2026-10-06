# Spec 286 R1.7 — State, Actions, Events & Errors

Normative companion contract.

# 155. Canonical Production State Machine

## 155.1 Production lifecycle

The production-level state machine SHALL use the following logical states:

```text
DRAFT
PLANNED
READY
EXECUTING
PREVIEW_READY
REVIEWING
REPAIRING
FINAL_RENDERING
FINAL_VERIFYING
APPROVAL_PENDING
APPROVED
DELIVERING
DELIVERED

WAITING_EXTERNAL
PAUSED
CANCEL_PENDING
CANCELLED
FAILED_RECOVERABLE
FAILED_TERMINAL
SUPERSEDED
```

This state is a production projection. Physical execution remains owned by canonical `worker_jobs`,
workflow and Runner authorities.

## 155.2 Required transition rules

| Current | Event | Mandatory guard | Next |
|---|---|---|---|
| `DRAFT` | `PLAN_ACCEPTED` | valid base revision | `PLANNED` |
| `PLANNED` | `PREFLIGHT_PASSED` | rights/policy/capability checks sufficient for intended next step | `READY` |
| `READY` | `EXECUTION_ADMITTED` | canonical job admitted | `EXECUTING` |
| `EXECUTING` | `PREVIEW_AVAILABLE` | preview artifact committed + digest verified | `PREVIEW_READY` |
| `PREVIEW_READY` | `REVIEW_STARTED` | evidence projection current | `REVIEWING` |
| `REVIEWING` | `REPAIR_REQUIRED` | issue ledger current | `REPAIRING` |
| `REPAIRING` | `PATCH_ADMITTED` | revision/candidate fence valid | `EXECUTING` or `PREVIEW_READY` |
| `REVIEWING` | `QUALITY_GATE_PASSED` | mandatory QC/critic gates satisfied | `FINAL_RENDERING` |
| `FINAL_RENDERING` | `FINAL_ARTIFACT_COMMITTED` | artifact commit verified | `FINAL_VERIFYING` |
| `FINAL_VERIFYING` | `FINAL_GATE_PASSED` | final QC + semantic/rights/package gates satisfied | `APPROVAL_PENDING` or `APPROVED` |
| `APPROVAL_PENDING` | `APPROVED_EXACT_HASH` | approval scope/hash current | `APPROVED` |
| `APPROVED` | `DELIVERY_ADMITTED` | finalized delivery package | `DELIVERING` |
| `DELIVERING` | `DELIVERY_RECEIPT_CONFIRMED` | canonical delivery owner confirms | `DELIVERED` |
| any mutable | `EXTERNAL_WAIT` | durable wait reason | `WAITING_EXTERNAL` |
| `WAITING_EXTERNAL` | `RESUME_READY` | wait condition resolved + policy revalidated | prior resumable state |
| any mutable | `PAUSE` | safe checkpoint available or pause declared best-effort | `PAUSED` |
| `PAUSED` | `RESUME` | current policy/revision valid | prior resumable state |
| any cancellable | `CANCEL_REQUESTED` | actor authorized | `CANCEL_PENDING` |
| `CANCEL_PENDING` | `CANCEL_RECONCILED` | child/provider cancellation reconciled | `CANCELLED` |
| any active | `RECOVERABLE_FAILURE` | retry/replan path exists | `FAILED_RECOVERABLE` |
| `FAILED_RECOVERABLE` | `RECOVERY_ADMITTED` | budget/policy/revision valid | prior resumable state |
| any active | `TERMINAL_FAILURE` | no authorized recovery remains | `FAILED_TERMINAL` |

## 155.3 State invariants

- `DELIVERED` requires a finalized package/receipt; an MP4 existing is insufficient.
- `APPROVED` binds to exact digest/scope.
- `CANCELLED` SHALL NOT be asserted while an external provider remains only `cancel requested`
  without reconciliation.
- `FAILED_RECOVERABLE` SHALL preserve reusable valid artifacts.
- `SUPERSEDED` preserves historical traceability.
- no UI may invent a terminal production state independently of canonical server state.
- a state transition SHALL carry idempotency and causation metadata.

---

# 156. Canonical Video-production Action Surface

Spec 286 SHALL define domain actions while reusing the existing capability/action ingress. It does
**not** create another generic API gateway.

## 156.1 Action envelope

```ts
interface VideoProductionActionEnvelopeV1<T = unknown> {
  actionId: string;
  schemaVersion: 'sah.video.action.v1';

  actionType: string;

  tenantId: string;
  projectId: string;
  productionId?: string;

  actorRef: string;

  baseRevisionRef?: string;
  candidateDigest?: string;
  policyEpochRef: string;

  idempotencyKey: string;

  intentMode: 'PREVIEW'|'APPLY';

  payload: T;
}
```

## 156.2 Required action IDs

| Action | Effect | Typical risk | Revision fence |
|---|---|---:|---:|
| `video.production.create` | create production projection | low | no |
| `video.production.plan` | create/update plan proposal | low | yes after creation |
| `video.production.preflight` | read/measure/quote/impact plan | low/read | yes |
| `video.production.preview.render` | produce preview derivative | paid/compute | yes |
| `video.production.review.run` | QC/critic evidence | compute | yes |
| `video.production.repair.propose` | non-mutating repair proposal | low | yes |
| `video.production.repair.apply` | mutate production revision + jobs | material | **yes** |
| `video.production.final.render` | create final candidate | paid/compute | **yes** |
| `video.production.final.verify` | final gates | compute/read | **yes** |
| `video.production.approve` | exact-digest approval binding | privileged | **yes + digest** |
| `video.production.delivery.finalize` | build finalized package | material | **yes + digest** |
| `video.production.deliver` | handoff to canonical delivery/publish owner | privileged/external | **yes + package digest** |
| `video.production.cancel` | request/reconcile cancellation | material | yes |
| `video.production.pause` | safe checkpoint/pause | material | yes |
| `video.production.resume` | resume after revalidation | material | yes |
| `video.production.branch.create` | create scoped branch | low | yes |
| `video.production.branch.merge` | merge semantic revision | material | **yes** |
| `video.production.restore` | create/select restored revision | material | **yes** |
| `video.production.archive.export` | portable authorized archive | external/data | yes |
| `video.production.archive.import` | create/reconcile production from archive | material | yes |

## 156.3 Action result

```ts
interface VideoProductionActionResultV1 {
  actionId: string;
  status:
    | 'ACCEPTED'
    | 'COMPLETED'
    | 'REJECTED'
    | 'NEEDS_APPROVAL'
    | 'NEEDS_USER_INPUT'
    | 'WAITING_EXTERNAL'
    | 'FAILED';

  productionId?: string;
  resultingRevisionRef?: string;

  workerJobRefs: string[];
  artifactRefs: string[];
  receiptRefs: string[];

  error?: VideoProductionErrorV1;
}
```

Every mutating action SHALL re-evaluate server-side authorization and SHALL NOT trust a client-side
catalog result, stale review card or LLM free text as execution authority.

---

# 157. Canonical Video-production Event Envelope

All production events SHALL be representable through one normalized envelope even when emitted by
different underlying owners.

```ts
interface VideoProductionEventV1<T = unknown> {
  eventId: string;
  schemaVersion: 'sah.video.event.v1';
  eventType: string;

  occurredAt: string;

  tenantId: string;
  projectId: string;
  productionId: string;
  productionRevisionRef?: string;

  traceId: string;
  spanId?: string;
  causationId?: string;
  correlationId?: string;

  actorRef?: string;
  stageId?: string;

  workerJobRef?: string;
  executionSessionRef?: string;
  providerExecutionRef?: string;

  artifactRefs: string[];
  receiptRefs: string[];

  payloadSchemaRef: string;
  payload: T;
}
```

Mandatory event families:

```text
production.*
plan.*
stage.*
preview.*
render.*
qc.*
critic.*
issue.*
repair.*
artifact.*
approval.*
delivery.*
provider.*
policy.*
archive.*
```

Event rules:

- event IDs are immutable;
- retry/idempotency MUST prevent duplicate business effects even if event delivery is duplicated;
- events are evidence/projections, not a second job scheduler;
- payload schemas are versioned;
- sensitive content is referenced rather than copied into every event whenever practical;
- tracing metadata SHALL allow causal reconstruction.

---

# 158. Canonical Error Taxonomy & Recovery Semantics

## 158.1 Error contract

```ts
interface VideoProductionErrorV1 {
  code: VideoProductionErrorCodeV1;
  message: string;

  stageId?: string;
  providerRef?: string;

  retryable: boolean;
  replanRecommended: boolean;
  fallbackAllowed: boolean;

  terminal: boolean;

  chargeState:
    | 'NO_CHARGE'
    | 'MAY_HAVE_CHARGE'
    | 'SETTLEMENT_PENDING'
    | 'SETTLED'
    | 'NOT_APPLICABLE';

  requiredAction:
    | 'NONE'
    | 'AUTO_RETRY'
    | 'REPLAN'
    | 'USER_INPUT'
    | 'APPROVAL'
    | 'POLICY_CHANGE'
    | 'RIGHTS_FIX'
    | 'BUDGET_CHANGE'
    | 'OPERATOR'
    | 'WAIT_EXTERNAL';

  evidenceRefs: string[];
}
```

## 158.2 Minimum error codes

```ts
type VideoProductionErrorCodeV1 =
  | 'INPUT_INVALID'
  | 'INPUT_QUARANTINED'
  | 'SOURCE_STALE'
  | 'SOURCE_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CAPABILITY_INCOMPATIBLE'
  | 'RUNTIME_INCOMPATIBLE'
  | 'POLICY_BLOCKED'
  | 'RIGHTS_BLOCKED'
  | 'PRIVACY_BLOCKED'
  | 'SAFETY_BLOCKED'
  | 'BUDGET_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'STALE_REVISION'
  | 'STALE_CANDIDATE'
  | 'STALE_REVIEW_ACTION'
  | 'PROVIDER_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_DEGRADED'
  | 'PROVIDER_QUARANTINED'
  | 'CANCEL_PENDING'
  | 'CANCEL_TOO_LATE'
  | 'RENDER_FAILED'
  | 'ARTIFACT_COMMIT_FAILED'
  | 'ARTIFACT_MISSING'
  | 'QC_FAILED'
  | 'SEMANTIC_FIDELITY_FAILED'
  | 'CREATIVE_REJECTED'
  | 'SEAM_QC_FAILED'
  | 'DELIVERY_PROFILE_STALE'
  | 'DELIVERY_PACKAGE_INVALID'
  | 'DELIVERY_FAILED'
  | 'PARTIAL_SUCCESS'
  | 'EXTERNAL_WAIT'
  | 'UNKNOWN_FAILURE';
```

## 158.3 Recovery matrix

| Class | Retry same request | Fallback | Replan | User/owner action |
|---|---:|---:|---:|---|
| transient provider/network | yes, bounded | when equivalent/policy permits | maybe | no |
| policy/rights/privacy/safety block | **no bypass** | **no** | only to compliant path | often |
| stale revision/candidate/action | no | no | refresh/rebase | maybe |
| QC/creative rejection | no blind retry | capability swap may be valid | **yes** | profile-dependent |
| artifact commit partial failure | idempotent reconcile | no | no | operator only if exhausted |
| budget block | no | no hidden cheaper downgrade | maybe | yes |
| runtime incompatibility | no | eligible runtime allowed | maybe | no |
| cancel pending/too late | reconcile | no duplicate spending | maybe after settlement guard | maybe |

`fallbackAllowed=true` is never sufficient by itself; Section 67 material-difference policy and
current authorization still apply.

---

