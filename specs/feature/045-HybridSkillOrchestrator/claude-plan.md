# Implementation Plan: Feature 045 — Hybrid Skill Orchestrator

## Overview

SmartSpecPro's skill system has grown to 48+ skills across diverse categories (content writing, media generation, product reviews, specialist tools). The current system uses regex-only pattern matching for skill detection and flat parameter extraction that ignores skill-specific input schemas.

This plan introduces a **Hybrid Skill Orchestrator** — an adaptive system that classifies user intent via LLM, routes to the correct skill(s), extracts structured parameters from natural language, and escalates to multi-skill pipelines or agent loops only when task complexity demands it.

**Core principle:** Pay for complexity only when needed. Simple requests (~80% of traffic) add only one cheap LLM call. Complex multi-skill tasks activate pipeline or agent modes on-demand.

## Architecture

```
User Message
     │
     ▼
┌──────────────────────────────────┐
│  skillOrchestrator.ts            │  Main entry point
│  orchestrateSkill()              │
└───────────────┬──────────────────┘
                │
     ┌──────────▼──────────┐
     │ Intent Classifier    │  Stage 1: Always runs (~$0.001)
     │ (cheap LLM call)     │  Classifies: SIMPLE / COMPOUND / COMPLEX
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ Param Extractor      │  Stage 2: Extracts structured params
     │ (uses schema.json)   │  from user message per skill's schema
     └──────────┬──────────┘
                │
     ┌──────────┼──────────────┬───────────────┐
     ▼          ▼              ▼               │
  SIMPLE     COMPOUND       COMPLEX            │
     │          │              │               │
  Direct     Pipeline       Agent              │
  Route      Engine         Loop               │
     │          │              │               │
     └──────────┼──────────────┘               │
                ▼                               │
     ┌──────────────────────┐                  │
     │  Result Merger        │                  │
     │  (multi-skill output) │                  │
     └──────────┬───────────┘                  │
                ▼                               │
     ┌──────────────────────┐                  │
     │  Quality Gate         │ ◄── Optional ───┘
     │  (LLM validation)     │
     └──────────┬───────────┘
                ▼
           Response
```

### Fallback Path

If the orchestrator is disabled (feature flag) OR the classifier fails/times out, the system falls back to the existing `detectSkill()` regex path with zero added overhead. This ensures backward compatibility.

## Section 1: Shared Types & Configuration

### Types (apps/web/shared/orchestration/types.ts)

Define the core types used across all orchestrator modules:

```typescript
type OrchestrationLevel = "simple" | "compound" | "complex";
type OrchestrationStrategy = "single" | "parallel" | "sequential" | "agent";
type ErrorStrategy = "fail-fast" | "continue" | "retry";
```

**ClassificationResult** — output of the intent classifier:
- `level`: OrchestrationLevel
- `skills`: array of `{ skillId, confidence, reason, extractedParams, missingRequiredParams }`
- `strategy`: OrchestrationStrategy
- `estimatedCreditCost`: number
- `reasoning`: string

**PipelineStep** — one step in a COMPOUND pipeline:
- `id`: unique step identifier
- `skillId`: which skill to execute
- `params`: extracted parameters
- `dependsOn`: array of step IDs that must complete first
- `inputMapping`: maps from previous step outputs to this step's inputs (e.g., `{ "topic": "step1.content" }`)
- `errorStrategy`: what to do if this step fails

**AgentAction** — one action in the COMPLEX agent loop:
- `type`: "execute_skill" | "execute_parallel" | "quality_check" | "revise_plan" | "done"
- `skillId` / `skills`: which skill(s) to execute
- `params`: parameters for execution
- `reasoning`: why the agent chose this action

**OrchestrationResult** — unified result from any execution path:
- `sections`: array of per-skill results (type, content, urls, metadata)
- `summary`: optional merged summary
- `totalCreditsUsed`: sum across all skills
- `totalDurationMs`: wall-clock time
- `traceId`: for audit correlation
- `orchestrationLevel`: which path was taken
- `classificationLatencyMs`: how long the classifier took

