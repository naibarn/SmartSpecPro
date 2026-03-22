# chainTo Skill Chaining System — Complete Research

**Date**: 2026-03-11
**Status**: RESEARCH COMPLETE
**Key Finding**: Two-level chainTo architecture (skill-level + pattern-level), currently only exposing metadata, no automatic execution yet

---

## Overview

The `chainTo` system enables **sequential skill execution** where one skill's output can automatically trigger another skill. Currently implemented as metadata propagation with no automatic execution in the base system.

### Known Implementations
- **Image Prompt Engineer** → chains to **image-creator**
- **Video Prompt Engineer** → chains to **video-creator**

---

## Architecture

### Two-Level Chain Configuration

#### Level 1: Skill-Level Chain (Global)
Applied to all invocations of a skill.

**Definition**: `skill.md` frontmatter
```yaml
---
name: Image Prompt Engineer
chainTo: image-creator  # Skill slug to chain to
---
```

**Storage**: `skills` table, `chainTo` column (varchar 100)
- Type: `varchar("chainTo", { length: 100 })`
- Location: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:2377`
- Nullable: Yes (optional chaining)

#### Level 2: Pattern-Level Chain (Per-Trigger)
Applied to individual trigger patterns.

**Definition**: `triggerPatterns` in skill.md (new JSON format)
```yaml
triggerPatterns:
  - pattern: "create image"
    chainTo: image-creator
    label: "Generate prompt then image"  # Optional UI label
```

**Storage**: `skills` table, `triggerPatterns` column (JSON array)
- Type: `json("triggerPatterns").$type<Array<string | { pattern: string; chainTo?: string | null; label?: string; }>>()`
- Location: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts:2337-2341`
- Format: Supports backward compatibility (legacy string array + new PatternRule objects mixed)

---

## Data Flow

### 1. Skill Definition (skill.md YAML)

**Input**: `apps/web/skills/{skill-slug}/skill.md`
```yaml
---
name: Video Prompt Engineer
category: video_prompt_generation
execution_mode: llm-only
chainTo: video-creator  # Skill-level chain
triggerPatterns:
  - "create video prompt"
  - pattern: "generate.*video.*prompt"
    chainTo: special-video-creator  # Override per-pattern
    label: "Professional"
---

# Skill content...
```

**Parsing**: `normalizeMetadata()` (parser.ts:182-204)
- **File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/parser.ts`
- **Lines**: 182-204
- **Function**: Normalizes both snake_case (`chain_to`) and camelCase (`chainTo`)
- **Returns**: `{ chainTo?: string }`

```typescript
export function normalizeMetadata(raw: SkillMetadata, slug: string): {
  // ... other fields
  chainTo?: string;
} {
  return {
    // ...
    chainTo: (raw.chainTo ?? raw.chain_to ?? undefined) as string | undefined,
  };
}
```

### 2. Trigger Pattern Parsing

**Function**: `parseTriggerPatterns()` (parser.ts:136-159)
- **File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/parser.ts`
- **Lines**: 136-159
- **Supports**:
  - Legacy format: `string[]` (backward compatible)
  - New format: `PatternRule[]` with per-pattern `chainTo`
  - Mixed: Both formats in same array

**Returns**: `TriggerRule[]` with compiled regex + optional chainTo

```typescript
export function parseTriggerPatterns(patterns: Array<string | PatternRule> | null): TriggerRule[] {
  // Parses each pattern (string or PatternRule object)
  // Returns:
  return {
    regex: new RegExp(patternStr, "i"),
    pattern: patternStr,
    chainTo: chainTo ?? undefined,  // Per-pattern chainTo (if provided)
    label: label ?? undefined,
  }
}
```

### 3. Skill Registry (Database)

**Function**: Auto-sync from folder to database (`autoSyncSkillsFromFolder()`)
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`
- **Lines**: 255-500+

**Chain field extraction**:
```typescript
// Line 69-72
function getMetadataChainTarget(metadata: SkillMetadata): string | undefined {
  const chainTo = metadata.chainTo ?? metadata.chain_to;
  return typeof chainTo === "string" && chainTo.trim() ? chainTo.trim() : undefined;
}
```

**Insertion into DB** (lines 317, 359, 452):
```typescript
// Line 317 (new skill insert)
chainTo: getMetadataChainTarget(metadata) ?? null,

