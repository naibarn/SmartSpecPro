Now I have all the context needed. Let me produce the section content.

# Section 06: Prompt Composer and Turn Order Engine

## Overview

This section implements two tightly coupled services that power the core agent conversation loop:

1. **Prompt Composer** (`apps/web/server/services/promptComposer.ts`) -- assembles the LLM prompt for each agent turn from persona, memory, history, and task context while managing a per-section token budget.
2. **Turn Order Engine** (`apps/web/server/services/turnOrderEngine.ts`) -- determines which agent speaks next using one of four strategies, with safety rules for loop detection, muting, and consecutive-turn limits.

These services are called by the Run Engine (section-05) during `executeTurn`. The Prompt Composer depends on the Scoped Memory Service (section-03) for memory retrieval. The Turn Order Engine depends on the Run Engine for run state and the room participant roster (section-02 schema).

### Dependencies

| Dependency | Section | What is needed |
|------------|---------|----------------|
| `scoped_memories` table + `scopedMemoryService.ts` | section-03 | `searchMemories()` and `retrieveForPrompt()` for memory retrieval |
| `team_runs`, `team_room_messages`, `team_room_participants`, `assistant_profiles` tables | section-02, section-01 | Run state, message history, participant roster, persona data |
| Run Engine (`runEngine.ts`) | section-05 | Calls `composePrompt` and `getNextSpeaker` during turn execution |

### What This Section Blocks

| Downstream | Section | Reason |
|------------|---------|--------|
| Python Team Orchestrator | section-15 | Python mirrors the prompt composition logic for LLM calls |

---

## Tests (Write First)

All tests go in `apps/web/server/services/__tests__/`. Use Vitest. Mock the database layer and scopedMemoryService.

### File: `apps/web/server/services/__tests__/promptComposer.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for promptComposer.ts
 *
 * All database and memory service calls are mocked.
 * The composer should be a pure-ish function that takes
 * structured inputs and returns an assembled prompt array.
 */

describe("promptComposer", () => {
  describe("composePrompt", () => {
    it("includes persona section within 2000 token budget", async () => {
      // Mock: assistant profile with a persona that has systemPrompt, roleTitle, specialtyTags
      // Assert: first system message contains persona content
      // Assert: persona section does not exceed ~2000 tokens (8000 chars approx)
    });

    it("retrieves memories in correct scope order (agent > run > room > team > project > user)", async () => {
      // Mock: scopedMemoryService.retrieveForPrompt returns memories from multiple scopes
      // Assert: memories appear in the prompt ordered by specificity (agent first, user last)
    });

    it("truncates conversation history when exceeding budget", async () => {
      // Mock: 100 messages totaling well over the remaining token budget
      // Assert: returned history is shorter than total available
      // Assert: most recent messages are preserved (truncation removes oldest first)
    });

    it("includes system resource state warnings when provider is degraded", async () => {
      // Mock: system_resource_state has an entry with status=degraded for the active provider
      // Assert: prompt includes a system warning about degraded provider
    });

    it("excludes muted agents from available handoff targets listed in prompt", async () => {
      // Mock: participant roster with one muted agent
      // Assert: the "available team members" section in the prompt omits the muted agent
    });
  });

  describe("retrieveMemories", () => {
    it("deduplicates same fact across scopes, preferring more specific scope", async () => {
      // Mock: same content appears in agent scope and team scope
      // Assert: only the agent-scope version is included
    });
  });

  describe("compressHistory", () => {
    it("preserves handoff, decision, and summary messages during compression", async () => {
      // Mock: mixed message types including handoff, decision, summary, and discussion
      // Apply compression with a tight budget
      // Assert: handoff, decision, summary messages are always retained
      // Assert: discussion messages are the ones trimmed first
    });
  });
});
```

### File: `apps/web/server/services/__tests__/turnOrderEngine.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for turnOrderEngine.ts
 *
 * All database calls mocked. Engine operates on in-memory
 * participant rosters and run state.
 */

