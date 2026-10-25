<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-continuation
section-02-live-hosted-execution
section-03-real-browser-acceptance
section-04-release-final-verify
section-05-v1-buildable-source
section-06-v2-thai-thb-continuation
section-07-settings-navigation
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contract-continuation | - | 02, 03 | No |
| section-02-live-hosted-execution | 01 | 03 | No |
| section-03-real-browser-acceptance | 01, 02 | 04 | No |
| section-04-release-final-verify | 01, 02, 03 | - | No |
| section-05-v1-buildable-source | V1 baseline | 06 | No |
| section-06-v2-thai-thb-continuation | 05 | - | No |
| section-07-settings-navigation | - | - | Yes |

## Execution Order

1. Section 01: close contract gaps and focused regressions.
2. Section 02: execute the real disposable hosted Gateway path.
3. Section 03: browser-test the real generated app and repair until it passes.
4. Section 04: build, release and Final Verify the exact candidate.
5. Section 05: materialize and independently build retained V1 in its App repository.
6. Section 06: prepare and verify V2, then bind it only through the authenticated same-App continuation.
7. Section 07: fix project Settings navigation independently.

## Requirement Ledger

- section-01: R1–R5, R10.
- section-02: R5–R6, R10.
- section-03: R3, R5, R7–R8, R10.
- section-04: R9–R10.
- section-05: V1-Baseline, V1-Source.
- section-06: V2-Thai, V2-Data-Preservation, V2-Versioning.
- section-07: Project-Settings-UX.

## Section Summaries

- `section-01-contract-continuation`: milestone truth, repository ownership, same-App resume and App Home behavior.
- `section-02-live-hosted-execution`: disposable DB, authenticated durable job, real Gateway execution and artifact binding.
- `section-03-real-browser-acceptance`: real expense-tracker interaction, reload, mobile and privacy evidence.
- `section-04-release-final-verify`: exact immutable build, guarded deployment and deployed browser acceptance.
- `section-05-v1-buildable-source`: buildable repository source and V1 parity.
- `section-06-v2-thai-thb-continuation`: V2 candidate and owner-scoped deployment lineage.
- `section-07-settings-navigation`: dedicated Settings view and project navigation.
