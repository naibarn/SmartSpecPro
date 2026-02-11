<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: bash -lc "cd apps/web && npm test"
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-url-policy-foundation
section-02-legacy-url-migration
section-03-library-url-policy-integration
section-04-active-content-upload-protection
section-05-tenant-feature-gating
section-06-library-ops-tenant-scope-phase1
section-07-library-ops-tenant-attribution-phase2
section-08-office-preview-safety
section-09-image-proxy-hardening
section-10-security-regression-release-gate
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-url-policy-foundation | - | 02, 03, 08, 09 | No |
| section-02-legacy-url-migration | 01 | 10 | Yes |
| section-03-library-url-policy-integration | 01 | 04, 05, 06, 08, 09 | No |
| section-04-active-content-upload-protection | 03 | 10 | Yes |
| section-05-tenant-feature-gating | 03 | 06, 10 | Yes |
| section-06-library-ops-tenant-scope-phase1 | 03, 05 | 07, 10 | No |
| section-07-library-ops-tenant-attribution-phase2 | 06 | 10 | No |
| section-08-office-preview-safety | 03 | 10 | Yes |
| section-09-image-proxy-hardening | 03 | 10 | Yes |
| section-10-security-regression-release-gate | 02, 04, 05, 07, 08, 09 | - | No |

## Execution Order

1. `section-01-url-policy-foundation`
2. `section-02-legacy-url-migration`, `section-03-library-url-policy-integration`
3. `section-04-active-content-upload-protection`, `section-05-tenant-feature-gating`, `section-08-office-preview-safety`, `section-09-image-proxy-hardening`
4. `section-06-library-ops-tenant-scope-phase1`
5. `section-07-library-ops-tenant-attribution-phase2`
6. `section-10-security-regression-release-gate`

## Section Summaries

### section-01-url-policy-foundation
Create shared URL validation/classification module for library/media URL fields with strict allow/deny matrix.

### section-02-legacy-url-migration
Implement dry-run + normalization + enforcement migration for existing `library_items.source_url` and `thumbnail_url` values.

### section-03-library-url-policy-integration
Wire URL policy into all write paths (`library.createItem`, `library.updateItem`, media-to-library flow) with consistent errors and audit signals.

### section-04-active-content-upload-protection
Protect upload serving behavior against executable active-content while preserving safe previews and inline-safe SVG path.

### section-05-tenant-feature-gating
Change allowlist behavior to deny by default when tenant context is missing.

### section-06-library-ops-tenant-scope-phase1
Add tenant scope threading and global-action safeguards for current ops services.

### section-07-library-ops-tenant-attribution-phase2
Add tenant attribution schema/backfill for callback tables and complete tenant-scoped ops behavior.

### section-08-office-preview-safety
Strengthen office-preview host checks to block private/internal destinations and preserve safe fallback UX.

### section-09-image-proxy-hardening
Add timeout/size/redirect safety controls to external image proxy while preserving public image functionality.

### section-10-security-regression-release-gate
Complete security regression suite, compatibility checks, migration verification, and release gate checklist.
