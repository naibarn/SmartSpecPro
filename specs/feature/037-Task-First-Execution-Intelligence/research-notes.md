# Research Notes

## Codebase findings

### 1. Skill model routing exists, but is not yet policy-based

- `packages/skills/src/types.ts` already supports `llmModelId`, `preferredProviderId`, and `strictProviderPin`.
- `apps/web/server/services/skillRegistry.ts` maps those fields from frontmatter/DB into runtime `SkillDefinition`.
- However, the current shape is still a fixed routing shape, not a policy shape. There is no normalized concept of:
  - required capabilities
  - min context
  - cost preference
  - execution strategy preference
  - simple vs complex model branch

### 2. Chat skill execution still behaves conversation-first

- `apps/web/server/routers/chat.ts` currently chooses `skill.llmModelId/defaultModel`, but then overrides it with `conversation.model`.
- This makes skill execution policy untrustworthy and blocks future capability-aware routing.
- This is the first runtime correctness issue to fix.

### 3. Model registry is partially ready for intelligent routing

- `apps/web/drizzle/schema.ts` already stores `contextLength` in `model_provider_map`.
- `apps/web/server/routers/llmProviders.ts` already exposes flattened enabled models including `contextLength`.
- `apps/web/server/services/llmRouter.ts` already resolves providers for a chosen model with fallback and health logic.
- Missing piece: normalized capability flags such as Responses support, web search support, background support, code execution support, and structured output support.

### 4. Responses API proxy is the natural base for single-run work completion

- `apps/web/server/_core/responsesRoutes.ts` already supports tool loops and web search tracking.
- This is the right primitive for strong models that can complete work in one managed run.
- Current limitation: billing metadata still assumes browser-oriented usage in some paths and is not generalized for task runtime / skill runtime.

### 5. Billing foundation is strong, but classification must improve

- `apps/web/server/services/creditService.ts` has a strong central primitive in `deductCreditsForModel()`.
- It supports source type, skill slug, conversation ID, and provider cost where available.
- This is sufficient to support the new runtime if all new execution paths pass through it consistently.
- Main risk is not missing a billing primitive, but introducing new paths that bypass or misclassify it.

### 6. Presentation generation already behaves like a task-completion engine

- `apps/web/server/services/aiPresentationService.ts` already produces real decks through a deterministic pipeline.
- This is an ideal example of a task-first outcome already living inside the platform.
- Feature 037 should route into this system rather than trying to replace it with generic chat completion.

### 7. AgencySwarm is already a valid escalation path

- `python-backend/app/services/agency_orchestrator.py` already supports mixed graph execution.
- `python-backend/app/services/agency_tools.py` already bridges internal tools and higher-risk paths.
- This means the new planner does not need to invent a new orchestration engine. It needs a policy layer above existing engines.

## Existing product/spec alignment

### Spec 027 — AgencySwarm

- Established the multi-agent coordination layer.
- Feature 037 should treat AgencySwarm as one execution strategy, not the default for every complex task.

### Spec 034 — Research / Storyboard / Deck Builder

- Introduced envelope-based artifact routing and downstream artifact thinking.
- Feature 037 broadens that pattern into a more general task runtime that decides when direct completion is enough and when agency routing is needed.

### Spec 035 — Auto Draft & Content Automation

- Established that the product already has production-grade deterministic pipelines.
- Feature 037 should preserve and reuse those pipelines as preferred strategies when artifact reliability matters.

## External research summary

### OpenAI

- Official docs position the Responses API as the primary surface for conversations, tools, structured outputs, and background execution.
- Official Agents SDK docs formalize agents, tools, guardrails, and handoffs.
- Product implication: SmartSpecPro should plan around responses/tool-managed work, not only chat-completions semantics.

### Google Gemini

- Official Gemini docs expose million-token-class context on supported models and broader task primitives such as structured output, code execution, grounding, and caching.
- Product implication: long-context routing should be capability-driven from enabled models, not hardcoded per feature.

### Anthropic Claude

- Anthropic docs show increasingly explicit support for tool use patterns such as web search, code execution, and computer use, plus quality/cost trade-offs across model tiers.
- Product implication: the planner must balance capability and cost, not just search for the "strongest" model.

## Recommended architecture direction

### 1. Fix runtime correctness before adding intelligence

First:

- skill invocation must honor skill execution policy
- billing metadata must be generalized for task runtime and responses-driven execution

Then:

- add capability registry
- add planner
- add direct artifact paths

### 2. Use a layered strategy model

Recommended strategy order:

1. direct completion
2. responses with built-in tools
3. skill execution
4. deterministic pipeline
5. agency swarm
6. sandbox-heavy execution

This ordering balances simplicity, cost, and reliability.

### 3. Prefer deterministic pipelines for fidelity-critical artifacts

For example:

- presentation deck generation should still prefer `generateAIDraft()` where output structure/layout/media pipeline fidelity matters
- a strong model may still produce the planning or control envelope around that pipeline

### 4. Keep planner heuristic-first initially

The first version should rely on:

- rules
- capability filtering
- cost tiers
- complexity heuristics

An LLM planner-judge can be added later for ambiguous cases once billing and telemetry are stable.

## Key risks

1. Overusing frontier models and raising cost
2. Routing too many tasks into agency-swarm and increasing latency
3. Misbilling responses/tool loops as browser-only usage
4. Capability metadata drift as vendors change model features

## Suggested first implementation sequence

1. Runtime correction for skill invocation
2. Capability registry and skill execution policy schema
3. Task execution planner + `task_runs`
4. Direct artifact execution over presentation/report paths
5. AgencySwarm planner integration

## External sources

- OpenAI Assistants / Responses docs: `https://platform.openai.com/docs/assistants`
- OpenAI Agents SDK: `https://openai.github.io/openai-agents-python/`
- OpenAI Agents SDK handoffs: `https://openai.github.io/openai-agents-python/handoffs/`
- Gemini model docs: `https://ai.google.dev/gemini-api/docs/models/gemini-v2`
- Anthropic model overview: `https://docs.anthropic.com/en/docs/models-overview`
- Anthropic tool use docs: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use`
