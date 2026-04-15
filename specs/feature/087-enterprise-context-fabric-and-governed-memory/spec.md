# 087 - Enterprise Context Fabric And Governed Memory

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 055-chat-memory-vector-rag, 056-agency-memory-vector-rag, 075-unified-web-desktop-agent-platform, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 082-work-os-case-ledger-and-operating-queues, 083-agent-registry-and-organization-model
Audience: Product, Memory/RAG, Workpack, Teams, Desktop Host, Security, QA

---

## 1. Executive summary

Smart AI Hub needs more than retrieval.
It needs a governed context fabric that can decide what an agent should know, why it should know it, and how trustworthy that context is.

Feature 087 adds that fabric by unifying:

- session memory
- work-item memory
- role memory
- organization memory
- approved long-term memory
- governed retrieval and evidence bundling

The product outcome is that agents see the right context for the right job, with provenance and policy attached.
The platform should also learn which context bundles actually helped the work so future retrieval can prefer higher-value memory and suppress low-value memory.

Context governance must remain tenant-scoped and user-team aware:

- system admins can define the top-level memory policy across tenants
- tenant admins can inspect and manage memory policy within their tenant
- regular users can create work and teams that inherit the correct memory scope
- team memory must not leak across tenant boundaries unless a policy explicitly allows it

---

## 2. Problem statement

The repo already has memory and RAG primitives:

- chat memory
- scoped memory routes
- library and search
- workpack source panels
- role-memory contracts
- local file intelligence from Feature 075

What is missing is a platform-wide policy for context assembly.

Without that layer:

- retrieval quality depends too much on ad hoc prompt assembly
- role agents may accumulate broad context without explicit justification
- cross-tenant or cross-domain leakage becomes harder to reason about
- stale, contradictory, or low-trust context can quietly contaminate work

---

## 3. Goals

1. Define canonical memory scopes for session, work, role, and organization context.
2. Add trust, freshness, and evidence rules to retrieved context.
3. Support governed context assembly by work type, agent type, and data class.
4. Give operators visibility into why a context bundle was selected.
5. Preserve strict tenant, project, and owner isolation.
6. Capture context utility so the system can improve what it retrieves next time.

---

## 4. Non-goals

1. This feature does not replace the existing vector stores.
2. This feature does not require one universal embedding model.
3. This feature does not allow role agents to read broadly by default.
4. This feature does not own run execution or approval logic; it supplies the governed memory layer that Feature 095 and Feature 084 consume.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/memoryService.ts` | Chat memory already exists | Add broader work, role, and organization memory layers |
| `apps/web/server/routers/memory.ts` and `scopedMemory.ts` | Scoped memory access already exists | Formalize the scope model and attach policy |
| `apps/web/server/services/libraryService.ts` | Library and retrieval already provide evidence sources | Add trust, freshness, and citation posture |
| `apps/web/server/services/roleMemoryService.ts` | Role memory work has started | Bind role memory into one governed context fabric |
| `apps/web/shared/roleMemoryContracts.ts` | Role memory contracts already exist | Extend them into a cross-product context-pack contract |
| `apps/web/server/routers/library.ts` and `search.ts` | Retrieval surfaces already exist | Add policy-aware retrieval assembly and explainability |

---

## 6. Locked product decisions

1. **Memory scope is explicit.**
   - Session, work, role, and organization memory are not interchangeable by default.

2. **Context should be justified.**
   - The platform should be able to explain why an item was included.

3. **Trust and freshness matter.**
   - Context retrieval is not only similarity ranking.

4. **Suppression is first-class.**
   - The platform must support expired, suppressed, or quarantined memory.

---

## 7. Core model

### 7.1 Memory scopes

| Scope | Purpose |
|---|---|
| `session_memory` | Short-lived conversational continuity |
| `work_memory` | Facts and artifacts linked to one work item or case |
| `role_memory` | Durable preferences and known patterns for one role agent |
| `org_memory` | Shared organizational reference material |
| `approved_long_term_memory` | Explicitly promoted durable memory |
| `suppressed_memory` | Memory that must not be injected automatically |
| `context_feedback_record` | Evidence that a memory item helped, hurt, or was unused in a run |

### 7.2 Context bundle metadata

Every context bundle must support:

- `source_type`
- `source_id`
- `scope_type`
- `trust_score`
- `freshness_score`
- `citation_required`
- `data_classification`
- `why_selected`
- `suppression_reason` when applicable
- `utility_signal`
- `contradiction_signal`
- `retention_hint`

---

## 8. Functional requirements

### 8.1 Context pack assembly

- The platform must assemble context packs by:
  - work type
  - agent type
  - data classification
  - tenant and project scope
- Context pack policies must support hard ceilings on size, cost, and retrieval breadth.

### 8.2 Retrieval governance

- Retrieval must support:
  - source trust scoring
  - freshness weighting
  - contradiction detection
  - stale-context warnings
  - citation requirements for regulated or high-risk work

### 8.3 Visibility

- Operators must be able to inspect a "why this context" view for important runs.
- Role-memory and work-memory changes must be auditable.

### 8.4 Context utility feedback

- Every important run should record whether a retrieved context item contributed to success, had no effect, or created friction.
- High-utility items can be promoted into approved long-term memory when policy allows and they remain fresh enough.
- Low-utility, contradictory, or repeatedly stale items should be suppressed or downgraded automatically.
- The system should prefer context bundles that have a proven relationship to better outcomes for the same workload class, while still respecting tenant and project boundaries.

---

## 9. Web and desktop responsibilities

### 9.1 Web control plane

- Web should own the canonical memory-scope policy, retrieval policy, trust scoring rules, citation posture, and suppression controls.
- Organization memory, work memory, and approved long-term memory governance should be managed primarily from the web control plane.
- The main "why this context" and retrieval inspection surfaces should live on web because they need tenant-wide and cross-run visibility.

### 9.2 Desktop host and local runtime

- Desktop Host should contribute governed local evidence, local file retrieval, and local context-pack candidates when Feature 075 local file intelligence is active.
- Desktop may maintain short-lived local caches or local retrieval helpers for offline or low-latency execution, but those caches must respect the same scope and trust model.
- Local role or work execution should be able to consume context packs that include governed local evidence without treating raw local discovery as implicit memory access.

### 9.3 Shared contracts and sync

- Web and desktop must share one context-bundle contract, one memory-scope vocabulary, and one provenance model so context can travel across surfaces safely.
- Desktop-contributed local evidence must sync back with trust and freshness metadata rather than arriving as anonymous artifact text.
- If desktop cannot validate scope, freshness, or trust posture for local context, that context must be suppressed or downgraded rather than silently injected.

## 10. Acceptance criteria

1. Different agent types can receive different context packs for the same work item based on scope and policy.
2. The platform can explain why a retrieved item was included in an important run.
3. Suppressed, stale, or low-trust context can be blocked from automatic injection.
4. Work memory, role memory, and organization memory remain isolated unless a policy explicitly allows sharing.
5. High-risk work can require citations and trusted-source thresholds before autonomous continuation.
6. The platform can explain not only why a context item was selected, but whether it improved the run and should be kept for the future.
