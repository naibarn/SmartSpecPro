---
spec_id: 276
numbering_status: VERIFIED_AVAILABLE_ON_SMARTSPECPRO_MAIN_2026-10-04
title: SmartAIHub Runtime Efficiency, Recoverable Context, Capability Selection & Execution Authority Hardening
revision: R1.3-third-12-pass-integrity-replay-hardening
status: G0_READY_ADDITIVE_SPEC_IMPLEMENTATION_REQUIRES_INVENTORY
prepared: 2026-10-04
target_path: specs/feature/276-smartaihub-runtime-efficiency-recoverable-context-execution-authority/spec.md
primary_owner: SmartAIHub Durable Orchestration Kernel / Runtime Efficiency & Correctness Hardening
implementation_boundary: Additive only; reuse existing canonical owners; no replacement of Spec 186, Spec 224, Spec 229, Spec 256, Capability Registry, Artifact/Library/R2, Approval, Billing, Policy, or execution-placement systems
related_specs_verified_on_main: [186, 195, 196, 199, 200, 209, 215, 224, 225, 226, 229, 231, 242, 256]
contextual_related_specs_not_found_on_main_at_audit: [267, 271]
audit_passes: 38
priority:
  durable_execution_authority: P0
  recoverable_artifact_context: P0
  capability_retrieval_ranker_safety: P1
  shared_lightweight_agent_runtime: P2_TELEMETRY_GATED
---

# Spec 276 — SmartAIHub Runtime Efficiency, Recoverable Context, Capability Selection & Execution Authority Hardening

**Revision:** R1.3 — cumulative 38-pass hardening audit (12 prior + 14 second-pass + 12 third-pass)  
**Date:** 2026-10-04  
**Status:** G0-ready additive specification; implementation mutation requires inventory/reconciliation and compatibility gates first  
**Target repository path:** `specs/feature/276-smartaihub-runtime-efficiency-recoverable-context-execution-authority/spec.md`  
**Primary owner:** SmartAIHub Durable Orchestration Kernel / Runtime Efficiency & Correctness Hardening  
**Canonical job authority:** Spec 186 / `worker_jobs` + `worker_job_events`  
**Development lifecycle consumer:** Spec 224  
**Capability-discovery consumer/extension:** Spec 256 + Spec 229  
**Execution placement:** existing Runner / Cloudflare Worker / Sandbox / Container / Desktop placement owners  
**Artifact persistence:** existing Library/R2/local authorized artifact stores  
**License boundary:** Spec 276 defines SmartAIHub-owned contracts and implementation patterns only. It does not authorize linking, vendoring, or copying GPL-licensed OpenHuman implementation code into proprietary SmartAIHub components.

## 0.0 Specification position

Spec 276 is a **cross-cutting hardening and efficiency specification**. It does not introduce a new general orchestrator.

It takes four architectural lessons that are valuable for SmartAIHub and fits them into the existing platform without replacing already-implemented systems:

```text
1. Durable graph + checkpoint + explicit execution authority
2. Tool output → compact preview + recoverable artifact handle
3. Retrieve → rank → decide → expose only relevant capabilities
4. One runtime → many lightweight agents, but only when telemetry proves it is worth doing
```

The first three are immediate platform hardening. The fourth is explicitly **not** permission for a premature runtime rewrite.

### 0.0.1 Existing systems remain authoritative

Spec 276 SHALL preserve the following ownership:

```text
Spec 186
→ canonical jobs, attempts, leases, fencing, lifecycle events, idempotency

Spec 224
→ autonomous software-development lifecycle and Final Verify

Spec 229
→ retrieval broker / semantic retrieval projection

Spec 256
→ Skill-first capability discovery and bounded intent-to-capability projection

Feature 196 / shared Capability Registry
→ canonical capability definition / resolver authority

Library / R2 / domain artifact owners
→ canonical artifact storage and ACL

Approval / Policy / Billing / Identity
→ their existing authority and receipts

Runner / Worker / Cloudflare placement systems
→ physical execution placement
```

Spec 276 may add contracts, adapters, telemetry, and invariants where gaps exist. It MUST NOT create parallel authorities merely for convenience.

### 0.0.2 Why a new Spec 276 instead of editing old specs

Some of the affected systems are already implemented or actively deployed. Retrofitting large new concerns directly into their original specifications would make ownership harder to reason about and would increase implementation drift.

Spec 276 therefore acts as an additive integration layer:

```text
existing implementation
       ↓
G0 inventory
       ↓
reuse where sufficient
extend where incomplete
add only where genuinely missing
```

No DDL, queue, registry, ledger, or artifact store may be introduced before the G0 inventory proves that an existing owner cannot satisfy the requirement.

### 0.0.3 Dependency verification status

The 2026-10-04 audit verified Specs **186, 195, 196, 199, 200, 209, 215, 224, 225, 226, 229, 231, 242 and 256** on the current `SmartSpecPro/main` tree.

Specs **267 and 271 were not found on current main at audit time**. They may remain contextual design references in project history, but Spec 276 SHALL NOT treat them as implementation prerequisites or canonical authorities until their repository path/revision is verified.

This distinction prevents a future implementer from blocking or inventing contracts based on a spec reference that is not present in the implementation source tree.


## 0.1 Problem statement

SmartAIHub already has durable jobs, orchestration, retrieval, capability discovery, external harnesses, artifact storage, and multiple execution placements. The remaining risk is not lack of features; it is **loss of correctness or unnecessary cost at the seams between them**.

The four concrete problems are:

1. a graph/checkpoint can describe where orchestration wants to resume, but external side effects need independent durable evidence before retry/resume is safe;
2. large tool outputs can consume context, latency, and model cost even though only a small portion is relevant;
3. an expanding Skill/MCP/Plugin/Agent catalog cannot be sent wholesale to a reasoning model, but retrieval/ranking errors must not make valid or mandatory capabilities disappear;
4. process-per-agent execution may become unnecessarily expensive at scale, but replacing it prematurely with shared in-process agents could weaken fault and tenant isolation.

Spec 276 closes these seams without changing canonical ownership.

---

## 0.2 Executive decision

SmartAIHub SHALL adopt the useful architectural patterns below without importing the assumptions that make a personal/local-first agent harness different from a multi-tenant SmartAIHub control plane.

The work is intentionally reduced to four concerns:

1. **Durable execution authority** — complete the existing Spec 186/224 correctness path so a graph/checkpoint is never the sole source of execution truth.
2. **Recoverable artifact context** — large tool/runtime outputs become durable or policy-retained artifacts with compact, explicitly partial context views and recoverable handles.
3. **Hierarchical capability retrieval** — retrieve → rank → decide → expose a bounded relevant capability set, while ranking remains advisory and cannot hide mandatory/correctness-critical capabilities.
4. **Shared lightweight agent runtime** — keep as an optimization milestone only; implement after telemetry proves process-per-agent overhead is materially expensive.

Priority is normative:

```text
P0  Durable execution authority closure
P0  Recoverable artifact context
P1  Hierarchical capability retrieval / ranker fallback hardening
P2  Shared lightweight runtime, telemetry-gated
```

Spec 276 SHALL NOT create four new platforms, four new queues, a second capability registry, a second durable graph engine, or a second artifact system.

---


## 0.3 Required outcomes

When Spec 276 is implemented, SmartAIHub SHALL gain the following properties:

```text
A. A restart, timeout, duplicate delivery, or stale checkpoint cannot blindly repeat
   an already-accepted external side effect.

B. Large outputs can be represented compactly in model context without losing the
   ability to recover exact evidence.

C. Capability/tool discovery scales to large catalogs while exact, mandatory, and
   policy-critical capabilities remain available even when a ranker is wrong.

D. Shared agent runtime optimization is adopted only if SmartAIHub measurements
   demonstrate a material advantage and isolation evidence passes.
```

The desired result is higher completion reliability and lower context/runtime cost, not architectural novelty.

# 1. Controlling principle

> **An optimization layer MUST NOT become correctness authority.**

The following are optimization/advisory layers:

```text
shared lightweight runtime
context compaction / summarization
semantic retrieval / ranker / decision model
workflow or agent graph checkpoint
```

Correctness authority remains in:

```text
canonical durable state
server-derived identity / tenant / policy
lease + fencing
idempotency
explicit execution authority
side-effect / provider receipts
raw or reconstructible artifacts
verification evidence
```

Therefore every optimization must have a correctness-preserving fallback:

```text
shared runtime unsafe/unhealthy
→ isolate execution

compact context insufficient
→ fetch/search the raw artifact

ranker uncertain
→ widen candidate set / exact lookup / safe mandatory set

graph checkpoint suspect or stale
→ reconstruct allowed continuation from canonical ledger + receipts
```

No optimization may silently convert uncertainty into authority.

## 1.0.1 Authoritative time and epoch rule

Wall-clock time from a Runner, browser, container, external harness, or provider response SHALL NOT independently decide lease validity, authority expiry, retry eligibility, approval expiry, or checkpoint freshness.

Canonical decisions SHALL use the authoritative control-plane/database time contract owned by Spec 186/195 or an equivalent server-authoritative source. Local monotonic clocks MAY be used only for bounded elapsed-time measurement inside one process.

The effective model SHALL distinguish:

```text
event/provider observed time
server received time
canonical committed time
lease / authority epoch
```

Clock skew or a provider timestamp in the future MUST NOT extend authority or resurrect an expired lease.

## 1.0.2 Region/process ownership rule

A region, process, queue consumer, Agent Host, or Cloudflare runtime is an executor/transport location, not durable execution authority.

Cross-region failover or host migration MUST preserve:

```text
canonical worker_job identity
attempt identity
lease/fencing epoch
side-effect intent
provider operation reference
artifact/evidence references
authority/policy snapshot
```

A stale region/process that reconnects after failover MUST be unable to settle state as current.

## 1.1 System invariants

The following invariants apply across all Spec 276 work packages:

1. **Effectively-once, not magical exactly-once.** SmartAIHub assumes at-least-once delivery and achieves effectively-once business effects through durable intent, idempotency, provider reconciliation, fencing and receipts.
2. **Authority is server-issued and epoch-bound.** Prompt text, graph state, Skill content, tool descriptions, model output and client state cannot create or widen execution authority.
3. **Approval binds to exact scope.** If target, input digest, capability implementation, provider egress, price ceiling, rights/policy epoch or material execution scope changes, approval MUST be revalidated or invalidated according to the canonical owner.
4. **A side effect has a commit point.** Cancellation before commit and cancellation after external acceptance are not equivalent states.
5. **Evidence is immutable-by-reference.** Verification must resolve the exact content digest/revision that produced the decision, not a mutable “latest” object.
6. **Retrieval absence is not canonical absence.** A missing Vectorize/AI Search/ranker hit cannot prove a capability does not exist.
7. **Caches are projections.** Cache content may accelerate execution but cannot become ACL, authority, billing or lifecycle truth.
8. **Resume is version-aware.** A run may resume only when its graph/runtime/capability contract revisions remain compatible or an explicit migration/reconciliation path exists.
9. **Shared runtime never weakens tenant isolation.** Resource efficiency cannot justify credential, memory, workspace, cache or policy cross-contamination.
10. **Safety-critical observability is durable.** Events needed to prove authority, effect, settlement, cancellation, reconciliation or Final Verify cannot be sampled away.

---

# 2. Ownership and non-duplication

