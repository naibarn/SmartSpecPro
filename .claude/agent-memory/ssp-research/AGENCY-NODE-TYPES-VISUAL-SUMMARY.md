---
name: Agency Node Types — Visual Quick Reference
description: Diagrams, matrices, and execution flows for 8 existing + 10 missing node types
type: reference
---

# Agency Node Types — Visual Quick Reference

## Current 8 Node Types — Capability Matrix

```
┌────────────────────┬─────────────────┬──────────┬──────────┬──────────┐
│ Node Type          │ Purpose          │ Branches │ Parallel │ Stateful │
├────────────────────┼─────────────────┼──────────┼──────────┼──────────┤
│ AGENT              │ LLM + Tools      │ NO       │ NO       │ Context  │
│ SUPERVISOR         │ Agent (same)     │ NO       │ NO       │ Context  │
│ ROUTER             │ 1-of-N routing   │ 3*       │ NO       │ NO       │
│ AGGREGATOR         │ Merge N→1        │ N        │ YES      │ NO       │
│ KNOWLEDGE BASE     │ Search docs      │ NO       │ NO       │ Context  │
│ SKILL CALL         │ Execute skill    │ NO       │ NO       │ Context  │
│ HUMAN APPROVAL     │ Wait for input   │ 2*       │ NO       │ Async    │
│ BROWSER SESSION    │ Automation       │ NO       │ NO       │ Session  │
└────────────────────┴─────────────────┴──────────┴──────────┴──────────┘
* Router: actually 1 branch (other handles are cosmetic)
* Approval: return paths are implicit, not explicit nodes
```

## Execution Flow Diagram (Current 8 Types)

```
                    ┌─────────┐
                    │  Entry  │
                    │  Agent  │
                    └────┬────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    ┌───▼───┐        ┌───▼────┐      ┌───▼──────┐
    │Router │        │  KB    │      │ Skill    │
    │(1:1)  │        │(RAG)   │      │Call      │
    └───┬───┘        └───┬────┘      └───┬──────┘
        │                │              │
    ┌───▼────────────────┴──────────────┘
    │
┌───▼─────────┐
│  Agent or   │
│ Aggregator  │
│ (parallel)  │
└───┬─────────┘
    │
┌───▼──────────┐
│Aggregator    │
│(merge N→1)   │
└───┬──────────┘
    │
┌───▼────────────┐
│ Human Approval │
│ (async wait)   │
└───┬────────────┘
    │
┌───▼──────┐
│ Browser  │
│ Session  │
└───┬──────┘
    │
┌───▼──────────┐
│Final Response│
└──────────────┘
```

## Missing Node Types — 10 Critical Gaps

### 1. CONDITIONAL BRANCH Node
```
Input Message
    │
    ├─ IF {condition A}
    │   │
    │   └─→ [Agent A] ─→
    │
    ├─ ELSE IF {condition B}
    │   │
    │   └─→ [Agent B] ─→
    │
    └─ ELSE
        │
        └─→ [Agent C] ─→
            │
            └─→ [Merge]
```
**Use Case**: "If sentiment is negative, escalate to support; if positive, process normally"
**Impl Effort**: 12-16 hrs
**DB Impact**: nodeType + nodeConfig with conditions + multiple edges

### 2. PARALLEL FAN-OUT Node
```
Input
  │
  ├─→ [Agent 1] ─┐
  ├─→ [Agent 2] ─┼─→ [Aggregator] → Output
  ├─→ [Agent 3] ─┤
  └─→ [Agent 4] ─┘
```
**Use Case**: "Get opinions from 4 reviewers in parallel, merge results"
**Impl Effort**: 8-10 hrs
**DB Impact**: nodeType + parallel edge support

### 3. LOOP / RETRY Node
```
Input
  │
  ├─→ [Agent] ─┐
  │           │
  │    ┌──────┘
  │    │ If condition == "retry"
  │    │ (max 3 attempts)
  │    │
  └─→ Success / Exhausted
```
**Use Case**: "Keep refining summary until quality score >= 0.8"
**Impl Effort**: 10-14 hrs
**DB Impact**: nodeType + maxAttempts, condition, backoff config

### 4. DATA TRANSFORM / MAP Node
```
Input: {results: {agent1: "...", agent2: "..."}, knowledge: [...]}
  │
  ├─ Map operation: extract "agent1" field only
  │
Output: "..." → [Downstream Agent]
```
**Use Case**: "Filter skill output to only include top 3 results"
**Impl Effort**: 6-8 hrs
**DB Impact**: nodeType + transformation expression (JSON path, regex, template)

### 5. TIMER / DELAY Node
```
Input
  │
  ├─→ [Delay 60s] ─→ [Agent] → Output
  │
  └─→ Or: Cron trigger at specific time
```
**Use Case**: "Wait 1 hour before sending follow-up message"
**Impl Effort**: 8-12 hrs
**DB Impact**: nodeType + delay duration + cron expression

### 6. MEMORY / STATE Node
```
State persisted across runs:
  - Last conversation ID
  - User preferences
  - Learned facts
  - Running totals

Workflow:
Input → [Read State] → [Agent] → [Update State] → Output
```
**Use Case**: "Remember user's preference from last run, apply here"
**Impl Effort**: 12-16 hrs
**DB Impact**: New table `agencyNodeState`, nodeType, state scope

