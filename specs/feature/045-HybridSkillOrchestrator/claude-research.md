# Research: Hybrid Skill Orchestrator

## Codebase Research

### Skill Execution Pipeline (Complete Flow)

```
User Message (chat.sendMessage)
    ↓
├─→ detectSkill(message, conversationId, skillSettings, userId)
│   ├─→ Load available skills (sorted by priority)
│   ├─→ Check each skill's triggers (regex)
│   └─→ Return: { detected, skill, confidence, matchedTrigger, suggestedPrompt, patternChainTo }
│
├─→ executeSkill(skill, params, userId, userToken, tenantId)
│   ├─→ "core-text"/"llm-only" → Return text for LLM processing
│   ├─→ "sandbox-*" → Dispatch to OpenSandbox
│   ├─→ "python" → executePythonSkill() async subprocess
│   └─→ media type → executeImageGeneration/Video/Audio
│
├─→ Chaining: skill.chainTo or trigger.patternChainTo
│   └─→ If present, recursively detectSkill + executeSkill with output
│
└─→ Response saved to messages table
```

### Key Interfaces

**SkillExecutionParams:**
```typescript
interface SkillExecutionParams {
  prompt: string;
  conversationId?: string;
  context?: Record<string, unknown>;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  numImages?: number;
  duration?: number;
  voice?: string;
  resolution?: string;
  referenceImageUrls?: string[];
  referenceStyleUrl?: string;
  apiConfig?: Record<string, string>;
  extraParams?: Record<string, any>;
  publicUrl?: string;
}
```

**SkillExecutionResult:**
```typescript
interface SkillExecutionResult {
  success: boolean;
  type: string;           // "text", "image", "video", "audio", "sandbox-job"
  content?: string;
  urls?: string[];
  taskId?: string;
  isAsync?: boolean;
  creditsUsed?: number;
  error?: string;
}
```

### Task Execution Planner (existing)

- `taskExecutionPlanner.ts` — classifies tasks into types (chat/skill/media/agency), complexity (simple/moderate/complex), and strategies (cheapest/fastest/best)
- `taskPlannerMiddleware.ts` — runs planner, resolves model, creates task_run records
- `capabilityRegistry.ts` — filters models by capability requirements
- `modelResolver.ts` — ranks models by strategy (cheapest/fastest/best)

### LLM Integration

- `llm.ts` — core types (Message, Tool, InvokeParams, InvokeResult)
- `llmRouter.ts` — resolveProviders(), getProviderForModel()
- Function calling supported via `Tool` type with JSON Schema parameters
- Structured output via `outputSchema` or `responseFormat` params

### Credit System

- `creditService.ts` — atomic credit deduction (SQL WHERE credits >= amount)
- `budgetService.ts` — tenant-level budget checking
- Cost calculation: provider-reported → model-lookup → default rate fallback
- CreditSourceType includes: chat, skill, media_image, media_video, agency, etc.

### Audit Logging

- `auditLogger.ts` — 87 event types, JSONL format, buffered writes
- Key events: skill_detect, skill_execute, llm_request, llm_response
- Includes traceId, timing, cost, credits, error info

### Feature Flags

- `featureFlags.ts` — Redis-based, supports global + tenant-scoped flags
- Pattern: `getFeatureFlag(name)` / `getTenantFeatureFlag(name, tenantId)`

### Skill Input Schemas

Skills define inputs via two mechanisms:
1. **schemas/input.schema.json** — Standard JSON Schema for formal inputs
2. **schemas/ui.schema.json** — UI layout with Thai labels, sections, icons
3. **skill.md frontmatter** — execution_policy, model requirements

Current extractSkillParams() only extracts: prompt, media params (style/quality/aspectRatio/numImages/duration), model. It does NOT use input.schema.json for structured extraction.

### Agency System (alternative orchestration)

- `agencyBridge.ts` — multi-agent orchestration with entry/supervisor agents
- Supports routers, aggregators, knowledge bases, skill calls, human approval
- Full ReAct-style: agents pass messages, decide next steps, use tools
- Could be reused as pattern for COMPLEX orchestration mode

---

## Web Research

### Topic 1: LLM Intent Classification for 48+ Skills

**Best Practice: Hybrid Semantic Router + LLM**

1. **Tier 1 — Embedding-based routing (~100ms)**
   - Pre-encode example utterances per skill as embeddings
   - At runtime, embed user query → cosine similarity → nearest match
   - Handles 80-90% of queries without LLM call
   - Library: aurelio-labs/semantic-router

2. **Tier 2 — Hierarchical LLM classification (~500ms-1s)**
   - When embedding confidence < 0.82, fall back to LLM
   - NEVER present all 48 skills flat — too much ambiguity
   - Instead: Category first (6-8 options) → Skill within category (5-8)
   - Use function calling (not plain JSON) — models are trained for tool selection

3. **Confidence Thresholds:**
   - >= 0.85: Auto-route
   - 0.70-0.85: Route with soft confirmation
   - 0.50-0.70: Clarification prompt (show top 2-3)
   - < 0.50: Fallback to general chat

4. **Multi-intent detection:** Queries like "write article + generate image" should return array of skills

### Topic 2: ReAct Agent Loop in TypeScript

**Minimal implementation = LLM in a loop with tool calling:**

```typescript
for (let i = 0; i < maxIterations; i++) {
  const response = await llm.chat({ messages, tools });
  if (!response.tool_calls?.length) return response.content; // done
  for (const call of response.tool_calls) {
    const result = await tools[call.name].execute(call.params);
    messages.push({ role: 'tool', content: result });
  }
}
```

**Termination signals (use multiple):**
1. No tool calls in response (primary)
2. Max iterations reached
3. Token/cost budget exceeded
4. Time budget exceeded
5. Repeated same action (stuck detection)

**Context management:**
- Short loops (1-3 iter): Full history
- Medium (4-8 iter): Observation masking (summarize older results)
- Long (8+): Externalize state to object, trim conversation

**Cost control:**
- Agents consume ~4x more tokens than standard chat
- Use cheap models for classification, expensive for reasoning
- Plan-then-execute reduces LLM calls by 40-60%

### Topic 3: Pipeline Orchestration

**DAG execution with BullMQ + PostgreSQL (proven at 50K parallel tasks):**

```
Pipeline Definition (declarative)
    ↓
Topological sort → Enqueue root nodes
    ↓
Workers execute → Store results in DB
    ↓
On completion → Check & enqueue ready downstream
    ↓
All terminal nodes done → Aggregate results
```

**Error strategies per-task:**
- fail-fast: Cancel entire pipeline
- continue-on-error: Mark failed, proceed with available data
- retry-with-backoff: maxAttempts + exponential backoff

**Key: Store state in PostgreSQL, not just queue — enables audit + recovery**

---

## Testing Setup

- **Framework:** Vitest with @vitest/coverage-v8
- **Location:** `apps/web/server/services/__tests__/`
- **Mocking:** `vi.mock()` for services, `vi.fn()` for functions
- **Pattern:** describe/it/expect, async tests with mockResolvedValue
- **Coverage:** 80% minimum enforced

### Mock Patterns for Orchestrator

```typescript
vi.mock("../services/skillRegistry", () => ({
  getAvailableSkills: vi.fn(),
  getSkillById: vi.fn(),
}));

vi.mock("../services/creditService", () => ({
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  deductCredits: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"skillId":"image-creator"}' } }] }),
}));
```
