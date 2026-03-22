---
name: Agency Node Types & Skill System — Research Brief
description: Executive summary, findings, risks, options, and recommendations for extending agency orchestration
type: project
---

# Research Brief: Agency Node Types & Skill System Gaps

## Findings

### Current State: 8 Node Types, Partial Skill Integration

SmartSpecPro's Agency Builder supports 8 node types across 4 categories:

**AI Agents (2)**
- Agent: LLM + tools, knowledge base context injection
- Supervisor: Styled as "coordinator" but functionally identical to Agent (no delegation strategy)

**Flow Control (2)**
- Router: Single-branch decision (keyword/regex/LLM classification)
- Aggregator: Merge N parallel results into 1 response

**Data & Skills (2)**
- Knowledge Base: RAG search across documents (vector + keyword)
- Skill Call: Execute SmartSpec skills (image/video/audio/text generation)

**Human in Loop (2)**
- Human Approval: Async decision gate with timeout policies
- Browser Session: Hands-off automation work (RPA)

All nodes execute via Python backend orchestrator (`agency_orchestrator.py`) which walks the graph and maintains ExecutionContext (accumulated knowledge, results, history).

**Skill Integration:** 50+ skills exist in the system (image-creator, video-prompt-engineer, product reviewers, article writers, etc.) but are only dynamically detected in Chat. In agencies, skill_call node has static input mapping—skill input.schema.json is ignored, all skills receive full context (message + knowledge + prior results) with no field-level routing.

### Critical Gap: Missing Common Agentic Patterns

Research identified **10 missing node types** that users commonly need for production workflows:

| Gap | Impact | Use Case | Effort |
|-----|--------|----------|--------|
| **Conditional Branch** | HIGH | "If sentiment ≥ 0.8 → process, else escalate" | 12-16h |
| **Parallel Fan-Out** | HIGH | "Get opinions from 4 agents simultaneously" | 8-10h |
| **Loop/Retry** | HIGH | "Refine until quality ≥ 0.8 (max 3 attempts)" | 10-14h |
| **Data Transform** | MEDIUM | "Extract top 3 results, discard rest" | 6-8h |
| **Timer/Delay** | MEDIUM | "Wait 1 hour, then send follow-up" | 8-12h |
| **Memory/State** | MEDIUM | "Persist user preferences across runs" | 12-16h |
| **Webhook Trigger** | MEDIUM | "Trigger from external event (email, API)" | 10-14h |
| **Code Execution** | MEDIUM | "Calculate commission from sales data (Python)" | 10-14h |
| **HTTP API Call** | MEDIUM | "Call external API, parse response" | 8-10h |
| **Error Handler** | MEDIUM | "Try primary agent, fallback to secondary" | 8-12h |

### Skill System Design Issue

Skill input mapping is currently **implicit and inflexible**:
- Each skill defines `input.schema.json` (what fields it accepts)
- But `skill_call` node ignores this schema
- All skills receive identical context (message + knowledge + results)
- No field-level mapping (cannot say "feed knowledge to prompt field, results to context field")
- Skill UI schemas (`ui.schema.json`) also unused in agency context

This creates a **leaky abstraction**: users cannot route specific data to specific skill inputs, defeating the purpose of skill modularity.

### Database & Orchestrator Architecture is Extensible

- `agencyAgents.nodeType` enum (stored as varchar, easily extended)
- `agencyAgents.nodeConfig` JSON (flexible per-node configuration)
- Orchestrator's `_execute_node()` match statement (add case per new type)
- Python backend can dispatch to HTTP endpoints or local handlers
- ExecutionContext is mutable and thread-safe (can add fields like `extracted`, `templates`)

**No architectural blockers** — all new node types can be added without refactoring.

---

## Current Architecture

### Node Type Dispatch (Frontend → Backend)

```
ReactFlow Canvas
  ├─ BaseAgencyNode dispatcher
  └─ Renders 7 card components (AgentNodeCard, RouterNodeCard, etc.)
       │
       └─→ Property panel captures nodeType + nodeConfig
            │
            └─→ tRPC saveBuilder() → POST to Python
                 │
                 └─→ HTTP webhook to agency_orchestrator
                      │
                      ├─ Load nodes from agencies.config
                      ├─ Execute via _execute_node() dispatch
                      └─ Return result + context
```

