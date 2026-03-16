# Feature 045: Hybrid Skill Orchestrator

## Problem Statement

SmartSpecPro's skill system has grown to 48+ skills across content writing, media generation, product reviews, and specialist domains. The current skill detection uses regex-only pattern matching (`skillDetector.ts`), which:

1. **Cannot understand user intent** — only matches exact trigger patterns, not semantic meaning
2. **Routes to a single skill** — no multi-skill composition or parallel execution
3. **Has no quality validation** — outputs are returned as-is with no review
4. **Requires users to know skill names** — no intelligent discovery or suggestion
5. **Cannot self-correct** — if the wrong skill is chosen, there's no fallback

As the skill catalog grows, these limitations compound: more overlap between trigger patterns, harder for users to find the right skill, and no ability to compose workflows (e.g., "write an article, generate hero images, and translate to English").

## Goal

Build a **Hybrid Skill Orchestrator** that adaptively escalates complexity based on task requirements:

- **SIMPLE tasks** (single skill, clear intent): Route directly — cost ~$0.001, latency +0.3s
- **COMPOUND tasks** (multiple known skills): Pipeline execution — cost ~$0.005-0.02, latency +0.5s
- **COMPLEX tasks** (requires planning/iteration): Agent loop — cost ~$0.02-0.10, latency +2-5s

The key insight is: **pay for complexity only when the task demands it.** Most requests are SIMPLE and should stay fast and cheap. COMPLEX mode activates only when truly needed.

## Architecture Overview

```
User Message
     │
     ▼
┌─────────────────────────────┐
│  Stage 1: Intent Classifier │  ← cheap LLM (Haiku-class)
│  Analyzes: what + how many  │
│  + complexity level         │
└─────────────┬───────────────┘
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  SIMPLE   COMPOUND  COMPLEX
     │        │        │
     ▼        ▼        ▼
  Direct    Pipeline  Agent
  Route     Engine    Loop
  (1 skill) (N skills (Plan→Act→
             par/seq)  Observe→
                       Reflect)
     │        │        │
     └────────┼────────┘
              ▼
     ┌────────────────┐
     │ Result Merger   │  ← combines multi-skill outputs
     └────────┬───────┘
              ▼
     ┌────────────────┐
     │ Quality Gate    │  ← optional LLM validation
     └────────┬───────┘
              ▼
         Response
```

## Functional Requirements

### FR-1: Intent Classifier (Stage 1)

- Use a cheap/fast LLM (Haiku-class) to analyze user messages
- Receive the full skill catalog as context (name + description + category + capabilities)
- Return structured output:
  ```typescript
  {
    level: "simple" | "compound" | "complex",
    skills: Array<{ skillId: string; confidence: number; reason: string }>,
    strategy: "single" | "parallel" | "sequential" | "agent",
    estimatedCost: number,
    reasoning: string
  }
  ```
- Must complete within 1 second for SIMPLE classification
- Falls back to regex-based `detectSkill()` if classifier fails or times out

### FR-2: Direct Route (SIMPLE)

- When classifier returns `level: "simple"` with one high-confidence skill
- Execute that skill directly using existing `skillExecutor.ts`
- No additional overhead beyond the classifier call
- If confidence < threshold (e.g., 0.7), ask user to confirm skill selection

### FR-3: Pipeline Engine (COMPOUND)

- Execute multiple skills in a defined order (parallel or sequential)
- Classifier provides the execution plan with step ordering
- Support data flow between steps: output of step N → input of step N+1
- Parallel execution where skills are independent
- Fail-fast or continue-on-error per step (configurable)
- Track progress and allow cancellation

### FR-4: Agent Loop (COMPLEX)

- ReAct-style loop: Plan → Select Skill → Execute → Observe → Reflect
- Maximum 5 iterations to prevent runaway costs
- LLM acts as "brain" deciding next action at each step
- Available actions: execute_skill, execute_parallel, quality_check, revise_plan, done
- Maintains context of all previous results and decisions
- Can self-correct: if result is poor, try alternative skill or different parameters
- Implemented in Node.js (no Python LangGraph dependency)

### FR-5: Result Merger

- Combine outputs from multiple skill executions into a unified response
- Handle different output types: text, markdown, URLs (images/video/audio), structured data
- Intelligent merging: not just concatenation, but structured composition
- Preserve metadata (which skill produced what, cost per skill, timing)

### FR-6: Quality Gate

- Optional LLM-based validation of orchestration output
- Checks: completeness (did we address all parts of the request?), coherence (do outputs work together?), quality (is the output good enough?)
- Can trigger retry with different parameters or alternative skills
- Tenant-configurable: enable/disable, strictness level

### FR-7: Cost Control

