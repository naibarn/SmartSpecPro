<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-manifest-contract
section-02-registry-version-search
section-03-instance-projection-admission
section-04-spec215-compiler-consumption
section-05-studio-adapter-boundary
section-06-ai-builder-canonical-selection
section-07-extension-and-legacy-disposition
section-08-r20-coverage-and-integration
END_MANIFEST -->

# Spec 214 implementation sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 manifest contract | - | 02, 03, 04, 07 | No |
| 02 registry/version/search | 01 | 03, 05, 06, 07 | No |
| 03 instance/projection/admission | 01, 02 | 04, 05, 06, 07 | No |
| 04 Spec 215 compiler consumption | 01, 03 | 05, 06, 08 | No |
| 05 Studio adapter boundary | 02, 03, 04 | 08 | No |
| 06 AI Builder canonical selection | 02, 03, 04 | 08 | No |
| 07 extension and legacy disposition | 01, 02, 03 | 08 | Yes after 03 |
| 08 R20 coverage and integration | 04, 05, 06, 07 | - | No |

## Execution order
Implement sequentially in manifest order. Section 07 is technically independent after 03 but retained after the primary consumers for a simple bounded implementation cycle.

## Section summaries
- 01: Complete the canonical v4 manifest schema and validation.
- 02: Complete exact/versioned registry, retained history, search, presets, and metadata APIs.
- 03: Validate instances, project typed schemas, and evaluate extension admission.
- 04: Consume the Spec 214 contract safely in the existing Spec 215 compiler boundary.
- 05: Keep Studio conversion canonical and fail-closed.
- 06: Keep AI Builder candidate generation tied to real registry bindings.
- 07: Materialize and verify all 112 legacy-name dispositions without aliases.
- 08: Verify R20 identity/static coverage and rerun integrated focused tests.
