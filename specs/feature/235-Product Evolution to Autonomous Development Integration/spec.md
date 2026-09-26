---
spec_id: 235
title: SmartAIHub Product Evolution to Autonomous Development Integration
revision: 3.0
status: R3 SECOND TEN-PASS REVIEWED DESIGN — future additive integration; actual Spec 224 ingress certification pending
created: 2026-09-23
reviewed: 2026-09-24
suggested_repository_path: specs/feature/235-product-evolution-development-orchestrator-integration/spec.md
baseline: Spec 224 CURRENTLY IN IMPLEMENTATION; NO CHANGE to its existing scope, migrations, tests or Final Verify
owners: Product Evolution Integration / Autonomous Development Interoperability
companions: ["Spec 233", "Spec 224 IN PROGRESS", "Spec 220", "Spec 229", "Spec 230", "Spec 218", "Spec 221", "Spec 228", "Spec 226", "Feature 195", "Feature 186", "Spec 232"]
optional_readonly_discovery: ["Spec 234"]
implementation_strategy: sidecar-readonly-bridge-then-explicit-promote
risk_class: high
---

# Spec 235 — Product Evolution ↔ Autonomous Development Integration

**Revision:** R2 ten-pass hardening; later R2 normative corrections supersede conflicting R1 state/dispatch details.

**Purpose:** Safely connect Spec 233's qualified/approved unmet needs, Living Project solutions and capability gaps with the **existing, still-in-progress** Spec 224 development orchestrator. This is an independent **future integration spec**, not Spec 224 R20 or an instruction to change Spec 224 midway through implementation.

## 0. Baseline freeze and implementation timing

Spec 224 currently owns its development run, requirements closure, blocker ledger, approval, durable continuation and Final Verify. **Continue its current approved implementation plan unchanged.** Spec 235 SHALL not create new acceptance requirements for the already-running Spec 224 milestone; not edit its baseline Spec, existing WorkPackages, tests, schemas or branch; not intercept current in-flight runs; and not require resetting its progress.

P235.0 discovery/read-only may begin while 224 is in progress. All **new writable handoff/command paths remain disabled** until a real, documented, separately accepted Spec 224 stable ingress milestone is demonstrated. In absence of such contract, route approved requests to a queue/manual export for later scheduling without asserting automated handoff works. No synthetic declaration that 224 is stable.

Spec 233 owns the Need/Gap/Proposal and owner/Admin product approval. Spec 230 packages bounded engineering context. Spec 220 authorizes. Spec 224 owns development execution and Final Verify. Spec 221/209/215 own Skill/workflow delivery-specific quality/runtime; the release owner governs actual capability publication. This Spec ONLY owns the **bridge contract, readiness negotiation, replay-safe handoff and completion reconciliation**.

## 1. Integration context and explicit preconditions

A user may discuss an idea repeatedly, upload private research, run independent experiments or request a new component. The platform must check existing functionality first, then classify `KNOWLEDGE`, `DISCOVERABILITY`, `COMPOSITION`, `SKILL`, `MINI_APP`, `TENANT_PRODUCT`, `PLATFORM_CORE` or `INSUFFICIENT_EVIDENCE`. **Not all gaps require software-development orchestration.** For existing workflows or help fixes use the existing domain owner; for new Skill/Mini App software implementation eligible requests use the bridge; platform-core changes require separate Admin scope.

Prior to enabling a development handoff the bridge MUST prove:

- Existing Spec 224 versioned ingress exists and is conformant on the deployed target. Do not fabricate an endpoint from a planned document.
- `worker_jobs` (existing execution truth), approvals, security/fencing and external-harness adapters are healthy for the selected path; optional unavailable adapters should block only their dependent cases.
- Project owner consent and policy decision authorize any private content included in a development context package and any external-provider egress.
- The approved proposal, intended delivery type, acceptance oracle, funding/credit budget and capabilities snapshot are immutable/version-pinned.
- No competing active development request is fulfilling the same need/scope; authorized in-progress candidates and canonical gap links checked.

## 2. Proposed integration contracts (adapt to actual 224 ingress)

These are sidecar exchange envelopes, **not a mandate to alter the Spec 224 schema**. Store bridge-owned state separately; map only to supported public/authorized existing 224 request fields after capability negotiation.

