# Feature 099: Context Engineering Ready Chat And Team

Version: 1.0
Date: 2026-04-18
Status: Proposed
Depends-on: 087-enterprise-context-fabric-and-governed-memory, 088-agentops-tracing-evaluation-and-release-gates, 095-work-os-automation-fabric-and-resumable-run-ledger, 096-goal-driven-auto-team-automation, 098-auto-team-real-execution-and-media-completion
Audience: Chat, Team, Memory/Retrieval, Work OS, Observability, Security, QA

---

## 1. Executive summary

Chat and Team currently have memory, prompt assembly, and retrieval pieces, but they still behave like separate surfaces with different context rules.

This feature introduces a shared context-engineering layer that is more than "memory":

- state tiers for session, project, durable memory, and working summaries
- hybrid retrieval across lexical, structured, graph, and semantic sources
- deterministic context-pack assembly with intent-aware budget split
- compaction, promotion, pruning, and deduplication
- tool / MCP read-search-write flows as first-class context sources
- evals and metrics that measure retrieval quality, grounding, latency, and stale context

The recommended solution is not to replace Chat or Team. It is to give both surfaces one shared context control plane with surface-specific adapters.

---

## 2. Problem statement

The current codebase already has useful building blocks:

- Chat has memory assembly, rolling summaries, and retrieval hooks
- Team has prompt composition, scoped memory, and run-backed execution
- Work OS has durable work state, cases, rooms, and run history

What is still missing is a single context-engine contract that decides:

1. what is remembered
2. what is retrieved right now
3. how the selected context is packed for the model
4. what is summarized, promoted, or pruned afterward
5. how to prove that the context actually helped

Without that layer:

- Chat and Team drift apart in behavior
- memory becomes a catch-all instead of a governed state model
- tool results and project state do not have clear lifecycle rules
- retrieval quality cannot be evaluated consistently
- stale or duplicate context can silently crowd out the useful parts

---

## 3. Product goal

Create one shared context-engineering system that powers both Chat and Team so that:

- the same work class sees the same relevant state and retrieval rules
- Chat remains conversational while Team remains work-oriented
- context selection is explainable, bounded, and testable
- context compaction keeps prompts small without losing continuity
- tool output becomes usable context only through explicit lifecycle rules
- evaluation data can tell us whether the engine is improving or regressing

---

## 4. Scope

### In scope

- session state, project state, durable memory, and working summaries
- lexical, structured, graph, semantic, and hybrid retrieval
- query-intent classification for context assembly
- active note / recent notes / project state injection
- `build_context_pack()` and token budget split by surface and intent
- rolling summary, tool-result clearing, promotion, pruning, and deduplication
- tools / MCP resources / prompts and read-search-write flows
- retrieval evals, grounding/tool-use evals, latency metrics, stale-context metrics
- Chat and Team integration through shared services and adapters

### Out of scope

- replacing the existing run engine
- forcing Chat and Team to share identical storage tables
- introducing a new vector database requirement
- rewriting unrelated UI surfaces
- treating tool output as trusted system context by default

---

## 5. Recommended solution

The best-fit solution for this repo is a shared `context-engine` layer that sits between surface inputs and LLM calls.

It must:

1. normalize the current turn into a context query
2. classify the intent of the query
3. retrieve from multiple source types
4. rank and deduplicate candidates deterministically
5. assemble a context pack with explicit budget slots
6. emit a traceable explanation of what was included and excluded
7. compact, promote, or prune state after the turn
8. record evaluation signals for later tuning

This is better than:

- adding more ad hoc memory rules inside Chat only
- duplicating prompt logic in Team
- treating tool results as raw transcript text
- making every context source behave like a vector memory

### Surface policy

- Chat must default to session-heavy continuity with project state and durable memory as support.
- Team must default to project-heavy continuity with session state, work state, and durable memory as support.
- Guided Team rooms and automation-led Team rooms must share the same context engine but use different budget profiles and retrieval recipes.

---

## 6. Current codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/memoryService.ts` | Chat already assembles memory, summaries, and retrieval output | Add a shared context contract and expose the same state model to Team |
| `apps/web/server/services/promptComposer.ts` | Team already has budgeted prompt composition and scoped memory wiring | Replace ad hoc assembly with a shared `build_context_pack()` contract |
| `apps/web/server/services/executors/contextBuilder.ts` | Team and Chat bridges already exist | Reuse a shared context engine instead of parallel prompt logic |
| `apps/web/server/services/scopedMemoryService.ts` | There is a reusable scoped-memory store | Add source typing, trust metadata, dedupe, and retrieval recipes |
| `apps/web/server/services/teamRoomMemoryService.ts` | Team room memory capture exists | Add compaction, promotion, pruning, and tool-result lifecycle hooks |
| `apps/web/server/services/runEngine.ts` and `teamRoom.ts` | Work items and room turns are durable | Feed the same context engine into run-backed Team execution |
| `apps/web/server/services/monitoringService.ts` | Platform metrics already exist | Add context-specific latency, stale-context, and grounding metrics |
| `apps/web/server/services/librarySearchService.ts` and related search code | Deterministic ranking already exists in parts of the platform | Reuse the hybrid-ranking idea for context retrieval instead of inventing a new one |

---

