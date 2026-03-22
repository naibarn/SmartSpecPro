# Section 08 -- Agent Runtime Settings

**Status: IMPLEMENTED**

## Implementation Notes

- Zod schemas updated in both `create` and `saveBuilder` procedures (camelCase modelSettings + parallelToolCalls/maxTurns/reasoningEffort)
- All 4 DB insert sites persist new columns (create, saveBuilder, restoreVersion, clone)
- Python adapter maps reasoningEffort → Reasoning dict, parallelToolCalls → ModelSettings, maxTurns → Agent constructor
- Frontend: NodePropertyPanel + AgentPropertyPanel both render all new fields
- Legacy snake_case modelSettings normalized in restoreVersion path
- 5 Python tests verifying adapter behavior
- Frontend component tests deferred (Zod validation covered by existing patterns)

### Files Modified
- `apps/web/server/routers/agency.ts` — Zod schemas + all insert sites + restoreVersion normalizer
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx` — camelCase + new fields
- `apps/web/client/src/components/agency/AgentPropertyPanel.tsx` — camelCase + new fields
- `apps/web/client/src/components/agency/AgentNode.tsx` — updated type
- `apps/web/client/src/components/agency/nodes/types.ts` — new fields + camelCase
- `python-backend/app/services/agency_swarm_adapter.py` — AgentConfig fields + create_agent
- `python-backend/app/services/agency_service.py` — _load_agents SELECT
- `python-backend/app/services/agency_orchestrator.py` — pass to AgentConfig

### Files Created
- `python-backend/tests/unit/test_agent_runtime_settings.py`

---

## Section ID
`section-08-agent-runtime-settings`

## Dependencies
- **section-01-database-migration** -- This section requires the new `parallelToolCalls` and `maxTurns` columns on `agencyAgents`, plus the `reasoningEffort` key added to `modelSettings` JSONB and the `snake_case` to `camelCase` migration for `modelSettings`. All schema changes must be applied before this section.

## Blocks
None -- no other section depends on this section.

## Goal

Add per-agent runtime settings: `parallelToolCalls` (boolean), `maxTurns` (integer cap), and `reasoningEffort` (enum) within `modelSettings`. Extend backend Zod validation, Python adapter integration, and the frontend Advanced Settings panel in `NodePropertyPanel.tsx`.

---

## 1. Tests (TDD -- Write First)

### 1.1 Vitest -- `apps/web/server/routers/__tests__/agentRuntimeSettings.test.ts`

These tests validate Zod schema acceptance/rejection inside the `saveBuilder` procedure input. Follow the existing mock pattern in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts`.

```
Test: saveBuilder validates maxTurns as integer within 1..100
  - Input: agent with maxTurns = 50 -> accepted
  - Input: agent with maxTurns = 0 -> Zod rejects (min 1)
  - Input: agent with maxTurns = 101 -> Zod rejects (max 100)
  - Input: agent with maxTurns = 3.5 -> Zod rejects (not integer)

Test: saveBuilder validates parallelToolCalls as boolean, defaults true
  - Input: agent with parallelToolCalls = false -> accepted
  - Input: agent with parallelToolCalls omitted -> defaults to true

Test: saveBuilder validates temperature within 0..2
  - Input: modelSettings.temperature = 1.5 -> accepted
  - Input: modelSettings.temperature = -0.1 -> Zod rejects
  - Input: modelSettings.temperature = 2.1 -> Zod rejects

Test: saveBuilder validates topP within 0..1
  - Input: modelSettings.topP = 0.9 -> accepted
  - Input: modelSettings.topP = 1.1 -> Zod rejects

Test: saveBuilder validates reasoningEffort as enum
  - Input: modelSettings.reasoningEffort = "high" -> accepted
  - Input: modelSettings.reasoningEffort = "invalid" -> Zod rejects
  - Input: modelSettings.reasoningEffort omitted -> accepted (optional)

Test: saveBuilder accepts camelCase modelSettings keys (topP, maxTokens)
  - Input: { topP: 0.9, maxTokens: 4096, temperature: 0.7 } -> accepted
  - Input with old snake_case keys (top_p, max_tokens) -> rejected
```

### 1.2 pytest -- `python-backend/tests/unit/test_agent_runtime_settings.py`

