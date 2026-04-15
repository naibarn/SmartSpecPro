# section-05-tests-and-rollout

## Purpose

Lock in the feature with the repo's existing Vitest-based test style and a small rollout checklist.

## Files in scope

- backend tests near the touched services and router files
- admin UI tests near the touched page or component files
- integration tests for upload and finance OCR flows where appropriate

## Implementation notes

1. Add backend tests for routing resolution, legacy fallback, and policy blocking.
2. Add backend tests for missing routing keys and secret masking.
3. Add admin UI tests for selectors, secret masking, and disabled state.
4. Add integration-style tests proving finance and library OCR agree on routing.
5. Confirm the existing OCR crediting behavior is unchanged.
6. Verify the new feature ships without requiring a schema migration.

## Acceptance criteria

- Test coverage proves the new routing contract and the legacy fallback path.
- The admin UI behavior is covered in jsdom tests.
- Rollout safety checks confirm that existing tenants keep working until they opt in.