// Line 359 (existing skill update)
...(getMetadataChainTarget(metadata) !== undefined ? { chainTo: getMetadataChainTarget(metadata) } : {}),
```

**Database Result**: SkillDefinition with chainTo field
```typescript
return {
  // ... skill metadata
  chainTo: dbSkill.chainTo || undefined,  // Line 157
};
```

### 4. Detection & Skill Lookup

**Function**: `detectSkill()` (skillDetector.ts)
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillDetector.ts`
- **Lines**: 130-155

**Detection result includes per-pattern chainTo**:
```typescript
// Line 148
patternChainTo: trigger.chainTo ?? null,  // From matched trigger's per-pattern config

return {
  detected: true,
  skill,
  // ...
  patternChainTo: trigger.chainTo ?? null,  // Precedence over skill-level
};
```

### 5. Chat Router Exposure

**Endpoint**: `chat.detectSkill` tRPC procedure
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`
- **Lines**: 1087-1137

**Returns both chains to client**:
```typescript
// Line 1128
chainTo: result.skill.chainTo || null,  // Skill-level chain

// Line 1134
patternChainTo: result.patternChainTo || null,  // Per-pattern chain (takes precedence)
```

**Full return signature** (lines 1118-1136):
```typescript
return {
  detected: true,
  skill: {
    id: result.skill.id,
    name: result.skill.name,
    type: result.skill.type,
    models: result.skill.models || [],
    defaultModel: result.skill.defaultModel,
    creditMultiplier: result.skill.creditMultiplier,
    executionMode: result.skill.executionMode || "llm-only",
    chainTo: result.skill.chainTo || null,  // Metadata only (not auto-triggered)
  },
  confidence: result.confidence,
  matchedTrigger: result.matchedTrigger,
  suggestedPrompt: result.suggestedPrompt,
  patternChainTo: result.patternChainTo || null,  // Per-pattern precedence
  params,
};
```

### 6. Skill Execution

**Function**: `executeSkill()` tRPC procedure
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`
- **Lines**: 1211-1600+

**Current Status**:
- ❌ **NOT automatically triggered** — No code to auto-execute chainTo skill
- ✅ **Metadata exposed** — chainTo available in skill definition
- ⚠️ **Client responsibility** — Client must manually execute chained skill if desired

**Credit Deduction** (during skill execution):
- **Function**: `deductCredits()`
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`
- **Lines**: 134-250
- **Params**: Can specify `skillSlug` for tracking
- **No special handling for chainTo** — Each skill execution is independent

---

## Type Definitions

### SkillMetadata (parser types)
**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts:133-170`

```typescript
export interface SkillMetadata {
  name: string;
  // ...
  chainTo?: string;           // Support camelCase
  chain_to?: string;          // Support snake_case (YAML convention)
  // ...
}
```

### TriggerRule (with per-pattern chainTo)
**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts:26-35`

```typescript
export interface TriggerRule {
  regex: RegExp;
  pattern: string;
  chainTo?: string | null;    // Per-pattern chain target
  label?: string;             // Optional UI label for this pattern
}
```

### PatternRule (raw database format)
**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts:40-47`

```typescript
export interface PatternRule {
  pattern: string;
  chainTo?: string | null;    // Per-pattern chain target
  label?: string;
}
```

### SkillDefinition (complete skill model)
**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts:49-128`

```typescript
export interface SkillDefinition {
  // ... other fields
  triggers: TriggerRule[];        // Array with per-pattern chainTo
  chainTo?: string;               // Skill-level chain target (Line 124)
  // ...
}
```

### SkillDetectionResult (detection output)
**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts:172-180`

```typescript
export interface SkillDetectionResult {
  detected: boolean;
  skill: SkillDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
  patternChainTo?: string | null;  // From matched pattern (Line 179)
}
```

---

## Existing Skills Using chainTo

