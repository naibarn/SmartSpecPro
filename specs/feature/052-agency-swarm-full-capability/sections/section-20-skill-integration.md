I now have all the context needed. Let me produce the section content.

# Section 20 -- Enhanced Skill Integration

## Overview

This section enhances the existing `skill_call` node with field-level input mapping, chaining metadata, and category-based output routing. It also adds a new `skill_discovery` node type that auto-detects the best skill for a given task, a Skill Factory pattern for on-the-fly skill creation, and an Export as Skill dialog for packaging agency sub-graphs into reusable skills.

**Feature**: 2.21 Enhanced Skill Integration
**Phase**: 5 -- New Node Types & Skill Integration
**Depends on**: section-01-database-migration (schema columns), section-07-agency-context (AgencyRunContext for input mapping and output routing)
**Blocks**: section-22-ai-creator-v2 (must know about skill_discovery node type and input mapping configs)

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_skill_input_mapper.py` | Resolve field-level input mappings from static values, node outputs, and context keys |
| `python-backend/app/services/agency_skill_discovery.py` | Skill discovery logic: call Node.js skill-discovery endpoint, rank results, filter by confidence |
| `python-backend/tests/unit/test_agency_skill_input_mapper.py` | Unit tests for input mapping resolution |
| `python-backend/tests/unit/test_agency_skill_discovery.py` | Unit tests for skill discovery node handler |
| `apps/web/client/src/components/agency/nodes/SkillDiscoveryNodeCard.tsx` | ReactFlow node card for skill_discovery (teal, Search icon) |
| `apps/web/client/src/components/agency/SkillInputMapper.tsx` | Per-field input mapping UI: static / node-output / context-key sources |
| `apps/web/client/src/components/agency/ExportAsSkillDialog.tsx` | Dialog to export a sub-graph as a reusable skill definition |

## Files to Modify

| File | Change |
|------|--------|
| `python-backend/app/services/agency_orchestrator.py` | Add `skill_discovery` case to match statement; update `_call_skill` to resolve input mappings before execution; add output routing by skill category |
| `python-backend/app/orchestrator/node_executors/skill_executor.py` | Accept resolved input mappings dict; add `discover_skills` method that delegates to `agency_skill_discovery.py` |
| `apps/web/client/src/components/agency/nodes/types.ts` | Add `"skill_discovery"` to `AgencyNodeType` union |
| `apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` | Add `skill_discovery` case to dispatcher switch |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add `SkillDiscoveryForm` for skill_discovery config; enhance `SkillCallForm` with `SkillInputMapper` component; show chain badge when skill has `chainTo` metadata |
| `apps/web/server/routers/agency.ts` | Extend `saveBuilder` Zod validation for `skill_discovery` nodeConfig fields; validate `skill_call` input mapping schema |
| `apps/web/server/lib/agencySvgGenerator.ts` | Add SVG rendering for `skill_discovery` node type |
| `apps/web/server/routers/skillDiscoveryTool.ts` | Extend endpoint to accept `confidenceThreshold` and `maxResults` params (for agency skill_discovery node calls) |

---

## Tests -- Write First

### Python Tests

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_skill_input_mapper.py`

```
# Test 1: resolve_mappings returns static values unchanged
#   - mapping: {"title": {"source": "static", "value": "Hello"}}
#   - result: {"title": "Hello"}

# Test 2: resolve_mappings resolves node output references
#   - mapping: {"content": {"source": "node_output", "nodeId": "node-1", "outputField": "result"}}
#   - context results: {"node-1": {"result": "Generated text"}}
#   - result: {"content": "Generated text"}

# Test 3: resolve_mappings resolves context keys
#   - mapping: {"lang": {"source": "context", "contextKey": "user_language"}}
#   - AgencyRunContext seeded with {"user_language": "en"}
#   - result: {"lang": "en"}

# Test 4: backward compatible -- unmapped skill_call sends full context as input_data
#   - No inputMappings in nodeConfig
#   - Existing behavior: pass ctx.input + ctx.results as combined input_data dict

# Test 5: resolve_mappings returns None for missing node output reference (graceful fallback)
#   - mapping references nodeId "node-99" which has no results
#   - result: {"field": None}

# Test 6: resolve_mappings returns None for missing context key (graceful fallback)
#   - mapping references contextKey "nonexistent"
#   - result: {"field": None}

# Test 7: mixed mapping sources resolve correctly in single call
#   - 3 fields: one static, one node_output, one context
#   - All resolve to correct values
```

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_skill_discovery.py`

```
# Test 1: skill_discovery returns ranked skills with confidence scores
#   - Mock the Node.js skill-discovery HTTP endpoint
#   - Provide description "generate product image"
#   - Verify response includes skill list with id, name, confidence

