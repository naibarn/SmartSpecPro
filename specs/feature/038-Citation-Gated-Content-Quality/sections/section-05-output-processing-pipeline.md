# Section 05 — Output Processing Pipeline

## Objective

Create a post-processing pipeline that takes LLM output + extracted citations and produces validated CMS JSON with quality metrics (claim extraction, citation matching, quality gate check, SEO metadata generation).

## Scope

1. Parse LLM output as CMS JSON or extract from markdown
2. Match extracted citations to claims
3. Calculate citation coverage and quality metrics
4. Generate SEO metadata if missing
5. Return processed output + quality report

## Primary files

- `apps/web/server/services/contentOutputProcessor.ts` — NEW: main pipeline
- `apps/web/server/services/claimExtractor.ts` — NEW: extract claims from output
- `apps/web/server/services/seoMetadataGenerator.ts` — NEW: generate SEO fields
- `apps/web/server/routers/skills.ts` — call pipeline after LLM response

## Pipeline design

```typescript
export interface ContentProcessingInput {
  llmOutput: string;                    // raw LLM response text
  outputFormat: "cms_article" | "cms_review" | "markdown";
  extractedCitations?: ExtractedCitation[];  // from web search (Section 03)
  contentQuality?: SkillContentQuality;      // from skill frontmatter
  skillSlug: string;
}

export interface ContentProcessingResult {
  content: ArticleCMSOutput | ProductReviewCMSOutput | string;  // string for markdown
  quality: QualityReport;
  format: "cms_article" | "cms_review" | "markdown";
}

export interface QualityReport {
  citation_coverage: number;
  claims_total: number;
  claims_with_evidence: number;
  claims_unverified: number;
  quality_gate_passed: boolean;
  seo_complete: boolean;
  errors: string[];
  warnings: string[];
}

export async function processContentOutput(
  input: ContentProcessingInput
): Promise<ContentProcessingResult>;
```

### Step 1: Parse output

- If `outputFormat` is `cms_article` or `cms_review`: parse LLM output as JSON, validate against schema (Section 02 validator)
- If `markdown`: return as-is with minimal quality report

### Step 2: Match citations to claims

- For each claim in `claims[]`, check if `evidence[]` has entries
- Match `extractedCitations` to claims by URL overlap or quote matching
- Add missing citations from web search results to unlinked claims

### Step 3: Quality gate

- Calculate `citation_coverage` = claims with evidence / (critical + major claims)
- Check against `contentQuality.min_citation_coverage`
- Check disclosure completeness
- Set `quality_gate_passed`

### Step 4: SEO metadata

If `seo` field is missing or incomplete:
- `meta_title`: truncate title to ≤60 chars
- `meta_description`: truncate summary to ≤160 chars
- `keywords`: extract from title + first paragraph (simple word extraction)

### Integration

In `skills.ts`, after LLM response:
```typescript
if (skill.execution_policy?.output_format?.startsWith("cms_")) {
  const result = await processContentOutput({
    llmOutput: llmResponse.content,
    outputFormat: skill.execution_policy.output_format,
    extractedCitations: citations,  // from Section 03
    contentQuality: skill.content_quality,
    skillSlug: skill.slug,
  });
  // Return result.content + result.quality to client
}
```

## Acceptance criteria

1. CMS JSON output parsed and validated successfully
2. Markdown output passes through unchanged
3. Citation matching links extracted citations to claims
4. Quality gate correctly evaluates coverage threshold
5. SEO metadata generated when missing
6. Invalid JSON from LLM → graceful error with raw text fallback
7. All existing skill execution paths unaffected

## Test file

`apps/web/server/services/contentOutputProcessor.test.ts`

Test cases:
- Valid CMS article JSON → parsed, validated, quality report generated
- Valid CMS review JSON → parsed, validated, quality report with scoring
- Invalid JSON from LLM → error result with raw text
- Citation matching: 3 web citations link to 3 claims
- Quality gate: coverage 0.8 with threshold 0.7 → passed
- Quality gate: coverage 0.5 with threshold 0.7 → not passed
- SEO generation: missing meta_title → generated from title
- Markdown mode → pass-through with minimal report
