<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-safe-migration
section-02-native-profiles-and-mcp-transports
section-03-capability-and-workflow-resolution
section-04-server-policy-and-comfy-jobs
section-05-worker-execution-and-recovery
section-06-shared-job-projection
section-07-worker-comfy-ui-and-overview
section-08-series-shot-web-ui
section-09-integration-packaging-and-release
END_MANIFEST -->

# Feature 165 implementation sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts and migration | existing contracts/schema | 02, 03, 04 | no |
| 02 native profiles/transports | 01 | 03, 05, 07 | no |
| 03 capability/workflow resolution | 01, 02 | 04, 05, 07, 08 | no |
| 04 server policy/jobs | 01, 03 | 05, 06, 08 | no |
| 05 Worker execution/recovery | 01–04 | 06, 07, 09 | no |
| 06 shared projection | 01, 04, 05 | 07, 08, 09 | no |
| 07 Worker UI/Overview | 02, 03, 05, 06 | 09 | no |
| 08 Series/shot Web UI | 03, 04, 06 | 09 | no |
| 09 integration/package/release | 01–08 | - | no |

## Execution order

1. Section 01 establishes shared contracts and safe migration.
2. Sections 02 and 03 proceed in dependency order because capability probing
   consumes the transport seam.
3. Sections 04, 05, and 06 proceed in order to keep job admission, execution,
   and projections authoritative.
4. Sections 07 and 08 add the two user surfaces without duplicating queue or
   Series policy ownership.
5. Section 09 performs integration, packaging, and release evidence.

## Completion rule

Each section file is self-contained and includes TDD-first cases, exact owned
files, compatibility constraints, and exit criteria. The implementer must run
focused tests after each section and record every review round in `reviews/`.
