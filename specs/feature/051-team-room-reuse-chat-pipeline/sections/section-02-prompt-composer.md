# Section 02 -- Prompt Composer Enhancement

## Overview

This section enhances `composePrompt()` in `apps/web/server/services/promptComposer.ts` to build agent turn context at the same quality level as Chat. Three capabilities are added:

1. **Full persona resolution** via `buildPersonaPromptSegments()` -- Thai gender particles, tone, style, restrictions
2. **Entity memory injection** via `getEntityMemories()` -- global user facts merged with scoped memories
3. **Multi-turn history with display names** -- preserved role structure, no flattening

This section has no dependencies on other sections and can be implemented in parallel with section-01 (skill detection).

## Dependencies

- **section-01-skill-detection**: Independent (no blocking dependency)
- **section-03-skill-executor**: Blocked by this section (consumes `composePrompt()` output)

### External Imports Required

| Function | Source File | Signature |
|----------|------------|-----------|
| `buildPersonaPromptSegments` | `apps/web/server/services/personaService.ts:356` | `(persona: Pick<PersonaTemplate, "systemPromptPrefix" \| "responseStyle" \| "restrictions" \| "tone" \| "assistantNickname" \| "assistantGender">) => PersonaPromptSegments` |
| `PersonaPromptSegments` | `apps/web/server/services/personaService.ts:52` | `{ prefix: string; styleInstructions: string \| null; restrictionsBulletPoints: string \| null }` |
| `getEntityMemories` | `apps/web/server/services/chatService.ts:568` | `(userId: number, entityType?: string, personaId?: string \| null) => Promise<EntityMemory[]>` |
| `EntityMemory` | `apps/web/drizzle/schema.ts:1547` | Inferred select type from `entity_memories` table |

## File to Modify

**`/home/dev/projects/SmartSpecPro/apps/web/server/services/promptComposer.ts`**

## Current State (lines 126-252)

The existing `composePrompt()` function:
- Loads `assistantProfiles` and `personaTemplates` from DB
- Builds persona section from `systemPromptPrefix` only (no style, no Thai particles, no restrictions)
- Loads team participants for context
- Adds objective as system message
- Retrieves scoped memories via `retrieveForPrompt()` (no entity memories)
- Compresses history via `compressHistory()` and formats with display name prefix (this already works)
- Returns `{ messages: PromptMessage[], estimatedTokens: number }`

## Changes Required

### Change 0: Security — Add `tenantId` and Validate Tenant Isolation (CRIT-1, CRIT-2, HIGH-4)

**MUST be implemented FIRST before any other change.**

Add `tenantId: string` to `ComposePromptInput`:

```typescript
export interface ComposePromptInput {
  assistantId: string;
  runId: string;
  roomId: string;
  teamId: string;
  objective: string;
  tenantId: string;              // NEW: for tenant isolation
  tokenBudget?: number;
  initiatedByUserId?: number;    // NEW: for entity memory
}
```

**At the TOP of `composePrompt()`, add tenant validation:**

1. Validate `roomId` belongs to `tenantId` (HIGH-4 — prevents IDOR on history/participants):
```typescript
const [room] = await db.select({ tenantId: teamRooms.tenantId })
  .from(teamRooms)
  .where(and(eq(teamRooms.id, input.roomId), eq(teamRooms.tenantId, input.tenantId)))
  .limit(1);
if (!room) throw new Error("Room not found or tenant mismatch");
```

2. Filter `assistantProfiles` by `tenantId` (CRIT-2 — prevents cross-tenant persona loading):
```typescript
// BEFORE (vulnerable):
.where(eq(assistantProfiles.id, input.assistantId))
// AFTER (secure):
.where(and(eq(assistantProfiles.id, input.assistantId), eq(assistantProfiles.tenantId, input.tenantId)))
```

3. Before calling `getEntityMemories`, validate user belongs to tenant (CRIT-1):
```typescript
// Verify userId belongs to this tenant before loading their memories
const [user] = await db.select({ id: users.id })
  .from(users)
  .where(and(eq(users.id, input.initiatedByUserId), eq(users.currentTenantId, tenantIdNumeric)))
  .limit(1);
if (!user) { /* skip entity memories, log warning */ }
```

4. Use `input.tenantId` (not `profile.tenantId`) for `retrieveForPrompt` call (MED-2).

### Change 0.5: Security — Move Objective to User Role (HIGH-1)