| Concern | Canonical owner | Spec 276 responsibility |
|---|---|---|
| canonical job lifecycle | Spec 186 / `worker_jobs` + events | stricter execution-receipt and authority invariants |
| development lifecycle | Spec 224 | consume the hardened authority/artifact/capability paths |
| graph/workflow logical state | Spec 209/215/224 as applicable | checkpoint is a resumability projection, not side-effect truth |
| capability registry/resolver | existing Feature 196/shared registry | retrieval/ranking fallback contract only |
| Skill-first discovery | Spec 256 | candidate-set safety/confidence rules |
| semantic retrieval | Spec 229 / Vectorize projection | bounded candidate generation; never authorization |
| artifacts / Library / R2 | existing artifact owners | recoverable context-reference contract |
| approval/policy/billing | existing shared services | bind their receipts/snapshots into authority checks |
| execution placement | existing Runner/Cloudflare/local placement owners | optional shared-runtime placement class only |
| external harnesses | Spec 200 and provider adapters | no transport replacement |

Normative rule:

> If G0 finds an existing canonical schema that can carry a field or receipt, extend/reuse that owner. Do not create a parallel database table merely because the logical contract below uses a new type name.

---

# 3. P0 — Durable execution authority closure

## 3.1 Why this is P0

Spec 224 already relies on canonical `worker_jobs` / `worker_job_events`, fencing and idempotency. Its current code-alignment snapshot also explicitly identifies the absence of a production side-effect ledger as a remaining gap.

The objective is not another workflow engine. The objective is that SmartAIHub can always answer:

```text
What was authorized?
Who/what authorized it?
Which attempt/lease executed it?
Was an external side effect accepted?
What immutable receipt proves that?
Can this step be retried?
If retried, how is duplicate effect prevented?
What continuation is now legal?
```

## 3.2 Execution authority envelope

Every side-effecting dispatch SHALL be bound to a server-created authority envelope or equivalent canonical fields.

Logical contract:

```ts
interface ExecutionAuthorityV1 {
  schemaVersion: 'sah.execution-authority.v1';
  workerJobId: string;
  runRef?: string;
  stageRef?: string;
  stepRef?: string;

  tenantId: string;
  actorRef: string;
  policySnapshotRef: string;
  approvalReceiptRefs: string[];
  budgetReservationRef?: string;

  attemptId: string;
  leaseId: string;
  fencingToken: string;
  idempotencyKey: string;

  capabilityRef?: string;
  implementationOfferRef?: string;
  inputDigest: string;
  authorityScopeDigest: string;

  issuedAt: string;
  expiresAt?: string;
}
```

A client, LLM, Skill, graph node or external harness cannot mint or widen this authority.

### 3.2.0.1 Execution provenance and reproducibility envelope

For evidence-producing or side-effecting execution, SmartAIHub SHALL record enough provenance to explain **what actually ran**, even when exact deterministic replay is impossible.

The canonical owner SHOULD be able to correlate, where applicable:

```text
runtime package/image digest
executor/runtime version
tool/adapter version
Skill release digest
MCP server identity + negotiated contract/version
provider + provider account ref
model identifier/version actually returned/observed
routing profile/version
request/input digest
generation/config parameters safe to persist
seed when supported and semantically meaningful
source/workspace revision
environment/compatibility profile
```

Model aliases such as `latest`, display names, or mutable remote tool names are insufficient as historical provenance when the provider exposes a more specific observed identifier.

This contract is for **traceability and reproducibility evidence**, not a promise that nondeterministic LLM/provider output can be regenerated byte-for-byte.

A verification result based on a particular toolchain/runtime revision MUST NOT later be represented as evidence for a materially different runtime merely because the capability display name is unchanged.

### 3.2.1 Authority versioning, delegation and revocation

The concrete owner may reuse existing fields, but the effective authority state MUST be able to represent:

```text
authority_id / authority_ref
authority_epoch
parent_authority_ref?
policy_epoch / policy_snapshot_ref
approval_epoch / approval_receipt_refs
budget_reservation_ref?
capability contract revision
implementation offer revision
tenant / actor / project scope
resource/input digests
effect classes
issued_at / expires_at
revoked_at?
revocation_reason?
```

A delegated sub-agent receives a **narrower or equal** scope. Delegation MUST NOT widen:

- tenant/project/resource access;
- effect classes;
- provider egress;
- budget;
- credential scope;
- publication/release authority.

At dispatch time, authority MUST be revalidated against current revocation, lease/fencing and policy state. A long-running provider operation that was already accepted externally may be impossible to revoke retroactively; in that case the receipt records the accepted effect and revocation prevents subsequent dependent effects.

### 3.2.1.1 Nested delegation and revocation cascade

Nested agents/subruns SHALL form an auditable authority lineage. Each child authority MUST reference its parent and MUST be narrower than or equal to the cumulative parent scope.

For fan-out:

```text
parent authority
├─ child A
├─ child B
└─ child C
```

the platform MUST enforce cumulative parent budget/effect ceilings rather than allowing every child to independently consume the full parent allowance.

Parent revocation, tenant/project access loss, or a policy epoch that invalidates the parent SHALL prevent new child dispatch. Effects already accepted externally remain historical facts and are reconciled normally.

A fan-in/join step cannot derive broader authority from the union of children. Any broader next effect requires a newly validated authority envelope.

### 3.2.2 Approval binding and TOCTOU protection

Approval/consent is valid only for the scope it approved. The binding SHOULD include digests/revisions sufficient to detect material changes such as:

```text
target resource revision
input artifact digest
selected capability / offer revision
external egress destination/class
price/spend ceiling
rights/policy snapshot
publication destination
```

If those materially change between approval and dispatch, execution MUST re-preflight rather than reusing stale approval.

### 3.2.3 Protected reads, secret access and external egress

Correctness/safety authority is not limited to writes.

A read-only capability that can access protected tenant data, secrets, private repository content, personal data, or data that may be sent to an external model/provider SHALL still pass the canonical authorization and egress policy boundary.

Such reads do not require a business side-effect receipt merely because they are reads, but policy MAY require an immutable access/audit record.

The following are never treated as harmless metadata reads:

```text
secret retrieval
private artifact fetch
cross-tenant search
private repository checkout
data export
sending artifact content to an external summarizer/model
```

An LLM/tool description cannot downgrade a protected read to avoid authorization.

## 3.3 Side-effect / execution receipt

A side-effecting executor SHALL settle a durable receipt before the orchestrator treats the effect as completed.

Logical contract:

```ts
interface ExecutionReceiptV1 {
  schemaVersion: 'sah.execution-receipt.v1';
  receiptId: string;

  workerJobId: string;
  attemptId: string;
  leaseId: string;
  fencingToken: string;
  idempotencyKey: string;

  effectClass: string;
  capabilityRef?: string;
  providerOperationRef?: string;

  inputDigest: string;
  outputDigest?: string;
  artifactRefs: string[];

  outcome:
    | 'ACCEPTED_EXTERNAL'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'UNKNOWN_REQUIRES_RECONCILIATION';

  observedAt: string;
  providerEvidenceDigest?: string;
  billingSettlementRef?: string;
  auditEventRef: string;
}
```

The receipt MAY project into existing job-event/output structures if they already provide equivalent durability and uniqueness.

### 3.3.1 Write-ahead side-effect intent

A post-effect receipt alone is insufficient because the process can crash after an external effect occurs but before the receipt is persisted.

Before any non-read-only external/business effect, SmartAIHub SHALL durably record a **side-effect intent** (or equivalent canonical event/state) that binds:

```ts
interface SideEffectIntentV1 {
  schemaVersion: 'sah.side-effect-intent.v1';
  intentId: string;
  workerJobId: string;
  runRef?: string;
  stageRef?: string;
  stepRef?: string;

  attemptId: string;
  leaseId: string;
  fencingToken: string;
  idempotencyKey: string;

  effectClass: string;
  targetRef?: string;
  capabilityRef?: string;
  implementationOfferRef?: string;

  inputDigest: string;
  authorityScopeDigest: string;

  providerIdempotencyMode:
    | 'NATIVE_KEY'
    | 'LOOKUP_BY_CLIENT_REFERENCE'
    | 'SMARTAIHUB_RECONCILABLE'
    | 'NON_RECONCILABLE';

  state:
    | 'PREPARED'
    | 'DISPATCHING'
    | 'ACCEPTED_EXTERNAL'
    | 'COMPLETED'
    | 'FAILED'
    | 'UNKNOWN_REQUIRES_RECONCILIATION';

  createdAt: string;
  updatedAt: string;
}
```

The actual persistence model may be an existing `worker_job_event`, provider-operation table or settlement record if it satisfies the same invariants.

Required ordering:

```text
validate authority
→ persist PREPARED side-effect intent
→ dispatch effect using stable idempotency/client reference when supported
→ persist provider operation reference/acceptance evidence as soon as known
→ settle ExecutionReceipt
→ advance orchestration checkpoint
```

### 3.3.2 Provider idempotency capability classes

Provider adapters SHALL declare whether they support:

- native idempotency keys;
- lookup by caller/client reference;
- durable provider operation IDs;
- cancellation after acceptance;
- deterministic reconciliation;
- none of the above.

For a **NON_RECONCILABLE** provider/effect, automatic retry after dispatch ambiguity is forbidden for irreversible/high-risk effects. The run MUST enter an explicit reconciliation/human-decision state unless owner policy provides another safe proof.

### 3.3.2.1 Callback/webhook boundary

Some providers are polled; others may also emit callbacks/webhooks. A callback is an **observation/signal**, never independent authority to mutate canonical business state.

Provider callback handling SHALL include, where supported:

```text
provider authenticity/signature verification
event ID / replay deduplication
provider operation reference correlation
tenant/account/provider binding validation
raw-event digest or immutable evidence reference
received-at canonical timestamp
out-of-order/stale-event detection
```

The callback handler SHALL resolve the canonical job/provider operation and apply the same fencing, idempotency and settlement rules as polling/reconciliation.

A late callback from an older attempt MUST NOT overwrite a newer attempt. A duplicate callback MUST converge without duplicate charge, artifact publication or next-step dispatch.

When callback and polling disagree, the canonical provider reconciliation policy decides; "last event wins" is not sufficient.

### 3.3.2.2 Economic settlement and credit idempotency

Provider execution and economic settlement are related but distinct durable facts.

Every billable effect SHALL be correlatable to:

```text
worker job
logical business effect / idempotency key
provider operation
attempt
reservation/quote if used
actual provider usage when available
canonical billing/credit settlement
```

Retries, duplicate callbacks, or reconciliation MUST NOT double-charge.

An ambiguous provider outcome SHALL NOT be silently finalized economically. The billing owner SHALL represent the effect as pending/reconciling (using its canonical vocabulary) until the business effect is known sufficiently to settle, release, adjust, or refund the reservation.

Late usage/cost information MAY adjust economic settlement through the canonical billing ledger but MUST NOT rewrite execution history.

### 3.3.3 Cancellation and compensation

Cancellation semantics SHALL distinguish:

```text
BEFORE_DISPATCH
→ no effect was submitted

DISPATCHING_UNKNOWN
→ reconcile before retry or declaring cancelled

ACCEPTED_EXTERNAL
→ cancellation may be BEST_EFFORT or NOT_SUPPORTED

COMPLETED
→ cancellation cannot erase history
```

A compensating action is a **new explicitly authorized effect**, with its own idempotency key, authority, receipt and audit trail. Compensation MUST NOT rewrite the original receipt as if the first effect never happened.

## 3.4 At-least-once invariants

Duplicate delivery is expected. Replaying the same logical step MUST converge on the same business effect.

A retry MUST NOT:

- charge twice;
- submit a second provider generation for the same accepted operation;
- publish duplicate artifacts;
- send duplicate outbound notifications/messages;
- create duplicate PRs/releases;
- repeat an irreversible domain mutation.