## 7. Canonical model

### 7.1 State tiers

The engine must support these state classes:

- `session_state` - short-lived continuity for the current conversation, room, or turn chain
- `project_state` - durable work state for the current project, case, room, or run family
- `durable_memory` - promoted facts, preferences, policies, and stable work patterns
- `working_summary` - rolling summaries that compress recent turns, actions, and tool outputs

Each state class must carry:

- owner scope
- trust level
- freshness / age
- source refs
- retention rules
- promotion or pruning reason

### 7.2 Retrieval classes

The retrieval layer must support all of the following:

- lexical retrieval for exact terms, names, ids, and text matches
- structured retrieval for metadata, filters, labels, ownership, and state fields
- graph retrieval for relationships across work items, rooms, teams, runs, artifacts, and reviews
- semantic retrieval for meaning-based similarity
- hybrid ranking that combines all of the above with trust, freshness, and utility signals

Hybrid ranking must be deterministic enough to debug and explain.

### 7.3 Context pack contract

`build_context_pack()` must return a structured pack, not just a flattened prompt string.

At minimum, the pack must contain:

- surface name
- turn or request id
- query intent
- session state refs
- project state refs
- durable memory refs
- working summary refs
- recent note refs
- active note refs
- tool result refs
- retrieved evidence refs
- token budget profile
- budget usage
- inclusion / exclusion explanations
- trust and freshness annotations
- provenance for every selected item

The token budget split must be explicit and recorded per pack. The builder must know how much room was reserved for:

- system / policy instructions
- active note and latest user intent
- recent notes / session summary
- project state
- durable memory
- retrieved evidence
- tool results
- answer / reasoning reserve

### 7.4 Compaction contract

Compaction must be a first-class lifecycle step, not an afterthought.

It must support:

- rolling summary generation
- tool-result clearing after promotion or expiry
- promotion from transient state to working summary or durable memory
- pruning of stale, duplicate, or low-utility items
- retrieval deduplication before context assembly

### 7.5 Tool / MCP contract

Tools, MCP resources, and prompt assets must be treated as context sources with their own lifecycle.

Required behaviors:

- read and search flows can contribute evidence to the pack
- write flows can create durable side effects and related refs
- tool output must be bounded, redacted, and tagged as untrusted until validated
- large outputs must degrade to references, summaries, or artifacts instead of raw prompt bloat

### 7.6 Eval contract

The engine must record evaluation data for:

- retrieval accuracy
- grounding quality
- tool-use correctness
- latency
- stale-context rate
- dedupe effectiveness
- compaction effectiveness

---

## 8. Functional requirements

### 8.1 Chat

- Chat must assemble context via the shared engine before each model call.
- Chat must use the same state tiers and retrieval recipes as Team, with Chat-appropriate defaults.
- Chat must continue to support rolling summaries and memory mode controls, and those controls must flow through the shared context contract.

### 8.2 Team

- Team must use the shared engine for guided rooms, manual room help, and automation-led execution.
- Team must receive project state, room state, durable memory, and working summaries through the same context contract.
- Team must be able to explain which context sources were used for a given room or run.

### 8.3 Retrieval and ranking

- Query-intent classification must select the right retrieval recipe before ranking starts.
- Retrieval must combine lexical, structured, graph, and semantic signals.
- Ranking must include trust, freshness, and utility signals.
- Duplicate evidence must be collapsed before prompt assembly.

### 8.4 Context assembly

- The engine must map the query intent to a budget profile.
- The pack builder must explicitly reserve budget for active notes, recent notes, project state, durable memory, retrieval evidence, and tool results.
- The pack builder must emit an explanation of why each slot was included.

### 8.5 Compaction and memory lifecycle

- After turn completion, the engine must decide whether to roll up a summary, promote a fact, prune stale evidence, or clear tool results.
- Promotion must respect trust, scope, and policy.
- Pruning must never delete the only copy of a required audit trail.

### 8.6 Tools / MCP

- Tool and resource discovery must be available to the context engine.
- Tool outputs must be searchable and promotable only with clear provenance.
- Prompt assets and resource templates must be versioned and scoped.

### 8.7 Evals and monitoring

- The platform must provide retrieval evals and tool-use evals that can run against Chat and Team separately and together.
- The platform must record latency and stale-context metrics for context pack building and retrieval.
- The platform must be able to compare context quality before and after changes.

---

## 9. Security and governance

This feature must inherit the current tenant and ownership boundaries, and it must tighten them where context sources are broader than a single message thread.

Mandatory rules:

- tenant isolation must be preserved
- project / room / run access must be checked before retrieval or promotion
- tool output is untrusted until validated
- prompt-injection content must never be allowed to overwrite policy or system slots
- secrets, credentials, and sensitive payloads must be redacted or excluded
- context promotion must fail closed when trust is unclear

Any context item that cannot be explained, scoped, or justified must not be silently injected.

---

## 10. Success criteria

The feature is successful when:

- Chat and Team share one context-engine contract
- context packs are explainable and budgeted
- retrieval is hybrid, deterministic, and debuggable
- compaction keeps prompts small without losing important work state
- tool outputs do not linger as raw prompt noise
- stale or duplicate context is measurably reduced
- evals can prove whether the new context layer improved grounding, latency, and task success
