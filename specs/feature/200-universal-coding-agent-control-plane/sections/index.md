<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web run test --
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-agent-contracts-and-job-handoff
section-02-provider-adapters
section-03-runner-and-runtime
section-04-context-skills-assets-mcp
section-05-verification-and-ui
section-06-migration-tests-and-acceptance
END_MANIFEST -->

# Feature 200 Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 | Features 195/196 | 02–06 | No |
| 02 | 01 | 03–06 | No |
| 03 | 01–02 and Feature 197 | 04–06 | No |
| 04 | 01–03 and Feature 199 | 05–06 | No |
| 05 | 01–04 and Feature 198 | 06 | No |
| 06 | 01–05 | — | No |

## Source Coverage

The six sections cover every source heading 1–54, all provider phases, decisions, risks, NFRs, provider facts, final direction, codebase baseline and trailing summary/acceptance sections.

## Execution Order

Agent contracts/Job → provider adapters → Runner/runtime → context/skills/assets/MCP → verification/UI → migration/tests/acceptance.