When execution status is ambiguous after timeout:

```text
timeout
→ reconcile by idempotency/provider operation ref
→ confirm completed / pending / failed
→ only then decide whether a new attempt is legal
```

"Timeout" SHALL NOT be interpreted as "safe to repeat".

### 3.4.0.1 Batch and partial-success semantics

A batch effect SHALL NOT rely on one coarse receipt when individual items can succeed independently.

Where the provider/API exposes per-item outcomes, the system MUST support item-level or deterministic partition-level identity:

```text
batch logical effect
├─ item/partition A → completed
├─ item/partition B → failed
└─ item/partition C → accepted/pending
```

Retry SHALL target only unresolved/failed items unless the provider guarantees whole-batch idempotency.

Aggregate state MUST preserve partial completion rather than converting it to generic failure and replaying successful items.

Compensation, billing settlement, artifacts and verification evidence SHALL bind to the corresponding item/partition where material.

### 3.4.0.2 Multi-region failover and stale-writer fencing

If dispatch/reconciliation can run from more than one region or host class, only the holder of the current canonical lease/fencing epoch may settle current-attempt state.

Failover MUST NOT create a second logical provider operation merely because the original region became unreachable.

The recovery order is:

```text
read canonical side-effect intent
→ inspect persisted provider/client reference
→ reconcile external state
→ acquire current lease/fence
→ settle/continue
```

Region-local memory, Durable Object/local actor state, queue visibility, or container lifetime cannot supersede PostgreSQL/control-plane truth.

### 3.4.1 Mandatory crash/restart matrix

Integration/chaos tests SHALL inject a crash or lease loss at each boundary:

```text
A. before side-effect intent persistence
B. after PREPARED intent, before network/provider call
C. after provider call sent, before response observed
D. after provider accepted effect, before provider ref persisted
E. after provider ref persisted, before ExecutionReceipt settled
F. after receipt settled, before graph checkpoint advances
G. after checkpoint advances, before next-step dispatch
H. concurrent cancel / lease expiry / retry race
```

For every boundary, the expected recovery action MUST be deterministic: retry safely, reconcile, continue without replay, cancel, or pause. “Run the tool again and see” is not an acceptable recovery rule.

## 3.5 Checkpoint rule

A graph checkpoint answers:

> "Where may orchestration resume?"

It does **not** independently answer:

> "Which external effects already happened?"

Legal resume is determined from:

```text
canonical job lifecycle
+ current attempt/lease/fencing state
+ execution receipts
+ policy/approval/budget state
+ checkpoint
```

If checkpoint and durable effect evidence disagree, fail closed into reconciliation; never re-execute based only on the checkpoint.

### 3.5.0.1 Contract/schema evolution for in-flight work

All persisted Spec 276 logical contracts SHALL be schema-versioned and decoded through an explicit compatibility/migration registry.

This applies to:

```text
ExecutionAuthority
SideEffectIntent
ExecutionReceipt
ArtifactContextRef
candidate/retrieval snapshot
checkpoint/evidence manifest
```

A deployment MUST NOT silently reinterpret an old field, enum value, digest algorithm, or effect class.

For a non-final run, an upgrade must do one of:

```text
READ_OLD_WRITE_OLD_UNTIL_COMPLETE
READ_OLD_MIGRATE_EXPLICITLY
READ_OLD_WRITE_NEW_WITH_PROVEN_COMPATIBILITY
PAUSE_INCOMPATIBLE_RUN
```

Unsupported versions fail closed into an operator-visible migration state; they are not treated as empty/default values.

### 3.5.1 Version-aware checkpoint contract

A resumable checkpoint MUST bind enough immutable/versioned context to detect incompatible resume, including where applicable:

```text
graph/workflow definition digest
orchestration/runtime contract version
phase/state-machine version
capability catalog generation
selected capability contract/offer revision
policy/authority epoch
source/base revision
input artifact digests
relevant execution receipt refs
```

After deploy/upgrade, a run SHALL either:

1. resume under a compatible pinned contract;
2. migrate through a deterministic owner-approved migration;
3. re-plan/re-preflight explicitly; or
4. pause as incompatible.

It MUST NOT silently resume a stale checkpoint against materially changed tool schemas or execution semantics.

## 3.5.2 Historical replay is not live re-execution

SmartAIHub SHALL distinguish at least these concepts:

```text
RECONSTRUCT
→ rebuild state/view from durable events/receipts without calling external effects

SIMULATE / DRY_RUN
→ evaluate control flow using side-effect-free or explicitly mocked execution

REEXECUTE
→ create a new authorized attempt/effect under current policy
```

An operator/debugger asking to "replay" history MUST default to a non-side-effecting reconstruction unless the product surface explicitly requests a new authorized execution.

Historical event replay SHALL NOT:

- call a provider again;
- charge credits again;
- republish artifacts;
- resend notifications/webhooks;
- re-run mutating tools;
- reinterpret historical events using a newer permissive policy.

A new live execution MUST receive a new attempt/effect identity while retaining lineage to the historical run.

## 3.6 Completion rule

No graph node, harness response, or process exit can mark a side-effecting step complete until required receipt settlement succeeds.

Spec 224 Final Verify SHALL consume receipt/evidence references where the phase contains side effects or external provider operations.

---

# 4. P0 — Recoverable Artifact Context

## 4.1 Objective

Large tool results SHALL stop being treated as disposable prompt text.

SmartAIHub SHALL represent sufficiently large, expensive or reusable output as:

```text
raw/reconstructible artifact
        +
bounded preview
        +
opaque recoverable handle
        +
provenance / trust / retention metadata
```

This applies to outputs such as:

- build/test/typecheck logs;
- Git diff/status/history;
- repository search;
- MCP responses;
- browser/DOM captures;
- web/research results where storage rights permit;
- SQL/query results;
- large JSON/API responses;
- media analysis output;
- external-harness transcripts or evidence;
- generated reports/datasets.

## 4.2 Artifact context reference

Logical contract:

```ts
interface ArtifactContextRefV1 {
  schemaVersion: 'sah.artifact-context-ref.v1';
  artifactRef: string;
  contentDigest: string;
  producerJobRef: string;
  producerAttemptRef?: string;

  mediaType: string;
  byteLength: number;
  estimatedTokens?: number;

  storageClass:
    | 'R2'
    | 'LIBRARY'
    | 'LOCAL_RUNNER'
    | 'EPHEMERAL_ENCRYPTED'
    | 'RECONSTRUCTIBLE';

  trustClass:
    | 'SYSTEM'
    | 'TRUSTED_TOOL'
    | 'REMOTE_UNTRUSTED'
    | 'USER_CONTENT';

  preview: {
    partial: true;
    strategy: string;
    text: string;
    omittedBytes?: number;
    omittedSections?: number;
  };

  searchable: boolean;
  rangeReadable: boolean;
  expiresAt?: string;
  retentionPolicyRef: string;
  accessScopeDigest: string;
}
```

The handle itself is not authorization. Access is re-evaluated server-side.

### 4.2.0.1 Evidence manifest and chain of custody

High-value verification evidence SHOULD be collected through one immutable logical evidence manifest rather than relying on a loose list of UI links.

Logical shape:

```ts
interface EvidenceManifestV1 {
  schemaVersion: 'sah.evidence-manifest.v1';
  manifestRef: string;
  workerJobId?: string;
  runRef?: string;
  authorityDigest?: string;
  sideEffectIntentRefs: string[];
  executionReceiptRefs: string[];
  artifactSnapshots: Array<{
    artifactRef: string;
    contentDigest: string;
    snapshotRevision?: string;
  }>;
  previewStrategyVersions: string[];
  createdAt: string;
  manifestDigest: string;
}
```

The concrete owner may use existing evidence bundle structures if equivalent.

Final Verify SHALL validate the referenced immutable digests/revisions, not trust a mutable URL or previously rendered preview.

For high-risk/release evidence, infrastructure policy MAY additionally sign/anchor the manifest digest. Signature infrastructure is not mandated by Spec 276 when the existing append-only/audit store is sufficient.

### 4.2.0.2 Atomic artifact publication

Recoverable artifact context SHALL NOT expose a canonical artifact reference before the referenced bytes are durably available and digest-verifiable.

Recommended lifecycle:

```text
STAGING
→ bytes uploaded/written
→ checksum/digest verified
→ canonical metadata/ref committed
→ AVAILABLE
```

If metadata commits but bytes are absent/corrupt, the artifact is `BROKEN/CORRUPT`, not valid evidence.

If bytes are uploaded but canonical metadata fails to commit, the object is an orphan eligible for bounded reaping after the owner-defined safety window.

A canonical reference MUST NOT point to an object that may still be overwritten under the same immutable revision.

### 4.2.0.3 Corruption / bit-rot detection

For `RUN_EVIDENCE` and stronger evidence classes, retrieval/verification SHALL be able to validate the expected content digest.

Digest mismatch, truncated bytes, or storage corruption produces:

```text
ARTIFACT_INTEGRITY_FAILURE
```

and invalidates the affected verification evidence until the exact bytes are recovered or regenerated through an authorized path.

The system MUST NOT silently regenerate evidence with different bytes and retain the old digest/reference.

### 4.2.1 Immutable snapshot and preview provenance

A recoverable reference used for verification MUST resolve to an immutable snapshot/version or to content whose exact bytes can be reconstructed and digest-verified.

The canonical implementation SHOULD additionally record, where applicable:

```text
source_artifact_ref
source_revision
snapshot_ref
content_digest
preview_digest
preview_strategy_version
preview_generator_model_ref?
redaction_policy_version
created_at
retention_class
pin_until?
```

If a mutable Library item changes later, an old Final Verify evidence reference MUST still identify the historical bytes/revision used by that run.

### 4.2.2 Evidence durability classes

At minimum distinguish:

```text
EPHEMERAL_CONTEXT
→ can expire quickly; not required to prove final correctness

RUN_EVIDENCE
→ retained/pinned through run completion and configured post-run evidence window

AUDIT_REQUIRED
→ retained according to canonical audit/compliance policy

LOCAL_ONLY
→ recoverable only while a specific authorized Runner/device is available
```

A Final Verify requirement cannot depend solely on an `EPHEMERAL_CONTEXT` artifact that may disappear before verification.

For privacy-restricted/local-only evidence, the system MUST make the limitation explicit. If upload/pinning to R2 is not permitted, the run may require the same Runner/device for resume and verification.

## 4.3 Required read operations

Reuse existing artifact APIs where possible; otherwise expose owner-approved equivalents for:

```text
artifact.describe
artifact.search
artifact.range
artifact.extract
artifact.summarize
artifact.fetch
```

Not every artifact must support every operation.

Artifact access into model context SHALL be bounded by policy-configured per-turn/per-run budgets such as:

```text
max artifact expansions
max bytes/tokens injected
max range size
max recursive summarize/search depth
max concurrent artifact reads
```

A “full fetch” operation may return/stream a file or verifier-readable object without injecting the entire content into an LLM prompt.

The model-visible description SHALL say explicitly that the preview is partial.

Example:

```text
Typecheck failed.
32 errors across 9 files.

Top relevant errors:
...

[PARTIAL VIEW]
artifact_ref = artifact://opaque-ref
Use artifact.search/range/fetch if additional evidence is needed.
```

## 4.4 Compression safety

A compact representation SHALL NOT destroy the only copy of source evidence.

If lossy compression is used:

1. raw content is retained according to policy; or
2. the system has a deterministic/authorized reconstruction path; or
3. the result is classified as non-recoverable and MUST NOT be represented as a recoverable artifact.