describe("turnOrderEngine", () => {
  describe("Lead-Directed strategy", () => {
    it("extracts nextSpeakerHint from LLM response metadata", () => {
      // Input: LLM response containing nextSpeakerHint field
      // Assert: returns the hinted assistant as next speaker
    });

    it("falls back to round-robin when no hint provided", () => {
      // Input: LLM response with no nextSpeakerHint
      // Assert: returns next agent in sortOrder sequence
    });
  });

  describe("Round-Robin strategy", () => {
    it("cycles through agents in sortOrder", () => {
      // Input: 3 agents with sortOrder 1, 2, 3; current is agent 1
      // Assert: next calls return agent 2, then 3, then 1 again
    });
  });

  describe("Handoff-Based strategy", () => {
    it("allows agent to specify next speaker via nextSpeakerHint", () => {
      // Input: non-lead agent response with nextSpeakerHint
      // Assert: returns the specified agent
    });
  });

  describe("Safety rules", () => {
    it("detects loop after 3 A-B-A-B cycles and escalates", () => {
      // Input: turn history showing A, B, A, B, A, B pattern
      // Assert: returns loop_detected flag with escalation recommendation
    });

    it("enforces max 3 consecutive turns per agent", () => {
      // Input: same agent has spoken 3 times in a row
      // Assert: that agent is skipped, next in order is chosen
    });

    it("skips muted agents in all strategies", () => {
      // Input: roster with agent B muted, round-robin order A, B, C
      // Assert: after A, next is C (B skipped)
    });
  });
});
```

---

## Implementation Details

### File: `apps/web/server/services/promptComposer.ts`

This is a new file. It exports three main functions.

#### `composePrompt(assistantId, runId, turnInput): Promise<PromptMessage[]>`

Assembles a complete LLM prompt as an array of message objects (system, user, assistant roles). The assembly follows a strict section order with per-section token budgets.

**Assembly order and token budgets:**

| Section | Budget | Content |
|---------|--------|---------|
| 1. Persona + Team Overlay | ~2000 tokens | `assistant_profiles.personaId` -> persona systemPrompt + roleTitle + specialtyTags + team overlay from `assistant_teams.teamPersonaOverlay` + behavioral rules (language, turn protocol) |
| 2. Memory Context | ~3000 tokens | Top-K memories from each scope retrieved via `scopedMemoryService.retrieveForPrompt()` in priority order: agent > run > room > team > project > user |
| 3. Conversation History | Remaining budget | `team_room_messages` visible to this agent, compressed if over budget |
| 4. Current Turn | Uncapped | The user/agent message that triggered this turn, plus any tool results or orchestrator intervention |

**Token counting:** Use a simple heuristic of `Math.ceil(text.length / 4)` for estimation (same pattern as the existing `memoryService.ts` which uses `CHARS_PER_TOKEN = 4`). This avoids needing a tokenizer dependency. The total budget comes from the model's context window (looked up from `modelProviderMap` or defaulting to 8000 tokens).

**Persona section assembly:**

1. Load `assistant_profiles` row by `assistantId` (includes `personaId`, `roleTitle`, `specialtyTags`, `toolPolicyJson`, `visibilityPolicyJson`).
2. Load the linked `personaTemplates` row to get the persona's `systemPrompt`.
3. Load `assistant_teams` row to get `teamPersonaOverlay` (JSON with optional additional instructions).
4. Build the system message: persona system prompt + role context + available team members (excluding muted) + turn protocol instructions + room language instruction.

**Memory section assembly:**

Call `scopedMemoryService.retrieveForPrompt(assistantId, runId, query, budget)` where `query` is derived from the current turn input and recent messages. The service returns memories ordered by scope priority. Format each memory as a concise block: `[{scope}] {title}: {content}` truncated to fit the budget.

Deduplication: if the same content (by `title` match or content similarity above 0.9) appears in multiple scopes, keep only the most specific scope version (agent > run > room > team > project > user).

**History section assembly:**

1. Load `team_room_messages` for the room, filtered to messages visible to this assistant (respecting `visibility` and `recipientType` / `recipientAssistantId`).
2. If total token count of messages exceeds the remaining budget, call `compressHistory`.
3. Format messages as alternating user/assistant role entries.

#### `retrieveMemories(assistantId, runId, query, budget): Promise<MemoryItem[]>`

Delegates to `scopedMemoryService.retrieveForPrompt()` (from section-03). Applies deduplication and truncation to fit within the token budget. Returns an ordered array of memory items.

**Scope retrieval order (most specific first):**
1. `ownerType=agent, ownerId=assistantId` (agent's private memories)
2. `ownerType=run, ownerId=runId` (run-scoped shared memories)
3. `ownerType=room, ownerId=roomId` (room-scoped memories)
4. `ownerType=team, ownerId=teamId` (team-wide memories)
5. `ownerType=project, ownerId=projectId` (if room has projectId)
6. `ownerType=user, ownerId=userId` (user-level memories)

#### `compressHistory(messages, budget): CompressedMessage[]`

When conversation history exceeds the token budget, compress by priority:

1. **Always keep:** messages with `turnType` of `handoff`, `decision`, or `summary` (these are critical context).
2. **Always keep:** the most recent N messages (where N fills about 40% of the budget).
3. **Trim first:** oldest `discussion` type messages.
4. **If still over budget:** summarize trimmed blocks into a single "[Earlier discussion summarized]" placeholder noting key participants and topic count.

#### Types

```typescript
/** A single prompt message in the LLM-ready format */
interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A memory item formatted for prompt injection */
interface MemoryItem {
  scope: string;
  title: string;
  content: string;
  tokenEstimate: number;
}