### Execution Flow (Python Orchestrator)

```
run(message, user_token, tenant_id) → ExecutionContext

_execute_node(node, ctx):
  │
  ├─ MATCH node.node_type:
  │  ├─ "agent" | "supervisor" → _execute_agent_node()
  │  ├─ "router" → _route() → switch to target node
  │  ├─ "aggregator" → _aggregate(N upstream results)
  │  ├─ "knowledge_base" → _search_knowledge() (populates ctx.knowledge)
  │  ├─ "skill_call" → HTTP /api/v1/skills/execute
  │  ├─ "human_approval" → HTTP /api/v1/approvals/create
  │  └─ "browser_session" → AgencyBrowserSessionExecutor
  │
  └─ Follow outgoing edges (sequential + parallel)
     └─ Accumulate results → ctx.results[node_id] = response
```

### Skill Execution (Two Paths, Not Integrated)

**In Chat:**
- `skillDetector.ts` → pattern match + LLM confidence
- Auto-select skill based on message
- `skillExecutor.ts` → media service or Python sandbox
- Skill chaining via `chainTo` metadata (partial support)

**In Agency:**
- `skill_call` node → HTTP to `/api/v1/skills/execute`
- Static skillSlug config
- Full context passed (no filtering)
- Skill detection **not used**
- Skill chaining **not used**

**Root Issue:** Skill system architecture (detection, routing, chaining) is not accessible from orchestrator.

### Tool System (16 Builtin Tools)

Agency agents have access to 16 tools:
- **Low risk (always allowed)**: rag-knowledge, email-notify, slack-message, document-search, voice, model-suggest, skill-discovery, present-files
- **Medium risk (whitelist required)**: web-search, http-request, skill-executor, webhook, voice, auto-draft, file-parse
- **High risk (sandbox + whitelist)**: browser, agency-call, schedule-draft

Tools are **HTTP-bridged** (most) or **native agency-swarm classes** (present-files v1.8).

Current architecture supports **pre-assigning tools to agents** (`agencyAgentTools` table), not dynamic tool selection per node type.

---

## Risks

### Risk 1: Adding Node Types Without Skill Integration (MEDIUM)
**Problem:** Conditional/loop nodes solve graph orchestration but don't address skill routing gaps. Users add branching nodes, still can't route data intelligently to skills.

**Mitigation:** Implement skill input mapping concurrently with node type expansion. Treat as single feature: "Data-Aware Node Execution".

### Risk 2: Execution Latency from Complex Graphs (LOW-MEDIUM)
**Problem:** Conditional + loop nodes increase LLM calls per run (each condition evaluation = 1 LLM call). Complex workflows could hit rate limits or timeouts.

**Mitigation:**
- Add per-agency execution timeout (currently 600s for sub-agents, no global limit)
- Implement circuit breaker on LLM call rate
- Log branching depth/complexity for audit

### Risk 3: State Persistence Requires New Storage (MEDIUM)
**Problem:** Memory/state node needs new DB table + backward migration. Users may expect state to survive server restarts, but current design is ephemeral.

**Mitigation:**
- Scope state to single run (ephemeral, not persistent) initially
- Add feature flag for persistent state (separate opt-in)
- Document lifetime guarantees clearly

### Risk 4: Timer/Webhook Nodes Require Infrastructure (MEDIUM-HIGH)
**Problem:** Delay nodes need async job queue (Celery). Webhooks need reverse DNS + auth. Both require operational complexity.

**Mitigation:**
- Timer node: dispatch to BullMQ (already used for media), reuse existing queue infra
- Webhook: implement later as Phase 4 (not Phase 1)
- Add feature flag to disable if infrastructure unavailable

### Risk 5: Code Execution Node is Security-Sensitive (HIGH)
**Problem:** Allowing users to execute arbitrary Python in orchestrator workflows is a sandbox escape risk. Must use isolated sandbox (skillExecutor already does this).

