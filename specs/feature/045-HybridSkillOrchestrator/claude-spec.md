# Claude Spec: Feature 045 — Hybrid Skill Orchestrator

*Synthesized from: initial spec, codebase research, web research, and stakeholder interview.*

## Problem Statement

SmartSpecPro has 48+ skills with diverse input schemas (ranging from 10 to 24+ fields per skill). The current system:

1. Uses regex-only pattern matching (`skillDetector.ts`) — cannot understand semantic intent
2. Routes to a single skill per message — no multi-skill composition
3. `extractSkillParams()` only extracts `prompt` + basic media params — **ignores skill-specific input.schema.json entirely**
4. No quality validation on outputs
5. No self-correction if wrong skill selected

As the catalog grows, regex overlap increases and users can't discover the right skill.

## Solution: Adaptive Hybrid Orchestrator

A 3-tier orchestrator that escalates complexity on-demand:

```
User Message
     │
     ▼
[Stage 1: Intent Classifier]  ← cheap LLM, every request (~$0.001)
     │
     ├── SIMPLE  → Direct Route (1 skill)
     ├── COMPOUND → Pipeline Engine (N skills, parallel/sequential)
     └── COMPLEX  → Agent Loop (Plan→Act→Observe→Reflect, max 5 iter)
```

### Key Design Decisions (from interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parameter extraction | **Hybrid: LLM Extract + Confirm if low confidence** | LLM reads user message + input.schema.json → extracts params. If required fields missing/uncertain → show minimal form |
| Data flow between skills | **Output → Input Mapping** | Orchestrator LLM decides mapping between skill outputs and inputs |
| Missing required params | **Ask only critical missing fields** | LLM infers first, only asks user for fields that can't be inferred and have no defaults |
| Skill scope | **All 48 skills from day 1** | Use hierarchical classification (category → skill) to manage token overhead |
| Architecture layer | **New service layer** (skillOrchestrator.ts) | Separate from skillDetector.ts, called by chat.ts |

## Detailed Architecture

### Stage 1: Intent Classification

**Input:** User message + skill catalog (cached summary: id, name, description, category, input_types, output_types)

**Model:** Cheapest available via existing `taskExecutionPlanner` with `strategy: "cheapest"`. Use function calling (tools), NOT plain JSON — models are trained for tool selection.

**Classification prompt structure (hierarchical):**
1. Present 8 skill categories as tool choices
2. Within selected category, present specific skills
3. Return: `{ level, skills[], strategy, reasoning }`

**Output types:**

```typescript
interface ClassificationResult {
  level: "simple" | "compound" | "complex";
  skills: Array<{
    skillId: string;
    confidence: number;
    reason: string;
    extractedParams: Record<string, unknown>;  // from user message
    missingRequiredParams: string[];            // need user input
  }>;
  strategy: "single" | "parallel" | "sequential" | "agent";
  estimatedCreditCost: number;
  reasoning: string;
}
```

**Confidence thresholds:**
- >= 0.85: Auto-route, no confirmation
- 0.70-0.85: Route with soft note: "ใช้ X — ถ้าต้องการ skill อื่นบอกได้"
- 0.50-0.70: Show top 2-3 options for user to choose
- < 0.50: Fallback to general chat (no skill)

**Fallback:** If classifier fails/times out → fallback to regex `detectSkill()` with zero overhead.

### Stage 2: Parameter Extraction (NEW — Critical Gap Fix)

After skill selection, a second LLM call (can be combined with classifier):

1. **Load input.schema.json** for the selected skill
2. **LLM extracts** structured parameters from user message, using schema as guide
3. **Validate** extracted params against JSON Schema
4. **Apply defaults** from schema for missing optional fields
5. **Identify missing required fields** without defaults that LLM couldn't infer
6. If missing critical fields → **ask user** via minimal inline form (not full form)
7. If all filled → **proceed to execution**

Example flow:
```
User: "รีวิวมาม่าสไตล์เปรียบเทียบ ราคา 6 บาท"
→ Skill: food-grocery-reviewer
→ Extracted: { topic: "มาม่า", review_angle: "comparison", price_thb: 6, include_pricing: true }
→ Defaults applied: { language: "th", product_category: "instant_meal", length: "medium", ... }
→ Missing required: none → Execute
```

### Stage 3a: Direct Route (SIMPLE)

Same as current `executeSkill()` but with extracted params from Stage 2 instead of basic `extractSkillParams()`.

### Stage 3b: Pipeline Engine (COMPOUND)

```typescript
interface PipelineStep {
  skillId: string;
  params: Record<string, unknown>;
  dependsOn: string[];           // step IDs that must complete first
  inputMapping: Record<string, string>;  // { "topic": "step1.output.content" }
  errorStrategy: "fail-fast" | "continue" | "retry";
}

interface Pipeline {
  steps: PipelineStep[];
  parallelGroups: string[][];    // steps that can run concurrently
}
```

**Execution:**
1. Classifier provides pipeline plan
2. Engine topologically sorts steps
3. Independent steps run in parallel (Promise.all)
4. Output of step N maps to input of step N+1 via LLM-decided mapping
5. Each step uses its own skill's input.schema.json for validation

