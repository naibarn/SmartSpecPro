<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd python-backend && pytest tests/test_agency_creator_v2.py -v && cd ../apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-discover-enhancement
section-02-interview-replacement
section-03-memory-informed-planning
section-04-review-enhancement
section-05-post-creation-suggestions
section-06-template-save
section-07-internal-api-update
section-08-frontend-suggestions-ui
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-discover-enhancement | - | 02, 03 | Yes |
| section-02-interview-replacement | 01 | 03 | No |
| section-03-memory-informed-planning | 01 | 04 | No |
| section-04-review-enhancement | 01 | 05 | Yes (with 03) |
| section-05-post-creation-suggestions | 04 | 08 | No |
| section-06-template-save | - | 08 | Yes |
| section-07-internal-api-update | - | 08 | Yes |
| section-08-frontend-suggestions-ui | 05, 06, 07 | - | No |

## Execution Order

### Batch 1 — Foundation (parallel)
1. section-01-discover-enhancement
2. section-06-template-save
3. section-07-internal-api-update

### Batch 2 — Core Pipeline (sequential)
4. section-02-interview-replacement
5. section-03-memory-informed-planning
6. section-04-review-enhancement

### Batch 3 — Features
7. section-05-post-creation-suggestions

### Batch 4 — Frontend
8. section-08-frontend-suggestions-ui

## Section Summaries

### section-01-discover-enhancement
Upgrade `_llm_discover()` to output capability analysis: recommended_capabilities, complexity_level, memory_recommendation. Plan section 2.

### section-02-interview-replacement
Replace technical interview with LLM-driven planning. Only ask goal-clarification questions. Plan section 3.

### section-03-memory-informed-planning
Add `_fetch_relevant_memories()` to query past agency learnings. Inject into planning prompt. Plan section 4.

### section-04-review-enhancement
Update `_llm_review_plan()` and `_llm_review_design()` with intelligence-aware checks. Plan section 5.

### section-05-post-creation-suggestions
New `_llm_suggest_improvements()` function. Store suggestions in Redis. Plan section 6.

### section-06-template-save
New `saveAsTemplate` tRPC procedure. Uses existing agencyTemplates table. Plan section 7.

### section-07-internal-api-update
Add objective + sharedInstructions to internal create API schema. Plan section 8.

### section-08-frontend-suggestions-ui
Suggestion cards in AutoCreateAgencyModal completion view. Save as Template button. Plan section 6+7 frontend.