# Test 2: skill_discovery respects confidenceThreshold -- filters out low-confidence results
#   - Mock returns 3 skills with confidence 0.9, 0.6, 0.3
#   - confidenceThreshold = 0.7
#   - Only skill with 0.9 confidence returned

# Test 3: skill_discovery maxResults capped at 10 server-side
#   - nodeConfig sets maxResults = 50
#   - Verify capped to 10 in request to discovery endpoint

# Test 4: skill_discovery stores results in AgencyRunContext under "{nodeName}_discovered"
#   - After execution, context key holds the discovery result list

# Test 5: skill_discovery with category filter passes filter to endpoint
#   - nodeConfig: {"skillCategories": ["image_generation"]}
#   - Verify HTTP request includes category filter

# Test 6: skill_discovery with no matches returns empty list (not error)

# Test 7: skill_discovery with taskSource "context" reads task from context key
#   - nodeConfig: {"taskSource": "context", "contextKey": "task_description"}
#   - AgencyRunContext has "task_description": "create a banner"
#   - Verify discovery query uses "create a banner"
```

### TypeScript Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencySkillIntegration.test.ts`

```
# Test 1: saveBuilder validates skill_discovery nodeConfig -- requires taskSource field
#   - Submit node with nodeType "skill_discovery" and empty nodeConfig
#   - Expect Zod validation error

# Test 2: saveBuilder validates skill_call inputMappings schema
#   - Submit skill_call with inputMappings containing invalid source type
#   - Expect validation error

# Test 3: saveBuilder accepts valid skill_call with inputMappings
#   - inputMappings: {"title": {"source": "static", "value": "test"}}
#   - Expect success

# Test 4: saveBuilder accepts valid skill_discovery with all config fields
#   - nodeConfig: {taskSource: "static", taskValue: "analyze data", confidenceThreshold: 0.8, maxResults: 5}
#   - Expect success

# Test 5: saveBuilder validates confidenceThreshold range (0.0 to 1.0)
#   - confidenceThreshold: 1.5
#   - Expect validation error
```

Markers for Python: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio`.
Vitest pattern: co-locate in `__tests__/` directory per existing convention.

---

## Implementation Details

### 1. Skill Input Mapping (Python)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_skill_input_mapper.py`

Define a `resolve_skill_input_mappings` async function. It accepts:
- `mappings: dict[str, dict]` -- the inputMappings from nodeConfig
- `context: AgencyRunContext` -- the shared run context (from section-07)
- `results: dict[str, Any]` -- node execution results keyed by node ID

Each mapping entry has the shape:
```python
{
  "source": "static" | "node_output" | "context",
  "value": Any,           # for source=static
  "nodeId": str,          # for source=node_output
  "outputField": str,     # for source=node_output (dot-path into result)
  "contextKey": str,      # for source=context
}
```

Resolution logic:
- `static` -- return `mapping["value"]` directly
- `node_output` -- look up `results[nodeId]` and extract `outputField` using dot-path navigation (e.g., `"outputs.result"` traverses nested dicts). Return `None` if path not found.
- `context` -- call `await context.get(contextKey)`. Return `None` if key missing.

For backward compatibility: if `inputMappings` is absent or empty in nodeConfig, the existing behavior of passing full context as `input_data` is preserved (no mapping resolution needed).

### 2. Enhanced `_call_skill` in Orchestrator

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

Modify `_call_skill` method:
1. Read `inputMappings` from `nodeConfig`.
2. If present, call `resolve_skill_input_mappings(mappings, ctx.agency_run_context, ctx.results)`.
3. Pass resolved dict as `input_data` to the skill execution endpoint instead of raw `ctx.input`.
4. After execution, apply **output routing** based on the skill's category:
   - `prompt_enhancement` / `chat_assistant` -- store result text as the node output string (pass to next node).
   - `image_generation` / `audio_generation` -- store URL in context under `{nodeName}_media_url` and pass URL string as node output.
   - `video_generation` -- store job reference in context under `{nodeName}_job` for polling.
5. Read `chainTo` from skill metadata (returned by the skill endpoint). If present, log it and store in context under `{nodeName}_chainTo` for downstream conditional_branch nodes to route on.

### 3. Skill Discovery Node (Python)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_skill_discovery.py`

Define an async function `execute_skill_discovery`:
- Reads from nodeConfig: `taskSource`, `taskValue`, `contextKey`, `confidenceThreshold` (default 0.7), `maxResults` (server-side cap 10), `skillCategories` (optional list).
- Resolves the task description:
  - `taskSource == "static"` -- use `taskValue`
  - `taskSource == "context"` -- read from `AgencyRunContext` using `contextKey`
  - `taskSource == "previous_output"` -- use the output string from the previous node in results