### Feature Flags

Two flags, both stored in Redis via existing `featureFlags.ts`:

1. **`skillOrchestratorEnabled`** (global, default: false) — master toggle
2. **`skillOrchestratorMaxLevel`** (per-tenant, default: "complex") — limits maximum complexity level ("disabled" | "simple" | "compound" | "complex")

### Configuration Constants

Define in the orchestrator module:
- `CLASSIFIER_TIMEOUT_MS`: 3000 (max wait for classifier response)
- `CLASSIFIER_CIRCUIT_BREAKER_THRESHOLD`: 0.2 (20% error rate triggers disable)
- `CLASSIFIER_CIRCUIT_BREAKER_COOLDOWN_MS`: 300000 (5 min cooldown)
- `AGENT_MAX_ITERATIONS`: 5
- `AGENT_MAX_DURATION_MS`: 30000
- `CONFIDENCE_AUTO_ROUTE`: 0.85
- `CONFIDENCE_SOFT_CONFIRM`: 0.70
- `CONFIDENCE_ASK_USER`: 0.50

## Section 2: Skill Catalog Service

The classifier needs a compact representation of all 48+ skills to fit within a single LLM context.

### Catalog Summary Generator

Add `getSkillCatalogSummary()` to `skillRegistry.ts`:

**Purpose:** Generate a compact skill catalog for the classifier's context. Group skills by category, include only essential metadata.

**Output format per skill:**
```typescript
interface SkillCatalogEntry {
  id: string;                // slug
  name: string;
  category: string;          // e.g., "product_review", "article_generation"
  description: string;       // max 100 chars
  inputTypes: string[];      // from orchestration metadata or inferred
  outputTypes: string[];     // text, image_url, video_url, structured_json
  hasInputSchema: boolean;   // whether input.schema.json exists
  requiredFields: string[];  // from schema: required fields without defaults
}
```

**Category grouping:** Group skills into ~8 categories for hierarchical classification:
- `media_image`: image-creator, grok-imagine-prompt-planner, smart-landscape-designer, nano-banana-infographic
- `media_video`: video-creator, cartoon-video-creator, veo-video-creator, video-prompt-engineer, video-storyboard-to-prompts, viral-talking-objects
- `media_audio`: audio-creator, sound-effects-creator
- `article_writing`: general, business, education, lifestyle, marketing, parenting article writers, creative-story-writer, documentary-script-writer
- `product_review`: beauty, electronics, fashion, food, hardware, health, hobby, home-appliance, home-decor, household, pet, agriculture, baby-kids, sports, real-estate reviewers
- `content_tools`: brainstorm, translation, ultra-think, code-docs-assistant, storyboard-writer
- `media_prompts`: image_prompt_engineer, cartoon-storyboard-prompts
- `specialist`: agency-creator, agency-templates, intelligence-skill-creator, workflow-ai-editor, presentation-layout-designer, chat-alert

**Populating `inputTypes` and `outputTypes`:**
- If skill has `orchestration` metadata in frontmatter → use directly
- If skill has `input.schema.json` → infer from property names (e.g., fields with `format: "uri"` → "image_url" input type)
- Otherwise → infer from skill category: `article_generation` → outputTypes: ["text"], `image_generation` → outputTypes: ["image_url"]

**Caching:** Cache the catalog summary in module-level variable (same pattern as skill registry cache). Invalidate when `clearSkillRegistryCache()` is called.

### Input Schema Loader

New utility function to load a skill's `input.schema.json` at runtime:

**Purpose:** Load and parse JSON Schema for a specific skill, used by the parameter extractor.

**Logic:**
1. Get skill folder path from `skillDefinition.skillFilePath` (strip `/skill.md`)
2. Read `schemas/input.schema.json` from that folder
3. Parse JSON, cache result in memory (invalidated with skill cache)
4. Return `{ schema, requiredFields, fieldsWithDefaults, enumFields }` — pre-processed for the param extractor

