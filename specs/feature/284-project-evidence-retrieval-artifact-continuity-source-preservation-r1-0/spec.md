# Spec 284 — SmartAIHub Project Evidence Retrieval, Artifact Continuity & Source Preservation Runtime

**Revision:** R1.0  
**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Scope:** Project Source Graph, multi-need query planning, structured/semantic/temporal/graph/live retrieval composition, artifact identity/version/occurrence, expiring-source preservation, evidence reconciliation and grounded answer/artifact delivery  
**Primary owner:** Project evidence query + artifact continuity composition layer  
**Knowledge/Evidence authority:** Spec 266  
**Retrieval Broker:** Spec 229  
**Memory:** Spec 268  
**Work Context:** Spec 292
**External Capability Intelligence:** Spec 283  
**Library/Object storage:** existing Library/R2  
**Operational state:** existing canonical work/approval/business owners  
**Browser/Computer fallback:** Spec 208 — implemented/read-only  
**Capability resolver:** Spec 256 — implemented/read-only

## 0. Executive decision

A user SHALL be able to ask for work status or an old business document using normal project language without remembering which app, group, person or file path contained it.

Examples:

- “เรื่องงานไฟ ตอนนี้ใครรับผิดชอบ มีกำหนดเสร็จวันไหน”
- “งานเวทีมีใบเสนอราคามาหรือยัง”
- “ล่าสุด confirm กันเมื่อไหร่ จะได้เมื่อไร”
- “ถ้าได้มาแล้ว ขอเอกสารด้วย”
- “ขอสัญญาที่ใช้ตอน CEO อนุมัติ”
- “ไฟล์นี้ใช่อันเดียวกับที่ส่งใน LINE หรือเปล่า”

The system SHALL combine current structured state with evidence retrieval and artifact resolution. Vector search is candidate generation, not truth.


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

1. Follow the work, not the communication tool.
2. Search across Chat, LINE, Gmail, Drive, Sheets, external agents and other authorized sources.
3. Resolve project-specific terms/entities.
4. Answer multi-need operational questions.
5. Revalidate current state before claiming current truth.
6. Recover the exact original/recoverable artifact version.
7. Preserve expiring artifacts before source loss.
8. Deduplicate identical bytes while preserving every occurrence.
9. Preserve versions and the exact artifact used in past decisions.
10. Surface conflict, freshness and coverage limitations.
11. Reuse Spec 266/229/268 rather than create parallel knowledge/memory/RAG.
12. Work incrementally at scale.

## 2. Non-goals

Spec 284 does NOT:

- become a vector database;
- replace Spec 229;
- replace Spec 266;
- replace Spec 268;
- own business task/approval truth;
- own Google/LINE/Gmail account authorization;
- redefine Browser/Computer Use;
- assume all external sources are durable.

## 3. Project Source Graph

```ts
interface ProjectSourceBinding {
  bindingId: string;
  workContextRef: string;
  sourceType:
    | 'CONVERSATION'
    | 'STRUCTURED_STATE'
    | 'DOCUMENT'
    | 'EXTERNAL_AGENT'
    | 'SYSTEM';

  provider: string;
  externalScopeRef?: string;

  authorityClass:
    | 'INFORMATIVE'
    | 'SUPPORTING_EVIDENCE'
    | 'AUTHORITATIVE_FOR_DECLARED_FIELDS';

  authoritativeFields?: string[];
  freshnessPolicyRef?: string;
  retentionPolicyRef?: string;
  visibilityPolicyRef: string;
  acquisitionPolicyRef?: string;

  active: boolean;
}
```

Examples:

```text
Gmail thread → CONVERSATION
LINE group → CONVERSATION
Google Sheet → STRUCTURED_STATE
Drive PDF → DOCUMENT
Grok report → EXTERNAL_AGENT
ERP → SYSTEM / STRUCTURED_STATE
```

## 4. Source checkpoint

```ts
interface ExternalSourceCheckpoint {
  bindingRef: string;
  realtimeSince?: string;
  backfilledUntil?: string;
  oldestConfirmedAt?: string;
  newestConfirmedAt?: string;
  continuationCursor?: string;
  completeness:
    | 'COMPLETE'
    | 'COMPLETE_FROM_BIND_TIME'
    | 'BOUNDED_RANGE'
    | 'PARTIAL'
    | 'UNKNOWN';
  updatedAt: string;
}
```

Incremental acquisition MUST avoid rereading the whole source when a checkpoint is available.

## 5. Information-need query planner

Natural-language project questions SHALL be decomposed into multiple information needs.