- Calls the existing Node.js skill discovery endpoint: `POST /api/internal/tools/skill-discovery` (defined in `apps/web/server/routers/skillDiscoveryTool.ts`). Pass `description`, `category` (first from `skillCategories`), `limit` (capped `maxResults`).
- Filters results by `confidenceThreshold`.
- Stores the result list in AgencyRunContext under key `{nodeName}_discovered`.
- Returns a summary string as node output (e.g., "Discovered 3 skills: image_prompt_engineer (0.92), video-prompt-engineer (0.85), ...").

Add a new case `"skill_discovery"` to the orchestrator match statement that calls this function.

### 4. Skill Discovery Node (Frontend)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/SkillDiscoveryNodeCard.tsx`

Node card component following the pattern of `SkillCallNodeCard.tsx`:
- Color: teal (`border-teal-300`, `ring-teal-500`)
- Icon: `Search` from lucide-react
- Shows configured task source type and confidence threshold
- Shows validation errors when `taskSource` is not configured

**Type update** in `types.ts`: Add `"skill_discovery"` to the `AgencyNodeType` union.

**BaseAgencyNode.tsx**: Add case `"skill_discovery": return <SkillDiscoveryNodeCard {...props} />;`

### 5. Skill Discovery Property Panel

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`

Add `SkillDiscoveryForm` component (pattern matches `SkillCallForm`):
- **Task Source**: Select with options "Static text", "From context key", "Previous node output"
- **Task Value**: Text input (shown when source = static)
- **Context Key**: Text input (shown when source = context)
- **Confidence Threshold**: Number input, min 0, max 1, step 0.05, default 0.7
- **Max Results**: Number input, min 1, max 10, default 5
- **Skill Categories**: Multi-select checkboxes for category filter (prompt_enhancement, image_generation, video_generation, audio_generation, chat_assistant)

### 6. Skill Input Mapper (Frontend)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/SkillInputMapper.tsx`

Component that replaces the current `AgencySkillInputs` static form with a mapping-aware version:
- Fetches the skill's input schema via `trpc.skills.getInputSchema`
- For each field in the schema, renders a row with:
  - Field name and type label
  - Source dropdown: "Static value" / "Node output" / "Context key"
  - Based on source: text input (static), node+field selectors (node output using sibling node list), text input (context key)
- Produces an `inputMappings` dict stored in `nodeConfig.inputMappings`
- Falls back to the existing `AgencySkillInputs` behavior when `inputMappings` is empty (backward compatible)

### 7. Chain Badge in Skill Call Form

In the `SkillCallForm` within `NodePropertyPanel.tsx`:
- After skill selection, fetch skill metadata (already available from `getInputSchema` response or a new lightweight endpoint).
- If skill has `chainTo` in its frontmatter, display a small teal badge: "Chains to: {chainTo skill name}".
- In the builder, suggest adding an edge to the chained skill if a `skill_call` node for it exists.

### 8. Skill Factory Pattern

When `skill_discovery` finds no matching skills above the confidence threshold:
- The node output includes a `"no_match": true` flag in the context result.
- Downstream nodes (typically a `conditional_branch`) can check this flag and route to an agent node configured with the `intelligent-skill-creator` builtin tool.
- The agent creates a new skill definition (skill.md + schemas) via the existing skill creator tool.
- Registration happens via the existing `POST /api/internal/tools/skill-discovery` or a new `POST /api/internal/skills/register` endpoint that calls `skillRegistry.registerGeneratedSkill()`.
- The new skill becomes available in the same run via context (stored under a key like `generated_skill_id`).

Implementation note: The Skill Factory is primarily an orchestration pattern (conditional_branch + agent with skill-creator tool), not a single monolithic feature. This section provides the `no_match` flag and context wiring; the actual skill creation uses existing infrastructure.

### 9. Export as Skill Dialog (Frontend)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ExportAsSkillDialog.tsx`

Dialog component accessible from the AgencyBuilder toolbar:
- User selects a contiguous sub-graph of nodes (multi-select in builder).
- Dialog shows:
  - **Skill name**: auto-generated from first agent's name, editable
  - **Description**: auto-generated from combined node instructions, editable
  - **Category**: dropdown (prompt_enhancement, image_generation, etc.)
  - **Input fields**: derived from the entry node's expected inputs
  - **Preview**: generated `skill.md` frontmatter + body
- On confirm, calls a new tRPC mutation `skills.exportFromAgency` that:
  - Generates `skill.md` from combined agent instructions
  - Generates `input.schema.json` from entry node input fields
  - Auto-generates `ui.schema.json` with Thai/English labels
  - Registers in skill registry

