<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts
section-02-schema-migration
section-03-catalog-service-router
section-04-special-product-bridge
section-05-context-detection
section-06-shot-projection
section-07-prompt-media
section-08-central-ui
section-09-observability-reliability
section-10-integration-release
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts | — | 02–10 | Yes |
| 02 schema/migration | 01 | 03–07, 09–10 | No |
| 03 catalog service/router | 01, 02 | 04–06, 08–10 | No |
| 04 Special/Product bridge | 03 | 05, 06, 08, 10 | Yes after 03 |
| 05 context detection | 01–03 | 06, 08–10 | Yes after 03 |
| 06 shot/projection | 01–03, 05 | 07–10 | No |
| 07 prompt/media | 01–03, 06 | 08, 10 | No |
| 08 central UI | 03–07 | 10 | No |
| 09 observability/reliability | 01–07 | 10 | Yes after 07 |
| 10 integration/release | 01–09 | — | No |

## Execution order

1. 01 contracts.
2. 02 schema and migration.
3. 03 catalog service/router.
4. 04 Special bridge and 05 detection can proceed after 03 where file
   ownership is separated.
5. 06 projection, then 07 prompt/media and 09 reliability.
6. 08 central UI after procedure contracts stabilize.
7. 10 integration and release gates.

## Section summaries

### section-01-contracts
Shared schemas, normalized source/mode/lifecycle helpers, capabilities, errors,
fingerprints, and pure tests.

### section-02-schema-migration
Additive lifecycle schema, aliases/suggestions/runs/lineage, constraints,
feature flags, migration and legacy report/backfill.

### section-03-catalog-service-router
Ownership-scoped catalog CRUD, asset lifecycle, aliases, usage listing,
revision/idempotency, typed tRPC procedures, and capability responses.

### section-04-special-product-bridge
Unify Product tie-in identity and UI while preserving Special commercial policy,
legacy adapter, and durable episode binding/reconciliation.

### section-05-context-detection
Context pack, continuation/time/place scoring, advisory job/outbox, durable
suggestions, manual precedence, and read-purity.

### section-06-shot-projection
Shot usage controls, projection lineage, reference resolver, legacy safety, and
propagation to generation-facing reference bundles.

### section-07-prompt-media
Context-grounded prompt runs, explicit paid image generation, draft approval,
managed media, provider caps, and generation propagation.

### section-08-central-ui
Product Tie-in-style wide Object Reference workspace, drag/drop/picker flows,
shot controls, progressive disclosure, responsive and accessible states.

### section-09-observability-reliability
Structured events, bounded retries, failure classification, capability gates,
metrics/reporting, and operational safety.

### section-10-integration-release
Integration/browser tests, migration/runtime proof, release matrix, and final
completion/rollback gates.
