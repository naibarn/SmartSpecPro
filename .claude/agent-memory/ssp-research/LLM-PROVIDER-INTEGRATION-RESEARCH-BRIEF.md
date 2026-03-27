---
name: LLM Provider Integration and Tool/Function Calling Support
description: Analysis of current LLM call patterns, tool support per provider, streaming, and agentic loops
type: project
---

# LLM Provider Integration Research Brief

## Findings

### Current Call Patterns: Primarily Single-Shot, Stateless

SmartSpecPro uses **single-shot LLM calls** with no built-in multi-turn tool loops at the LLM gateway level:

1. **Node.js LLM Gateway** (`apps/web/server/services/llmRouter.ts`):
   - Single HTTP request to provider `/v1/chat/completions`
   - **No tool/function_calling support** — the `extraBodyParams` field exists but is rarely used
   - Messages sent as-is; response parsed and returned
   - No continuation loop for tool calls

2. **Python LLM Gateway Client** (`python-backend/app/services/llm_gateway_client.py`):
   - Wrapper around Node.js gateway for Python backend services
   - `chat_completion()` method accepts optional `tools` and `tool_choice` parameters (lines 175–196)
   - **BUT**: These parameters are passed through to the Node.js gateway unchanged
   - No handling of tool call responses or re-invocation

3. **Agency-Swarm Integration** (`python-backend/app/services/agency_swarm_adapter.py`):
   - **This is where multi-turn tool loops ARE handled**
   - Uses OpenAI SDK's internal tool-calling loop (agency-swarm v1.8.0)
   - Agency-swarm manages the full agentic loop:
     - LLM returns tool calls
     - Tools executed
     - Results returned to LLM
     - LLM continues/finishes
   - SmartSpecPro doesn't implement this — delegates to agency-swarm

---

## Tool / Function Calling Support

### By Provider Type

| Support Level | Where Used | Details |
|---|---|---|
| **Full (via agency-swarm)** | Agency orchestrator | OpenAI SDK in agency-swarm handles multi-turn loops; Python gateway client supports `tools` + `tool_choice` params |
| **No support** | Chat/Skill LLM calls | `llmRouter.ts` doesn't send tools; `executeWithFallback()` has no `tools` field |
| **Partial** | Structured output | `callLLMStructured.ts` uses JSON schema validation but NOT function_calling |

### Current Usage Patterns

#### 1. Skills System (NO tool support)
- Skill execution is **skill detection → LLM prompt → execute action** (separate from LLM)
- Skill content is a **prompt template**, not a function_calling interface
- `executeSkill()` in `skillExecutor.ts` calls LLM, parses output, maps to action
- Example: "image_prompt_engineer" skill generates a prompt, then separate code calls image API

#### 2. Agency System (FULL tool support)
- Agency agents are given pre-assigned tools via `agency_agent_tools` table
- Tools passed to agency-swarm as `Agent(tools=[...])` (line 214, swarm_adapter.py)
- Agency-swarm's OpenAI SDK handles tool calling:
  ```
  Agent → LLM(model, messages, tools)
    ↓ LLM returns tool_call
    ↓ Tool executed locally
    ↓ Result as assistant message
    ↓ LLM continues
  ```
- No explicit loop in SmartSpecPro code — agency-swarm owns the loop

#### 3. Direct LLM Calls (NO tool support)
- `handleChatWithRouter()`: Single request, no tools
- `handleStreamWithRouter()`: Streaming, but no tools
- `callLLMStructured()`: Forces JSON schema, no function_calling

---

## How Responses Are Returned

### Streaming

**Node.js side** (`llmRoutesHandler.ts` lines 142–200):
- `handleStreamWithRouter()` executes request and returns **response data to client as SSE**
- Stream is NOT passed through directly — response is buffered and re-streamed
- Comment: "For streaming mode, the router currently handles the upstream request internally and returns the response data. Full streaming passthrough will be implemented when router gains native streaming support." (line 146–147)

**Current limitation**: No true streaming of tool calls. Full response is buffered before returning.

### Non-Streaming

- Standard JSON response with `choices[0].message.content`
- No automatic tool call handling — client receives raw LLM response

---

## LLM Gateway Architecture

### Multi-Provider Routing

**Provider resolution** (`llmRouter.ts` lines 54–192):
- Queries `model_provider_map` JOIN `llmProviders`
- Returns ordered list of `ProviderCandidate` objects
- Sorting modes: cost-based (default) or priority-based

**Fallback mechanism** (lines 323–550):
- Primary provider tried first
- On 429 (rate limit) or 5xx errors, next provider attempted
- Configurable max fallbacks per routing rule
- **Free → Paid boundary detection** (lines 541–549): confirms user has credits before falling back