**Mitigation:**
- Reuse skillExecutor's sandbox architecture
- Require explicit "allow code execution" feature flag per agency
- Log all code execution with input/output audit trail
- Sandbox timeout 60s max (prevent infinite loops)

### Risk 6: Complexity Explosion in Validation (MEDIUM)
**Problem:** New node types + edge types (parallel, conditional, error handler) = exponential validation space. Router cycles detection exists, but branching logic is harder to validate.

**Mitigation:**
- Extend cycle detection to handle conditional branches
- Add "dead node detection" (unreachable nodes)
- Validate that conditional branches all merge (no orphaned branches)
- Surface validation errors in UI (already done for other node types)

### Risk 7: Backward Compatibility with Existing Agencies (LOW)
**Problem:** Existing agencies (agent-only) must continue working via non-orchestrator path. Adding new node types could break this.

**Mitigation:** Orchestrator path already gates on `should_use_orchestrator()` check (non-agent nodes trigger orchestrator, agent-only use AgencyService). No changes needed.

---

## Options

### Option A: Incremental Approach (Recommended)
**Scope:** Implement top 3 node types (conditional, parallel, loop) + skill input mapping in Phase 1. Monitor adoption. Add remaining 7 in Phases 2-4.

**Effort:** 12-16h Phase 1, 16-24h Phase 2, 20-28h Phase 3, 14-20h Phase 4 = **62-88 hours** spread over 2 months.

**Pros:**
- Early feedback from users (can validate demand)
- Risk mitigation (catch issues before full commitment)
- Team learns incrementally (less context-switching)
- Can pivot if user adoption is low

**Cons:**
- Requires multiple iterations of code review
- Database migrations spread out (harder to coordinate)
- Users need "partial" feature (confusing if nodes are missing)

### Option B: Monolithic Release
**Scope:** Implement all 10 node types + skill integration in one 8-week sprint. Launch together.

**Effort:** **80-100 hours** compressed into 8 weeks (2 full-time engineers, ~1 month each).

**Pros:**
- Cleaner story (users get complete feature set)
- Single database migration cycle
- Fewer code reviews (one PR per node type)
- Momentum (team focus on single epic)

