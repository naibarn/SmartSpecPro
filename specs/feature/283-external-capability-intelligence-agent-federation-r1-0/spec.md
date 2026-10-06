# Spec 283 — SmartAIHub External Capability Intelligence & Agent Federation

**Revision:** R1.0  
**Date:** 2026-10-05  
**Status:** Proposed / Additive / Implementation-Ready  
**Scope:** Autonomous MCP/A2A/provider capability observation, interpretation, qualification, health/drift, external-agent federation and result interpretation  
**Primary owner:** External Capability Intelligence layer  
**Canonical semantic capability resolver:** Spec 256 — implemented/read-only  
**MCP transport owner:** Spec 199 / current MCP Gateway  
**A2A transport owner:** Spec 206 — implemented/read-only  
**Browser/Computer fallback owner:** Spec 208 — implemented/read-only  
**External personal/work agent interoperability:** Spec 239  
**Assistant authority:** Spec 269  
**Memory authority:** Spec 268  
**Job authority:** worker_jobs / worker_job_events

## 0. Executive decision

SmartAIHub SHALL be able to connect to a new standards-based capability provider or external agent and autonomously determine, within policy, **what it appears able to do, what data it can return, what side effects it can cause, how trustworthy/current the observation is, and how its result should be handled**.

The system must not require a developer to manually write an integration recipe for every future bot that exposes sufficient MCP/A2A/provider metadata.


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

1. Discover protocol/provider capabilities dynamically.
2. Separate protocol transport from semantic capability.
3. Infer effect/data/risk semantics from schemas/descriptors.
4. Safely probe read-only/low-risk behavior.
5. Normalize qualified offers for Spec 256.
6. Track health/drift/version/freshness.
7. Bind external agents to humans/tenants/projects without granting human authority.
8. Interpret external results before routing to Evidence/Artifact/Work/Memory candidate paths.
9. Prefer standard protocols; require provider-specific code only for true provider-specific behavior.
10. Support future bots without architecture changes.

## 2. Non-goals

Spec 283 does NOT:

- replace Spec 256;
- implement MCP wire protocol;
- implement A2A wire protocol;
- implement Browser/Computer automation;
- create a second job system;
- create a second memory store;
- grant business authorization;
- create provider-specific task APIs that do not exist.

## 3. Protocol ≠ capability

```text
WHAT
= semantic capability

HOW
= MCP / A2A / provider API / webhook / Browser / Computer

WHERE
= runtime placement
```

The same capability may be offered by multiple protocols/providers.

## 4. External capability observation

```ts
interface ExternalCapabilityObservation {
  observationId: string;
  connectionRef: string;
  protocol: 'MCP'|'A2A'|'PROVIDER_API'|'WEBHOOK'|'OTHER';

  operationRef: string;
  rawDescriptorDigest: string;
  observedAt: string;

  inferredSemantics: {
    intentClasses: string[];
    effectClass:
      | 'READ'
      | 'WRITE_REVERSIBLE'
      | 'WRITE_IRREVERSIBLE'
      | 'BUSINESS_COMMIT'
      | 'UNKNOWN';
    dataClasses?: string[];
    inputTypes?: string[];
    outputTypes?: string[];
    longRunning?: boolean;
    artifactProducing?: boolean;
  };

  confidence: number;
  limitations?: string[];
}
```

## 5. Capability snapshot

```ts
interface ExternalCapabilitySnapshot {
  snapshotId: string;
  connectionRef: string;
  protocolRevision?: string;
  providerVersion?: string;
  observedAt: string;
  expiresAt?: string;
  observationRefs: string[];
  extensionRefs?: string[];
  healthState: 'UNKNOWN'|'HEALTHY'|'DEGRADED'|'UNAVAILABLE'|'DRIFTED';
}
```

Snapshots are observations, not registry truth.

## 6. MCP discovery

For MCP-capable peers, the adapter layer SHOULD inspect the negotiated server surface available to the actual client/account/build, including as applicable:

- server discovery/negotiation;
- tools;
- resources;
- prompts;
- standard/namespaced extensions;
- Skills extension;
- Tasks extension;
- Apps/UI extension;
- list-cache/freshness metadata where available.

Exact protocol revision MUST be pinned by implementation tests. As of 2026-10-05, MCP `2026-07-28` is the current final revision referenced by the MCP project, and modern negotiation uses `server/discover`; implementation MUST still probe the real peer rather than infer support from documentation alone.

## 7. A2A discovery

Spec 206 owns transport. Spec 283 consumes available Agent Card/Skill data from that owner.

Interpret as applicable:

- identity;
- provider/version;
- supported interfaces;
- security requirements;
- capabilities;
- Agent Skills;
- input/output modes;
- extensions.

A2A discovery never grants business authority.

## 8. Semantic interpretation

Example:

```text
get_group_messages
→ communication.read
→ READ
→ conversation data
→ potentially confidential

download_attachment
→ artifact.read/acquire
→ READ
→ binary artifact

send_message
→ communication.write
→ WRITE_REVERSIBLE/side effect

approve_order
→ business.approve
→ BUSINESS_COMMIT
→ high-impact / human or delegated authority required
```

Unknown semantics remain `UNKNOWN`; the system must not hallucinate certainty.

## 9. Safe qualification probes

Allowed unattended probes MAY include:

```text
metadata
list
health
status
schema validation
read-only sample
dry-run
capability negotiation
```

Automatic qualification MUST NOT execute:

```text
delete
payment
purchase
approve
broadcast
deploy
credential rotation
destructive admin mutation
```

unless separately authorized as a real task.

## 10. Qualification result