```ts
type WorkState = 'DRAFT'|'AWAITING_OWNER'|'APPROVED'|'QUEUED_FOR_INTEGRATION'|'PREFLIGHT_BLOCKED'|'SUBMITTED'|'ACKNOWLEDGED'|'RUNNING'|'AWAITING_VERIFY'|'DELIVERED'|'REJECTED'|'CANCELLED'|'STALE';
interface ProductEvolutionHandoff {
  requestId: string; tenantId: string; projectId: string;
  gapId: string; gapRevision: string; proposalRevision: string;
  artifactClass: 'SKILL'|'WORKFLOW'|'MINI_APP'|'TENANT_PRODUCT'|'PLATFORM_CORE';
  desiredOutcome: string; approvedScope: string[];
  prohibitedScope: string[]; acceptanceCriteriaRefs: string[];
  permittedKnowledgePackRef?: string; contextDigest: string;
  capabilitySnapshotRef: string; snapshotRevision: string;
  duplicateResolutionRef: string; approvalReceiptRef: string;
  providerEgressPolicyRef: string; accessPolicyVersion: string;
  budgetRef: string; deliveryTargetRef: string;
  requestedIntegrationProfile: string; idempotencyKey: string;
  createdAt: string; expiresAt: string;
}
interface DevelopmentBridgeReceipt {
  requestId: string; bridgeVersion: string;
  compatibilityProfile: string; acceptedBy224: boolean;
  developmentRunRef?: string; workerJobRef?: string;
  providerSubmissionReceiptRef?: string;
  state: WorkState; rejectionCode?: string;
  sourceProposalDigest: string; observedAt: string;
}
interface ProductCapabilityCompletionEvidence {
  requestId: string; developmentRunRef: string;
  finalVerifyEvidenceRef: string; acceptedArtifactRefs: string[];
  runtimeOrReleaseValidationRefs: string[];
  shippedVersionRef?: string; deploymentReceiptRef?: string;
  requestedCapabilityRef: string; finalScopeDigest: string;
}
```

`acceptedBy224` is true only after actual canonical acceptance/receipt. A handoff request or successful PR is not a completed development run. Final Verify is **not** automatic proof that a capability was deployed or made available to every tenant; publication/release readiness must be separately verified.

## 3. Control-flow state machine

```text
Spec 233 qualified gap / user-approved plan
    → context/security/budget/duplicate preflight
    → P235 bridge queue [independent persisted intent]
    → (integration gate not met?) HOLD / MANUAL_EXPORT
    → existing Spec 224 authorized ingress, if certified
    → ACK receipt and correlated canonical job/run
    → READ-ONLY monitoring via existing Spec 224/226 contracts
    → Final Verify evidence and release status reported back
    → Spec 233 verifies scope/result against current capabilities
    → domain release owner publishes, if approved
    → Spec 234 evaluates affected Use Cases / Spec 229 indexes changed projections
```

Failure/expiry rules: missing approval, stale context, revoked data sharing, duplicate in-flight work, unverified capability, unsupported artifact type, budget exhaustion or ambiguous permission → `PREFLIGHT_BLOCKED`; do not auto-proceed. `APPROVED` is reversible before submission. Approval is scoped to exact target, egress policy, cost ceiling and source revision; material changes require reapproval.

## 4. Preflight algorithm and anti-duplicate gate

Before every submission and every resumption after significant delay:

1. Query current Spec 233 gap status, owner-approved proposal, matching unresolved Need and user/project authorization through Spec 220.
2. Resolve and version-pin actual Product Capability Registry, Skill/Workflow catalogs and relevant Spec 234 Use Case identities using authorized Spec 229/registry queries. Semantic retrieval is candidate discovery, not authority.
3. Compare approved missing primitives to current supported/composable and previously approved/in-progress work. If resolved, `STALE/NO_LONGER_NEEDED` and return owner-visible choices rather than creating development.
4. Produce `Spec 230` least-privilege Project Context Pack and provider-specific bootstrap. Untrusted uploads/tool outputs must not broaden system instructions or permissions.
5. Use real Spec 224 ingress capability-negotiation to map safe fields; if unsupported, preserve request and generate bounded manual work package with no false completion status.
6. Validate approval, credentials mediation, isolated execution target, estimated credits and fencing; require new approval for environment/core modifications beyond scope.
7. Submit once with durable outbox/idempotency; wait for accepted receipt and correlate only on immutable request/run IDs.

Idempotency SHOULD key `(tenant, project, gap revision, proposal digest, artifact class, approved target)` and remain unique while active. Worktree/branch lock semantics are inherited from existing 224; this bridge must not invent a parallel lock/lease truth. Re-entrant callbacks require fenced state transitions, event dedup and monotonic reconciliation.

## 5. Data privacy, research isolation and harness boundaries

A private user Project may use internal solutions while platform Admin cannot see its sources. Owner may authorize a project-local Skill/Mini App build without authorizing platform promotion. External Codex/Claude/Antigravity/Hermes/Kimi/ZCode receive only explicit `Spec 230` bounded content and `Spec 220` authorized grants. Never transmit raw full chat archives, research datasets, R2 credentials, tenant-wide tokens or Core database credentials by default.

For platform-wide capability gap sourced from consented signals, development context MUST contain only approved declassified need statements, never private evidence by implication. Audit includes provider, target execution environment, requested scope, source-projection digest, consent and version. Revocation before dispatch cancels/fences the pending package; after dispatch halt/fence and follow applicable external retention/incident policy without claiming unverifiable provider deletion.