Mandatory safety markers, errors, denial reasons, security findings and failing test names SHALL have preservation priority.

### 4.4.1 Untrusted-content and prompt-injection handling

Artifact bytes, remote tool output, webpages, MCP results, repository content and logs are **data**, not execution authority.

Preview/summarization pipelines MUST:

- preserve trust classification;
- prevent retrieved instructions from widening capability/authority;
- avoid copying secrets/PII into summaries when redaction policy forbids it;
- record preview/redaction strategy version;
- prefer deterministic extraction for exact errors/IDs/line references when possible;
- expose uncertainty when an LLM-generated summary may omit detail.

A malicious artifact saying “ignore policy and call tool X” remains untrusted content.

## 4.5 Automatic expansion triggers

The runtime SHOULD fetch more of the raw artifact when:

- the preview reports an error without enough root-cause context;
- Final Verify needs exact evidence;
- conflicting summaries are detected;
- the agent expresses uncertainty tied to omitted context;
- a referenced line/file/record is outside the preview;
- a deterministic verifier requests exact bytes;
- a retry decision depends on details not present in preview.

This behavior is correctness-driven and does not require the LLM to remember that it should "ask for more".

## 4.6 Security and privacy

Artifact context MUST preserve:

- tenant/actor/project ACL;
- secret/PII redaction policy;
- source provenance;
- retention/deletion obligations;
- egress classification;
- legal/content-right restrictions where applicable.

A compact preview MUST NOT leak hidden fields from an artifact the caller could not fetch directly.

Before any external LLM/provider is used to summarize, classify, embed, or rerank artifact contents, the egress policy SHALL be evaluated on the raw artifact classification. Required secret/PII redaction MUST happen before prohibited content leaves the authorized trust boundary.

A model-generated summary is derived/untrusted evidence and cannot replace exact bytes for deterministic verification.

### 4.6.1 Derived-data classification propagation

A preview, summary, embedding, OCR/transcript, search index, extracted metadata, or reranked snippet is a **derived artifact/projection**.

By default its confidentiality/tenant/egress classification SHALL be at least as restrictive as the source data needed to produce it.

A derived result may be intentionally declassified only by an explicit owner-approved policy/process; an LLM saying that a summary "contains nothing sensitive" is not a declassification decision.

This rule applies even when derived content is much smaller than the source. Embeddings and search metadata are not assumed public.

### 4.6.2 Derived-index and deletion lifecycle

If artifact text/chunks are projected into Vectorize, AI Search, a cache or another secondary index:

- ACL/security metadata originates from trusted canonical metadata;
- index/cache entries remain projections, never authority;
- deletion/tombstone/retention changes propagate to derivatives;
- stale index hits are re-authorized before exposure;
- secrets intentionally excluded from search MUST NOT be reintroduced by preview/index generation;
- index generation/revision is observable for freshness debugging.

### 4.6.3 Retention, deletion and legal-hold precedence

Artifact lifecycle SHALL distinguish:

```text
normal retention expiry
user/account deletion
security/compliance deletion
active execution evidence pin
legal/regulatory hold where applicable
```

The existing policy/compliance owner determines precedence; Spec 276 does not invent a separate legal-hold system.

Rules:

- active mandatory verification evidence cannot silently disappear mid-run;
- a deletion request that legally/policy-wise overrides retention SHALL fail/alter the affected run explicitly rather than leaving stale verification marked valid;
- a legal/compliance hold, where applicable, prevents physical purge but does not grant broader read access;
- after deletion, minimal tombstone/digest metadata MAY remain only when permitted/required for audit and must not contain recoverable deleted content;
- derived Vectorize/AI Search/cache projections follow the authoritative deletion/hold decision.

### 4.6.4 Handle and content-addressing safety

An `artifactRef` is an opaque SmartAIHub reference. Clients/agents MUST NOT be allowed to substitute arbitrary filesystem paths, `file://` references, provider URLs, or arbitrary HTTP URLs into the canonical artifact fetch API.

Download/delivery URLs, if needed, are derived only after server authorization and SHOULD be short-lived.

Content-addressed deduplication MUST NOT leak cross-tenant existence through raw hashes or timing. Cross-tenant physical deduplication, if ever used, is a storage-owner concern and MUST preserve tenant-isolated references, authorization and deletion semantics.

### 4.6.5 Local Runner evidence availability

For `LOCAL_RUNNER` / `LOCAL_ONLY` artifacts, the reference MUST identify the runner/device generation or equivalent availability scope.

If that device is offline on resume:

```text
critical evidence already pinned elsewhere
→ continue using pinned evidence

evidence local-only but recreatable
→ recreate only if side-effect/cost/policy permits

evidence local-only and non-recreatable
→ pause with explicit evidence-unavailable state
```

The runtime MUST NOT fabricate or silently substitute a different artifact.

### 4.6.6 Artifact/evidence GC and orphan protection

Artifact cleanup/reaping MUST be driven by canonical lifecycle and retention state.

The reaper SHALL NOT delete:

- evidence pinned by a non-final run;
- artifacts referenced by unresolved side-effect reconciliation;
- artifacts under an applicable legal/compliance hold;
- the only recoverable bytes required to verify a completed high-risk effect during its required retention window.

Orphaned previews/index projections may be deleted only after their canonical source/ref lifecycle is resolved.

### 4.6.7 Cache and index coherence

Caches and derived search indexes are advisory projections.

Every cached preview/search result/candidate set used by a correctness-sensitive path SHOULD carry enough source generation information to detect staleness, for example:

```text
source artifact digest/revision
ACL/policy epoch
catalog/index generation
projection builder version
created_at / expires_at
```

Security-sensitive cache entries MUST NOT use stale-while-revalidate behavior when ACL/policy revocation could expose data.

Negative cache entries such as "no capability", "artifact missing", or "no evidence" MUST be bounded and invalidated by relevant generation changes.

If an artifact search index is stale relative to the immutable source digest, Final Verify MUST use exact source access or explicitly rebuild/reconcile the index before treating search absence as proof.

## 4.7 Context-budget telemetry

Record at minimum:

```text
raw_bytes
raw_estimated_tokens
preview_bytes
preview_estimated_tokens
retrieval_count
retrieved_bytes
full_fetch_count
compression/preview strategy
model call associated with retrieval
final outcome
```

This data SHALL be used to tune thresholds rather than copying ananother project's constants.

---

# 5. P1 — Hierarchical Capability Retrieval & Ranker Safety

## 5.1 Existing baseline

Spec 256 already defines Skill-first retrieval, candidate ranking, bounded metadata disclosure and provider-aware fallback.

Spec 276 adds one missing global invariant:

> **The ranker/decision model is an advisor over candidates, not the authority that determines what capabilities exist or what the caller is authorized to execute.**

### 5.1.1 Capability selection is distinct from RAG evidence ranking

Spec 229 may rerank **knowledge evidence** for grounded answers. Spec 276 hardens **executable capability/tool candidate selection**.

These may share retrieval infrastructure, embeddings or rerankers, but they are different security domains:

```text
RAG evidence rank
→ decides which authorized evidence is useful

Capability rank
→ proposes which already-visible executable capability may be relevant
```

Neither ranking result is an authorization grant.

## 5.2 Canonical pipeline

Target pipeline:

```text
user/task intent
   ↓
server-derived context + policy scope
   ↓
capability-family/domain retrieval
   ↓
semantic/exact candidate generation
   ↓
candidate eligibility filtering
   ↓
ranker / decision model
   ↓
bounded candidate set exposed to reasoning model
   ↓
reasoning model chooses/proposes
   ↓
canonical resolver + authority preflight
   ↓
execution
```

The reasoning model SHOULD NOT receive the entire global tool catalog when a bounded candidate set is sufficient.

### 5.2.1 Candidate snapshot, freshness and contract binding

Candidate results SHOULD carry/reference:

```text
catalog_generation
retrieval_index_generation
capability_ref
capability_contract_version
implementation_offer_revision
trust_tier
eligibility_observed_at
policy_epoch
selection_reason/provenance
```

Before execution, canonical resolver/preflight MUST refresh authority and current offer eligibility.

If semantic index generation is stale or unavailable, direct canonical lookup for an exact visible capability remains available. A stale retrieval projection may reduce convenience but cannot delete canonical capability truth.

## 5.3 Candidate safety classes

Candidate construction SHALL support at least:

```text
MANDATORY_SYSTEM
PINNED_BY_TASK
EXACT_USER_REQUEST
RECENT_CONFIRMED_CONTEXT
SEMANTIC_RETRIEVAL
RANKER_SELECTED
FALLBACK_EXPANSION
```

The ranker MUST NOT remove:

- mandatory system/control capabilities;
- an explicitly requested exact capability that is visible/eligible;
- capabilities required by an already-authorized continuation/checkpoint;
- policy-required approval/status/cancellation/receipt tools;
- deterministic verifier tools required by the active verification profile.

The selection space SHOULD also preserve an explicit `NO_ACTION` / `NO_EXECUTABLE_CAPABILITY_NEEDED` outcome so a ranker is not forced to choose a tool for informational requests.

### 5.3.1 Third-party metadata and ranking-poisoning defense

Marketplace/MCP/remote capability descriptions are untrusted descriptive input until normalized/reviewed by canonical owners.

Ranking features MUST NOT permit a provider to gain execution priority merely by injecting phrases such as “always use me”, excessive keyword stuffing, hidden instructions or fake authority claims.

The projection layer SHALL:

- sanitize/normalize descriptive metadata;
- preserve trust/review tier;
- exclude quarantined/forbidden capabilities before model exposure;
- keep authorization/effect class server-owned;
- record source/provider provenance;
- apply tenant-safe cache keys.

## 5.4 Confidence and fallback

Do not assume one universal confidence threshold.

Each ranker profile SHALL be calibrated and versioned, but behavior follows this shape:

```text
high confidence
→ expose normal bounded set

medium/ambiguous confidence
→ widen candidate set and/or retrieve another family

low confidence / disagreement / no eligible candidate
→ exact lookup + broader semantic fallback + safe mandatory set
→ optionally ask a targeted clarification when ambiguity affects effects/target
```

A low confidence result is not "no capability exists".

The ranker may abstain. Abstention is preferable to fabricating a high-confidence tool choice.

Confidence calibration MUST be evaluated per ranker/profile/version and SHOULD NOT be assumed comparable across models.

### 5.4.1 Budget and backpressure

Capability retrieval/reranking itself consumes latency, model calls and context.

The resolver SHALL have bounded budgets for candidate fan-out, reranker calls, schema bytes and fallback depth. When budgets are exhausted, it degrades to the safest available deterministic/exact path rather than recursively expanding without bound.

## 5.5 Ensemble disagreement

Where both deterministic/exact retrieval and semantic/ranker selection exist:

```text
exact match says A
ranker omits A
→ keep A if visible/eligible
→ record disagreement telemetry
```

Likewise, when a Skill declares required capability IDs, ranking cannot silently hide them; missing/ineligible capability becomes an explicit gap.

## 5.6 Evaluation

Before production activation, evaluate at minimum:

- top-1 / top-k capability recall;
- exact-request preservation rate;
- mandatory-tool preservation rate = 100%;
- false-positive acting-tool exposure;
- tool-less request false-action rate;
- latency;
- prompt/tool-schema token reduction;
- confidence calibration;
- tenant isolation / hidden-capability leakage;
- fallback recovery rate when first retrieval misses;
- stale-index exact-lookup recovery;
- `NO_ACTION` precision/recall;
- malicious/keyword-stuffed capability-description resistance;
- trust-tier/quarantine preservation;
- schema/candidate token budget and fallback-depth behavior.