- Budget cap per orchestration session (based on user's credit balance)
- Tenant-level configuration: max complexity level allowed (simple/compound/complex)
- Per-step cost tracking with running total
- Abort if projected cost exceeds budget
- Cost estimation before execution (classifier provides estimate)

### FR-8: Backward Compatibility

- Existing regex-based detection (`detectSkill()`) continues to work as fallback
- If orchestrator is disabled (feature flag), system behaves exactly as before
- Existing skill execution modes (llm-only, media-generate, python, sandbox) unchanged
- No changes to skill.md format required (orchestration metadata is optional additive)

## Non-Functional Requirements

### NFR-1: Performance
- SIMPLE path: max +500ms added latency over current system
- COMPOUND path: max +1s setup overhead (execution time depends on skills)
- COMPLEX path: max 30s total for full agent loop
- Classifier must respond within 1s (use fast model)

### NFR-2: Reliability
- Graceful degradation: if classifier fails → fallback to regex detection
- Circuit breaker: if classifier error rate > 20% → auto-disable for 5 minutes
- Each pipeline step is independently retryable
- Agent loop has hard iteration limit (5)

### NFR-3: Observability
- Audit log entries for: classification decision, each skill execution, quality gate result
- Trace ID propagation through entire orchestration
- Cost breakdown per step in audit log
- Performance metrics: classifier latency, pipeline duration, agent loop iterations

### NFR-4: Security
- Orchestrator respects existing rate limits and credit checks
- No privilege escalation: orchestrator can only invoke skills the user has access to
- Input sanitization before passing to classifier LLM
- Budget cap prevents cost abuse

## Orchestration Metadata (Optional skill.md addition)

```yaml
# Optional fields in skill.md frontmatter
orchestration:
  capabilities: ["article_writing", "food_content", "thai_language"]
  input_types: ["text_prompt", "topic", "keywords"]
  output_types: ["markdown_article", "structured_content"]
  composable: true
  typical_use_with: ["image-creator", "translation"]
```

This metadata helps the classifier make better routing decisions. Skills without it still work — the classifier uses name + description + category as fallback.

## Integration Points

### Primary: chat.ts router
```typescript
// Current:
const detection = await detectSkill(message, conversationId, skillSettings, userId);

// New:
const result = await orchestrateSkill(message, {
  userId, conversationId, skillSettings,
  budget: userCreditBalance,
  maxComplexity: tenantSettings.maxOrchestrationLevel,
  fallbackToRegex: true,
});
```

### Existing services to reuse
- `skillRegistry.ts` — skill catalog (getAvailableSkills)
- `skillExecutor.ts` — individual skill execution
- `skillDetector.ts` — regex fallback
- `taskExecutionPlanner.ts` — task classification patterns
- `creditService.ts` — credit checking and deduction
- `auditLogger.ts` — audit trail
- `rateLimiter.ts` — rate limiting

## New Files

| File | Purpose |
|------|---------|
| `skillOrchestrator.ts` | Main entry point — routes to correct execution path |
| `skillIntentClassifier.ts` | LLM-based intent classification and skill selection |
| `skillPipelineEngine.ts` | COMPOUND mode: parallel/sequential pipeline execution |
| `skillAgentLoop.ts` | COMPLEX mode: ReAct agent loop |
| `skillResultMerger.ts` | Combines multi-skill outputs into unified response |
| `skillQualityGate.ts` | Optional output quality validation |

## Modified Files

| File | Change |
|------|--------|
| `chat.ts` | Replace `detectSkill()` with `orchestrateSkill()` at key integration point |
| `skillDetector.ts` | Export interfaces for fallback use by orchestrator |
| `@smartspec/skills` types | Add orchestration metadata types (OrchestrationConfig, etc.) |
| `drizzle/schema.ts` | Add `orchestrationConfig` JSON column to skills table (optional) |
| Skill frontmatter parser | Support new `orchestration:` block in skill.md |

## Feature Flag

- `SKILL_ORCHESTRATOR_ENABLED` — global toggle (default: false during rollout)
- `tenant.settings.maxOrchestrationLevel` — per-tenant: "disabled" | "simple" | "compound" | "complex"
- When disabled, system uses existing `detectSkill()` path with zero overhead

## Success Metrics

1. **Skill match accuracy**: % of user messages routed to the correct skill (target: >90% vs current ~60% regex)
2. **Multi-skill completion rate**: % of COMPOUND/COMPLEX tasks that complete successfully
3. **Cost efficiency**: Average cost per orchestration session < $0.01 for SIMPLE tasks
4. **Latency impact**: P95 latency increase < 500ms for SIMPLE tasks
5. **User satisfaction**: Reduced "wrong skill" complaints, increased multi-skill usage
