---
name: AI Agency Creator Code Audit
description: Comprehensive audit of AI creator implementation against specs 052, 053, and 056
type: project
---

# AI Agency Creator Audit — Specs 052, 053, 056 Coverage

## Executive Summary

**Status:** CRITICAL GAPS IDENTIFIED — AI creator implements only basic agent topology. Missing nearly all spec 053 and 056 features. Most modern agency capabilities not auto-generated.

**Key Finding:** The AI creator generates a minimal spec (names, instructions, tools) and saves it via internal API. But the generated spec lacks:
- Execution modes (agentic, planning strategies, reflection)
- Cost controls (maxReflectionCycles, maxTotalIterations)
- Long-term memory flags
- Capability-based model selection
- Agency objective field
- Memory scope declarations
- Advanced node types beyond basic agent/supervisor

---

## Current Architecture

### Frontend: AutoCreateAgencyModal.tsx

**User Input:**
- requirement: string (10-10000 chars)
- specFileBase64?: optional PDF/DOCX/TXT file
- model?: string (defaults to 'gpt-4o', forwarded from toolbar)
- skipInterview: boolean (default false)

**Flow:**
1. User types → mutation `autoCreate` → Python backend discover task
2. If needed, shows interview questions (Phase 2)
3. User submits answers → mutation `autoCreateAnswer` → Python design task
4. Poll `autoCreateStatus` for phase progress (11 phases total)
5. On completion: navigate to editor

**Phases Shown to User:**
1. Discover
2. Interview
3. Plan
4. Review Plan
5. Design
6. Review Design
7. Validate
8. Implement
9. Verify
10. Document
11. Done

---

### Backend: Python Agency Creator Task

**File:** `python-backend/app/tasks/agency_creator_task.py` (1000+ lines)

**Two Celery Tasks:**
1. `create_agency_discover_task` → Phases 1-2 (DISCOVER + INTERVIEW)
2. `create_agency_design_task` → Phases 3-7 (PLAN → DOCUMENT)

**Status Storage:** Redis (2-hour TTL), keyed by task_id

#### Phase 1: DISCOVER
- **LLM Call:** `_llm_discover()` — analyzes requirement
- **Prompt:** Asks LLM to identify domain, estimate agent count, decide if needs interview
- **Output Fields:**
  - `is_clear: boolean` — sufficient info to design immediately?
  - `domain: string` — e.g., "content_creation", "research"
  - `estimated_agents: number`
  - `questions?: array` — max 7 clarifying questions
  - `notes?: string`

#### Phase 2: INTERVIEW
- If `is_clear=false` AND questions exist → returns awaiting_answers
- Frontend renders questions form
- User submits → design task dispatched

#### Phase 3: PLAN
- **LLM Call:** `_llm_plan()` — generates agency topology
- **Input:** Requirement + intent + answers + available skills
- **Node Types Offered:** 14 types listed in NODE_TYPE_CATALOG:
  - agent, supervisor, router, aggregator
  - conditional_branch, parallel_fan_out, loop_retry
  - knowledge_base, skill_call, skill_discovery
  - data_transform, error_handler, human_approval, browser_session
- **Output:** JSON with topology + planSteps (max 20 nodes)
  - Each step has: nodeType, name, purpose, skillId, connections

**Key Limitation:** Plan phase suggests node types but doesn't carry through to final spec fields.

#### Phase 4: REVIEW_PLAN (max 3 iterations)
- **LLM Call:** `_llm_review_plan()` — validates plan completeness
- Checks: connectivity, dependencies, node types, error handling, human oversight

#### Phase 5: DESIGN
- **LLM Call:** `_llm_design()` — generates final agency spec
- **Input:** Requirement + intent + answers + model + plan_steps (if available)
- **Output Fields Generated:**
  ```json
  {
    "name": "Agency Name",
    "description": "What agency does",
    "nodes": [
      {
        "id": "node-1",
        "nodeType": "agent",
        "name": "Agent Name",
        "description": "...",
        "instructions": "Detailed instructions",
        "model": "gpt-4o",
        "isEntryPoint": true,
        "toolIds": ["builtin-web-search", ...],
        "nodeConfig": {}
      }
    ],
    "edges": [
      {
        "fromNodeId": "node-1",
        "toNodeId": "node-2",
        "flowType": "delegation"
      }
    ],
    "rationale": "..."
  }
  ```

**Available Tools:** 10 builtin tools hardcoded in system prompt:
- builtin-web-search, builtin-code-interpreter, builtin-file-reader, builtin-file-writer
- builtin-rag-knowledge, builtin-http-request, builtin-email-notify, builtin-webhook
- builtin-slack-message, builtin-document-search

#### Phase 6: REVIEW_DESIGN (max 3 iterations)
- **LLM Call:** `_llm_review_design()` — validates spec for production readiness
- Checks: connectivity, entry point count, conditional/loop/parallel config, tool assignments

#### Phase 7: VALIDATE
- **Code:** `_validate_spec()` — fixes common issues:
  - Ensures exactly 1 entry point (agent/supervisor)
  - Removes invalid edges
  - Adds default config to router/conditional nodes
  - Caps planSteps to 20

