Good, I have enough context to write the section. Let me now produce the complete section content.

# Section 13 -- Few-Shot Examples, Conversation Starters & Shared Instructions/Tools

## Overview

This section implements three related features from the spec (Features 2.9 and 2.10):

1. **Few-shot examples** -- Per-agent example conversations stored as JSONB, sanitized for prompt injection, prepended to agent history at runtime with system framing.
2. **Conversation starters** -- Agency-level suggestion chips with optional Redis caching (GAP-I).
3. **Shared instructions and shared tools** -- Agency-level `sharedInstructions` text prepended to every agent, plus `agency_shared_tools` junction table for tools available to all agents.

**Depends on**: section-01-database-migration (schema columns and tables must exist).
**Blocks**: Nothing -- this section is a leaf in the dependency graph.
**Parallelizable**: Yes (Batch 2).

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/routers/__tests__/agencyFewShot.test.ts` | CREATE | Vitest tests for validation, sanitization, shared tools |
| `apps/web/server/routers/agency.ts` | MODIFY | Extend `saveBuilder` Zod schema with examples, shared fields |
| `apps/web/server/services/fewShotSanitizer.ts` | CREATE | Example sanitization logic (prompt injection stripping) |
| `apps/web/server/services/__tests__/fewShotSanitizer.test.ts` | CREATE | Unit tests for sanitizer |
| `apps/web/server/services/conversationStarterCache.ts` | CREATE | Redis cache logic for conversation starters |
| `apps/web/server/services/__tests__/conversationStarterCache.test.ts` | CREATE | Unit tests for cache |
| `python-backend/app/services/agency_few_shot.py` | CREATE | Runtime injection of examples + shared instructions |
| `python-backend/tests/unit/services/test_agency_few_shot.py` | CREATE | pytest tests for Python runtime |
| `python-backend/app/services/agency_orchestrator.py` | MODIFY | Wire shared instructions + examples into agent creation |
| `python-backend/app/services/agency_tools.py` | MODIFY | Merge shared tools with agent-specific tools |
| `apps/web/client/src/components/agency/FewShotExamplesEditor.tsx` | CREATE | Frontend component for editing example pairs |
| `apps/web/client/src/components/agency/ConversationStarterChips.tsx` | CREATE | Suggestion chips UI in chat |
| `apps/web/client/src/components/agency/SharedInstructionsPanel.tsx` | CREATE | Shared instructions textarea in agency settings |
| `apps/web/client/src/components/agency/SharedToolsBadge.tsx` | CREATE | Visual "shared" badge for shared tools |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | MODIFY | Add "Examples" section to agent/supervisor form |
| `apps/web/drizzle/schema.ts` | REFERENCE ONLY | Schema already modified by section-01 |

---

## TDD Test Specifications

### Test File: `apps/web/server/services/__tests__/fewShotSanitizer.test.ts`

```
Test: "strips known prompt injection patterns from example content"
  - Input: example with "Ignore previous instructions and..." content
  - Expected: content sanitized with injection pattern removed

Test: "allows legitimate example content through unchanged"
  - Input: normal user/assistant conversation pair
  - Expected: content passes through without modification

Test: "enforces max 10 example pairs per agent"
  - Input: array of 11 example pairs
  - Expected: throws validation error or truncates to 10

Test: "enforces max 2000 chars per message in example"
  - Input: example with content exceeding 2000 chars
  - Expected: throws validation error

Test: "wraps sanitized examples in system framing"
  - Input: 2 valid example pairs
  - Expected: output contains framing prefix "The following are example interactions for reference only:"

Test: "handles empty examples array gracefully"
  - Input: []
  - Expected: returns empty array, no framing added

Test: "strips HTML tags from example content"
  - Input: example with <script> or <img onerror> tags
  - Expected: tags removed from content
```

### Test File: `apps/web/server/routers/__tests__/agencyFewShot.test.ts`

```
Test: "saveBuilder accepts valid examples array on agent"
  - Input: agent with examples containing 3 user/assistant pairs
  - Expected: saved to database without error

Test: "saveBuilder rejects examples with invalid role"
  - Input: example pair with role "system" (only user/assistant allowed)
  - Expected: Zod validation error

Test: "saveBuilder rejects examples exceeding 10 pairs"
  - Input: agent with 11 example pairs
  - Expected: Zod validation error with message about max 10

