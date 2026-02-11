# TDD Plan - Security Hardening (Library / Document Management / Admin Gallery)

This document mirrors `implementation-plan.md` and defines tests to add/write first before implementation.

## Objective
Validate that security hardening blocks unsafe behavior while preserving existing external image workflows.

## Non-Negotiable Constraints (Test Expectations)
- External `https://` image workflows remain functional.
- Unsafe URL schemes and active-content execution paths are blocked.
- Tenant-boundary behavior is enforced for feature gating and ops paths.

## Workstream 1: Shared URL Policy Contract

### Test stubs (write first)
- Test: URL policy accepts relative `/uploads/...` paths for library source/thumbnail contexts.
- Test: URL policy accepts external `https://` URLs for source/thumbnail contexts.
- Test: URL policy rejects `javascript:`, `vbscript:`, `file:` URLs.
- Test: URL policy rejects malformed URLs and unsupported protocols.
- Test: URL policy correctly classifies private/internal hosts for public-only contexts.
- Test: policy returns deterministic error code/message payload for rejected URLs.

### Verification criteria
- All URL policy matrix cases are covered by deterministic unit tests.
- No context bypass exists between create/update/media-to-library paths.

## Workstream 1.1: Legacy URL Data Migration (`library_items`)

### Test stubs (write first)
- Test: dry-run audit classifies rows into `valid`, `needs_normalization`, `blocked` without DB mutation.
- Test: normalization migration updates only `needs_normalization` rows.
- Test: enforcement migration quarantines `blocked` rows and preserves `valid` rows.
- Test: migration preserves external `https://` image URLs.
- Test: migration writes audit metadata and rollback snapshot references.

### Verification criteria
- Migration can run idempotently.
- Dry-run and post-run summaries are reproducible.

## Workstream 2: Active-Content Upload Protection

### Test stubs (write first)
- Test: uploaded HTML/HTM is served with non-executable delivery headers.
- Test: uploaded active-content classified as unsafe cannot execute inline in preview path.
- Test: uploaded SVG that passes sanitization can render inline.
- Test: uploaded SVG that fails sanitization falls back to safe download behavior.
- Test: non-active types (png/jpg/video/pdf/text) keep expected preview behavior.

### Verification criteria
- Active-content execution vectors are blocked.
- SVG inline preview compatibility remains functional under safe input.

## Workstream 3: Tenant-Safe Feature Gating

### Test stubs (write first)
- Test: allowlist mode + missing tenant context => feature disabled.
- Test: allowlist mode + tenant in allowlist => feature enabled.
- Test: allowlist mode + tenant not in allowlist => feature disabled.
- Test: non-allowlist mode preserves existing enabled behavior.

### Verification criteria
- No pathway returns enabled when tenant is missing in allowlist mode.

## Workstream 4: Tenant-Scoped Ops (Phase 1 + Phase 2)

### Phase 1 test stubs (write first)
- Test: retry failed index jobs applies tenant filter where tenant column exists.
- Test: summary metrics are tenant-scoped where supported.
- Test: global fallback actions require explicit elevated role and emit explicit audit marker.

### Phase 2 test stubs (write first)
- Test: callback event/DLQ schema includes tenant attribution and persists tenant id.
- Test: backfill infers tenant attribution from linked entities when possible.
- Test: post-backfill ops queries are tenant-scoped for callback tables.
- Test: cross-tenant callback retries/reprocesses are blocked.
- Test: tenant-admin retry/reprocess denies records without tenant attribution after cutover.
- Test: unresolved backfill rows are quarantined and excluded from tenant-admin operation sets.
- Test: intentionally global retry/reprocess routes require super-admin role and emit mandatory global audit markers.
- Test: phased DB constraint rollout enforces `NOT NULL`/FK only after successful backfill validation.
- Test: backfill is idempotent and lock-protected (second run produces no duplicate mutation).
- Test: interrupted backfill resumes from checkpoint without reprocessing completed batches.

### Verification criteria
- Cross-tenant side effects are prevented in tenant-admin mode.
- Phase 2 is complete in this cycle, not deferred.
- Tenant-admin operational flow has no global fallback post-cutover.
- DB constraint cutover is verifiably safe and rollback-capable.

## Workstream 5: Safer Office Preview Decision Logic

### Test stubs (write first)
- Test: office preview classifier rejects localhost and private/internal IPv4/IPv6 hosts.
- Test: office preview classifier accepts safe public hosts.
- Test: blocked office preview returns deterministic fallback UI state.

### Verification criteria
- No private/internal URL is forwarded to external office viewer.

## Workstream 6: External Image Proxy Hardening

### Test stubs (write first)
- Test: proxy rejects private/local/internal hosts (including redirect targets).
- Test: proxy enforces request timeout and fails safely.
- Test: proxy enforces maximum payload size and fails safely.
- Test: proxy rejects non-image content types.
- Test: proxy still returns successful response for valid public `https://` image URL.

### Verification criteria
- Proxy remains functional for valid external images while hardening controls are active.

## Workstream 7: Security Regression Test Plan

### Test stubs (write first)
- Test: document preview still displays external `https://` image sources.
- Test: markdown editor/preview still renders external image markdown links.
- Test: library create/update reject unsafe URL scheme inputs.
- Test: active-content upload path blocks inline execution behavior.
- Test: allowlist missing-tenant condition is denied.
- Test: tenant ops guard prevents cross-tenant action.
- Test: tenant-admin and super-admin global routes use separate contracts and permission checks.

### Verification criteria
- Security negative tests pass.
- Compatibility positive tests pass.
- Baseline library/document/media test subsets remain green.

## Workstream 8: Observability + Canary Validation

### Test stubs (write first)
- Test: denied missing-attribution operations emit expected structured audit event/metric.
- Test: cross-tenant deny path emits expected audit event/metric.
- Test: quarantine queue metrics update when unresolved rows are marked/excluded.
- Test: super-admin global route invocation emits explicit global-operation audit fields.
- Test: canary smoke check for representative tenant passes before rollout gate.
- Test: quarantine retention policy and purge/archive job execute with auditable records.
- Test: quarantine growth alert triggers when threshold is exceeded.

### Verification criteria
- Observability signals exist for all critical deny/cutover paths.
- Canary validation protects full rollout from hidden fallback regressions.
- Quarantine retention/purge and alerting controls are validated.

## Execution Order (TDD)
1. Add URL policy tests.
2. Add migration dry-run/normalization/enforcement tests.
3. Add active-content and SVG safety tests.
4. Add allowlist tenant-mode tests.
5. Add ops phase 1 + phase 2 tenant-scope tests.
6. Add office preview host-classification tests.
7. Add proxy hardening tests.
8. Add security regression + compatibility tests.
9. Add observability + canary validation tests.
10. Implement corresponding production changes in small increments until all tests pass.

## Release Gate (TDD Validation)
- New security tests pass.
- Existing baseline tests pass.
- Migration verification tests and reports complete.
- Tenant attribution phase 2 tests pass.
- External image compatibility tests pass.
- Observability and canary validation tests pass.
