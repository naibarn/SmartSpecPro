<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run <focused files>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-advisory-qc-status-and-ui
section-02-successful-asset-version-preservation
section-03-partial-assembly-and-truthful-fallback
END_MANIFEST -->

# P2 Sections — Advisory QA and Asset Preservation

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-advisory-qc-status-and-ui | P0, P1 | 02, 03 | No |
| section-02-successful-asset-version-preservation | 01 | 03 | No |
| section-03-partial-assembly-and-truthful-fallback | 01, 02 | P3 | No |

## Execution Order

1. Separate QC from generation status and expose advisory outcome.
2. Prove user access and safe candidate promotion.
3. Prove explicit partial assembly and technical fallback labels.

## Section Summaries

### section-01-advisory-qc-status-and-ui
Keep frame/clip findings advisory and visible without disabling render/download.

### section-02-successful-asset-version-preservation
Maintain previous successful asset on every failed, stale, unverified or unauthorized candidate.

### section-03-partial-assembly-and-truthful-fallback
Continue supported partial assembly despite advisory warnings and keep technical failure/fallback labels truthful.