No ranker model is production-authoritative merely because an offline benchmark is high.

---

# 5.7 Capability/tool supply-chain integrity

Capability selection safety is incomplete if the selected capability name stays the same while its executable implementation changes.

Before executing a trusted/privileged capability, SmartAIHub SHOULD resolve an owner-qualified implementation identity sufficient for the risk class, such as:

```text
package/image digest
adapter build/version
Skill release digest
MCP server identity/transport endpoint + negotiated protocol
remote tool manifest revision
qualification/conformance receipt
provider model/account identity where observable
```

For local packages/images/plugins, mutable tags such as `latest` SHALL NOT be the production provenance anchor.

For remote MCP/Agent/tool servers whose implementation bytes cannot be pinned, the system SHALL treat them as remote mutable dependencies and bind execution to a qualified server identity/configuration/manifest revision where possible. Material capability-schema change requires requalification/re-preflight rather than silent reuse of an old trusted classification.

Revoked/quarantined tool releases MUST stop receiving new privileged execution even if they remain referenced by an old catalog cache.

# 6. P2 — Shared Lightweight Agent Runtime (Telemetry-Gated)

## 6.1 Decision

SmartAIHub SHALL **not** start a large shared-runtime rewrite merely because another harness demonstrates good in-process density.

The platform SHALL first collect placement/runtime telemetry.

Possible future shape:

```text
Agent Host Runtime
├─ shared provider clients
├─ shared capability metadata cache
├─ shared MCP/Skill descriptors where safe
├─ shared telemetry/exporters
├─ AgentContext A
├─ AgentContext B
└─ AgentContext N
```

Each AgentContext remains logically isolated by:

- tenant/actor/project;
- provider credential scope;
- working directory/workspace;
- memory/context namespace;
- tool/capability visibility;
- budget;
- cancellation;
- run/attempt identifiers.

### 6.1.1 Eligible host classes

A shared lightweight runtime is intended only for host classes that can safely maintain resident state and enforce isolation, such as a supervised Desktop/Worker App process, dedicated long-lived Runner, or appropriately isolated Container host.

Spec 276 SHALL NOT assume a normal request-scoped Cloudflare Worker isolate is a resident multi-agent host. Workers may remain control-plane/API/routing surfaces while Sandbox/Container/device/external harness placements execute resident or untrusted workloads.

## 6.2 Isolation escape hatch

Shared runtime MUST never mean "everything must run in one process".

Placement resolver may promote work to:

```text
isolated process
Cloudflare Sandbox
Cloudflare Container
dedicated Worker App/Runner
GPU host
external harness
```

for untrusted code, high memory/CPU, privileged capabilities, tenant hard isolation, incompatible runtimes, GPU/device requirements or fault containment.

### 6.2.1 Mandatory in-process isolation contract

Before colocating agents, the host MUST enforce or prove equivalent controls for:

```text
per-context identity and tenant binding
per-context cancellation
bounded task/concurrency count
CPU/time budget
memory pressure accounting
FD/socket/process/thread limits where applicable
workspace/filesystem boundary
network/egress policy
capability visibility
secret-broker scope
artifact ACL
run/attempt/fencing identity
```

**Decrypted secrets MUST NOT be stored in a cross-agent shared cache.** Shared provider/client pools may reuse transport connections only when credential/tenant boundaries remain correct.

### 6.2.2 Shared-cache keying

Any shared cache that can affect agent behavior MUST include enough scope/versioning to prevent cross-tenant or stale-policy reuse, for example as applicable:

```text
environment
tenant/security scope
actor/project visibility class
capability/catalog generation
policy epoch
provider/account binding
content digest
```

Sensitive caches SHOULD be request/context scoped when safe global keying cannot be proven.

### 6.2.3 Fairness and noisy-neighbor control

Shared runtime admission SHALL preserve the capacity/fairness rules owned by Spec 195/186.

One tenant/agent MUST NOT monopolize:

```text
event-loop/task slots
CPU
memory
file descriptors
network concurrency
provider client pools
artifact/context cache
```

CPU-heavy, blocking, untrusted, or leak-prone work SHALL be promoted to an isolated process/container/Runner rather than threatening the supervisor.

Per-agent cancellation MUST not tear down unrelated contexts unless the host itself is unsafe.

### 6.2.4 Deadline, cancellation and reservation cleanup

Shared or isolated execution SHALL distinguish:

```text
soft deadline
→ request cooperative cancellation / graceful checkpoint

hard deadline
→ fence current authority/lease and escalate executor termination where owner policy permits

provider accepted externally
→ do not pretend process kill cancelled the external effect; reconcile provider state
```

Cancellation/timeout SHALL release or reconcile leaked runtime capacity reservations, temporary credentials, provider slots, workspace locks and other owner-managed resources.

A killed/stuck executor MUST NOT retain authority merely because its OS process/container remains alive.

Resource-release/reaper operations are idempotent and auditable; they do not rewrite historical execution outcome.

### 6.2.5 Supervisor, leak and blast-radius controls

A shared host requires:

- supervisor/watchdog;
- health/admission control;
- memory/FD/thread growth telemetry;
- per-agent timeout/cancellation;
- host drain on upgrade or unhealthy state;
- bounded graceful shutdown;
- isolation fallback for subsequent attempts;
- fault injection proving one agent cannot corrupt another agent's durable state.

An in-process panic/OOM may still kill the host; durable recovery MUST therefore assume host loss is possible.

## 6.2.6 Cross-layer work amplification budget

One user request can amplify into:

```text
retrieval queries
artifact expansions
ranker calls
sub-agents
provider reconciliations
verification passes
fallback attempts
```

Each individually bounded subsystem can still create an unbounded total workload.

Spec 276 therefore requires a request/run-level amplification budget or equivalent owner-composed limits covering at least:

- maximum concurrent child/sub-agent work;
- artifact expansion bytes/tokens;
- retrieval/rerank calls;
- provider reconciliation attempts;
- fallback/retry fan-out;
- verification/review loop budget.

The budget is not a replacement for Spec 195 capacity/billing controls. It is a cross-layer guard against accidental multiplicative work.

Exhaustion SHALL degrade/pause explicitly rather than silently dropping mandatory correctness checks.

## 6.3 Telemetry gate

Before implementing a production shared runtime, capture:

```text
process cold-start latency
settled RSS / process
peak RSS / turn
CPU idle cost
FD/thread growth
concurrent logical agents / host
process churn
OOM/restart rate
container density / cost
provider-client connection duplication
cache duplication
p50/p95 turn setup overhead
```

A shared-runtime milestone is justified when measured data shows material benefit.

Exact thresholds SHALL be chosen from SmartAIHub telemetry, not copied from OpenHuman benchmarks.

## 6.4 Pilot before platform conversion

If the gate is met:

1. pilot on one host class;
2. keep process-isolated fallback;
3. run fault-injection tests where one agent crashes, loops, leaks memory or exhausts budget;
4. verify another tenant/agent is unaffected at the policy/state level;
5. compare density and reliability against process-isolated baseline;
6. expand only after SLO and isolation evidence pass.

### 6.4.1 Placement and data-residency constraints

Placement optimization MUST respect:

- tenant data-region/residency policy;
- provider egress restrictions;
- artifact locality;
- credential availability;
- GPU/device affinity;
- untrusted-code isolation requirement;
- latency/cost profile;
- runtime/architecture compatibility.

The placement resolver may optimize only among **eligible** targets. Lower cost or higher density cannot override security/residency constraints.

---


# 6.5 Implementation work packages

To avoid a broad rewrite, implementation SHALL be decomposed into bounded work packages.

## WP276-0 — Inventory and contract map

Produce an implementation-grounded matrix:

| Area | Existing implementation | Decision |
|---|---|---|
| job/attempt/lease/fencing | exact current fields/services | REUSE / EXTEND |
| provider operation settlement | exact current references | REUSE / EXTEND / MISSING |
| side-effect receipt evidence | exact current implementation | REUSE / EXTEND / MISSING |
| artifact storage/ref | exact Library/R2/local contracts | REUSE / EXTEND |
| context trimming/large-output handling | exact current behavior | REUSE / REPLACE-ADAPTER |
| capability candidate retrieval | exact Spec 256/229 implementation | REUSE / EXTEND |
| ranker confidence/fallback | exact current implementation | REUSE / EXTEND / MISSING |
| per-host runtime telemetry | exact observability source | REUSE / EXTEND |

No schema mutation is permitted in WP276-0.

## WP276-1 — Execution receipt closure

Deliver the smallest extension that closes the side-effect evidence/reconciliation gap, including write-ahead side-effect intent, provider idempotency classification, cancellation semantics and the mandatory crash/restart matrix.

## WP276-2 — Recoverable Artifact Context

Deliver shared artifact-reference semantics and initial adapters for build/test, repository search, and one MCP/external-agent output path. Include immutable snapshot/digest binding, evidence durability class, preview provenance/redaction version, local-runner availability semantics and derived-index deletion propagation.

## WP276-3 — Capability ranker safety

Add mandatory/exact candidate preservation, `NO_ACTION`, candidate/catalog generations, trust/poisoning defenses, confidence/disagreement telemetry, bounded widening fallback and exact canonical recovery to the existing Spec 256/229 path.

## WP276-4 — Integrated UAT

Run restart/retry/context/retrieval scenarios against real SmartAIHub task flows.

## WP276-5 — Shared runtime decision

Issue a measured GO / NO-GO record. A NO-GO is acceptable and completes this work package when isolation/process execution remains economically adequate.

---

# 7. Rollout plan

## 7.0 Feature flags, shadow mode and rollback

Activation MUST be independently controllable. Suggested logical flags (exact names map to existing configuration conventions during G0):

```text
spec276.execution_intent_receipt.shadow
spec276.execution_intent_receipt.enforce
spec276.artifact_context.enabled
spec276.artifact_context.preview_only
spec276.capability_ranker_safety.shadow
spec276.capability_ranker_safety.enforce
spec276.shared_runtime.pilot
```

Rollout rules:

1. **Shadow before enforcement** where existing paths can safely emit comparison telemetry.
2. Existing in-flight jobs created under older contract versions MUST either continue under their original compatible semantics or pass an explicit migration gate; do not reinterpret history.
3. Receipt/artifact data written under Spec 276 must remain readable if enforcement is rolled back.
4. Ranker rollback returns to existing canonical exact/semantic resolver behavior, not to an empty tool set.
5. Shared-runtime rollback drains the host and routes new attempts to isolated placements.
6. No rollback deletes canonical receipts/evidence needed to explain prior effects.

## G0 — Inventory / no mutation

Confirm existing owners and exact schemas for:

- Spec 186 job attempt/lease/fencing/idempotency/event fields;
- Spec 224 DevelopmentRun projections and Final Verify evidence;
- provider-operation settlement;
- billing settlement;
- artifact/Library/R2 references;
- Spec 229 retrieval interfaces;
- Spec 256 candidate/ranking implementation;
- Task Control result/attachment presentation;
- existing output-size/context trimming behavior;
- capability/index generation and freshness semantics;
- current cancellation/compensation behavior;
- provider idempotency/reconciliation support matrix;
- current feature-flag/config owner;
- artifact retention/deletion/index-derivative lifecycle;
- runtime placement/data-residency policy;
- existing telemetry/log redaction rules.

Deliverable: gap matrix of **reuse / extend / missing**. No DDL until this is complete.

## G1 — Durable authority closure

Implement only missing receipt/settlement/reconciliation pieces.

Required tests:

