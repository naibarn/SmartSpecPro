# TDD Plan: Feature 045 — Hybrid Skill Orchestrator

Testing framework: **Vitest** (existing project convention)
Test location: `apps/web/server/services/__tests__/`
Mocking: `vi.mock()` for service dependencies, `vi.fn()` for functions
Convention: `describe/it/expect` with async tests

---

## Section 1: Shared Types & Configuration

No tests needed — pure type definitions and constants. Types are verified at compile time via TypeScript.

## Section 2: Skill Catalog Service

### getSkillCatalogSummary()
- Test: returns array of SkillCatalogEntry objects with required fields (id, name, category, description)
- Test: groups skills by category correctly (all product_review skills in same group)
- Test: truncates description to 100 chars
- Test: populates outputTypes based on skill category when no orchestration metadata
- Test: populates inputTypes from input.schema.json properties when available
- Test: returns cached result on second call (cache hit)
- Test: returns fresh data after clearSkillRegistryCache() (cache invalidation)
- Test: handles empty skill registry gracefully (returns empty array)

### loadInputSchema()
- Test: loads and parses valid input.schema.json from skill folder
- Test: returns null when schema file doesn't exist
- Test: extracts requiredFields from schema "required" array
- Test: identifies fieldsWithDefaults from properties with "default" key
- Test: identifies enumFields from properties with "enum" key
- Test: caches loaded schema (second call returns same object reference)
- Test: handles malformed JSON gracefully (returns null, logs warning)

## Section 3: Intent Classifier

### classifyIntent()
- Test: classifies "รีวิวมาม่า" as SIMPLE with food-grocery-reviewer skill
- Test: classifies "เขียนบทความ + สร้างรูป" as COMPOUND with 2 skills
- Test: classifies vague multi-step request as COMPLEX
- Test: returns confidence >= 0.85 for exact skill name mention
- Test: returns confidence < 0.50 for unrelated message (no skill match)
- Test: respects CLASSIFIER_TIMEOUT_MS (times out → returns null)
- Test: uses cheapest available model (via taskExecutionPlanner strategy)
- Test: includes extractedParams in classification result
- Test: includes conversation context (last 3 messages) when conversationId provided
- Test: logs orchestration_classify audit event with traceId

### Circuit Breaker
- Test: allows calls when error rate < 20%
- Test: disables classifier after 20% error rate (returns null)
- Test: re-enables after CIRCUIT_BREAKER_COOLDOWN_MS
- Test: tracks sliding window of last 100 calls
- Test: resets counters after cooldown

### Multi-intent Detection
- Test: returns multiple skills for compound request
- Test: sets strategy to "sequential" when order matters ("write then translate")
- Test: sets strategy to "parallel" when order doesn't matter ("create image and audio")

## Section 4: Parameter Extractor

### extractParams()
- Test: extracts topic from "รีวิวมาม่า" → { topic: "มาม่า" }
- Test: extracts multiple params from "รีวิวมาม่าสไตล์เปรียบเทียบ ราคา 6 บาท" → { topic: "มาม่า", review_angle: "comparison", price_thb: 6 }
- Test: applies default values from schema for unmentioned optional fields
- Test: identifies missing required fields when user message is vague
- Test: returns missingRequired as empty array when all required fields have defaults
- Test: falls back to basic extractSkillParams() when no input.schema.json exists
- Test: validates extracted params against JSON Schema (rejects invalid enum values)
- Test: merges classifierExtractedParams with LLM-extracted params (no duplicates)
- Test: handles nested objects in schema (e.g., smart-landscape-designer "constraints")
- Test: handles array fields in schema (e.g., reference_images)

### Combined Classifier + Extractor Optimization
- Test: uses single LLM call when schema has ≤10 fields and confidence ≥ 0.85
- Test: uses separate LLM call when schema has >10 fields
- Test: uses separate LLM call when confidence < 0.85

### User Confirmation Flow
- Test: returns needsConfirmation=true when missingRequired is non-empty
- Test: returns needsConfirmation=true when confidence < CONFIDENCE_SOFT_CONFIRM
- Test: returns needsConfirmation=false when all required fields filled and confidence high

## Section 5: Orchestrator Main Entry