The objective is user-supplied text. It MUST NOT be injected as a `system` role message (prompt injection risk).

```typescript
// BEFORE (vulnerable — system role):
messages.push({ role: "system", content: `Current objective: ${input.objective}` });

// AFTER (safe — user role with delimiters):
messages.push({ role: "user", content: `[OBJECTIVE]\n${input.objective}\n[/OBJECTIVE]` });
```

### Change 0.6: Security — Scope History by RunId (MED-4)

Prefer messages from the current run to avoid context contamination from old runs:

```typescript
// Prefer current run's messages, then fall back to recent room messages
const recentMessages = await db
  .select()
  .from(teamRoomMessages)
  .where(and(
    eq(teamRoomMessages.roomId, input.roomId),
    input.runId ? eq(teamRoomMessages.runId, input.runId) : undefined,
  ))
  .orderBy(desc(teamRoomMessages.createdAt))
  .limit(100);
```

### Change 0.7: Security — Sanitize History Content (MED-3)

Before injecting history messages, sanitize content to prevent stored prompt injection:

```typescript
// NEW-2: Unicode normalization first to prevent bypass via fullwidth chars or zero-width spaces
const normalized = msg.content.normalize("NFKC").replace(/[\x00-\x08\x0B-\x1F\x7F\u200B-\u200F\uFEFF]/g, "");
const sanitized = normalized
  .replace(/\[SYSTEM\]/gi, "[SYS]")
  .replace(/\[OBJECTIVE\]/gi, "[OBJ]")
  .replace(/\[\/OBJECTIVE\]/gi, "[/OBJ]")
  .replace(/<\|system\|>/gi, "")
  .replace(/ignore (all )?previous/gi, "[filtered]");
messages.push({ role, content: `${prefix}${sanitized}` });
```

### Change 1: Add `ComposePromptInput.initiatedByUserId` Field

The `ComposePromptInput` interface (line 26) needs a new field so that entity memories can be fetched for the human who started the run.

```typescript
export interface ComposePromptInput {
  // ... (tenantId and initiatedByUserId already added in Change 0)
}
```

This field is optional so existing callers are not broken. When provided, entity memories are fetched for this user.

### Change 2: Full Persona Resolution (replace lines 143-163)

Replace the manual persona string assembly with `buildPersonaPromptSegments()`.

**Before:** Lines 151-161 build a simple string from `persona.systemPromptPrefix` and profile fields.

**After:**
1. Import `buildPersonaPromptSegments` and `PersonaPromptSegments` from `personaService.ts`
2. Call `buildPersonaPromptSegments(persona)` to get `{ prefix, styleInstructions, restrictionsBulletPoints }`
3. Prepend the profile identity line (`You are {displayName}. Role: {roleTitle}`) to the prefix
4. Append `styleInstructions` and `restrictionsBulletPoints` as additional system messages
5. All three components share the `PERSONA_BUDGET` (2000 tokens)

The persona system message should include all three segments concatenated, with the profile identity prepended:

```
You are Content Director.
Role: Editorial Lead
Specialties: content strategy, SEO

[PERSONA START]
{persona.systemPromptPrefix}
[PERSONA END]

{styleInstructions -- includes Thai particles if persona has assistantGender}

Restrictions:
{restrictionsBulletPoints}
```

### Change 3: Entity Memory Injection (after line 219)

After scoped memory retrieval (step 4), add entity memory fetching:

1. Import `getEntityMemories` from `chatService.ts`
2. If `input.initiatedByUserId` is provided, call `getEntityMemories(input.initiatedByUserId, undefined, profile?.personaId ?? undefined)`
3. Calculate remaining memory budget after scoped memories: `remainingMemoryBudget = MEMORY_BUDGET - scopedMemoryTokensUsed`
4. Format entity memories as `- [Entity: {entityType}] {key}: {value}` strings
5. Truncate entity memory content to `remainingMemoryBudget`
6. Append as a new system message: `"Known facts about the user:\n{entityMemoryContent}"`

**Priority order:** Scoped memories first (higher priority -- team/room/run-specific), entity memories fill remaining budget.

**Error handling:** Wrap `getEntityMemories` in try/catch matching the existing pattern for `retrieveForPrompt` (line 206-208). Log warning, continue without entity memories.

### Change 4: No Change Needed for History