## 6. Progress and UX

Project owner: a persistent Evolution Plan with `DRAFT/APPROVED/QUEUED/SUBMITTED/RUNNING/VERIFYING/SHIPPED` plus `BLOCKED/REJECTED`, change history, authorized sources and links to existing Spec 224 Task Control (when available). Clear distinction between *idea*, *approval*, *implementation*, *verified*, *released*, *available to me*. Admin: integration readiness, compatibility versions, outstanding approved requests, replay errors, limits, privacy-safe aggregate plan queue and triage. Mobile/tablet access via existing Spec 225/226 when deployed; no duplicate universal agent UI.

An offline/unconnected 224 target shall display `QUEUED_FOR_INTEGRATION` or `WAITING_EXECUTION_TARGET`; no fake progress. User can export a bounded, signed manual WorkPackage for a trusted human to issue through the existing approved 224 workflow while automation is gated.

## 7. Completion reconciliation

Development success is asserted **only** from canonical Spec 224 Final Verify evidence. Spec 235 then checks artifact scope, release status, actual current capability contract, entitlement, security/quality evaluation and project ownership. Spec 233 updates the private gap status based on those verifiable facts; Spec 234 only reevaluates approved/eligible Use Case projections and Spec 229 selectively refreshes indexes. If build passed but deployed capability remains absent, report `BUILT_NOT_AVAILABLE`, keep gap partially open and link the remediation plan. If a capability was removed later, reopen the eligibility/coverage evaluation.

All status updates via outbox and idempotent consumers; avoid dual write to 224 and 233. A compensation workflow may retract a recommendation/index projection, not erase audited evidence.

## 8. Phased delivery (do not interrupt existing Spec 224)

| Gate | Deliverable | Prerequisite / evidence |
|---|---|---|
| P235.0 | Read-only deployed 224 interface/health inventory, adapter probe and baseline freeze | May run while 224 implementation continues; no schema/route mutation |
| P235.1 | Spec 233 approval → signed Bridge Intent with duplicate/privacy checks | Spec 233 approved contract + Spec 220 authorization; no active integration |
| P235.2 | Shadow mapping to 224 supported WorkPackage; no actual submission | Actual 224 ingress contract milestone + independent conformance |
| P235.3 | Feature-flagged project-private low-risk submit / ACK / cancellation / retry | Explicit 224 stable milestone + owner opt-in and rollback |
| P235.4 | Receipt/event correlation, post-Final Verify checks and Spec 234 reevaluation | End-to-end evidence for test project and release owner checks |
| P235.5 | Admin governed platform capability upgrade, security/economics, canary | Separate higher-risk approval, provider restrictions, production gates |

**Activation guard:** If Spec 224 still has unresolved core blockers or no accepted ingress contract, do only P235.0–P235.1 and do not start P235.2–P235.5. The user's current Spec 224 Final Verify criteria must not be expanded by this spec.

## 9. Tests and failure-injection

- Existing in-progress 224 run remains unchanged with bridge disabled; legacy tests/Final Verify unaffected.
- No deployed 224 ingress contract → P235.0 audit/owner-visible `INTEGRATION_NOT_READY`; zero direct requests.
- Same signed work package replayed ten times → at most one actual accepted development run; completion events idempotent.
- Gap already solved/duplicate active task discovered just before submission → rescope/stop, no duplicate development.
- Research ACL revoked between approval and dispatch → no data egress; hard stop.
- Harness prompt injection in retrieved file → cannot broaden access, change target or bypass acceptance tests.
- Project private request → Admin cannot read secret request/source text; platform promotion requires new consent.
- Stable build but no deployment → `BUILT_NOT_AVAILABLE`, no false public capability claim.
- Stale/expired proposal after 224 milestone unlock → new preflight and possible reapproval.
- Operator retries after timeout with accepted-but-late receipt → resolve canonical run via idempotency/receipt, no second submission.
- Worker/reconciliation crash between 224 ACK and bridge commit → outbox/inbox recover without duplicate run.
- Version drift in 224 ingress → fail closed for writes while monitoring existing canonical runs read-only.
- Permissionless provider/model unavailable → only affected optional route blocked; no fake fallback to unrestricted provider.
- Legacy 224 implementation and 233 memory/index paths remain operable under bridge failure.

## 10. DoD and ownership acceptance

Definition of Done requires live, versioned conformant ingress; signed scoped handoff; explicit approval/security and consent proof; verified idempotent submission; read-only progress correlation; canonical Final Verify evidence; distinct release/availability assessment; no duplicate development authority; private-data non-disclosure; audited compensation and rollback; owner-facing UI; and successful independent regression certification. No test may certify 224's unfinished primary implementation on Spec 235's behalf.

