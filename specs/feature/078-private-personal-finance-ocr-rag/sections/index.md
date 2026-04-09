<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-and-migrations
section-02-personal-chat-lock
section-03-finance-core
section-04-ocr-ingestion
section-05-rag-isolation
section-06-security-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-schema-and-migrations | - | 02, 03, 04, 05, 06 | No |
| section-02-personal-chat-lock | 01 | 04, 05, 06 | Yes |
| section-03-finance-core | 01 | 04, 05, 06 | Yes |
| section-04-ocr-ingestion | 01, 03 | 05, 06 | No |
| section-05-rag-isolation | 01, 03, 04 | 06 | No |
| section-06-security-tests | 01, 02, 03, 04, 05 | - | No |

## Execution Order

1. section-01-schema-and-migrations
2. section-02-personal-chat-lock and section-03-finance-core in parallel
3. section-04-ocr-ingestion
4. section-05-rag-isolation
5. section-06-security-tests

## Section Summaries

### section-01-schema-and-migrations
Add finance tables, ownership fields, project-scoped library columns, and the first migration/backfill/RLS scaffolding.

### section-02-personal-chat-lock
Add server-side personal chat locking plus the personal chat entry point and visual lock indicator.

### section-03-finance-core
Add the finance router and finance service for text drafts, confirmations, summaries, and recurring rules.

### section-04-ocr-ingestion
Add the finance OCR pipeline, safe document ingestion rules, and draft creation from receipts and invoices.

### section-05-rag-isolation
Add evidence retrieval, library scope propagation, and cross-domain retrieval hardening.

### section-06-security-tests
Add RLS, retention, audit, rollout gates, and the regression matrix that locks the feature down.

