<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-qc-contract
section-02-skill-and-qc-service
section-03-precreate-job-and-router
section-04-wizard-qc-gate
section-05-integration-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| 01 shared-qc-contract | - | 02, 03, 04 | Yes |
| 02 skill-and-qc-service | 01 | 03 | No |
| 03 precreate-job-and-router | 01, 02 | 04 | No |
| 04 wizard-qc-gate | 01, 03 | 05 | No |
| 05 integration-verification | 01–04 | - | No |

## Execution Order

1. Shared contracts and deterministic score engine.
2. Skill files and the pure QC orchestration service.
3. Redis/BullMQ pre-create job and tRPC/create receipt integration.
4. Wizard panel, polling, and Apply/Next gates.
5. Cross-boundary tests, type diagnostics, diff checks, and documentation.

## Section Summaries

### section-01-shared-qc-contract
Add rubric, score, gate, history, credit, and receipt contracts with pure tests.

### section-02-skill-and-qc-service
Add the evaluate/revise skill and implement deterministic best-candidate QC loop.

### section-03-precreate-job-and-router
Add owner-scoped durable pre-create job, queue wiring, tRPC procedures, and
server-validated create receipt.

### section-04-wizard-qc-gate
Add bilingual QC UI panel and integrate async state with existing draft gate.

### section-05-integration-verification
Run focused regressions, close contract gaps, and document baseline/type/browser
verification results without touching unrelated dirty changes.