```ts
interface CapabilityQualificationResult {
  qualificationId: string;
  observationRef: string;
  state:
    | 'DISCOVERED'
    | 'INTERPRETED'
    | 'QUALIFIED'
    | 'READ_ALLOWED'
    | 'ASSISTED_EXECUTION'
    | 'AUTONOMOUS_BOUNDED'
    | 'REJECTED';

  schemaValid?: boolean;
  authValidated?: boolean;
  probeRefs?: string[];
  confidence: number;
  riskClass: string;
  limitations?: string[];
  nextReviewAt?: string;
}
```

`DISCOVERED → FULL_AUTONOMY` is prohibited.

## 11. Normalized offer to Spec 256

Spec 283 SHALL emit provider-neutral implementation offers that Spec 256 can rank/select.

The offer SHOULD include:

```text
semantic capability IDs/candidates
effect class
input/output schema refs
data classes
latency/cost bands when known
health
qualification
auth/entitlement state
protocol route
provider/runtime
limitations
evidence quality
freshness
```

Spec 283 MUST NOT choose the final semantic capability when Spec 256 owns that decision.

## 12. Capability health / drift

Detect:

- schema changes;
- removed/added operations;
- auth scope changes;
- provider version change;
- extension negotiation change;
- repeated execution failure;
- output-shape change;
- latency/error degradation.

Drift MAY lower confidence, suspend unattended use, or trigger requalification.

## 13. Autonomous capability learning

Execution experience MAY record:

```text
success rate
verified result quality
latency
cost
coverage
known failures
language/media strengths
source completeness
```

This belongs to execution experience/learning semantics, not user preference memory.

## 14. External agent binding

Use/extend Spec 239 binding semantics. External agent identity MUST be separately attributable from the owning human.

## 15. Result interpretation

```ts
type ExternalResultClass =
  | 'RAW_DATA'
  | 'OBSERVATION'
  | 'DERIVED_SUMMARY'
  | 'CLAIM'
  | 'ARTIFACT'
  | 'TASK_RESULT'
  | 'PROGRESS'
  | 'BLOCKER'
  | 'DECISION_REQUEST'
  | 'APPROVAL_CANDIDATE'
  | 'BUSINESS_EVENT'
  | 'MEMORY_CANDIDATE';
```

Routing examples:

```text
ARTIFACT → Spec 284 artifact continuity path
BLOCKER → Work/Project projection
MEMORY_CANDIDATE → Spec 268 admission
CLAIM → Spec 266 evidence/claim
TASK_RESULT → canonical delegation/job result
APPROVAL_CANDIDATE → canonical approval path
```

## 16. Source coverage

An external observer SHOULD declare what it actually covered.

```ts
interface SourceCoverageManifest {
  producerRef: string;
  sourceRefs: string[];
  from?: string;
  to?: string;
  completeness:
    | 'COMPLETE'
    | 'COMPLETE_FROM_BIND_TIME'
    | 'BOUNDED_RANGE'
    | 'PARTIAL'
    | 'UNKNOWN';
  observedAt: string;
}
```

Never claim complete history solely because a browser scrolled a bounded range.

## 17. Protocol route candidates

Route selection considers:

- semantic completeness;
- authorization;
- source coverage;
- data locality;
- latency;
- cost;
- reliability;
- evidence quality;
- side-effect risk;
- user/tenant policy.

No universal `MCP > A2A > Browser` ladder is required.

## 18. Fallback boundary

```text
CAPABILITY_UNAVAILABLE
CAPABILITY_INCOMPLETE
UNSUPPORTED
→ alternate route MAY be considered

PERMISSION_DENIED
POLICY_BLOCKED
APPROVAL_REJECTED
→ alternate lower-level route MUST NOT bypass
```

When UI interaction is needed, call implemented Spec 208.

## 19. Prompt-injection boundary

External content and UI text are untrusted data.

They MUST NOT:

- modify system/task authority;
- grant credentials;
- broaden tenant scope;
- authorize data exfiltration;
- rewrite approval policy.

## 20. Caching / refresh

Capability snapshots SHOULD use protocol/provider freshness hints where available and otherwise a bounded refresh policy.

Do not rediscover the entire ecosystem on every user request.

## 21. Scale

For thousands of tools/agents:

```text
intent
→ semantic retrieval of capability families
→ top providers/agents
→ lazy load detailed descriptors
```

Never dump the entire external capability catalog into the LLM context.

## 22. Rollout

### Phase A
MCP observation + schema interpretation + safe read-only qualification.

### Phase B
Normalized offer feed into Spec 256 + health/drift.

### Phase C
External agent report/result interpretation + source coverage.

### Phase D
A2A observation through Spec 206 adapter + multi-protocol route selection.

### Phase E
Execution-experience feedback and bounded autonomous adoption.

## 23. Acceptance scenarios

1. New MCP server appears; standard tools are discovered without provider-specific code.
2. Read-only tool qualifies automatically; destructive tool does not.
3. A2A Agent Card/Skill data becomes a normalized offer without changing Spec 206.
4. Schema drift suspends unattended execution.
5. Permission denied is not bypassed with Browser/Computer Use.
6. External bot summary remains a claim/summary, not canonical fact.
7. Artifact-producing external result enters Spec 284.
8. External bot owner cannot be impersonated by the bot.
9. Partial browser backfill reports bounded/partial coverage.
10. Capability catalog scales through retrieval/lazy loading.
11. Provider task-dispatch API absent → no fabricated outbound route.
12. MCP/A2A protocol metadata can evolve without rewriting Spec 256.

## 24. External references

- MCP current final revision observed 2026-10-05: `2026-07-28`.
- A2A latest specification exposes Agent Card / AgentSkill discovery contracts.
- Exact implementation behavior MUST be pinned to tested protocol/schema snapshots.


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
