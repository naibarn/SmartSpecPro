---
name: SmartSpecPro Capabilities-Based Model Routing
description: Complete audit of Chat's capability-driven model selection and gap analysis for Agency adoption
type: reference
---

# SmartSpecPro Capabilities-Based Model Routing

## Research Complete: 2026-03-23

This document captures the complete capabilities-based model selection system in Chat and identifies gaps for Agency adoption.

---

## 1. CAPABILITIES SCHEMA IN llmModels TABLE

**Location:** `apps/web/drizzle/schema.ts` lines 701-722

### Boolean Capability Columns (Direct DB fields)

```typescript
export const llmModels = pgTable("llm_models", {
  // ...
  supportsResponses: boolean("supportsResponses").default(false),           // OpenAI Responses API
  supportsStructuredOutputs: boolean("supportsStructuredOutputs").default(false),  // JSON mode
  supportsWebSearch: boolean("supportsWebSearch").default(false),          // Built-in search
  supportsFunctionTools: boolean("supportsFunctionTools").default(false),  // Function calling
  supportsCodeExecution: boolean("supportsCodeExecution").default(false),  // Sandbox execution
  supportsComputerUse: boolean("supportsComputerUse").default(false),      // Browser automation
  supportsBackground: boolean("supportsBackground").default(false),        // Async processing
  supportsVision: boolean("supportsVision").default(false),                // Image input
  supportsThinking: boolean("supportsThinking").default(false),            // Chain-of-thought reasoning
  // ...
});
```

### Legacy Config JSON (deprecated, kept for compatibility)

```typescript
configJson: json("configJson").$type<{
  maxTokens?: number;
  temperature?: number;
  supportsVision?: boolean;      // DEPRECATED — use column instead
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  headers?: Record<string, string>;
  [key: string]: any;
}>(),
```

**Status:** Capability flags are primary source of truth. Legacy configJson ignored in routing.

---

## 2. CAPABILITY-AWARE MODEL SELECTION IN CHAT

### Entry Point: intelligentModelSelector.ts

**Location:** `apps/web/server/services/intelligentModelSelector.ts` (254 lines)

#### CapabilityRequirements Interface (Lines 118-130)

```typescript
export interface CapabilityRequirements {
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  contextLength?: number;  // Minimum context window in tokens
}
```