/** Input for composing a prompt */
interface ComposePromptInput {
  assistantId: string;
  runId: string;
  roomId: string;
  teamId: string;
  turnInput: string;
  modelContextWindow?: number;
}
```

**System resource state injection:** Before finalizing the system message, query `system_resource_state` for any entries with `status` of `degraded`, `down`, or `critical`. If any are found, append a warning block to the system message: `"[System Notice] The following resources are currently impacted: {resource} - {status}. Adjust your approach accordingly."` This alerts the agent to potential limitations (e.g., a degraded image generation provider).

---

### File: `apps/web/server/services/turnOrderEngine.ts`

This is a new file. It exports a main function and supporting utilities.

#### `getNextSpeaker(runId, strategy, lastResponse?): Promise<NextSpeakerResult>`

Determines which agent should speak next based on the configured strategy and current run state.

**Input:**
- `runId` -- the active run
- `strategy` -- one of `lead_directed`, `round_robin`, `handoff`, `orchestrator_directed`
- `lastResponse` -- optional: the previous agent's response metadata (may contain `nextSpeakerHint`)

**Output:**
```typescript
interface NextSpeakerResult {
  assistantId: string;
  reason: string;
  loopDetected: boolean;
  escalation?: "lead" | "stop";
}
```

**Strategy implementations:**

**Lead-Directed (default):**
1. If the last speaker was the lead, extract `nextSpeakerHint` from their response metadata (`metadataJson.nextSpeakerHint` field).
2. If hint is present and the target agent is active (not muted, exists in roster), return that agent.
3. If hint is absent or invalid, fall back to round-robin among non-lead members.

**Round-Robin:**
1. Load `team_room_participants` for the run's room, filtered to `participantType=assistant` and `isMuted=false`.
2. Sort by the linked `assistant_profiles.sortOrder`.
3. Find the current agent's position, return the next one (wrapping around).

**Handoff-Based:**
1. Extract `nextSpeakerHint` from any agent's response (not just lead).
2. Validate the target exists and is not muted.
3. If invalid, fall back to round-robin.

**Orchestrator-Directed:**
1. Check if the orchestrator (user) has queued a next-speaker directive via `teamRun.intervene` (stored in run metadata or a pending intervention record).
2. If present, return that agent. If not, fall back to lead-directed.

#### `detectLoop(turnHistory): LoopDetectionResult`

Examines the recent turn history (last 10 turns) for repetitive patterns.

**Algorithm:**
1. Extract the sequence of `assistantId` values from recent turns.
2. Check for A-B-A-B pattern repeated 3 or more times.
3. If detected, return `{ loopDetected: true, pattern: [A, B], recommendation: "escalate_to_lead" }`.
4. If the lead is part of the loop, recommend `"stop"` instead.

```typescript
interface LoopDetectionResult {
  loopDetected: boolean;
  pattern?: string[];
  recommendation?: "escalate_to_lead" | "stop";
}
```

#### `enforceConsecutiveLimit(assistantId, turnHistory, maxConsecutive = 3): boolean`

Returns `true` if the given assistant has already spoken `maxConsecutive` times in a row (checking the tail of `turnHistory`). The caller should skip this agent and advance to the next candidate.

#### Safety rules (applied in `getNextSpeaker` before returning):

1. **Muted check:** If the selected agent has `isMuted=true` in `team_room_participants`, skip and advance.
2. **Consecutive limit:** If `enforceConsecutiveLimit` returns true, skip and advance.
3. **Loop detection:** Run `detectLoop` on recent history. If loop detected, set the `loopDetected` flag and change the result to the lead agent (or recommend stop if lead is in the loop).
4. **Dead-letter fallback:** If the suggested speaker does not exist in the roster or is inactive, fall back to the lead. If the lead is also unavailable, fall back to round-robin of remaining active agents. If no agents are available, return an error that should trigger a run stop.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/services/promptComposer.ts` | Create | Prompt assembly with token budgets |
| `apps/web/server/services/turnOrderEngine.ts` | Create | Turn order strategy + safety rules |
| `apps/web/server/services/__tests__/promptComposer.test.ts` | Create | Unit tests for prompt composer |
| `apps/web/server/services/__tests__/turnOrderEngine.test.ts` | Create | Unit tests for turn order engine |