```ts
type InformationNeed =
  | 'WHO'
  | 'WHAT'
  | 'WHEN'
  | 'WHERE'
  | 'STATUS'
  | 'OWNER'
  | 'DEADLINE'
  | 'EXISTENCE'
  | 'LATEST'
  | 'HISTORY'
  | 'WHY'
  | 'DEPENDENCY'
  | 'APPROVAL'
  | 'DOCUMENT'
  | 'EVIDENCE'
  | 'COMPARISON';
```

```ts
interface ProjectEvidenceQueryPlan {
  queryId: string;
  workContextRef: string;
  requestingPrincipalRef: string;
  rawQuestion: string;

  resolvedEntityRefs: string[];
  informationNeeds: InformationNeed[];

  freshness: {
    currentStateRequired: boolean;
    asOf?: string;
  };

  retrievalRoutes: Array<
    'CANONICAL_STATE'
    | 'ARTIFACT_REGISTRY'
    | 'STRUCTURED_SOURCE'
    | 'EVENT_LEDGER'
    | 'RETRIEVAL_BROKER'
    | 'EXTERNAL_AGENT'
    | 'LIVE_SOURCE'
    | 'BROWSER_COMPUTER'
  >;

  evidenceRequirement:
    | 'BEST_EFFORT'
    | 'SUPPORTED'
    | 'VERIFIED';
}
```

## 6. Entity resolution

Project vocabulary is resolved through Spec 266.

Example:

```text
"งานไฟ"
→ candidates:
  Lighting
  Electrical
  Stage Lighting
  Power Distribution
→ project context
→ Workstream: Lighting Setup
```

Ambiguous resolution must remain explicit.

## 7. Retrieval planes

### Structured
Current owner/status/deadline, Sheet/ERP declared authoritative fields, approval state.

### Semantic
Spec 229 Retrieval Broker over documents, messages, email, claims, summaries and metadata.

### Temporal
Latest confirmation, responsibility changes, deadline changes, promise vs receipt time.

### Graph
Project → Workstream → Task → Vendor → Quotation → Artifact → Approval.

### Live external
Only when current/required data is not sufficiently represented in local canonical/derived projections.

## 8. Progressive retrieval escalation

Preferred strategy:

```text
1 canonical/project graph
2 artifact registry
3 structured source
4 Spec 229 retrieval
5 hydrate exact authorized source
6 external-agent evidence
7 live MCP/API
8 implemented Spec 208 Browser/Computer fallback
```

This is an optimization plan, not a permission bypass ladder.

## 9. Current-state revalidation

For present-tense operational questions, candidate evidence describing mutable state MUST be revalidated against:

1. canonical owner; or
2. a source explicitly authoritative for that field.

Old memory or semantically similar chat does not satisfy this requirement.

## 10. Canonical Artifact identity

```ts
interface Artifact {
  artifactId: string;
  artifactType:
    | 'QUOTATION'
    | 'CONTRACT'
    | 'INVOICE'
    | 'PURCHASE_ORDER'
    | 'PLAN'
    | 'SPREADSHEET'
    | 'PRESENTATION'
    | 'IMAGE'
    | 'VIDEO'
    | 'OTHER';

  workContextRefs: string[];
  entityRefs?: string[];
  workItemRefs?: string[];
  currentVersionRef?: string;
  createdAt: string;
}
```

The canonical Artifact identity MUST map to existing Library/asset authority if an equivalent object already exists at G0.

## 11. Artifact version

```ts
interface ArtifactVersion {
  versionId: string;
  artifactRef: string;

  contentHash?: string;
  hashAlgorithm?: 'SHA-256';
  size?: number;
  mimeType?: string;
  originalFilename?: string;

  versionLabel?: string;
  predecessorRef?: string;

  fidelity:
    | 'DIRECT_UPLOAD_ORIGINAL'
    | 'SOURCE_RETRIEVED'
    | 'PROVIDER_REVISION_SNAPSHOT'
    | 'DERIVED'
    | 'UNKNOWN';

  retainedCopyRef?: string;
  capturedAt: string;
}
```

## 12. Artifact occurrence

