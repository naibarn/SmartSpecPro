<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-ocr-routing-contract
section-02-backend-routing-and-policy
section-03-admin-settings-ui
section-04-observability-and-compatibility
section-05-tests-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-ocr-routing-contract | - | section-02, section-03, section-04, section-05 | Yes |
| section-02-backend-routing-and-policy | section-01 | section-04, section-05 | Yes |
| section-03-admin-settings-ui | section-01 | section-05 | Yes |
| section-04-observability-and-compatibility | section-01, section-02 | section-05 | No |
| section-05-tests-and-rollout | section-01, section-02, section-03, section-04 | - | No |

## Execution Order

1. section-01-ocr-routing-contract
2. section-02-backend-routing-and-policy and section-03-admin-settings-ui in parallel
3. section-04-observability-and-compatibility
4. section-05-tests-and-rollout

## Section Summaries

### section-01-ocr-routing-contract
Define shared OCR provider IDs, file-class helpers, and settings-reader behavior. Preserve legacy fallback semantics and encrypt/mask Typhoon secrets.

### section-02-backend-routing-and-policy
Update library and finance OCR consumers to use the shared routing contract, obey `documentOcrExternalProcessing`, and preserve fallback metadata.

### section-03-admin-settings-ui
Extend `/admin/settings` so admins can configure image OCR, PDF OCR, and Typhoon secret handling without breaking the existing OCR controls.

### section-04-observability-and-compatibility
Keep routing traces, audit metadata, and rollout behavior understandable while preserving legacy behavior for existing deployments.

### section-05-tests-and-rollout
Add Vitest coverage for routing, policy blocking, admin UX, compatibility, and integration behavior. Confirm the feature is safe to ship.