**Does NOT add:** executionMode, memoryScope, cost controls, objective

#### Phase 8: IMPLEMENT
- **HTTP Call:** POST to `http://localhost:3000/api/internal/agency/create`
- **Payload:** Converts spec to saveBuilder format:
  ```json
  {
    "name": spec.name,
    "description": spec.description,
    "agents": [
      {
        "id": node.id,
        "name": node.name,
        "description": node.description,
        "instructions": node.instructions,
        "model": node.model,
        "nodeType": node.nodeType,
        "nodeConfig": node.nodeConfig,
        "isEntryPoint": node.isEntryPoint,
        "isOptional": node.isOptional,
        "position": {"x": 400, "y": 80 + idx*200},
        "toolIds": node.toolIds,
        "toolConfigs": {}
      }
    ],
    "communicationFlows": [
      {
        "id": "edge-...",
        "fromAgentId": edge.fromNodeId,
        "toAgentId": edge.toNodeId,
        "flowType": edge.flowType
      }
    ],
    "tenantId": tenant_id
  }
  ```

**Agency Creation:** Uses internal API `/api/internal/agency/create` (not user-facing, requires X-Internal-Token)

#### Phase 9-10: VERIFY + DOCUMENT
- VERIFY: No logic (placeholder)
- DOCUMENT: `_llm_document()` — generates usage guide (max 300 words)

---

## What Gets Saved to Database

**Process:** AI creator spec → Python internal API call → Node.js saveBuilder procedure

**saveBuilder Procedure Input Schema** (`apps/web/server/routers/agency.ts:1197`):
```typescript
z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  defaultModel: z.string().max(100).nullish(),
  topology: z.enum(["handoff_chain", "orchestrator_worker", "hybrid", "custom"]).optional(),
  changeDescription: z.string().max(500).optional(),
  agents: z.array(
    z.object({
      name, description, nodeType, instructions, model, modelSettings,
      parallelToolCalls, maxTurns, isEntryPoint, isOptional,
      position, toolIds, toolConfigs, nodeConfig,
      outputSchema, examples
    })
  ),
  flows: [...]
})
```

**Database Fields Actually Saved** (agencyAgents table):
- Basic: id, agencyId, name, description, instructions, model
- Layout: position, isEntryPoint, isOptional
- Interaction: nodeType, parallelToolCalls, maxTurns
- Tools: toolIds (varchar[]), toolConfigs
- Config: nodeConfig (JSONB) — stores type-specific config
- Model selection: modelSettings (temperature, maxTokens, reasoningEffort), **modelRequirements** (capability-based)
- Timestamps: createdAt, updatedAt

**Missing From Database:**
- ❌ `executionMode` — no field for "agentic" vs "single_shot"
- ❌ `planningStrategy` — no field for "basic", "cot", "react"
- ❌ `maxReflectionCycles` — no field
- ❌ `maxTotalIterations` — no field
- ❌ `enableLongTermMemory` — no flag per node
- ❌ `memoryScope` — no field for "agency" vs "node"

**Agency-Level Fields (agencies table):**
- ✓ `objective` — DOES EXIST (field at line 4748)
- ❌ Not set by AI creator

---

## GAP ANALYSIS TABLE

| Feature | Spec | Creator Generates? | Saved to DB? | Notes |
|---------|------|-------------------|--------------|-------|
| **SPEC 052: Agency Swarm** ||||
| 7 node types | 052 | ✓ Only basic agent/supervisor/router/aggregator | ✓ | Advanced types (parallel_fan_out, conditional_branch, loop_retry) mentioned in prompt but not actively generated |
| Tool assignments | 052 | ✓ Basic 10 builtin tools | ✓ | toolIds array saved, matches builtin-* pattern |
| Tool configurations | 052 | ✓ Basic (none set) | ✓ toolConfigs field exists but empty |
| Entry point | 052 | ✓ Sets isEntryPoint=true on first agent | ✓ | Validated and enforced |
| Version history | 052 | ❌ Not created | N/A | Would be created by saveBuilder, not AI creator |
| Shared instructions | 052 | ❌ Not generated | ❌ | Agency.sharedInstructions field exists but not populated |
| Communication flows | 052 | ✓ Basic edges | ✓ | Generated, saved as communicationFlows |
| **SPEC 053: Agentic Intelligence** ||||
| executionMode | 053 | ❌ Hardcoded in prompt as single_shot concept | ❌ | No LLM field; nodeConfig doesn't include it |
| planningStrategy | 053 | ❌ Not generated | ❌ | No field in AI output or database |
| maxReflectionCycles | 053 | ❌ Not generated | ❌ | No field |
| maxTotalIterations | 053 | ❌ Not generated | ❌ | No field |
| enableLongTermMemory | 053 | ❌ Not generated | ❌ | No flag per agent |
| Working memory setup | 053 | ❌ Not generated | N/A | Runtime feature, not schema |
| Cost controls | 053 | ❌ Not generated | ❌ | No creditCap or similar |
| Autonomous executor config | 053 | ❌ Not generated | ❌ | No executionMode="agentic" in spec |
| **SPEC 056: Memory Vector RAG** ||||
| Agency objective | 056 | ❌ Not generated | ❌ Field exists but not populated by creator |
| Memory scope per node | 056 | ❌ Not generated | ❌ | No memoryScope field in nodeConfig |
| Memory scope agency-level | 056 | ❌ Not generated | ❌ | Not set |
| enableLongTermMemory | 056 | ❌ Not generated | ❌ | No flag |
| **NEW: Model Selection** ||||
| Capability-based selection | New | ❌ Creator uses single `model` field | ❌ nodeConfig doesn't set modelRequirements |
| Auto model selection | New | ❌ Creator hardcodes to gpt-4o or user selection | ❌ | modelRequirements field exists but empty |
| Strategy selection | New | ❌ Not generated | ❌ | No strategy="cheapest|balanced|best" in spec |