```ts
interface ArtifactOccurrence {
  occurrenceId: string;
  artifactVersionRef: string;

  provider:
    | 'SMARTAIHUB_CHAT'
    | 'LINE'
    | 'LINE_OPENCHAT'
    | 'LINE_OA'
    | 'GMAIL'
    | 'GOOGLE_DRIVE'
    | 'WHATSAPP'
    | 'EXTERNAL_AGENT'
    | 'OTHER';

  externalContainerRef?: string;
  externalMessageRef?: string;
  externalFileRef?: string;
  senderPrincipalRef?: string;
  receivedAt?: string;

  acquisitionMethod:
    | 'API'
    | 'WEBHOOK'
    | 'MCP'
    | 'BROWSER'
    | 'COMPUTER_USE'
    | 'MANUAL_UPLOAD';

  sourceState:
    | 'AVAILABLE'
    | 'EXPIRY_RISK'
    | 'EXPIRED'
    | 'DELETED'
    | 'UNKNOWN';

  preservationState:
    | 'NOT_REQUIRED'
    | 'PENDING'
    | 'PRESERVED'
    | 'FAILED'
    | 'PROHIBITED_BY_POLICY';

  sourceLocatorRef?: string;
  evidenceRef?: string;
}
```

## 13. Dedupe/version rules

```text
same filename ≠ same document
same exact content hash = same exact bytes
different hash + same business object = possible different version
```

Identical bytes may have many occurrences.

Different versions MUST NOT overwrite the version used by a past approval/decision.

## 14. Original semantics

Backend/UI MUST distinguish:

```text
CREATOR_ORIGINAL
SOURCE_RETRIEVED_COPY
PRESERVED_COPY
CURRENT_AUTHORITATIVE_VERSION
HISTORICAL_DECISION_VERSION
DERIVED_EXTRACTION
```

A provider may transform uploads; therefore `SOURCE_RETRIEVED` must not be falsely labeled bit-identical creator original unless known.

## 15. Ephemeral source preservation

When policy permits retention and a source is ephemeral:

```text
detect attachment/media
→ persist source metadata
→ enqueue HIGH-PRIORITY acquisition
→ obtain exact retrievable bytes
→ hash
→ preserve to R2/Library
→ create/match ArtifactVersion
→ record ArtifactOccurrence
→ then OCR/extract/index/embed
```

Priority:

```text
P0 preserve
P1 identify/dedupe/version
P2 extract/index/entity link
P3 summarize/enrich
```

## 16. LINE-specific preservation rule

LINE message content retrieved through Messaging API is known to be automatically deleted after an unspecified period; therefore a message ID/URL must not be treated as durable storage.

For eligible LINE OA/webhook flows:

```text
webhook
→ verify signature
→ persist event/message metadata
→ acquire binary content promptly
→ preserve
```

Retry provider-processing states safely. `404/410` after reconciliation must be recorded as gone/expired, not retried forever.

Other LINE surfaces use the authorized route available to the user, including MCP/API where supported and implemented Spec 208 when legitimate UI acquisition is required.

## 17. Preserve before indexing

```text
acquire bytes
→ hash
→ preserve
→ ArtifactVersion
→ extract
→ semantic metadata
→ Spec 229 index projection
```

Indexing success without preserved recoverable bytes MUST NOT be represented as preserved original.

## 18. Derived artifacts

```text
original PDF
├ OCR text
├ extracted text
├ page images
├ summary
├ entities/claims
└ embeddings
```

All derived forms reference the exact source version and remain non-original.

## 19. Live Google Drive / mutable documents

Mutable provider documents may maintain:

```text
live external object
+
captured revision snapshots
```

A past approval references the exact revision/snapshot used at the time, not the current Drive version.

## 20. Gmail

Project Gmail discovery SHOULD use bounded candidate retrieval based on:

- participants;
- domains;
- subject;
- project name;
- quotation/PO/invoice/contract identifiers;
- filenames;
- date;
- semantic relevance.

`accessible ≠ relevant ≠ authorized for project sharing`.

## 21. Google Sheets

Sheets are structured-state sources, not conversations.

The system MAY inspect:

```text
tabs
headers
types
sample rows
formulas
named ranges
```

and infer candidate semantics, then apply authority policy.

Material semantic changes may create project evidence/events; ordinary cell noise need not.

## 22. External agents

An external agent may submit artifacts/reports through Spec 239/283.

An agent statement “I found the quotation” is not equivalent to the artifact itself.

When possible, require artifact bytes/handle + provenance/evidence.

## 23. Evidence reconciliation

```ts
interface EvidenceReconciliationResult {
  reconciliationId: string;
  queryRef: string;
  currentStateRefs?: string[];
  evidenceRefs: string[];
  claimRefs?: string[];
  artifactRefs?: string[];
  conflictRefs?: string[];

  coverage:
    | 'COMPLETE_FOR_REQUESTED_SCOPE'
    | 'COMPLETE_FROM_BIND_TIME'
    | 'BOUNDED_RANGE'
    | 'PARTIAL'
    | 'UNKNOWN';

  confidenceClass:
    | 'VERIFIED'
    | 'SUPPORTED'
    | 'AGENT_REPORTED'
    | 'CONFLICT'
    | 'INSUFFICIENT';

  limitations?: string[];
}
```