### 7. WEBHOOK / EVENT TRIGGER Node
```
External Event (webhook POST)
  │
  ├─→ [Webhook Trigger] ─→ [Agent] → Output
  │
  └─→ Can also be entry point
```
**Use Case**: "Trigger agency when customer emails support"
**Impl Effort**: 10-14 hrs (includes endpoint security)
**DB Impact**: nodeType + webhook URL + auth method

### 8. CODE EXECUTION Node (Sandbox)
```
Input + Code
  │
  ├─→ [Python/JS Sandbox] ─→ [Output] → Downstream
  │
  └─→ Can read context, transform data
```
**Use Case**: "Calculate commission from sales data"
**Impl Effort**: 10-14 hrs (reuse skillExecutor sandbox)
**DB Impact**: nodeType + code + language + timeout

### 9. HTTP API CALL Node (First-Class)
```
Config: URL, Method, Headers, Body Template
  │
Input → [HTTP Request] → Response → [Agent] → Output
  │
  └─→ Retry logic, timeout, auth
```
**Use Case**: "Call external API, parse response, pass to agent"
**Impl Effort**: 8-10 hrs
**DB Impact**: nodeType + URL template + method + headers

### 10. ERROR HANDLER / TRY-CATCH Node
```
Input
  │
  ├─→ [Try: Agent A] ─┐
  │                   ├─→ Success? YES → Output
  │    On Error:      │
  │    └─→ [Catch: Agent B] → Output
```
**Use Case**: "If main agent fails, use fallback agent"
**Impl Effort**: 8-12 hrs
**DB Impact**: nodeType + error condition + fallback edge

---

## Skill System Integration Gaps

### Current State
```
┌──────────────────┐
│  Skill Call Node │
│  (static config) │
└────┬─────────────┘
     │
     ├─ skillSlug: "image-creator"
     ├─ passInputThrough: true
     └─ RECEIVES: Full context (message + knowledge + results)
            │
            ├─ Skill has input.schema.json: ignored ❌
            ├─ Skill has ui.schema.json: ignored ❌
            └─ No field mapping ❌
```

### Desired State
```
┌──────────────────────┐
│  Skill Call Node     │
│  (dynamic mapping)   │
└────┬─────────────────┘
     │
     ├─ skillSlug: "image-creator"
     ├─ inputMapping: {
     │    "prompt": "message",
     │    "style": "results[agent1].style",
     │    "aspectRatio": "knowledge[0].metadata.ratio"
     │  }
     └─ RECEIVES: Mapped fields only
            │
            ├─ Skill input.schema.json: used for validation ✓
            ├─ Skill ui.schema.json: used for property panel ✓
            └─ Field mapping with JSONPath ✓
```

### Quick Win: Expose Sub-Agency Node
```
├─ builtin-agency-call tool ALREADY EXISTS (risk: high)
├─ Just needs UI node card
├─ Property panel: select target agency + map inputs
└─ Reuse existing tool execution path
```

---

## Execution Context Accumulation (Current)

```
ExecutionContext {
  input: "Generate 5 product reviews"              // User input
  results: {
    agent1: "Review 1...",                         // Agent outputs
    agent2: "Review 2...",
    skill_call_3: "Summary: ...",
  }
  knowledge: [                                     // KB search results
    { title: "Policy", content: "...", score: 0.9 },
    { title: "FAQ", content: "...", score: 0.7 },
  ]
  history: [ { role: "user", content: "..." } ]   // Conversation
  task_metadata: { task_run_id, strategy, ... }   // Planner context
  browser_sessions: [ { id, url, ... } ]          // Active sessions
}
```

**Enhancement for Data Transform Node:**
```
Add to ExecutionContext:
  extracted: {                                     // Extracted data
    "top_results": [...],
    "filtered_knowledge": [...]
  }
  templates: {                                     // Evaluated templates
    "greeting": "Hello, John!"
  }
```

---

## Gap Implementation Roadmap

### Phase 1: Foundational (Week 1-2)
- [ ] Conditional Branch node (12-16 hrs)
- [ ] Data Transform node (6-8 hrs)
- [ ] Skill input mapping enhancement (4-6 hrs)

### Phase 2: Parallel & Control Flow (Week 3-4)
- [ ] Parallel fan-out node (8-10 hrs)
- [ ] Loop/Retry node (10-14 hrs)

### Phase 3: Advanced Features (Week 5-6)
- [ ] Sub-Agency node (3-4 hrs) — quick win
- [ ] HTTP API node (8-10 hrs)
- [ ] Code execution node (10-14 hrs)

### Phase 4: Stateful & External (Week 7+)
- [ ] Memory/state node (12-16 hrs)
- [ ] Webhook trigger (10-14 hrs)
- [ ] Error handler (8-12 hrs)

---

## Code Location Reference

**Frontend Node Components:**
- `apps/web/client/src/components/agency/nodes/{NodeType}NodeCard.tsx`
- `apps/web/client/src/components/agency/AgencySidebar.tsx` (node type list)
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx` (config UI)

**Backend Orchestrator:**
- `python-backend/app/services/agency_orchestrator.py` (main executor, _execute_node match statement)
- `apps/web/server/routers/agency.ts` (tRPC saveBuilder, validation)

**DB Schema:**
- `apps/web/drizzle/schema.ts` (agencyAgents.nodeType enum, agencyAgents.nodeConfig JSON schema)

**Skill Integration:**
- `apps/web/server/services/skillRegistry.ts` (skill loading)
- `apps/web/server/services/skillExecutor.ts` (skill execution)
- `python-backend/app/services/agency_tools.py` (tool bridging)