---

## What's Missing from AI Creator

### 1. **Execution Modes (Spec 053)**
Creator should ask in interview or set in design:
- `executionMode: "single_shot" | "agentic"`
- `planningStrategy: "basic" | "cot" | "react"` (if agentic)
- `maxReflectionCycles: 1-10`
- `maxTotalIterations: integer`

Currently: Never set. Defaults would be single_shot if field existed.

### 2. **Long-Term Memory (Spec 053)**
Creator should ask:
- "Should agents remember information across conversations?"
- Set `nodeConfig.enableLongTermMemory: boolean` per agent

Currently: Not asked, not set.

### 3. **Agency Objective (Spec 056)**
Creator should prompt:
- "What is the overall goal of this agency?"
- Set `agencies.objective: string`

Currently: Agency.objective field exists but AI creator never populates it.

### 4. **Memory Scope (Spec 056)**
Creator should decide per agent:
- `nodeConfig.memoryScope: "agency" | "node"`

Currently: No field, not generated.

### 5. **Capability-Based Model Selection**
Creator should ask:
- "Does this agent need vision? Code execution? Web search?"
- Generate `modelRequirements` instead of hardcoded `model`

Currently: Always uses single `model` field. modelRequirements exists in schema but never populated by creator.

### 6. **Cost Controls**
Creator should set per agent:
- `nodeConfig.creditCap?: number` (max credits per run)
- Part of cost control framework from spec 053

Currently: Not generated.

### 7. **Advanced Node Types**
Creator mentions 14 node types in planning phase but doesn't actively encourage their use in design:
- parallel_fan_out, conditional_branch, loop_retry, skill_discovery, error_handler, browser_session
- These exist in schema but creator rarely generates them

---

## Root Cause Analysis

1. **LLM Prompts are Outdated**
   - `_llm_design()` prompt doesn't mention executionMode, planningStrategy, or memory fields
   - Doesn't ask for capability requirements for model selection
   - Doesn't prompt for agency objective

2. **Schema Evolution Outpaced Creator**
   - Schemas added fields for 053 + 056 features
   - Creator code not updated to populate them
   - No schema version migration in creator

3. **No Interview Questions for Advanced Features**
   - Discover phase only asks if requirement is "clear"
   - Should ask: "Do agents need to learn? Should they think through problems? Any special models needed?"
   - No flow to collect capability requirements

4. **Validation Doesn't Check for Missing Fields**
   - `_validate_spec()` fills gaps (missing entry point, router config) but doesn't add executionMode or memory flags

---

## Recommendation

### Minimum Fix (Quick Win)
1. Add `executionMode` and `enableLongTermMemory` to LLM design prompt
2. Set defaults in `_validate_spec()`:
   - executionMode = "single_shot"
   - enableLongTermMemory = false
3. Prompt creator to ask: "Should agents use advanced reasoning? Persist learning?"

### Medium Fix (One Phase)
1. Enhance interview phase to ask capability requirements
2. Update design LLM prompt to include:
   - executionMode, planningStrategy, maxReflectionCycles
   - Agency objective
   - enableLongTermMemory per agent
3. Populate nodeConfig with these fields in _implement_agency()

### Full Fix (Spec Alignment)
1. Add memory scope interview questions
2. Implement capability-based model selection (modelRequirements)
3. Add cost control questions
4. Enhance design prompt to actively suggest advanced node types

---

## Files to Modify

**Python Backend:**
- `python-backend/app/tasks/agency_creator_task.py`:
  - `_llm_discover()` — enhance interview questions
  - `_llm_design()` — add new fields to system prompt
  - `_validate_spec()` — populate defaults for missing fields
  - `_implement_agency()` — pass nodeConfig.executionMode, etc.

**Node Backend:**
- `apps/web/server/routers/agency.ts` — saveBuilder already accepts all fields, no changes needed

**Frontend:**
- `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` — no changes needed (proxies to backend)

---

## Verification Checklist

After fixes:
- [ ] Create agency with requirement that suggests agentic reasoning
- [ ] Verify executionMode set in nodeConfig
- [ ] Verify enableLongTermMemory flag set
- [ ] Verify agency.objective populated
- [ ] Verify modelRequirements set when appropriate
- [ ] Verify all 14 node types can be suggested by LLM
- [ ] Check database: agencyAgents.nodeConfig has executionMode key