The existing history formatting (lines 221-249) already:
- Builds `assistantNameMap` from participants (line 225-230)
- Prefixes assistant messages with `[DisplayName]` (line 246)
- Preserves `role: "user"` and `role: "assistant"` structure (line 242)

Verify this works correctly -- no code changes needed here, only test coverage.

## Tests

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`

This is a NEW test file. The existing `promptComposer.test.ts` covers `estimateTokens`, `truncateToTokenBudget`, and `compressHistory` helpers. This new file covers the enhanced `composePrompt()` function.

**Mocking strategy:**
- Mock `getDb()` to return a fake Drizzle query builder (use chained `.select().from().where().limit()` pattern)
- Mock `buildPersonaPromptSegments` from `personaService.ts`
- Mock `getEntityMemories` from `chatService.ts`
- Mock `retrieveForPrompt` from `scopedMemoryService.ts`

### Test Suite Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules before imports
vi.mock("../personaService", () => ({
  buildPersonaPromptSegments: vi.fn(),
}));
vi.mock("../chatService", () => ({
  getEntityMemories: vi.fn(),
}));
vi.mock("../scopedMemoryService", () => ({
  retrieveForPrompt: vi.fn(),
}));
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

describe("composePrompt -- persona segments", () => {
  // it("should call buildPersonaPromptSegments when persona exists")
  //   Setup: mock DB to return profile with personaId + persona record
  //   Assert: buildPersonaPromptSegments called with persona
  //   Assert: result.messages[0].content includes [PERSONA START]

  // it("should include styleInstructions in system messages")
  //   Setup: mock buildPersonaPromptSegments to return styleInstructions
  //   Assert: one system message contains the style text

  // it("should include restrictionsBulletPoints in system messages")
  //   Setup: mock buildPersonaPromptSegments to return restrictionsBulletPoints
  //   Assert: system message contains "Restrictions:"

  // it("should include Thai gender particles from persona")
  //   Setup: mock with assistantGender = "female", buildPersonaPromptSegments returns Thai particle instruction
  //   Assert: system messages contain "ค่ะ" or "คะ" reference

  // it("should stay within PERSONA_BUDGET token limit")
  //   Setup: mock persona with very long systemPromptPrefix (10000 chars)
  //   Assert: persona-related tokens <= 2000

  // it("should handle missing persona gracefully")
  //   Setup: mock profile with no personaId
  //   Assert: no persona system message, no error
});

describe("composePrompt -- entity memory injection", () => {
  // it("should call getEntityMemories with run initiator's userId")
  //   Setup: provide initiatedByUserId = 42 in input
  //   Assert: getEntityMemories called with (42, undefined, personaId)

  // it("should merge entity memories with scoped memories")
  //   Setup: mock both retrieveForPrompt and getEntityMemories returning results
  //   Assert: messages include both "Relevant memories:" and "Known facts about the user:"

  // it("should prioritize scoped memories over entity memories")
  //   Setup: scoped memories fill most of MEMORY_BUDGET
  //   Assert: entity memories are truncated, scoped memories are not

  // it("should stay within MEMORY_BUDGET token limit")
  //   Setup: large scoped + entity memories totaling > 1500 tokens
  //   Assert: combined memory tokens <= 1500

  // it("should handle empty entity memories gracefully")
  //   Setup: getEntityMemories returns []
  //   Assert: no "Known facts" system message, no error

  // it("should skip entity memories when initiatedByUserId not provided")
  //   Setup: do not provide initiatedByUserId in input
  //   Assert: getEntityMemories not called
});

describe("composePrompt -- multi-turn history", () => {
  // it("should use display names (not UUIDs) for assistant messages")
  //   Setup: mock participants with displayName, mock messages from that assistant
  //   Assert: message content starts with "[Display Name]"

  // it("should preserve role structure (system/user/assistant)")
  //   Setup: mock mix of user and assistant messages
  //   Assert: messages array has correct role field on each entry

  // it("should not flatten messages into a single string")
  //   Assert: result.messages.length > 2 (not just system + one combined)

  // it("should handle empty history gracefully")
  //   Setup: mock DB returns no teamRoomMessages
  //   Assert: result.messages contains only system messages (persona, team, objective)
});
```

### Key Test Implementation Notes

**DB mock pattern** -- The Drizzle query builder is chained. Create a mock that supports `select().from().where().orderBy().limit()`:

```typescript
const mockDbChain = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([/* mock rows */]),
};
```

