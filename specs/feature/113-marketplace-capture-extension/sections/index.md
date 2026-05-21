<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run check && npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database-contracts
section-02-backend-foundation
section-03-extension-auth-cors
section-04-captures-assets-candidates
section-05-llm-extraction
section-06-confirm-retention-audit
section-07-web-preview-products
section-08-extension-workspace
section-09-shopee-category
section-10-shopee-product-review
section-11-security-qa-release
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database-contracts | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-backend-foundation | 01 | 03, 04, 05, 06, 07 | No |
| section-03-extension-auth-cors | 01, 02 | 04, 08 | No |
| section-04-captures-assets-candidates | 01, 02, 03 | 05, 06, 10 | No |
| section-05-llm-extraction | 01, 02, 04 | 06, 07 | Yes |
| section-06-confirm-retention-audit | 01, 02, 04, 05 | 07, 11 | No |
| section-07-web-preview-products | 01, 02, 05, 06 | 11 | Yes |
| section-08-extension-workspace | 01, 03 | 09, 10 | Yes |
| section-09-shopee-category | 08 | 10, 11 | Yes |
| section-10-shopee-product-review | 04, 08, 09 | 11 | No |
| section-11-security-qa-release | all | - | No |

## Execution Order

1. section-01-database-contracts
2. section-02-backend-foundation
3. section-03-extension-auth-cors
4. section-04-captures-assets-candidates and section-08-extension-workspace after auth/contracts are ready
5. section-05-llm-extraction, section-09-shopee-category, and section-07-web-preview-products where their dependencies are satisfied
6. section-06-confirm-retention-audit
7. section-10-shopee-product-review
8. section-11-security-qa-release

## Section Summaries

### section-01-database-contracts
Add schema, migration, and shared Zod/type contracts.

### section-02-backend-foundation
Wire feature flags, REST route shell, tRPC router shell, and normalized errors.

### section-03-extension-auth-cors
Implement pairing, scoped token validation, exact CORS/origin handling, and rate limits.

### section-04-captures-assets-candidates
Implement create draft, asset upload, candidate batch upload, validation, and storage.

### section-05-llm-extraction
Implement server-side prompt, extraction, validation, repair, and warnings.

### section-06-confirm-retention-audit
Implement final product save, idempotency, retention cleanup, and audit events.

### section-07-web-preview-products
Implement preview/edit/confirm pages and saved product list/detail.

### section-08-extension-workspace
Create Chrome MV3 extension workspace, manifest, service worker, messaging, and panel shell.

### section-09-shopee-category
Implement Shopee category/search scan, parser, scoring, filters, and queue basics.

### section-10-shopee-product-review
Implement Shopee product scan and mandatory pre-upload local review/edit/select flow.

### section-11-security-qa-release
Add security tests, integration tests, docs, manual QA, and release gates.