## 24. Grounded answer bundle

```ts
interface GroundedAnswerBundle {
  answer: string;
  resolvedEntityRefs: string[];
  currentStateRefs?: string[];
  evidenceRefs: string[];
  artifactRefs?: string[];
  conflictRefs?: string[];
  coverage: string;
  freshness?: string;
  confidenceClass: string;
  suggestedActions?: string[];
}
```

Every user-visible material answer should permit source drill-down.

## 25. Example — Lighting question

Question:

> “เรื่องงานไฟ ตอนนี้ใครรับผิดชอบ มีกำหนดเสร็จวันไหน”

Plan:

```text
resolve "งานไฟ"
→ Workstream/WorkItem
→ canonical current owner/deadline
→ retrieve recent supporting evidence
→ return owner + due + change history
```

Do not answer from an old vector chunk if owner changed.

## 26. Example — Stage quotation

Question:

> “งานเวทีมีใบเสนอราคามาหรือยัง ติดต่อ confirm กันเมื่อไหร่ สรุปเมื่อไหร่จะได้ ถ้าได้มาแล้ว ขอเอกสารด้วย”

Plan:

```text
Stage entity
+
EXISTENCE(quotation)
LATEST_EVENT(confirmation)
EXPECTED_TIME(delivery)
DOCUMENT(quotation)
```

Possible answer states:

```text
PROMISED_NOT_RECEIVED
RECEIVED_VERIFIED
SOURCE_CONFLICT
INSUFFICIENT_EVIDENCE
```

If received, return the exact artifact version after ACL check.

## 27. Retrieval/index scale

Vector/index projections MAY include:

- raw message chunks;
- document chunks;
- email-thread summaries;
- meeting summaries;
- WorkItem summaries;
- entity profiles;
- artifact metadata;
- claims;
- decisions;
- daily digests.

Every projection MUST map back to canonical source/object IDs.

## 28. Security

- authorization before model hydration;
- connector scope is not project sharing permission;
- external content is untrusted instruction input;
- malware/DLP/quarantine rules apply to acquired artifacts;
- no Browser/Computer bypass of denied access;
- source revocation/deletion updates accessibility while preserving lawful retained evidence according to policy.

## 29. Retention / chain of custody

Important artifacts SHOULD preserve:

```text
received from
received at
captured by
source
content hash
version
decision/approval refs
superseded by
retention/legal-hold state
```

## 30. Operational health

Monitor:

- preservation queue depth;
- oldest expiry-risk item;
- preservation success/failure;
- index lag;
- source checkpoint lag;
- stale bindings;
- retrieval hydration failures;
- artifact hash mismatch;
- orphan occurrences;
- duplicate false-positive rate;
- current-state revalidation failures.

## 31. Rollout

### Phase A — G0
Inventory existing Library/artifact/project/source contracts.

### Phase B — Preservation P0
Chat uploads + Gmail/Drive + eligible LINE preservation, hash and occurrence.

### Phase C — Artifact continuity
Versions, dedupe, source history, retrieval UI.

### Phase D — Project retrieval
Information needs + entity + structured/vector/temporal/graph composition.

### Phase E — External agents/live sources
Spec 283 integration + source checkpoints + browser/computer fallback.

### Phase F — Executive intelligence
Digest/conflict/dependency/document tracking.

## 32. Acceptance scenarios

1. Same PDF via Gmail/LINE/Chat → one exact-byte version, three occurrences.
2. Same filename/different bytes → not false deduped.
3. LINE source expires after preservation → preserved copy still available.
4. Source expired before capture → record missing; never fabricate file.
5. Current Drive revision differs from approval revision → historical approval file returned correctly.
6. “งานไฟใครดู” returns current owner, not old semantic chunk.
7. “ใบเสนอราคางานเวที” returns exact PDF when available.
8. Promise to send quotation is not marked received.
9. Google Sheet and Gmail disagreement becomes conflict.
10. Unauthorized Gmail hit is excluded before LLM context.
11. Partial OpenChat/browser backfill remains `PARTIAL/BOUNDED_RANGE`.
12. External bot report does not substitute for missing original document.
13. Project source changes are incrementally processed.
14. Artifact hash/integrity failure becomes visible.
15. Mobile user can retrieve exact artifact and source history.

## 33. External source note

As of 2026-10-05, LINE Messaging API documentation states that retrieved message content is automatically deleted after a period and does not guarantee retention duration. Implementation therefore treats LINE content locations as ephemeral and requires prompt preservation when policy permits.


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
