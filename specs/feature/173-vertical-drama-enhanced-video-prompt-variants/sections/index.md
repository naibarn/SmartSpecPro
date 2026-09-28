<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-variant-contract
section-02-enhanced-runtime-and-jobs
section-03-storyboard-ui
section-04-model-routing-rollout-and-proof
END_MANIFEST -->

# Feature 173 — Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-variant-contract | - | 02, 03, 04 | No |
| section-02-enhanced-runtime-and-jobs | 01 | 03, 04 | No |
| section-03-storyboard-ui | 01, 02 | 04 | No |
| section-04-model-routing-rollout-and-proof | 01–03 | - | No |

## Execution order

1. Establish the additive variant contract, old-pack reader, active projection,
   fingerprints, and stale checks.
2. Add the isolated Enhanced adapter and durable job with Core-owned credits,
   authorization, and recovery.
3. Add the paired Storyboard actions and one-editor variant selector.
4. Verify image/video/authoring model separation, provider capability alignment,
   Legacy regression, browser behavior, cost, and rollout gates.

## Section summaries

### section-01-variant-contract

Versioned Legacy/Enhanced full-bundle storage, backward-compatible projection,
apply/restore semantics, stale detection, and concurrency-safe persistence.

### section-02-enhanced-runtime-and-jobs

Vertical Drama adapter for `generic-commercial-video-director`, readiness gate,
model-aware compilation, credit admission, job identity, retries, and recovery.

### section-03-storyboard-ui

Paired generation buttons, one prompt editor, variant selector, explicit Apply,
model-role badges, cost/readiness copy, stale/error states, and sub-shot mapping.

### section-04-model-routing-rollout-and-proof

Separate image/video/authoring model policy, provider capability matrix, feature
flags, Legacy non-regression, security/cost checks, browser proof, and canary
metrics.
