# Section 08 — Article Writer Skills Upgrade

## Objective

Upgrade all 8 article writer skills to support ArticleCMS.v1 output format with citations, SEO metadata, claim ledger, and disclosure.

## Scope

1. Add `execution_policy` and `content_quality` frontmatter to all 8 article writer skills
2. Add CMS JSON output format section to each skill.md
3. Add `response_mode`, `seo_keywords`, `target_audience` to input schemas
4. Set category-appropriate citation requirements

## Affected skills (8)

1. `general-article-writer`
2. `business-article-writer`
3. `education-article-writer`
4. `lifestyle-article-writer`
5. `marketing-article-writer`
6. `documentary-script-writer`
7. `creative-story-writer`
8. `parenting-article-writer`

## Changes per skill

### A. Frontmatter additions

```yaml
execution_policy:
  requires_web_search: true       # false for creative-story-writer
  requires_citations: true        # false for creative-story-writer
  requires_structured_output: true
  thinking_level_hint: "medium"   # varies by category
  output_format: "cms_article"
content_quality:
  citation_required_for: ["critical", "major"]  # [] for creative-story
  min_citation_coverage: 0.6     # varies by category
  disclosure_required: false      # true for marketing
  refresh_cadence_days: 30        # null for creative-story
```

### B. Category-specific settings

| Category | min_citation_coverage | thinking_level_hint | requires_web_search | refresh_cadence_days |
|----------|----------------------|---------------------|---------------------|---------------------|
| general | 0.6 | medium | true | 30 |
| business | 0.8 | high | true | 30 |
| education | 0.8 | high | true | 60 |
| lifestyle | 0.5 | low | true | 30 |
| marketing | 0.6 | medium | true | 14 |
| documentary | 0.9 | high | true | 90 |
| creative-story | 0.0 | medium | false | null |
| parenting | 0.9 | high | true | 60 |

### C. Input schema additions

Add to each `schemas/input.schema.json`:
```json
{
  "response_mode": { "type": "string", "enum": ["markdown", "cms_json"], "default": "markdown" },
  "seo_keywords": { "type": "array", "items": { "type": "string" } },
  "target_audience": { "type": "string" }
}
```

### D. Output format section

Add CMS JSON output format section describing ArticleCMS.v1 structure.

Note: `parenting-article-writer` already has an `output.schema.json` — extend it rather than replace.

## Implementation strategy

Same as Section 07: create shared template, apply to each skill with category-specific values.

## Acceptance criteria

1. All 8 article writer skills have `execution_policy` and `content_quality` in frontmatter
2. All 8 have CMS JSON output format section
3. All 8 input schemas include `response_mode`, `seo_keywords`, `target_audience`
4. `creative-story-writer` has `requires_web_search: false` and `min_citation_coverage: 0.0`
5. `parenting-article-writer` output.schema.json extended (not replaced)
6. Default `response_mode` is `"markdown"` — no behavior change
7. Skills still parse correctly

## Test approach

- Parse each updated skill.md → verify frontmatter parses correctly
- Validate each input schema is valid JSON Schema
- Special check: creative-story-writer has no citation requirement
- Special check: parenting-article-writer output schema compatibility
