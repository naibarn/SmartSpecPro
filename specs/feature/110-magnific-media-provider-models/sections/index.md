<!-- PROJECT_CONFIG
runtime: mixed-typescript-python
test_command: npm --prefix apps/web run check && npm --prefix apps/web test -- server/routers/mediaProviders.test.ts && pytest python-backend/tests/unit/llm_proxy/test_magnific_provider.py -v
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-foundation
section-02-model-seeding-and-fallback
section-03-media-studio-inputs-and-validation
section-04-python-provider-client
section-05-gateway-routing-and-sync-flow
section-06-polling-rehosting-and-billing
section-07-security-observability-and-rollout
section-08-regression-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-provider-foundation | - | 02, 04, 05, 07, 08 | No |
| section-02-model-seeding-and-fallback | 01 | 03, 05, 06, 08 | No |
| section-03-media-studio-inputs-and-validation | 02 | 08 | Yes |
| section-04-python-provider-client | 01, 02 | 05, 06, 08 | Yes |
| section-05-gateway-routing-and-sync-flow | 02, 04 | 06, 08 | No |
| section-06-polling-rehosting-and-billing | 02, 04, 05 | 07, 08 | No |
| section-07-security-observability-and-rollout | 01, 06 | 08 | Yes |
| section-08-regression-verification | all | - | No |

## Execution Order

1. `section-01-provider-foundation`
2. `section-02-model-seeding-and-fallback`
3. `section-03-media-studio-inputs-and-validation` and `section-04-python-provider-client` after section 02
4. `section-05-gateway-routing-and-sync-flow`
5. `section-06-polling-rehosting-and-billing`
6. `section-07-security-observability-and-rollout`
7. `section-08-regression-verification`

## Section Summaries

### section-01-provider-foundation

Add Magnific provider identity, normalization, base URL/endpoint validation, provider template, seed provider row, and authenticated connection testing.

### section-02-model-seeding-and-fallback

Create the Magnific model seed builder/script, concrete model records, static fallback metadata, idempotency behavior, and pricing/readiness defaults.

### section-03-media-studio-inputs-and-validation

Ensure dynamic input parsing, Media Studio controls, and server-side model validation cover Magnific's image, video, reference, sync, and upscaler workflows.

### section-04-python-provider-client

Implement the Python `MagnificProvider` client with endpoint registry, auth, submit/status/sync methods, result extraction, error classification, and URL safety.

### section-05-gateway-routing-and-sync-flow

Wire Magnific into Python gateway routing for image/edit/video/upscaler and Remove Background sync completion.

### section-06-polling-rehosting-and-billing

Add Magnific async polling/recovery, result re-hosting enforcement, bounded backoff, timeout handling, and credit reservation/refund closure.

### section-07-security-observability-and-rollout

Add security hardening, logs/metrics, admin readiness diagnostics, concurrency caps, and rollout/rollback controls.

### section-08-regression-verification

Close with cross-provider regression tests, seed dry-run verification, focused typecheck/test commands, and staging smoke-test notes.