- duplicate delivery after accepted side effect;
- timeout after provider accepted request;
- stale lease/fencing token;
- restart at every boundary in the Section 3.4.1 crash matrix;
- cancel/lease-expiry/retry race;
- provider with native idempotency;
- provider with lookup-by-client-reference;
- non-reconcilable provider ambiguity;
- approval/policy revocation immediately before dispatch;
- duplicate notification/artifact/charge prevention;
- checkpoint/effect disagreement;
- Final Verify consumption of settled evidence.

## G2 — Recoverable artifact context

Introduce the shared logical contract and adapters for at least:

1. build/test output;
2. repository/search output;
3. one MCP or external-agent output.

Required proof:

- compact context significantly smaller than raw;
- full evidence remains retrievable;
- ACL/tenant isolation holds;
- deterministic verifier can request exact bytes;
- expired/unavailable artifact produces explicit failure, never fabricated content;
- mutable source changes do not alter historical evidence digest;
- local-only evidence loss produces the correct pause/recreate decision;
- preview prompt injection cannot create authority;
- deletion/retention propagates to derived search/cache projections.

## G3 — Capability retrieval hardening

Extend Spec 256 implementation with:

- mandatory candidate classes;
- exact-request preservation;
- confidence/disagreement telemetry;
- fallback widening;
- evaluation corpus;
- catalog/index generation and staleness tests;
- `NO_ACTION` evaluation;
- malicious capability-description/keyword-stuffing tests;
- bounded fallback/candidate/token budgets.

Do not change canonical capability authorization.

## G3.5 — Compatibility, DR and restore proof

Before production enforcement of new receipt/artifact contracts:

- verify old/in-flight contract decoding or explicit migration;
- restore a representative non-final run from canonical database backup plus artifact/evidence storage;
- prove restored intent/receipt/artifact digests still correlate;
- prove stale pre-failover workers cannot settle after restore/failover;
- verify unresolved ambiguous effects remain quarantined after restore;
- verify retention/legal-hold decisions remain intact.

Exact RPO/RTO and backup topology remain owned by infrastructure/Spec 224/195 policy.

## G3.6 — Evidence completeness profile

A Final Verify evidence manifest SHALL be evaluated against an explicit **required evidence profile**, not merely checked for non-empty artifacts.

The profile MAY be owned by Spec 224/verification policy and SHOULD identify:

```text
required evidence classes
minimum test/check families
required side-effect receipts
required source/runtime provenance
allowed waivers/exceptions
freshness/revision constraints
```

A missing mandatory item is `INCOMPLETE`, not PASS.

A waiver requires an authorized, durable reason/receipt and remains visible in the final evidence bundle.

## G4 — Cross-cutting UAT

Run real development tasks covering:

```text
large repository search
large build failure
tool selection among many capabilities
external provider wait/reconcile
restart/resume
Final Verify
```

Measure token/context savings, miss recovery, duplicate-effect prevention, ambiguous-effect reconciliation, stale-index recovery, artifact exactness, cross-tenant isolation, rollback behavior and total completion rate.

## G4.5 — SLO, error-budget and degraded-mode gate

Production activation SHALL define owner-approved service objectives for the new hardening path, including at minimum applicable measures for:

```text
authority/receipt persistence success
artifact recoverability/integrity
reconciliation age
capability-selection fallback success
added latency
added model/storage cost
```

Feature rollout SHALL have automatic/operator-visible rollback criteria.

Examples of rollback/degrade triggers:

- receipt or side-effect-intent persistence failure above budget;
- artifact integrity/retrieval failures;
- mandatory/exact capability preservation regression;
- cross-tenant/cache leakage;
- reconciliation backlog/age beyond safe threshold;
- excessive latency/cost amplification.

Degraded mode MUST be explicit to users/operators when it affects correctness or completeness:

```text
PARTIAL_CONTEXT
RETRIEVAL_DEGRADED
EVIDENCE_INCOMPLETE
RECONCILIATION_PENDING
ISOLATED_FALLBACK
```

The UI/API MUST NOT render these states as normal completed success.

## G5 — Shared-runtime decision

Only after G0-G4 telemetry exists, issue a GO / NO-GO decision for a shared lightweight runtime pilot.

NO-GO is a valid successful outcome if process isolation remains affordable and simpler.

---

# 8. Failure-mode requirements

## 8.1 Artifact store unavailable

```text
cannot persist required recoverable evidence
→ do not pretend compaction is recoverable
→ either keep bounded raw context safely, retry persistence, or pause/fail according to task criticality
```

## 8.2 Ranker unavailable

```text
ranker unavailable
→ deterministic/exact + semantic fallback
→ safe mandatory set remains present
```

## 8.3 Vectorize/retrieval unavailable

```text
semantic projection unavailable
→ exact/catalog fallback where possible
→ never infer "capability does not exist" solely from retrieval outage
```

## 8.4 Graph/checkpoint unavailable or stale

```text
checkpoint unavailable/stale
→ reconstruct safe continuation from canonical job/events + receipts
→ if ambiguous, reconcile/pause
→ never replay irreversible effects speculatively
```

## 8.5 Shared runtime unhealthy

```text
host pressure / isolation concern / agent fault
→ reject new colocated work
→ cancel or drain affected context where safe
→ dispatch future attempt to isolated placement
```

## 8.6 Provider effect ambiguous and non-reconcilable

```text
effect dispatched
+ no reliable idempotency/lookup/provider operation proof
→ mark UNKNOWN_REQUIRES_RECONCILIATION
→ forbid automatic irreversible retry
→ escalate according to owner policy
```

## 8.7 Authority or approval revoked

```text
revoked before dispatch
→ deny dispatch

revoked after external acceptance
→ preserve receipt
→ stop unauthorized downstream effects
→ attempt provider cancellation only if supported and authorized
```

## 8.8 Artifact digest/snapshot mismatch

```text
resolved bytes digest != referenced digest
→ reject as evidence
→ refetch/reconstruct trusted snapshot
→ if impossible, pause verification
```

## 8.9 Local-only artifact unavailable

```text
critical evidence exists only on unavailable device
→ do not replace silently
→ use pinned copy if one exists
→ otherwise recreate only when safe/authorized
→ else pause
```

## 8.10 Catalog/index generation stale

```text
ranked projection stale
→ re-authorize/re-resolve canonical capability
→ exact canonical lookup for explicit ID
→ never execute solely from stale projection
```

## 8.11 Retrieval/artifact expansion budget exhausted

```text
budget exhausted
→ stop recursive expansion
→ preserve mandatory verifier/control tools
→ use deterministic/exact fallback or explicit bounded pause
```

## 8.12 Shared-cache scope mismatch

```text
cache scope/version mismatch
→ treat as cache miss
→ never reuse across incompatible tenant/policy/provider epochs
```

---


## 8.13 Clock skew / expired authority disagreement

If local/provider time disagrees with authoritative control-plane time:

```text
use canonical server/database time for authority/lease decision
→ record skew telemetry
→ reject stale/expired dispatch
```

No client/Runner clock may extend an expiry.

## 8.14 Duplicate/out-of-order callback

Authenticate and deduplicate the callback, correlate the provider operation, then reconcile against canonical current attempt/fence.

A late callback may add historical evidence but cannot roll current state backward.

## 8.15 Economic settlement ambiguous

Keep economic settlement in the canonical billing owner's pending/reconciliation state. Do not double-charge, auto-refund blindly, or infer provider cost solely from execution timeout.

## 8.16 Retention/delete conflicts with active evidence

Evaluate canonical retention/deletion/legal-hold policy. If mandatory evidence must be deleted, explicitly invalidate/pause/fail the affected verification path according to owner policy rather than continuing with a stale green status.

## 8.17 Unsupported persisted schema version

Quarantine/pause the affected in-flight run and invoke the explicit migration/compatibility path. Never deserialize an unknown contract into permissive defaults.

## 8.18 Reconciliation storm

Back off, respect provider/account circuit breakers, and move aged ambiguity to operator-visible quarantine. Infinite polling/retry is forbidden.



## 8.19 Idempotency key reused with different input

Return/record `IDEMPOTENCY_CONFLICT`; execute nothing until the caller creates or resolves the correct logical effect identity.

## 8.20 Artifact metadata/bytes commit split

Mark the reference unavailable/broken, reconcile staging metadata/object state, and prevent it from satisfying Final Verify. Orphan bytes are reaped only after the safe window.

## 8.21 Artifact digest mismatch

Quarantine the corrupt evidence path, emit integrity telemetry, and recover exact historical bytes if possible. Never silently substitute different bytes under the old evidence identity.

## 8.22 Historical replay requests live side effects

Default to reconstruction/dry-run. A true re-execution requires a new normal authority/attempt and explicit effect lineage.

## 8.23 Capability implementation changed behind stable name

Invalidate/requalify the affected offer/trust profile according to risk. Do not rely on display name or stale catalog cache as executable provenance.

## 8.24 Stale security-sensitive cache

Bypass/invalidate cache and re-evaluate canonical ACL/policy. Security revocation is not allowed to wait for stale-while-revalidate expiry.

## 8.25 Work amplification budget exhausted

Stop optional expansion/fallback first, preserve mandatory correctness work where budget policy allows, otherwise pause explicitly as budget/resource blocked. Never silently skip required Final Verify evidence.

## 8.26 Evidence profile incomplete

Final status remains non-success until mandatory evidence appears or an authorized waiver is durably recorded.


# 9. Observability

Add cross-cutting correlation sufficient to join:

```text
conversation/request
→ intent/capability candidate set
→ selected capability
→ worker job
→ run/stage/step
→ attempt/lease/fencing
→ tool/provider call
→ artifact context refs
→ execution receipt
→ Final Verify evidence
```

Required metrics include:

### Correctness
- duplicate-effect prevented;
- ambiguous provider settlement count;
- stale-fence rejection;
- checkpoint/receipt disagreement;
- unreconciled side-effect age.

### Context
- raw vs preview tokens;
- retrieval expansion rate;
- full-fetch rate;
- Final Verify expansion rate;
- context-related task failure.

### Capability selection
- exact-request preservation;
- top-k recall;
- fallback expansion rate;
- ranker disagreement;
- no-tool false action rate.

### Runtime efficiency
- RSS/CPU/thread/FD per host;
- agents/host;
- cold-start and setup time;
- process/container churn;
- isolation fallback rate.

### Reproducibility / provenance
- runtime/tool/adapter/Skill/MCP implementation revision coverage;
- mutable alias resolved-to-observed version rate;
- provenance missing/incomplete count;
- historical replay vs live re-execution count.

### Idempotency / causal integrity
- `IDEMPOTENCY_CONFLICT` count;
- canonical digest/serialization version distribution;
- stale projection/event rejection;
- ambiguous concurrent observation reconciliation.

### Artifact integrity / coherence
- staged→available commit failures;
- orphan artifact count/age;
- digest mismatch/corruption count;
- stale index/cache generation detections;
- exact-source fallback due stale index.

### Distributed correctness / lifecycle
- callback replay/out-of-order rejection;
- control-plane clock skew observations;
- stale-region/failover fence rejection;
- unresolved side-effect intent age;
- operator reconciliation count/outcome;
- contract migration/quarantine count;
- evidence digest mismatch / restore verification failures.

### Economic correctness
- reservation-to-settlement latency;
- duplicate-charge prevented;
- pending economic reconciliation age;
- late provider usage adjustment count;
- compensation/refund correlation failures.

### Classification / supply chain
- derived-data classification propagation failures;
- revoked/quarantined tool execution attempts rejected;
- implementation qualification age;
- capability schema drift requiring requalification.

