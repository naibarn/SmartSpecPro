# Section 01 — Skill Schema Enhancement

## Objective

Extend skill frontmatter to declare execution requirements (`requires_web_search`, `requires_citations`, `requires_structured_output`, `thinking_level_hint`, `output_format`) and content quality constraints (`min_citation_coverage`, `disclosure_required`, `refresh_cadence_days`).

## Scope

1. Add `SkillExecutionPolicyConfig` and `SkillContentQuality` types to `packages/skills/src/types.ts`
2. Update frontmatter parser in `packages/skills/src/parseFrontmatter.ts` to handle new fields
3. Ensure backward compatibility — all new fields are optional with sensible defaults

## Primary files

- `packages/skills/src/types.ts` — type definitions
- `packages/skills/src/parseFrontmatter.ts` — YAML frontmatter parser
- `packages/skills/src/index.ts` — re-exports

## Type additions

```typescript
export interface SkillExecutionPolicyConfig {
  requires_web_search?: boolean;
  requires_citations?: boolean;
  requires_structured_output?: boolean;
  thinking_level_hint?: "minimal" | "low" | "medium" | "high";
  output_format?: "cms_article" | "cms_review" | "markdown" | "json";
  max_tokens_hint?: number;
}

export interface SkillContentQuality {
  citation_required_for?: ("critical" | "major" | "minor")[];
  min_citation_coverage?: number;  // 0.0 - 1.0
  disclosure_required?: boolean;
  refresh_cadence_days?: number;
}
```

These should be added to the existing `SkillDefinition` interface:
```typescript
// Add to SkillDefinition
execution_policy?: SkillExecutionPolicyConfig;
content_quality?: SkillContentQuality;
```

## Parser changes

In `parseFrontmatter.ts`, the YAML frontmatter parser should:
1. Parse `execution_policy` object if present, mapping snake_case YAML keys to the TypeScript interface
2. Parse `content_quality` object if present
3. Return `undefined` for both if not present in frontmatter (backward compatible)
4. Validate enum values (`thinking_level_hint`, `output_format`, `citation_required_for`)

## Acceptance criteria

1. `SkillExecutionPolicyConfig` and `SkillContentQuality` types exported from `@smartspec/skills`
2. Frontmatter with new fields parses correctly into typed objects
3. Frontmatter without new fields still parses correctly (backward compatible)
4. Invalid enum values in frontmatter produce a parse warning (not error)
5. All existing tests pass unchanged
6. New unit tests cover:
   - Parsing frontmatter with all new fields
   - Parsing frontmatter with partial new fields
   - Parsing frontmatter without new fields (legacy)
   - Invalid enum values produce warnings

## Test file

`packages/skills/src/__tests__/parseFrontmatter.test.ts` (extend existing or create if missing)
