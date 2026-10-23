<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-continuation
section-02-live-hosted-execution
section-03-real-browser-acceptance
section-04-release-final-verify
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contract-continuation | - | 02, 03 | No |
| section-02-live-hosted-execution | 01 | 03 | No |
| section-03-real-browser-acceptance | 01, 02 | 04 | No |
| section-04-release-final-verify | 01, 02, 03 | - | No |

## Execution Order

1. Section 01: close contract gaps and focused regressions.
2. Section 02: execute the real disposable hosted Gateway path.
3. Section 03: browser-test the real generated app and repair until it passes.
4. Section 04: build, release and Final Verify the exact candidate.

## Requirement Ledger

- section-01: R1–R5, R10.
- section-02: R5–R6, R10.
- section-03: R3, R5, R7–R8, R10.
- section-04: R9–R10.

## Section Summaries

- `section-01-contract-continuation`: milestone truth, repository ownership, same-App resume and App Home behavior.
- `section-02-live-hosted-execution`: disposable DB, authenticated durable job, real Gateway execution and artifact binding.
- `section-03-real-browser-acceptance`: real expense-tracker interaction, reload, mobile and privacy evidence.
- `section-04-release-final-verify`: exact immutable build, guarded deployment and deployed browser acceptance.
