<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web exec vitest run <focused-test-file>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-domain-foundation
section-02-authoring-and-jobs
section-03-epub-pdf-export
section-04-book-studio-ui-and-acceptance
section-05-dedicated-book-cover-generation
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-domain-foundation | - | 02, 03, 04 | No |
| section-02-authoring-and-jobs | 01 | 03, 04 | No |
| section-03-epub-pdf-export | 01, 02 | 04 | No |
| section-04-book-studio-ui-and-acceptance | 01, 02, 03 | - | No |
| section-05-dedicated-book-cover-generation | 01, 04 | - | No |

## Execution Order

1. section-01-domain-foundation
2. section-02-authoring-and-jobs
3. section-03-epub-pdf-export
4. section-04-book-studio-ui-and-acceptance
5. section-05-dedicated-book-cover-generation

## Section Summaries

### section-01-domain-foundation
Create typed contracts, tenant-scoped persistence, immutable source snapshots and authorized image resolution. Owns all data contracts and migration/repository paths.

### section-02-authoring-and-jobs
Create owner-scoped authoring APIs/services and canonical composition jobs with revision-safe edits, cost admission and progress.

### section-03-epub-pdf-export
Implement validated private artifact generation with independent canonical jobs and EPUB/PDF renderers.

### section-04-book-studio-ui-and-acceptance
Integrate Book Studio into series detail and close requirement evidence, responsive/accessibility behavior, migration freshness and ten requested gap-review rounds.

### section-05-dedicated-book-cover-generation
Add the author-triggered cover creator with model capability checks, randomized authorized shot references, three reviewable candidates, exact Unicode text composition, private media assets, credit estimate, and durable canonical job lifecycle.
