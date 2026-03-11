# Section 02 — Claim Ledger & Citations Output Schema

## Objective

Create standard CMS output schemas (ArticleCMS.v1, ProductReviewCMS.v1) as JSON Schema files and a TypeScript validator that checks LLM outputs against them, including citation coverage calculation.

## Scope

1. Create shared JSON Schema definitions for claims, citations, disclosures
2. Create `ArticleCMS.v1.schema.json` for article writers
3. Create `ProductReviewCMS.v1.schema.json` for product reviewers (extends article)
4. Create `cmsOutputValidator.ts` with schema validation + citation coverage check
5. Export TypeScript interfaces matching the schemas

## Primary files

- `packages/skills/src/schemas/shared-definitions.json` — shared claim/citation/disclosure defs
- `packages/skills/src/schemas/ArticleCMS.v1.schema.json` — article output schema
- `packages/skills/src/schemas/ProductReviewCMS.v1.schema.json` — review output schema
- `packages/skills/src/validators/cmsOutputValidator.ts` — validation logic
- `packages/skills/src/types.ts` — TypeScript interfaces (add CMS types)

## Schema design

### Shared definitions (claims, citations, disclosures)

```json
{
  "ClaimEntry": {
    "type": "object",
    "required": ["claim_id", "text", "importance", "verification_status", "last_verified_at", "evidence"],
    "properties": {
      "claim_id": { "type": "string" },
      "text": { "type": "string" },
      "importance": { "type": "string", "enum": ["critical", "major", "minor"] },
      "verification_status": { "type": "string", "enum": ["verified", "partially_verified", "unverified"] },
      "last_verified_at": { "type": "string", "format": "date-time" },
      "evidence": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["source_type", "title", "retrieved_at"],
          "properties": {
            "source_type": { "type": "string", "enum": ["web", "doi", "api", "pdf", "internal_doc"] },
            "title": { "type": "string" },
            "url_or_id": { "type": "string" },
            "quote": { "type": "string" },
            "retrieved_at": { "type": "string", "format": "date-time" }
          }
        }
      }
    }
  }
}
```

### ArticleCMS.v1

Required fields: `locale`, `title`, `slug`, `body_markdown`, `claims`, `citations`, `last_verified_at`, `disclosures`

Optional fields: `summary`, `seo`, `tables`, `media`, `refresh_policy`

### ProductReviewCMS.v1

Extends ArticleCMS.v1 with: `product` (brand, model, category, market, price), `review` (title, summary, verdict, pros, cons, who_should_buy, who_should_avoid, scoring with rubric, comparison_table_markdown, faq, body_markdown), `structured_data_jsonld`, `disclosures.methodology`

## Validator

`cmsOutputValidator.ts` exports:

```typescript
interface CmsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  citation_coverage: number;  // ratio of critical+major claims with evidence
  claims_total: number;
  claims_with_evidence: number;
  claims_unverified: number;
  disclosure_complete: boolean;
}

function validateArticleCmsOutput(output: unknown): CmsValidationResult;
function validateProductReviewCmsOutput(output: unknown): CmsValidationResult;
function calculateCitationCoverage(claims: ClaimEntry[], requiredLevels: string[]): number;
```

Validator uses `ajv` (already a project dependency) for JSON Schema validation, plus custom logic for citation coverage.

## Acceptance criteria

1. JSON Schema files are valid JSON Schema draft 2020-12
2. TypeScript interfaces match schema structure exactly
3. `validateArticleCmsOutput` correctly validates conforming/non-conforming outputs
4. `validateProductReviewCmsOutput` correctly validates conforming/non-conforming outputs
5. `calculateCitationCoverage` returns correct ratio
6. Citation coverage of 0.0 is valid when `citation_required_for` is empty
7. Missing required fields produce specific error messages
8. All existing tests pass unchanged

## Test file

`packages/skills/src/__tests__/cmsOutputValidator.test.ts`

Test cases:
- Valid ArticleCMS output → valid=true, no errors
- Valid ProductReviewCMS output → valid=true, no errors
- Missing required field → valid=false, error mentions field name
- Invalid claim importance enum → valid=false, error mentions value
- Citation coverage: 3/4 critical claims with evidence → coverage=0.75
- Citation coverage: all claims minor, none with evidence → coverage=1.0 (no required)
- Empty claims array → valid=true (minItems not enforced), coverage=1.0
- Disclosure missing when required → warning