---

## Integration Points

**Called by Run Engine (section-05):** The `executeTurn` function in `runEngine.ts` calls `composePrompt` to build the LLM payload, and `getNextSpeaker` to determine whose turn is next after each response.

```
executeTurn(runId):
  1. nextAgent = getNextSpeaker(runId, strategy, lastResponse)
  2. prompt = composePrompt(nextAgent.assistantId, runId, turnInput)
  3. llmResponse = callLLM(prompt)
  4. recordMessage(...)
  5. evaluateStopPolicy(...)
```

**Memory retrieval (section-03):** `composePrompt` calls `scopedMemoryService.retrieveForPrompt()` which performs hybrid keyword+vector search across the six memory scopes.

**System resource state (section-09):** `composePrompt` reads from the `system_resource_state` table to inject provider health warnings. If section-09 is not yet implemented, this read can return an empty array gracefully (no warnings injected).

**Python orchestrator (section-15):** The Python `team_orchestrator.py` mirrors prompt composition logic. It receives the composed prompt from Node.js via the internal API `POST /api/internal/team-runs/:runId/execute-turn`, so the Python side does not need to duplicate the full composition -- it receives the pre-assembled prompt and handles the LLM call.

---

## Implementation Checklist

1. Write test files (`promptComposer.test.ts`, `turnOrderEngine.test.ts`) with the stubs above.
2. Implement `turnOrderEngine.ts` -- it has fewer dependencies and can be tested with mocked data.
3. Implement `promptComposer.ts` -- requires mocking `scopedMemoryService` and database queries.
4. Verify all tests pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/__tests__/promptComposer.test.ts server/services/__tests__/turnOrderEngine.test.ts`.
5. Run type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`.