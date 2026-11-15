<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-persisted-events
section-02-sse-replay-and-job-correlation
section-03-private-artifacts
section-04-inspector-task-and-mission-links
section-05-assistant-ui-responsive-integration
section-06-spec-dev-release-and-uat-handoff
END_MANIFEST -->

# R1.19 implementation sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts/events | — | 02, 03, 04 | No |
| 02 SSE/replay/job correlation | 01 | 04, 05 | No |
| 03 private artifacts | 01 | 04, 05 | Yes after 01 |
| 04 inspector/task/mission links | 01, 02, 03 | 05 | No |
| 05 responsive UI | 02, 03, 04 | 06 | No |
| 06 spec/dev release/UAT handoff | 01–05 | — | No |

## Execution order

1. Contracts and persisted events.
2. SSE/replay and private artifacts can proceed as independently owned Core slices after the shared event contract, serializing any overlapping SQL/API files.
3. Inspector and canonical Task/Mission links.
4. assistant-ui integration and responsive verification.
5. SPEC reconciliation, scoped verification, authorized DEV release and real-UAT handoff.

Each section file maps normative requirements to owned source/API paths, test evidence, fallback, blocker strategy and completion predicate.