## 11. Numbering and supersession

`235` is a provisional allocation until the authoritative Git main branch, registry and open PR/worktrees are checked. STOP on collision. The earlier preliminary `spec-224-r20-product-evolution-handoff-alignment.md` from the Spec 233 pack **must not be applied** to the in-progress Spec 224. Its proposed handoff behavior is superseded by this independent bridge spec. Existing Spec 224 revisions, work packages, tests, migrations and current certification evidence remain untouched.

---

# Revision 2 — Ten-Pass Production Hardening (Normative)

**Date:** 2026-09-24. **Precedence:** R2 supersedes conflicting R1 state, dispatch, cancel, status and permission wording. All work is an independent, feature-flagged companion to the **unchanged in-progress** Spec 224; the original 224 plan, migrations, WorkPackages, acceptance graph and Final Verify remain frozen. `P235.0` inventory and `P235.1` durable approval intents are allowed before 224 stable ingress; no live submission until separately accepted conformance evidence exists.

## R2.1 Acyclic ownership and readiness negotiation [Audit 01]

Spec 233 owns per-project needs, gaps, proposals, owner/admin product approvals and Product Intelligence. Spec 234 optionally supplies verified Use Case matches, but is **not a precondition** for private development if 233 can check the deployed 212/Capability Registry through 229. Spec 230 owns harness engineering context; 220 owns authorization and data/egress grants; 224 owns actual development execution and Final Verify. Spec 235 owns only bridge intent, compatibility profile, durable dispatch/correlation and post-result reconciliation. No extra execution queue, development run, lease, approval authority or release authority is created by the bridge. Any reference in 233 to 234/235 is downstream event integration, never hard schema/build dependency.

Readiness contract `224IngressProfile` must be probed against a real deployed target and bound to its immutable revision: `supportedArtifactClasses`, `submit`, `lookupByCorrelationId`, `cancel`, `readStatus`, `eventStream`, `approvalSemantics`, `idempotencySemantics`, `payloadSchema`, `safetyCapabilities`, `version`, `probeEvidenceRef` and `expiresAt`. Probe each operation separately. Unsupported lookup, cancel or event stream triggers explicit degraded/manual handling; do not infer support. Live writes require `submit` + verifiable dedup/correlation plus applicable approval and execution safety; a documentation example is never a readiness receipt. No Spec 235 test qualifies Spec 224's unfinished implementation.

## R2.2 Unambiguous bridge state machine and mapping [Audit 02]

R1's `WorkState` is a deprecated compatibility projection only; the following is the **canonical bridge-owned** state machine, not a rewrite of 224 statuses:

```ts
type BridgeStateV2 =
  'DRAFT'|'AWAITING_APPROVAL'|'APPROVED'|'QUEUED_FOR_INTEGRATION'|
  'PREFLIGHT_BLOCKED'|'SUBMITTING'|'ACK_AMBIGUOUS'|'ACKNOWLEDGED'|'RUNNING'|
  'AWAITING_FINAL_VERIFY'|'DEV_VERIFIED'|'RELEASE_PENDING'|
  'AVAILABLE'|'BUILT_NOT_AVAILABLE'|'REJECTED'|'STALE'|
  'CANCEL_REQUESTED'|'CANCELLED_CONFIRMED'|'MANUAL_HANDOFF';
```

`SUBMITTING` is durable and not proof of 224 acceptance. `ACKNOWLEDGED` requires an authentic immutable accepted receipt containing actual 224 run ID. `RUNNING` is derived from an authorized 224 observation. `AWAITING_FINAL_VERIFY` and `DEV_VERIFIED` are based solely on canonical 224 evidence. `RELEASE_PENDING`, `AVAILABLE` and `BUILT_NOT_AVAILABLE` are **post-development** release-owner/Capability Registry assessments; only verified deployment + principal-scoped entitlement/health permits `AVAILABLE`. `CANCEL_REQUESTED` never means the canonical run was stopped. `CANCELLED_CONFIRMED` requires a real 224 cancellation result or proof that no submission occurred. Every transition checks expected revision and legal predecessor, with explicit stale/late-event quarantine; never derive truth from a UI badge or provider text.

Legacy R1 `DevelopmentBridgeReceipt.state` SHALL be mapped losslessly to a versioned V2 receipt where possible, otherwise `UNKNOWN_LEGACY_STATE` behind a read-only compatibility view; unrepresentable input fails closed. A terminal 224 failure maps to bridge `PREFLIGHT_BLOCKED` only if retry/preflight is genuinely needed; otherwise retain explicit `DEV_FAILED` in V2 outcome metadata and owner UI rather than claiming the request never started.

## R2.3 Durable submission, ambiguous ACK and manual fallback [Audit 03]