**Key rules:**
- Only `true` values act as filters (AND logic)
- `false` values are ignored (don't exclude models with that capability)
- `contextLength` is a minimum threshold (model.contextLength >= requirement)

#### Priority Scoring (Lines 103-109)

```typescript
export function computeModelPriority(model: ModelPriorityInput): number {
  // Weighted scoring: 1–85 range
  const total =
    recencyScore(model.createdAt) +      // +15–40 (newer = higher priority)
    costScore(model) +                   // +5–30 (free > cheap > expensive)
    capabilityScore(model);              // +0–30 (count of true capabilities)
  return Math.max(1, Math.round(100 - total));
  // Lower number = higher priority
}
```

**Scoring weights:**
- **Recency** (15–40 pts): Models <30 days old score 40, >1yr scores 10
- **Cost** (5–30 pts): Free models score 30, sub-$0.5 score 25, $2+ score 10–15
- **Capabilities** (0–30 pts): Score = (count_true_flags / 9) * 30

#### Model Selection Algorithm (Lines 160-203)

**Function:** `selectBestLlmModel(requirements, rows) → string | null`

```
Step 1: Filter by boolean capabilities (AND logic)
        For each required capability set to true:
          Exclude any row where row[capability] !== true

Step 2: Filter by contextLength
        If requirement.contextLength is set:
          Exclude any row where row.contextLength < requirement

Step 3: Sort by priority ASC
        (lower number = higher priority, calculated by computeModelPriority)

Step 4: Return first match or null
```

**Example:**
```typescript
selectBestLlmModel(
  { supportsVision: true, supportsThinking: true },
  [
    { modelId: "claude-opus", supportsVision: true, supportsThinking: true, priority: 25 },
    { modelId: "gpt-4-turbo", supportsVision: true, supportsThinking: false, priority: 30 },
    { modelId: "claude-3.5-sonnet", supportsVision: true, supportsThinking: true, priority: 28 },
  ]
)
// Returns "claude-opus" (priority 25 < 28)
```

### Candidate Selection (Lines 210-234)

**Function:** `selectLlmModelCandidates(requirements, rows, maxCandidates=5) → string[]`

Returns up to N sorted model IDs (used for fallback chains).

---

## 3. CHAT'S MODEL SELECTION IN PRACTICE

### Where Requirements Are Declared

**Skill Frontmatter Example** (`apps/web/skills/*/skill.md`):

```yaml
name: vision-analyzer
category: prompt_enhancement
# Skill declares what it needs from the model:
requirements:
  supportsVision: true
  supportsThinking: true
```

**Chat UI Integration** (via Chat router → skillDetector → skillExecutor):

1. User sends message
2. Skill detection runs, matches a skill with requirements
3. `skillExecutor.ts` calls `selectBestLlmModel(skill.requirements, allEnabledModels)`
4. Best matching model is selected automatically
5. Request routed to selected provider via llmRouter.ts

### llmRouter.ts: Provider Routing (54–192)

**Context:** After model is selected, llmRouter resolves the **provider** for that model.

```typescript
export async function resolveProviders(modelId: string): Promise<ProviderCandidate[]> {
  // Queries model_provider_map (model → providers mapping)
  // Applies routing rules (cost, priority, health)
  // Returns sorted list of providers to try
}
```

**Key insight:** Model selection (capability-based) and provider selection (cost/health-based) are **separate concerns**.

---

## 4. CURRENT AGENCY MODEL SELECTION

### Agency Agent Model Field

**Location:** `apps/web/drizzle/schema.ts` lines 4661, 4662

```typescript
export const agencyAgents = pgTable("agency_agents", {
  // ...
  model: varchar("model", { length: 100 }),           // Simple string, static
  modelSettings: json("modelSettings").$type<{
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  }>(),
  // ...
});
```

**Current behavior:**
- `model` field is a hardcoded model ID (e.g., "gpt-4-turbo")
- No capability requirements stored
- No dynamic selection logic
- Static at agent creation time

### Frontend Model Picker (ModelPicker.tsx)

**Location:** `apps/web/client/src/components/agency/ModelPicker.tsx` (136 lines)

- Fetches all available models via `trpc.llmProviders.availableModels.useQuery()`
- Groups by provider (cosmetic UI only)
- No capability filtering
- User manually selects model (no smart defaults)

### Python Backend: How Models Are Used

**Location:** `python-backend/app/services/agency_swarm_adapter.py` (lines 212, 191)

```python
def create_agent(self, config: AgentConfig, user_token: str, ...) -> Agent:
    """Construct an Agent with model routed through Node.js gateway."""
    model = self._create_model(config.model, user_token)  # Line 212
    # Creates OpenAIChatCompletionsModel(model=modelId)
    # Routes to Node.js /v1/chat/completions
    # No capability filtering; just passes modelId as-is
```

**Key gap:** Python backend receives model string, passes it directly to OpenAI-compatible gateway. No logic to select a better model if the stored one doesn't have required capabilities.

---

## 5. MODEL SELECTION FLOW IN ORCHESTRATOR

### Where Agency Model Gets Used (agency_orchestrator.py)

**Location:** `python-backend/app/services/agency_orchestrator.py`

**Current:**
- Agent nodes delegated to `AgencySwarmAdapter._create_agent(config)`
- `config.model` comes from DB unchanged
- No capability-aware selection
- No fallback if model lacks capabilities

**Needed:**
- Before creating agent, check if node has capability requirements
- If requirements exist, filter models and select best match
- Pass selected model to adapter instead of original

---

## 6. GAP ANALYSIS: AGENCY vs CHAT

| Feature | Chat | Agency | Gap |
|---------|------|--------|-----|
| **Capability Requirements** | Stored in skill.md frontmatter | Not stored anywhere | MISSING — No schema field for agency agent capability requirements |
| **Model Selection Logic** | `selectBestLlmModel()` pure function | None | MISSING — Need equivalent function in Python or JS |
| **Model Filtering** | AND logic: only true capabilities filter | N/A | MISSING — Must implement AND filter |
| **Priority Scoring** | recencyScore + costScore + capabilityScore | N/A | MISSING — No priority calculation |
| **Fallback Candidates** | `selectLlmModelCandidates()` for N models | N/A | MISSING — Single model only, no fallback |
| **Context Window Check** | Supported in CapabilityRequirements | N/A | MISSING — No contextLength field |
| **UI Integration** | Skill detection drives automatic selection | Static model picker | MISSING — No smart defaults or capability hints |
| **Python Backend** | Not used (Chat selection is Node.js-side) | `AgencySwarmAdapter` receives model string | PARTIAL — Python backend needs to know about capabilities |

### Critical Gaps to Implement

1. **Schema:** Add `capabilityRequirements` field to `agencyAgents` table
2. **UI:** Modify ModelPicker to show capability indicators and filter based on agent requirements
3. **Selection Logic:** Port `selectBestLlmModel()` to Python or call from orchestrator
4. **Orchestrator Integration:** Before delegating to adapter, resolve model based on capabilities + fallbacks
5. **Audit Trail:** Store resolved model (not just requested model) for cost tracking

---

## 7. RECOMMENDED IMPLEMENTATION STRATEGY

### Phase 1: Schema & Storage (1–2 hours)

Add capability requirements to agency agents:

```typescript
// In agencyAgents table:
capabilityRequirements: json("capabilityRequirements").$type<Partial<CapabilityRequirements>>(),
modelStrategy: varchar("modelStrategy", { length: 20 }).default("best"), // "cheapest" | "best" | "fastest"
```

### Phase 2: UI Enhancement (2–3 hours)

Enhance ModelPicker to:
- Show which models support which capabilities (icons: vision, thinking, function tools, etc.)
- Auto-filter based on agent's declared requirements
- Show priority score and estimated cost
- Allow user to override with fallback selection

### Phase 3: Selection Logic (2–4 hours)

Option A: Port to Python (2–3 hrs)
- Implement `selectBestLlmModel()` in `python-backend/app/services/capability_selector.py`
- Call from orchestrator before delegating agent nodes

Option B: Extend Node.js tRPC (2–4 hrs)
- Add `agency.selectModelByCapabilities(requirements, strategy)` tRPC procedure
- Orchestrator calls it as pre-flight before starting run
- Return fallback model list for each agent node

### Phase 4: Orchestrator Integration (1–2 hours)

Modify `AgencyOrchestrator._execute_node()`:
- When executing agent node, check `node.capabilityRequirements`
- If present, resolve best model(s) from enabled models list
- Pass to `AgencySwarmAdapter` instead of static model
- Track resolved model in context for cost/audit

### Phase 5: Testing & Validation (1–2 hours)

- Test: Requirements filter works (AND logic)
- Test: Priority scoring matches Chat behavior
- Test: Fallback selection works
- Test: Cost tracking captures resolved model, not original model

---

## 8. CODE REFERENCE

| File | Lines | Purpose |
|------|-------|---------|
| **Schema** | `apps/web/drizzle/schema.ts` | 701–722 (llmModels), 4661–4662 (agencyAgents.model) |
| **Selection Logic** | `apps/web/server/services/intelligentModelSelector.ts` | 1–254 (full file) |
| **Priority Scoring** | `intelligentModelSelector.ts` | 89–109 |
| **Filtering Algorithm** | `intelligentModelSelector.ts` | 160–203 |
| **Adapter (Python)** | `python-backend/app/services/agency_swarm_adapter.py` | 193–220 |
| **Orchestrator** | `python-backend/app/services/agency_orchestrator.py` | 177–300+ |
| **Resolver (Chat)** | `apps/web/server/services/modelResolver.ts` | 43–115 |
| **Router (Chat)** | `apps/web/server/services/llmRouter.ts` | 54–192 |

---

## 9. KEY INSIGHTS

1. **Separation of Concerns:** Model selection (capability-based) is separate from provider selection (cost/health-based). This is intentional and should be preserved in Agency.

2. **Pure Function:** `selectBestLlmModel()` is deterministic and testable. Easiest to port to Python or keep in Node.js as RPC.

3. **Fallback Strategy:** Chat doesn't use fallback models (single best selection). Agency may want to for resilience.

4. **Priority Scoring:** Weights favor recency (newer models better) and cost (free/cheap better). This drives "free models first" behavior in Chat.

5. **Context Window:** Already supported in CapabilityRequirements but rarely used in practice. Should be supported in Agency.

6. **No User Override:** Current Chat flow is fully automatic. Agency UI will need to expose model selection to user (either automatic or manual).

---

## 10. QUESTIONS FOR PRODUCT/DESIGN

1. Should agency agent model selection be:
   - **Automatic** (system picks best based on capabilities)?
   - **User-controlled** (user selects, system validates)?
   - **Hybrid** (system suggests, user can override)?

2. Should agency nodes declare capability requirements:
   - **In DB schema** (new field)?
   - **Inferred from attached tools/skills**?
   - **Both** (explicit + inferred)?

3. Should fallback models be supported:
   - If primary model fails, try next best?
   - Or fail-fast if primary unavailable?

4. Should model selection be:
   - **Resolved once at agency run start** (all agents get fixed model list)?
   - **Resolved per-agent-execution** (each agent independently selects)?

5. Cost tracking:
   - Should we track "requested model" vs "resolved model"?
   - Needed for cost reconciliation if fallback occurs?
