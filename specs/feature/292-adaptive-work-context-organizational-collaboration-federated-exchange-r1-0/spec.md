# Spec 292 — SmartAIHub Adaptive Work Context, Organizational Collaboration & Federated Work Exchange

**Revision:** R1.1 — additive SPEC-302 Project identity alignment
**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Scope:** Platform-wide Work Context, multi-human/multi-assistant collaboration, responsibility routing, multi-session project communication, durable handoff and cross-tenant work exchange  
**Primary owner:** Work Context & Organizational Collaboration layer  
**Canonical Project authority:** MUST be discovered at G0 and reused; this spec MUST NOT create a second Project SoT  
**Canonical Assistant authority:** Spec 269  
**Canonical Memory authority:** Spec 268  
**Canonical Knowledge/Evidence authority:** Spec 266  
**Canonical Retrieval:** Spec 229  
**Canonical command ingress:** Spec 279  
**Canonical job authority:** worker_jobs / worker_job_events  
**Implemented read-only dependencies:** Specs 206, 208, 224, 256
**Recovery provenance:** previous_draft_id=282; renumber_reason=SPEC_ID_COLLISION; original_title="SmartAIHub Adaptive Work Context, Organizational Collaboration & Federated Work Exchange"; original_path="specs/feature/282-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md"; original_sha256="5c82aa08ce1887544d7172b0f4be4f2d272f90152101d0dae7b8be06121492a6"; recovery_source="primary-checkout recovered candidate copied to canonical Spec 292".

## 0. Executive decision

SmartAIHub SHALL organize collaboration around an adaptive **Work Context** rather than around one chat application, one bot owner, one company workflow, or one fixed tool stack.

A Work Context may bind many:

- human principals;
- organizational roles;
- SmartAIHub Assistants;
- external agents;
- conversation sessions;
- structured sources;
- documents/artifacts;
- tasks/work items;
- meetings;
- external organizations/tenants.

The same foundation must support Projects that use completely different vocabularies, people and tools.


## Implemented dependency boundary — mandatory

The following owners are already implemented and are **READ-ONLY** for this program:

- **Spec 206** — A2A-first Hybrid External Agent Interoperability
- **Spec 208** — Hybrid Computer Use / Dynamic Capability Routing
- **Spec 224** — Development Orchestrator Runtime
- **Spec 256** — Skill-First Capability Discovery / Intent Execution

A requirement that touches one of these owners MUST be implemented through an additive adapter, projection, compatibility contract, read model, or consumer-side metadata contract. It MUST NOT redefine the implemented owner's semantics or create a competing authority.

## Cross-program invariants

```text
PROJECT ≠ CHAT SESSION
CHAT HISTORY ≠ MEMORY
CHAT TRANSCRIPT ≠ TASK SOURCE OF TRUTH

MCP ≠ CAPABILITY
A2A ≠ BUSINESS AUTHORIZATION
EXTERNAL AGENT ≠ HUMAN PRINCIPAL
EXTERNAL AGENT MEMORY ≠ SMARTAIHUB MEMORY
EXTERNAL AGENT SUMMARY ≠ CANONICAL FACT

VECTOR MATCH ≠ ANSWER
VECTOR INDEX ≠ SOURCE OF TRUTH
RAG CHUNK ≠ CURRENT OPERATIONAL STATE
SEMANTIC SIMILARITY ≠ TRUTH

CLAIM ≠ FACT
FACT ≠ CURRENT OPERATIONAL STATE
LATEST ≠ MOST SEMANTICALLY SIMILAR

ATTACHMENT ≠ CHANNEL-OWNED OBJECT
FILENAME ≠ DOCUMENT IDENTITY
SUMMARY ≠ ORIGINAL DOCUMENT
OCR TEXT ≠ ORIGINAL DOCUMENT
EMBEDDING ≠ DOCUMENT BACKUP

EPHEMERAL SOURCE ≠ DURABLE STORAGE
PRESERVE FIRST, INDEX SECOND

MESSAGE ≠ HANDOFF
ASSISTANT CHATTER ≠ WORK PROGRESS
APPROVAL CANDIDATE ≠ FORMAL APPROVAL

RELEVANCE ≠ AUTHORIZATION
CAPABILITY_UNAVAILABLE MAY FALL BACK
PERMISSION_DENIED MUST NOT BE BYPASSED BY LOWER-LEVEL UI AUTOMATION

CROSS-TENANT EXCHANGE ≠ CROSS-TENANT MEMORY ACCESS

EVERY MATERIAL RESPONSIBILITY TRANSFER MUST LEAVE A DURABLE RECEIPT
EVERY MATERIAL ANSWER MUST BE TRACEABLE TO SUPPORTING EVIDENCE
```