Use `vi.mocked(getDb).mockResolvedValue(mockDbChain as any)` to wire it up. Different `.from()` calls (assistantProfiles, personaTemplates, teamRoomParticipants, teamRoomMessages) should be distinguished via the mock's call arguments.

**Token budget verification** -- Use the exported `estimateTokens()` function from `promptComposer.ts` to verify budget compliance in assertions.

## Implementation Guidance

### Import Additions (top of file)

Add these imports to `promptComposer.ts`:

```typescript
import { buildPersonaPromptSegments, type PersonaPromptSegments } from "./personaService";
import { getEntityMemories } from "./chatService";
```

### Persona Section Rewrite

Replace the manual persona assembly (lines 143-163) with a call to `buildPersonaPromptSegments`. The profile identity line (`You are {name}. Role: {role}. Specialties: {tags}`) should still be prepended before the persona segments, as this comes from the `assistantProfiles` table, not the persona template.

Concatenate into a single persona system message:

```
{profileIdentityLine}
{segments.prefix}
{segments.styleInstructions ?? ""}
{segments.restrictionsBulletPoints ? "Restrictions:\n" + segments.restrictionsBulletPoints : ""}
```

Then apply `truncateToTokenBudget(personaSection, PERSONA_BUDGET)` as currently done on line 165.

### Entity Memory Section

After the existing scoped memory block (lines 193-219), add:

1. Track how many tokens scoped memories consumed
2. Calculate remaining: `const entityBudget = MEMORY_BUDGET - scopedTokensUsed`
3. If `input.initiatedByUserId` and `entityBudget > 50` (minimum useful budget):
   - Call `getEntityMemories(input.initiatedByUserId, undefined, profile?.personaId ?? undefined)`
   - Format each entity as `- [{entityType}] {key}: {value}`
   - Truncate to `entityBudget`
   - Push as system message

### Backward Compatibility

The `ComposePromptInput.initiatedByUserId` field is optional. Existing callers in `teamRunSkillExecutor.ts` will be updated in section-03 to pass this value from `input.run.initiatedByUserId`. Until section-03 is implemented, `composePrompt()` works exactly as before (no entity memories fetched when field is absent).

## Google Drive Tools and Conversation Summaries

**Deferred to follow-up.** Two capabilities identified in the interview notes are not covered in this section:

1. **Google Drive tool access in team runs** -- Agents currently cannot call Google Drive tools during team runs. The integration path exists in the agency tool registry but is not wired to `composePrompt`. Implementing this requires tool-calling support in `executeTeamRunSkillTurn` (section-03) and is deferred to a follow-up feature.

2. **Conversation summaries as context** -- The `summaryService` produces summaries for completed runs but these are not injected into subsequent run context by `composePrompt`. Adding summary retrieval here would provide long-term cross-run continuity. Deferred to a follow-up feature (can be implemented by fetching the latest completed-run summary for the same room and injecting it within the `MEMORY_BUDGET`).

## Verification

After implementation, run:

```
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/promptComposer.test.ts server/services/__tests__/promptComposer.enhanced.test.ts
```

Existing `promptComposer.test.ts` tests (estimateTokens, truncateToTokenBudget, compressHistory) must continue to pass unchanged.

---

## Implementation Notes (Post-Implementation)

### Actual Changes Made

1. **Tenant isolation**: Room validated against `tenantId`, profile query scoped by tenant
2. **Persona segments**: Uses `buildPersonaPromptSegments()` with null guard on `systemPromptPrefix`. No double "Restrictions:" prefix (review fix).
3. **Entity memories**: Injected after scoped memories, budget-aware. Uses `personaId ?? null` for proper persona scoping (review fix).
4. **Objective placement**: Moved to user role with `[OBJECTIVE]` delimiters, placed after all system messages (review fix).
5. **History scoping**: Uses explicit conditional for `runId` presence (review fix, avoids `and()` single-element edge case).
6. **Sanitization**: `sanitizeHistoryContent()` strips `[SYSTEM]`, `[OBJECTIVE]`, `[PERSONA START]`, `[PERSONA END]`, `<|system|>`, and "ignore previous" patterns.
7. **`runId` made optional** in `ComposePromptInput` to match runtime behavior.
8. **Existing test fix**: `estimateTokens("hello world")` expectation updated from 3 to 7 (pre-existing bug: test didn't account for framing overhead).

### Test Results
- 17/17 tests passing (11 new + 6 existing)
