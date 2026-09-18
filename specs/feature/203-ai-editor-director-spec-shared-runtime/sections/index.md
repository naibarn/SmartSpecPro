<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm exec vitest run shared/videoEditorContracts.test.ts server/services/__tests__/editorMediaJobContract.test.ts server/services/__tests__/compositionScanJob.test.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-project-revisions
section-03-execution-admission
section-04-capability-lifecycle
section-05-evidence-intent-compiler
section-06-artifact-qc
section-07-runtime-adapters
section-08-security-observability
section-09-verification-rollout
END_MANIFEST -->

# Spec 203 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 shared contracts | - | 02, 03, 04, 05, 06, 07 | yes |
| 02 project revisions | 01 | 03, 06, 09 | no |
| 03 execution admission | 01, 02 | 04, 06, 07, 09 | no |
| 04 capability lifecycle | 01, 03 | 07, 09 | no |
| 05 evidence/intent/compiler | 01, 02, 03 | 06, 09 | no |
| 06 artifact/QC | 01, 02, 03, 05 | 09 | no |
| 07 runtime adapters | 01, 03, 04 | 09 | no |
| 08 security/observability | 01, 02, 03, 04 | 09 | yes after 04 |
| 09 verification/rollout | 01–08 | - | no |

## Execution order

1. section-01-shared-contracts
2. section-02-project-revisions
3. section-03-execution-admission
4. section-04-capability-lifecycle and section-05-evidence-intent-compiler
5. section-06-artifact-qc and section-07-runtime-adapters
6. section-08-security-observability
7. section-09-verification-rollout

## Section summaries

### section-01-shared-contracts
Canonical time, geometry, evidence, intent, executable plan, change-set, QC,
artifact, and capability validators.

### section-02-project-revisions
Feature 184 revision persistence, CAS, idempotency, and legacy migration.

### section-03-execution-admission
Immutable snapshots, worker job/outbox linkage, asset/source pinning, and
transaction-safe admission.

### section-04-capability-lifecycle
Exact capability admission, leases, status projection, cancellation, retry, and
degraded evidence states.

### section-05-evidence-intent-compiler
Typed evidence/intent ingestion, deterministic compilation, conflict handling,
and safety validation.

### section-06-artifact-qc
Render manifest, QC, hash, signed upload, server commit, and project linkage.

### section-07-runtime-adapters
Web/Runner/Worker envelope and asset locality adapters plus render-source parity.

### section-08-security-observability
Tenant safety, SSRF/path controls, retry/billing safety, events, and metrics.

### section-09-verification-rollout
Integrated tests, migration rehearsal, browser/Worker evidence, feature flags,
and release gates.