## 1. Goals

1. Represent many humans and many assistants without collapsing identity.
2. Allow a single Project to contain many conversation/work sessions.
3. Route responsibility by role/department/team instead of hard-coded user IDs.
4. Make every meaningful responsibility transfer durable and searchable.
5. Support executive visibility without forcing executives into every chat.
6. Support existing external channels during gradual migration.
7. Support native and cross-tenant work exchange without memory leakage.
8. Preserve private internal deliberation while sharing explicit external work.
9. Keep Chat as communication/work navigation, not task/memory/approval SoT.
10. Remain tool-neutral and project-specific.

## 2. Non-goals

Spec 292 does NOT:

- create a workflow engine;
- create a scheduler/job queue;
- create an authorization service;
- create a memory store;
- create an evidence store;
- create a retrieval engine;
- create an MCP/A2A implementation;
- create a Browser/Computer engine;
- redefine Project authority.

## 3. Adaptive Work Context

```ts
interface WorkContextProfile {
  workContextId: string;
  tenantRef: string;
  canonicalProjectRef?: string;
  contextType: 'PROJECT'|'CASE'|'ENGAGEMENT'|'EVENT'|'CAMPAIGN'|'OPERATION'|'OTHER';

  title: string;
  lifecycle: 'PLANNING'|'ACTIVE'|'EXECUTING'|'CLOSING'|'COMPLETED'|'ARCHIVED';

  vocabularyProfileRef?: string;
  participantRefs: string[];
  assistantBindingRefs?: string[];
  externalAgentBindingRefs?: string[];
  responsibilityBindingRefs?: string[];
  sourceBindingRefs?: string[];

  collaborationPolicyRef: string;
  visibilityPolicyRef: string;
  federationPolicyRef?: string;
  retentionPolicyRef?: string;

  createdAt: string;
  updatedAt: string;
}
```

If an existing Project entity exists, `canonicalProjectRef` is mandatory and owns Project lifecycle/state. WorkContextProfile is a collaboration projection.

## 4. Participants

```ts
type ParticipantKind =
  | 'HUMAN'
  | 'SMARTAIHUB_ASSISTANT'
  | 'EXTERNAL_AGENT'
  | 'EXTERNAL_ORGANIZATION';

interface WorkParticipantBinding {
  bindingId: string;
  workContextRef: string;
  participantKind: ParticipantKind;
  principalOrAgentRef: string;
  roleKeys?: string[];
  visibilityPolicyRef?: string;
  activeFrom: string;
  activeTo?: string;
}
```

External agent ≠ human principal.

## 5. Conversation fabric

One Work Context supports many sessions.

```ts
type ConversationSessionType =
  | 'DIRECT'
  | 'GROUP'
  | 'MEETING'
  | 'FUNCTIONAL_ROOM'
  | 'WORK_THREAD'
  | 'EXTERNAL_MIRROR'
  | 'FEDERATED';

interface ConversationSession {
  sessionId: string;
  workContextRef: string;
  type: ConversationSessionType;
  title: string;
  participantRefs: string[];
  assistantRefs?: string[];
  visibilityPolicyRef: string;
  relatedWorkItemRefs?: string[];
  parentSessionRef?: string;
  externalBindingRef?: string;
  openedAt: string;
  closedAt?: string;
}
```

Message types MAY include:

```text
MESSAGE
QUESTION
DECISION_CANDIDATE
DELEGATION_NOTICE
PROGRESS
HANDOFF_NOTICE
APPROVAL_NOTICE
RESULT
SYSTEM_EVENT
```

A message never becomes canonical approval/task state solely because of message type.

## 6. External channel binding

```ts
interface ExternalChannelBinding {
  bindingId: string;
  provider: string;
  externalConversationRef: string;
  tenantRef: string;
  workContextRef: string;
  sessionRef?: string;

  ingestionMode: 'REALTIME'|'IMPORT'|'FORWARD_ONLY'|'HYBRID';
  identityBindingPolicyRef: string;
  consentPolicyRef: string;
  retentionPolicyRef: string;
  capabilitySnapshotRef?: string;

  active: boolean;
}
```

Providers may include Gmail, LINE, WhatsApp, Slack, Teams, etc.

Display name alone MUST NOT resolve a participant identity.

## 7. Responsibility directory

```ts
interface ResponsibilityBinding {
  bindingId: string;
  workContextRef?: string;
  tenantRef: string;
  responsibilityKey: string;

  targetKind: 'HUMAN_PRINCIPAL'|'HUMAN_ROLE'|'TEAM'|'DEPARTMENT';
  targetRef: string;

  conditions?: {
    minAmount?: number;
    maxAmount?: number;
    riskClass?: string;
    projectRef?: string;
  };

  fallbackBindingRefs?: string[];
  activeFrom: string;
  activeTo?: string;
}
```