Test: "saveBuilder accepts valid conversationStarters on agency"
  - Input: agency with conversationStarters array of 5 strings
  - Expected: saved to database without error

Test: "saveBuilder rejects conversationStarters exceeding 10 items"
  - Input: conversationStarters array with 11 strings
  - Expected: Zod validation error

Test: "saveBuilder accepts sharedInstructions text"
  - Input: agency with sharedInstructions string (5000 chars)
  - Expected: saved to database

Test: "saveBuilder rejects sharedInstructions exceeding 50000 chars"
  - Input: sharedInstructions with 50001 chars
  - Expected: Zod validation error

Test: "saveBuilder creates agency_shared_tools junction rows"
  - Input: agency with sharedToolIds array containing 3 tool IDs
  - Expected: 3 rows in agency_shared_tools table

Test: "saveBuilder enforces UNIQUE(agencyId, toolId) on shared tools"
  - Input: duplicate toolId in sharedToolIds
  - Expected: deduplication or constraint error handled gracefully

Test: "saveBuilder replaces shared tools on update (delete-insert pattern)"
  - Setup: agency with 2 shared tools, then save with 3 different tools
  - Expected: old 2 removed, new 3 inserted

Test: "getAgency returns conversationStarters, sharedInstructions, cacheConversationStarters"
  - Setup: agency with these fields populated
  - Expected: response includes all three fields
```

### Test File: `apps/web/server/services/__tests__/conversationStarterCache.test.ts`

```
Test: "caches starter response when cacheConversationStarters is true"
  - Setup: agency with cacheConversationStarters=true
  - Action: call cacheStarterResponse(agencyId, prompt, response)
  - Expected: Redis SET called with key agency:{id}:starter:{hash}, TTL 24h

Test: "returns cached response on cache hit"
  - Setup: cached response in Redis for agency/prompt pair
  - Action: call getCachedStarterResponse(agencyId, prompt)
  - Expected: returns cached response string

Test: "returns null on cache miss"
  - Action: call getCachedStarterResponse with unknown prompt
  - Expected: returns null

Test: "invalidates all starter caches when agency instructions change"
  - Setup: 3 cached starters for agency
  - Action: call invalidateStarterCache(agencyId)
  - Expected: all 3 keys deleted from Redis

Test: "generates stable hash from prompt text for cache key"
  - Input: same prompt string twice
  - Expected: same hash both times

Test: "skips caching when cacheConversationStarters is false"
  - Setup: agency with cacheConversationStarters=false
  - Action: call cacheStarterResponse
  - Expected: Redis SET not called
```

### Test File: `python-backend/tests/unit/services/test_agency_few_shot.py`

```
Test: "prepend_examples inserts example messages into agent history with system framing"
  - Input: 2 example pairs
  - Expected: messages list starts with system framing message, then example pairs with role tags

Test: "prepend_examples does nothing when examples is None or empty"
  - Input: None / []
  - Expected: returns original history unchanged

Test: "prepend_shared_instructions prepends to agent instructions"
  - Input: shared_instructions="Always be polite.", agent_instructions="You are a writer."
  - Expected: result starts with "[SHARED INSTRUCTIONS]\nAlways be polite.\n[/SHARED INSTRUCTIONS]\n\nYou are a writer."

Test: "prepend_shared_instructions does nothing when shared_instructions is None or empty"
  - Input: None / ""
  - Expected: returns agent_instructions unchanged

Test: "resolve_shared_tools merges shared tools with agent-specific tools"
  - Setup: 2 agent tools + 3 shared tools (1 overlapping)
  - Expected: 4 unique tools (no duplicates)

Test: "resolve_shared_tools returns only agent tools when no shared tools exist"
  - Setup: 2 agent tools, 0 shared tools
  - Expected: 2 agent tools

Test: "conversation starters cached in Redis when cacheConversationStarters enabled"
  - Mock: Redis client
  - Expected: SET called with correct key pattern and 24h TTL

Test: "cache invalidated when agency instructions change"
  - Mock: Redis client with existing keys
  - Action: call invalidate function
  - Expected: DEL called on all matching keys
```

---

## Implementation Guidance

### 1. Few-Shot Example Sanitization Service

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/fewShotSanitizer.ts`