### 10. Zod Validation (Backend)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Extend `saveBuilder` Zod schema in the `.superRefine()` block:

For `skill_discovery` nodeConfig:
```
taskSource: z.enum(["static", "context", "previous_output"])
taskValue: z.string().max(500).optional()  // required when taskSource = static
contextKey: z.string().max(100).optional()  // required when taskSource = context
confidenceThreshold: z.number().min(0).max(1).default(0.7)
maxResults: z.number().int().min(1).max(10).default(5)
skillCategories: z.array(z.string()).max(5).optional()
```

For `skill_call` inputMappings (optional, for enhanced mapping):
```
inputMappings: z.record(z.string(), z.object({
  source: z.enum(["static", "node_output", "context"]),
  value: z.unknown().optional(),
  nodeId: z.string().optional(),
  outputField: z.string().optional(),
  contextKey: z.string().optional(),
})).optional()
```

Validation rules:
- When `taskSource = "static"`, `taskValue` must be non-empty.
- When `taskSource = "context"`, `contextKey` must be non-empty.
- For `inputMappings`, when `source = "node_output"`, both `nodeId` and `outputField` must be present.
- For `inputMappings`, when `source = "context"`, `contextKey` must be present.

---

## Dependencies on Other Sections

| Section | What This Section Uses |
|---------|----------------------|
| section-01-database-migration | `skill_discovery` must be a valid nodeType; no new columns needed beyond existing nodeConfig JSONB |
| section-07-agency-context | `AgencyRunContext` class for reading/writing context keys in input mapping and skill discovery |
| section-09-sse-streaming-backend | SSE events emitted during skill execution (tool_start, tool_end) |
| section-15-observability-tracing | Skill execution spans recorded in trace |
| section-17-conditional-branch-node | Can route based on skill_discovery results (confidence, no_match flag) |
| section-18-parallel-fanout-node | Dynamic branches from skill_discovery output (multiple skills executed in parallel) |

---

## Node Config Interfaces (TypeScript)

For reference by implementers, the TypeScript interfaces for the new/enhanced nodeConfig shapes:

```typescript
// skill_call enhanced nodeConfig (extends existing)
interface SkillCallNodeConfig {
  skillSlug: string;
  skillInputs?: Record<string, unknown>;        // existing static inputs
  inputMappings?: Record<string, {               // NEW: field-level mapping
    source: "static" | "node_output" | "context";
    value?: unknown;
    nodeId?: string;
    outputField?: string;
    contextKey?: string;
  }>;
  passInputThrough?: boolean;                    // existing
}

// skill_discovery nodeConfig (NEW)
interface SkillDiscoveryNodeConfig {
  taskSource: "static" | "context" | "previous_output";
  taskValue?: string;           // when taskSource = static
  contextKey?: string;          // when taskSource = context
  confidenceThreshold?: number; // 0.0-1.0, default 0.7
  maxResults?: number;          // 1-10, default 5
  skillCategories?: string[];   // filter by category
}
```

These are documentation-only; the runtime types are enforced by Zod on the backend and used as `Record<string, unknown>` in the existing `AgencyNodeData.nodeConfig` field.

---

## Output Routing Category Map

| Skill Category | Output Handling | Context Key Pattern |
|----------------|----------------|---------------------|
| `prompt_enhancement` | Pass result text as node output string | -- |
| `chat_assistant` | Pass result text as node output string | -- |
| `image_generation` | Store URL in context; pass URL as output | `{nodeName}_media_url` |
| `audio_generation` | Store URL in context; pass URL as output | `{nodeName}_media_url` |
| `video_generation` | Store job ref in context for polling | `{nodeName}_job` |

---

## Implementation Order

1. Write all Python tests (input mapper + skill discovery) -- they will fail initially.
2. Implement `agency_skill_input_mapper.py` -- make input mapper tests pass.
3. Implement `agency_skill_discovery.py` -- make discovery tests pass.
4. Update `agency_orchestrator.py` -- add `skill_discovery` case and enhance `_call_skill` with mapping resolution and output routing.
5. Write TypeScript validation tests, then update `agency.ts` Zod schema.
6. Add `SkillDiscoveryNodeCard.tsx` and update `BaseAgencyNode.tsx` + `types.ts`.
7. Add `SkillInputMapper.tsx` and integrate into `NodePropertyPanel.tsx` `SkillCallForm`.
8. Add `SkillDiscoveryForm` to `NodePropertyPanel.tsx`.
9. Add chain badge rendering in `SkillCallForm`.
10. Implement `ExportAsSkillDialog.tsx` (lower priority, can be deferred).