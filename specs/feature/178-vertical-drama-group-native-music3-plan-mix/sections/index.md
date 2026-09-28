<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-schema
section-02-final-cut-and-web-services
section-03-worker-audio-pipeline
section-04-production-ui
section-05-integration-migration-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-schema | — | 02, 03 | Yes |
| section-02-final-cut-and-web-services | 01 | 04, 05 | No |
| section-03-worker-audio-pipeline | 01 | 05 | Yes after 01 |
| section-04-production-ui | 02 | 05 | No |
| section-05-integration-migration-proof | 01, 02, 03, 04 | — | No |

## Execution Order

1. Implement `section-01-contracts-schema` first.
2. Implement `section-02-final-cut-and-web-services` and `section-03-worker-audio-pipeline` after section 01; they may be developed in parallel when ownership paths do not overlap.
3. Implement `section-04-production-ui` after the group router projection exists.
4. Finish with `section-05-integration-migration-proof` and record authenticated browser/runtime evidence separately from no-credit tests.

## Section Summaries

### section-01-contracts-schema

Add normalized group identity/plan persistence, additive migration, explicit
production-group scope contracts, idempotency inputs and schema tests.

### section-02-final-cut-and-web-services

Publish managed final-cut identity, implement group source snapshots and plan/
rights/stale lifecycle, and expose group-only router procedures.

### section-03-worker-audio-pipeline

Implement durable group ASR/edit-map, genuine MiniMax Music 3 take publication,
group score mix, FFmpeg/post-encode QC and truthful callback handling in Worker.

### section-04-production-ui

Add the always-visible Production-tab readiness card and dedicated group-native
panel, while retaining member plans as an explicit source disclosure.

### section-05-integration-migration-proof

Apply/verify migration, connect Web-to-Worker flow, run focused checks, and
capture responsive/accessibility/authenticated UI and real runtime evidence.
