<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-migration
section-02-special-creation-jobs
section-03-marketplace-managed-references
section-04-skill-adapter-prompts
section-05-api-model-isolation
section-06-special-dialog-ui
section-07-episode-storyboard-ops
section-08-integration-gap-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contract-migration | — | 02,03,04,05,06,07 | No |
| 02 special-creation-jobs | 01 | 04,05,07 | No |
| 03 marketplace-managed-references | 01 | 02,04,06 | Yes with 02 after 01 |
| 04 skill-adapter-prompts | 01,02,03 | 05,07 | No |
| 05 api-model-isolation | 01,02,04 | 06,07 | No |
| 06 special-dialog-ui | 01,03,05 | 07,08 | No |
| 07 episode-storyboard-ops | 01,04,05,06 | 08 | No |
| 08 integration-gap-verification | 01–07 | — | No |

## Execution Order

1. Section 01.
2. Sections 02 and 03 after 01, with disjoint ownership where practical.
3. Section 04 after 02 and 03.
4. Section 05 after 04.
5. Sections 06 and 07 after 05; UI evidence remains sequential.
6. Section 08 after all previous sections.

## Section Summaries

### section-01-contract-migration
Additive episode discriminator, special sequence ledger, shared contracts, validation,
migration, and normal-row compatibility.

### section-02-special-creation-jobs
Special creation/reconciliation service, intent/version protection, interactive job kind,
status and safe billing boundaries.

### section-03-marketplace-managed-references
Marketplace Capture product/image selection, upload canonicalization, and Scenes slot
reconciliation with authorized runtime resolution.

### section-04-skill-adapter-prompts
Special contract additions, skill loader/validator/adapter, shot mapping, semantic retry,
and skill-only prompt ownership.

### section-05-api-model-isolation
Protected tRPC procedures, special model catalog, episode-local model selection and
model snapshot isolation.

### section-06-special-dialog-ui
Series entry dialog, two-stage Marketplace Capture browser, upload/cast/locks/model UI,
state/accessibility/responsive behavior.

### section-07-episode-storyboard-ops
Shared episode page/storyboard special branch, prompt/media/render reuse, special shot
cardinality, and normal-flow regression protection.

### section-08-integration-gap-verification
Cross-section tests, type/build/migration checks, browser evidence, observability audit,
and five post-implementation gap-review reports.