### orchestrateSkill()
- Test: returns regex fallback result when skillOrchestratorEnabled is false
- Test: returns regex fallback when classifier fails (timeout, error)
- Test: caps orchestration level to tenant's maxLevel setting
- Test: routes SIMPLE classification to direct executeSkill()
- Test: routes COMPOUND classification to pipeline engine
- Test: routes COMPLEX classification to agent loop
- Test: returns no-match when classifier confidence < 0.50
- Test: checks credit balance before execution (rejects if insufficient)
- Test: generates traceId and propagates to all sub-calls
- Test: returns OrchestrationResult with correct orchestrationLevel

### Integration with chat.ts
- Test: calls orchestrateSkill when feature flag enabled
- Test: calls detectSkill when feature flag disabled
- Test: handles orchestration_confirm response type correctly

## Section 6: Pipeline Engine

### executePipeline()
- Test: executes single-step pipeline successfully
- Test: executes 2-step sequential pipeline (step2 after step1)
- Test: executes 2-step parallel pipeline (both steps concurrently)
- Test: resolves inputMapping from previous step output
- Test: handles fail-fast error strategy (aborts on first failure)
- Test: handles continue error strategy (continues past failure)
- Test: handles retry error strategy (retries once on failure)
- Test: tracks credits per step and total
- Test: handles mixed parallel + sequential steps (topological sort)

### Input Mapping Resolution
- Test: resolves "step1.content" to step1's text content
- Test: resolves "step1.urls[0]" to first URL from step1
- Test: returns undefined for invalid mapping path
- Test: handles nested field access with dot notation

### Async Skills in Pipeline
- Test: marks async skill step as "pending_async" when no dependents
- Test: polls for async completion when step has dependents
- Test: skips dependent steps on async timeout (60s)

## Section 7: Agent Loop

### runAgentLoop()
- Test: completes in 1 iteration for simple execute_skill + done
- Test: completes in 2 iterations for execute + quality_check + done
- Test: terminates at max iterations (5) with warning
- Test: terminates when credit budget exceeded
- Test: terminates when wall-clock exceeds 30s
- Test: detects stuck loop (same action repeated)
- Test: validates agent-provided params against skill schema before execution
- Test: retries with corrected params when validation fails

### Context Management
- Test: keeps full history for iterations 1-3
- Test: summarizes older results when iteration > 3
- Test: always includes original message in context

## Section 8: Result Merger

### mergeResults()
- Test: passes through single SIMPLE result unchanged
- Test: combines multiple text results into structured document
- Test: combines text + image URLs with inline placement
- Test: combines text + video URL (text first, media after)
- Test: combines multiple image URLs into gallery format
- Test: preserves individual section metadata (creditsUsed, durationMs per skill)
- Test: calculates correct totalCreditsUsed and totalDurationMs

## Section 9: Quality Gate

### validateQuality()
- Test: passes when result addresses all parts of user request
- Test: fails when result is empty or error message
- Test: fails when multiple outputs contradict each other
- Test: returns issues array with specific failure reasons
- Test: returns suggestion for improvement when available

## Section 10: Audit & Observability

### Audit Events
- Test: orchestration_classify event contains level, skills, confidence, latencyMs
- Test: orchestration_pipeline event contains step statuses and per-step credits
- Test: orchestration_agent_step event contains iteration number and action
- Test: orchestration_fallback event contains reason (timeout, error, disabled)
- Test: all events share the same traceId within an orchestration session

## Section 11: Frontend Integration

### OrchestrationConfirmForm component
- Test: renders pre-filled fields from extractedParams
- Test: highlights missing required fields
- Test: submits form with merged params via confirmOrchestration mutation
- Test: "Skip" button executes with defaults only

### OrchestrationResultView component
- Test: renders single-skill result same as current
- Test: renders multi-skill result with section headers
- Test: shows collapsible orchestration details footer
- Test: shows progress indicator for COMPOUND pipelines

## Section 12: Testing (meta — integration tests)

### End-to-end flow
- Test: user message → classifier → param extraction → skill execution → response (SIMPLE)
- Test: user message → classifier → pipeline → merge → response (COMPOUND)
- Test: feature flag toggle mid-session (orchestrator → regex fallback)
- Test: orchestration with real input.schema.json files from skills/
