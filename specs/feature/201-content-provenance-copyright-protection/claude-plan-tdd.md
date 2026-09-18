# TDD Plan — Feature 201

Each item is a test to write and run red before the corresponding production
change. Tests use repository-native Vitest/Rust/Playwright conventions.

## Shared contracts

- Canonical compound identity preserves ordered inputs and changes on any source
  hash, trim, revision, or plan digest change.
- Effective choice resolves per-operation choice before user default.
- Invalid modality, choice, status, and unsafe reference are rejected.

## Persistence

- Schema exports and migration names exist with required tenant/user indexes.
- Protection and verification idempotency constraints prevent duplicates.
- No persisted JSON/result path contains provider secrets or raw codewords.

## Provider/service

- Image and video provider contracts are separate.
- A successful embed without successful self-detect cannot become Protected.
- Provider unavailable, hash mismatch, stale envelope, and QC failure map to
  safe non-protected statuses.
- Test provider can create and detect a deterministic signal for fixtures.

## Router

- Unauthenticated calls are rejected.
- Cross-tenant and non-owner asset IDs are rejected.
- Protect/list/detail/verify/case/settings procedures return bounded shapes.
- Repeated idempotency key returns the original record.
- Public reviewer links require a valid, unexpired, unrevoked token hash.

## Worker

- Protection payload and progress stage order validate.
- Worker output final hash is checked against the stored output bytes.
- Retryable provider/storage errors retry within bounded policy; stale and
  unsupported errors do not retry forever.
- Safe result contains no secret material.

## Compound integration

- Editor render uses the same revision/plan/source identity in protection input.
- Vertical Drama compiled output is the protected artifact, not an input clip.
- Changed revision/plan/source list cannot reuse a previous protected result.
- OFF remains unprotected and is visibly reported.
- Protected publish is blocked until the protection gate passes.

## UI/navigation

- Every canonical route resolves under `RequireAuth`.
- Shared menu exposes the feature only when enabled.
- Dashboard quick links point to valid workspace routes and are available on
  desktop/mobile layout.
- Settings deep link opens the content protection section.
- Image evidence cards show image-only signals; video cards show video-only
  signals; disclaimer is present.
- ON/OFF notices and processing stage copy are rendered accessibly.

## Rights/evidence

- Rights and certificates are tenant-scoped.
- Certificate generation requires a final artifact and manifest.
- Evidence package integrity hash changes when a referenced evidence item changes.
- Case and reviewer-link lifecycle transitions are bounded and auditable.

## Final verification

- Focused Vitest suites pass.
- Rust worker tests pass for changed files.
- Migration/spec validators pass.
- Playwright route smoke tests pass when the authenticated browser harness is
  available; otherwise the missing environment is recorded as a residual gate.
- A 15-round requirement-to-code audit reports zero unresolved MUST_FIX items.