**Error handling:** If schema file doesn't exist, return null. The param extractor falls back to basic `extractSkillParams()` behavior.

## Section 3: Intent Classifier

The classifier is the brain of Stage 1. It receives the user message and skill catalog, and decides: which skill(s), what parameters, and what execution level.

### Classifier Service (skillIntentClassifier.ts)

**Function:** `classifyIntent(message, userId, tenantId, conversationId?)`

**Process:**

1. **Load skill catalog** from cached `getSkillCatalogSummary()`
2. **Build classifier prompt** with:
   - System message explaining the classification task
   - Skill catalog organized by category (hierarchical)
   - User message
   - Conversation context (last 3 messages if available, for follow-up intent)
3. **Call LLM** using existing `llmRouter.ts`:
   - Use `taskExecutionPlanner` with `strategy: "cheapest"` to find cheapest available model
   - Use function calling (tools) — define tools for each category
   - Set `maxTokens: 500` (classification doesn't need long responses)
   - Set timeout: `CLASSIFIER_TIMEOUT_MS`
4. **Parse response** into `ClassificationResult`
5. **Log audit event**: `orchestration_classify` with traceId, level, skills, confidence, latencyMs

### Classification Prompt Design

**System prompt structure:**

```
You are a skill router for a content creation platform. Given a user message,
determine which skill(s) can best fulfill the request.

## Available Skill Categories:
[category list with skill summaries]

## Instructions:
1. Identify the user's intent
2. Select the best matching skill(s)
3. If the request needs multiple skills, specify execution order
4. Extract any parameters mentioned in the user's message
5. Rate your confidence (0-1)

## Classification Levels:
- "simple": Single skill, clear match
- "compound": Multiple skills needed, known in advance
- "complex": Requires iterative planning/evaluation
```

**Tool definitions for function calling:**

Define one tool per category (8 tools total), each with parameters:
- `skillId`: enum of skills in that category
- `confidence`: number 0-1
- `extractedParams`: object (free-form, validated later)
- `reason`: string

This hierarchical approach ensures the LLM first picks a category, then a specific skill — avoiding 48-way ambiguity.

**Token budget for catalog:** The full catalog (48 skills × ~60 tokens each = ~2,900 tokens) fits comfortably in a single LLM context alongside the system prompt (~500 tokens) and user message (~200 tokens). Total classifier input: ~3,600 tokens. Even the cheapest models (4K+ context) handle this easily.

### Circuit Breaker

Track classifier success/failure rates in a sliding window (last 100 calls). If error rate exceeds 20%:
1. Set `_classifierDisabledUntil` timestamp (now + 5 min)
2. All calls during cooldown → fallback to regex `detectSkill()`
3. After cooldown → re-enable and reset counters

### Multi-intent Detection

The classifier can return multiple skills with `strategy: "parallel"` or `"sequential"`. Example:

User: "เขียนบทความอาหารไทย แล้วสร้างรูปประกอบ"
→ `{ level: "compound", skills: [{ skillId: "food-grocery-reviewer", ... }, { skillId: "image-creator", ... }], strategy: "sequential" }`

## Section 4: Parameter Extractor

This is the critical gap fix. Currently `extractSkillParams()` only extracts prompt + basic media params. The new extractor uses each skill's JSON Schema to extract structured parameters from natural language.

### Param Extractor Service (skillParamExtractor.ts)

**Function:** `extractParams(message, skillId, classifierExtractedParams?)`

**Process:**

1. **Load input schema** for the skill via `loadInputSchema(skillId)`
2. If no schema → fall back to existing `extractSkillParams()` from `skillDetector.ts`
3. **Build extraction prompt:**
   - System: "Extract parameters from the user message according to this JSON Schema"
   - Include full schema with field descriptions, enums, defaults
   - Include any params already extracted by classifier (avoid re-extraction)
   - Include conversation context if available
4. **Call LLM** with structured output (JSON schema enforcement):
   - Use the skill's input.schema.json as the response schema
   - Cheapest model, `maxTokens: 300`
5. **Validate** extracted params against JSON Schema
6. **Apply defaults** from schema for all missing optional fields
7. **Identify missing required fields** — fields that are required, have no default, and couldn't be extracted
8. **Return** `{ params, missingRequired, confidence }`

### Optimization: Combined Classifier + Extractor

For SIMPLE requests, the classifier and param extraction can be combined into a single LLM call. The classifier prompt already includes `extractedParams` in its output schema. If the classifier returns high-confidence params AND the skill has a simple schema (< 10 fields), skip the separate extraction step.

For complex schemas (like cartoon-video-creator with 24 fields), always use a separate extraction call with the full schema.

**Decision rule:** `schema.properties.length <= 10 && classifier.confidence >= 0.85` → use combined (1 LLM call total). Otherwise → separate extraction call (2 LLM calls total). This keeps SIMPLE+simple-schema at 1 call while ensuring accuracy for complex schemas.

### User Confirmation Flow

When `missingRequired` is non-empty OR overall confidence < `CONFIDENCE_SOFT_CONFIRM`:

1. Return a `needsConfirmation` response to the chat router
2. Chat router displays an inline minimal form showing:
   - Pre-filled fields (from LLM extraction) — user can adjust
   - Empty required fields — highlighted, user must fill
   - Collapsed optional fields — user can expand if needed
3. User submits → re-run extraction with user-provided values merged

This is a **new UI interaction pattern** that requires a small frontend change in the chat component. The response type would be `"orchestration_confirm"` with the form data.

**Confirmation flow (data path):**
1. Orchestrator returns `{ type: "orchestration_confirm", skillId, prefilledParams, missingFields, schema }` via tRPC response
2. Frontend renders inline form (new `OrchestrationConfirmForm` component)
3. User fills/adjusts fields → submits
4. Frontend sends `chat.confirmOrchestration({ skillId, params })` tRPC mutation
5. Orchestrator receives confirmed params → skips classifier → executes skill directly

## Section 5: Orchestrator Main Entry

### Orchestrator Service (skillOrchestrator.ts)

**Function:** `orchestrateSkill(message, options)`

**Options:**
```typescript
interface OrchestrateOptions {
  userId: number;
  tenantId: string;
  conversationId?: number;
  skillSettings?: SkillSettings | null;
  userToken: string;
  budget?: number;            // credit limit for this session
  maxLevel?: OrchestrationLevel;  // from tenant feature flag
  fallbackToRegex?: boolean;  // default: true
}
```

**Flow:**

1. **Check feature flags:**
   - `skillOrchestratorEnabled` → if false, fallback to regex immediately
   - `skillOrchestratorMaxLevel` → cap the allowed level
2. **Run classifier:** `classifyIntent(message, ...)`
   - If classifier fails → fallback to regex `detectSkill()` + `extractSkillParams()`
   - If confidence < 0.50 → return no match (let chat handle as general conversation)
3. **Cap level** to tenant max (e.g., if tenant max is "simple" but classifier says "compound" → downgrade to "simple", pick top skill only)
4. **Extract parameters** for each selected skill (Section 4)
5. **Check credits:** Estimate total cost, verify user has enough credits
6. **Route to execution path:**
   - SIMPLE → direct execution via existing `executeSkill()`
   - COMPOUND → pipeline engine (Section 6)
   - COMPLEX → agent loop (Section 7)
7. **Merge results** (Section 8)
8. **Quality gate** (optional, Section 9)
9. **Log audit events** and return `OrchestrationResult`

### Integration with chat.ts

In the chat router's `sendMessage` procedure, replace the current:
```
const detection = await detectSkill(message, conversationId, skillSettings, userId);
```

With:
```
const orchestratorEnabled = await getTenantFeatureFlag("skillOrchestratorEnabled", tenantId);
if (orchestratorEnabled) {
  const result = await orchestrateSkill(message, { userId, tenantId, conversationId, ... });
  // handle orchestration result (may be multi-skill)
} else {
  const detection = await detectSkill(message, conversationId, skillSettings, userId);
  // existing flow unchanged
}
```

The orchestrator result needs a new response type in the chat message format to handle multi-skill outputs, parameter confirmation forms, and pipeline progress indicators.

## Section 6: Pipeline Engine (COMPOUND Mode)

### Pipeline Service (skillPipelineEngine.ts)

**Function:** `executePipeline(pipeline, options)`

**Input:** Array of `PipelineStep` from the classifier, plus execution options (userId, tenantId, userToken, budget).

**Execution algorithm:**

1. **Topological sort** the steps by `dependsOn` relationships
2. **Group into execution waves** — steps with all dependencies satisfied form a wave
3. **For each wave:**
   a. Execute all steps in the wave concurrently (`Promise.allSettled`)
   b. For each step:
      - Resolve `inputMapping` from previous step outputs
      - Call `executeSkill()` with resolved params
      - Record result, credit cost, duration
   c. Handle failures per step's `errorStrategy`:
      - `fail-fast`: Abort entire pipeline
      - `continue`: Mark step as failed, proceed with remaining
      - `retry`: Retry once with same params
4. **Collect all results** into an ordered array

### Input Mapping Resolution

The `inputMapping` field connects outputs from previous steps to inputs for the current step.

**Example:**
```
Step 1: food-grocery-reviewer → outputs { content: "บทความ...", format: "markdown" }
Step 2: translation → inputMapping: { "content": "step1.content", "targetLanguage": "en" }
```

**Resolution logic:**
1. Parse mapping keys: `"stepId.fieldPath"` (supports dot notation for nested access)
2. Look up the referenced step's result
3. Extract the value from the result's content/urls/metadata
4. For text content, may need LLM to extract/transform (e.g., "generate image prompt from article text")

### Pipeline Result

```typescript
interface PipelineResult {
  steps: Array<{
    stepId: string;
    skillId: string;
    status: "completed" | "failed" | "skipped";
    result?: SkillExecutionResult;
    error?: string;
    creditsUsed: number;
    durationMs: number;
  }>;
  totalCreditsUsed: number;
  totalDurationMs: number;
}
```

## Section 7: Agent Loop (COMPLEX Mode)

### Agent Service (skillAgentLoop.ts)

**Function:** `runAgentLoop(message, options)`

**The loop:**

1. **Initialize context:** Original message, available skills (from catalog), empty results array, credit tracker
2. **Iteration loop** (max `AGENT_MAX_ITERATIONS`):
   a. **LLM decides next action:**
      - Input: system prompt, conversation history (message + all previous actions/results), available skills
      - Output: `AgentAction` via function calling (tools: execute_skill, execute_parallel, quality_check, done)
   b. **Execute action:**
      - `execute_skill`: Agent LLM provides params directly in tool call (it has skill catalog + schema context). These params are validated against the skill's input.schema.json before execution. If validation fails, the agent receives the validation error and can retry with corrected params.
      - `execute_parallel`: Execute multiple skills concurrently → add all to results
      - `quality_check`: LLM evaluates current results against original intent
      - `done`: Exit loop with final results
   c. **Check termination conditions:**
      - LLM returned `done` → exit
      - Max iterations reached → exit with warning
      - Credit budget exceeded → exit with budget warning
      - Wall-clock > 30s → exit with timeout warning
      - Same action repeated → exit with stuck warning

### Context Management

For the agent loop, context grows with each iteration. To manage this:

- **Keep full history** for iterations 1-3 (most runs finish in 2-3 steps)
- **If iteration > 3:** Summarize older results to 2-3 lines each, keep only last 2 full results
- **Always include:** Original message, current state summary, available skills

### Agent System Prompt

```
You are an AI orchestrator for a content creation platform.
Your goal is to fulfill the user's request by selecting and executing skills.

Available tools:
- execute_skill(skillId, params): Run a single skill
- execute_parallel(skills): Run multiple skills concurrently
- quality_check(): Evaluate if current results satisfy the user's request
- done(): Finish and return results

Rules:
- Always explain your reasoning before acting
- Check quality after producing content
- If a result is poor, try an alternative skill or different parameters
- Stay within the credit budget: {budget} credits remaining
- Maximum {maxIterations} iterations
```

## Section 8: Result Merger

### Merger Service (skillResultMerger.ts)

**Function:** `mergeResults(results[], originalMessage)`

**For SIMPLE:** Pass through the single skill result unchanged.

**For COMPOUND/COMPLEX:** Combine multiple results into a coherent response.

**Merge strategies by output type combination:**

| Outputs | Strategy |
|---------|----------|
| Multiple text results | LLM summarizes/combines into structured document with sections |
| Text + image URLs | Inline images within text at appropriate positions |
| Text + video/audio URL | Present text first, then media attachment |
| Multiple image URLs | Gallery format (array of URLs) |
| Mixed (text + images + video) | Structured sections: text content, visual gallery, media attachments |

**For text combination:** A brief LLM call that takes all text outputs and the original user message, producing a unified document. The LLM preserves all content but adds structure (headers, transitions) to make multi-skill output read as a coherent whole.

**Output:** `OrchestrationResult` with all individual section results preserved (for audit) plus the merged summary.

## Section 9: Quality Gate (Optional)

### Quality Gate Service (skillQualityGate.ts)

**Function:** `validateQuality(result, originalMessage, options?)`

**Enabled when:** Tenant has `skillOrchestratorMaxLevel: "complex"` OR explicitly enabled in request options.

**Evaluation criteria:**
1. **Completeness:** Did we address all parts of the request? (check each part of user message)
2. **Coherence:** Do multiple outputs work together? (no contradictions)
3. **Quality:** Is the output useful? (not empty, not error messages, reasonable length)

**Output:** `{ pass: boolean, score: number, issues: string[], suggestion?: string }`

If `pass === false` AND orchestration level is COMPLEX:
- Agent loop gets the feedback and can retry
- Otherwise, return result with quality warning to user

## Section 10: Audit & Observability

### New Audit Event Types

Add to `auditLogger.ts`:

- `orchestration_classify`: Logged after classifier runs. Payload includes: level, skills matched, confidence scores, classifier model used, latency.
- `orchestration_pipeline`: Logged after pipeline completes. Payload includes: step statuses, per-step credits, total duration.
- `orchestration_agent_step`: Logged per agent loop iteration. Payload includes: iteration number, action taken, credits used, reasoning.
- `orchestration_quality_gate`: Logged when quality gate runs. Payload includes: pass/fail, score, issues.
- `orchestration_param_extract`: Logged when param extractor runs. Payload includes: skill, fields extracted, fields missing, confidence.
- `orchestration_fallback`: Logged when orchestrator falls back to regex. Payload includes: reason (timeout, error, disabled).

### Trace ID Propagation

Every orchestration session gets a single `traceId` (generated at entry in `orchestrateSkill()`). This traceId propagates to:
- All classifier LLM calls
- All skill executions (via existing `params.traceId`)
- All credit deductions
- All audit log entries

This enables end-to-end tracing: "for this user message, what did the orchestrator decide, which skills ran, how much did it cost?"

### Metrics (future)

Log structured data that can be queried for dashboards:
- Classification accuracy (track user overrides as "wrong classification")
- Skill usage distribution (which skills does the orchestrator prefer?)
- Average cost per orchestration level
- Fallback rate (how often does the classifier fail?)
- Multi-skill pipeline success rate

## Section 11: Frontend Integration

### Chat Message Types

Add a new message variant for orchestration results:

**`type: "orchestration_result"`** — multi-skill response with sections:
- Renders each section with skill icon and name header
- Text sections in markdown
- Image sections as gallery
- Video/audio as media player
- Collapsible "Orchestration details" footer (skills used, credits, timing)

**`type: "orchestration_confirm"`** — parameter confirmation request:
- Shows minimal inline form with pre-filled and empty fields
- Submit button sends back to orchestrator with user values
- "Skip" button executes with defaults

### Streaming Considerations

For COMPOUND/COMPLEX orchestrations, the response is not streamed from a single LLM call. Instead:
- Show a progress indicator: "Running skill 1/3: food-grocery-reviewer..."
- Update as each skill completes
- Final merged result appears at the end

This requires extending the chat message protocol with intermediate status updates. Use the existing SSE (Server-Sent Events) or polling pattern from media generation tasks.

### Handling Async Skills in Pipelines

Some skills (video generation, audio generation) return `isAsync: true` with a `taskId` instead of immediate results. In a COMPOUND pipeline:

1. **If async skill has no dependents:** Continue pipeline, mark step as "pending_async". Return pipeline result with async steps separately.
2. **If async skill HAS dependents:** Pipeline engine must poll for completion (using existing `chat.getSkillTaskResult` pattern) with a timeout. If timeout (60s) → mark dependent steps as "skipped" with reason.
3. **Client display:** Show completed steps immediately, show async steps as "generating..." with progress indicator.

## Section 12: Testing Strategy

### Unit Tests

Each service gets its own test file in `apps/web/server/services/__tests__/`:

- `skillOrchestrator.test.ts` — test routing logic, feature flag behavior, fallback
- `skillIntentClassifier.test.ts` — test classification with mocked LLM, circuit breaker
- `skillParamExtractor.test.ts` — test extraction against real schemas, default application, missing field detection
- `skillPipelineEngine.test.ts` — test topological sort, parallel execution, error strategies, input mapping
- `skillAgentLoop.test.ts` — test loop termination, budget limits, stuck detection
- `skillResultMerger.test.ts` — test merge strategies for different output type combos
- `skillQualityGate.test.ts` — test pass/fail evaluation

### LLM Mock Pattern

Mock all LLM calls in tests:
```typescript
vi.mock("../services/llmRouter", () => ({
  getProviderForModel: vi.fn().mockResolvedValue(mockProvider),
}));
```

Provide realistic mock responses for each test scenario (correct classification, wrong classification, timeout, etc.).

### Integration Tests

- Full flow: user message → orchestration → skill execution → response
- Multi-skill pipeline with real skill schemas
- Feature flag toggle behavior
- Fallback from orchestrator to regex

## Implementation Order

1. **Types & Config** (Section 1) — foundation
2. **Skill Catalog Service** (Section 2) — needed by classifier
3. **Intent Classifier** (Section 3) — core routing logic
4. **Parameter Extractor** (Section 4) — critical gap fix
5. **Orchestrator Main** (Section 5) — wiring everything together
6. **Pipeline Engine** (Section 6) — COMPOUND support
7. **Agent Loop** (Section 7) — COMPLEX support
8. **Result Merger** (Section 8) — multi-skill output handling
9. **Quality Gate** (Section 9) — optional validation
10. **Audit & Observability** (Section 10) — tracking and debugging
11. **Frontend Integration** (Section 11) — UI for multi-skill results
12. **Testing** (Section 12) — comprehensive test suite

Sections 1-5 form the MVP (SIMPLE mode works). Sections 6-7 add multi-skill support. Sections 8-11 complete the experience.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Classifier accuracy < 80% | Medium | High | Hierarchical classification, confidence thresholds, fallback to regex |
| Added latency unacceptable | Low | Medium | Cheap/fast model for classifier, timeout + circuit breaker |
| Parameter extraction wrong | Medium | Medium | Validate against JSON Schema, ask user for low-confidence fields |
| Agent loop runaway cost | Low | High | Hard iteration limit (5), credit budget cap, time budget (30s) |
| Pipeline step failures cascade | Medium | Medium | Per-step error strategies, fail-fast option |
| Schema loading fails | Low | Low | Graceful fallback to basic extractSkillParams() |