Examples:

```text
PROCUREMENT_APPROVER
WAREHOUSE_STOCK_OWNER
FINANCE_APPROVER_L1
FINANCE_APPROVER_L2
HR_MANAGER
CEO_FINAL_APPROVER
EVENT_DIRECTOR
STAGE_OWNER
```

Authorization remains canonical elsewhere.

## 8. Work handoff contract

```ts
interface WorkHandoffContract {
  handoffId: string;
  workContextRef: string;

  sourcePrincipalRef: string;
  sourceAssistantRef?: string;

  targetKind:
    | 'HUMAN_PRINCIPAL'
    | 'ASSISTANT'
    | 'HUMAN_ROLE'
    | 'DEPARTMENT'
    | 'TEAM'
    | 'APPROVAL_QUEUE'
    | 'WORKFLOW'
    | 'TASK_AGENT'
    | 'EXTERNAL_AGENT'
    | 'EXTERNAL_ORGANIZATION';

  targetRef?: string;
  requiredResponsibilityKey?: string;

  objective: string;
  parentGoalRef?: string;
  workItemRef?: string;

  requiredAction:
    | 'REVIEW'
    | 'EXECUTE'
    | 'APPROVE'
    | 'ACKNOWLEDGE'
    | 'PROVIDE_INPUT';

  completionContractRef?: string;
  contextPacketRef?: string;
  authorityRequirementRef?: string;
  returnRouteRef: string;

  state:
    | 'OFFERED'
    | 'ACCEPTED'
    | 'WORKING'
    | 'WAITING_HUMAN'
    | 'COMPLETED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CANCELLED';
}
```

## 9. Handoff receipt

Every material responsibility change SHALL leave an append-only receipt with:

```text
who transferred
who/which role received
what work
why
when offered
when accepted/rejected
when started
when completed
source/return route
task/delegation/approval refs
evidence/provenance refs
```

Corrections use supersession, not destructive rewrite.

## 10. Decision / approval separation

```text
ChatMessage
≠ WorkHandoffContract
≠ DecisionRequest
≠ ApprovalReceipt
```

Free-form “อนุมัติครับ” in chat MAY create an approval candidate, but formal approval occurs only through the owning approval authority.

## 11. Executive visibility

Roles:

```text
ACTIVE_PARTICIPANT
OBSERVER
PROJECT_MANAGER
EXECUTIVE_OBSERVER
AUDITOR
```

Per-session visibility:

```text
FULL
SUMMARY_ONLY
REDACTED
METADATA_ONLY
DENIED
```

Executive role does not override sensitive HR/legal/medical/whistleblower/private session policy.

## 12. Meeting model

Meeting sessions SHOULD preserve:

- agenda;
- participants/attendance;
- transcript/messages;
- artifacts;
- decisions;
- action items;
- approvals;
- unresolved questions;
- next meeting.

Assistants MAY draft minutes and candidate decisions/actions, but canonical work/approval systems own commitments.

## 13. Project digest

Digest composition MUST be incremental and source-linked:

```text
new events
→ session/source incremental state
→ material WorkEvents/decisions/artifacts
→ session daily summary
→ project reconciliation
→ executive digest
```

Priority:

```text
canonical WorkEvents
> approval/decision receipts
> task/job state
> artifacts/evidence
> meeting actions
> chat
> model inference
```

## 14. Cross-session conflict/dependency detection

The Project coordinator SHOULD detect:

- same deliverable with conflicting status;
- task dependency across rooms;
- promised document missing;
- handoff waiting too long;
- approval blocking another team;
- conflicting dates;
- duplicate responsibility;
- unassigned responsibility.

## 15. Federated tenant exchange

```ts
interface InterTenantWorkExchange {
  exchangeId: string;
  sourceTenantRef: string;
  destinationTenantRef?: string;
  destinationOrganizationRef?: string;

  workContextRef?: string;
  purpose:
    | 'QUOTATION'
    | 'PURCHASE'
    | 'SALES_ORDER'
    | 'MEDIA_REQUEST'
    | 'SERVICE_REQUEST'
    | 'CONTRACT'
    | 'SUPPORT'
    | 'CUSTOM';

  sourcePrincipalRef: string;
  destinationResponsibilityKey?: string;

  disclosurePolicyRef: string;
  artifactManifestRef?: string;
  commercialContextRef?: string;
  returnRouteRef: string;

  state:
    | 'DRAFT'
    | 'OFFERED'
    | 'DELIVERED'
    | 'ACCEPTED'
    | 'DECLINED'
    | 'WORKING'
    | 'WAITING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED';
}
```

