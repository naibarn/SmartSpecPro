# Implementation review round 6 — runtime signing-key admin UI

## Scope

- Added a system-admin-only Worker Runtime signing-key API.
- Added an in-page Ed25519 key-generation guide.
- Added public-key file selection and copy/paste input in the existing Runtime
  release panel.
- Kept private-key material out of the browser-to-server contract and database.

## Review checks

- Public-key normalization accepts Ed25519 SPKI keys and derives a SHA-256
  fingerprint and stable key id.
- Private keys and unsupported RSA public keys are rejected before persistence.
- Stored key metadata uses the existing `system_settings` table with
  `isSensitive=false`; replacement history contains public metadata only and is
  bounded to ten records.
- GET/PUT signing-key routes require a system `admin`; route tests cover
  unauthenticated access and successful admin updates.
- The UI is mounted only through the existing admin release-management guard.
- The UI warns before replacing an active key and limits selected key files to
  16 KB.

## Evidence

- `npm --workspace apps/web test -- server/routes/__tests__/workerRuntime.test.ts server/routes/__tests__/workerRuntimeReleases.test.ts server/services/__tests__/workerRuntimePackValidation.test.ts server/services/__tests__/workerRuntimeSigningKeyService.test.ts --run`
  — 45 tests passed.
- `npm --workspace apps/web run build:unsafe` — client and widget production
  builds passed.
- `npm --workspace apps/web run typecheck` — still reports existing unrelated
  repository errors; no error remains in the changed signing-key files.
- `git diff --check` — passed.

## Release boundary

This change registers the public trust key and makes the operator workflow
available in the UI. It does not manufacture a production signature or publish
an artifact. The existing release gate still blocks the repository's
placeholder `SHA256SUMS.sig` until the authorized release process supplies a
real signature.
