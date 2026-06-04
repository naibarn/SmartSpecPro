<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-runtime-schemas
section-02-auto-plan-and-feature-access
section-03-template-and-composition-builder
section-04-asset-staging-security-qa
section-05-render-worker-and-runtime-state
section-06-runtime-api-router-integration
section-07-product-detail-dual-mode-ui
section-08-storyboard-review-mediastudio-handoff-ui
section-09-library-history-video-editor-finalize
section-10-observability-retention-operator
section-11-fixtures-e2e-release-gates
section-12-dependency-rollout-docs
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-runtime-schemas | - | 02, 03, 06, 07, 08, 09 | Yes |
| section-02-auto-plan-and-feature-access | 01 | 06, 07 | Yes after 01 |
| section-03-template-and-composition-builder | 01 | 04, 05, 06 | Yes after 01 |
| section-04-asset-staging-security-qa | 01, 03 | 05, 09 | Yes after 03 |
| section-05-render-worker-and-runtime-state | 01, 03, 04, section-12 preflight slice | 06, 09, 10 | No |
| section-06-runtime-api-router-integration | 01, 02, 05 | 07, 08, 09 | No |
| section-07-product-detail-dual-mode-ui | 01, 02, 06 | 11 | Yes after 06 |
| section-08-storyboard-review-mediastudio-handoff-ui | 01, 06 | 09, 11 | Yes after 06 |
| section-09-library-history-video-editor-finalize | 01, 04, 05, 06, 08 | 11 | Yes after 08 |
| section-10-observability-retention-operator | 01, 05 | 11, 12 | Yes after 05 |
| section-11-fixtures-e2e-release-gates | 07, 08, 09, 10 | 12 | No |
| section-12-dependency-rollout-docs | 10, 11 | - | No |

`section-12 preflight slice` is not a separate manifest section. It is the
dependency/runtime subset of `section-12-dependency-rollout-docs` that must run
before Section 05 installs HyperFrames packages, enables worker execution, or
adds browser/FFmpeg/Chrome runtime assumptions. The documentation and rollout
closeout parts of Section 12 still run after Sections 10 and 11.

## Section 12 Preflight Deliverables

Before Section 05 starts runtime execution work, Section 12 must provide:

- dependency audit result for package names, pinned versions, license,
  provenance, native/postinstall behavior, and main-bundle exclusion;
- doctor command or service check for Node, HyperFrames CLI/runtime,
  Chrome/headless shell, FFmpeg/FFprobe, fonts, temp workspace, and storage;
- runtime mode decision for local/dev CLI and production worker/container;
- pass/partial/fail gate result that determines whether Section 05 may execute
  HyperFrames runtime or only implement disabled-worker projections;
- Standard Order regression proof for dependency failed, worker off, and flags
  off states.

## Execution Order

1. section-01-contracts-and-runtime-schemas
2. section-02-auto-plan-and-feature-access and section-03-template-and-composition-builder
3. section-04-asset-staging-security-qa
4. section-12 dependency/runtime preflight gate for dependency audit, doctor, and worker/container decision
5. section-05-render-worker-and-runtime-state
6. section-06-runtime-api-router-integration
7. section-07-product-detail-dual-mode-ui and section-08-storyboard-review-mediastudio-handoff-ui
8. section-09-library-history-video-editor-finalize and section-10-observability-retention-operator
9. section-11-fixtures-e2e-release-gates
10. section-12 documentation, rollout, runbook, and closeout gates

## Section Summaries

### section-01-contracts-and-runtime-schemas
Shared TypeScript/Zod contracts, status copy, launch mode, runtime schemas, and tests.

### section-02-auto-plan-and-feature-access
Backend-derived Auto Storyboard Review plan and feature access projection services.

### section-03-template-and-composition-builder
Built-in template registry, platform profiles, product truth conversion, and sanitized composition input generation.

### section-04-asset-staging-security-qa
Safe asset staging, SSRF/XSS controls, pre-render/render QA, and security tests.

### section-05-render-worker-and-runtime-state
HyperFrames worker, outbox/artifact state, retries, cancellation, dead-letter, and render status mapping.

### section-06-runtime-api-router-integration
tRPC procedures, runtime API service, query invalidation, access checks, idempotency, and router tests.

### section-07-product-detail-dual-mode-ui
Product Detail Auto vs Standard launch UI, auto summary, advanced overrides, status panel, and responsive/accessibility evidence.

### section-08-storyboard-review-mediastudio-handoff-ui
Storyboard Review result-first preview UI and MediaStudio render-to-library session handoff.

### section-09-library-history-video-editor-finalize
Library finalize idempotency, Media History discovery, Video Editor handoff, and metadata rules.

### section-10-observability-retention-operator
Metrics, correlation IDs, retention, purge, diagnostics, replay, cancel, and template operator controls.

### section-11-fixtures-e2e-release-gates
Fixture matrix, snapshot tests, Playwright coverage, and release gate command set.

### section-12-dependency-rollout-docs
Dependency audit, doctor scripts, worker rollout, docs, runbook, and rollback.
