# chainTo System — Quick Reference

## What Is chainTo?

A metadata system allowing one skill to declare "chain to" another skill after execution. Currently **metadata-only** (not auto-executed).

## Example Usage

### Image Prompt Engineer → Image Creator
```yaml
# apps/web/skills/image_prompt_engineer/skill.md
---
name: Image Prompt Engineer
chainTo: image-creator  # Chains to image-creator skill
triggerPatterns:
  - pattern: "create image prompt"
    chainTo: image-creator-pro  # Per-pattern override
---
```

## Data Flow (One-Line Summary)

Skill.md `chainTo` → Parser normalizes → Registry stores in DB → Detection exposes to chat router → Client sees both `chainTo` + `patternChainTo` in response

## Key Files (By Task)

| Task | File | Lines |
|------|------|-------|
| Add chainTo to new skill | `skills/my-skill/skill.md` | Add to frontmatter: `chainTo: target-slug` |
| Parse chainTo | `packages/skills/src/parser.ts` | 182-204 (normalizeMetadata) |
| Find in database | `apps/web/drizzle/schema.ts` | 2377 (skills.chainTo column) |
| Get detected chains | `apps/web/server/routers/chat.ts` | 1128, 1134 |
| Test parsing | `apps/web/server/__tests__/skillsParser.test.ts` | 15-29 |

## Two Levels of Chaining

### 1. Skill-Level (Global)
```yaml
chainTo: image-creator
```
Applies to ALL invocations of this skill.

### 2. Pattern-Level (Per-Trigger)
```yaml
triggerPatterns:
  - pattern: "create.*prompt"
    chainTo: image-creator  # Override for this pattern
```
Takes precedence if matched.

## What Works

✅ Define chainTo in YAML
✅ Parse to SkillMetadata
✅ Store in database
✅ Detect matched pattern's chainTo
✅ Expose to client via tRPC
✅ Credit tracking per skill

## What's Missing

❌ Auto-execution of chained skill
❌ Output passthrough (prompt → image generation)
❌ Loop detection
❌ User confirmation prompt

## Type Hierarchy

```
skill.md YAML
    ↓
parseSkillFile() → SkillMetadata { chainTo, trigger_patterns }
    ↓
normalizeMetadata() → normalized { chainTo, triggerPatterns }
    ↓
SkillDefinition { chainTo, triggers: TriggerRule[] }
    ↓
SkillDetectionResult { skill.chainTo, patternChainTo }
    ↓
chat.detectSkill() response
{
  skill: { chainTo: "image-creator" },
  patternChainTo: "image-creator-pro"  // precedence
}
```

## Database Schema

```sql
CREATE TABLE skills (
  -- ...other columns...
  chainTo varchar(100),  -- Optional chain target (line 2377)
  triggerPatterns json,  -- Array of strings or PatternRule objects (line 2337)
  -- ...
);

-- PatternRule format:
{
  "pattern": "regex string",
  "chainTo": "skill-slug",  // Optional override
  "label": "UI label"       // Optional
}
```

## Current Implementations

| Skill | Chain Target | Category | Mode |
|-------|--------------|----------|------|
| image_prompt_engineer | image-creator | image_prompt_generation | enhance-prompt |
| video-prompt-engineer | video-creator | video_prompt_generation | llm-only |

## Precedence: patternChainTo > skill.chainTo > null

```javascript
// Client decides
const chain = patternChainTo ?? chainTo ?? null;
```

## Recommendation for Implementation

**Option C: Hybrid Auto-Chain with User Control**

1. Add conversation setting: `autoChainSkills: boolean`
2. In executeSkill(), after execution:
   - Check if skill has chainTo
   - Check if conversation.autoChainSkills is true
   - Extract output from first skill's result
   - Auto-invoke second skill with extracted output
   - Return both results to client

**Estimated Effort**: 5-8 hours

## Next Steps

1. **Define output extraction rules**: What field from each skill feeds to the next?
2. **Add conversation.autoChainSkills**: UI toggle for user preference
3. **Implement auto-chain logic**: executeSkill() enhancement
4. **Add depth limit**: Prevent infinite loops (max 3 hops)
5. **UI updates**: Show chaining progress, separate result displays