Preflight records a versioned `AuthorizedHandoffSnapshot` (proposal revision, approval scope, source policy epoch, permitted context digest, capability snapshot, target 224 ingress profile, budget/entitlements, risk class, receipt expiry). An independent persisted intent is written transactionally with the existing outbox and stable idempotency/correlation key. The dispatcher checks current ACL, consent and policy **again at egress**, then submits at most once per supported idempotency profile. Timeout after submission is bridge state `ACK_AMBIGUOUS`; query the canonical 224 lookup by correlation ID or wait for authenticated callback before retry. If target lacks a proven dedup/lookup mechanism, stop automatic retries and require operator reconciliation; do not create a second run to resolve ambiguity.

Manual export SHALL contain the same bounded context, digest, expiry, owner consent, immutable request ID and explicit instruction to record the canonical 224 run receipt before marking submitted. An imported manual receipt must be validated directly against 224 truth. Automatic handoff and manual export for the **same request** are mutually exclusive until canonical reconciliation proves no competing run. Retry/replay 10×, dispatcher crash after provider ACK and disconnect while submitting must each result in no more than one canonical development run.

## R2.4 Approval, cancellation and long-delay drift [Audit 04]

Approval is scoped to the exact principal/project, target artifact class, expected environment, source refs/revisions, provider egress, budget/credits ceiling, risk class, restricted actions, acceptance oracle and expiration. Distinguish **product-owner approval**, **platform-admin approval** for Platform Core, and **Spec 224 runtime approvals**; one never silently implies another. Long-held approved intents require fresh registry/entitlement/context/security preflight immediately before dispatch; materially changed scope or expired approval requires a new approval event. Enforce human approval for privileged data/schema/publish/deployment actions through existing central policy, not a bridge-owned popup.

Cancellation before dispatch tombstones intent and fences outbox retries; after ACK the bridge requests cancellation through the **actual supported 224** API and remains `CANCEL_REQUESTED` while status is pending. If cancel API is unavailable, show `CANCEL_REQUESTED` with reason `CANCELLATION_NOT_CONFIRMED` and escalate to authorized operator; never claim work stopped. If external data was already sent, stop further egress and pursue provider-specific incident/retention workflow without claiming remote deletion. Current 224 worktree and authorization state are never mutated outside its contract.

## R2.5 Consent, confidentiality and derived-artifact lineage [Audit 05]

`permittedKnowledgePackRef` is an expiring capability-limited reference produced by Spec 230 from **current** Spec 220 policy decisions and Spec 233 private project revision manifest. No direct SQL/R2/Vectorize credentials, raw chat exports or project-wide open search token are given to a harness. The package has typed `sourceIds`, `sourceRevisions`, `sourceAclEpochs`, `purpose`, `providerAllowlist`, `egressRegion`, `redactionProfile`, `contentDigest`, `expiry`, `recipientType`, `derivedFrom` and effective visibility equal to the current intersection of its sources, unless independently declassified. A summary of private research remains private. Retrieval evidence is untrusted text; prompt injection cannot change tools, grants, release approval or acceptance tests.

A revocation races dispatch using a monotonic policy epoch and an egress fence. Revalidate immediately before package materialization, model/provider submission, export download and subsequent task-specific retrieval. If a source is withdrawn after external disclosure, block new uses and record a privacy/retention incident with factual provider limitations. Generated code, logs, notebook outputs and CI artifacts inherit source sensitivity until reviewed; only approved generalized **independent** capability code can be promoted to shared platform usage without exposing private evidence.

## R2.6 Reuse-first preflight, scope drift and dynamic capability change [Audit 06]

Every submission performs exact capability/212 Use Case/Skill/Workflow lookup through authorized Registry + Spec 229, followed by current Spec 233 need/gap/active-plan detection, optional 234 coverage, and in-flight 224 development correlation **within authorized scope**. A similarity score alone never proves duplicate work or authorizes canceling another user's project. Distinguish `SAME_SCOPE_DUPLICATE`, `COMPOSABLE_WITH_EXISTING`, `RELATED_DIFFERENT_GOAL`, `NEW_PRIMITIVE_REQUIRED`, `INSUFFICIENT_EVIDENCE`. Existing usable components trigger a minimal change/Workflow/Skill path before Platform Core code. If a new release resolves the gap between approval and dispatch, mark the bridge intent `STALE`, show the new capability and require owner direction; do not automatically spend credits.

During development, a new capability or changed requirement may justify a new user-reviewed change request; the bridge does not directly mutate canonical 224 requirement closure graphs. Scope growth, different targets, new private sources and extra cost require approved revision + corresponding 224 supported change workflow, or a separate new run after original reconciliation. An experimental variation that is useful for comparative science is not classified as a wasteful duplicate merely because it shares a base capability.

## R2.7 Authenticated event exchange and replay fencing [Audit 07]

