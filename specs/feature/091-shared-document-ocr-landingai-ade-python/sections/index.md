<!-- PROJECT_CONFIG
runtime: polyglot-node-python
test_command: pnpm --dir apps/web test -- server/services/libraryUploadPipeline.test.ts server/services/__tests__/financeDocumentExtractionService.test.ts && DEBUG=false uv run pytest tests/unit/api/test_internal_library_extract.py -q --no-cov
END_PROJECT_CONFIG -->

<!-- NOTE
The project test command is a smoke gate for the most critical existing paths.
Section-level validation should also include the full routing, policy, security, and fallback matrix described in the section summaries below.
-->

<!-- SECTION_MANIFEST
section-01-ade-service-adapter
section-02-upload-routing-and-provider-selection
section-03-storage-security-and-policy
section-04-rollout-and-regression-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-ade-service-adapter | - | 02, 03, 04 | No |
| section-02-upload-routing-and-provider-selection | 01 | 03, 04 | Yes |
| section-03-storage-security-and-policy | 01, 02 | 04 | No |
| section-04-rollout-and-regression-tests | 01, 02, 03 | - | No |

## Execution Order

1. section-01-ade-service-adapter
2. section-02-upload-routing-and-provider-selection
3. section-03-storage-security-and-policy
4. section-04-rollout-and-regression-tests

## Section Summaries

### section-01-ade-service-adapter
Add the ADE Python adapter, canonical response normalization, provider-safe URL resolution, and unsupported-input handling.

### section-02-upload-routing-and-provider-selection
Route document-centric uploads to ADE, preserve non-document vision behavior, and carry provider metadata through the Node upload pipeline.

### section-03-storage-security-and-policy
Add policy gates, temp URL handling, scope preservation, audit logging, lineage persistence, and privacy protections.

### section-04-rollout-and-regression-tests
Add rollout flags, observability, and regression tests that lock the routing matrix, fallback behavior, and security guarantees down.
