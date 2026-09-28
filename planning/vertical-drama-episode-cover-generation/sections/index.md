<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-migration
section-02-server-cover-lifecycle
section-03-episode-list-projection
section-04-episodes-tab-cover-ui
section-05-focused-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-migration | - | 02, 03, 04 | Yes |
| section-02-server-cover-lifecycle | 01 | 03, 04 | No |
| section-03-episode-list-projection | 01, 02 | 04 | No |
| section-04-episodes-tab-cover-ui | 01, 02, 03 | 05 | No |
| section-05-focused-verification | 01, 02, 03, 04 | - | No |

## Execution Order

1. section-01-contracts-and-migration
2. section-02-server-cover-lifecycle
3. section-03-episode-list-projection
4. section-04-episodes-tab-cover-ui
5. section-05-focused-verification

## Section Summaries

### section-01-contracts-and-migration

Create the shared state/prompt/reference contract, tests, schema field, and additive manual migration.

### section-02-server-cover-lifecycle

Implement current-data assembly, async generation, status reconciliation, idempotency, stale-task protection, and upload replacement.

### section-03-episode-list-projection

Expose only display-safe cover state from the existing owned series/episode list projection and preserve the thumbnail fallback.

### section-04-episodes-tab-cover-ui

Add remembered model selection, card states, polling, fullscreen/download, and accessible drag/drop/file replacement without breaking navigation.

### section-05-focused-verification

Run focused tests/checks, inspect security and dirty-worktree boundaries, and record browser evidence or harness limitations.