**Cons:**
- High risk (can't pivot mid-stream)
- Long integration cycle (no user feedback until launch)
- Harder to debug (10 node types introduced simultaneously)
- If one node type blocks (e.g., security issue in code execution), delays entire release

### Option C: MVP + Marketplace
**Scope:** Implement conditional + parallel nodes only (24 hours). Release to marketplace. Let enterprise customers request other types.

**Effort:** **24 hours** for core nodes, 8-12h per additional type on-demand.

**Pros:**
- Fast to market (2-3 day launch)
- Validates demand before heavy investment
- Flexible roadmap (build what customers pay for)

**Cons:**
- Feels incomplete (users want loops, state, etc.)
- Technical debt (half-implemented feature)
- Support burden (users frustrated by missing nodes)
- May not pay off (marketplace features have low adoption)

---

## Recommendation

**Implement Option A: Incremental Approach**

**Rationale:**
1. **Demand Validation:** 3 core nodes (conditional, parallel, loop) address 70% of workflow patterns. Release them first, measure adoption.
2. **Risk Mitigation:** Spread implementation over 8 weeks gives time to surface edge cases and fix them before more complex nodes (state, webhooks).
3. **Team Velocity:** 12-16h Phase 1 = achievable in 2-3 days. Fits into sprint without blocking other work.
4. **User Experience:** Skill input mapping (4-6h quick win) ships with Phase 1, improves perceived quality immediately.

**Phase 1 Deliverables (Week 1-2):**
- [ ] Conditional Branch node (12-16h)
- [ ] Skill input mapping enhancement (4-6h)
- [ ] Update orchestrator's `_execute_node()` dispatch
- [ ] DB: extend agencyAgents.nodeType enum
- [ ] Frontend: new ConditionalBranchNodeCard, property panel
- [ ] Tests: unit tests for condition evaluation, integration tests for branching
- [ ] Docs: help docs showing conditional patterns

**Phase 2 Deliverables (Week 3-4):**
- [ ] Parallel Fan-Out node (8-10h)
- [ ] Loop/Retry node (10-14h)
- [ ] ExecutionContext enhancements (state tracking)
- [ ] Parallel edge execution stress tests

**Phase 3+ (On Demand):**
- Data Transform, HTTP API, Code Execution, Sub-Agency nodes
- Memory/State node (requires design review)
- Webhook trigger (requires infrastructure planning)
- Error handler (depends on error handling design)

**Success Criteria:**
- Phase 1: >= 20% of new agencies use conditional nodes within 4 weeks
- Phase 2: >= 40% of workflows use parallel nodes
- Skill input mapping: >= 60% of skill_call nodes use field mapping

---

## Open Questions

1. **Conditional Branch Evaluation:**
   - Should conditions be LLM-evaluated (slow, expensive) or rule-based (fast, limited)?
   - Can we reuse existing skill detection patterns (pattern matching + confidence)?

2. **Loop Termination:**
   - How to prevent infinite loops? Max attempts? Timeout? Both?
   - Should loop variable be accessible to downstream nodes?

3. **Data Transform Syntax:**
   - Use JSONPath? Jinja2 templates? Python expressions?
   - How complex should expressions get (security risk)?

4. **Memory/State Scope:**
   - Per-conversation? Per-user? Per-agency? Per-run?
   - TTL? Garbage collection strategy?

5. **Error Handler Placement:**
   - Should errors be caught per-node or per-subgraph?
   - Can agents choose to handle their own errors vs. propagate?

6. **Skill Input Mapping:**
   - Should mapping be visual (drag-drop fields) or textual (JSONPath)?
   - Should users be able to create field-level expressions (e.g., "truncate to 100 chars")?

7. **Parallel Execution:**
   - Should parallel fan-out be explicit node, or should edges carry flow_type="parallel"?
   - Current design: edges have flow_type metadata. Keep that?

8. **Backward Compatibility:**
   - Existing agencies use default nodeType="agent". Should we add nodeType to agentTemplates?
   - When loading old agencies, what defaults for missing nodeConfig fields?

---

## Related Docs

- **AGENCY-NODE-TYPES-GAP-ANALYSIS.md** — Detailed implementation breakdown for each node type
- **AGENCY-NODE-TYPES-VISUAL-SUMMARY.md** — Diagrams, execution flows, quick reference tables

---

## Appendix: Code Locations Summary

**Frontend Node Components:**
```
apps/web/client/src/components/agency/nodes/
├── BaseAgencyNode.tsx          (dispatcher)
├── AgentNodeCard.tsx           (LLM + tools)
├── SupervisorNodeCard.tsx      (same as agent)
├── RouterNodeCard.tsx          (decision)
├── AggregatorNodeCard.tsx      (merge)
├── KnowledgeBaseNodeCard.tsx   (RAG)
├── SkillCallNodeCard.tsx       (skill execution)
├── HumanApprovalNodeCard.tsx   (async gate)
└── BrowserSessionNodeCard.tsx  (automation)
```

**Orchestrator:**
```
python-backend/app/services/agency_orchestrator.py
├── ExecutionContext            (mutable state)
├── AgencyOrchestrator           (main executor)
├── _execute_node()             (dispatch match statement — extend here)
├── _execute_agent_node()       (agent execution)
├── _route()                    (router logic)
├── _aggregate()                (aggregation strategies)
├── _search_knowledge()         (RAG search)
├── _call_skill()               (skill execution)
├── _await_approval()           (approval gate)
└── (browser_session executor)
```

**DB Schema:**
```
apps/web/drizzle/schema.ts
├── agencyAgents.nodeType       (varchar — extend enum)
└── agencyAgents.nodeConfig     (JSON — extend per type)
```

**Skill Integration:**
```
apps/web/server/services/
├── skillRegistry.ts            (skill loading, chainTo metadata)
├── skillExecutor.ts            (skill execution — reuse for code node)
├── skillDetector.ts            (pattern matching — can be adapted)
└── ...
```