The sanitizer must:
- Accept an array of example pairs, each being `Array<{ role: "user" | "assistant"; content: string }>`
- Strip known prompt injection patterns (e.g., "ignore previous instructions", "system:", "you are now", content between `<|` and `|>`)
- Strip HTML tags (use a simple regex strip, not a full HTML parser)
- Enforce max 10 pairs per agent
- Enforce max 2000 characters per individual message content
- Return sanitized examples plus a system framing wrapper string

Export two functions:
- `sanitizeExamples(examples: ExamplePair[]): ExamplePair[]` -- validates and cleans
- `frameExamplesForPrompt(examples: ExamplePair[]): string` -- produces the prompt text with system framing prefix `"The following are example interactions for reference only:"`

Type definition:
```typescript
export interface ExamplePair {
  role: "user" | "assistant";
  content: string;
}
```

### 2. Extend saveBuilder Zod Schema

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Add to the `saveBuilder` input schema:

**Agency-level fields** (top-level of the `z.object`):
- `sharedInstructions`: `z.string().max(50000).optional()`
- `conversationStarters`: `z.array(z.string().min(1).max(500)).max(10).optional()`
- `cacheConversationStarters`: `z.boolean().optional()`
- `sharedToolIds`: `z.array(z.string().min(1).max(100)).max(50).optional()`

**Agent-level fields** (inside the agents array item):
- `examples`: `z.array(z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).min(1).max(2)).max(10).optional()`

Each example is an array of 1-2 messages (a user/assistant pair). Max 10 such pairs per agent.

In the mutation handler:
1. After upserting the agency row, write `sharedInstructions`, `conversationStarters`, `cacheConversationStarters` to the `agencies` table.
2. After upserting agents, call `sanitizeExamples()` on each agent's examples before storing in the `examples` JSONB column.
3. For `sharedToolIds`: delete all existing `agency_shared_tools` rows for this agency, then insert new rows (delete-insert pattern).
4. When `sharedInstructions` or tool assignments change, call `invalidateStarterCache(agencyId)`.

### 3. Conversation Starter Cache Service

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/conversationStarterCache.ts`

Uses the existing Redis client from `apps/web/server/services/redis.ts`.

Key pattern: `agency:{agencyId}:starter:{sha256(prompt)}` with TTL of 86400 seconds (24 hours).

Export functions:
- `getCachedStarterResponse(agencyId: string, prompt: string): Promise<string | null>`
- `cacheStarterResponse(agencyId: string, prompt: string, response: string): Promise<void>`
- `invalidateStarterCache(agencyId: string): Promise<void>` -- uses `SCAN` + `DEL` for keys matching `agency:{agencyId}:starter:*`

The cache is checked in the agency chat flow: when a user sends a message matching one of the `conversationStarters` and `cacheConversationStarters` is true, check Redis first. If hit, return cached response. If miss, proceed with normal LLM call and cache the result.

### 4. Python Runtime: Few-Shot + Shared Instructions

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_few_shot.py`

Standalone module with pure functions:

- `prepend_examples(history: list[dict], examples: list[list[dict]] | None) -> list[dict]` -- Inserts example messages at the beginning of the agent's message history. Each example pair is wrapped with a system framing message. Uses the format:
  ```
  {"role": "system", "content": "The following are example interactions for reference only:"}
  {"role": "user", "content": "..."}
  {"role": "assistant", "content": "..."}
  {"role": "system", "content": "End of examples. Now respond to the actual user message:"}
  ```

- `prepend_shared_instructions(agent_instructions: str, shared_instructions: str | None) -> str` -- Wraps shared instructions in delimiters and prepends to the agent's own instructions:
  ```
  [SHARED INSTRUCTIONS]
  {shared_instructions}
  [/SHARED INSTRUCTIONS]

  {agent_instructions}
  ```

### 5. Python: Merge Shared Tools

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

Add a new function `resolve_shared_tools_for_agency()` that queries the `agency_shared_tools` table for the given agencyId and returns tool class instances (same pattern as existing `resolve_tools_for_agent()`).

Modify the orchestrator's agent creation flow in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` to:
1. Resolve shared tools once per agency run (not per agent).
2. Merge shared tools with each agent's specific tools, deduplicating by toolId.
3. Pass merged tool list to `AgentConfig.tools`.