Use the same `SAH-EVOLUTION-1` envelope as Spec 234: `schemaVersion=1.0`, event ID, real publisher authority, aggregate ID/revision, tenant and optional project, visibility, ACL epoch, policy version, eligible proof ref, payload digest, causal predecessor, timestamp and idempotency key. Only Spec 233 is allowed to publish `PROPOSAL_APPROVED/REVOKED`; only approved release-owner evidence can publish `CAPABILITY_AVAILABLE`; canonical Spec 224 run status must be retrieved through its existing authenticated contract, not accepted solely from a forged event payload. Verify event transport identity, schema, expected source, correlation ID, monotonic sequence, run binding, current project permissions, receipt signature or trusted channel and payload digest before processing.

Outbox dispatch + durable consumer inbox + fencing token / expected revision protect against replay, out-of-order completion, retries, lost network ACK, provider callback forgery and delayed events arriving after cancellation or revocation. Store bridge state separate from canonical 224 and 233. Crash recovery does **not** attempt a cross-database transaction; query canonical state and reconcile each side idempotently. Spec 232 migration of transport adapters must retain one active executor for each job. A version-mismatched 224 ingress freezes only new bridge writes; monitoring continues where safe.

## R2.8 Post-Final Verify release assessment and reversibility [Audit 08]

A verified development run yields evidence for the **built artifact only**. The release-domain owner (221 for Skill, 215/212 when applicable for Workflow/Variant, 217–219 for Product/Mini App, designated restricted platform owner for Platform Core) evaluates deployment, test/certification, license/data provenance, budget reconciliation, security, feature flag, tenant entitlement and environment-specific health. A passed 224 Final Verify with no deployed path becomes `BUILT_NOT_AVAILABLE` or `RELEASE_PENDING`, never `AVAILABLE`. Revoked/failed/reverted releases produce `CAPABILITY_REVOKED` or unavailable-status events, reopen relevant private gap coverage in 233 and re-evaluate eligible affected 212 cases through 234.

For a partially delivered plan, retain `PARTIAL_DELIVERY` with acceptance criteria IDs and a linked follow-up proposal; do not close the gap merely because code merged. Product-owner UI shows the exact distinction `proposal approved` / `run accepted` / `code verified` / `release approved` / `deployed` / `available to me`. Restoration and rollback preserve historical receipts and release lineage and update the current capability registry atomically within its own authority.

## R2.9 Economic guardrails, operability and user experience [Audit 09]

Reserve no credits, charge none and trigger no external provider from an unapproved proposal. Before authorized handoff obtain current policy and budget receipt from existing credit/ledger authority (Spec 207 or deployed equivalent); record estimate versus actual, maximum spend, reserved amount where supported and unused-credit release on cancel/failure under canonical ledger rules. The bridge is not an economic authority. Cost overrun or unavailable paid provider pauses the **affected run** for a scoped approval or policy-selected authorized alternative; no silent provider egress or unlimited retry. Bound retries, max causal loop depth, context tokens, time and per-tenant concurrent handoffs.

Expose to mobile/desktop: exact approval scope, data sources/recipient provider, budget estimate, block reason, manual export validity, real 224 progress link, ambiguous ACK, cancellation pending, shipped-versus-available status and rollback outcome. Admin UI sees only eligible platform approvals and coarse privacy-safe aggregate queues. Provide kill switch for new 235 handoffs; it must not terminate or mutate canonical already-running 224 work. Feature-off leaves approved plans visible in 233 and normal Spec 224 operations unchanged.

## R2.10 Certification, phased rollout and disaster-recovery gates [Audit 10]

The phase boundaries are: P235.0 inventory/read-only; P235.1 signed, owner-approved durable intent and gated manual export; P235.2 shadow mapping against a **real verified** ingress; P235.3 canary private low-risk actual handoff and ACK; P235.4 correlation/independent release verification; P235.5 Admin-scoped Platform Core. Advance independently for each accepted ingress/profile/artifact class; never activate all providers or tenant scopes together. All P235.2+ remain disabled if the actual relevant Spec 224 stable milestone is absent. A version bump invalidates old conformance evidence and new writes until requalified.

Mandatory independent tests: (a) frozen in-flight 224 baseline unchanged under 235 disabled and canary; (b) repeated signed request, delayed ACK, process crash and provider retry yield ≤1 canonical accepted development run; (c) revocation and approval expiry at every point before egress produce zero new disclosures; (d) post-egress revocation suspends further use and produces documented incident evidence; (e) canceled-but-running 224 is not marked stopped; (f) completion before outbox receipt is reconciled from canonical run; (g) unimplemented/changed 224 API triggers zero write submissions; (h) Final Verify without deploy is not called available; (i) cross-project/tenant/role and forged event attacks fail closed; (j) optional 234 unavailability cannot block an otherwise authorized private plan when deployed 212 and registry checks are satisfied; (k) canary cost/concurrency/latency thresholds are approved before enabling paid providers; (l) manual receipt import cannot duplicate an automated run. Record evidence hashes, test commands, actual environment, reviewer, linked failure/repair issues and an operator rollback playbook. No document audit alone qualifies live production or changes Spec 224's existing Final Verify obligations.