### Provider-Specific Details

**Supported providers** (from code):
- OpenAI (via API)
- OpenRouter (via HTTP)
- Anthropic (implied, via gateway)
- Any OpenAI-compatible endpoint

**Request formatting** (lines 396–410):
```typescript
const body = {
  model: candidate.providerModelId,
  messages: params.messages,
  stream: params.stream,
  ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
  ...(params.temperature ? { temperature: params.temperature } : {}),
  ...(params.enableThinking ? { reasoning: { effort: "high" } } : {}),  // OpenRouter
  ...(params.extraBodyParams ?? {}),
};
```

**No provider-specific tool handling** — `extraBodyParams` is the escape hatch but unused

---

## Multi-Turn Tool Loops: Current State

### What EXISTS (Agency-Swarm)
- Multi-agent orchestration with communication flows
- Tool execution within agent conversation loop
- Usage tracking across tool calls (lines 367–440, swarm_adapter.py)
- Step counting for agentic reasoning

**How it works:**
1. AgencyOrchestrator loads nodes from database
2. Entry agent called via `adapter.run(agency, message, ...)`
3. Agency-swarm internally:
   - Calls `agent.run(message)`
   - LLM receives tools list
   - Tool calls returned, executed
   - Loop continues until completion
4. Final response returned to orchestrator

### What DOESN'T EXIST (Chat/Skills)
- Skill system has NO multi-turn loops
- LLM doesn't see tools, only prompts
- Skill execution is separate from LLM response processing
- No "try tool, get result, LLM refines" flow

---

## What Would Need to Change for Full Agentic Support

### To enable function_calling in non-agency contexts:

1. **Chat/Skill LLM Calls**:
   - Add `tools?: ToolDefinition[]` to `executeWithFallback()` parameters
   - Implement tool call detection in response parsing
   - Build continuation loop:
     ```
     while (response.finish_reason !== 'stop') {
       if (response has tool_calls) {
         execute_tools()
         add results to messages
         make new call with updated messages
       } else {
         break
     }
     ```
   - Handle streaming continuation (currently blocking for full response)

2. **Skill System Redesign** (optional but cleaner):
   - Convert skills to function calling format instead of prompt templates
   - Skills would have `input_schema.json` as tool parameters
   - LLM would call skill as tool, not as prompt injection

3. **Provider-Level Support**:
   - All major providers (OpenAI, Anthropic, OpenRouter) support function_calling
   - Gateway would need to translate between OpenAI format and provider-specific formats
   - Currently NO provider detection for this — would need to add

4. **Streaming Continuation**:
   - Currently streaming buffered before returning
   - For true agentic streaming:
     - Stream tool calls to client
     - Client sends tool results back
     - Resume streaming
   - OR: handle tool calls server-side, stream final output

---

## Open Questions / Observations

1. **Why not use function_calling for chat?**
   - Skills are prompt-based, simpler to author
   - No user demand for interactive tool loops in chat (yet)
   - Agency system already provides agentic loops for power users

2. **Streaming limitations**: Current design buffers full response before returning. True streaming agentic patterns (stream tool calls mid-response) would require SSE message format redesign.

3. **Tool input validation**: `callLLMStructured()` validates LLM JSON output via Zod, but this is NOT function_calling — it's structured output via prompt engineering.

4. **Credit deduction timing**: Tools are not tracked for credits currently. Only LLM tokens are charged. Tool execution cost is not modeled.

---

## Critical Code Locations

| Concern | File | Lines |
|---|---|---|
| Single-shot LLM calls | `apps/web/server/services/llmRouter.ts` | 323–550 |
| Streaming response | `apps/web/server/services/llmRoutesHandler.ts` | 142–200 |
| Structured output (no tools) | `apps/web/server/services/callLLMStructured.ts` | 58–200 |
| Agency-swarm tool handling | `python-backend/app/services/agency_swarm_adapter.py` | 250–281 |
| LLM gateway client (accepts tools) | `python-backend/app/services/llm_gateway_client.py` | 168–202 |
| Orchestrator node execution | `python-backend/app/services/agency_orchestrator.py` | 164–240 |

---

## Recommendation

**Current system is well-designed for its use cases:**
- Chat is single-turn (user → LLM → response)
- Agencies support multi-turn agentic loops via agency-swarm
- Skills are prompt-based (simpler, less LLM overhead)

**IF adding function_calling is needed in future:**
1. Start with agency chat (where usage is highest)
2. Implement tool continuation loop in `executeWithFallback()`
3. Consider skill format migration (non-breaking, gradual)
4. Evaluate streaming redesign for true agentic experience

**For now**: Document that function_calling is available via agencies, not chat/skills.