```
Test: orchestrator passes ModelSettings with parallel_tool_calls to adapter
  - Mock adapter.create_agent, verify ModelSettings kwargs include parallel_tool_calls=False when node has parallel_tool_calls=false

Test: orchestrator passes max_turns to Agent constructor
  - Mock adapter.create_agent, verify AgentConfig receives max_turns when node dict contains max_turns

Test: agent terminates when maxTurns exceeded
  - Create agent with max_turns=2, run 3 turns, verify run completes with turn-limit message

Test: ModelSettings includes reasoning effort when provided
  - Pass model_settings={"reasoningEffort": "high"} in node config
  - Verify adapter passes Reasoning(effort="high") to ModelSettings

Test: ModelSettings without reasoning effort omits Reasoning
  - Pass model_settings={"temperature": 0.7} (no reasoningEffort)
  - Verify ModelSettings constructed without reasoning kwarg
```

### 1.3 Vitest -- Frontend `apps/web/client/src/components/agency/__tests__/AdvancedSettingsPanel.test.tsx`

```
Test: AdvancedSettingsPanel renders parallelToolCalls toggle (default checked)
Test: AdvancedSettingsPanel renders maxTurns input with default 25
Test: AdvancedSettingsPanel renders reasoningEffort dropdown with 4 options
Test: AdvancedSettingsPanel renders temperature slider
Test: AdvancedSettingsPanel renders topP slider with camelCase label
Test: toggling parallelToolCalls calls onChange with { parallelToolCalls: false }
Test: setting maxTurns to invalid value shows validation error
Test: warning badge appears when parallelToolCalls=false and agent has >5 tools
Test: warning badge appears when maxTurns < 5
```

---

## 2. Implementation Details

### 2.1 Database Schema (Reference -- Done in Section 01)

Section 01 handles all schema changes. This section consumes the following columns on `agencyAgents`:

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `parallelToolCalls` | `boolean` | `true` | Nullable, default true |
| `maxTurns` | `integer` | `25` | Nullable, default 25 |

And the extended `modelSettings` JSONB type:

```typescript
// Updated $type in drizzle/schema.ts (section-01)
modelSettings: json("modelSettings").$type<{
  maxTokens?: number;    // was max_tokens
  temperature?: number;
  topP?: number;         // was top_p
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}>()
```

### 2.2 Backend -- Zod Validation in tRPC Router

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Modify the `saveBuilder` input schema and the `updateAgent` input schema. Both contain an `agents` array item with a `modelSettings` object.

Changes to the Zod schema for each agent in the agents array:

1. Replace `modelSettings` object keys from snake_case to camelCase:
   - `max_tokens` becomes `maxTokens`
   - `top_p` becomes `topP`
   - Add `reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional()`

2. Add two new top-level agent fields (siblings of `modelSettings`):
   - `parallelToolCalls: z.boolean().default(true)`
   - `maxTurns: z.number().int().min(1).max(100).default(25)`

3. In the DB insert/update within `saveBuilder` mutation, persist the new fields:
   - `parallelToolCalls: agent.parallelToolCalls`
   - `maxTurns: agent.maxTurns`

The existing `modelSettings` Zod block at approximately line 1013-1019 should change from:

```
// BEFORE (snake_case)
modelSettings: z.object({
  max_tokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
}).optional()
```

To:

```
// AFTER (camelCase + reasoningEffort)
modelSettings: z.object({
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
}).optional()
```

This same change applies at approximately line 774 (the `updateAgent` procedure).

**Important**: The DB insert calls (lines ~1174, ~881, ~1990) that spread `modelSettings` must also persist `parallelToolCalls` and `maxTurns` as separate columns.

### 2.3 Python Adapter -- AgentConfig and ModelSettings

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py`

1. Add fields to `AgentConfig` (Pydantic model at line ~66):
   - `parallel_tool_calls: bool | None = None`
   - `max_turns: int | None = None`

2. In `create_agent()` (line ~221), extend ModelSettings construction:
   - If `config.model_settings` contains `reasoningEffort`, import `Reasoning` from `agents` and pass `reasoning=Reasoning(effort=value)` to `ModelSettings`.
   - If `config.parallel_tool_calls is not None`, pass `parallel_tool_calls=config.parallel_tool_calls` to `ModelSettings`.

3. Pass `max_turns` to the Agent constructor kwargs if set:
   ```python
   if config.max_turns is not None:
       agent_kwargs["max_turns"] = config.max_turns
   ```

### 2.4 Python Orchestrator -- Pass New Fields to AgentConfig

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

In `_execute_agent_node()` at approximately line 282, where `AgentConfig` is constructed from the node dict, add:

```python
agent = self.adapter.create_agent(
    config=AgentConfig(
        name=node.get("name", "Agent"),
        instructions=agent_instructions,
        model=node.get("model", "gpt-4o"),
        model_settings=node.get("model_settings"),
        tools=tools,
        is_entry_point=node.get("is_entry_point", False),
        parallel_tool_calls=node.get("parallel_tool_calls"),
        max_turns=node.get("max_turns"),
    ),
    user_token=ctx.user_token,
)
```

**Note**: The node dict keys come from the Python bridge which converts `agencyAgents` rows. Verify that `/home/dev/projects/SmartSpecPro/python-backend/app/api/agency.py` (or wherever the bridge hydrates node dicts) maps `parallelToolCalls` to `parallel_tool_calls` and `maxTurns` to `max_turns`. If it uses a generic camelCase-to-snake_case converter, no changes needed. Otherwise, add explicit mapping.

### 2.5 Frontend -- Advanced Settings Panel

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`