# Revision 3 — Second Ten-Pass Integration & Long-Horizon Hardening (Normative)

**Revision intent:** R3 preserves the in-progress Spec 224 implementation unchanged and strengthens only the additive Spec 235 bridge. Where R3 conflicts with R2, R3 governs the bridge behavior; it never changes Spec 224's canonical state machine, Final Verify semantics or implementation scope.

## R3.1 Contract negotiation, capability probing and compatibility matrix [Audit 01]

Spec 235 MUST NOT assume one permanent Spec 224 API. Before write enablement it SHALL capability-probe the deployed 224 ingress and pin a certified `DevelopmentIngressProfile` containing contract version, accepted artifact classes, idempotency semantics, cancellation/change capabilities, progress/event capabilities, maximum payload/reference limits and expiry. Unsupported fields/features are gated before submission, not silently dropped.

Maintain a compatibility matrix `(235_bridge_version, 224_ingress_version, 230_context_pack_version, 220_policy_contract_version)`. New writes fail closed on incompatible major semantics; read-only monitoring MAY continue when safe. Rolling upgrades support old+new profiles during a bounded overlap, with per-intent pinned profile. No bridge deployment may require modifying an already-running 224 run to satisfy a newer 235 schema.

## R3.2 Long-running context drift, snapshot pinning and refresh protocol [Audit 02]

A development effort can outlive project memory, permissions, dependencies and capability releases. Each accepted intent SHALL pin immutable references/digests for approved goal, requirement set, project knowledge snapshot, capability snapshot, policy epoch, budget envelope and source-control base. Mutable “latest project memory” is never implicitly injected into a running development run.

When new knowledge materially affects scope, Spec 235 creates a `ChangeCandidate` explaining the delta and impact. Apply it only through a supported 224 change/replan interface plus required approval; otherwise queue a follow-up intent. Context-pack refresh may update non-semantic operational refs (for example renewed short-lived access) without changing approved requirements, and every refresh is audit-linked to the pinned snapshot.

## R3.3 Multi-run decomposition, fan-out/fan-in and parent-plan finality [Audit 03]

One approved Product Evolution plan may require multiple independently releasable development runs. Spec 235 MAY map one proposal revision to a versioned `DevelopmentRunGraph` only when the deployed 224 ingress supports the required composition; otherwise submit sequential independent intents with explicit dependencies. Each node has stable idempotency key, acceptance slice, artifact owner and release owner.

Parent progress is derived, never a new execution authority. `ALL_CHILDREN_VERIFIED` does not mean product available; blocked/canceled/failed child nodes keep parent outcome explicit (`PARTIAL`, `BLOCKED`, `FAILED`, `SUPERSEDED`). Fan-out has concurrency/cost limits and cycle detection. A retry creates/uses canonical 224 retry semantics, not a second child masquerading as the same work.

## R3.4 Human/Git concurrent-change safety and stale-base reconciliation [Audit 04]

Development may overlap human commits, other agents or another approved evolution plan. Each run pins repository identity, base revision/worktree/branch and ownership boundaries. Before merge/promotion, canonical development/release systems MUST detect stale base, overlapping files/contracts/migrations and dependency changes. Spec 235 records the conflict and requests governed rebase/replan; it never force-pushes, auto-resolves semantic conflicts or marks Final Verify valid against a materially different base.

For non-Git artifacts (Workflow definitions, Skills, schemas, configuration), use equivalent revision/ETag/expected-version checks. Parallel proposals that touch the same capability are correlated for dedup/reuse but remain separately auditable until an authorized merge decision.

## R3.5 Private-to-shared promotion, IP/licensing and provenance gate [Audit 05]

A private project may produce a generally reusable Skill/component, but reuse is not automatic. Promotion to tenant/shared/platform scope requires explicit owner authorization plus provenance review of source data, generated artifacts, dependencies, licenses and confidential know-how. Derived artifacts inherit the strictest applicable source visibility until a review proves a separable, independently shareable artifact.

The promotion package SHALL identify code/model/data licenses, third-party terms, generated-content provenance where available, prohibited redistribution constraints and sanitized test fixtures. Spec 235 transports these refs but does not make legal ownership claims. Failure/unknown provenance blocks shared promotion while allowing authorized private use where policy permits.

## R3.6 Saga-style partial failure and cross-authority reconciliation [Audit 06]

235 spans authorities without distributed transactions: Spec 233 approval, Spec 220 policy/context authorization, Spec 224 development run, source control, release owner and capability registry. Model this as an explicit saga of independently committed receipts with compensating actions limited to the authority that supports them. Never “rollback” an external commit/deployment by deleting bridge records.

