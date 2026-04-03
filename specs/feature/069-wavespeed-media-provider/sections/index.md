<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test && (cd python-backend && uv run pytest)
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-and-static-fallback
section-02-admin-provider-and-model-ui
section-03-python-runtime-and-recovery
section-04-tests-and-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-foundation-and-static-fallback | - | 02, 03, 04 | Yes |
| section-02-admin-provider-and-model-ui | 01 | 03, 04 | No |
| section-03-python-runtime-and-recovery | 01, 02 | 04 | No |
| section-04-tests-and-verification | 01, 02, 03 | - | No |

## Execution Order

1. `section-01-foundation-and-static-fallback`
2. `section-02-admin-provider-and-model-ui`
3. `section-03-python-runtime-and-recovery`
4. `section-04-tests-and-verification`

## Section Summaries

### section-01-foundation-and-static-fallback

Canonical provider naming, static registry additions, DB-miss pricing preservation, and shared base-URL normalization rules.

### section-02-admin-provider-and-model-ui

Admin provider template and health check, launch-model metadata, Media Studio input behavior, and WaveSpeed-specific user validation.

### section-03-python-runtime-and-recovery

Python submit/poll adapter, request/response mapping, recovery payload contract, and provider-specific status normalization.

### section-04-tests-and-verification

Vitest and pytest coverage additions, regression checks, and end-to-end verification steps for the completed feature.

## Implementation Status

Implemented on 2026-04-03.

- `section-01-foundation-and-static-fallback`: completed
- `section-02-admin-provider-and-model-ui`: completed
- `section-03-python-runtime-and-recovery`: completed
- `section-04-tests-and-verification`: completed

Verification used the targeted Vitest and pytest slices called out by the section plan. Python verification was run with `--no-cov` in this worktree because the repo-level pytest coverage database was already corrupted locally, but the feature tests themselves passed.