## 16. Trust relationship

```text
UNCONNECTED
→ PENDING
→ CONNECTED
→ TRUSTED_PARTNER
```

Trust policy MAY constrain work types, data classes, artifact classes, retention and rate limits. Trust is not blanket authorization.

## 17. Shared vs private threads

A cross-tenant exchange MAY have:

```text
Shared Exchange Thread
+
Tenant A Private Internal Thread
+
Tenant B Private Internal Thread
```

Only explicitly disclosed events/artifacts cross the boundary.

## 18. External acquisition relationship

Spec 292 binds an external conversation/source to a Work Context. It does not implement acquisition.

Acquisition is performed through existing connectors/MCP/API and, when needed, implemented Spec 208, then normalized by Spec 284.

## 19. Notifications / waiting state

Waiting states MUST survive closed UI sessions and device changes.

The canonical job/work owner remains the source of state. Notifications are delivery projections.

## 20. Migration path

Organizations may progress:

```text
existing LINE/Gmail/Sheets
→ bind sources to Project
→ SmartAIHub summaries/search
→ structured handoff/approval
→ native collaboration where valuable
→ cross-tenant exchange
```

No forced channel migration is required.

## 21. Rollout

### Phase A
Same-tenant Project/Work Context + multi-session Chat + participants.

### Phase B
Responsibility directory + handoff receipts + My Work/Waiting views.

### Phase C
External channel bindings and executive digest.

### Phase D
Cross-tenant exchange, explicit disclosure and trust relationship.

## 22. Acceptance scenarios

1. Five departments collaborate on one event without one global chat.
2. CEO sees daily status without raw access to restricted HR room.
3. Procurement handoff targets current role owner, not a hard-coded user.
4. Staff reassignment changes new routing but preserves historical receipt.
5. Assistant prepares approval but cannot approve as human.
6. External LINE/Gmail conversation can bind to Project without becoming memory automatically.
7. Cross-tenant supplier receives only disclosed RFQ/artifacts.
8. Supplier private margin discussion remains private.
9. Project uses completely different vocabulary from another Project.
10. External agent appears as participant but not human authority.
11. Project close/archive preserves evidence/history according to policy.
12. Duplicate message delivery does not duplicate handoff state.


## 12-pass cross-spec gap audit

| Pass | Audit lens | Required closure |
|---|---|---|
| 1 | Canonical ownership | No duplicate Project, Job, Memory, Evidence, Retrieval, Auth, Capability, A2A or Browser/Computer authority |
| 2 | Principal identity | Human, Assistant, external agent and organization remain distinct and attributable |
| 3 | Project variability | Different Projects may use different vocabulary, people, bots, sources and workflows without schema forks |
| 4 | Authorization | Relevance/discovery never grants access; current authorization is checked before hydration/action |
| 5 | Temporal correctness | Current state, historical state, promise, observation and forecast remain distinguishable |
| 6 | Evidence/provenance | Claims and answers remain traceable to source/evidence/artifact versions |
| 7 | Artifact continuity | Expiring/external documents can be preserved, versioned, deduplicated and recovered |
| 8 | Retrieval quality | Structured, semantic, temporal, graph and live-source retrieval are composed rather than replaced by vector similarity |
| 9 | External agents/protocols | MCP/A2A/provider capability discovery does not grant business authority or silently import foreign memory |
| 10 | Failure/fallback | Unsupported/incomplete capability may fall back; denial/policy rejection cannot be bypassed |
| 11 | Multi-tenant/privacy | Cross-tenant collaboration uses explicit disclosure; private deliberation/memory stays private |
| 12 | Operability | Incremental checkpoints, stale-source detection, idempotency, cost budgets, mobile UX and rollback are testable |

A release candidate FAILS if any pass is unresolved without an explicit owner, blocker and rollback-safe mitigation.

## R1.1 Additive SPEC-302 Project identity alignment — 2026-10-07

SPEC-302 defines the canonical cross-domain Project identity and explicit domain/App bindings. `WorkContext` and its collaboration/profile projections remain owned by SPEC-292 and MUST NOT become the global Project identity, ACL, or domain lifecycle authority. WorkContext MAY reference `canonicalProjectId` and `ProjectAppBinding`; the reference is valid only with tenant scope, current authorization, and a binding receipt. Cross-app navigation MUST preserve the canonical project reference while rechecking app and project permissions. A project switch creates a new effective context/conversation segment; it MUST NOT rewrite prior messages, handoffs, or memory. `No Project`, ambiguous, and pending scope remain valid states. This amendment supersedes the earlier instruction to discover an unspecified Project authority at G0, without rewriting historical citations or evidence.
