<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web run test --
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-chat-contracts
section-02-brokers-and-runtime
section-03-task-state-and-provenance
section-04-ui-surfaces
section-05-evolution-and-governance
section-06-browser-and-release-gates
END_MANIFEST -->

# Feature 198 Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 | Features 195–197 | 02–06 | No |
| 02 | 01 | 03–06 | No |
| 03 | 01–02 | 04–06 | No |
| 04 | 01–03 | 05–06 | No |
| 05 | 01–04 | 06 | No |
| 06 | 01–05 | — | No |

## Source Coverage

The six sections cover every source heading 1–207, including all request/broker/runtime, UI, Help/Feedback, security, governance, localization, accessibility, telemetry, retrieval, large-result and trailing acceptance requirements.

## Execution Order

Chat contracts → brokers/runtime → task/provenance → UI → evolution/governance → browser/release.