### Amplification / deadlines
- request/run work amplification utilization;
- child/sub-agent fan-out;
- artifact expansion budget utilization;
- soft/hard deadline count;
- leaked reservation/credential/workspace cleanup latency.

### Ranker lifecycle
- ranker/profile version distribution;
- shadow-vs-enforced disagreement;
- exact/mandatory regression by version;
- calibration drift;
- rollback events.

### Cost/backpressure
- receipt/reconciliation operations per effect;
- artifact storage bytes and retained-evidence days;
- artifact expansion bytes/tokens per run;
- capability retrieval/rerank calls and candidate schema bytes;
- shared-runtime cost per completed task versus isolated baseline;
- throttled/rejected work due to resource budget.

### Telemetry privacy and cardinality

Observability MUST NOT become a new data-leak path.

- Prefer IDs/digests/reason codes over raw prompt/artifact/secret content.
- Apply existing log redaction and tenant visibility rules.
- Do not place API keys, decrypted credentials or unrestricted artifact bodies in metrics/traces.
- High-cardinality refs may live in traces/events; aggregate metrics SHOULD use bounded labels.
- Trace/correlation access follows existing tenant/admin/audit authorization.

Lifecycle correctness events SHALL NOT be sampled away.

---

# 10. Acceptance criteria

## A. Durable authority
- [ ] Every tested side-effecting path has a canonical idempotency boundary.
- [ ] Accepted external operations can be reconciled without blind resubmission.
- [ ] Stale lease/fencing attempts cannot settle effects as current.
- [ ] Required execution receipts/equivalent durable evidence survive restart.
- [ ] Graph checkpoint cannot independently authorize replay.
- [ ] Final Verify can reference effect/provider/artifact evidence.
- [ ] Side-effect intent is durable before tested non-read-only dispatches.
- [ ] Crash matrix A-H has deterministic recovery evidence.
- [ ] Provider idempotency/reconciliation capability is known per tested adapter.
- [ ] Cancellation before dispatch vs after acceptance is represented correctly.
- [ ] Approval/authority revocation prevents unauthorized downstream effects.
- [ ] Compensation is represented as a separate authorized effect.

- [ ] Callback/webhook duplicate and out-of-order delivery cannot regress or duplicate current execution.
- [ ] Authoritative time/epoch rules reject stale/expired dispatch despite local clock skew.
- [ ] Nested delegation cannot exceed cumulative parent scope/budget and parent revocation fences new child dispatch.
- [ ] Batch partial-success retry does not replay successful items.
- [ ] Economic settlement is idempotently correlated to the logical business effect/provider operation.
- [ ] Old/in-flight contract versions either decode compatibly, migrate explicitly, or pause fail-closed.
- [ ] Multi-region/host failover cannot create a second effect solely because the prior executor is unreachable.
- [ ] Ambiguous effects have bounded reconciliation and operator-visible quarantine.

- [ ] Execution provenance records the actually observed runtime/tool/model/adapter identity where available.
- [ ] Same idempotency key with materially different canonical input/scope fails as `IDEMPOTENCY_CONFLICT`.
- [ ] Digest algorithms and structured canonicalization are versioned.
- [ ] Historical replay cannot trigger live side effects without a new authority/attempt.
- [ ] Stale/out-of-order projections cannot regress canonical current state.

## B. Recoverable context
- [ ] Large outputs can be represented by an explicitly partial preview + opaque artifact ref.
- [ ] Raw/reconstructible evidence remains available according to policy.
- [ ] Agent/verifier can search or range-read without loading the entire artifact.
- [ ] Access is re-authorized; a leaked handle is insufficient.
- [ ] Retention/expiry is explicit and test-covered.
- [ ] Context saving is measured on real SmartAIHub workloads.
- [ ] Historical evidence resolves by immutable digest/revision even after mutable source changes.
- [ ] Preview provenance/redaction strategy is versioned.
- [ ] Prompt injection in artifact content cannot create execution authority.
- [ ] Derived index/cache deletion and ACL reauthorization are test-covered.
- [ ] Local-only evidence unavailability has explicit resume semantics.
- [ ] Artifact expansion is bounded by resource/context budgets.

- [ ] Evidence manifests/digests correlate receipt → artifact snapshot → Final Verify for high-value paths.
- [ ] Retention/deletion/legal-hold precedence is tested without granting extra read access.
- [ ] Artifact APIs reject arbitrary URL/path substitution and reauthorize delivery.
- [ ] External summarization/embedding/reranking obeys artifact egress/redaction policy before data leaves the trust boundary.
- [ ] GC cannot delete evidence required by a non-final or unresolved reconciliation path.

- [ ] Artifact publication is staged/verified before canonical availability.
- [ ] High-value evidence detects digest mismatch/corruption and fails verification closed.
- [ ] Derived previews/summaries/embeddings/indexes inherit source security classification unless explicitly declassified.
- [ ] Security-sensitive caches cannot serve stale revoked ACL/policy.
- [ ] Stale search index cannot make absence count as exact evidence.
- [ ] Required evidence profile is complete or has an authorized durable waiver before PASS.

## C. Capability retrieval
- [ ] Mandatory/system/exact-request candidates cannot be removed by ranker error.
- [ ] Low-confidence/missed retrieval has a widening fallback.
- [ ] Authorization is re-evaluated after selection.
- [ ] Evaluation covers recall, safety, latency, token reduction and tenant leakage.
- [ ] Ranker outage does not disable core safe operations.
- [ ] `NO_ACTION` can win for non-execution requests.
- [ ] Stale semantic index cannot hide an explicitly requested canonical capability.
- [ ] Candidate generation records catalog/index generation and selection provenance.
- [ ] Quarantined/untrusted capability metadata cannot self-promote through prompt/keyword injection.
- [ ] Candidate/schema/fallback budgets prevent unbounded retrieval recursion.

- [ ] Ranker/profile changes are versioned, shadow/canary evaluated, and rollbackable without changing canonical capability truth.
- [ ] Drift telemetry detects material exact/mandatory/NO_ACTION regressions.

- [ ] Privileged capability execution is correlated to an implementation/tool/package/server qualification identity appropriate to its risk.
- [ ] Revoked/quarantined implementations cannot receive new privileged execution through stale catalog/cache data.

## D. Shared runtime
- [ ] No production rewrite begins before telemetry gate.
- [ ] A future pilot preserves isolated-placement fallback.
- [ ] Fault containment and tenant/context isolation are proven before scale-out.
- [ ] GO/NO-GO is based on SmartAIHub measurements.
- [ ] Decrypted secrets are not shared across agent contexts.
- [ ] Resource quotas/admission control exist for colocated contexts.
- [ ] Shared caches have tenant/policy/version-safe scoping or are not shared.
- [ ] Host upgrade/drain and crash recovery are demonstrated.
- [ ] Placement respects data-residency/egress/isolation eligibility before cost optimization.
- [ ] Shared-host fairness/noisy-neighbor controls prevent one tenant/agent from exhausting common runtime resources.
- [ ] Soft/hard deadline and cancellation paths fence stale authority and clean owner-managed reservations/resources.
- [ ] Cross-layer work amplification is bounded without silently dropping mandatory correctness checks.
- [ ] Production rollout has measurable SLO/error-budget and explicit degraded/rollback criteria.

---

# 11. Explicit non-goals

Spec 276 does NOT authorize:

- replacing Spec 186 `worker_jobs` with graph-engine state;
- replacing PostgreSQL system-of-record with process memory;
- replacing Spec 256 Registry/Resolver with a ranker;
- copying another project's fixed confidence thresholds;
- deleting raw evidence merely because a summary exists;
- forcing every agent into one process;
- changing tenant/security boundaries to improve density;
- embedding OpenHuman GPL implementation into SmartAIHub proprietary components without a separate license/legal decision;
- creating a new generic queue, capability registry, workflow ledger, approval store or artifact database when current owners can be extended.

---

# 12. Implementation sequencing summary

```text
Existing SmartAIHub foundation
        |
        +-- Spec 186 correctness plane
        +-- Spec 224 development lifecycle
        +-- Spec 256 capability discovery
        +-- Spec 229 retrieval
        +-- existing artifact / Library / R2 owners
        |
        v
G0 inventory
        |
        v
P0 Authority + Receipt hardening
        |
        v
P0 Recoverable Artifact Context
        |
        v
P1 Ranker / Candidate-set safety
        |
        v
Cross-cutting UAT + telemetry
        |
        v
P2 Shared Runtime GO / NO-GO
```

The desired outcome is not "SmartAIHub behaves like OpenHuman or any other harness."

The desired outcome is:

> SmartAIHub obtains the efficiency benefits of modern agent runtimes while preserving its stronger multi-tenant, durable-control-plane, execution-placement and authority boundaries.

---

# 13. Definition of Done

Spec 276 SHALL NOT be declared complete merely because interfaces or schemas exist.

Completion requires evidence that:

1. duplicate and ambiguous side effects reconcile safely in real integration tests;
2. at least three materially different large-output paths use recoverable context references;
3. exact and mandatory capabilities survive ranker misses in evaluation and integration tests;
4. tenant/actor/artifact ACL boundaries remain intact across compact preview and re-fetch;
5. Final Verify can consume exact artifact/receipt evidence rather than trusting summaries alone;
6. observability can correlate request → capability → job → attempt → artifact → receipt → verification;
7. the shared-runtime decision is backed by SmartAIHub telemetry and is explicitly GO or NO-GO;
8. no duplicate canonical queue, registry, approval store, workflow ledger, or artifact database was introduced;
9. crash-window tests prove no blind replay of ambiguous external effects;
10. mutable artifacts cannot silently change historical verification evidence;
11. feature-flag rollback preserves canonical receipts/evidence and restores safe fallback behavior;
12. shared-runtime rollout, if GO, proves secrets/resource/cache isolation and safe drain/fallback;
13. callback/poll races, local clock skew and stale-region writers are fenced in integration tests;
14. billing/credit settlement cannot duplicate because transport/provider observations repeat;
15. persisted contract-version upgrades preserve or safely pause non-final work;
16. batch partial success retries only unresolved partitions/items;
17. evidence-manifest digest verification survives backup/restore for representative high-value runs;
18. artifact retention/deletion/legal-hold and GC behavior is proven against active/unresolved evidence;
19. ranker model/profile drift and rollback are observable and bounded;
20. operator reconciliation actions are evidence-backed and audited;
21. runtime/tool/model/provider provenance is sufficient to explain what actually executed;
22. canonical idempotency conflicts are fail-closed and digest/canonicalization versions are explicit;
23. historical replay is proven side-effect-free unless a new execution is explicitly authorized;
24. recoverable artifact publication is atomic enough that broken metadata/byte states cannot satisfy Final Verify;
25. corruption/digest mismatch and stale-index/cache paths fail closed or fall back to exact source;
26. derived artifact security classification propagates correctly;
27. mutable/revoked tool implementations cannot bypass qualification through stale names/caches;
28. timeout/cancel paths clean reservations/resources and fence stale executors;
29. required evidence profiles prevent incomplete-but-green Final Verify;
30. rollout SLO/error-budget and degraded-mode signals are implemented and exercised.

A production activation SHALL be separately gated by deployment/environment-specific evidence where required by the canonical owner specs.

---

# 14. R1.1 — 12-pass hardening audit

This revision performed twelve distinct review passes. Each pass was checked against the current Spec 276 text and, where relevant, the verified current-main ownership of Specs 186/224/229/256.

