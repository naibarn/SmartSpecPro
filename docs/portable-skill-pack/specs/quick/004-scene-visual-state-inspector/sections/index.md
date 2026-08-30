<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-scene-state
section-02-mutation-stale-propagation
section-03-collapsible-inspector-ui
section-04-focused-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-scene-state | - | 02, 03, 04 | Yes |
| section-02-mutation-stale-propagation | 01 | 03, 04 | No |
| section-03-collapsible-inspector-ui | 01, 02 | 04 | No |
| section-04-focused-verification | 01, 02, 03 | - | No |

## Execution Order

1. Implement the shared contract and prompt renderer.
2. Extend the transactional mutation and stale propagation.
3. Implement the collapsed-by-default Inspector and copy.
4. Run focused tests, type/lint checks where bounded, and inspect the diff.
