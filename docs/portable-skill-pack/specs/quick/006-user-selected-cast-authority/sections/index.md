<!-- PROJECT_CONFIG
runtime: typescript-npm-plus-python-uv
test_command: pnpm exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-visual-cast
section-02-start-frame-and-video-integration
section-03-focused-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-visual-cast | - | 02, 03 | Yes |
| section-02-start-frame-and-video-integration | 01 | 03 | No |
| section-03-focused-verification | 01, 02 | - | No |

## Execution order

1. Add and test the pure shared visual-cast resolver.
2. Thread it through Start Frame, Legacy, and Enhanced prompt construction.
3. Run focused TypeScript/Python tests and inspect the owned diff.