**Example:**
```
"เขียนบทความอาหารไทย สร้างรูปประกอบ แปลเป็นอังกฤษ"
→ Step 1: food-grocery-reviewer { topic: "อาหารไทย" }
→ Step 2: image-creator { prompt: step1.output → extract key visual } (parallel with step 3)
→ Step 3: translation { content: step1.output, targetLanguage: "en" }
→ Merge: { article_th, article_en, images[] }
```

### Stage 3c: Agent Loop (COMPLEX)

ReAct-style loop in Node.js (no LangGraph):

```typescript
async function agentLoop(message: string, config: AgentConfig): Promise<AgentResult> {
  const context: AgentContext = { message, results: [], decisions: [], totalCredits: 0 };

  for (let i = 0; i < config.maxIterations; i++) {
    // Ask LLM: what's next?
    const action = await classifyNextAction(context, config.availableSkills);

    switch (action.type) {
      case "execute_skill":
        const result = await executeSkillWithParams(action.skillId, action.params);
        context.results.push(result);
        break;
      case "execute_parallel":
        const results = await Promise.all(
          action.skills.map(s => executeSkillWithParams(s.skillId, s.params))
        );
        context.results.push(...results);
        break;
      case "quality_check":
        const pass = await validateOutput(context.results, message);
        if (!pass.ok) context.decisions.push({ retry: true, reason: pass.reason });
        break;
      case "done":
        return mergeResults(context);
    }

    context.totalCredits += action.creditCost;
    if (context.totalCredits >= config.budgetCap) break; // cost guard
  }
  return mergeResults(context);
}
```

**Termination signals:**
1. LLM returns `done` action (primary)
2. Max iterations reached (5)
3. Credit budget exceeded
4. Time budget exceeded (30s)
5. Same action repeated twice (stuck detection)

### Result Merger

Combines outputs from multiple skill executions:

```typescript
interface MergedResult {
  sections: Array<{
    skillId: string;
    type: "text" | "image" | "video" | "audio" | "structured";
    content: string;
    urls?: string[];
    metadata: { creditsUsed: number; durationMs: number };
  }>;
  summary: string;           // LLM-generated summary of all results
  totalCreditsUsed: number;
  totalDurationMs: number;
}
```

### Quality Gate (Optional)

LLM validates:
- Completeness: did we address all parts of the request?
- Coherence: do outputs work together?
- Quality: is the output good enough?

Tenant-configurable: enable/disable, strictness level.

## New Files

| File | Purpose |
|------|---------|
| `apps/web/server/services/skillOrchestrator.ts` | Main entry: `orchestrateSkill()` — routes to correct execution path |
| `apps/web/server/services/skillIntentClassifier.ts` | LLM intent classification + skill selection + hierarchical routing |
| `apps/web/server/services/skillParamExtractor.ts` | **NEW** — LLM-based parameter extraction using input.schema.json |
| `apps/web/server/services/skillPipelineEngine.ts` | COMPOUND: parallel/sequential pipeline execution |
| `apps/web/server/services/skillAgentLoop.ts` | COMPLEX: ReAct agent loop |
| `apps/web/server/services/skillResultMerger.ts` | Combine multi-skill outputs |
| `apps/web/server/services/skillQualityGate.ts` | Optional output quality validation |
| `apps/web/shared/orchestration/types.ts` | Shared types (ClassificationResult, PipelineStep, etc.) |

## Modified Files

| File | Change |
|------|--------|
| `apps/web/server/routers/chat.ts` | Add `orchestrateSkill()` call with feature flag toggle |
| `apps/web/server/services/skillDetector.ts` | Export interfaces for fallback use |
| `apps/web/server/services/skillRegistry.ts` | Add `getSkillCatalogSummary()` for classifier context |
| `apps/web/server/services/auditLogger.ts` | Add event types: `orchestration_classify`, `orchestration_pipeline`, `orchestration_agent_step` |
| `packages/skills/src/types.ts` | Add `OrchestrationMetadata` type for optional skill.md frontmatter |

## Feature Flags

```typescript
// Global toggle (default: false during rollout)
"skillOrchestratorEnabled"

// Tenant-level complexity limit
// Values: "disabled" | "simple" | "compound" | "complex"
"skillOrchestratorMaxLevel"
```

When disabled → system uses existing `detectSkill()` with zero overhead.

## Cost Structure

| Level | LLM Calls | Est. Cost | Added Latency |
|-------|-----------|-----------|---------------|
| SIMPLE | 1 (classifier + param extraction) | ~$0.001-0.003 | +0.3-0.5s |
| COMPOUND | 1 (classifier) + N (skill executions) | ~$0.005-0.02 | +0.5-1s setup |
| COMPLEX | 1 (classifier) + 2-5 (agent decisions) + N (skills) | ~$0.02-0.10 | +2-5s total |

Budget cap per session: configurable per tenant, default = user's remaining credit balance.

## Security Constraints

- Orchestrator respects existing user skill visibility (userSkillVisibility table)
- Credit checks before each skill execution (atomic deduction)
- Rate limiting per user per orchestration session
- Input sanitization before classifier LLM call
- Never expose skill content/system prompts to classifier — only name, description, category
- Audit trail for every orchestration decision

## Non-Functional Requirements

- SIMPLE: max +500ms latency over current system
- Classifier: must respond within 1 second
- COMPLEX agent loop: max 30 seconds total
- Circuit breaker: if classifier error rate > 20% → auto-disable for 5 minutes → fallback to regex
- Zero downtime: feature flag enables gradual rollout
