# Spec 210 TDD Plan

## Section 1

Readiness tests for missing executable, unsupported version/OS, auth-required,
disabled flag and valid certified tuple.

## Section 2

Runner contract tests for auth, sequence, idempotency, fencing, reconnect,
cancel and kill; Rust protocol tests for malformed/stale frames.

## Section 3

Job admission/attempt mapping tests for phases, duplicate events, late events,
receipt-versus-ACK and restart recovery.

## Section 4

Tenant/actor/secret/approval/economic policy tests including expired approval
and reserve release on failed launch.

## Section 5

Route/projection tests for all operational states and UI tests for the mockup
aligned inspector/drawer states.

## Section 6

Certification fixtures, feature-off tests, process cleanup/rollback checks and
release-gate report tests.

