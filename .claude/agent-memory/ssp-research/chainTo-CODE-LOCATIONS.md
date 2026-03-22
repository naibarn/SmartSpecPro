# chainTo System — Exact Code Locations

## Data Flow with Line-by-Line References

### 1. YAML Frontmatter Definition

**File**: `apps/web/skills/image_prompt_engineer/skill.md`
**Lines**: 1-18

```yaml
---
id: image_prompt_engineer
name: Image Prompt Engineer
version: "2.1"
category: image_prompt_generation
execution_mode: enhance-prompt
chainTo: image-creator  # ← Line 9: Skill-level chain
isAutoTrigger: true
enabledByDefault: true
priority: 50
triggerPatterns:
  - "pattern1"
  - pattern: "pattern2"
    chainTo: override-skill  # ← Per-pattern override
    label: "Optional label"
---
```

### 2. Parser: Extract chainTo

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/parser.ts`

#### 2a. Parse File (Lines 14-28)
```typescript
export function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1], { schema: yaml.JSON_SCHEMA }) as SkillMetadata;
        // frontmatter now has .chainTo property from YAML
        const body = parts.slice(2).join("---").trim();
        return { metadata: frontmatter || {}, content: body };
      } catch {
        return { metadata: {} as SkillMetadata, content };
      }
    }
  }
  return { metadata: {} as SkillMetadata, content };
}
```

#### 2b. Parse Trigger Patterns with Per-Pattern chainTo (Lines 136-159)
```typescript
export function parseTriggerPatterns(patterns: Array<string | PatternRule> | null | undefined): TriggerRule[] {
  if (!patterns || !Array.isArray(patterns)) return [];
  return patterns
    .map((p): TriggerRule | null => {
      try {
        const patternStr = typeof p === "string" ? p : p.pattern;
        const chainTo = typeof p === "string" ? undefined : p.chainTo;  // ← Line 143
        const label = typeof p === "string" ? undefined : p.label;

        if (!patternStr || !isSafeRegex(patternStr)) return null;

        return {
          regex: new RegExp(patternStr, "i"),
          pattern: patternStr,
          chainTo: chainTo ?? undefined,  // ← Line 151: Store per-pattern chainTo
          label: label ?? undefined,
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is TriggerRule => r !== null);
}
```

#### 2c. Normalize Metadata (Lines 182-204)
```typescript
export function normalizeMetadata(raw: SkillMetadata, slug: string): {
  name: string;
  description: string;
  isAutoTrigger: boolean;
  triggerPatterns: string[];
  creditMultiplier: number;
  enabledByDefault: boolean;
  priority: number;
  executionMode: string;
  chainTo?: string;  // ← Line 191
} {
  return {
    name: raw.name || slug,
    description: raw.description || `Skill: ${slug}`,
    isAutoTrigger: raw.isAutoTrigger ?? raw.auto_trigger ?? false,
    triggerPatterns: raw.triggerPatterns ?? raw.trigger_patterns ?? [],
    creditMultiplier: raw.creditMultiplier ?? raw.credit_multiplier ?? 1.0,
    enabledByDefault: raw.enabledByDefault ?? raw.enabled_by_default ?? true,
    priority: raw.priority ?? 50,
    executionMode: (raw.executionMode ?? raw.execution_mode ?? "llm-only") as string,
    chainTo: (raw.chainTo ?? raw.chain_to ?? undefined) as string | undefined,  // ← Line 202: Support both camelCase and snake_case
  };
}
```

### 3. Types

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`

#### 3a. TriggerRule with Per-Pattern chainTo (Lines 26-35)
```typescript
export interface TriggerRule {
  /** The compiled regex pattern */
  regex: RegExp;
  /** Original pattern string for display/logging */
  pattern: string;
  /** Optional skill slug to chain to when this pattern matches */
  chainTo?: string | null;  // ← Line 32
  /** Optional label for admin UI display */
  label?: string;
}
```

#### 3b. PatternRule (Raw Database Format) (Lines 40-47)
```typescript
export interface PatternRule {
  /** Regex pattern string */
  pattern: string;
  /** Optional skill slug to chain to */
  chainTo?: string | null;  // ← Line 44
  /** Optional label for admin UI */
  label?: string;
}
```

#### 3c. SkillMetadata (Lines 133-170)
```typescript
export interface SkillMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  chainTo?: string;          // ← Line 139: camelCase
  chain_to?: string;         // ← Line 140: snake_case (YAML convention)
  icon?: string;
  tags?: string[];
  // ... rest of fields
}
```

#### 3d. SkillDefinition (Lines 49-128)
```typescript
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: SkillType;
  category?: string;

  /** Trigger rules (regex + optional per-pattern chainTo) */
  triggers: TriggerRule[];  // ← Line 58: Contains per-pattern chainTo

  /** Whether this skill requires explicit invocation */
  requiresExplicit: boolean;

  /** Credit cost multiplier */
  creditMultiplier: number;

  // ... other fields ...

  /** Chain to another skill after this skill completes (skill slug) */
  chainTo?: string;  // ← Line 124: Skill-level chain
}
```

#### 3e. SkillDetectionResult (Lines 172-180)
```typescript
export interface SkillDetectionResult {
  detected: boolean;
  skill: SkillDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
  /** chainTo target from the matched trigger pattern (per-pattern configuration) */
  patternChainTo?: string | null;  // ← Line 179: Per-pattern precedence
}
```

### 4. Database Schema

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

#### 4a. Skill Category Enum (Lines 2248-2268)
```typescript
export const skillCategoryEnum = pgEnum("skill_category", [
  "image_generation",
  "image_prompt_generation",
  "video_generation",
  "video_prompt_generation",
  // ... other categories
  "other",
]);
```

#### 4b. Skills Table Definition (Lines 2298-2450+)
```typescript
export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: skillCategoryEnum("category").notNull().default("other"),
  // ... other fields ...

  /** Regex patterns for auto-detection
   * Supports two formats:
   * 1. Legacy: string[] - array of pattern strings
   * 2. New: PatternRule[] - array of objects with pattern, chainTo, label
   * Both can be mixed in the same array for backward compatibility
   */
  triggerPatterns: json("triggerPatterns").$type<Array<string | {
    pattern: string;
    chainTo?: string | null;  // ← Per-pattern chain target
    label?: string;
  }>>().default([]),  // ← Lines 2337-2341

  // ... more fields ...

  /** Execution mode: llm-only (text response), media-generate (LLM→prompt→media API) */
  executionMode: varchar("executionMode", { length: 50 }).default("llm-only").notNull(),

  /** Chain to another skill after this skill completes (skill slug) */
  chainTo: varchar("chainTo", { length: 100 }),  // ← Line 2377: Skill-level chain
});
```

### 5. Skill Registry: Load & Sync

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`

#### 5a. Extract Chain Target (Lines 69-72)
```typescript
function getMetadataChainTarget(metadata: SkillMetadata): string | undefined {
  const chainTo = metadata.chainTo ?? metadata.chain_to;  // ← Support both formats
  return typeof chainTo === "string" && chainTo.trim() ? chainTo.trim() : undefined;
}
```

#### 5b. Convert DB Skill to SkillDefinition (Lines 77-164)
```typescript
function dbSkillToDefinition(dbSkill: {
  id: number;
  slug: string;
  name: string;
  // ... other fields ...
  executionMode: string | null;
  chainTo: string | null;  // ← Line 99: From DB
  // ... rest of fields ...
}): SkillDefinition {
  // ... conversions ...
  return {
    id: dbSkill.slug,
    name: dbSkill.name,
    // ... other mappings ...
    executionMode: (dbSkill.executionMode as any) || "llm-only",
    chainTo: dbSkill.chainTo || undefined,  // ← Line 157: Mapped to SkillDefinition
    // ... rest ...
  };
}
```

#### 5c. Insert Chain Target on Folder Sync (Line 317)
```typescript
// When inserting new skill from folder
const newSkill = {
  // ... other fields ...
  chainTo: getMetadataChainTarget(metadata) ?? null,  // ← Line 317
  // ...
};
```

#### 5d. Update Chain Target on Content Change (Line 359)
```typescript
// When updating existing skill (hash changed)
await db.update(skillsTable).set({
  // ... other updates ...
  ...(getMetadataChainTarget(metadata) !== undefined ? { chainTo: getMetadataChainTarget(metadata) } : {}),  // ← Line 359
}).where(eq(skillsTable.slug, folder.slug));
```

#### 5e. Sync Single Skill (Line 452)
```typescript
// When syncing single skill
const updateData = {
  // ... other fields ...
  ...(getMetadataChainTarget(metadata) !== undefined ? { chainTo: getMetadataChainTarget(metadata) } : {}),  // ← Line 452
};
```

### 6. Skill Detection

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillDetector.ts`

#### 6a. Detect Matched Pattern's chainTo (Lines 147-149)
```typescript
// When pattern matches
return {
  detected: true,
  skill,
  confidence,
  matchedTrigger: match[0],
  suggestedPrompt,
  // Include per-pattern chainTo if configured
  patternChainTo: trigger.chainTo ?? null,  // ← Lines 147-148: From matched TriggerRule
};
```

### 7. Chat Router: Expose to Client

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`

#### 7a. detectSkill Procedure (Lines 1087-1137)
```typescript
detectSkill: protectedProcedure
  .input(z.object({
    message: z.string(),
    conversationId: z.number().optional(),
  }))
  .query(async ({ ctx, input }) => {
    // ... detection logic ...

    if (!result.detected || !result.skill) {
      return {
        detected: false,
        skill: null,
        confidence: 0,
        matchedTrigger: null,
        suggestedPrompt: null,
        patternChainTo: null,  // ← Line 1110
        params: null,
      };
    }

    const params = extractSkillParams(input.message, result.skill);

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
        chainTo: result.skill.chainTo || null,  // ← Line 1128: Skill-level chain
      },
      confidence: result.confidence,
      matchedTrigger: result.matchedTrigger,
      suggestedPrompt: result.suggestedPrompt,
      // Per-pattern chainTo from matched trigger pattern (takes precedence)
      patternChainTo: result.patternChainTo || null,  // ← Lines 1133-1134: Pattern-level precedence
      params,
    };
  }),
```

#### 7b. executeSkill Procedure (Lines 1211-1600+)
- **Currently**: NO chainTo handling
- **Location**: Lines 1211-1600+ (procedure definition)
- **Missing**: No code checks chainTo after execution

### 8. Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/skillsParser.test.ts`

#### Test chainTo Normalization (Lines 15-29)
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
  expect(normalized.chainTo).toBe("image-creator");  // ← Line 27
  expect(normalized.executionMode).toBe("enhance-prompt");
});
```

### 9. Credit Deduction

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`