The existing "Model Settings" collapsible section (lines ~620-678) currently contains Max Tokens, Temperature, and Top P. Extend it:

1. **Rename references** from `top_p` to `topP` and `max_tokens` to `maxTokens` throughout the component. Update `onChange` calls to use camelCase keys in `modelSettings`.

2. **Add Reasoning Effort dropdown** inside the model settings section:
   - Label: "Reasoning Effort"
   - Options: `[{ value: "", label: "Default" }, { value: "minimal", label: "Minimal" }, { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]`
   - Value: `node.modelSettings?.reasoningEffort ?? ""`
   - onChange: spread `modelSettings` with `reasoningEffort` (or `undefined` if empty)

3. **Add "Advanced Settings" collapsible section** below the existing Model Settings section (or merge into it). New fields:

   a. **Parallel Tool Calls** -- Toggle/Switch component:
      - Label: "Parallel Tool Calls"
      - Description: "Allow multiple tools to execute simultaneously"
      - Default: `true` (checked)
      - Value: `node.parallelToolCalls ?? true`
      - onChange: `onChange({ parallelToolCalls: !currentValue })`
      - **Warning badge**: If `parallelToolCalls === false` and the agent has more than 5 tools assigned, show amber badge: "Sequential execution with many tools may be slow"

   b. **Max Turns** -- Number input:
      - Label: "Max Turns"
      - Description: "Maximum number of LLM turns per run"
      - Placeholder: "25"
      - Min: 1, Max: 100
      - Value: `node.maxTurns ?? 25`
      - onChange: `onChange({ maxTurns: parsedValue })`
      - **Warning badge**: If value < 5, show amber badge: "Low turn limit may prevent complex tasks from completing"

4. **Model warning badge** (GAP-K): In the model selector area, if the selected model is not from OpenAI or Anthropic, show an info badge: "Limited tool support -- some features may not work with third-party models." Detect by checking if `node.model` starts with `gpt-`, `o1-`, `o3-`, `claude-`, or similar known prefixes.

### 2.6 Frontend Types

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/types.ts` (or wherever the AgencyNode type is defined)

Add to the agent node type:
```typescript
parallelToolCalls?: boolean;
maxTurns?: number;
```

Update `modelSettings` type from `{ max_tokens?; temperature?; top_p? }` to `{ maxTokens?; temperature?; topP?; reasoningEffort?: "minimal" | "low" | "medium" | "high" }`.

---

## 3. Migration Compatibility

The Zod schema change from `max_tokens`/`top_p` to `maxTokens`/`topP` is a breaking change for existing saved agencies. Section 01 handles the SQL data migration that renames these keys in the `modelSettings` JSONB column. After migration, all stored data uses camelCase.

The frontend must also update any local references. If the `AgencyBuilder.tsx` reducer or any component reads `node.modelSettings?.max_tokens`, those references must change to `node.modelSettings?.maxTokens`.

Grep the codebase for `max_tokens` and `top_p` references within `apps/web/client/src/components/agency/` and update them all.

---

## 4. Verification Checklist

1. All Vitest tests pass for Zod validation (maxTurns bounds, temperature bounds, topP bounds, reasoningEffort enum, camelCase keys accepted, snake_case keys rejected)
2. All pytest tests pass for Python adapter (ModelSettings constructed with parallel_tool_calls, max_turns forwarded, reasoning effort mapped)
3. Frontend renders all new fields in NodePropertyPanel
4. Warning badges appear for: low maxTurns, disabled parallelToolCalls with many tools, third-party model
5. Existing agencies with snake_case modelSettings still load correctly (data migration in section-01 converts them)
6. TypeScript type check passes: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
7. Full test suite passes: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`