### 1. Image Prompt Engineer
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/image_prompt_engineer/skill.md:1-18`
- **Category**: `image_prompt_generation`
- **Execution Mode**: `enhance-prompt`
- **Chain To**: `image-creator`
- **Purpose**: Generate optimized image prompts, then pass to image generator

### 2. Video Prompt Engineer
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/video-prompt-engineer/skill.md:1-20`
- **Category**: `video_prompt_generation`
- **Execution Mode**: `llm-only`
- **Chain To**: `video-creator`
- **Purpose**: Generate cinematic video prompts, then pass to video generator

---

## Credit System Integration

### Credit Deduction Parameters

**Source Type**: "skill" (line 17 of creditService.ts)

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | /* ... other types */
```

### Deduction Context

**Tracked Fields** (DeductCreditsParams):
```typescript
export interface DeductCreditsParams {
  userId: number;
  amount: number;
  description: string;
  skillSlug?: string;           // Track which skill
  conversationId?: number;      // Track conversation
  sourceType?: CreditSourceType; // Always "skill" for skill execution
  metadata?: {
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    traceId?: string;
    // ... other contextual data
  };
}
```

### No Automatic Deduction for Chain
- Each skill execution is **independent**
- No aggregated billing for chained skills
- Each skill costs separately
- **Implication**: Executing image-prompt-engineer (1 credit) + image-creator (5 credits) = 6 credits total

---

## Test Coverage

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/skillsParser.test.ts:15-29`

Test case for chainTo normalization:
```typescript
it("normalizes chainTo from frontmatter metadata", () => {
  const parsed = parseSkillFile(`---
name: Demo
description: Demo skill
category: image_prompt_generation
execution_mode: enhance-prompt
chainTo: image-creator
---
# Demo`);

  const normalized = normalizeMetadata(parsed.metadata, "demo");
  expect(normalized.chainTo).toBe("image-creator");
  expect(normalized.executionMode).toBe("enhance-prompt");
});
```

---

## Key Implementation Gaps

### 1. No Automatic Execution
- **Status**: Metadata only exposed
- **Client**: Must manually detect chainTo and execute next skill
- **Where**: `executeSkill()` procedure (chat.ts:1211) has no chainTo handling

### 2. No Output Passthrough
- **Status**: Each skill execution is isolated
- **Gap**: No mechanism to pass first skill's output to second skill
- **Would need**:
  - Result capture from executeSkill
  - Automatic extraction of relevant output field
  - Re-invocation with output as input to chained skill

### 3. No Chain Validation
- **Status**: Any string accepted as chainTo value
- **Gap**: No runtime check that target skill exists
- **Would need**: Validation against loaded skill registry

### 4. No Conditional Chaining
- **Status**: Simple hardcoded slug reference
- **Gap**: No support for conditional chains or branching
- **Example**: "If output quality > threshold, chain to enhance-v2, else chain to enhance-v1"

### 5. No User Confirmation
- **Status**: Auto-trigger is silent
- **Gap**: No UX to confirm before chaining
- **Would need**: "Chain to video-creator?" prompt or opt-in setting

---

## Precedence Rules

When both skill-level and pattern-level chains exist:
1. **Per-pattern chainTo** (from matched trigger) takes **absolute precedence**
2. **Skill-level chainTo** is fallback if no pattern override
3. **No chain** if both undefined/null

From skillDetector.ts line 148 and chat.ts line 1134, both values are exposed to client, allowing client to decide precedence.

---

## Summary

| Aspect | Status | Details |
|--------|--------|---------|
| **Definition** | ✅ Implemented | YAML frontmatter: `chainTo: skill-slug` |
| **Parsing** | ✅ Implemented | parser.ts `normalizeMetadata()` |
| **Pattern-level** | ✅ Implemented | triggerPatterns JSON array with per-pattern `chainTo` |
| **Registry** | ✅ Implemented | Database column + auto-sync |
| **Detection** | ✅ Implemented | Exposed in skill detection result |
| **Metadata Exposure** | ✅ Implemented | Chat router returns both chainTo values |
| **Automatic Execution** | ❌ NOT Implemented | No auto-trigger of chained skill |
| **Output Passthrough** | ❌ NOT Implemented | No output capture/reuse |
| **Validation** | ❌ NOT Implemented | No runtime existence check |
| **Credit Tracking** | ✅ Partial | Independent deduction per skill |