#### 9a. Deduct Credits Function (Lines 134-250)
```typescript
export async function deductCredits(params: DeductCreditsParams) {
  const { userId, amount, description, metadata, idempotencyKey, tenantId, skipBudgetCheck } = params;
  // ... validation ...
}

export interface DeductCreditsParams {
  userId: number;
  amount: number;
  description: string;
  tenantId?: string;
  idempotencyKey?: string;
  skipBudgetCheck?: boolean;
  conversationId?: number;
  skillSlug?: string;  // ← Can track which skill
  sourceType?: CreditSourceType;  // Can be "skill"
  metadata?: {
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    // ...
  };
}
```

---

## Summary Table

| Component | File | Lines | What It Does |
|-----------|------|-------|-------------|
| Parse YAML | parser.ts | 14-28 | Extract frontmatter including chainTo |
| Normalize | parser.ts | 182-204 | Support camelCase + snake_case |
| Parse patterns | parser.ts | 136-159 | Handle per-pattern chainTo in triggerPatterns |
| TriggerRule type | types.ts | 26-35 | Compiled regex with optional chainTo |
| PatternRule type | types.ts | 40-47 | Raw JSON pattern with optional chainTo |
| SkillDefinition | types.ts | 49-128 | Complete skill model with skill-level chainTo (line 124) + triggers array |
| SkillDetectionResult | types.ts | 172-180 | Detection result with patternChainTo (line 179) |
| DB schema | schema.ts | 2377, 2337-2341 | chainTo column + triggerPatterns JSON column |
| Extract target | skillRegistry.ts | 69-72 | Get chainTo from metadata |
| Insert new skill | skillRegistry.ts | 317 | Store chainTo when creating skill |
| Update skill | skillRegistry.ts | 359 | Update chainTo when skill content changes |
| Sync skill | skillRegistry.ts | 452 | Sync chainTo during single-skill refresh |
| Detect pattern | skillDetector.ts | 147-148 | Extract patternChainTo from matched trigger |
| Expose to client | chat.ts | 1128, 1134 | Return both chainTo values in API response |
| Test normalization | skillsParser.test.ts | 15-29 | Verify chainTo parsing |

---

## Implementation Checklist

If implementing automatic chaining:

- [ ] Read chainTo/patternChainTo in executeSkill() (chat.ts:1211)
- [ ] After skill execution, check if chainTo exists
- [ ] Extract output field(s) from first skill's result
- [ ] Validate target skill exists (skillRegistry)
- [ ] Invoke executeSkill() with extracted output as input
- [ ] Aggregate results (both skills' outputs)
- [ ] Deduct credits for both skills
- [ ] Add depth limit (max 3 hops to prevent loops)
- [ ] Add conversation setting: autoChainSkills boolean
- [ ] UI: Show chaining progress
- [ ] UI: Display results from both skills