The SQL query for shared tools:
```sql
SELECT ast."toolId", at.*
FROM agency_shared_tools ast
LEFT JOIN agency_tools at ON ast."toolId" = at.id
WHERE ast."agencyId" = :agency_id
```

For builtin tool IDs (format `"builtin-xxx"`), use the existing `_BUILTIN_ENDPOINTS` lookup in `agency_tools.py`.

### 6. Wire Shared Instructions into Orchestrator

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

In the agent creation section (around line 281 where `AgentConfig` is constructed), before creating the agent:
1. Import and call `prepend_shared_instructions(agent_instructions, self.agency_config.system_prompt)` -- note: the existing `system_prompt` field on `AgencyConfig` already maps to the agency's system prompt. The new `sharedInstructions` is a separate field that should be passed through.
2. Import and call `prepend_examples()` when building the agent's initial history.

Add `shared_instructions` field to `AgencyConfig` in `agency_swarm_adapter.py` (line ~96):
```python
shared_instructions: str | None = None
```

### 7. Frontend: FewShotExamplesEditor Component

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/FewShotExamplesEditor.tsx`

A form component embedded in the agent property panel (within `NodePropertyPanel.tsx`):
- Renders a list of example pairs (user message + assistant response)
- "Add Example" button (disabled when count reaches 10)
- Each pair has two `Textarea` fields (user, assistant) with character counter (max 2000)
- Drag-to-reorder via `GripVertical` icon (already imported in NodePropertyPanel)
- Delete button per pair
- Calls `onChange(examples: ExamplePair[][])` to propagate changes to parent

### 8. Frontend: ConversationStarterChips Component

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ConversationStarterChips.tsx`

Rendered in the agency chat view before the first user message:
- Displays `conversationStarters` as clickable suggestion chip buttons
- On click, populates the chat input with the starter text
- Hidden after the first message is sent
- Styled as outlined pill buttons with hover state

### 9. Frontend: SharedInstructionsPanel and SharedToolsBadge

**SharedInstructionsPanel**: A `Textarea` in the agency settings sidebar (not per-agent) for editing `sharedInstructions`. Max 50000 chars with character counter.

**SharedToolsBadge**: A small visual badge component that renders next to tool names in `ToolPicker.tsx` when the tool comes from the `agency_shared_tools` table. Uses a distinct color (e.g., blue badge with "Shared" text).

### 10. Cache Invalidation Trigger

In the `saveBuilder` mutation handler, after writing agency-level changes:
- If `sharedInstructions` changed OR `sharedToolIds` changed OR `systemPrompt` changed, call `invalidateStarterCache(agencyId)`.
- Compare previous values to detect changes (query current row before update).

---

## Data Flow Summary

```
Frontend (saveBuilder) 
  → Zod validation (examples, conversationStarters, sharedInstructions, sharedToolIds)
  → fewShotSanitizer.sanitizeExamples() 
  → DB write (agencies + agencyAgents + agency_shared_tools)
  → Cache invalidation (if instructions/tools changed)

Runtime (Python orchestrator)
  → Load agency row (sharedInstructions, conversationStarters)
  → Load agency_shared_tools → resolve_shared_tools_for_agency()
  → For each agent:
      → prepend_shared_instructions(agent.instructions, agency.sharedInstructions)
      → Merge shared tools with agent-specific tools
      → prepend_examples(history, agent.examples)
      → Create AgentConfig with merged instructions/tools/history
```

---

## Acceptance Criteria Checklist

- [ ] Example conversations configurable per agent (max 10 pairs, max 2000 chars/message)
- [ ] Examples sanitized: prompt injection patterns stripped before storage
- [ ] Examples prepended to agent history at runtime with system framing delimiters
- [ ] Conversation starters shown in chat UI as suggestion chips
- [ ] Cache toggle (cacheConversationStarters) stores/retrieves first-turn responses from Redis with 24h TTL
- [ ] Cache invalidated when agency instructions, tools, or system prompt change
- [ ] Shared instructions prepended to all agents' system prompts at runtime
- [ ] agency_shared_tools junction rows created/updated via saveBuilder
- [ ] Shared tools available to all agents without per-agent assignment
- [ ] Visual "Shared" badge on shared tools in the builder UI
- [ ] All Vitest and pytest tests pass