| Pass | Audit focus | Gap found | R1.1 correction |
|---:|---|---|---|
| 1 | Ownership / dependency truth | Spec 267/271 were referenced but not found on current main; status said implementation-ready despite mandatory G0 | Marked verified vs contextual dependencies; changed status to G0-ready |
| 2 | Side-effect correctness | Receipt-only design leaves crash-after-effect-before-receipt window | Added durable write-ahead `SideEffectIntentV1` ordering |
| 3 | Provider retry semantics | Not all providers support idempotency/reconciliation | Added provider idempotency capability classes and no-blind-retry rule |
| 4 | Authority / approval lifecycle | Missing delegation narrowing, revocation and approval TOCTOU binding | Added authority epoch/delegation/revocation + exact-scope approval binding |
| 5 | Cancellation / compensation | Cancel semantics around external acceptance were underspecified | Added commit-point states; compensation is a new authorized effect |
| 6 | Restart / checkpoint compatibility | Checkpoint lacked graph/tool/runtime version pinning | Added version-aware checkpoint and incompatible-resume outcomes |
| 7 | Recoverable artifact integrity | Handle did not guarantee immutable historical bytes | Added snapshot/content digest, durability class and pinning semantics |
| 8 | Artifact security / lifecycle | Prompt injection, derived-index deletion, local-only resume were incomplete | Added trust handling, redaction provenance, derivative lifecycle and local evidence rules |
| 9 | Capability retrieval safety | Catalog freshness, `NO_ACTION`, poisoning and staleness were incomplete | Added generation binding, abstention, poisoning defense and exact canonical recovery |
| 10 | Shared-runtime isolation | Missing secret, cache, resource quota, supervisor and host-drain rules | Added mandatory in-process isolation and blast-radius controls |
| 11 | Placement / cost / observability | Residency, bounded expansion/reranking and telemetry privacy were incomplete | Added placement eligibility, cost/backpressure budgets and privacy-safe observability |
| 12 | Rollout / rollback / certification | No shadow/enforcement split or exhaustive crash-window acceptance | Added feature flags, backward compatibility, rollback invariants and A-H crash matrix |

## 14.1 Audit conclusion

After R1.1, no new canonical queue, registry, approval store, workflow ledger or artifact database is required by the specification.

The highest-risk remaining work is intentionally deferred to **G0 implementation inventory** because the exact deployed schemas/services must decide whether each logical contract is:

```text
REUSE
EXTEND
or
MISSING
```

The implementation team SHALL NOT interpret the logical TypeScript interfaces in this document as mandatory new SQL tables.

## 14.2 Remaining intentional unknowns

The following are not specification gaps; they require implementation-grounded evidence:

- exact existing provider-operation/side-effect settlement schema;
- exact artifact retention owner and current R2/Library reference shape;
- exact production capability-ranking implementation behind Spec 256/229;
- exact runtime telemetry available on Desktop Runner/Container hosts;
- measured thresholds for artifact compaction and shared-runtime GO/NO-GO;
- current deployment path/repository status of contextual Specs 267 and 271.

These must be resolved in WP276-0/G0 before mutation.

---

# 15. R1.2 — Second 14-pass production hardening audit

R1.2 performed fourteen additional, distinct review passes on top of the R1.1 twelve-pass audit. The cumulative audit count is therefore **26 passes**.

| Pass | Audit focus | Gap found after R1.1 | R1.2 correction |
|---:|---|---|---|
| 13 | Authoritative time / clock skew | Authority/lease expiry fields existed but host/provider clock could be misread as authoritative | Added canonical-time/epoch rule and skew handling |
| 14 | Nested delegation / fan-out | Parent authority was narrower/equal but cumulative child budget/revocation/join behavior was incomplete | Added authority lineage, cumulative ceilings, revocation cascade and no-union widening |
| 15 | Sensitive reads / egress | Side-effect model focused on writes; protected reads/external summarization could still expose data | Added protected-read, secret-access and external-egress authority boundary |
| 16 | Callback/webhook race | Polling/reconciliation was covered but duplicate/late/out-of-order callbacks were not | Added authenticated callback-as-signal contract, dedupe and stale-attempt fencing |
| 17 | Economic settlement | Receipt carried billing ref but reservation/late usage/ambiguous-effect economics were underspecified | Added business-effect keyed settlement/idempotency and pending reconciliation semantics |
| 18 | Batch partial success | One coarse effect receipt could cause replay of successful batch items | Added item/partition identity, partial state and targeted retry |
| 19 | Multi-region failover | Stale regions/processes could theoretically race after failover | Added canonical lease/fence failover rule and reconcile-before-resubmit sequence |
| 20 | Schema evolution / in-flight upgrades | Logical contracts were versioned but decoder/migration behavior was not normative | Added explicit compatibility registry and fail-closed migration outcomes |
| 21 | Reconciliation storm / operator action | Ambiguous effects could poll forever; manual resolution basis was incomplete | Added bounded reconciliation, circuit-breaker/quarantine and evidence-backed operator actions |
| 22 | Evidence chain of custody | Individual digests existed without one correlated immutable verification manifest | Added `EvidenceManifestV1` logical contract and exact-digest Final Verify rule |
| 23 | Retention / legal hold / GC | Deletion, active evidence pins, holds and orphan cleanup could conflict | Added policy precedence, tombstone rules, GC protections and unresolved-effect pinning |
| 24 | Artifact handle / summarizer security | Opaque refs existed but arbitrary URL/path substitution and external summarizer egress needed explicit denial | Added safe delivery derivation, tenant-safe content addressing and pre-egress redaction/policy |
| 25 | Ranker lifecycle / drift | Offline evaluation existed but model/profile rollout and quality drift were not fully governed | Added versioned shadow/canary activation, drift metrics and rollback semantics |
| 26 | DR / restore / shared-host fairness | Cross-store restore consistency and noisy-neighbor behavior needed certification | Added restore/failover proof gate plus runtime fairness/noisy-neighbor controls |

## 15.1 Second-audit conclusion

R1.2 closes the remaining major specification-level gaps found in the second production-oriented review without changing the architectural decision:

```text
Spec 186/195 remain execution/job/economic owners
Spec 224 remains development lifecycle owner
Spec 229 remains retrieval owner
Spec 256 remains capability-discovery owner
existing artifact/policy/billing systems remain canonical
Spec 276 supplies cross-cutting hardening invariants and adapters
```

The design still deliberately avoids making:

```text
ranker
summary
graph checkpoint
shared process
provider callback
region-local state
```

a correctness authority.

## 15.2 Remaining G0 implementation unknowns

The following remain evidence-gathering tasks rather than reasons to invent new architecture:

- which existing Spec 186/195 settlement/event structures can represent `SideEffectIntent` and `ExecutionReceipt` without new tables;
- the current billing reservation/settlement idempotency key and whether late provider usage already reconciles by provider operation;
- current webhook/provider callback normalization and signature verification coverage by adapter;
- exact R2/Library retention/legal-hold owner and active-evidence pin mechanism;
- deployed artifact-delivery URL/path validation behavior;
- actual contract-version decoder/migration support for active jobs;
- current backup/restore correlation between PostgreSQL control-plane rows and R2/local evidence;
- current ranker/profile versioning and online-evaluation telemetry;
- current per-tenant shared-runtime fairness metrics.

WP276-0 SHALL resolve these as `REUSE`, `EXTEND`, or `MISSING` before schema/runtime mutation.

---

# 16. R1.3 — Third 12-pass integrity, replay & operability hardening audit

R1.3 performed twelve additional distinct passes on top of R1.1 + R1.2. The cumulative audit count is now **38 passes**.

| Pass | Audit focus | Gap found after R1.2 | R1.3 correction |
|---:|---|---|---|
| 27 | Execution provenance / reproducibility | Receipts pinned effects but did not fully explain runtime/tool/model implementation that actually ran | Added execution provenance envelope with runtime, adapter, Skill, MCP, provider/model and source identity |
| 28 | Idempotency identity | Same idempotency key with changed input/scope lacked a mandatory conflict outcome; digest canonicalization was underspecified | Added `IDEMPOTENCY_CONFLICT`, canonical scope binding, digest algorithm and canonical serialization version |
| 29 | Replay safety | “Replay” could be interpreted as invoking provider/tool effects again | Split `RECONSTRUCT`, `SIMULATE/DRY_RUN`, and `REEXECUTE`; historical replay defaults side-effect-free |
| 30 | Causal ordering | Out-of-order events/callbacks/caches could still regress projections absent a cross-cutting monotonicity rule | Added sequence/epoch/revision based stale-observation rejection and reconcile-on-concurrency |
| 31 | Artifact publication/integrity | Metadata/object split and bit-rot could create a handle that looks valid while bytes are missing/corrupt | Added staged→verified→available publication and digest-mismatch integrity failure |
| 32 | Derived-data classification | Summary/embedding/index could accidentally become less protected than its source | Added classification/tenant/egress propagation and explicit declassification-only exception |
| 33 | Cache/index coherence | Stale cache/negative cache/search index could misrepresent revocation or absence | Added source/policy/catalog generation binding and exact-source fallback for correctness-sensitive absence |
| 34 | Capability supply chain | Stable capability names could hide changed package/image/MCP/tool implementation | Added qualified implementation identity, immutable local package digest and requalification on material remote schema drift |
| 35 | Deadline/cancel/resource cleanup | Process kill/cancel did not fully specify stale authority fencing and capacity/credential/workspace cleanup | Added soft/hard deadlines plus idempotent resource/reaper cleanup |
| 36 | Cross-layer amplification | Individually bounded retrieval/artifact/sub-agent/reconcile loops could multiply into excessive total work | Added request/run amplification budget across fan-out, expansion, retry and verification |
| 37 | Evidence completeness | Evidence manifest could be valid but incomplete for the required verification profile | Added explicit required evidence profile and durable waiver semantics |
| 38 | SLO/error budget/degraded mode | Rollout had flags/rollback but no measurable correctness/latency/cost activation budget | Added SLO/error-budget, rollback triggers and explicit degraded user/operator states |

## 16.1 Third-audit conclusion

R1.3 does not add a new architectural authority. It closes integrity and operability gaps around the existing design:

```text
authority proves permission
provenance explains what actually ran
idempotency proves duplicate convergence
receipt proves observed effect
artifact digest proves exact evidence bytes
evidence profile proves completeness
checkpoint proves resumable orchestration position
canonical job/event state remains execution truth
```

Critically:

```text
replay ≠ re-execution
capability name ≠ implementation identity
summary/index ≠ exact source
artifact handle ≠ valid bytes until committed and digest-verified
same idempotency key + different input ≠ duplicate success
green evidence manifest ≠ complete verification unless profile requirements pass
```

## 16.2 Additional G0 questions created by R1.3

WP276-0 SHALL additionally identify:

- existing runtime/tool/package/provider provenance fields and immutable version anchors;
- current canonical idempotency key derivation and conflict behavior;
- existing structured digest/canonical JSON implementation, if any;
- current debug/replay tooling and whether it can accidentally execute side effects;
- current R2/Library upload→metadata commit lifecycle and orphan reaper behavior;
- current checksum/integrity verification for evidence objects;
- current derived-data classification/embedding/search-index policy propagation;
- current cache generation/invalidation support for ACL/policy/catalog changes;
- current capability package/image/MCP qualification/revocation data;
- current cancellation hard-kill and resource-reservation cleanup behavior;
- current run-level amplification/budget composition across Spec 224/195/229/256;
- current verification profile/required-evidence closure mechanism;
- current production SLO/error-budget/degraded-state UI/API conventions.

Each is classified `REUSE`, `EXTEND`, or `MISSING` before new persistence/runtime components are introduced.