A reconciler SHALL detect orphaned outbox intents, accepted 224 runs missing bridge mapping, bridge mappings whose proposal was revoked, verified artifacts lacking release assessment, and released capabilities lacking 233/234 closure notifications. Recovery queries canonical systems, records evidence and advances/repairs only derived 235 state. Ambiguous irreversible effects escalate; they are never guessed successful or undone.

## R3.7 Reproducibility, environment pinning and verification-chain integrity [Audit 07]

For development/research-grade artifacts, the handoff SHALL carry reproducibility refs appropriate to artifact class: dependency lock/revision, toolchain/runtime profile, test/eval dataset version, model/provider profile where material, environment class, feature flags and deterministic/random seed policy where applicable. Secrets and ephemeral credentials are referenced through brokers, never embedded.

The evidence chain is signed/digested across `approved proposal → submitted intent → accepted 224 run → build/test/review evidence → Final Verify → release assessment → deployment → capability attestation`. A later environment or dependency change invalidates only the affected evidence and triggers re-certification according to owner policy. Spec 235 never rewrites historical evidence to match current state.

## R3.8 Backpressure, fairness, priority and resource arbitration [Audit 08]

Product Evolution can discover more work than development capacity. Spec 235 SHALL not equate approval with immediate execution. Bridge queues expose `READY_FOR_HANDOFF`, `QUEUED_CAPACITY`, `QUEUED_BUDGET`, `WAITING_DEPENDENCY` and `WAITING_POLICY` distinctly. Priority comes from authorized product/admin policy plus risk/incident semantics; high request volume from one tenant cannot starve others under shared infrastructure.

Enforce per-tenant/platform concurrency, provider/harness concurrency, spend and long-running slot limits using existing control-plane/ledger mechanisms. Backpressure never causes duplicate submissions. Queue age triggers revalidation of approval, capability reuse, project context and budget before dispatch because an old plan may have become unnecessary or unsafe.

## R3.9 Extensible artifact classes and non-code evolution boundary [Audit 09]

Future Product Evolution may yield Skills, Workflows, Mini Apps, Web Apps, platform code, evaluation packs, data transformations, research notebooks or simulation adapters. Spec 235 routes only artifacts for which a certified development ingress/release owner exists. Pure research questions, analysis-only experiments or knowledge updates remain in Spec 233/appropriate research runtime and MUST NOT be forced into Spec 224 just because they originated from a capability gap.

Artifact descriptors are versioned/extensible and include `artifactClass`, `ownerSpec`, `developmentIngressProfile`, `releaseOwner`, `verificationProfile` and `promotionPolicy`. Unknown artifact classes fail with `NO_CERTIFIED_DEVELOPMENT_ROUTE` while preserving the approved plan for future capability, rather than coercing them into `PLATFORM_CORE`.

## R3.10 Release-attestation finality, rollback evidence and second-cycle certification [Audit 10]

The terminal bridge view SHALL distinguish at least `DEVELOPMENT_VERIFIED`, `RELEASE_APPROVED`, `DEPLOYED`, `CAPABILITY_ATTESTED`, `AVAILABLE_TO_SCOPE`, `ROLLED_BACK`, `REVOKED` and `SUPERSEDED`. Only the canonical capability/release authority can establish availability. A rollback/revoke event propagates to Spec 233 coverage and optional Spec 234 impact processing while preserving the historical run as successfully/unsuccessfully verified according to 224; deployment rollback must not rewrite development history.

R3 certification adds: rolling 224 ingress version upgrade; context drift after approval; multi-run partial failure; human commit during run; private→platform promotion denied by provenance; orphan saga reconciliation; environment/toolchain drift invalidation; capacity queue aging; unsupported future artifact; capability rollback after successful deployment; plus all R2 tests. Feature flags SHALL independently stop new handoffs, private handoffs, Platform Core handoffs and release-correlation automation. Turning Spec 235 off leaves Spec 224 and Spec 233 independently usable.

## R3 consolidated invariants

1. Spec 224 is an in-progress canonical development authority and is never modified by this bridge spec.
2. Every write uses a capability-probed, certified, pinned ingress profile.
3. Running development uses approved immutable context snapshots; mutable project memory cannot silently change scope.
4. One proposal may map to multiple runs only through an explicit bounded run graph with no new execution authority.
5. Concurrent human/agent changes require stale-base reconciliation before merge/release.
6. Private artifacts remain private unless explicit provenance/IP/data promotion gates pass.
7. Cross-system failure is reconciled as a saga; bridge rows cannot fake rollback of irreversible effects.
8. Reproducibility/evidence lineage spans proposal through release attestation without rewriting history.
9. Capacity/budget queues trigger freshness revalidation before delayed dispatch.
10. Non-code research/knowledge evolution is not forced into Spec 224; unsupported artifact classes wait for a certified route.
