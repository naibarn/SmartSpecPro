---
name: Agency Trigger System Schema and Auto-Generation
description: Storage schema for agency triggers, TriggerRule format, detection mechanism, and auto-generation strategy from agency metadata
type: reference
---

# Agency Trigger System — Schema, Detection, and Auto-Generation

**Date**: 2026-03-23
**Status**: RESEARCH COMPLETE
**Relevance**: Feature integration for inline agency detection in chat and skills engine

---

## Executive Summary

Agencies can be detected from user messages using trigger rules (regex patterns), similar to the skills detection system. However:

1. **Current agencies table (lines 4580-4624 in schema.ts)**: NO `triggers` or `triggerPhrases` column exists
2. **TriggerRule type exists** (packages/skills/src/types.ts lines 26-35): Format is `{ regex: RegExp; pattern: string; chainTo?: string; label?: string }`
3. **AgencyTriggerDefinition type exists** (packages/skills/src/types.ts lines 322-333): Full agency metadata with triggers array
4. **detectAgencyFromList() function exists** (packages/skills/src/detector.ts lines 214-248): Matches triggers to user messages
5. **AI Creator generates agency name + description** (python-backend/app/tasks/agency_creator_task.py lines 637-724): LLM outputs agency spec with name and description fields
6. **Skills already use trigger patterns** (apps/web/skills/*/skill.md): `triggerPatterns` array in frontmatter with regex strings

**Key Finding**: Trigger auto-generation is NOT currently implemented. The infrastructure is in place but agencies need a storage table for triggers, and the saveBuilder procedure needs to call an auto-generation function when name/description change.

---

## Current Schema — agencies table

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` lines 4580-4624

### Current Columns

```typescript
export const agencies = pgTable("agencies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  sourceTemplateId: varchar("sourceTemplateId", { length: 36 }),
  slug: varchar("slug", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt"),
  creditMultiplier: numeric("creditMultiplier", ...),
  creatorFeeCredits: integer("creatorFeeCredits"),
  platformSharePct: integer("platformSharePct"),
  defaultModel: varchar("defaultModel", { length: 100 }),
  maxAgents: integer("maxAgents"),
  maxRunTimeSeconds: integer("maxRunTimeSeconds"),
  status: varchar("status", { length: 20 }).default("draft"),
  isFallbackSafe: boolean("isFallbackSafe"),
  isPublished: boolean("isPublished"),
  visibility: varchar("visibility", { length: 20 }),
  previewSvg: text("previewSvg"),
  requestedPublishAt: timestamp("requestedPublishAt"),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  sharedInstructions: text("sharedInstructions"),
  userContext: jsonb("userContext"),
  conversationStarters: jsonb("conversationStarters"),
  topology: varchar("topology", { length: 30 }),
  cacheConversationStarters: boolean("cacheConversationStarters"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});
```

### MISSING Column

**`triggerPhrases` (JSONB, nullable)** — Should store compiled trigger rules
- Type: JSONB array of PatternRule objects
- Example: `[{ pattern: "create.*agency", chainTo: null }, { pattern: "setup.*agent.*system" }]`
- Optional: Agencies without triggers won't auto-detect in chat
- Auto-populated: Set by trigger auto-generation function when name/description change

---

## TriggerRule and PatternRule Types

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts` lines 26-50

### TriggerRule (runtime, with compiled regex)
```typescript
export interface TriggerRule {
  /** The compiled regex pattern */
  regex: RegExp;
  /** Original pattern string for display/logging */
  pattern: string;
  /** Optional skill slug to chain to when this pattern matches */
  chainTo?: string | null;
  /** Optional label for admin UI display */
  label?: string;
}
```

### PatternRule (storage format, JSON-serializable)
```typescript
export interface PatternRule {
  /** Regex pattern string */
  pattern: string;
  /** Optional skill slug to chain to */
  chainTo?: string | null;
  /** Optional label for admin UI */
  label?: string;
}
```

### AgencyTriggerDefinition (for detection)
```typescript
export interface AgencyTriggerDefinition {
  /** Agency ID (UUID) */
  agencyId: string;
  /** Agency display name */
  name: string;
  /** Agency description */
  description: string;
  /** Trigger rules (same format as skill triggers) */
  triggers: TriggerRule[];
  /** Priority for detection ordering */
  priority: number;
}
```

### AgencyDetectionResult (detection output)
```typescript
export interface AgencyDetectionResult {
  detected: boolean;
  agency: AgencyTriggerDefinition | null;
  confidence: number;
  matchedTrigger: string | null;
  suggestedPrompt: string | null;
}
```

---

## Detection Mechanism

**File**: `/home/dev/projects/SmartSpecPro/packages/skills/src/detector.ts` lines 214-248

### How detectAgencyFromList() Works

```typescript
export function detectAgencyFromList(
  message: string,
  agencies: AgencyTriggerDefinition[]
): AgencyDetectionResult {
  // 1. Sort agencies by priority (higher first)
  const sorted = [...agencies].sort((a, b) => b.priority - a.priority);

  // 2. For each agency, test all triggers
  for (const agency of sorted) {
    for (const trigger of agency.triggers) {
      const match = message.match(trigger.regex);
      if (match) {
        // 3. Calculate confidence and extract suggested prompt
        const confidence = calculateAgencyConfidence(message, match[0]);
        const suggestedPrompt = extractPrompt(message, match[0]);

        return {
          detected: true,
          agency,
          confidence,
          matchedTrigger: match[0],
          suggestedPrompt,
        };
      }
    }
  }
  return { detected: false, agency: null, confidence: 0, ... };
}
```

### Key Points

- **Priority-based**: Higher priority agencies matched first
- **First match wins**: Returns immediately on first trigger match (not all-matches)
- **Confidence calculation**: Based on match position (early = higher confidence) and word boundaries
- **Message extraction**: `extractPrompt()` removes the trigger phrase and returns the remaining user input
- **No agency triggers stored in DB yet**: Currently only skills have triggers in `skills.triggers` JSONB column

---

## Skill Trigger Patterns (Reference)

**File**: `apps/web/skills/*/skill.md` frontmatter

Skills use `triggerPatterns` array in YAML frontmatter. Each pattern is a regex string:

### Example: Image Creator (line 14-18 in image-creator/skill.md)
```yaml
triggerPatterns:
  - "สร้างภาพ|สร้างรูป|สร้างรูปภาพ|สร้างภาพถ่าย|ทำภาพ|วาดภาพ|วาดรูป"
  - "generate image|generate an image|create image|create an image"
  - "make image|make an image|generate picture|create picture|draw image"
  - "gen image|img gen|create photo|generate photo"
```

### Example: Video Creator (line 14-17 in video-creator/skill.md)
```yaml
triggerPatterns:
  - "สร้างวีดีโอ|สร้างวิดีโอ|สร้างคลิป|ทำวีดีโอ|ทำวิดีโอ|ทำคลิป"
  - "generate video|generate a video|create video|create a video"
  - "gen video|vid gen"
```

**Pattern format**:
- Pipe-delimited alternatives: `word1|word2|word3`
- Case-insensitive (matches are lowercased in detector.ts)
- Thai and English language support
- No explicit anchors needed (detector adds word boundary matching)

---

## AI Creator Output (Agency Metadata)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/agency_creator_task.py` lines 637-724

### AI Creator Design Phase Output

The LLM generates an agency spec with these fields:

```json
{
  "name": "Agency Name",
  "description": "What this agency does — 1-2 sentences describing its purpose",
  "nodes": [
    {
      "id": "node-1",
      "nodeType": "agent",
      "name": "Agent Name",
      "description": "What this agent does",
      "instructions": "Detailed instructions for this agent",
      "model": "gpt-4o",
      "isEntryPoint": true,
      "toolIds": [],
      "nodeConfig": {}
    }
  ],
  "edges": [],
  "rationale": "Brief explanation of the design decisions"
}
```

**Key fields for trigger generation**:
- `name` — Used to generate primary triggers
- `description` — Used to extract keywords for secondary triggers
- `nodes[].instructions` — Could extract domain-specific keywords for tertiary triggers
- `nodes[].description` — Agent role descriptions for context

---

## saveBuilder Procedure Flow

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` lines 1049-1552

### Current Save Flow

1. **Input validation** (lines 1050-1331): Zod schema validates all agents, nodes, edges
2. **Tenant + ownership check** (lines 1334-1360): Verify agency belongs to user
3. **Database transaction** (lines 1382-1549):
   - Update agencies table: `name`, `description`, `systemPrompt`, `defaultModel`, etc. (lines 1392-1405)
   - Handle shared tools (lines 1407-1418)
   - Delete/re-insert agents (lines 1425-1477)
   - Delete/re-insert communication flows (lines 1479-1499)
   - Save version snapshot (lines 1501-1534)
   - Generate and save SVG preview (lines 1536-1548)

### WHERE Trigger Auto-Generation Should Be Injected

**Location**: After line 1405, inside the transaction, right before agent deletion:

```typescript
// Update agency metadata
const setValues: Record<string, any> = {};
if (input.name !== undefined) setValues.name = input.name;
if (input.description !== undefined) setValues.description = input.description;
// ... other fields ...
if (Object.keys(setValues).length > 0) {
  await tx.update(agencies).set(setValues).where(eq(agencies.id, input.id));
}

// ← AUTO-GENERATE TRIGGERS HERE (new code)
// if (input.name or input.description changed) {
//   const triggers = await generateAgencyTriggers(
//     input.name,
//     input.description,
//     input.agents // for additional context
//   );
//   setValues.triggerPhrases = triggers;
//   await tx.update(agencies).set({ triggerPhrases: triggers }).where(...);
// }

// Handle shared tools
if (input.sharedToolIds !== undefined) { ... }
```

---

## Recommended Trigger Auto-Generation Strategy

### Approach: LLM-Driven + Keyword Fallback

**Trigger generation happens in TWO scenarios**:
1. **AI Creator completion** (python-backend): Generate triggers as part of final spec (already has LLM in context)
2. **saveBuilder procedure** (Node.js): Generate triggers when name/description manually changed

### Generation Algorithm

```typescript
async function generateAgencyTriggers(
  name: string,
  description: string,
  agents: AgentInput[],
  context?: { model?: string; tenantId?: string }
): Promise<PatternRule[]> {

  // Strategy 1: Extract keywords from name/description
  const keywords = extractKeywords(name, description);
  const patterns = generatePatternRules(keywords);

  // Strategy 2: LLM generation (if enabled for this tenant)
  // - Call LLM with agency name/description
  // - Get back 5-10 suggested trigger phrases
  // - Convert to regex patterns

  // Return highest-confidence patterns, capped at 10
  return patterns.slice(0, 10);
}

function extractKeywords(name: string, description: string): string[] {
  // 1. Extract compound noun phrases from name (e.g., "Content Creator" → "content", "creator")
  // 2. Extract main verbs/nouns from description (first 10 words)
  // 3. Exclude generic words (a, the, system, agency, platform, etc.)
  // 4. Return as lowercase array for pattern generation
}

function generatePatternRules(keywords: string[]): PatternRule[] {
  // Generate patterns with increasing specificity:
  // Pattern 1 (primary): keyword1|keyword2|keyword3 (most specific)
  // Pattern 2 (secondary): verb + keyword (e.g., "create content", "generate report")
  // Pattern 3 (tertiary): variations and synonyms

  // Return array of PatternRule objects ready to store in JSON
}
```

### Example: "Content Writer" Agency

**Name**: "Content Writer"
**Description**: "Generates engaging blog posts, social media content, and marketing copy"

**Generated triggers** (keyword extraction):
1. `"content|writer|blog|marketing|copy|social|media"` (from name + description keywords)
2. `"create.*content|generate.*post|write.*blog|write.*marketing"` (verb + keyword)
3. `"content.*generator|blog.*writer|marketing.*copy"` (synonym patterns)
4. `"writing.*assistant|article.*creation"` (role-based patterns)

Stored in DB as:
```json
[
  { "pattern": "content|writer|blog|marketing|copy|social|media", "chainTo": null },
  { "pattern": "create.*content|generate.*post|write.*blog", "chainTo": null },
  { "pattern": "content.*generator|blog.*writer", "chainTo": null }
]
```

### Implementation Effort

| Component | Effort | Notes |
|-----------|--------|-------|
| Add `triggerPhrases` column to agencies | 2-3h | Drizzle schema + migration + backup |
| Implement keyword extraction function | 3-4h | NLP tokenization, stop word filtering |
| Implement pattern generation function | 2-3h | Template-based regex generation |
| LLM-driven generation (optional) | 4-6h | Call LLM for better patterns, add prompt |
| Update saveBuilder to call auto-gen | 1-2h | Add call in transaction, handle errors |
| Update AI Creator design phase | 3-4h | Add trigger generation to design output |
| Test + integration | 4-6h | Unit tests, E2E tests, manual validation |
| **TOTAL** | **20-28 hours** | Core implementation with testing |

---

## Database Migration Plan

### Required Schema Change

Add new JSONB column to agencies table:

```sql
ALTER TABLE agencies ADD COLUMN "triggerPhrases" jsonb DEFAULT NULL;
```

**Drizzle schema change** (apps/web/drizzle/schema.ts line ~4615):
```typescript
triggerPhrases: jsonb("triggerPhrases").$type<PatternRule[]>().default(sql`NULL`),
```

Run: `cd apps/web && pnpm db:push` (auto-generates and applies migration)

### Backward Compatibility

- Existing agencies get NULL triggers (won't auto-detect)
- Only auto-generated agencies (or manually edited ones) get populated triggers
- Detection code: `triggers ?? []` (empty array if null)

---

## Integration Points

### 1. Chat Message Detection (inline agency suggestion)

**Location**: `apps/web/client/src/components/chat/ChatView.tsx`
- After user sends message, call `detectAgencyFromList(message, agencies)`
- If detected with confidence > 0.7, show inline suggestion card
- Pattern: Reuse from "Browser Session Suggestion" UI (reference in CHAT-INFRASTRUCTURE research)

### 2. Skills Engine Enhancement

**Location**: `packages/skills/src/detector.ts`
- Parallel call to `detectSkillFromList()` and `detectAgencyFromList()`
- If both match, show disambiguation UI: "Use [Skill]?" vs "Run [Agency]?"
- Agency wins on exact name match (confidence > 0.8)

### 3. Agency List Endpoint

**Location**: `apps/web/server/routers/agency.ts` line ~140-189 (listTools endpoint)
- New endpoint: `agency.listWithTriggers()`
- Returns: `{ agencies: { id, name, description, triggers }[] }`
- Used by frontend to populate detection cache

### 4. AI Creator Integration

**Location**: `python-backend/app/tasks/agency_creator_task.py`
- Phase 10 (DOCUMENT): Add trigger generation after design spec validated
- Call `generateAgencyTriggers(spec.name, spec.description)`
- Include suggested triggers in status output for frontend preview

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Incorrect trigger generation (false positives) | MEDIUM | Start with keyword-only, test with real agency names |
| Triggers match unrelated messages | MEDIUM | Manual override UI in Agency Builder; min confidence threshold |
| Performance impact (regex compilation per request) | LOW | Cache compiled regexes in memory (Redis optional) |
| LLM-generated triggers ineffective | MEDIUM | Fallback to keyword extraction; don't depend on LLM |
| Schema migration fails on large agencies table | LOW | Follow DB Safety Protocol; backup before migration |

---

## Open Questions

1. **Should triggers be user-editable in Agency Builder UI?**
   - Current plan: Auto-generated, read-only display
   - Alternative: Allow manual editing with preview

2. **Should there be a priority field per agency for detection ordering?**
   - Current plan: Use generic priority (1-100), higher wins
   - Alternative: Dynamic priority based on usage/popularity

3. **How frequently should triggers be regenerated?**
   - Current plan: Only on name/description change
   - Alternative: Periodic refresh every 30 days

4. **Should agencies have trigger analytics?**
   - Track how many times each trigger matched in chat
   - Use for auto-refinement of patterns

---

## Files to Read for Implementation

1. **Schema**: `apps/web/drizzle/schema.ts` lines 4580-4624
2. **Types**: `packages/skills/src/types.ts` lines 26-50, 322-333
3. **Detection**: `packages/skills/src/detector.ts` lines 214-248
4. **saveBuilder**: `apps/web/server/routers/agency.ts` lines 1049-1552
5. **AI Creator Design**: `python-backend/app/tasks/agency_creator_task.py` lines 637-724
6. **Skill Patterns**: `apps/web/skills/image-creator/skill.md` lines 14-18

---

## Summary

Agency trigger auto-generation is feasible and recommended:
- Infrastructure exists (TriggerRule types, detectAgencyFromList function, skill detection reference)
- Keyword-based generation is low-risk fallback; LLM-driven is enhancement
- Integration point is clear (saveBuilder + AI Creator design phase)
- ~20-28 hours total effort with testing
- Primary blocker: Add `triggerPhrases` JSONB column to agencies table
